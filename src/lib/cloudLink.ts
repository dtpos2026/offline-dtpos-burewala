// ============================================================
// CLOUD LINK — hybrid offline-first bridge to Digital Target's backend.
//
// The POS keeps working exactly as before with no internet. When internet IS
// available this module quietly:
//   • sends a device heartbeat (device info, versions, login activity)
//   • refreshes the approximate location (network based, never GPS)
//   • fetches the authoritative licence status set in the Super Admin panel
//
// Nothing here is allowed to block billing, printing or login. Every call is
// best-effort, timeout-capped and cached.
//
// Firestore REST is used on purpose (no Firebase SDK in the POS bundle) so the
// desktop app stays small and fully usable offline.
// ============================================================

const PROJECT_ID = 'dtpos-offline';
// Public web API key — Firebase is secured by Firestore rules, not by hiding it.
const API_KEY = 'AIzaSyCgLRlvTaXyuk13vWCQ1vCKUbAmC5IY9cU';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export type LinkState =
  | 'offline'      // no internet — local mode
  | 'online'       // server reachable, everything in sync
  | 'syncing'      // heartbeat in flight
  | 'verifying'    // licence verification in flight
  | 'error';       // last attempt failed

export interface RemoteVerdict {
  /** active | suspended | revoked | expired | unknown */
  status: string;
  message?: string;
  checkedAt: number;
  /** When Super Admin last changed this status (server side). */
  updatedAt?: number;
  /** Licence key this verdict belongs to — a new key must start clean. */
  key?: string;
}

const LS = {
  verdict: 'dtpos-remote-verdict',
  loginStats: 'dtpos-login-stats',
  location: 'dtpos-approx-location',
  installedAt: 'dtpos-installed-at',
  lastSync: 'dtpos-last-sync-at',
};

// ---------- tiny state machine ----------
let state: LinkState = navigator.onLine ? 'online' : 'offline';
const listeners = new Set<(s: LinkState) => void>();

function setState(s: LinkState) {
  if (state === s) return;
  state = s;
  listeners.forEach(fn => { try { fn(s); } catch { /* ignore */ } });
}

export function getLinkState(): LinkState { return state; }

export function subscribeLink(cb: (s: LinkState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function lastSyncAt(): number {
  return Number(localStorage.getItem(LS.lastSync) || 0);
}

// ---------- helpers ----------
function json<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return await Promise.race([
    p.catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms)),
  ]);
}

/** Firestore REST value encoding for flat scalar maps. */
function toFields(obj: Record<string, unknown>) {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: String(v) };
  }
  return fields;
}

function readField(doc: any, name: string): string {
  const f = doc?.fields?.[name];
  if (!f) return '';
  return String(f.stringValue ?? f.integerValue ?? f.doubleValue ?? f.booleanValue ?? '');
}

export const docIdFor = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);

// ---------- login activity (local, sent with the heartbeat) ----------
export interface LoginStats { firstLoginAt?: number; lastLoginAt?: number; loginCount: number }

export function getLoginStats(): LoginStats {
  return json<LoginStats>(LS.loginStats, { loginCount: 0 });
}

/** Called once on every successful staff login. */
export function recordLogin(): void {
  const s = getLoginStats();
  const now = Date.now();
  const next: LoginStats = {
    firstLoginAt: s.firstLoginAt || now,
    lastLoginAt: now,
    loginCount: (s.loginCount || 0) + 1,
  };
  try { localStorage.setItem(LS.loginStats, JSON.stringify(next)); } catch { /* quota */ }
}

function installedAt(): number {
  let v = Number(localStorage.getItem(LS.installedAt) || 0);
  if (!v) { v = Date.now(); try { localStorage.setItem(LS.installedAt, String(v)); } catch { /* quota */ } }
  return v;
}

// ---------- approximate location (network based, refreshed max 1×/12h) ----------
export interface ApproxLocation {
  country?: string; region?: string; city?: string;
  lat?: number; lng?: number;
  accuracyM?: number;
  source?: 'device' | 'network';
  at: number;
}

export function getApproxLocation(): ApproxLocation | null {
  const l = json<ApproxLocation | null>(LS.location, null);
  return l && l.at ? l : null;
}

/** Store the operator-approved Windows/browser location for the heartbeat.
 * Device coordinates always win over the city-level network fallback. */
export function cacheDeviceLocation(position: GeolocationPosition): ApproxLocation {
  const previous = getApproxLocation();
  const loc: ApproxLocation = {
    country: previous?.country || '',
    region: previous?.region || '',
    city: previous?.city || '',
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyM: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : undefined,
    source: 'device',
    at: Date.now(),
  };
  try { localStorage.setItem(LS.location, JSON.stringify(loc)); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent('dtpos-device-location-updated')); } catch { /* non-browser */ }
  return loc;
}

/**
 * Three independent providers are tried in turn — one of them is almost
 * always reachable, so the Super Admin panel stops showing
 * "Location unavailable" when a single service is blocked or rate-limited.
 */
const LOCATION_PROVIDERS: { url: string; map: (r: any) => Partial<ApproxLocation> }[] = [
  { url: 'https://ipapi.co/json/',   map: r => ({ country: r.country_name || r.country, region: r.region, city: r.city, lat: Number(r.latitude), lng: Number(r.longitude) }) },
  { url: 'https://ipwho.is/',        map: r => (r.success === false ? {} : { country: r.country, region: r.region, city: r.city, lat: Number(r.latitude), lng: Number(r.longitude) }) },
  { url: 'https://get.geojs.io/v1/ip/geo.json', map: r => ({ country: r.country, region: r.region, city: r.city, lat: Number(r.latitude), lng: Number(r.longitude) }) },
];

async function refreshLocation(force = false): Promise<ApproxLocation | null> {
  const cached = getApproxLocation();
  const fresh = cached && Date.now() - cached.at < 6 * 3600_000;
  if (fresh && !force && (cached?.source === 'device' || cached?.city || cached?.country)) return cached;
  if (!navigator.onLine) return cached;

  // 1) Desktop app first — Node fetches it without any browser CORS/CSP block,
  //    which is why the panel used to show "Waiting for first online sync".
  const api = (window as any).electronAPI;
  if (api?.getIpLocation) {
    const r: any = await withTimeout(api.getIpLocation(), 9000);
    if (r?.success && (r.city || r.country)) {
      const loc: ApproxLocation = {
        country: r.country || '', region: r.region || '', city: r.city || '',
        lat: Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : undefined,
        lng: Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : undefined,
        source: 'network', at: Date.now(),
      };
      try { localStorage.setItem(LS.location, JSON.stringify(loc)); } catch { /* quota */ }
      return loc;
    }
  }

  for (const p of LOCATION_PROVIDERS) {
    const r = await withTimeout(fetch(p.url).then(x => x.json()), 6000);
    if (!r) continue;
    const m = p.map(r) || {};
    if (!m.country && !m.city) continue;
    const loc: ApproxLocation = {
      country: m.country || '',
      region: m.region || '',
      city: m.city || '',
      lat: Number.isFinite(m.lat as number) ? (m.lat as number) : undefined,
      lng: Number.isFinite(m.lng as number) ? (m.lng as number) : undefined,
      source: 'network', at: Date.now(),
    };
    try { localStorage.setItem(LS.location, JSON.stringify(loc)); } catch { /* quota */ }
    return loc;
  }
  return cached;
}

/** Manual "find my location again" — used by the diagnostics screens. */
export async function refreshApproxLocation(): Promise<ApproxLocation | null> {
  return refreshLocation(true);
}

// ---------- device hardware ----------
export interface DeviceHardware {
  manufacturer?: string; model?: string; osName?: string; osVersion?: string; hostname?: string;
}
let hardwareCache: DeviceHardware | null = null;

export async function getDeviceHardware(): Promise<DeviceHardware> {
  if (hardwareCache) return hardwareCache;
  const api = (window as any).electronAPI;
  if (api?.getDeviceHardware) {
    const hw = await withTimeout(api.getDeviceHardware(), 9000);
    if (hw) return (hardwareCache = hw as DeviceHardware);
  }
  return (hardwareCache = { osName: navigator.platform || 'Browser' });
}

// ---------- authoritative licence status ----------
/**
 * @param licenseKey when given, a verdict saved for a DIFFERENT key is ignored.
 * A freshly entered key must never inherit the old key's blocked verdict —
 * that was the "still blocked after entering a new key" bug.
 */
export function cachedVerdict(licenseKey?: string): RemoteVerdict | null {
  const v = json<RemoteVerdict | null>(LS.verdict, null);
  if (!v) return null;
  if (licenseKey && v.key && v.key !== licenseKey) return null;
  return v;
}

/** Wipe the cached Super Admin verdict (called on every fresh activation). */
export function clearVerdict() {
  try { localStorage.removeItem(LS.verdict); } catch { /* ignore */ }
}

/**
 * Ask the backend what the Super Admin says about this licence.
 * Returns null when offline / unreachable — callers must fall back to the
 * signed local licence (which carries its own expiry, so an offline machine
 * can never run past its paid period).
 */
export async function verifyLicenseOnline(licenseKey: string): Promise<RemoteVerdict | null> {
  if (!licenseKey || !navigator.onLine) return null;
  setState('verifying');
  const url = `${BASE}/licenseStatus/${docIdFor(licenseKey)}?key=${API_KEY}`;
  const res = await withTimeout(fetch(url).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })), 8000);
  if (!res) { setState('error'); return null; }
  // 404 → Super Admin has not published a status yet: treat as active.
  const status = res.ok ? (readField(res.body, 'status') || 'active') : (res.status === 404 ? 'active' : '');
  if (!status) { setState('error'); return null; }
  const verdict: RemoteVerdict = {
    status: status.toLowerCase(),
    message: res.ok ? readField(res.body, 'message') : '',
    checkedAt: Date.now(),
  };
  setState('online');
  return verdict;
}

/**
 * Per-device status published by Super Admin (`deviceStatus/{deviceId}`).
 * Yeh us waqt bhi chalta hai jab licence key abhi cloud par sync nahi hui.
 */
export async function verifyDeviceOnline(deviceId: string): Promise<RemoteVerdict | null> {
  if (!deviceId || !navigator.onLine) return null;
  const url = `${BASE}/deviceStatus/${encodeURIComponent(docIdFor(deviceId))}?key=${API_KEY}`;
  const res = await withTimeout(fetch(url).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })), 8000);
  if (!res || (!res.ok && res.status !== 404)) return null;
  const status = (res.ok ? readField(res.body, 'status') : 'active').toLowerCase() || 'active';
  const updatedAt = Number(res.ok ? readField(res.body, 'updatedAt') : 0) || 0;
  return { status, message: res.ok ? readField(res.body, 'message') : '', checkedAt: Date.now(), updatedAt };
}

/**
 * Licence key + device — jo bhi zyada sakht ho wohi lagta hai. Yehi POS ka
 * asli "kya main chal sakta hoon" sawal hai.
 */
export async function verifyStatusOnline(
  licenseKey: string,
  deviceId?: string,
  opts: { activatedAt?: number } = {},
): Promise<RemoteVerdict | null> {
  const previous = cachedVerdict(licenseKey);
  const [byKey, rawDevice] = await Promise.all([
    verifyLicenseOnline(licenseKey),
    deviceId ? verifyDeviceOnline(deviceId) : Promise.resolve(null),
  ]);
  // A "deleted" tombstone belongs to the OLD installation. If the shop has
  // activated a fresh licence AFTER Super Admin removed the device, the
  // tombstone must not keep blocking the machine — the heartbeat re-registers it.
  let byDevice = rawDevice;
  if (
    byDevice?.status === 'deleted' &&
    opts.activatedAt &&
    byDevice.updatedAt &&
    opts.activatedAt > byDevice.updatedAt
  ) {
    byDevice = null;
  }
  const blocking = (v: RemoteVerdict | null) => !!v && !['active', 'trial'].includes(v.status);
  const worst = blocking(byDevice) ? byDevice : (blocking(byKey) ? byKey : (byKey || byDevice));
  if (!worst) return null;
  worst.key = licenseKey;
  try { localStorage.setItem(LS.verdict, JSON.stringify(worst)); } catch { /* quota */ }
  // Notify only when the authoritative access state actually changes. The old
  // implementation emitted twice per check and App.tsx answered with a full
  // reload, causing the repeated "Verifying license" screen seen in the POS.
  if (previous?.status !== worst.status) {
    try { window.dispatchEvent(new CustomEvent('dtpos-license-verdict', { detail: worst })); } catch { /* non-browser */ }
  }
  return worst;
}

// ---------- device heartbeat ----------
export interface HeartbeatInput {
  deviceId: string;
  licenseKey?: string;
  business?: string;
  owner?: string;
  phone?: string;
  plan?: string;
  expiryDate?: number | null;
  appVersion?: string;
  activatedAt?: number;
}

export async function sendHeartbeat(input: HeartbeatInput): Promise<boolean> {
  if (!input.deviceId || !navigator.onLine) { setState('offline'); return false; }
  setState('syncing');
  const [hw, loc] = await Promise.all([getDeviceHardware(), refreshLocation()]);
  const stats = getLoginStats();
  const verdict = cachedVerdict();

  const body = {
    fields: toFields({
      deviceId: input.deviceId,
      licenseKey: input.licenseKey || '',
      licenseDocId: input.licenseKey ? docIdFor(input.licenseKey) : '',
      business: input.business || '',
      owner: input.owner || '',
      phone: input.phone || '',
      plan: input.plan || '',
      expiryDate: input.expiryDate || 0,
      appVersion: input.appVersion || '',
      manufacturer: hw.manufacturer || '',
      model: hw.model || '',
      osName: hw.osName || '',
      osVersion: hw.osVersion || '',
      hostname: hw.hostname || '',
      installedAt: installedAt(),
      firstLoginAt: stats.firstLoginAt || 0,
      lastLoginAt: stats.lastLoginAt || 0,
      loginCount: stats.loginCount || 0,
      lastSyncAt: Date.now(),
      lastVerifyAt: verdict?.checkedAt || 0,
      licenseStatus: verdict?.status || 'unknown',
      country: loc?.country || '',
      region: loc?.region || '',
      city: loc?.city || '',
      latitude: loc?.lat || 0,
      longitude: loc?.lng || 0,
      locationUpdatedAt: loc?.at || 0,
      locationAccuracyM: loc?.accuracyM || 0,
      locationSource: loc?.source || 'network',
    }),
  };

  const url = `${BASE}/devices/${encodeURIComponent(input.deviceId)}?key=${API_KEY}`;
  const ok = await withTimeout(
    fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.ok),
    9000,
  );
  if (ok) {
    try { localStorage.setItem(LS.lastSync, String(Date.now())); } catch { /* quota */ }
    setState('online');
    return true;
  }
  setState(navigator.onLine ? 'error' : 'offline');
  return false;
}

// ---------- background scheduler ----------
let timer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_MS = 5 * 60_000;

type Provider = () => Promise<HeartbeatInput | null>;

/**
 * Start the background link. Safe to call once at app start; it never throws
 * and never delays the UI — the first cycle runs after the POS has painted.
 */
export function startCloudLink(provider: Provider): () => void {
  const cycle = async () => {
    try {
      if (!navigator.onLine) { setState('offline'); return; }
      const input = await provider();
      if (!input) return;
       const activatedAt = Number((input as HeartbeatInput & { activatedAt?: number }).activatedAt || 0) || undefined;
       const verdict = await verifyStatusOnline(input.licenseKey || '', input.deviceId, { activatedAt });
      if (verdict?.status === 'deleted') return;
      await sendHeartbeat(input);
    } catch { setState('error'); }
  };

  const onOnline = () => { setState('online'); void cycle(); };
  const onOffline = () => setState('offline');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('dtpos-device-location-updated', onOnline);

  const kick = setTimeout(cycle, 4000);
  if (timer) clearInterval(timer);
  timer = setInterval(cycle, HEARTBEAT_MS);

  return () => {
    clearTimeout(kick);
    if (timer) { clearInterval(timer); timer = null; }
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('dtpos-device-location-updated', onOnline);
  };
}

/** Human label for the small POS status pill. */
export function linkLabel(s: LinkState): string {
  switch (s) {
    case 'online':    return 'Server Online';
    case 'syncing':   return 'Syncing…';
    case 'verifying': return 'License Verified';
    case 'error':     return 'Connection Error';
    default:          return 'Offline Mode';
  }
}
