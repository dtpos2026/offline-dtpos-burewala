import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Building2, Smartphone, RefreshCw, Activity, Users, WifiOff, Wifi, Clock, Filter } from 'lucide-react';
import LeafletMap, { type MapMarker } from '@/components/LeafletMap';
import { getBranches, getCurrentBranchId } from '@/lib/store';
import { getTenantId, getTenantName } from '@/lib/tenant';
import { cloudDb, isCloudConfigured } from '@/lib/offlineNoCloud';
import { collection, getDocs } from '@/lib/offlineNoCloud';
import { isOnline, tsToMs } from '@/lib/geo';

interface DeviceRow {
  deviceId: string;
  userId?: string; deviceName?: string; browser?: string; os?: string;
  approved?: boolean; ip?: string; city?: string; region?: string; country?: string;
  lat?: number; lng?: number; lastActiveAt?: any; loginAt?: any; createdAt?: any;
  branchId?: string;
}

export default function LiveMapPage() {
  const tid = getTenantId();
  const tenantName = getTenantName() || 'Restaurant';
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [showOfflineDevices, setShowOfflineDevices] = useState(true);
  const branches = useMemo(() => getBranches(), []);
  const currentBranchId = getCurrentBranchId();

  const load = async () => {
    if (!tid || !isCloudConfigured()) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(cloudDb(), 'tenants', tid, 'devices'));
      const list: DeviceRow[] = [];
      snap.forEach(d => list.push({ deviceId: d.id, ...(d.data() as any) }));
      setDevices(list);
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  // Refresh every 60s to update online/offline status
  useEffect(() => {
    const t = setInterval(() => { load(); setTick(x => x + 1); }, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleBranches = useMemo(
    () => branches.filter(b => branchFilter === 'all' || b.id === branchFilter),
    [branches, branchFilter]
  );

  const branchById = useMemo(() => {
    const m = new Map<string, any>();
    branches.forEach(b => m.set(b.id, b));
    return m;
  }, [branches]);

  // Devices with effective coordinates (GPS or branch fallback)
  const placedDevices = useMemo(() => {
    return devices.map((d, idx) => {
      let lat = d.lat, lng = d.lng, fromBranch = false;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        const b = d.branchId ? branchById.get(d.branchId) : (currentBranchId ? branchById.get(currentBranchId) : branches[0]);
        if (b && typeof b.lat === 'number' && typeof b.lng === 'number') {
          // small deterministic jitter so multiple devices at same branch don't overlap
          const j = ((idx % 7) - 3) * 0.0007;
          const k = (((idx * 3) % 7) - 3) * 0.0007;
          lat = b.lat + j; lng = b.lng + k; fromBranch = true;
        }
      }
      return { ...d, _lat: lat, _lng: lng, _fromBranch: fromBranch };
    });
  }, [devices, branchById, branches, currentBranchId]);

  const filteredDevices = useMemo(() => placedDevices.filter(d => {
    if (branchFilter !== 'all' && d.branchId && d.branchId !== branchFilter) return false;
    const online = isOnline(tsToMs(d.lastActiveAt));
    if (!showOfflineDevices && !online) return false;
    return true;
  }), [placedDevices, branchFilter, showOfflineDevices, tick]);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    visibleBranches.forEach(b => {
      if (typeof b.lat !== 'number' || typeof b.lng !== 'number') return;
      out.push({
        id: 'branch_' + b.id, lat: b.lat, lng: b.lng,
        title: b.name, color: b.id === currentBranchId ? 'gold' : 'blue',
        popupHtml: `<div style="font-family:system-ui;font-size:12px;min-width:180px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">🏢 ${escapeHtml(b.name)}</div>
          ${b.city ? `<div>📍 ${escapeHtml(b.city)}</div>` : ''}
          ${b.address ? `<div style="color:#666">${escapeHtml(b.address)}</div>` : ''}
          ${b.phone ? `<div>📞 ${escapeHtml(b.phone)}</div>` : ''}
          <div style="margin-top:4px;color:#888;font-size:10px">${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}</div>
        </div>`,
      });
    });
    filteredDevices.forEach(d => {
      if (typeof d._lat !== 'number' || typeof d._lng !== 'number') return;
      const online = isOnline(tsToMs(d.lastActiveAt));
      const last = tsToMs(d.lastActiveAt);
      out.push({
        id: 'dev_' + d.deviceId, lat: d._lat, lng: d._lng,
        title: d.deviceName || d.deviceId, color: online ? 'green' : 'gray',
        popupHtml: `<div style="font-family:system-ui;font-size:12px;min-width:200px">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">💻 ${escapeHtml(d.deviceName || 'Device')}</div>
          <div>Status: <strong style="color:${online ? '#16a34a' : '#6b7280'}">${online ? 'Online' : 'Offline'}</strong></div>
          ${d.browser ? `<div>🌐 ${escapeHtml(d.browser)} / ${escapeHtml(d.os || '')}</div>` : ''}
          ${d.ip ? `<div>📡 ${escapeHtml(d.ip)}</div>` : ''}
          ${d.city || d.country ? `<div>📍 ${escapeHtml([d.city, d.country].filter(Boolean).join(', '))}</div>` : ''}
          ${d._fromBranch ? `<div style="color:#a16207;font-size:10px;margin-top:2px">📌 Approx (branch location — GPS off)</div>` : ''}
          ${last ? `<div style="color:#666">Last active: ${new Date(last).toLocaleString()}</div>` : ''}
        </div>`,
      });
    });
    return out;
  }, [visibleBranches, filteredDevices, currentBranchId]);

  const approved = devices.filter(d => d.approved);
  const onlineCount = approved.filter(d => isOnline(tsToMs(d.lastActiveAt))).length;
  const offlineCount = approved.length - onlineCount;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayLogins = devices.filter(d => tsToMs(d.loginAt) >= todayStart.getTime()).length;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Live Map — {tenantName}
          </h2>
          <p className="text-xs text-muted-foreground">Branches and devices on one live map. Auto-refresh every 60s.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {branches.length > 1 && (
            <div className="flex items-center gap-1 text-xs bg-muted/40 border rounded-md px-2 py-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-transparent outline-none text-xs font-medium"
              >
                <option value="all">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-1 text-xs cursor-pointer bg-muted/40 border rounded-md px-2 py-1">
            <input type="checkbox" checked={showOfflineDevices} onChange={(e) => setShowOfflineDevices(e.target.checked)} className="h-3 w-3" />
            Show offline
          </label>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Branches" value={branches.length} accent="text-primary" />
        <StatCard icon={<MapPin className="h-4 w-4" />} label="On Map" value={branches.filter(b => b.lat && b.lng).length} accent="text-primary" />
        <StatCard icon={<Wifi className="h-4 w-4" />} label="Online" value={onlineCount} accent="text-green-600" />
        <StatCard icon={<WifiOff className="h-4 w-4" />} label="Offline" value={offlineCount} accent="text-muted-foreground" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Today Logins" value={todayLogins} accent="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-2 overflow-hidden">
          <LeafletMap markers={markers} height={540} />
          <div className="flex items-center gap-3 px-2 pt-2 text-[10px] text-muted-foreground">
            <Legend color="bg-yellow-500" label="Current branch" />
            <Legend color="bg-blue-600" label="Branch" />
            <Legend color="bg-green-600" label="Device online" />
            <Legend color="bg-gray-500" label="Device offline" />
          </div>
        </Card>

        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Branches ({branches.length})
            </h3>
            {branches.length === 0 && <p className="text-xs text-muted-foreground italic">No branches.</p>}
            {branches.map(b => (
              <Card key={b.id} className="p-2.5 mb-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{b.name}</div>
                    {b.city && <div className="text-[10px] text-muted-foreground">{b.city}</div>}
                  </div>
                  {b.lat && b.lng ? (
                    <Badge className="text-[9px]">Mapped</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px]">No GPS</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
              <Smartphone className="h-3 w-3" /> Devices ({approved.length})
            </h3>
            {approved.length === 0 && <p className="text-xs text-muted-foreground italic">No approved devices yet.</p>}
            {approved.map(d => {
              const online = isOnline(tsToMs(d.lastActiveAt));
              const last = tsToMs(d.lastActiveAt);
              return (
                <Card key={d.deviceId} className="p-2.5 mb-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        {d.deviceName || d.browser}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{[d.city, d.country].filter(Boolean).join(', ')}</div>
                      {last > 0 && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" /> {timeAgo(last)}
                        </div>
                      )}
                    </div>
                    <Badge variant={online ? 'default' : 'outline'} className="text-[9px]">{online ? 'Online' : 'Offline'}</Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: any) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`text-xl font-extrabold ${accent}`}>{value}</div>
        </div>
        <div className={`${accent}`}>{icon}</div>
      </div>
    </Card>
  );
}
function Legend({ color, label }: any) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}</span>;
}
function escapeHtml(s: string) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!)); }
function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}
