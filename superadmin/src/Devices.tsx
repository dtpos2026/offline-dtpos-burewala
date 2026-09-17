// ============================================================
// DEVICES — live installation monitoring.
//
// Every POS that reaches the internet writes one document to `devices`.
// This tab lists them, opens a detail view, and publishes the authoritative
// licence status the POS reads back on its next verification.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { watchDevices, setLicenseStatus, setDeviceStatus, removeDevice, type DeviceDoc } from './cloud';
import { BRAND, ACCENT, MUTED, INK_2 as CARD, LINE as BORDER } from './theme';

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : '—');

export default function Devices() {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<DeviceDoc | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => watchDevices(setDevices, e => setErr(e.message)), []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = [...devices].sort((a, b) => (b.lastSyncAt || 0) - (a.lastSyncAt || 0));
    if (!s) return list;
    return list.filter(d =>
      [d.business, d.owner, d.phone, d.deviceId, d.licenseKey, d.city, d.country]
        .some(v => (v || '').toLowerCase().includes(s)));
  }, [devices, q]);

  const [note, setNote] = useState('');

  async function change(d: DeviceDoc, status: 'active' | 'suspended' | 'revoked') {
    setBusy(d.deviceId);
    setErr('');
    try {
      // Dono jagah likhte hain: licence key par (saare devices) aur is device par.
      if (d.licenseKey) await setLicenseStatus(d.licenseKey, status);
      await setDeviceStatus(d.deviceId, status);
      setNote(`${d.business || d.deviceId.slice(0, 8)} → ${status.toUpperCase()} (POS par 1 minute ke andar lagta hai, internet on hona chahiye)`);
      setTimeout(() => setNote(''), 6000);
    }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  }

  async function remove(d: DeviceDoc) {
    const label = d.business || d.deviceId.slice(0, 12);
    if (!window.confirm(`Delete device “${label}”?\n\nThis installation will be revoked and removed from the list.`)) return;
    setBusy(d.deviceId);
    setErr('');
    try {
      await removeDevice(d.deviceId);
      setOpen(null);
      setNote(`${label} deleted and blocked from reporting again.`);
      setTimeout(() => setNote(''), 6000);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: MUTED, fontWeight: 800, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderTop: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: BRAND, fontSize: 16, fontWeight: 800 }}>Devices &amp; Installations</h2>
        <span style={{ fontSize: 12, color: MUTED }}>{devices.length} reporting</span>
        <input
          placeholder="Search shop, device, city…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ marginLeft: 'auto', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, minWidth: 220 }}
        />
      </div>

      {err && <p style={{ color: '#b91c1c', fontSize: 12 }}>{err}</p>}
      {note && <p style={{ color: '#166534', fontSize: 12, fontWeight: 700 }}>{note}</p>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Restaurant', 'Device', 'Manufacturer', 'Model', 'Windows', 'App', 'Approx. Location', 'Last Login', 'Logins', 'Last Sync', 'Status', 'Actions']
                .map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.deviceId}>
                <td style={td}>
                  <button onClick={() => setOpen(d)} style={{ background: 'none', border: 0, color: ACCENT, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    {d.business || '—'}
                  </button>
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{d.deviceId.slice(0, 18)}…</td>
                <td style={td}>{d.manufacturer || '—'}</td>
                <td style={td}>{d.model || '—'}</td>
                <td style={td}>{d.osName || d.osVersion || '—'}</td>
                <td style={td}>{d.appVersion || '—'}</td>
                <td style={td}>
                  {[d.city, d.region, d.country].filter(Boolean).join(', ') || 'Waiting for first online sync'}
                  {!!(d.latitude && d.longitude) && (
                    <a
                      href={`https://www.google.com/maps?q=${d.latitude},${d.longitude}`}
                      target="_blank" rel="noreferrer"
                      style={{ marginLeft: 6, color: ACCENT, fontWeight: 700, fontSize: 11 }}
                    >map</a>
                  )}
                </td>
                <td style={td}>{fmt(d.lastLoginAt)}</td>
                <td style={td}>{d.loginCount || 0}</td>
                <td style={td}>{fmt(d.lastSyncAt)}</td>
                <td style={td}>{d.licenseStatus || 'unknown'}</td>
                <td style={td}>
                  <button disabled={busy === d.deviceId} onClick={() => change(d, 'active')} style={btn('#16a34a')}>Activate</button>
                  <button disabled={busy === d.deviceId} onClick={() => change(d, 'suspended')} style={btn('#d97706')}>Suspend</button>
                  <button disabled={busy === d.deviceId} onClick={() => change(d, 'revoked')} style={btn('#b91c1c')}>Revoke</button>
                  <button disabled={busy === d.deviceId} onClick={() => remove(d)} style={btn('#7f1d1d')}>Delete</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td style={{ ...td, color: MUTED }} colSpan={12}>No device has reported yet. A POS appears here the first time it goes online.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <Detail d={open} onClose={() => setOpen(null)} onDelete={() => remove(open)} busy={busy === open.deviceId} />}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return { marginRight: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, color, background: '#fff', border: `1px solid ${color}33`, borderRadius: 6, cursor: 'pointer' };
}

function Detail({ d, onClose, onDelete, busy }: { d: DeviceDoc; onClose: () => void; onDelete: () => void; busy: boolean }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 12.5 }}>
      <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 600 }}>{v || '—'}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ margin: '0 0 6px', color: BRAND, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</h4>
      {children}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: 14, padding: 20, width: 'min(560px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0, color: BRAND }}>{d.business || 'Installation'}</h3>
        <Section title="Installation">
          <Row k="Installation ID" v={d.deviceId} />
          <Row k="License" v={d.licenseKey || ''} />
          <Row k="Installed" v={fmt(d.installedAt)} />
          <Row k="App version" v={d.appVersion || ''} />
        </Section>
        <Section title="Hardware">
          <Row k="Manufacturer" v={d.manufacturer || ''} />
          <Row k="Model" v={d.model || ''} />
          <Row k="Windows" v={[d.osName, d.osVersion].filter(Boolean).join(' · ')} />
          <Row k="Computer name" v={d.hostname || ''} />
        </Section>
        <Section title="Activity">
          <Row k="First login" v={fmt(d.firstLoginAt)} />
          <Row k="Last login" v={fmt(d.lastLoginAt)} />
          <Row k="Login count" v={String(d.loginCount || 0)} />
          <Row k="Last sync" v={fmt(d.lastSyncAt)} />
        </Section>
        <Section title="Location (approximate)">
          <Row k="Country" v={d.country || ''} />
          <Row k="Province / State" v={d.region || ''} />
          <Row k="City" v={d.city || ''} />
          <Row k="Updated" v={fmt(d.locationUpdatedAt)} />
          <Row k="Source" v={d.locationSource === 'device' ? 'Device location' : 'Network estimate'} />
          <Row k="Accuracy" v={d.locationAccuracyM ? `±${Math.round(d.locationAccuracyM)} m` : ''} />
        </Section>
        <Section title="License">
          <Row k="Status" v={d.licenseStatus || 'unknown'} />
          <Row k="Plan" v={d.plan || ''} />
          <Row k="Expiry" v={d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : 'lifetime'} />
          <Row k="Last verification" v={fmt(d.lastVerifyAt)} />
        </Section>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: BRAND, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
          <button disabled={busy} onClick={onDelete} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Delete Device</button>
        </div>
      </div>
    </div>
  );
}
