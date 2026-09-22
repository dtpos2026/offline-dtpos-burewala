// ============================================================
// DEVICES — live installation monitoring and per-computer control.
//
// Three sources are shown side by side and never mixed up:
//   • Reported  — what the POS last sent (heartbeat every 5 minutes while open)
//   • Device    — what Super Admin decided for this one computer
//   • Licence   — what Super Admin decided for every computer on the key
//
// Actions here change ONE computer. Licence-wide Suspend / Revoke / Pending
// lives on the Clients tab.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import {
  watchDevices, watchDeviceStatuses, watchLicenseStatuses, watchLedgers,
  setDeviceStatus, removeDevice, clearDeviceRemoval, docIdFor,
  type DeviceDoc, type StatusDoc,
} from './cloud';
import { isOnline, lastSeenLabel, locationLabel, serverDecision, ONLINE_WINDOW_MS } from './deviceState';
import { BRAND, ACCENT, MUTED, INK_2 as CARD, LINE as BORDER } from './theme';

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleString() : '—');

const TONE: Record<string, string> = {
  active: '#15803d', suspended: '#b45309', revoked: '#b91c1c', deleted: '#7f1d1d', pending: '#7c3aed',
  'device-limit': '#b91c1c', unknown: '#64748b',
};

type Filter = 'all' | 'online' | 'offline' | 'blocked';

export default function Devices() {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [deviceStatus, setDeviceStatusMap] = useState<Map<string, StatusDoc>>(new Map());
  const [licenceStatus, setLicenceStatusMap] = useState<Map<string, StatusDoc>>(new Map());
  const [ledgers, setLedgers] = useState<Map<string, string[]>>(new Map());
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<DeviceDoc | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  // Re-render once a minute so "online" and "last seen" age honestly.
  const [now, setNow] = useState(Date.now());

  useEffect(() => watchDevices(setDevices, e => setErr(e.message)), []);
  useEffect(() => watchDeviceStatuses(setDeviceStatusMap, e => setErr(e.message)), []);
  useEffect(() => watchLicenseStatuses(setLicenceStatusMap, e => setErr(e.message)), []);
  // The ledger collection needs the v1.12 rules; without them the rest still works.
  useEffect(() => watchLedgers(setLedgers, () => setLedgers(new Map())), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const decisionFor = (d: DeviceDoc) => serverDecision(
    deviceStatus.get(docIdFor(d.deviceId)),
    d.licenseKey ? licenceStatus.get(docIdFor(d.licenseKey)) : undefined,
    d,
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...devices]
      .sort((a, b) => (b.lastSyncAt || 0) - (a.lastSyncAt || 0))
      .filter(d => {
        if (filter === 'online' && !isOnline(d, now)) return false;
        if (filter === 'offline' && isOnline(d, now)) return false;
        if (filter === 'blocked' && decisionFor(d).status === 'active') return false;
        if (!s) return true;
        return [d.business, d.owner, d.phone, d.deviceId, d.licenseKey, d.city, d.country, d.hostname]
          .some(v => (v || '').toLowerCase().includes(s));
      });
  }, [devices, q, filter, now, deviceStatus, licenceStatus]);

  const onlineNow = devices.filter(d => isOnline(d, now));
  const blocked = devices.filter(d => decisionFor(d).status !== 'active');
  const removed = [...deviceStatus.values()].filter(s => s.status === 'deleted');

  const flash = (text: string) => { setNote(text); setTimeout(() => setNote(''), 8000); };

  async function change(d: DeviceDoc, status: 'active' | 'suspended' | 'revoked') {
    const label = d.business || d.deviceId.slice(0, 12);
    const what = status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : 'revoke';
    const detail = status === 'revoked'
      ? 'The computer is blocked until you activate it again here. Re-entering the key on that computer does not lift a revoke.'
      : status === 'suspended'
        ? 'The computer is blocked until you activate it again. Other computers on this licence keep working.'
        : 'Lifts a suspend or revoke on this computer. A licence-wide status (Clients tab) still applies.';
    if (!window.confirm(`${what[0].toUpperCase() + what.slice(1)} “${label}”?\n\n${detail}`)) return;
    setBusy(d.deviceId);
    setErr('');
    try {
      await setDeviceStatus(d.deviceId, status);
      flash(`${label}: saved as ${status.toUpperCase()} on the server. The POS applies it at its next check — about a minute when it is online${isOnline(d, now) ? '' : ' (this computer is offline right now, so it applies when it reconnects)'}.`);
    } catch (e) { setErr(`Not saved: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }

  async function remove(d: DeviceDoc) {
    const label = d.business || d.deviceId.slice(0, 12);
    if (!window.confirm(
      `Delete device “${label}”?\n\n`
      + '• Its device slot is freed for another computer.\n'
      + '• That computer is blocked and asked to enter the licence key again.\n'
      + '• Other computers on this licence are not affected.\n\n'
      + 'To block the computer permanently, use Revoke instead.',
    )) return;
    setBusy(d.deviceId);
    setErr('');
    try {
      await removeDevice(d.deviceId, d.licenseKey);
      setOpen(null);
      flash(`${label} deleted on the server and its slot freed.`);
    } catch (e) { setErr(`Not deleted: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }

  async function allowAgain(s: StatusDoc) {
    if (!window.confirm('Clear this removal record?\n\nThe computer can report again without re-entering the key. It still needs a free device slot.')) return;
    setBusy(s.id);
    try { await clearDeviceRemoval(s.deviceId || s.id); flash('Removal record cleared.'); }
    catch (e) { setErr(`Not cleared: ${(e as Error).message}`); }
    finally { setBusy(''); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: MUTED, fontWeight: 800, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderTop: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Stat label="Registered" value={devices.length} tone={BRAND} />
        <Stat label="Online now" value={onlineNow.length} tone="#15803d" hint={`Reported in the last ${ONLINE_WINDOW_MS / 60000} min`} />
        <Stat label="Offline" value={devices.length - onlineNow.length} tone="#64748b" />
        <Stat label="Blocked" value={blocked.length} tone="#b91c1c" />
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
        <h2 style={{ margin: '0 0 8px', color: BRAND, fontSize: 15, fontWeight: 800 }}>Active devices (online now)</h2>
        {onlineNow.length === 0
          ? <p style={{ margin: 0, fontSize: 12, color: MUTED }}>No computer has reported in the last {ONLINE_WINDOW_MS / 60000} minutes.</p>
          : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {onlineNow.map(d => (
                <button key={d.deviceId} onClick={() => setOpen(d)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, border: `1px solid ${BORDER}`, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  <Dot on /> <b>{d.business || d.deviceId.slice(0, 10)}</b>
                  <span style={{ color: MUTED }}>{d.hostname || ''} · {lastSeenLabel(d.lastSyncAt, now)}</span>
                </button>
              ))}
            </div>
          )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: BRAND, fontSize: 16, fontWeight: 800 }}>Devices &amp; Installations</h2>
          {(['all', 'online', 'offline', 'blocked'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${filter === f ? ACCENT : BORDER}`, background: filter === f ? ACCENT : '#fff', color: filter === f ? '#fff' : MUTED,
            }}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
          <input
            placeholder="Search shop, device, city…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ marginLeft: 'auto', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, minWidth: 220 }}
          />
        </div>

        {err && <p role="alert" style={{ color: '#b91c1c', fontSize: 12, fontWeight: 700 }}>{err}</p>}
        {note && <p role="status" style={{ color: '#166534', fontSize: 12, fontWeight: 700 }}>{note}</p>}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Restaurant', 'Device', 'Connection', 'Server decision', 'POS reports', 'Slots', 'App', 'Location', 'Actions']
                  .map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(d => {
                const on = isOnline(d, now);
                const dec = decisionFor(d);
                const slots = d.licenseKey ? ledgers.get(docIdFor(d.licenseKey)) : undefined;
                return (
                  <tr key={d.deviceId}>
                    <td style={td}>
                      <button onClick={() => setOpen(d)} style={{ background: 'none', border: 0, color: ACCENT, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        {d.business || '—'}
                      </button>
                      <div style={{ fontSize: 11, color: MUTED }}>{d.hostname || ''}</div>
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }} title={d.deviceId}>{d.deviceId.slice(0, 18)}…</td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: on ? '#15803d' : '#64748b' }}>
                        <Dot on={on} /> {on ? 'Online' : 'Offline'}
                      </span>
                      <div style={{ fontSize: 11, color: MUTED }}>Last seen {lastSeenLabel(d.lastSyncAt, now)}</div>
                    </td>
                    <td style={td}>
                      <Badge status={dec.status} />
                      {dec.scope !== 'none' && <div style={{ fontSize: 10.5, color: MUTED }}>{dec.scope === 'licence' ? 'whole licence' : 'this computer'}</div>}
                    </td>
                    <td style={td}><Badge status={d.licenseStatus || 'unknown'} /></td>
                    <td style={td}>{slots ? `${slots.length} used${slots.includes(d.deviceId) ? '' : ' · not in list'}` : '—'}</td>
                    <td style={td}>{d.appVersion || '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', minWidth: 180, fontSize: 12 }}>{locationLabel(d)}</td>
                    <td style={td}>
                      <button disabled={busy === d.deviceId} onClick={() => change(d, 'active')} style={btn('#16a34a')}>Activate</button>
                      <button disabled={busy === d.deviceId} onClick={() => change(d, 'suspended')} style={btn('#d97706')}>Suspend</button>
                      <button disabled={busy === d.deviceId} onClick={() => change(d, 'revoked')} style={btn('#b91c1c')}>Revoke</button>
                      <button disabled={busy === d.deviceId} onClick={() => remove(d)} style={btn('#7f1d1d')}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td style={{ ...td, color: MUTED }} colSpan={9}>{devices.length ? 'No device matches this filter.' : 'No device has reported yet. A POS appears here the first time it goes online.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: MUTED, marginTop: 12, lineHeight: 1.7 }}>
          <b>Server decision</b> is what you set; <b>POS reports</b> is what the computer applied at its last report.
          They differ until the POS next connects — changes are not instant and nothing reaches a computer that is offline.
        </p>
      </div>

      {removed.length > 0 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
          <h2 style={{ margin: '0 0 8px', color: BRAND, fontSize: 15, fontWeight: 800 }}>Removed devices ({removed.length})</h2>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: MUTED }}>A removed computer is asked for the licence key again; entering it registers the computer again if a slot is free.</p>
          {removed.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: `1px solid ${BORDER}`, fontSize: 12 }}>
              <span style={{ fontFamily: 'monospace' }}>{s.deviceId || s.id}</span>
              <span style={{ color: MUTED }}>removed {fmt(s.updatedAt)}{s.by ? ` by ${s.by}` : ''}</span>
              <button disabled={busy === s.id} onClick={() => allowAgain(s)} style={{ ...btn(ACCENT), marginLeft: 'auto' }}>Clear record</button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Detail
          d={open}
          device={deviceStatus.get(docIdFor(open.deviceId))}
          licence={open.licenseKey ? licenceStatus.get(docIdFor(open.licenseKey)) : undefined}
          slots={open.licenseKey ? ledgers.get(docIdFor(open.licenseKey)) : undefined}
          now={now}
          onClose={() => setOpen(null)}
          onDelete={() => remove(open)}
          busy={busy === open.deviceId}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: string; hint?: string }) {
  return (
    <div title={hint} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone }}>{value}</div>
    </div>
  );
}

function Dot({ on }: { on?: boolean }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block', background: on ? '#22c55e' : '#94a3b8', boxShadow: on ? '0 0 0 3px #22c55e33' : 'none' }} />;
}

function Badge({ status }: { status: string }) {
  const c = TONE[status] || TONE.unknown;
  return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: c, border: `1px solid ${c}55`, background: `${c}10`, textTransform: 'uppercase' }}>{status}</span>;
}

function btn(color: string): React.CSSProperties {
  return { marginRight: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700, color, background: '#fff', border: `1px solid ${color}33`, borderRadius: 6, cursor: 'pointer' };
}

function Detail({ d, device, licence, slots, now, onClose, onDelete, busy }: {
  d: DeviceDoc; device?: StatusDoc; licence?: StatusDoc; slots?: string[]; now: number;
  onClose: () => void; onDelete: () => void; busy: boolean;
}) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 12.5 }}>
      <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{v || '—'}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ margin: '0 0 6px', color: BRAND, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6 }}>{title}</h4>
      {children}
    </div>
  );
  const on = isOnline(d, now);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: 14, padding: 20, width: 'min(600px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0, color: BRAND }}>{d.business || 'Installation'}</h3>
        <Section title="Connection">
          <Row k="Status" v={on ? 'Online' : 'Offline'} />
          <Row k="Last report" v={`${fmt(d.lastSyncAt)} (${lastSeenLabel(d.lastSyncAt, now)})`} />
        </Section>
        <Section title="Server decision (set here)">
          <Row k="This computer" v={device ? `${device.status}${device.updatedAt ? ` · ${fmt(device.updatedAt)}` : ''}` : 'No decision (active)'} />
          <Row k="Whole licence" v={licence ? `${licence.status}${licence.updatedAt ? ` · ${fmt(licence.updatedAt)}` : ''}` : 'No decision (active)'} />
          <Row k="Device slots" v={slots ? `${slots.length} used${slots.includes(d.deviceId) ? ', this computer holds one' : ', this computer holds none'}` : 'Not available'} />
        </Section>
        <Section title="Reported by the POS">
          <Row k="Applied status" v={d.licenseStatus || 'unknown'} />
          <Row k="Slot state" v={d.slot || '—'} />
          <Row k="Last verification" v={fmt(d.lastVerifyAt)} />
        </Section>
        <Section title="Installation">
          <Row k="Device ID" v={d.deviceId} />
          <Row k="Installation ID" v={d.installationId || ''} />
          <Row k="License" v={d.licenseKey || ''} />
          <Row k="First activated" v={fmt(d.activatedAt)} />
          <Row k="Last activated" v={fmt(d.lastActivationAt)} />
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
        </Section>
        <Section title="Location">
          <Row k="Location" v={locationLabel(d)} />
          <Row k="Updated" v={fmt(d.locationUpdatedAt)} />
        </Section>
        <Section title="License">
          <Row k="Plan" v={d.plan || ''} />
          <Row k="Expiry" v={d.expiryDate ? new Date(d.expiryDate).toLocaleDateString() : 'lifetime'} />
        </Section>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: BRAND, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Close</button>
          <button disabled={busy} onClick={onDelete} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Delete Device</button>
        </div>
      </div>
    </div>
  );
}
