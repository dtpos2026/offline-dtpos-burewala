// ============================================================
// DT POS — SUPER ADMIN PANEL (Digital Target internal)
//
// Replaces the old Firebase console. Runs entirely in the browser with no
// server: it mints the HMAC-signed keys the POS validates locally, keeps a
// client registry, and plots every activated machine on a map from the
// activation codes shops send back.
//
//   npm run superadmin          → http://localhost:5180
//   npm run build:superadmin    → static build in superadmin/dist
// ============================================================
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  mintLicenseKey, verifyLicenseKey, PLAN_CODES, PLAN_DAYS, PLAN_LABEL,
  type LicensePlan,
} from '@pos/licensing/licenseKey';
import { decodeReceipt } from '@pos/licensing/activationReceipt';
import {
  loadClients, saveClients, upsertClient, mergeDevice, statusOf, daysLeft, deviceFromReceipt,
  exportBackup, exportCsv, importBackup, hasDevice, slotUsage, removeDevice, type Client,
} from './registry';
import DeviceMap from './DeviceMap';
import LiveDeviceMap from './LiveDeviceMap';
import { pinsFrom } from './pins';
import CloudGate from './CloudGate';
import Support from './Support';
import Devices from './Devices';
import Billing from './Billing';
import {
  watchAdmin, adminSignOut, watchClients, pushClient, removeClient,
  watchLicenseStatuses, setLicenseStatus, docIdFor, type StatusDoc, type LicenceAction,
} from './cloud';
import {
  BRAND, BRAND_SOFT, ACCENT, INK, INK_2, TEXT, STRONG, MUTED, LINE, TINT, TINT_2, STATUS,
  card, input, label, primaryBtn, ghostBtn,
} from './theme';

type Tab = 'dashboard' | 'issue' | 'clients' | 'devices' | 'map' | 'billing' | 'support' | 'verify';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'issue',     label: 'Issue License', icon: '✦' },
  { id: 'clients',   label: 'Clients', icon: '▦' },
  { id: 'devices',   label: 'Devices', icon: '🖥' },
  { id: 'map',       label: 'Device Map', icon: '◎' },
  { id: 'billing',   label: 'Offline Billing', icon: '₨' },
  { id: 'support',   label: 'Support', icon: '✉' },
  { id: 'verify',    label: 'Verify Key', icon: '✓' },
];

export default function App() {
  const [clients, setClients] = useState<Client[]>(loadClients);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [admin, setAdmin] = useState<{ email?: string | null } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudErr, setCloudErr] = useState<string | null>(null);
  useEffect(() => { saveClients(clients); }, [clients]);

  // ---- cloud: who is signed in ----
  useEffect(() => watchAdmin(u => { setAdmin(u); setAuthReady(true); }), []);

  // ---- cloud: live registry (cloud wins, localStorage is the offline mirror) ----
  const synced = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!admin) return;
    return watchClients(list => {
      synced.current = new Map(list.map(c => [c.key, JSON.stringify(c)]));
      setClients(list);
      setCloudErr(null);
    }, e => setCloudErr(e.message));
  }, [admin]);

  // ---- cloud: push local changes up (issue / suspend / device / delete) ----
  useEffect(() => {
    if (!admin) return;
    const seen = new Set<string>();
    for (const c of clients) {
      seen.add(c.key);
      const json = JSON.stringify(c);
      if (synced.current.get(c.key) !== json) {
        synced.current.set(c.key, json);
        pushClient(c).catch(e => {
          // Not saved: stop treating it as synced, so the next change retries
          // it instead of the record being dropped silently.
          if (synced.current.get(c.key) === json) synced.current.delete(c.key);
          setCloudErr(`Could not save ${c.business || c.key} — ${e?.message || 'cloud write failed'}`);
        });
      }
    }
    for (const key of Array.from(synced.current.keys())) {
      if (!seen.has(key)) {
        synced.current.delete(key);
        removeClient(key).catch(e => setCloudErr(e?.message || 'Cloud delete failed'));
      }
    }
  }, [clients, admin]);

  // NOTE: all hooks must run on every render — keep them above the early returns.
  const stats = useMemo(() => {
    const total = clients.length;
    let active = 0, expired = 0, suspended = 0, soon = 0, devices = 0;
    for (const c of clients) {
      const s = statusOf(c);
      if (s === 'active') active++; else if (s === 'expired') expired++; else suspended++;
      const dl = daysLeft(c);
      if (s === 'active' && dl !== null && dl <= 14) soon++;
      devices += c.devices.length;
    }
    return { total, active, expired, suspended, soon, devices };
  }, [clients]);

  if (!authReady) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: INK, color: MUTED, fontSize: 13 }}>Loading…</div>;
  }
  if (!admin) return <CloudGate />;

  return (
    <div style={{
      minHeight: '100vh', color: TEXT,
      background: `radial-gradient(1200px 560px at 12% -12%, rgba(224,170,255,0.55) 0%, transparent 60%),
                   radial-gradient(900px 480px at 108% 8%, rgba(90,24,154,0.14) 0%, transparent 55%), ${INK}`,
    }}>
      <Header stats={stats} email={admin?.email} />

      {cloudErr && (
        <div style={{ maxWidth: 1180, margin: '0 auto 10px', padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                      color: '#B91C1C', fontSize: 12 }}>
          Cloud: {cloudErr}
        </div>
      )}

      <nav style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(14px)',
        borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`,
      }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 22px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                color: tab === t.id ? BRAND : MUTED,
                fontWeight: tab === t.id ? 800 : 600, fontSize: 13, whiteSpace: 'nowrap',
                borderBottom: `2px solid ${tab === t.id ? ACCENT : 'transparent'}`,
              }}
            >
              <span style={{ marginRight: 7, opacity: 0.85 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 22px 60px' }}>
        {tab === 'dashboard' && <Dashboard stats={stats} clients={clients} onGo={setTab} />}
        {tab === 'issue'     && <IssueLicense onIssued={c => setClients(p => upsertClient(p, c))} />}
        {tab === 'clients'   && <Clients clients={clients} setClients={setClients} />}
        {tab === 'devices'   && <Devices />}
        {tab === 'map'       && <MapTab clients={clients} setClients={setClients} />}
        {tab === 'billing'   && <Billing clients={clients} />}
        {tab === 'support'   && <Support clients={clients} />}
        {tab === 'verify'    && <VerifyKey clients={clients} />}
      </main>
    </div>
  );
}

// ===================== Header =====================
function Header({ stats, email }: { stats: { total: number; devices: number }; email?: string | null }) {
  return (
    <header style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 22px 20px', display: 'flex', alignItems: 'center', gap: 15 }}>
      <img src="./dt-mark.png" alt="Digital Target" width={48} height={48}
           style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 12, background: BRAND, padding: 8 }} />
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 21, fontWeight: 900, letterSpacing: -0.4, margin: 0 }}>DT POS — Super Admin</h1>
        <p style={{ fontSize: 11, color: ACCENT, letterSpacing: 1.6, textTransform: 'uppercase', margin: '3px 0 0', fontWeight: 700 }}>
          Digital Target · cloud console · POS stays offline
        </p>
      </div>
      <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11.5, color: MUTED }}>
        <div><b style={{ color: STRONG, fontSize: 15 }}>{stats.total}</b> clients</div>
        <div><b style={{ color: STRONG, fontSize: 15 }}>{stats.devices}</b> devices</div>
      </div>
      {email && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: MUTED, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
          <button style={{ ...ghostBtn, marginTop: 6 }} onClick={() => adminSignOut()}>Sign out</button>
        </div>
      )}
    </header>
  );
}

// ===================== Dashboard =====================
function Dashboard({ stats, clients, onGo }: {
  stats: { total: number; active: number; expired: number; suspended: number; soon: number; devices: number };
  clients: Client[];
  onGo: (t: Tab) => void;
}) {
  const expiring = useMemo(
    () => clients
      .filter(c => statusOf(c) === 'active' && daysLeft(c) !== null && (daysLeft(c) as number) <= 30)
      .sort((a, b) => (daysLeft(a) as number) - (daysLeft(b) as number))
      .slice(0, 8),
    [clients],
  );

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
        <Stat label="Active" value={stats.active} tone={STATUS.active.fg} />
        <Stat label="Expiring ≤14 days" value={stats.soon} tone={STATUS.suspended.fg} />
        <Stat label="Expired" value={stats.expired} tone={STATUS.expired.fg} />
        <Stat label="Suspended" value={stats.suspended} tone={MUTED} />
        <Stat label="Devices activated" value={stats.devices} tone={ACCENT} />
      </div>

      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Renewals coming up</h2>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 14px' }}>
          Licences expiring within 30 days. Issue a fresh key before the shop is locked out.
        </p>
        {expiring.length === 0 ? (
          <Empty>Nothing expires in the next 30 days.</Empty>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {expiring.map(c => {
              const dl = daysLeft(c) as number;
              return (
                <div key={c.key} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 10, background: TINT, border: `1px solid ${LINE}`,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.business || '—'}</div>
                    <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>{c.key}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: 'nowrap' }}>{c.phone}</div>
                  <div style={{
                    fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
                    color: dl <= 7 ? STATUS.expired.fg : STATUS.suspended.fg,
                  }}>
                    {dl <= 0 ? 'expires today' : `${dl} day${dl === 1 ? '' : 's'} left`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 10px' }}>How this works</h2>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.95, color: MUTED }}>
          <li><b style={{ color: STRONG }}>Issue License</b> — pick a plan, get a key, send it to the shop with the installer.</li>
          <li>The shop activates. <b style={{ color: STRONG }}>No internet is needed</b> — the key proves itself.</li>
          <li>The shop's screen then shows an activation code it can send on WhatsApp.</li>
          <li>Paste that code under <b style={{ color: STRONG }}>Device Map → Register a device</b>: the client is linked and the machine appears on the map.</li>
        </ol>
        <div style={{ display: 'flex', gap: 9, marginTop: 15, flexWrap: 'wrap' }}>
          <button style={primaryBtn} onClick={() => onGo('issue')}>Issue a License</button>
          <button style={ghostBtn} onClick={() => onGo('map')}>Register a device</button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label: l, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <div style={{ fontSize: 27, fontWeight: 900, color: tone, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 5, fontWeight: 600 }}>{l}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: MUTED, padding: '14px 0' }}>{children}</div>;
}

// ===================== Issue =====================
function IssueLicense({ onIssued }: { onIssued: (c: Client) => void }) {
  const [plan, setPlan] = useState<LicensePlan>('monthly');
  const [days, setDays] = useState<number>(PLAN_DAYS.monthly);
  const [maxDevices, setMaxDevices] = useState(1);
  const [f, setF] = useState({ business: '', owner: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: string; client: Client } | null>(null);

  useEffect(() => { setDays(PLAN_DAYS[plan]); }, [plan]);

  const expiryPreview = plan === 'lifetime'
    ? 'Never expires'
    : new Date(Date.now() + days * 86400000).toLocaleDateString();

  const generate = async () => {
    setBusy(true);
    try {
      const { key, payload } = await mintLicenseKey({ plan, maxDevices, days });
      const client: Client = {
        key,
        business: f.business.trim(),
        owner: f.owner.trim(),
        phone: f.phone.trim(),
        plan: payload.plan,
        maxDevices: payload.maxDevices,
        expiryDate: payload.expiryDate,
        issuedAt: Date.now(),
        notes: f.notes.trim(),
        devices: [],
      };
      setIssued({ key, client });
      onIssued(client);
      setF({ business: '', owner: '', phone: '', notes: '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
      <section style={{ ...card, padding: 22 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 16px' }}>Issue a new license</h2>

        <label style={label}>Plan</label>
        <select style={input} value={plan} onChange={e => setPlan(e.target.value as LicensePlan)}>
          {PLAN_CODES.map(p => <option key={p} value={p} style={{ color: '#111' }}>{PLAN_LABEL[p]}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Devices</label>
            <input style={input} type="number" min={1} max={63} value={maxDevices}
                   onChange={e => setMaxDevices(Math.min(63, Math.max(1, Number(e.target.value) || 1)))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Days</label>
            <input style={input} type="number" min={1} max={65535} value={days} disabled={plan === 'lifetime'}
                   onChange={e => setDays(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Business</label>
          <input style={input} value={f.business} placeholder="Al-Madina Restaurant"
                 onChange={e => setF({ ...f, business: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Owner</label>
            <input style={input} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Phone</label>
            <input style={input} value={f.phone} placeholder="0300-1234567"
                   onChange={e => setF({ ...f, phone: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={label}>Notes (internal)</label>
          <input style={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
        </div>

        <p style={{ fontSize: 12, color: ACCENT, margin: '14px 0 0' }}>Expires: {expiryPreview}</p>

        <button onClick={generate} disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 14 }}>
          {busy ? 'Generating…' : 'Generate License Key'}
        </button>
      </section>

      <section style={{ ...card, padding: 22 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 14px' }}>Key to send</h2>
        {!issued ? (
          <Empty>The key appears here once you generate it.</Empty>
        ) : (
          <>
            <div style={{
              padding: '18px 14px', borderRadius: 12, textAlign: 'center',
              background: TINT_2, border: `1px solid ${LINE}`,
              fontFamily: 'monospace', fontSize: 19, fontWeight: 800, letterSpacing: 1.5, wordBreak: 'break-all',
            }}>{issued.key}</div>

            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 14, lineHeight: 1.85 }}>
              <Row k="Business" v={issued.client.business || '—'} />
              <Row k="Plan" v={PLAN_LABEL[issued.client.plan]} />
              <Row k="Devices" v={String(issued.client.maxDevices)} />
              <Row k="Expiry" v={issued.client.expiryDate ? new Date(issued.client.expiryDate).toLocaleDateString() : 'Lifetime'} />
            </div>

            <div style={{ display: 'flex', gap: 9, marginTop: 15, flexWrap: 'wrap' }}>
              <button style={ghostBtn} onClick={() => navigator.clipboard?.writeText(issued.key)}>Copy key</button>
              <button
                style={{ ...ghostBtn, background: '#25D366', color: '#062', border: 'none' }}
                onClick={() => {
                  const msg = encodeURIComponent(
                    `DT POS Enterprise — License Key\n\n${issued.key}\n\n` +
                    `Plan: ${PLAN_LABEL[issued.client.plan]}\n` +
                    `Devices: ${issued.client.maxDevices}\n` +
                    `Expiry: ${issued.client.expiryDate ? new Date(issued.client.expiryDate).toLocaleDateString() : 'Lifetime'}\n\n` +
                    `— Digital Target`,
                  );
                  const digits = issued.client.phone.replace(/\D/g, '');
                  const to = digits.startsWith('92') ? digits : digits.replace(/^0/, '92');
                  window.open(to ? `https://wa.me/${to}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank', 'noopener');
                }}
              >Send on WhatsApp</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span>{k}</span><span style={{ color: STRONG, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

// ===================== Clients =====================
function Clients({ clients, setClients }: { clients: Client[]; setClients: (f: (p: Client[]) => Client[]) => void }) {
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Licence-wide decisions on the server — what every POS on the key obeys.
  const [serverStatus, setServerStatus] = useState<Map<string, StatusDoc>>(new Map());
  const [statusBusy, setStatusBusy] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => watchLicenseStatuses(setServerStatus, e => setStatusMsg({ ok: false, text: e.message })), []);

  const changeLicence = async (c: Client, status: LicenceAction) => {
    const explain: Record<LicenceAction, string> = {
      active: 'Every computer on this licence may run again.',
      suspended: 'Every computer on this licence shows "Your software license has been suspended by the administrator." until you set it back to Active.',
      revoked: 'Every computer on this licence shows "Your software license has been revoked."',
      pending: 'Every computer on this licence shows "Your license/payment is pending. Please contact the administrator."',
    };
    if (!confirm(`Set the licence of ${c.business || c.key} to ${status.toUpperCase()}?\n\n${explain[status]}\n\nIt applies the next time each computer is online (about a minute when connected).`)) return;
    setStatusBusy(c.key);
    setStatusMsg(null);
    try {
      await setLicenseStatus(c.key, status);
      setClients(p => upsertClient(p, { ...c, suspended: status === 'suspended' || status === 'revoked' }));
      setStatusMsg({ ok: true, text: `${c.business || c.key}: licence set to ${status.toUpperCase()} on the server.` });
    } catch (e) {
      setStatusMsg({ ok: false, text: `Not saved — ${(e as Error).message}` });
    } finally { setStatusBusy(''); }
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter(c =>
      [c.business, c.owner, c.phone, c.key, c.notes].some(v => String(v || '').toLowerCase().includes(t)));
  }, [clients, q]);

  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Clients ({clients.length})</h2>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search business, owner, phone or key…"
          style={{ ...input, marginTop: 0, width: 'auto', flex: '1 1 220px', maxWidth: 340 }}
        />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button style={ghostBtn} onClick={() => exportCsv(clients)} disabled={!clients.length}>CSV</button>
          <button style={ghostBtn} onClick={() => exportBackup(clients)} disabled={!clients.length}>Export backup</button>
          <button style={ghostBtn} onClick={() => fileRef.current?.click()}>Import backup</button>
          <input
            ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={async e => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const merged = await importBackup(file, clients);
                setClients(() => merged);
                alert(`Imported. The registry now holds ${merged.length} client(s).`);
              } catch {
                alert('That file could not be read as a DT POS client backup.');
              }
            }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>{clients.length ? 'No client matches that search.' : 'No licences issued yet.'}</Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: ACCENT, textAlign: 'left' }}>
                {['Business', 'Key', 'Plan', 'Devices', 'Expiry', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '7px 8px', fontWeight: 800, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const s = statusOf(c);
                const dl = daysLeft(c);
                const use = slotUsage(c);
                const open = openKey === c.key;
                return (
                  <Fragment key={c.key}>
                  <tr style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: '9px 8px' }}>
                      <div style={{ fontWeight: 700 }}>{c.business || '—'}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{c.owner} {c.phone && `· ${c.phone}`}</div>
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.key}</td>
                    <td style={{ padding: '9px 8px' }}>{PLAN_LABEL[c.plan]}</td>
                    <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                      <button
                        style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11,
                                 color: use.used > use.max ? STATUS.suspended.fg : undefined }}
                        onClick={() => setOpenKey(open ? null : c.key)}
                        title="Show the machines this key is running on"
                      >{use.used}/{use.max} {open ? '▲' : '▼'}</button>
                    </td>
                    <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                      {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : 'Lifetime'}
                      {dl !== null && dl <= 30 && dl > 0 && (
                        <div style={{ fontSize: 10.5, color: STATUS.suspended.fg }}>{dl} days left</div>
                      )}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      <span style={{
                        padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800,
                        color: STATUS[s].fg, background: STATUS[s].bg, border: `1px solid ${STATUS[s].bd}`,
                      }}>{s}</span>
                    </td>
                    <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                      <button
                        style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginRight: 6 }}
                        onClick={() => setEditing(c)}
                        title="Change devices, expiry or shop details — and re-issue the key if needed"
                      >Edit</button>
                      <select
                        aria-label="Licence status on the server"
                        value={(serverStatus.get(docIdFor(c.key))?.status as LicenceAction) || 'active'}
                        disabled={statusBusy === c.key}
                        onChange={e => { void changeLicence(c, e.target.value as LicenceAction); }}
                        title="Licence-wide status on the server — every computer on this key obeys it when online"
                        style={{ ...ghostBtn, padding: '4px 6px', fontSize: 11 }}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="revoked">Revoked</option>
                        <option value="pending">Pending payment</option>
                      </select>
                      <button
                        style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginLeft: 6, color: STATUS.expired.fg }}
                        onClick={() => {
                          if (confirm(`Remove ${c.business || c.key} from the registry?\n\nThe shop's installed POS is not affected.`)) {
                            setClients(p => p.filter(x => x.key !== c.key));
                          }
                        }}
                      >Delete</button>
                    </td>
                  </tr>
                  {open && (
                    <tr style={{ background: TINT }}>
                      <td colSpan={7} style={{ padding: '10px 14px' }}>
                        {c.devices.length === 0 ? (
                          <span style={{ fontSize: 12, color: MUTED }}>No machine has sent an activation code yet.</span>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {c.devices.map(d => (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                                <span style={{ fontFamily: 'monospace' }}>{d.id}</span>
                                <span style={{ color: MUTED }}>activated {new Date(d.activatedAt).toLocaleString()}</span>
                                {d.appVersion && <span style={{ color: MUTED }}>v{d.appVersion}</span>}
                                {typeof d.lat === 'number' && <span style={{ color: ACCENT }}>on map</span>}
                                {d.approved && <span style={{ color: STATUS.active.fg, fontWeight: 800 }}>approved extra</span>}
                                <button
                                  style={{ ...ghostBtn, padding: '4px 9px', fontSize: 10.5, marginLeft: 'auto', color: STATUS.expired.fg }}
                                  onClick={() => {
                                    if (confirm(`Unlink ${d.id}? The slot frees up for another computer.`)) {
                                      setClients(p => upsertClient(p, removeDevice(c, d.id)));
                                    }
                                  }}
                                >Unlink</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {statusMsg && (
        <p role="status" style={{ fontSize: 12.5, fontWeight: 700, marginTop: 12, color: statusMsg.ok ? STATUS.active.fg : STATUS.expired.fg }}>
          {statusMsg.ok ? '✓' : '✗'} {statusMsg.text}
        </p>
      )}
      <p style={{ fontSize: 11.5, color: MUTED, marginTop: 16, lineHeight: 1.7 }}>
        <b style={{ color: STRONG }}>Note:</b> The licence status is stored on the server. Each computer applies it the
        next time it is online (about once a minute while connected) and keeps it when it goes offline again.
        A computer that never connects is governed only by the expiry date inside its key.
        To act on one computer only, use the Devices tab.
      </p>

      {editing && (
        <EditClient
          client={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => { setClients(p => upsertClient(p, next)); setEditing(null); }}
          onReissue={(next) => { setClients(p => upsertClient(p, next)); setEditing(next); }}
        />
      )}
    </section>
  );
}

// ===================== Edit / extend a licence =====================
// Devices badhana, expiry barhana, ya shop ki tafseel theek karna — sab yahin.
// Agar device count ya expiry badle to POS ke liye NAYI key banti hai (key
// signed hai, is liye limits key ke andar hi likhi hoti hain).
function EditClient({
  client, onClose, onSave, onReissue,
}: {
  client: Client;
  onClose: () => void;
  onSave: (c: Client) => void;
  onReissue: (c: Client) => void;
}) {
  const [f, setF] = useState({
    business: client.business, owner: client.owner, phone: client.phone, notes: client.notes || '',
  });
  const [maxDevices, setMaxDevices] = useState(client.maxDevices);
  const [expiry, setExpiry] = useState(
    client.expiryDate ? new Date(client.expiryDate).toISOString().slice(0, 10) : '',
  );
  const [plan, setPlan] = useState<LicensePlan>(client.plan);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');

  const expiryMs = expiry ? new Date(`${expiry}T23:59:59`).getTime() : null;
  const limitsChanged = maxDevices !== client.maxDevices
    || plan !== client.plan
    || (expiryMs || 0) !== (client.expiryDate || 0);

  const addDays = (n: number) => {
    const base = expiryMs && expiryMs > Date.now() ? expiryMs : Date.now();
    setExpiry(new Date(base + n * 86400000).toISOString().slice(0, 10));
  };

  const saveDetails = () => {
    onSave({
      ...client,
      business: f.business.trim(), owner: f.owner.trim(), phone: f.phone.trim(), notes: f.notes.trim(),
      maxDevices, plan, expiryDate: expiryMs,
    });
  };

  const reissue = async () => {
    setBusy(true);
    try {
      const days = expiryMs && plan !== 'lifetime'
        ? Math.max(1, Math.ceil((expiryMs - Date.now()) / 86400000))
        : PLAN_DAYS[plan];
      const { key, payload } = await mintLicenseKey({ plan, maxDevices, days });
      setNewKey(key);
      onReissue({
        ...client,
        key,
        business: f.business.trim(), owner: f.owner.trim(), phone: f.phone.trim(), notes: f.notes.trim(),
        plan: payload.plan,
        maxDevices: payload.maxDevices,
        expiryDate: payload.expiryDate,
        issuedAt: Date.now(),
        devices: client.devices,
      });
    } catch {
      alert('The new key could not be generated. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 70 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, padding: 20, width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900 }}>Edit licence</h3>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 14px', fontFamily: 'monospace' }}>{client.key}</p>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
          <div><label style={label}>Business</label><input style={input} value={f.business} onChange={e => setF({ ...f, business: e.target.value })} /></div>
          <div><label style={label}>Owner</label><input style={input} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} /></div>
          <div><label style={label}>Phone</label><input style={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
          <div>
            <label style={label}>Plan</label>
            <select style={input as React.CSSProperties} value={plan} onChange={e => setPlan(e.target.value as LicensePlan)}>
              {(Object.keys(PLAN_LABEL) as LicensePlan[]).map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Allowed computers</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input style={input} type="number" min={1} max={63} value={maxDevices}
                     onChange={e => setMaxDevices(Math.max(1, Math.min(63, Number(e.target.value) || 1)))} />
              <button style={ghostBtn} onClick={() => setMaxDevices(d => Math.min(63, d + 1))}>+1</button>
            </div>
          </div>
          <div>
            <label style={label}>Expiry {plan === 'lifetime' ? '(lifetime)' : ''}</label>
            <input style={input} type="date" value={expiry} onChange={e => setExpiry(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={ghostBtn} onClick={() => addDays(30)}>+30 days</button>
          <button style={ghostBtn} onClick={() => addDays(90)}>+3 months</button>
          <button style={ghostBtn} onClick={() => addDays(365)}>+1 year</button>
          <button style={ghostBtn} onClick={() => setExpiry('')}>Lifetime</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={label}>Notes</label>
          <input style={input} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
        </div>

        {limitsChanged && (
          <p style={{ fontSize: 11.5, color: STATUS.suspended.fg, marginTop: 12, lineHeight: 1.7 }}>
            Devices, plan or expiry changed. The shop's software reads these limits from the key
            itself, so send them a re-issued key for the change to take effect on their computer.
          </p>
        )}

        {newKey && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: STATUS.active.bg, border: `1px solid ${STATUS.active.bd}` }}>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>New key — send this to the shop:</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13.5 }}>{newKey}</div>
            <button style={{ ...ghostBtn, marginTop: 8 }} onClick={() => navigator.clipboard.writeText(newKey)}>Copy key</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap' }}>
          <button style={primaryBtn} onClick={saveDetails}>Save changes</button>
          <button style={ghostBtn} disabled={busy} onClick={reissue}>
            {busy ? 'Generating…' : 'Re-issue key with these limits'}
          </button>
          <button style={{ ...ghostBtn, marginLeft: 'auto' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}


// ===================== Map =====================
function MapTab({ clients, setClients }: { clients: Client[]; setClients: (f: (p: Client[]) => Client[]) => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  /** A code whose key already has all device slots full — waits for a decision. */
  const [conflict, setConflict] = useState<{
    rec: { key: string; device: string; business: string; owner: string; phone: string; at: number; lat?: number; lng?: number; ver?: string };
    client: Client;
  } | null>(null);
  const pins = useMemo(() => pinsFrom(clients), [clients]);

  const link = (rec: any, base: Client, approved: boolean, drop?: string) => {
    setClients(prev => {
      let c: Client = {
        ...base,
        business: rec.business || base.business || '',
        owner: rec.owner || base.owner || '',
        phone: rec.phone || base.phone || '',
      };
      if (drop) c = removeDevice(c, drop);
      return upsertClient(prev, mergeDevice(c, deviceFromReceipt(rec, approved)));
    });
    setCode('');
    setConflict(null);
    setMsg({
      ok: true,
      text: rec.lat != null
        ? `${rec.business || 'Shop'} registered — device placed on the map.`
        : `${rec.business || 'Shop'} registered. No location in this code (the shop declined location), so no map pin.`,
    });
  };

  const register = async () => {
    setConflict(null);
    const r = await decodeReceipt(code);
    if (!r.ok || !r.receipt) { setMsg({ ok: false, text: r.message || 'Invalid code' }); return; }
    const rec = r.receipt;

    const check = await verifyLicenseKey(rec.key);
    if (!check.ok || !check.payload) {
      setMsg({ ok: false, text: 'The key inside this code is not a valid DT POS key.' });
      return;
    }

    const existing = clients.find(c => c.key === rec.key);
    const base: Client = existing ?? {
      key: rec.key,
      business: rec.business || '', owner: rec.owner || '', phone: rec.phone || '',
      plan: check.payload.plan, maxDevices: check.payload.maxDevices,
      expiryDate: check.payload.expiryDate ?? null, issuedAt: rec.at || Date.now(), devices: [],
    };

    // Same machine coming back (re-install, new code) — never a conflict.
    if (hasDevice(base, rec.device)) { link(rec, base, false); return; }

    const { used, max } = slotUsage(base);
    if (used >= max) {
      setConflict({ rec, client: base });
      setMsg({
        ok: false,
        text: `Already in use — this key is live on ${used} of ${max} allowed computer(s). Decide below.`,
      });
      return;
    }
    link(rec, base, false);
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Register a device</h2>
        <p style={{ fontSize: 12, color: MUTED, margin: '0 0 12px', lineHeight: 1.7 }}>
          Paste the activation code the shop sent you. It is signed, so an edited or
          invented code is rejected. If the key is already live on another computer you
          are asked to approve it or move the licence over.
        </p>
        <textarea
          value={code}
          onChange={e => { setCode(e.target.value); setMsg(null); setConflict(null); }}
          placeholder="DTR1.xxxxxxxxxxxxxxxx.xxxxxxxx"
          rows={3}
          style={{ ...input, fontFamily: 'monospace', fontSize: 11.5, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 9, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={primaryBtn} onClick={register} disabled={!code.trim()}>Register device</button>
          {msg && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: msg.ok ? STATUS.active.fg : STATUS.expired.fg }}>
              {msg.ok ? '✓' : '✗'} {msg.text}
            </span>
          )}
        </div>

        {conflict && (
          <div style={{
            marginTop: 14, padding: 16, borderRadius: 12,
            background: STATUS.suspended.bg, border: `1px solid ${STATUS.suspended.bd}`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: STATUS.suspended.fg }}>
              ⚠ This licence key is already in use
            </div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 1.9 }}>
              <Row k="Business" v={conflict.client.business || conflict.rec.business || '—'} />
              <Row k="Key" v={conflict.rec.key} />
              <Row k="Allowed computers" v={String(slotUsage(conflict.client).max)} />
              <Row k="New machine" v={conflict.rec.device} />
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>Already linked:</div>
            <ul style={{ margin: '5px 0 0', paddingLeft: 18, fontSize: 11.5, color: MUTED, fontFamily: 'monospace' }}>
              {conflict.client.devices.map(d => (
                <li key={d.id}>{d.id} · {new Date(d.activatedAt).toLocaleDateString()}</li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
              <button style={primaryBtn} onClick={() => link(conflict.rec, conflict.client, true)}>
                Approve this extra computer
              </button>
              <button
                style={ghostBtn}
                onClick={() => {
                  const oldest = [...conflict.client.devices].sort((a, b) => a.activatedAt - b.activatedAt)[0];
                  if (!oldest) return;
                  if (confirm(`Move the licence to the new computer and unlink ${oldest.id}?`)) {
                    link(conflict.rec, conflict.client, false, oldest.id);
                  }
                }}
              >Move licence to this computer</button>
              <button style={{ ...ghostBtn, color: STATUS.expired.fg }} onClick={() => { setConflict(null); setMsg({ ok: false, text: 'Not registered — the shop keeps using the old computer.' }); }}>
                Reject
              </button>
            </div>
          </div>
        )}
      </section>


      <section style={{ ...card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Activation-code map</h2>
          <span style={{ fontSize: 12, color: MUTED }}>
            {pins.length} device{pins.length === 1 ? '' : 's'} with a location
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: MUTED }}>
            <Legend colour={STATUS.active.fg} text="Active" />
            <Legend colour={STATUS.suspended.fg} text="Suspended" />
            <Legend colour={STATUS.expired.fg} text="Expired" />
          </span>
        </div>
        <DeviceMap pins={pins} />
      </section>

      <LiveDeviceMap />
    </div>
  );
}

function Legend({ colour, text }: { colour: string; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: colour, display: 'inline-block' }} />
      {text}
    </span>
  );
}

// ===================== Verify =====================
function VerifyKey({ clients }: { clients: Client[] }) {
  const [key, setKey] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const run = async () => {
    const r = await verifyLicenseKey(key);
    if (!r.ok || !r.payload) { setOk(false); setResult(`✗ ${r.message}`); return; }
    const known = clients.find(c => c.key === r.key);
    const exp = r.payload.expiryDate ? new Date(r.payload.expiryDate).toLocaleDateString() : 'never';
    setOk(true);
    setResult(
      `✓ Valid · ${PLAN_LABEL[r.payload.plan]} · ${r.payload.maxDevices} device(s) · expires ${exp}` +
      (known ? `\nIn the registry as: ${known.business || '(no business name)'}` : '\nNot in this registry — issued from another machine or the log was cleared.'),
    );
  };

  return (
    <section style={{ ...card, padding: 22, maxWidth: 620 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Verify a key</h2>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 14px' }}>
        Check a key a customer read out to you — plan, device count and expiry, without touching their PC.
      </p>
      <input
        style={{ ...input, fontFamily: 'monospace', letterSpacing: 1 }}
        value={key} placeholder="DTPOS-XXXX-XXXX-XXXX-XXXX"
        onChange={e => { setKey(e.target.value.toUpperCase()); setResult(null); }}
        onKeyDown={e => { if (e.key === 'Enter') void run(); }}
      />
      <button style={{ ...primaryBtn, width: '100%', marginTop: 12 }} onClick={run}>Check</button>
      {result && (
        <pre style={{
          marginTop: 14, fontSize: 12.5, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
          color: ok ? STATUS.active.fg : STATUS.expired.fg,
        }}>{result}</pre>
      )}
    </section>
  );
}
