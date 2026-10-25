// ============================================================
// RESET ADMINISTRATOR PASSWORD — for one restaurant.
//
// The shop's POS is offline, so a forgotten administrator password has no
// remedy at the shop. Here Digital Target types a new one; it is sealed for
// that licence (licensing/adminReset.ts) and stored at adminResets/{licence}.
// Each computer on the licence applies it on its next online check and
// reports back, which this dialog shows per computer. A computer that never
// goes online can be given the same sealed code to paste on its sign-in screen.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { passwordProblem, RESET_MAX_PASSWORD } from '@pos/licensing/adminReset';
import type { Client } from './registry';
import {
  watchAdminReset, watchDevices, sendAdminReset, clearAdminReset, type PendingReset, type DeviceDoc,
} from './cloud';
import { resetProgress, RESET_MIN_POS_VERSION } from './deviceState';
import { Modal, ModalHeader, CopyButton, useConfirm, useToast } from './ui';
import { STATUS, MUTED, LINE, TINT, TEXT, STRONG, input, label, primaryBtn, ghostBtn } from './theme';

/** Easy to read out over the phone: no 0/O, 1/l/I. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

const STATE_TONE = {
  applied: STATUS.active, failed: STATUS.expired, waiting: STATUS.suspended, 'old-version': STATUS.expired,
} as const;

export default function AdminReset({ client, onClose }: { client: Client; onClose: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingReset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  // The password just sent, kept on screen only so it can be read out to the owner.
  const [sent, setSent] = useState('');

  useEffect(() => watchAdminReset(client.key, p => { setPending(p); setLoaded(true); },
    e => { setLoaded(true); setError(`Could not read the pending reset — ${e.message}`); }), [client.key]);
  useEffect(() => watchDevices(setDevices), []);

  const rows = useMemo(() => (pending ? resetProgress(devices, client.key, pending.id) : []), [devices, client.key, pending]);
  const expired = !!pending && pending.expiresAt < Date.now();
  const problem = password ? passwordProblem(password) : '';

  const send = async () => {
    const bad = passwordProblem(password);
    if (bad) { setError(bad); return; }
    const who = username.trim() || 'the main administrator';
    const yes = await confirm({
      title: `Reset the administrator password of ${client.business || client.key}?`,
      body: `The password of ${who} will be replaced by the one you typed. Every computer on this licence applies it the next time it is online, `
        + 'and the old password stops working. The shop keeps all its data — only the password changes.',
      confirmLabel: 'Send reset',
      danger: true,
    });
    if (!yes) return;
    setBusy(true); setError('');
    try {
      await sendAdminReset(client.key, { username, password });
      setSent(password);
      setPassword('');
      toast('Reset sent. The shop\'s computer applies it when it is online.', 'success');
    } catch (e) {
      const msg = (e as { code?: string; message?: string });
      setError(msg.code === 'permission-denied'
        ? 'The server refused the write. Publish the latest superadmin/firestore.rules in Firebase Console (the adminResets rule is new), then try again.'
        : `Not sent — ${msg.message || 'unknown error'}`);
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    const yes = await confirm({
      title: 'Cancel the pending reset?',
      body: 'Computers that have not applied it yet will keep their current password. Computers that already applied it keep the new one.',
      confirmLabel: 'Cancel reset',
      danger: true,
    });
    if (!yes) return;
    try { await clearAdminReset(client.key); setSent(''); toast('Pending reset removed.', 'success'); }
    catch (e) { setError(`Not removed — ${(e as Error).message}`); }
  };

  const tone = (s: keyof typeof STATE_TONE) => STATE_TONE[s];

  return (
    <Modal onClose={onClose} width={620} label="Reset administrator password">
      <ModalHeader
        title="Reset administrator password"
        sub={<>{client.business || client.owner} · <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{client.key}</span></>}
        onClose={onClose}
      />

      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, margin: '0 0 14px' }}>
        Use this when the restaurant has forgotten its administrator password. Type the new password: it is sent to this
        licence and <b style={{ color: STRONG }}>every computer applies it by itself</b> the next time it is online — nothing
        is typed at the shop. All the shop's data stays as it is. Computers need POS v{RESET_MIN_POS_VERSION} or newer.
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <div>
          <label style={label} htmlFor="ar-user">Administrator username <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span></label>
          <input id="ar-user" style={input} value={username} placeholder="Leave empty for the main administrator"
                 autoComplete="off" onChange={e => setUsername(e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="ar-pass">New password</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input id="ar-pass" style={input} type={show ? 'text' : 'password'} value={password} maxLength={RESET_MAX_PASSWORD}
                   autoComplete="new-password" onChange={e => { setPassword(e.target.value); setError(''); }}
                   onKeyDown={e => { if (e.key === 'Enter' && password && !problem && !busy) void send(); }} />
            <button type="button" style={{ ...ghostBtn, marginTop: 6, minHeight: 40 }} onClick={() => setShow(v => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={ghostBtn} onClick={() => { setPassword(generatePassword()); setShow(true); setError(''); }}>Generate a password</button>
        {problem && <span role="alert" style={{ fontSize: 12.5, color: STATUS.expired.fg }}>{problem}</span>}
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, fontWeight: 600, marginTop: 14, padding: '10px 14px', borderRadius: 'var(--ui-radius-control)',
                                 color: STATUS.expired.fg, background: STATUS.expired.bg, border: `1px solid ${STATUS.expired.bd}` }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={primaryBtn} disabled={busy || !password || !!problem} onClick={() => { void send(); }}>
          {busy ? 'Sending…' : 'Send reset to this restaurant'}
        </button>
        <button type="button" style={{ ...ghostBtn, marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>

      {loaded && pending && (
        <section aria-label="Pending reset" style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, color: STRONG }}>{expired ? 'Last reset (expired)' : 'Reset waiting on the server'}</h3>
            <span style={{ fontSize: 12, color: MUTED }}>
              sent {new Date(pending.issuedAt).toLocaleString()}{pending.username ? ` · for "${pending.username}"` : ''}
              {' · '}{expired ? 'expired' : `valid until ${new Date(pending.expiresAt).toLocaleDateString()}`}
            </span>
          </div>

          {sent && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 'var(--ui-radius-control)', background: STATUS.active.bg, border: `1px solid ${STATUS.active.bd}` }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>The new password — tell it to the owner (shown only now):</div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 15, color: TEXT }}>{sent}</span>
                <CopyButton text={sent} label="Copy" compact />
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {rows.length === 0 && (
              <span style={{ fontSize: 12.5, color: MUTED }}>
                No computer has reported under this licence yet. It will apply the reset the first time it goes online.
              </span>
            )}
            {rows.map(r => (
              <div key={r.deviceId} style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, textTransform: 'uppercase',
                  color: tone(r.state).fg, background: tone(r.state).bg, border: `1px solid ${tone(r.state).bd}`,
                }}>{r.state === 'old-version' ? 'needs update' : r.state}</span>
                <b style={{ color: STRONG }}>{r.label}</b>
                <span style={{ color: MUTED }}>{r.text}{r.at ? ` (${new Date(r.at).toLocaleString()})` : ''}</span>
              </div>
            ))}
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: STRONG }}>A computer that never goes online? Give it the reset code</summary>
            <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.65, margin: '8px 0' }}>
              On the sign-in screen: <b>Forgot password?</b> → paste this code → <b>Apply reset code</b>. It works only on
              this restaurant's licence and until the date above.
            </p>
            <div style={{ padding: 10, borderRadius: 'var(--ui-radius-control)', background: TINT, border: `1px solid ${LINE}`,
                          fontFamily: 'var(--ui-font-mono)', fontSize: 11.5, wordBreak: 'break-all', lineHeight: 1.6 }}>{pending.token}</div>
            <div style={{ marginTop: 8 }}><CopyButton text={pending.token} label="Copy reset code" /></div>
          </details>

          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.65, margin: '14px 0 0' }}>
            When every computer shows <b>applied</b>, remove the reset so it is not kept on the server.
          </p>
          <div style={{ marginTop: 8 }}>
            <button type="button" style={ghostBtn} onClick={() => { void cancel(); }}>{expired ? 'Remove it' : 'Cancel / remove the pending reset'}</button>
          </div>
        </section>
      )}
    </Modal>
  );
}
