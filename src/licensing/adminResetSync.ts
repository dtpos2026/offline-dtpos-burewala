// ============================================================
// ADMIN PASSWORD RESET — the POS half.
//
// Super Admin seals a new administrator password (adminReset.ts) and stores
// it at adminResets/{licence}. This computer picks it up on its next online
// check, opens it with its own licence key, writes the password to the local
// administrator account and remembers the command ID so it is applied once.
// The same code can also be pasted on the sign-in screen when this PC never
// goes online.
//
// Best effort and silent: nothing here can block billing, sign-in or the
// licence check, and a failed fetch changes nothing.
// ============================================================
import { fetchDocString, getAdminResetLog, saveAdminResetLog } from '@/lib/cloudLink';
import { applyAdminPasswordReset, type AdminResetOutcome } from '@/lib/store';
import { openReset } from './adminReset';
import { loadLicense } from './licenseService';

export type ResetResult =
  | { status: 'applied'; outcome: 'applied' | 'reactivated'; username: string }
  /** Opened fine, but the account could not be reset (unknown user / not an administrator). */
  | { status: 'rejected'; outcome: Extract<AdminResetOutcome, 'not-found' | 'not-admin'> }
  /** Nothing waiting for this computer. */
  | { status: 'none' }
  /** This command was applied here before. */
  | { status: 'already' }
  /** The server could not be reached. */
  | { status: 'offline' }
  | { status: 'invalid'; reason: 'format' | 'wrong-licence' | 'expired' | 'no-licence' };

/** Plain-English line for the sign-in screen. */
export function describeReset(r: ResetResult): { ok: boolean; text: string } {
  switch (r.status) {
    case 'applied':
      return { ok: true, text: `The administrator password was reset. Sign in as "${r.username}" with the new password.` };
    case 'rejected':
      return { ok: false, text: r.outcome === 'not-found'
        ? 'That reset names a user that does not exist on this computer. Ask Digital Target to send it again.'
        : 'That reset names a user who is not an administrator. Ask Digital Target to send it again.' };
    case 'none': return { ok: false, text: 'No password reset is waiting for this computer.' };
    case 'already': return { ok: false, text: 'That password reset was already applied on this computer.' };
    case 'offline': return { ok: false, text: 'Could not reach Digital Target. Check the internet connection and try again.' };
    case 'invalid':
      return { ok: false, text: r.reason === 'expired'
        ? 'This reset code has expired. Ask Digital Target for a new one.'
        : r.reason === 'wrong-licence'
          ? 'This reset code is not valid for this restaurant. Check that it was copied completely.'
          : r.reason === 'no-licence'
            ? 'This computer is not activated yet.'
            : 'That does not look like a password reset code.' };
  }
}

/** Open one sealed command and, if it is new, apply it. */
export async function applyResetToken(token: string, licenseKey: string): Promise<ResetResult> {
  const opened = await openReset(token, licenseKey);
  if (opened.ok === false) return { status: 'invalid', reason: opened.reason };
  const { command } = opened;
  const log = getAdminResetLog();
  if (log.applied.includes(command.id)) return { status: 'already' };

  const r = applyAdminPasswordReset({ username: command.username, password: command.password });
  // Remembered whatever the outcome: a command naming a wrong user is not retried
  // every ten minutes; Super Admin sees the result and sends a corrected one.
  saveAdminResetLog({
    applied: [...log.applied, command.id],
    last: { id: command.id, at: Date.now(), result: r.outcome },
  });
  try { window.dispatchEvent(new CustomEvent('dtpos-admin-reset', { detail: { outcome: r.outcome } })); } catch { /* non-browser */ }
  if (r.outcome === 'not-found' || r.outcome === 'not-admin') return { status: 'rejected', outcome: r.outcome };
  return { status: 'applied', outcome: r.outcome, username: r.username || 'admin' };
}

const AUTO_EVERY_MS = 10 * 60_000;
let lastCheck = 0;
let inflight: Promise<ResetResult> | null = null;

/**
 * Look for a command waiting for this licence. Automatic callers are
 * throttled to once per ten minutes; the sign-in screen, where someone is
 * waiting for a reset, asks for every minute (`minIntervalMs`), and its
 * "Check now" and a returning connection pass `force`.
 */
export function syncAdminReset(opts: { force?: boolean; minIntervalMs?: number } = {}): Promise<ResetResult> {
  if (inflight) return inflight;
  if (!opts.force && Date.now() - lastCheck < (opts.minIntervalMs ?? AUTO_EVERY_MS)) return Promise.resolve({ status: 'none' });
  lastCheck = Date.now();
  inflight = check().finally(() => { inflight = null; });
  return inflight;
}

async function check(): Promise<ResetResult> {
  const lic = await loadLicense();
  if (!lic?.licenseKey) return { status: 'invalid', reason: 'no-licence' };
  const got = await fetchDocString('adminResets', lic.licenseKey, 'token');
  if (!got.reachable) return { status: 'offline' };
  if (!got.value) return { status: 'none' };
  return applyResetToken(got.value, lic.licenseKey);
}

/** Test hook: forget the throttle. */
export function _resetAdminResetThrottle(): void { lastCheck = 0; inflight = null; }
