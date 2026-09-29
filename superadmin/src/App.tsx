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
  ACCENT, INK, INK_2, TEXT, STRONG, MUTED, LINE, LINE_STRONG, TINT, TINT_2, STATUS,
  RAIL, RAIL_TEXT, RAIL_MUTED, RAIL_LINE,
  card, input, label, primaryBtn, ghostBtn, pill,
} from './theme';
import { Empty, Section, Modal } from './ui';
import {
  LayoutDashboard, KeyRound, Users, Monitor, MapPin, Receipt, LifeBuoy, ShieldCheck, LogOut,
  CheckCircle2, Clock, XCircle, PauseCircle, type LucideIcon,
} from 'lucide-react';

type Tab = 'dashboard' | 'issue' | 'clients' | 'devices' | 'map' | 'billing' | 'support' | 'verify';

const TABS: { id: Tab; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard',       Icon: LayoutDashboard, hint: 'Licences, renewals and activated computers at a glance.' },
  { id: 'issue',     label: 'Issue License',   Icon: KeyRound,        hint: 'Create a signed key for a shop.' },
  { id: 'clients',   label: 'Clients',         Icon: Users,           hint: 'Every licence you have issued, with its status and computers.' },
  { id: 'devices',   label: 'Devices',         Icon: Monitor,         hint: 'Installations reporting to the cloud — activate, suspend or revoke one computer.' },
  { id: 'map',       label: 'Device Map',      Icon: MapPin,          hint: 'Register an activation code and see where each machine runs.' },
  { id: 'billing',   label: 'Offline Billing', Icon: Receipt,         hint: 'Invoices, payments and receipts for your clients.' },
  { id: 'support',   label: 'Support',         Icon: LifeBuoy,        hint: 'Messages from shops and your replies.' },
  { id: 'verify',    label: 'Verify Key',      Icon: ShieldCheck,     hint: 'Check a key a customer read out to you.' },
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

  const meta = TABS.find(t => t.id === tab)!;

  return (
    <div className="sa-shell" style={{ display: 'flex', minHeight: '100vh', color: TEXT, background: INK }}>
      <Sidebar tab={tab} onTab={setTab} email={admin?.email} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <PageBar title={meta.label} hint={meta.hint} stats={stats} />

        {cloudErr && (
          <div role="alert" style={{ maxWidth: 1320, margin: '14px auto 0', width: 'calc(100% - 56px)', padding: '10px 14px', borderRadius: 'var(--ui-radius-control)',
                        background: STATUS.expired.bg, border: `1px solid ${STATUS.expired.bd}`,
                        color: STATUS.expired.fg, fontSize: 13 }}>
            Cloud: {cloudErr}
          </div>
        )}

        <main className="sa-page" style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 28px 60px' }}>
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
    </div>
  );
}

// ===================== Shell =====================
// A dark admin rail on the left (this is the higher-level console, so it is
// deliberately not the same white sidebar the shop's POS uses), a light page
// with the same tokens underneath.
function Sidebar({ tab, onTab, email }: { tab: Tab; onTab: (t: Tab) => void; email?: string | null }) {
  return (
    <aside className="sa-sidebar" style={{
      width: 'var(--ui-sidebar-w)', flex: '0 0 auto', position: 'sticky', top: 0, height: '100vh',
      display: 'flex', flexDirection: 'column', background: RAIL, color: RAIL_TEXT,
    }}>
      <div className="sa-sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 18px 14px' }}>
        <img src="./dt-mark.png" alt="Digital Target" width={38} height={38}
             style={{ width: 38, height: 38, objectFit: 'contain', borderRadius: 10, background: 'hsl(0 0% 100% / 0.10)', padding: 6, flex: 'none' }} />
        <div className="sa-brand-text" style={{ minWidth: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: '-0.01em' }}>DT POS</div>
          <div style={{ fontSize: 12, color: RAIL_MUTED, marginTop: 2 }}>Super Admin</div>
        </div>
      </div>

      <nav className="sa-sidebar-nav" aria-label="Super Admin sections"
           style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', flex: 1, overflowY: 'auto' }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <button
              key={t.id} type="button" className="sa-nav-item"
              aria-current={on ? 'page' : undefined}
              onClick={() => onTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', minHeight: 40,
                border: 'none', borderRadius: 'var(--ui-radius-control)', cursor: 'pointer', textAlign: 'left',
                background: on ? ACCENT : 'transparent', color: on ? 'var(--ui-accent-fg)' : RAIL_TEXT,
                fontSize: 13.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
              }}
            >
              <t.Icon size={18} strokeWidth={1.75} aria-hidden style={{ flex: 'none' }} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="sa-sidebar-foot" style={{ padding: '14px 16px 16px', borderTop: `1px solid ${RAIL_LINE}` }}>
        {email && (
          <div className="sa-foot-extra" style={{ fontSize: 12, color: RAIL_TEXT, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={email}>
            {email}
          </div>
        )}
        {email && (
          <button
            type="button" onClick={() => adminSignOut()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 36,
              borderRadius: 'var(--ui-radius-control)', border: `1px solid ${RAIL_LINE}`, cursor: 'pointer',
              background: 'hsl(0 0% 100% / 0.06)', color: '#fff', fontSize: 12.5, fontWeight: 600,
            }}
          ><LogOut size={15} strokeWidth={1.75} aria-hidden />Sign out</button>
        )}
        <div className="sa-foot-extra" style={{ fontSize: 11.5, color: RAIL_MUTED, marginTop: 12, lineHeight: 1.5 }}>
          Digital Target · cloud console.<br />The POS itself stays offline.
        </div>
      </div>
    </aside>
  );
}

function PageBar({ title, hint, stats }: { title: string; hint: string; stats: { total: number; devices: number } }) {
  const chip = (Icon: LucideIcon, n: number, text: string) => (
    <span key={text} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 'var(--ui-radius-pill)',
      background: INK_2, border: `1px solid ${LINE}`, boxShadow: 'var(--ui-shadow-xs)', fontSize: 12.5, color: MUTED,
    }}>
      <Icon size={15} strokeWidth={1.75} aria-hidden />
      <b style={{ color: STRONG, fontSize: 14, fontWeight: 700 }}>{n}</b> {text}
    </span>
  );
  return (
    <header className="sa-pagebar" style={{
      maxWidth: 1320, margin: '0 auto', padding: '24px 28px 0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 'var(--ui-text-page)', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{title}</h1>
        <p style={{ fontSize: 13, color: MUTED, margin: '4px 0 0' }}>{hint}</p>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chip(Users, stats.total, 'clients')}
        {chip(Monitor, stats.devices, 'devices')}
      </div>
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
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <Stat label="Active" value={stats.active} Icon={CheckCircle2} tone={STATUS.active} />
        <Stat label="Expiring within 14 days" value={stats.soon} Icon={Clock} tone={STATUS.suspended} />
        <Stat label="Expired" value={stats.expired} Icon={XCircle} tone={STATUS.expired} />
        <Stat label="Suspended" value={stats.suspended} Icon={PauseCircle} tone={{ fg: MUTED, bg: TINT, bd: LINE }} />
        <Stat label="Devices activated" value={stats.devices} Icon={Monitor} tone={{ fg: ACCENT, bg: 'var(--ui-accent-soft)', bd: 'var(--ui-accent-soft-strong)' }} />
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <Section title="Renewals coming up" hint="Licences expiring within 30 days. Issue a fresh key before the shop is locked out.">
          {expiring.length === 0 ? (
            <Empty icon={CheckCircle2}>Nothing expires in the next 30 days.</Empty>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {expiring.map(c => {
                const dl = daysLeft(c) as number;
                return (
                  <div key={c.key} className="sa-row" style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', flexWrap: 'wrap',
                    borderRadius: 'var(--ui-radius-control)', border: `1px solid ${LINE}`,
                  }}>
                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.business || '—'}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, fontFamily: 'var(--ui-font-mono)' }}>{c.key}</div>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, whiteSpace: 'nowrap' }}>{c.phone}</div>
                    <span style={pill(dl <= 7 ? STATUS.expired : STATUS.suspended)}>
                      {dl <= 0 ? 'expires today' : `${dl} day${dl === 1 ? '' : 's'} left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="How this works">
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.6, color: MUTED }}>
            {[
              <><b style={{ color: STRONG }}>Issue License</b> — pick a plan, get a key, send it to the shop with the installer.</>,
              <>The shop activates. <b style={{ color: STRONG }}>No internet is needed</b> — the key proves itself.</>,
              <>The shop's screen then shows an activation code it can send on WhatsApp.</>,
              <>Paste that code under <b style={{ color: STRONG }}>Device Map → Register a device</b>: the client is linked and the machine appears on the map.</>,
            ].map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  flex: 'none', width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: 'var(--ui-accent-soft)', color: ACCENT, fontSize: 12, fontWeight: 700,
                }}>{i + 1}</span>
                <span style={{ paddingTop: 2 }}>{step}</span>
              </li>
            ))}
          </ol>
          <div style={{ display: 'flex', gap: 9, marginTop: 18, flexWrap: 'wrap' }}>
            <button style={primaryBtn} onClick={() => onGo('issue')}>Issue a License</button>
            <button style={ghostBtn} onClick={() => onGo('map')}>Register a device</button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Stat({ label: l, value, tone, Icon }: {
  label: string; value: number; tone: { fg: string; bg: string; bd: string }; Icon: LucideIcon;
}) {
  return (
    <div style={{ ...card, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{
        flex: 'none', width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center',
        background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
      }}><Icon size={20} strokeWidth={1.75} aria-hidden /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</div>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{l}</div>
      </div>
    </div>
  );
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
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 16px' }}>Issue a new license</h2>

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

        <p style={{ fontSize: 12.5, color: MUTED, margin: '14px 0 0' }}>Expires: <b style={{ color: STRONG, fontWeight: 600 }}>{expiryPreview}</b></p>

        <button onClick={generate} disabled={busy} style={{ ...primaryBtn, width: '100%', marginTop: 14 }}>
          {busy ? 'Generating…' : 'Generate License Key'}
        </button>
      </section>

      <section style={{ ...card, padding: 22 }}>
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 14px' }}>Key to send</h2>
        {!issued ? (
          <Empty icon={KeyRound}>The key appears here once you generate it.</Empty>
        ) : (
          <>
            <div style={{
              padding: '18px 14px', borderRadius: 'var(--ui-radius-control)', textAlign: 'center',
              background: TINT, border: `1px dashed ${LINE_STRONG}`,
              fontFamily: 'var(--ui-font-mono)', fontSize: 18, fontWeight: 600, letterSpacing: 1.2, wordBreak: 'break-all',
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
                style={{ ...ghostBtn, background: '#25D366', color: '#053a1a', border: 'none' }}
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
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: 0 }}>All clients <span style={{ color: MUTED, fontWeight: 500 }}>({clients.length})</span></h2>
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
        <Empty icon={Users}>{clients.length ? 'No client matches that search.' : 'No licences issued yet.'}</Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: MUTED, textAlign: 'left', background: TINT }}>
                {['Business', 'Key', 'Plan', 'Devices', 'Expiry', 'Status', ''].map((h, i, all) => (
                  <th key={h || 'actions'} style={{
                    padding: '9px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                    borderTopLeftRadius: i === 0 ? 10 : 0, borderBottomLeftRadius: i === 0 ? 10 : 0,
                    borderTopRightRadius: i === all.length - 1 ? 10 : 0, borderBottomRightRadius: i === all.length - 1 ? 10 : 0,
                  }}>{h}</th>
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
                  <tr className="sa-row" style={{ borderTop: `1px solid ${LINE}` }}>
                    <td style={{ padding: '12px 10px', minWidth: 170 }}>
                      <div style={{ fontWeight: 600 }}>{c.business || '—'}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{c.owner} {c.phone && `· ${c.phone}`}</div>
                    </td>
                    <td style={{ padding: '12px 10px', fontFamily: 'var(--ui-font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}>{c.key}</td>
                    <td style={{ padding: '12px 10px' }}>{PLAN_LABEL[c.plan]}</td>
                    <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                      <button
                        style={{ ...ghostBtn, padding: '4px 9px', fontSize: 11,
                                 color: use.used > use.max ? STATUS.suspended.fg : undefined }}
                        onClick={() => setOpenKey(open ? null : c.key)}
                        title="Show the machines this key is running on"
                      >{use.used}/{use.max} {open ? '▲' : '▼'}</button>
                    </td>
                    <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
                      {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : 'Lifetime'}
                      {dl !== null && dl <= 30 && dl > 0 && (
                        <div style={{ fontSize: 10.5, color: STATUS.suspended.fg }}>{dl} days left</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{ ...pill(STATUS[s]), textTransform: 'capitalize' }}>{s}</span>
                    </td>
                    <td style={{ padding: '12px 10px', whiteSpace: 'nowrap' }}>
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
                        style={{ ...ghostBtn, padding: '5px 10px', fontSize: 11, marginLeft: 6, color: STATUS.expired.fg, borderColor: STATUS.expired.bd }}
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
                          <span style={{ fontSize: 12.5, color: MUTED }}>No machine has sent an activation code yet.</span>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {c.devices.map(d => (
                              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                                <span style={{ fontFamily: 'var(--ui-font-mono)' }}>{d.id}</span>
                                <span style={{ color: MUTED }}>activated {new Date(d.activatedAt).toLocaleString()}</span>
                                {d.appVersion && <span style={{ color: MUTED }}>v{d.appVersion}</span>}
                                {typeof d.lat === 'number' && <span style={{ color: ACCENT, fontWeight: 600 }}>on map</span>}
                                {d.approved && <span style={{ color: STATUS.active.fg, fontWeight: 700 }}>approved extra</span>}
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
    <Modal onClose={onClose} width={560}>
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 'var(--ui-text-section)', fontWeight: 700 }}>Edit licence</h3>
        <p style={{ fontSize: 11.5, color: MUTED, margin: '0 0 14px', fontFamily: 'var(--ui-font-mono)' }}>{client.key}</p>

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
          <div style={{ marginTop: 12, padding: 12, borderRadius: 'var(--ui-radius-control)', background: STATUS.active.bg, border: `1px solid ${STATUS.active.bd}` }}>
            <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 4 }}>New key — send this to the shop:</div>
            <div style={{ fontFamily: 'var(--ui-font-mono)', fontWeight: 700, fontSize: 13.5 }}>{newKey}</div>
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
    </Modal>
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
        <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 4px' }}>Register a device</h2>
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
          style={{ ...input, fontFamily: 'var(--ui-font-mono)', fontSize: 11.5, resize: 'vertical' }}
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
            marginTop: 14, padding: 16, borderRadius: 'var(--ui-radius-control)',
            background: STATUS.suspended.bg, border: `1px solid ${STATUS.suspended.bd}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: STATUS.suspended.fg }}>
              ⚠ This licence key is already in use
            </div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 1.9 }}>
              <Row k="Business" v={conflict.client.business || conflict.rec.business || '—'} />
              <Row k="Key" v={conflict.rec.key} />
              <Row k="Allowed computers" v={String(slotUsage(conflict.client).max)} />
              <Row k="New machine" v={conflict.rec.device} />
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>Already linked:</div>
            <ul style={{ margin: '5px 0 0', paddingLeft: 18, fontSize: 11.5, color: MUTED, fontFamily: 'var(--ui-font-mono)' }}>
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
          <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: 0 }}>Activation-code map</h2>
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
      <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: '0 0 4px' }}>Verify a key</h2>
      <p style={{ fontSize: 12, color: MUTED, margin: '0 0 14px' }}>
        Check a key a customer read out to you — plan, device count and expiry, without touching their PC.
      </p>
      <input
        style={{ ...input, fontFamily: 'var(--ui-font-mono)', letterSpacing: 1 }}
        value={key} placeholder="DTPOS-XXXX-XXXX-XXXX-XXXX"
        onChange={e => { setKey(e.target.value.toUpperCase()); setResult(null); }}
        onKeyDown={e => { if (e.key === 'Enter') void run(); }}
      />
      <button style={{ ...primaryBtn, width: '100%', marginTop: 12 }} onClick={run}>Check</button>
      {result && (
        <pre style={{
          marginTop: 14, padding: '12px 14px', fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.7,
          borderRadius: 'var(--ui-radius-control)', fontWeight: 600,
          color: ok ? STATUS.active.fg : STATUS.expired.fg,
          background: ok ? STATUS.active.bg : STATUS.expired.bg,
          border: `1px solid ${ok ? STATUS.active.bd : STATUS.expired.bd}`,
        }}>{result}</pre>
      )}
    </section>
  );
}
