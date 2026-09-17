// ============================================================
// DT POS — OFFLINE LICENSE KEY (no cloud, no network)
// ------------------------------------------------------------
// A license key carries its own plan / expiry / device-count and
// is authenticated with a truncated HMAC-SHA-256 signature, so the
// POS can validate it on a machine that has never seen the internet.
//
// Key shape:  DTPOS-XXXX-XXXX-XXXX-XXXX
//             \_____/ \_______________/
//              prefix  16 Base32 chars = 8 payload + 8 signature
//
// Payload (40 bits, big-endian):
//   version     3 bits   (currently 1)
//   plan        3 bits   (index into PLAN_CODES)
//   maxDevices  6 bits   (1..63)
//   expiryDays 16 bits   (days after EPOCH_DAY, 0 = never expires)
//   serial     12 bits   (random — makes each key unique)
//
// Signature: first 40 bits of HMAC-SHA-256(secret, payload).
//
// SECURITY NOTE: offline validation means the shared secret ships
// inside the application, exactly like every other activation-code
// based desktop product. It stops casual key invention and typos;
// it is not proof against a determined reverse-engineer. Device
// binding (the AES-GCM vault keyed by the hardware ID) is what
// stops a key being reused on other machines.
// ============================================================

/** Crockford-style alphabet — no I, O, 0 or 1 so keys can be read aloud. */
export const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const KEY_PREFIX = 'DTPOS';

/** Shared activation secret. Must match the key generator (superadmin tool). */
export const LICENSE_SECRET = 'DT-POS::offline-activation::v1::3C096C';

/** Day 0 for expiry encoding — 2024-01-01 UTC. */
const EPOCH_DAY = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;

export type LicensePlan = 'trial' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'lifetime';

/** Order is part of the wire format — never reorder, only append. */
export const PLAN_CODES: LicensePlan[] = [
  'trial', 'monthly', 'quarterly', 'halfyearly', 'yearly', 'lifetime',
];

export const PLAN_DAYS: Record<LicensePlan, number> = {
  trial: 14, monthly: 30, quarterly: 90, halfyearly: 180, yearly: 365, lifetime: 0,
};

export const PLAN_LABEL: Record<LicensePlan, string> = {
  trial: 'Trial', monthly: 'Monthly', quarterly: 'Quarterly',
  halfyearly: '6 Months', yearly: 'Yearly', lifetime: 'Lifetime',
};

export interface LicensePayload {
  version: number;
  plan: LicensePlan;
  maxDevices: number;
  /** Epoch millis at which the license stops working, or null for lifetime. */
  expiryDate: number | null;
  serial: number;
}

// ===== Base32 (5 bits per character) =====

function toBase32(value: bigint, chars: number): string {
  let out = '';
  let v = value;
  for (let i = 0; i < chars; i++) {
    out = KEY_ALPHABET[Number(v & 31n)] + out;
    v >>= 5n;
  }
  return out;
}

function fromBase32(s: string): bigint | null {
  let v = 0n;
  for (const ch of s) {
    const i = KEY_ALPHABET.indexOf(ch);
    if (i < 0) return null;
    v = (v << 5n) | BigInt(i);
  }
  return v;
}

/** Strip separators and upper-case — what the user typed vs. what we decode. */
export function normalizeKey(input: string): string {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Bit packing helpers — payload is a single 40-bit big integer. */
function packPayload(p: Omit<LicensePayload, 'expiryDate'> & { expiryDays: number }): bigint {
  const planIdx = PLAN_CODES.indexOf(p.plan);
  if (planIdx < 0) throw new Error(`Unknown plan: ${p.plan}`);
  const version = BigInt(p.version & 0b111);
  const plan = BigInt(planIdx & 0b111);
  const devices = BigInt(Math.min(63, Math.max(1, p.maxDevices)) & 0b111111);
  const days = BigInt(Math.min(0xffff, Math.max(0, Math.round(p.expiryDays))));
  const serial = BigInt(p.serial & 0xfff);
  return (version << 37n) | (plan << 34n) | (devices << 28n) | (days << 12n) | serial;
}

function unpackPayload(v: bigint): LicensePayload | null {
  const version = Number((v >> 37n) & 0b111n);
  const planIdx = Number((v >> 34n) & 0b111n);
  const maxDevices = Number((v >> 28n) & 0b111111n);
  const expiryDays = Number((v >> 12n) & 0xffffn);
  const serial = Number(v & 0xfffn);
  const plan = PLAN_CODES[planIdx];
  if (!plan || version !== 1 || maxDevices < 1) return null;
  return {
    version,
    plan,
    maxDevices,
    expiryDate: expiryDays === 0 ? null : EPOCH_DAY + expiryDays * DAY_MS,
    serial,
  };
}

// ===== HMAC =====

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function hmacTruncated(payload: bigint, bits: number): Promise<bigint> {
  const bytes = new Uint8Array(5);
  let v = payload;
  for (let i = 4; i >= 0; i--) { bytes[i] = Number(v & 0xffn); v >>= 8n; }
  const key = await crypto.subtle.importKey(
    'raw', utf8(LICENSE_SECRET).buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.buffer as ArrayBuffer));
  let out = 0n;
  for (let i = 0; i < 8; i++) out = (out << 8n) | BigInt(sig[i]);
  return out >> BigInt(64 - bits);
}

// ===== Public API =====

export interface MintOptions {
  plan: LicensePlan;
  maxDevices?: number;
  /** Override the plan's default duration. Ignored for lifetime. */
  days?: number;
}

/** Create a fresh, signed license key. Used by the offline key generator. */
export async function mintLicenseKey(opts: MintOptions): Promise<{ key: string; payload: LicensePayload }> {
  const plan = opts.plan;
  const days = plan === 'lifetime' ? 0 : Math.max(1, opts.days ?? PLAN_DAYS[plan]);
  const expiryDays = days === 0 ? 0 : Math.round((Date.now() + days * DAY_MS - EPOCH_DAY) / DAY_MS);
  const serial = crypto.getRandomValues(new Uint16Array(1))[0] & 0xfff;
  const payload = packPayload({
    version: 1,
    plan,
    maxDevices: opts.maxDevices ?? 1,
    expiryDays,
    serial,
  });
  const sig = await hmacTruncated(payload, 40);
  const body = toBase32(payload, 8) + toBase32(sig, 8);
  const key = `${KEY_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
  return { key, payload: unpackPayload(payload)! };
}

export type KeyCheckReason = 'format' | 'legacy' | 'signature' | 'payload';

/**
 * NOTE: a flat shape (not a discriminated union) because the project runs with
 * `strictNullChecks: false`, and TypeScript cannot narrow unions in that mode —
 * `check.message` would error at every call site. Same reasoning as
 * DeviceSlotResult in deviceSlots.ts.
 */
export interface KeyCheck {
  ok: boolean;
  /** Canonical, re-formatted key. Only meaningful when ok === true. */
  key?: string;
  /** Decoded plan / expiry / device count. Only meaningful when ok === true. */
  payload?: LicensePayload;
  /** Why validation failed. Only set when ok === false. */
  reason?: KeyCheckReason;
  /** User-facing explanation. Only set when ok === false. */
  message?: string;
}

/**
 * Old pre-1.0.40 cloud keys: DTPOS-PRO-XXXX-XXXX-XXXX — a 2-3 letter plan
 * prefix followed by three groups of four.
 *
 * The prefix is deliberately capped at 3 characters: a v1.0.40 key is
 * DTPOS + four groups of four, so allowing a 4-character prefix here would
 * make every new key whose first group happens to be all letters look
 * "legacy" and get rejected before its signature is ever checked.
 */
export function isLegacyKeyFormat(input: string): boolean {
  return /^DTPOS-[A-Z]{2,3}(-[A-Z0-9]{4}){3}$/.test(String(input || '').trim().toUpperCase());
}

/** Validate a typed key entirely offline. */
export async function verifyLicenseKey(input: string): Promise<KeyCheck> {
  const trimmed = String(input || '').trim().toUpperCase();
  if (!trimmed) return { ok: false, reason: 'format', message: 'Enter a license key' };

  const body = trimmed.replace(/^DTPOS[-\s]?/, '').replace(/[^A-Z0-9]/g, '');
  // A v1.0.40 key is always exactly 16 characters of payload + signature.
  // Anything else may still be an old online key, which deserves its own
  // message rather than a bare "invalid".
  if (body.length !== 16) {
    if (isLegacyKeyFormat(trimmed.replace(/\s+/g, '-'))) {
      return {
        ok: false,
        reason: 'legacy',
        message: 'This is an older online license key. Contact Digital Target for an offline activation key.',
      };
    }
    return { ok: false, reason: 'format', message: 'License key is invalid — check the format DTPOS-XXXX-XXXX-XXXX-XXXX' };
  }
  const payloadRaw = fromBase32(body.slice(0, 8));
  const sigRaw = fromBase32(body.slice(8, 16));
  if (payloadRaw === null || sigRaw === null) {
    return { ok: false, reason: 'format', message: 'License key contains characters that are not part of a valid key' };
  }
  const expected = await hmacTruncated(payloadRaw, 40);
  if (expected !== sigRaw) {
    return { ok: false, reason: 'signature', message: 'License key is invalid' };
  }
  const payload = unpackPayload(payloadRaw);
  if (!payload) {
    return { ok: false, reason: 'payload', message: 'License key was issued by a newer version — please update DT POS' };
  }
  const canonical = `${KEY_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
  return { ok: true, key: canonical, payload };
}
