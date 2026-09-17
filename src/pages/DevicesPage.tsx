import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cloudDb, isCloudConfigured } from '@/lib/offlineNoCloud';
import { getTenantId, getDeviceId } from '@/lib/tenant';
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp,
} from '@/lib/offlineNoCloud';
import {
  Smartphone, CheckCircle2, Trash2, RefreshCw, Shield, Monitor, Wifi, WifiOff, MapPin, FileText, Tv, ChefHat,
} from 'lucide-react';
import { isOnline, tsToMs } from '@/lib/geo';
import jsPDF from 'jspdf';
import { drawPdfHeader, drawPdfFooter } from '@/lib/pdfBrand';
import { getTenantName } from '@/lib/tenant';
import { getKitchens } from '@/lib/store';
import { getPlan, effectiveDeviceLimit } from '@/lib/plans';

interface DeviceRow {
  deviceId: string;
  userId?: string;
  deviceName?: string;
  browser?: string;
  browserVersion?: string;
  os?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  platform?: 'electron' | 'web';
  appVersion?: string;
  cpuCores?: number;
  memoryGb?: number;
  connectionType?: string;
  touchSupport?: boolean;
  approved?: boolean;
  createdAt?: any;
  approvedAt?: any;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  screen?: string;
  timezone?: string;
  hostname?: string;
  lastActiveAt?: any;
  lastActiveMs?: number;
  loginAt?: any;
  lat?: number;
  lng?: number;
  isKdsDevice?: boolean;
  kdsKitchenId?: string;
  kdsKitchenName?: string;
  blocked?: boolean;
  blockedAt?: any;
  blockedReason?: string;
  deviceRole?: string;
}

export default function DevicesPage() {
  const tid = getTenantId();
  const currentDeviceId = getDeviceId();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [planInfo, setPlanInfo] = useState<{ planId: string; customLimit?: number }>({ planId: 'trial' });

  const load = async () => {
    if (!tid || !isCloudConfigured()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [devSnap, idxSnap] = await Promise.all([
        getDocs(collection(cloudDb(), 'tenants', tid, 'devices')),
        getDoc(doc(cloudDb(), 'userIndex', tid)).catch(() => null as any),
      ]);
      const list: DeviceRow[] = [];
      devSnap.forEach(d => list.push({ deviceId: d.id, ...(d.data() as any) }));
      list.sort((a, b) => Number(a.approved) - Number(b.approved));
      setRows(list);
      if (idxSnap && idxSnap.exists?.()) {
        const idata: any = idxSnap.data();
        setPlanInfo({ planId: idata.plan || 'trial', customLimit: idata.customDeviceLimit });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load devices');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generateLedgerPdf = (d: DeviceRow, approvedNow = false) => {
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const tname = getTenantName() || 'Restaurant';
      const now = new Date();
      const fmt = (t: any) => {
        const ms = typeof t === 'number' ? t : tsToMs(t);
        return ms ? new Date(ms).toLocaleString() : '—';
      };

      const headerEnd = drawPdfHeader(pdf, { title: 'Device Authorization Ledger', subtitle: `Tenant: ${tname}` });
      let y = headerEnd + 4;

      pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
      pdf.text(approvedNow ? 'Status: APPROVED ✓' : `Status: ${d.approved ? 'Approved' : 'Pending'}`, 15, y);
      y += 8;

      const rows: [string, string][] = [
        ['Device Name', d.deviceName || '—'],
        ['Device ID', d.deviceId],
        ['Browser', d.browser || '—'],
        ['Operating System', d.os || '—'],
        ['Screen', d.screen || '—'],
        ['Timezone', d.timezone || '—'],
        ['Hostname', d.hostname || '—'],
        ['IP Address', d.ip || '—'],
        ['Location', [d.city, d.region, d.country].filter(Boolean).join(', ') || '—'],
        ['ISP', d.isp || '—'],
        ['GPS', d.lat && d.lng ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : '—'],
        ['Created', fmt(d.createdAt)],
        ['Approved At', approvedNow ? now.toLocaleString() : fmt(d.approvedAt)],
        ['Last Login', fmt(d.loginAt)],
        ['Last Active', fmt(d.lastActiveMs || d.lastActiveAt)],
      ];

      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
      rows.forEach(([k, v]) => {
        pdf.setFont('helvetica', 'bold'); pdf.text(`${k}:`, 18, y);
        pdf.setFont('helvetica', 'normal');
        const lines = pdf.splitTextToSize(String(v), 120);
        pdf.text(lines, 60, y);
        y += 6 * Math.max(1, lines.length);
      });

      y += 6;
      pdf.setDrawColor(180); pdf.line(15, y, 195, y); y += 8;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'italic');
      pdf.text('This ledger certifies that the above device has been registered for the tenant.', 15, y);
      pdf.text('Authorized by: Restaurant Owner / Super Admin', 15, y + 5);

      drawPdfFooter(pdf, 'Powered by Digital Target — DT POS Cloud');

      pdf.save(`device-ledger-${(d.deviceName || d.deviceId).replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (e: any) { toast.error(e?.message || 'PDF failed'); }
  };

  const approve = async (d: DeviceRow) => {
    try {
      await updateDoc(doc(cloudDb(), 'tenants', tid!, 'devices', d.deviceId), {
        approved: true,
        approvedAt: serverTimestamp(),
      });
      toast.success('Device approved');
      load();
    } catch (e: any) { toast.error(e?.message); }
  };


  const toggleBlock = async (d: DeviceRow) => {
    const action = d.blocked ? 'Unblock' : 'Block';
    if (!confirm(`${action} device "${d.deviceName || d.deviceId}"?`)) return;
    try {
      await updateDoc(doc(cloudDb(), 'tenants', tid!, 'devices', d.deviceId), {
        blocked: !d.blocked,
        blockedAt: !d.blocked ? serverTimestamp() : null,
      });
      toast.success(`Device ${d.blocked ? 'unblocked' : 'blocked'}`);
      load();
    } catch (e: any) { toast.error(e?.message); }
  };

  const remove = async (d: DeviceRow) => {
    if (d.deviceId === currentDeviceId) {
      if (!confirm('This is your current device. Removing it will log you out. Continue?')) return;
    } else if (!confirm(`Remove device "${d.deviceName || d.deviceId}"?`)) return;
    try {
      await deleteDoc(doc(cloudDb(), 'tenants', tid!, 'devices', d.deviceId));
      toast.success('Device removed');
      load();
    } catch (e: any) { toast.error(e?.message); }
  };

  const assignKds = async (d: DeviceRow, kitchenId: string, kitchenName: string) => {
    try {
      await updateDoc(doc(cloudDb(), 'tenants', tid!, 'devices', d.deviceId), {
        isKdsDevice: true,
        kdsKitchenId: kitchenId,
        kdsKitchenName: kitchenName,
      });
      // If assigning current device, remember locally for instant auto-launch
      if (d.deviceId === currentDeviceId) {
        localStorage.setItem('pos-kds-device', '1');
        localStorage.setItem('pos-kds-device-kitchen', kitchenId);
      }
      toast.success(`Kitchen Screen assigned → ${kitchenName || 'All'}`);
      load();
    } catch (e: any) { toast.error(e?.message); }
  };

  const clearKds = async (d: DeviceRow) => {
    if (!confirm('Remove Kitchen Screen mode from this device?')) return;
    try {
      await updateDoc(doc(cloudDb(), 'tenants', tid!, 'devices', d.deviceId), {
        isKdsDevice: false,
        kdsKitchenId: null,
        kdsKitchenName: null,
      });
      if (d.deviceId === currentDeviceId) {
        localStorage.removeItem('pos-kds-device');
        localStorage.removeItem('pos-kds-device-kitchen');
      }
      toast.success('KDS mode removed');
      load();
    } catch (e: any) { toast.error(e?.message); }
  };

  if (!isCloudConfigured()) {
    return <div className="p-6 text-sm text-muted-foreground">Cloud mode disabled — device management not available.</div>;
  }

  const pending = rows.filter(r => !r.approved && !r.blocked);
  const blocked = rows.filter(r => r.blocked === true);
  const approvedAll = rows.filter(r => r.approved && !r.blocked);
  const cities = useMemo(() => Array.from(new Set(approvedAll.map(d => d.city).filter(Boolean))) as string[], [approvedAll]);
  const approved = approvedAll.filter(d => {
    if (filterCity && d.city !== filterCity) return false;
    const on = isOnline(d.lastActiveMs || tsToMs(d.lastActiveAt));
    if (filterStatus === 'online' && !on) return false;
    if (filterStatus === 'offline' && on) return false;
    return true;
  });
  const onlineCount = approvedAll.filter(d => isOnline(d.lastActiveMs || tsToMs(d.lastActiveAt))).length;

  const plan = getPlan(planInfo.planId);
  const limit = effectiveDeviceLimit(planInfo.planId, planInfo.customLimit);
  const used = approvedAll.length;
  const limitLabel = limit === Infinity ? 'Unlimited' : String(limit);
  const isFull = limit !== Infinity && used >= limit;
  const pct = limit === Infinity ? 0 : Math.min(100, Math.round((used / limit) * 100));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-gold flex items-center justify-center shadow-gold">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Device Authorization</h1>
            <p className="text-xs text-muted-foreground">Your restaurant's devices are auto-approved up to the plan limit</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>

      {/* Plan / Limit banner */}
      <div className={`rounded-lg border-2 p-4 mb-4 ${isFull ? 'border-red-500 bg-red-500/10' : 'border-primary/30 bg-primary/5'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Current Plan</div>
            <div className={`text-lg font-extrabold ${plan.color}`}>{plan.name}</div>
            <div className="text-[11px] text-muted-foreground">{plan.description}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Devices</div>
            <div className={`text-2xl font-extrabold ${isFull ? 'text-red-500' : ''}`}>
              {used} <span className="text-sm text-muted-foreground">/ {limitLabel}</span>
            </div>
            {planInfo.customLimit ? <div className="text-[9px] text-amber-600 font-bold">⚡ Custom limit by Super Admin</div> : null}
          </div>
        </div>
        {limit !== Infinity && (
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-all ${isFull ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {isFull && (
          <div className="mt-3 text-xs text-red-600 font-semibold flex items-start gap-2">
            <Shield className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Device limit reached. A new device cannot log in until the Super Admin increases the limit or an old device is removed.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <div className="bg-card border rounded-lg p-3"><div className="text-[10px] uppercase text-muted-foreground">Allowed</div><div className="text-xl font-extrabold">{limitLabel}</div></div>
        <div className="bg-card border rounded-lg p-3"><div className="text-[10px] uppercase text-muted-foreground">Used</div><div className="text-xl font-extrabold">{used}</div></div>
        <div className="bg-card border rounded-lg p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Wifi className="h-3 w-3 text-green-600"/>Active</div><div className="text-xl font-extrabold text-green-600">{onlineCount}</div></div>
        <div className="bg-card border rounded-lg p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3"/>Offline</div><div className="text-xl font-extrabold text-muted-foreground">{used - onlineCount}</div></div>
        <div className="bg-card border rounded-lg p-3"><div className="text-[10px] uppercase text-red-500 font-bold">Blocked</div><div className="text-xl font-extrabold text-red-500">{blocked.length}</div></div>
      </div>


      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Filters:</span>
        <div className="inline-flex rounded-md border bg-card">
          {(['all','online','offline'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 text-xs capitalize ${filterStatus===s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{s}</button>
          ))}
        </div>
        {cities.length > 0 && (
          <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="h-7 text-xs border rounded-md px-2 bg-card">
            <option value="">All cities</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>



      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Section title={`Pending Approval (${pending.length})`} accent="text-amber-500">
            {pending.length === 0 && <Empty>No pending devices</Empty>}
            {pending.map(d => (
              <DeviceRowView key={d.deviceId} d={d} current={d.deviceId === currentDeviceId}>
                <span className="text-[11px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded">
                  Waiting for Super Admin approval
                </span>
              </DeviceRowView>
            ))}
          </Section>

          <Section title={`Approved Devices (${approved.length})`} accent="text-green-600">
            {approved.length === 0 && <Empty>No approved devices yet</Empty>}
            {approved.map(d => (
              <DeviceRowView key={d.deviceId} d={d} current={d.deviceId === currentDeviceId}>
                <KdsAssign d={d} onAssign={assignKds} onClear={clearKds} />
                <span className="text-[10px] text-muted-foreground italic">
                  Request the Ledger PDF from the Super Admin
                </span>
              </DeviceRowView>
            ))}
          </Section>

          {blocked.length > 0 && (
            <Section title={`Blocked Devices (${blocked.length})`} accent="text-red-500">
              {blocked.map(d => (
                <DeviceRowView key={d.deviceId} d={d} current={d.deviceId === currentDeviceId}>
                  <span className="text-[11px] font-bold text-red-600 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded">
                    Blocked by Super Admin
                  </span>
                </DeviceRowView>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, accent, children }: any) {
  return (
    <div className="mb-8">
      <h2 className={`text-sm font-bold uppercase tracking-wider mb-3 ${accent}`}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Empty({ children }: any) {
  return <div className="text-xs text-muted-foreground italic px-3 py-2">{children}</div>;
}
function DeviceRowView({ d, current, children }: { d: DeviceRow; current: boolean; children: React.ReactNode }) {
  const location = [d.city, d.region, d.country].filter(Boolean).join(', ');
  return (
    <div className={`bg-card border rounded-lg p-3 ${current ? 'border-gold' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3 flex-1">
          <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate flex items-center gap-2">
              {(() => { const on = isOnline(d.lastActiveMs || tsToMs(d.lastActiveAt)); return <span className={`h-2 w-2 rounded-full ${on ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} title={on ? 'Online' : 'Offline'} />; })()}
              {d.deviceName || `${d.browser || '?'} / ${d.os || '?'}`}
              {current && <span className="text-[9px] uppercase tracking-wider bg-gold/20 text-gold px-1.5 py-0.5 rounded font-bold">This device</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {d.isKdsDevice && (
                <span className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                  <ChefHat className="h-3 w-3" /> KDS · {d.kdsKitchenName || 'All Kitchens'}
                </span>
              )}
              {d.deviceType && (
                <span className="text-[10px] bg-purple-500/10 text-purple-700 px-1.5 py-0.5 rounded">
                  {d.deviceType === 'mobile' ? '📱' : d.deviceType === 'tablet' ? '📲' : '🖥️'} {d.deviceType}
                </span>
              )}
              {d.platform && (
                <span className="text-[10px] bg-slate-500/10 text-slate-700 px-1.5 py-0.5 rounded">
                  {d.platform === 'electron' ? '⚡ Desktop App' : '🌐 Web'}
                </span>
              )}
              {d.browser && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">🌐 {d.browser}{d.browserVersion ? ` ${d.browserVersion.split('.')[0]}` : ''}</span>}
              {d.os && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">💻 {d.os}</span>}
              {d.appVersion && <span className="text-[10px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.5 rounded">v{d.appVersion}</span>}
              {d.ip && <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded">📡 {d.ip}</span>}
              {location && <span className="text-[10px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">📍 {location}</span>}
              {d.isp && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">🏢 {d.isp}</span>}
              {d.connectionType && <span className="text-[10px] bg-cyan-500/10 text-cyan-700 px-1.5 py-0.5 rounded">📶 {d.connectionType}</span>}
              {d.cpuCores && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">🧠 {d.cpuCores} cores{d.memoryGb ? ` · ${d.memoryGb}GB` : ''}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground/70 font-mono truncate mt-1">
              id: {d.deviceId.slice(0, 12)}…
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">{children}</div>
      </div>
    </div>
  );
}

function KdsAssign({ d, onAssign, onClear }: { d: DeviceRow; onAssign: (d: DeviceRow, kid: string, kname: string) => void; onClear: (d: DeviceRow) => void }) {
  const kitchens = useMemo(() => getKitchens(), []);
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(d.kdsKitchenId || 'all');

  if (d.isKdsDevice && !open) {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-700" onClick={() => setOpen(true)}>
          <ChefHat className="h-4 w-4 mr-1" />Change KDS
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onClear(d)} title="Remove KDS mode">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Tv className="h-4 w-4 mr-1" />Set as Kitchen Screen
      </Button>
    );
  }
  return (
    <div className="flex gap-1 items-center bg-muted/50 rounded px-2 py-1">
      <select value={val} onChange={e => setVal(e.target.value)} className="h-7 text-xs border rounded px-1 bg-card">
        <option value="all">All Kitchens</option>
        {kitchens.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
      </select>
      <Button size="sm" className="h-7 bg-green-600 hover:bg-green-700 text-white" onClick={() => {
        const kname = val === 'all' ? 'All Kitchens' : (kitchens.find(k => k.id === val)?.name || 'Kitchen');
        onAssign(d, val, kname);
        setOpen(false);
      }}>Save</Button>
      <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(false)}>✕</Button>
    </div>
  );
}
