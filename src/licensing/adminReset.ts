// ============================================================
// ADMIN PASSWORD RESET — the sealed command Super Admin sends to a shop.
//
// The administrator password of an offline POS cannot be recovered by anyone
// at the shop. Digital Target types a new one in the Super Admin panel; this
// module seals it into one short code that
//
//   • is stored in Firestore (adminResets/{licence}) and picked up by the POS
//     on its next online check — nothing to type at the shop, or
//   • can be read out / pasted at the sign-in screen when the PC never goes
//     online.
//
//   DTP1.<base64url: salt(16) | iv(12) | AES-256-GCM ciphertext>
//
// The password is never stored or sent in the clear. The AES key is derived
// (PBKDF2) from the licence key plus the app secret, and the licence key is
// bound in as authenticated data, so a code made for one restaurant cannot be
// opened — or altered — for another. Used by BOTH apps (the panel imports it
// through the @pos alias), so the format can never drift.
// ============================================================
import { LICENSE_SECRET, normalizeKey } from './licenseKey';

export const RESET_PREFIX = 'DTP1';
/** How long a code stays usable after it was issued. */
export const RESET_TTL_MS = 7 * 24 * 3600_000;
export const RESET_MIN_PASSWORD = 6;
export const RESET_MAX_PASSWORD = 64;

export interface ResetCommand {
  /** Random ID — a command is applied once per computer. */
  id: string;
  /** Account to reset. Empty = the restaurant's main administrator. */
  username: string;
  password: string;
  issuedAt: number;
  expiresAt: number;
}

export type ResetOpenResult =
  | { ok: true; command: ResetCommand }
  | { ok: false; reason: 'format' | 'wrong-licence' | 'expired' };

/** Why a password cannot be used, or '' when it can. */
export function passwordProblem(password: string): string {
  if (password !== password.trim()) return 'The password cannot start or end with a space.';
  if (password.length < RESET_MIN_PASSWORD) return `Use at least ${RESET_MIN_PASSWORD} characters.`;
  if (password.length > RESET_MAX_PASSWORD) return `Use at most ${RESET_MAX_PASSWORD} characters.`;
  return '';
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64u(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

async function deriveKey(licenseKey: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', buf(enc.encode(`${LICENSE_SECRET}|${normalizeKey(licenseKey)}`)), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: 100_000 },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

const aad = (licenseKey: string) => buf(enc.encode(`${RESET_PREFIX}|${normalizeKey(licenseKey)}`));

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Seal a new administrator password for one licence. */
export async function sealReset(
  licenseKey: string,
  input: { username?: string; password: string },
  now = Date.now(),
): Promise<{ token: string; command: ResetCommand }> {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const command: ResetCommand = {
    id: randomId(),
    username: (input.username || '').trim(),
    password: input.password,
    issuedAt: now,
    expiresAt: now + RESET_TTL_MS,
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(licenseKey, salt);
  const plain = JSON.stringify({ i: command.id, u: command.username, p: command.password, t: command.issuedAt, x: command.expiresAt });
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: aad(licenseKey) }, key, buf(enc.encode(plain))));
  const out = new Uint8Array(salt.length + iv.length + ct.length);
  out.set(salt, 0); out.set(iv, salt.length); out.set(ct, salt.length + iv.length);
  return { token: `${RESET_PREFIX}.${toB64u(out)}`, command };
}

/** Open a sealed code on a computer holding `licenseKey`. */
export async function openReset(token: string, licenseKey: string, now = Date.now()): Promise<ResetOpenResult> {
  const raw = String(token || '').trim().replace(/\s+/g, '');
  const parts = raw.split('.');
  if (parts.length !== 2 || parts[0] !== RESET_PREFIX || !parts[1]) return { ok: false, reason: 'format' };
  let bytes: Uint8Array;
  try { bytes = fromB64u(parts[1]); } catch { return { ok: false, reason: 'format' }; }
  if (bytes.length < 16 + 12 + 16 + 1) return { ok: false, reason: 'format' };
  const salt = bytes.slice(0, 16);
  const iv = bytes.slice(16, 28);
  const ct = bytes.slice(28);
  let c: { i?: unknown; u?: unknown; p?: unknown; t?: unknown; x?: unknown };
  try {
    const key = await deriveKey(licenseKey, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: aad(licenseKey) }, key, buf(ct));
    c = JSON.parse(dec.decode(plain));
  } catch {
    // Wrong licence key and tampering both fail authentication.
    return { ok: false, reason: 'wrong-licence' };
  }
  if (typeof c.i !== 'string' || typeof c.p !== 'string' || typeof c.x !== 'number') return { ok: false, reason: 'format' };
  const command: ResetCommand = {
    id: c.i,
    username: typeof c.u === 'string' ? c.u : '',
    password: c.p,
    issuedAt: typeof c.t === 'number' ? c.t : 0,
    expiresAt: c.x,
  };
  if (now > command.expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true, command };
}
