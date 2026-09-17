// ============================================================
// DT POS — LICENSE CLIENT SERVICE  (100% OFFLINE)
//
// v1.0.40: every cloud dependency is gone. A
// license key now carries its own plan, expiry and device count
// and is authenticated locally (see licenseKey.ts), so activation
// works on a machine that has never been online.
//
// Security model:
//   • Keys are minted only by Digital Target (offline key generator)
//   • Every key is HMAC-signed — invented keys are rejected
//   • The local vault is AES-256-GCM encrypted with a key derived
//     from the hardware ID, so copying it to another machine makes
//     it unopenable (this is what enforces device binding)
//   • Clock-tamper detection (a monotonic "last seen" stamp)
// ============================================================
import {
  verifyLicenseKey, isLegacyKeyFormat, PLAN_LABEL,
  type LicensePlan, type LicensePayload,
} from './licenseKey';
import { encodeReceipt } from './activationReceipt';
import { cachedVerdict, clearVerdict, verifyStatusOnline } from '@/lib/cloudLink';

export type { LicensePlan } from './licenseKey';
export { PLAN_LABEL } from './licenseKey';

export type LicenseStatus = 'active' | 'trial' | 'expired' | 'suspended' | 'revoked' | 'disabled' | 'deleted';

export interface StoredLicense {
  /** Where the shop was when it activated — powers the Super Admin device map. */
  lat?: number;
  lng?: number;
  licenseKey: string;
  businessName: string;
  ownerName: string;
  mobileNumber: string;
  plan: LicensePlan;
  status: LicenseStatus;
  expiryDate: number | null;
  deviceId: string;
  /** How many machines this key may be activated on (informational offline). */
  maxDevices: number;
  activatedAt: number;
  lastVerifiedAt: number;
  /** Monotonic guard — never moves backward; used to detect clock tampering. */
  lastSeenClock: number;
  appVersion?: string;
}

/** The slice of the Electron preload bridge this module uses. */
interface LicenseBridge {
  getHardwareId?: () => Promise<{ hardwareId?: string }>;
  licenseLoad?: () => Promise<{ data?: StoredLicense | null }>;
  licenseSave?: (lic: StoredLicense) => Promise<unknown>;
  licenseClear?: () => Promise<unknown>;
}

function bridge(): LicenseBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: LicenseBridge }).electronAPI ?? null;
}

export type GateState =
  | { state: 'checking' }
  | { state: 'unactivated' }
  | { state: 'ok'; license: StoredLicense; offline: boolean; daysLeft: number | null }
  | { state: 'blocked'; reason: string; message: string; license?: StoredLicense };

// ===== Hardware ID =====
let _hwid: string | null = null;
export async function getHardwareId(): Promise<string> {
  if (_hwid) return _hwid;
  const api = bridge();
  if (api?.getHardwareId) {
    try {
      const r = await api.getHardwareId();
      if (r?.hardwareId) return (_hwid = r.hardwareId);
    } catch { /* fall through to the browser fallback */ }
  }
  // Browser fallback (dev mode) — stable per-browser
  try {
    const k = 'dtpos-browser-hwid';
    let v = localStorage.getItem(k);
    if (!v) {
      v = 'BR-' + Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      localStorage.setItem(k, v);
    }
    return (_hwid = v);
  } catch {
    return (_hwid = 'HW-UNKNOWN');
  }
}

// ===== Encrypted vault (Electron) / localStorage fallback =====
const LS_KEY = 'dtpos-license-cache';

export async function loadLicense(): Promise<StoredLicense | null> {
  const api = bridge();
  if (api?.licenseLoad) {
    try {
      const r = await api.licenseLoad();
      return r?.data || null;
    } catch { return null; }
  }
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function saveLicense(lic: StoredLicense): Promise<void> {
  const api = bridge();
  if (api?.licenseSave) {
    try {
      const r = (await api.licenseSave(lic)) as { success?: boolean } | undefined;
      // Only trust the vault when it actually confirms the write, otherwise
      // a silent failure would lose the activation on the next restart.
      if (r === undefined || r?.success !== false) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(lic)); } catch { /* ignore */ }
        return;
      }
    } catch { /* fall back to localStorage */ }
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(lic)); } catch { /* storage full / private mode */ }
}

export async function clearLicense(): Promise<void> {
  const api = bridge();
  if (api?.licenseClear) { try { await api.licenseClear(); } catch { /* ignore */ } }
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/**
 * One quick geolocation attempt, capped so activation is never held up.
 * Resolves null on refusal, timeout or an unsupported platform.
 */
async function captureActivationLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return await new Promise(resolve => {
      let settled = false;
      const done = (v: { lat: number; lng: number } | null) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => done(null), 6000);
      navigator.geolocation.getCurrentPosition(
        pos => { clearTimeout(timer); done({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(timer); done(null); },
        { enableHighAccuracy: true, maximumAge: 300000, timeout: 6000 },
      );
    });
  } catch {
    return null;
  }
}

/**
 * The single string the shop sends back to Digital Target after activating.
 * Pasted into the Super Admin panel it registers the client and drops the
 * device on the map — no server, no callback, no internet on the POS.
 */
export async function buildActivationReceipt(): Promise<string | null> {
  const lic = await loadLicense();
  if (!lic) return null;
  return encodeReceipt({
    key: lic.licenseKey,
    device: lic.deviceId,
    business: lic.businessName,
    owner: lic.ownerName,
    phone: lic.mobileNumber,
    plan: lic.plan,
    at: lic.activatedAt || Date.now(),
    lat: lic.lat,
    lng: lic.lng,
    ver: lic.appVersion,
  });
}

// ===== Activation =====

export interface ActivateInput {
  licenseKey: string;
  businessName: string;
  ownerName: string;
  mobileNumber: string;
}

function statusForPlan(plan: LicensePlan): LicenseStatus {
  return plan === 'trial' ? 'trial' : 'active';
}

export async function activate(
  input: ActivateInput,
  appVersion = '',
): Promise<{ ok: boolean; message?: string; license?: StoredLicense }> {
  try {
    const check = await verifyLicenseKey(input.licenseKey);
    if (!check.ok || !check.payload) return { ok: false, message: check.message || 'License key is invalid' };

    const payload: LicensePayload = check.payload;
    if (payload.expiryDate && Date.now() > payload.expiryDate) {
      return { ok: false, message: 'This license has expired' };
    }

    const deviceId = await getHardwareId();
    const now = Date.now();
    const previous = await loadLicense();
    // A fresh activation must never inherit an old blocked verdict
    // (suspended/revoked/deleted) — that kept the POS locked after a new key.
    clearVerdict();
    // Best effort, and never blocking: if the shop allows location we record
    // it once so Digital Target can place the device on the Super Admin map.
    // A refusal, a timeout or no GPS simply means no coordinates.
    const fix = await captureActivationLocation();
    const stored: StoredLicense = {
      lat: fix?.lat ?? previous?.lat,
      lng: fix?.lng ?? previous?.lng,
      licenseKey: check.key,
      businessName: input.businessName.trim(),
      ownerName: input.ownerName.trim(),
      mobileNumber: input.mobileNumber.trim(),
      plan: payload.plan,
      status: statusForPlan(payload.plan),
      expiryDate: payload.expiryDate,
      deviceId,
      maxDevices: payload.maxDevices,
      // Re-activating the same key on the same machine keeps the original date.
      activatedAt: previous && previous.licenseKey === check.key ? (previous.activatedAt || now) : now,
      lastVerifiedAt: now,
      lastSeenClock: Math.max(previous?.lastSeenClock || 0, now),
      appVersion,
    };
    await saveLicense(stored);
    return { ok: true, license: stored };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || 'Activation failed' };
  }
}

/**
 * Re-check the stored license against its own signature. Runs locally —
 * a tampered vault or an edited key can never pass.
 */
export async function verifyStored(appVersion = ''): Promise<{ ok: boolean; reason?: string; message?: string; license?: StoredLicense }> {
  const cached = await loadLicense();
  if (!cached) return { ok: false, reason: 'unactivated' };

  const deviceId = await getHardwareId();
  if (cached.deviceId && cached.deviceId !== deviceId) {
    return { ok: false, reason: 'device-mismatch', message: blockMessage('device-mismatch') };
  }

  const check = await verifyLicenseKey(cached.licenseKey);
  if (!check.ok || !check.payload) {
    return { ok: false, reason: 'not-found', message: check.message || blockMessage('not-found') };
  }

  const now = Date.now();
  const expiry = check.payload.expiryDate;
  if (expiry && now > expiry) {
    await saveLicense({ ...cached, status: 'expired', expiryDate: expiry });
    return { ok: false, reason: 'expired', message: blockMessage('expired') };
  }

  // --- Authoritative status from the Super Admin panel (when it was ever
  // reachable). The verdict is cached locally, so a licence suspended online
  // stays blocked even after the internet goes away again. ---
  const verdict = cachedVerdict(cached.licenseKey);
  const verdictStale = !!verdict && verdict.status === 'deleted'
    && !!cached.activatedAt && !!verdict.updatedAt && cached.activatedAt > verdict.updatedAt;
  if (!verdictStale && verdict && ['suspended', 'revoked', 'disabled', 'deleted', 'expired'].includes(verdict.status)) {
    await saveLicense({ ...cached, status: verdict.status as LicenseStatus });
    return {
      ok: false,
      reason: verdict.status,
      message: verdict.message || blockMessage(verdict.status),
    };
  }

  const refreshed: StoredLicense = {
    ...cached,
    plan: check.payload.plan,
    status: statusForPlan(check.payload.plan),
    expiryDate: expiry,
    maxDevices: check.payload.maxDevices,
    deviceId,
    lastVerifiedAt: now,
    lastSeenClock: Math.max(cached.lastSeenClock || 0, now),
    appVersion: appVersion || cached.appVersion,
  };
  await saveLicense(refreshed);
  return { ok: true, license: refreshed };
}

// ===== Gate: decision made before the app opens =====
export async function evaluateGate(appVersion = ''): Promise<GateState> {
  const cached = await loadLicense();
  if (!cached) {
    // A tampered/foreign vault also lands here (decrypt fail → null)
    return { state: 'unactivated' };
  }

  // --- Clock tampering: was the clock turned back? ---
  const nowMs = Date.now();
  if (cached.lastSeenClock && nowMs < cached.lastSeenClock - 3 * 3600000) {
    return {
      state: 'blocked',
      reason: 'clock-tamper',
      message: blockMessage('clock-tamper'),
      license: cached,
    };
  }

  // Mandatory online verification when the internet is available. Offline the
  // signed key (with its own expiry) keeps governing access, exactly as before.
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { await verifyStatusOnline(cached.licenseKey, cached.deviceId, { activatedAt: cached.activatedAt }); } catch { /* stays offline */ }
  }

  const v = await verifyStored(appVersion);
  if (v.ok && v.license) {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
    return { state: 'ok', license: v.license, offline: !online, daysLeft: daysLeft(v.license) };
  }
  if (v.reason === 'unactivated') return { state: 'unactivated' };
  return {
    state: 'blocked',
    reason: v.reason || 'invalid',
    message: v.message || blockMessage(v.reason || 'invalid'),
    license: cached,
  };
}

export function daysLeft(l: StoredLicense): number | null {
  if (l.plan === 'lifetime' || !l.expiryDate) return null;
  return Math.max(0, Math.ceil((l.expiryDate - Date.now()) / 86400000));
}

export function blockMessage(reason: string): string {
  switch (reason) {
    case 'expired': return 'Your license has expired. Contact us to renew it.';
    case 'suspended': return 'License Suspended — your software license has been suspended by the administrator. Please contact your administrator to reactivate the license.';
    case 'revoked': return 'This license has been revoked.';
    case 'disabled': return 'This license has been disabled.';
    case 'deleted': return 'This computer has been removed by the administrator. Contact support to activate it again.';
    case 'device-mismatch': return 'This license belongs to another computer. Contact support for a new device key.';
    case 'not-found': return 'License key is invalid. Check the key or contact support.';
    case 'clock-tamper': return 'The system clock has been turned back. Set the correct date and try again.';
    default: return 'License could not be verified.';
  }
}

export { isLegacyKeyFormat };
