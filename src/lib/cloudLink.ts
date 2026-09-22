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
  | 'connecting'   // network present, server not contacted yet
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
// "Online" is only ever shown after the server actually answered.
let state: LinkState = navigator.onLine ? 'connecting' : 'offline';
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
 * Mirror of the verdict kept in the encrypted vault, for the heartbeat and the
 * status pill. Announces a change so the licence gate re-evaluates.
 */
export function storeVerdict(v: RemoteVerdict): void {
  const previous = cachedVerdict();
  try { localStorage.setItem(LS.verdict, JSON.stringify(v)); } catch { /* quota */ }
  if (previous?.status !== v.status || previous?.key !== v.key) {
    try { window.dispatchEvent(new CustomEvent('dtpos-license-verdict', { detail: v })); } catch { /* non-browser */ }
  }
}

/** Server answer for one status document. `doc: null` = no record (404). */
export type StatusFetch =
  | { reachable: false }
  | { reachable: true; doc: { status: string; message?: string; updatedAt?: number } | null };

async function fetchStatusDoc(collection: 'licenseStatus' | 'deviceStatus', id: string): Promise<StatusFetch> {
  if (!id || !navigator.onLine) return { reachable: false };
  const url = `${BASE}/${collection}/${encodeURIComponent(docIdFor(id))}?key=${API_KEY}`;
  const res = await withTimeout(fetch(url).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })), 8000);
  if (!res) return { reachable: false };
  if (res.status === 404) return { reachable: true, doc: null };
  if (!res.ok) return { reachable: false };
  return {
    reachable: true,
    doc: {
      status: (readField(res.body, 'status') || 'active').toLowerCase(),
      message: readField(res.body, 'message') || undefined,
      updatedAt: Number(readField(res.body, 'updatedAt')) || undefined,
    },
  };
}

/** Licence-wide and per-device status in one round trip. */
export async function fetchServerStatus(licenseKey: string, deviceId: string): Promise<{
  reachable: boolean;
  license: StatusFetch;
  device: StatusFetch;
}> {
  setState('verifying');
  const [license, device] = await Promise.all([
    fetchStatusDoc('licenseStatus', licenseKey),
    fetchStatusDoc('deviceStatus', deviceId),
  ]);
  const reachable = license.reachable || device.reachable;
  setState(reachable ? 'online' : (navigator.onLine ? 'error' : 'offline'));
  return { reachable, license, device };
}

// ---------- device slot ledger: licenseDevices/{key} ----------
// The POS may only ever APPEND its own ID (Firestore rules enforce "exactly one
// more, nothing removed"), so a shop cannot free a slot by itself. Super Admin
// removes a device, which frees its slot.

export type SlotClaim =
  | { result: 'confirmed'; used: number; max: number }
  | { result: 'denied'; used: number; max: number }
  | { result: 'unavailable'; reason: string };

function readStringArray(doc: any, name: string): string[] {
  const values = doc?.fields?.[name]?.arrayValue?.values;
  return Array.isArray(values) ? values.map((v: any) => String(v?.stringValue || '')).filter(Boolean) : [];
}

function ledgerBody(devices: string[]) {
  return JSON.stringify({
    fields: {
      devices: { arrayValue: { values: devices.map(d => ({ stringValue: d })) } },
      updatedAt: { integerValue: String(Date.now()) },
    },
  });
}

/**
 * Take (or confirm) this computer's slot on the licence.
 * `decide` is the pure policy from licenseVerdict.ts.
 */
export async function claimDeviceSlot(
  licenseKey: string,
  deviceId: string,
  decide: (ledger: string[]) => { outcome: 'present' | 'append' | 'full'; used: number; max: number },
): Promise<SlotClaim> {
  if (!licenseKey || !deviceId || !navigator.onLine) return { result: 'unavailable', reason: 'offline' };
  const docUrl = `${BASE}/licenseDevices/${encodeURIComponent(docIdFor(licenseKey))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = await withTimeout(
      fetch(`${docUrl}?key=${API_KEY}`).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })),
      8000,
    );
    if (!got) return { result: 'unavailable', reason: 'timeout' };
    // 403 = the updated Firestore rules have not been published yet.
    if (!got.ok && got.status !== 404) return { result: 'unavailable', reason: `http-${got.status}` };

    const ledger = got.ok ? readStringArray(got.body, 'devices') : [];
    const d = decide(ledger);
    if (d.outcome === 'present') return { result: 'confirmed', used: d.used, max: d.max };
    if (d.outcome === 'full') return { result: 'denied', used: d.used, max: d.max };

    const precondition = got.ok
      ? `currentDocument.updateTime=${encodeURIComponent(String(got.body?.updateTime || ''))}`
      : 'currentDocument.exists=false';
    const put = await withTimeout(
      fetch(`${docUrl}?key=${API_KEY}&${precondition}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: ledgerBody([...Array.from(new Set(ledger)), deviceId]),
      }).then(r => r.status),
      8000,
    );
    if (put === null) return { result: 'unavailable', reason: 'timeout' };
    if (put >= 200 && put < 300) return { result: 'confirmed', used: d.used + 1, max: d.max };
    // 400/409: another computer changed the ledger between our read and write.
    if (put === 400 || put === 409) continue;
    return { result: 'unavailable', reason: `http-${put}` };
  }
  return { result: 'unavailable', reason: 'contended' };
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
  lastActivationAt?: number;
  installationId?: string;
  slot?: string;
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
      installationId: input.installationId || '',
      activatedAt: input.activatedAt || 0,
      lastActivationAt: input.lastActivationAt || 0,
      slot: input.slot || '',
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
      // Licence status is fetched by the licence gate's own sync
      // (licenseSync.ts); the heartbeat only reports. A device the
      // administrator removed stays removed until it is activated again.
      const verdict = cachedVerdict(input.licenseKey);
      if (verdict?.status === 'deleted') return;
      await sendHeartbeat(input);
    } catch { setState('error'); }
  };

  const onOnline = () => { setState('connecting'); void cycle(); };
  const onOffline = () => setState('offline');
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('dtpos-device-location-updated', onOnline);
  // After a re-activation the verdict flips from "deleted" to "active":
  // report straight away instead of waiting five minutes.
  const onVerdict = () => { void cycle(); };
  window.addEventListener('dtpos-license-verdict', onVerdict);

  const kick = setTimeout(cycle, 4000);
  if (timer) clearInterval(timer);
  timer = setInterval(cycle, HEARTBEAT_MS);

  return () => {
    clearTimeout(kick);
    if (timer) { clearInterval(timer); timer = null; }
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('dtpos-device-location-updated', onOnline);
    window.removeEventListener('dtpos-license-verdict', onVerdict);
  };
}

/** Human label for the small POS status pill. */
export function linkLabel(s: LinkState): string {
  switch (s) {
    case 'online':    return 'Server Online';
    case 'connecting': return 'Connecting…';
    case 'syncing':   return 'Syncing…';
    case 'verifying': return 'Checking License…';
    case 'error':     return 'Connection Error';
    default:          return 'Offline Mode';
  }
}
