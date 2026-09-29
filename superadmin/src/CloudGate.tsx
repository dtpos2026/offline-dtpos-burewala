// Sign-in screen for the cloud registry. Only Digital Target staff accounts
// created in Firebase Authentication can open the panel.
import { useState } from 'react';
import { adminSignIn, cloudSelfTest, type CloudCheck } from './cloud';
import { ACCENT, INK, INK_2, TEXT, MUTED, LINE, LINE_STRONG, STATUS, RAIL, card, input, label, primaryBtn } from './theme';

export default function CloudGate() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checks, setChecks] = useState<CloudCheck[] | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try { setChecks(await cloudSelfTest()); }
    finally { setTesting(false); }
  };

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await adminSignIn(email, pass); }
    catch (x: any) { setErr(friendly(x?.code || x?.message)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', color: TEXT, padding: 20,
      background: INK,
    }}>
      <form onSubmit={go} style={{ ...card, width: 380, maxWidth: '100%', background: INK_2, border: `1px solid ${LINE}`, boxShadow: 'var(--ui-shadow-card)', padding: 28 }}>
        <img src="./dt-mark.png" alt="Digital Target" width={44} height={44}
             style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 12, background: RAIL, padding: 8 }} />
        <h1 style={{ fontSize: 'var(--ui-text-page)', fontWeight: 700, margin: '16px 0 2px' }}>Super Admin</h1>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 20px' }}>Digital Target staff sign in</p>

        <label style={label}>Email</label>
        <input style={input} type="email" value={email} autoFocus required
               onChange={e => setEmail(e.target.value)} placeholder="admin@digitaltarget.pk" />
        <div style={{ height: 12 }} />
        <label style={label}>Password</label>
        <input style={input} type="password" value={pass} required
               onChange={e => setPass(e.target.value)} placeholder="••••••••" />

        {err && <div role="alert" style={{ marginTop: 12, fontSize: 12.5, color: STATUS.expired.fg }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 18 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" onClick={runTest} disabled={testing}
                style={{ width: '100%', minHeight: 38, marginTop: 10, padding: '8px 12px', borderRadius: 'var(--ui-radius-control)', cursor: 'pointer',
                         border: `1px solid ${LINE_STRONG}`, background: INK_2, color: TEXT, fontSize: 12.5, fontWeight: 600 }}>
          {testing ? 'Checking cloud…' : 'Test cloud connection'}
        </button>

        {checks && (
          <div style={{ marginTop: 12, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
            {checks.map(c => (
              <div key={c.label} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${LINE}`, fontSize: 11.5 }}>
                <span style={{ color: c.ok ? STATUS.active.fg : STATUS.expired.fg, fontWeight: 700 }}>{c.ok ? '✓' : '✕'}</span>
                <span style={{ minWidth: 96, fontWeight: 700 }}>{c.label}</span>
                <span style={{ color: MUTED }}>{c.detail}</span>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: MUTED, marginTop: 16, lineHeight: 1.6 }}>
          Accounts are created in the Firebase console under Authentication.
          <span style={{ color: ACCENT }}> The POS software itself never goes online.</span>
        </p>
      </form>
    </div>
  );
}

function friendly(code: string) {
  if (/user-not-found|invalid-credential|wrong-password/.test(code)) return 'Wrong email or password.';
  if (/too-many-requests/.test(code)) return 'Too many attempts — try again in a minute.';
  if (/network/.test(code)) return 'No internet connection.';
  if (/operation-not-allowed/.test(code)) return 'Enable Email/Password sign-in in the Firebase console.';
  return code || 'Sign-in failed.';
}
