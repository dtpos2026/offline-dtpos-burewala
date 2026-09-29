// Sign-in screen for the cloud registry. Only Digital Target staff accounts
// created in Firebase Authentication can open the panel.
import { useState } from 'react';
import { adminSignIn, cloudSelfTest, type CloudCheck } from './cloud';
import { ACCENT_TEXT, INK, INK_2, TEXT, MUTED, LINE, LINE_STRONG, STATUS, RAIL, RAIL_TEXT, RAIL_MUTED, input, label, primaryBtn } from './theme';
import { KeyRound, Monitor, Receipt } from 'lucide-react';

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
    <div className="sa-gate" style={{ minHeight: '100vh', color: TEXT, background: INK }}>
      {/* Brand panel: what this console is for. Hidden on a narrow window. */}
      <aside className="sa-gate-brand" style={{
        background: RAIL, color: RAIL_TEXT, padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="./dt-mark.png" alt="Digital Target" width={44} height={44}
               style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 12, background: 'hsl(0 0% 100% / 0.10)', padding: 8 }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' }}>DT POS</div>
            <div style={{ fontSize: 12.5, color: RAIL_MUTED }}>Digital Target</div>
          </div>
        </div>
        <div style={{ maxWidth: 460 }}>
          <h2 style={{ color: '#fff', fontSize: 30, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            One console for every restaurant you serve.
          </h2>
          <ul style={{ listStyle: 'none', margin: '28px 0 0', padding: 0, display: 'grid', gap: 16 }}>
            {[
              [KeyRound, 'Licences', 'Issue signed keys that prove themselves — no internet needed at the shop.'],
              [Monitor, 'Devices', 'See every computer that reports in, and activate, suspend or revoke one.'],
              [Receipt, 'Billing', 'Invoices with a QR that lets your client verify them.'],
            ].map(([Icon, title, text]: any) => (
              <li key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'hsl(0 0% 100% / 0.08)', color: '#fff' }}>
                  <Icon size={18} strokeWidth={1.75} aria-hidden />
                </span>
                <span style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  <b style={{ color: '#fff', fontWeight: 600 }}>{title}</b><br />{text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ fontSize: 12, color: RAIL_MUTED }}>The POS software itself never goes online.</div>
      </aside>

      <main style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <form onSubmit={go} style={{ width: 380, maxWidth: '100%' }}>
          <h1 style={{ fontSize: 'var(--ui-text-page)', fontWeight: 700, margin: '0 0 4px' }}>Sign in</h1>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 22px' }}>Digital Target staff only.</p>

          <label style={label} htmlFor="sa-email">Email</label>
          <input id="sa-email" style={input} type="email" value={email} autoFocus required
                 onChange={e => setEmail(e.target.value)} placeholder="admin@digitaltarget.pk" />
          <div style={{ height: 14 }} />
          <label style={label} htmlFor="sa-pass">Password</label>
          <input id="sa-pass" style={input} type="password" value={pass} required
                 onChange={e => setPass(e.target.value)} placeholder="••••••••" />

          {err && <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: STATUS.expired.fg }}>{err}</div>}

          <button type="submit" disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 20, minHeight: 44 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" onClick={runTest} disabled={testing}
                  style={{ width: '100%', minHeight: 40, marginTop: 10, padding: '8px 12px', borderRadius: 'var(--ui-radius-control)', cursor: 'pointer',
                           border: `1px solid ${LINE_STRONG}`, background: INK_2, color: TEXT, fontSize: 12.5, fontWeight: 600 }}>
            {testing ? 'Checking cloud…' : 'Test cloud connection'}
          </button>

          {checks && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, borderRadius: 'var(--ui-radius-control)', overflow: 'hidden', background: INK_2 }}>
              {checks.map(c => (
                <div key={c.label} style={{ display: 'flex', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${LINE}`, fontSize: 12 }}>
                  <span style={{ color: c.ok ? STATUS.active.fg : STATUS.expired.fg, fontWeight: 700 }}>{c.ok ? '✓' : '✕'}</span>
                  <span style={{ minWidth: 96, fontWeight: 600 }}>{c.label}</span>
                  <span style={{ color: MUTED }}>{c.detail}</span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, color: MUTED, marginTop: 18, lineHeight: 1.6 }}>
            Accounts are created in the Firebase console under Authentication.
            <span style={{ color: ACCENT_TEXT }}> The POS software itself never goes online.</span>
          </p>
        </form>
      </main>
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
