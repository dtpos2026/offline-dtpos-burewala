// ============================================================
// DT POS — LICENSE CLIENT SERVICE  (OFFLINE FIRST)
//
// A license key carries its own plan, expiry and device count and is
// authenticated locally (see licenseKey.ts), so activation works on a
// machine that has never been online.
//
// Security model:
//   • Keys are minted only by Digital Target (offline key generator)
//   • Every key is HMAC-signed — invented keys are rejected
//   • The local vault is AES-256-GCM encrypted with a key derived from the
//     machine's own identity (Windows MachineGuid — see
//     electron/deviceIdentity.cjs), so copying it to another computer makes
//     it unopenable. The identity does not depend on the network, so the
//     vault opens with the internet off.
//   • The last server verdict (suspended / revoked / removed / device
//     limit) is stored INSIDE the vault, so it survives going offline and
//     cannot be cleared by editing browser storage.
//   • Clock-tamper detection (a monotonic "last seen" stamp)
//
// Startup order: local vault → device check → open POS. The server is
// consulted afterwards, in the background (licenseSync.ts).
// ============================================================
import {
  verifyLicenseKey, isLegacyKeyFormat, PLAN_LABEL,
  type LicensePlan, type LicensePayload,
} from './licenseKey';
import { encodeReceipt } from './activationReceipt';
import { cachedVerdict, clearVerdict } from '@/lib/cloudLink';
import { isBlockingStatus, type ServerVerdict, type SlotState } from './licenseVerdict';

export type { LicensePlan } from './licenseKey';
export { PLAN_LABEL } from './licenseKey';

export type LicenseStatus =
  | 'active' | 'trial' | 'expired' | 'suspended' | 'revoked' | 'disabled' | 'deleted' | 'pending' | 'device-limit';

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
  /** First activation of this key on this computer (kept across re-activations). */
  activatedAt: number;
  /** The most recent explicit activation on this computer. */
  lastActivationAt?: number;
  /** Random ID of this installation (see device-identity.json). */
  installationId?: string;
  lastVerifiedAt: number;
  /** Monotonic guard — never moves backward; used to detect clock tampering. */
  lastSeenClock: number;
  appVersion?: string;
  /** Last authoritative answer from the server; absent until the first sync. */
  server?: ServerVerdict;
  /** This computer's place in the licence's device slots. Absent = activated before v1.12. */
  slot?: SlotState;
  slotUsed?: number;
  slotMax?: number;
}

/** The slice of the Electron preload bridge this module uses. */
interface LicenseBridge {
  getHardwareId?: () => Promise<{ success?: boolean; hardwareId?: string; installationId?: string; error?: string }>;
  licenseLoad?: () => Promise<{ data?: StoredLicense | null; tampered?: boolean; identityUnavailable?: boolean }>;
  licenseSave?: (lic: StoredLicense) => Promise<unknown>;
  licenseClear?: () => Promise<unknown>;
}

function bridge(): LicenseBridge | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: LicenseBridge }).electronAPI ?? null;
}

export type GateState =
  | { state: 'checking' }
  | { state: 'unactivated'; note?: string }
  | { state: 'ok'; license: StoredLicense; offline: boolean; daysLeft: number | null }
  | { state: 'blocked'; reason: string; message: string; note?: string; license?: StoredLicense };

// ===== Device identity =====
export const IDENTITY_UNAVAILABLE = 'HW-UNAVAILABLE';
let _hwid: string | null = null;
let _installationId: string | null = null;
export async function getHardwareId(): Promise<string> {
  if (_hwid) return _hwid;
  const api = bridge();
  if (api?.getHardwareId) {
    try {
      const r = await api.getHardwareId();
      if (r?.hardwareId) {
        _installationId = r.installationId || null;
        return (_hwid = r.hardwareId);
      }
    } catch { /* reported below */ }
    // Never substitute a made-up ID on the desktop: the licence would be bound
    // to something that changes on the next start. Not memoised — retried.
    return IDENTITY_UNAVAILABLE;
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

export async function getInstallationId(): Promise<string | null> {
  await getHardwareId();
  return _installationId;
}

// ===== Encrypted vault (Electron) / localStorage in the browser dev build =====
const LS_KEY = 'dtpos-license-cache';

/** Why the last load returned nothing, when it was not simply "never activated". */
export type LoadIssue = 'tampered' | 'identity-unavailable' | null;
let lastLoadIssue: LoadIssue = null;
export function getLastLoadIssue(): LoadIssue { return lastLoadIssue; }

export async function loadLicense(): Promise<StoredLicense | null> {
  const api = bridge();
  if (api?.licenseLoad) {
    try {
      const r = await api.licenseLoad();
      lastLoadIssue = r?.identityUnavailable ? 'identity-unavailable' : (r?.tampered ? 'tampered' : null);
      return r?.data || null;
    } catch { lastLoadIssue = null; return null; }
  }
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/**
 * Throws when the licence could not be written — callers must never report
 * an activation that will be gone after the next restart.
 */
export async function saveLicense(lic: StoredLicense): Promise<void> {
  const api = bridge();
  if (api?.licenseSave) {
    const r = (await api.licenseSave(lic)) as { success?: boolean; error?: string } | undefined;
    if (r && r.success === false) throw new Error(r.error === 'identity-unavailable'
      ? "This computer's identity could not be read. Restart DT POS and try again."
      : 'The license could not be saved on this computer. Check that the disk is not full and try again.');
    // Earlier versions also kept a plain-text copy in browser storage; the
    // encrypted vault is the only copy now.
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(lic));
}

/**
 * Read-modify-write under one lock, so the background sync and the local
 * re-check never overwrite each other's changes to the vault.
 */
let vaultChain: Promise<unknown> = Promise.resolve();
export function updateLicense(mutate: (lic: StoredLicense) => StoredLicense | null): Promise<StoredLicense | null> {
  const run = vaultChain.then(async () => {
    const current = await loadLicense();
    if (!current) return null;
    const next = mutate(current);
    if (!next) return current;
    await saveLicense(next);
    return next;
  });
  vaultChain = run.catch(() => undefined);
  return run;
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

export interface SlotCheck {
  result: 'confirmed' | 'denied' | 'unavailable';
  used?: number;
  max?: number;
}

/** Injected by licenseSync.ts so this module stays free of network code. */
type SlotClaimer = (licenseKey: string, deviceId: string, maxDevices: number) => Promise<SlotCheck>;
let slotClaimer: SlotClaimer | null = null;
export function registerSlotClaimer(fn: SlotClaimer) { slotClaimer = fn; }

export async function activate(
  input: ActivateInput,
  appVersion = '',
): Promise<{ ok: boolean; message?: string; license?: StoredLicense; slot?: SlotCheck }> {
  try {
    const check = await verifyLicenseKey(input.licenseKey);
    if (!check.ok || !check.payload) return { ok: false, message: check.message || 'License key is invalid' };

    const payload: LicensePayload = check.payload;
    if (payload.expiryDate && Date.now() > payload.expiryDate) {
      return { ok: false, message: 'This license has expired' };
    }

    const deviceId = await getHardwareId();
    if (deviceId === IDENTITY_UNAVAILABLE) {
      return { ok: false, message: "This computer's identity could not be read. Restart DT POS and try again." };
    }
    const installationId = await getInstallationId();

    // Device limit: when the server can be reached, this computer must fit in
    // the licence's slots BEFORE anything is saved. Offline, the check is
    // deferred to the first sync — activation itself never needs internet.
    let slot: SlotCheck = { result: 'unavailable' };
    if (slotClaimer) {
      try { slot = await slotClaimer(check.key, deviceId, payload.maxDevices); } catch { slot = { result: 'unavailable' }; }
    }
    if (slot.result === 'denied') {
      return { ok: false, slot, message: blockMessage('device-limit', { max: slot.max ?? payload.maxDevices }) };
    }

    const now = Date.now();
    const previous = await loadLicense();
    // A fresh activation must never inherit an old blocked verdict
    // (suspended/revoked/deleted) — that kept the POS locked after a new key.
    clearVerdict();
    // Best effort, and never blocking: if the shop allows location we record
    // it once so Digital Target can place the device on the Super Admin map.
    // A refusal, a timeout or no GPS simply means no coordinates.
    const fix = await captureActivationLocation();
    const sameKey = !!previous && previous.licenseKey === check.key;
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
      installationId: installationId || undefined,
      maxDevices: payload.maxDevices,
      // Re-activating the same key on the same machine keeps the original date…
      activatedAt: sameKey ? (previous!.activatedAt || now) : now,
      // …but this stamp always moves, so a "removed by administrator" record
      // written before today's activation no longer applies.
      lastActivationAt: now,
      lastVerifiedAt: now,
      lastSeenClock: Math.max(previous?.lastSeenClock || 0, now),
      appVersion,
      server: undefined,
      slot: slot.result === 'confirmed' ? 'confirmed' : 'pending',
      slotUsed: slot.used,
      slotMax: slot.max ?? payload.maxDevices,
    };
    await saveLicense(stored);
    return { ok: true, license: stored, slot };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || 'Activation failed' };
  }
}

/**
 * Re-check the stored license against its own signature. Runs locally —
 * a tampered vault or an edited key can never pass.
 */
export async function verifyStored(appVersion = ''): Promise<{ ok: boolean; reason?: string; message?: string; note?: string; license?: StoredLicense }> {
  const cached = await loadLicense();
  if (!cached) return { ok: false, reason: 'unactivated' };

  const deviceId = await getHardwareId();
  if (deviceId === IDENTITY_UNAVAILABLE) {
    return { ok: false, reason: 'identity-unavailable', message: blockMessage('identity-unavailable') };
  }
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
    await updateLicense(l => ({ ...l, status: 'expired', expiryDate: expiry })).catch(() => null);
    return { ok: false, reason: 'expired', message: blockMessage('expired') };
  }

  // --- Authoritative status from the Super Admin panel, as last heard. It is
  // kept in the vault, so a licence suspended online stays blocked after the
  // internet goes away, and clearing browser storage does not undo it. ---
  const blocked = storedBlock(cached);
  if (blocked) {
    if (cached.status !== blocked.status) {
      await updateLicense(l => ({ ...l, status: blocked.status as LicenseStatus })).catch(() => null);
    }
    return {
      ok: false,
      reason: blocked.status,
      message: blockMessage(blocked.status, { max: cached.slotMax ?? cached.maxDevices }),
      note: blocked.message,
    };
  }

  const refreshed = await updateLicense(l => ({
    ...l,
    plan: check.payload!.plan,
    status: statusForPlan(check.payload!.plan),
    expiryDate: expiry,
    maxDevices: check.payload!.maxDevices,
    deviceId,
    lastVerifiedAt: now,
    lastSeenClock: Math.max(l.lastSeenClock || 0, now),
    appVersion: appVersion || l.appVersion,
  })).catch(() => null);
  return { ok: true, license: refreshed || cached };
}

/**
 * The blocking server verdict this licence carries, if any. Licences saved by
 * v1.11 and earlier kept the verdict in browser storage only; that copy is
 * honoured until the first sync writes one into the vault.
 */
function storedBlock(lic: StoredLicense): { status: string; message?: string } | null {
  if (lic.server) return isBlockingStatus(lic.server.status) ? lic.server : null;
  if (lic.slot === 'denied') return { status: 'device-limit' };
  const legacy = cachedVerdict(lic.licenseKey);
  if (!legacy || !isBlockingStatus(legacy.status)) return null;
  const since = lic.lastActivationAt || lic.activatedAt || 0;
  if (legacy.status === 'deleted' && legacy.updatedAt && since > legacy.updatedAt) return null;
  return legacy;
}

// ===== Gate: decision made before the app opens — local only =====
export async function evaluateGate(appVersion = ''): Promise<GateState> {
  const cached = await loadLicense();
  if (!cached) {
    const issue = getLastLoadIssue();
    if (issue === 'identity-unavailable') {
      return { state: 'blocked', reason: 'identity-unavailable', message: blockMessage('identity-unavailable') };
    }
    return issue === 'tampered'
      ? { state: 'unactivated', note: 'The license saved on this computer could not be opened (it was copied from another computer or is damaged). Please activate again.' }
      : { state: 'unactivated' };
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
    note: v.note,
    license: cached,
  };
}

export function daysLeft(l: StoredLicense): number | null {
  if (l.plan === 'lifetime' || !l.expiryDate) return null;
  return Math.max(0, Math.ceil((l.expiryDate - Date.now()) / 86400000));
}

export function blockMessage(reason: string, ctx: { max?: number } = {}): string {
  switch (reason) {
    case 'expired': return 'Your license has expired. Please contact the administrator to renew it.';
    case 'suspended': return 'Your software license has been suspended by the administrator.';
    case 'revoked': return 'Your software license has been revoked.';
    case 'pending': return 'Your license/payment is pending. Please contact the administrator.';
    case 'disabled': return 'This license has been disabled by the administrator.';
    case 'deleted': return 'This computer has been removed from the license by the administrator. Enter the license key again to register it, or contact the administrator.';
    case 'device-limit': return ctx.max
      ? `This license is already active on the maximum number of computers (${ctx.max}). Ask the administrator to remove a computer from this license, then try again.`
      : 'This license is already active on the maximum number of computers. Ask the administrator to remove a computer from this license, then try again.';
    case 'device-mismatch': return 'This license belongs to another computer. Contact support for a new device key.';
    case 'identity-unavailable': return "This computer's identity could not be read, so the license cannot be opened. Restart DT POS; if this continues, contact support.";
    case 'not-found': return 'License key is invalid. Check the key or contact support.';
    case 'clock-tamper': return 'The system clock has been turned back. Set the correct date and try again.';
    default: return 'License could not be verified.';
  }
}

export { isLegacyKeyFormat };
