// ============================================================
// ACTIVATION RECEIPT — how a device reaches the Super Admin map
// without the POS ever talking to a server.
//
// When a shop activates, the POS produces one short signed string that
// carries who activated, on which machine, and where. The shop sends it
// back (WhatsApp / SMS / phone), and Digital Target pastes it into the
// Super Admin panel: the client is registered and the device appears on
// the map with its exact coordinates.
//
// Signed with the same secret as the license key, so a receipt cannot be
// invented or edited — a tampered one is rejected on paste.
//
//   DTR1.<base64url payload>.<8-char signature>
// ============================================================
import { LICENSE_SECRET, type LicensePlan } from './licenseKey';

export const RECEIPT_PREFIX = 'DTR1';

export interface ActivationReceipt {
  /** License key the device was activated with. */
  key: string;
  /** Hardware ID — the machine this license is bound to. */
  device: string;
  /** Business name as typed on the activation screen. */
  business: string;
  /** Owner name. */
  owner: string;
  /** Mobile number. */
  phone: string;
  plan: LicensePlan;
  /** Epoch millis of activation. */
  at: number;
  /** Latitude / longitude, when the shop allowed location. */
  lat?: number;
  lng?: number;
  /** App version that performed the activation. */
  ver?: string;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LICENSE_SECRET).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload).buffer as ArrayBuffer),
  );
  // 6 bytes -> 8 base64url characters: short enough to read over the phone,
  // long enough that guessing one is not worth anybody's time.
  let bin = '';
  for (let i = 0; i < 6; i++) bin += String.fromCharCode(mac[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build the string the shop sends back to Digital Target. */
export async function encodeReceipt(r: ActivationReceipt): Promise<string> {
  // Short keys keep the string WhatsApp-friendly.
  const compact = {
    k: r.key, d: r.device, b: r.business, o: r.owner, p: r.phone,
    pl: r.plan, t: Math.round(r.at / 1000),
    ...(typeof r.lat === 'number' ? { la: Number(r.lat.toFixed(6)) } : {}),
    ...(typeof r.lng === 'number' ? { ln: Number(r.lng.toFixed(6)) } : {}),
    ...(r.ver ? { v: r.ver } : {}),
  };
  const payload = b64urlEncode(JSON.stringify(compact));
  return `${RECEIPT_PREFIX}.${payload}.${await sign(payload)}`;
}

export interface ReceiptCheck {
  ok: boolean;
  receipt?: ActivationReceipt;
  message?: string;
}

/** Validate and read a receipt pasted into the Super Admin panel. */
export async function decodeReceipt(input: string): Promise<ReceiptCheck> {
  const raw = String(input || '').trim().replace(/\s+/g, '');
  if (!raw) return { ok: false, message: 'Paste the activation code the shop sent you' };
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== RECEIPT_PREFIX) {
    return { ok: false, message: 'That does not look like a DT POS activation code' };
  }
  const [, payload, sig] = parts;
  if ((await sign(payload)) !== sig) {
    return { ok: false, message: 'This activation code has been altered — ask the shop to resend it' };
  }
  try {
    const c = JSON.parse(b64urlDecode(payload));
    return {
      ok: true,
      receipt: {
        key: c.k, device: c.d, business: c.b, owner: c.o, phone: c.p,
        plan: c.pl, at: (c.t || 0) * 1000,
        lat: typeof c.la === 'number' ? c.la : undefined,
        lng: typeof c.ln === 'number' ? c.ln : undefined,
        ver: c.v,
      },
    };
  } catch {
    return { ok: false, message: 'This activation code is damaged — ask the shop to resend it' };
  }
}
