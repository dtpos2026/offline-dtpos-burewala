import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrders, saveOrder, getUsers, getRiders, saveRider, getSettings, refreshOrdersFromCloud, onDataChange } from '@/lib/store';
import { Order, DeliveryStatus, Rider } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bike, MapPin, Phone, Navigation, CheckCircle, Truck, PackageCheck, ChefHat, XCircle, Radio, RefreshCw, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { normalizePhone, openWhatsApp } from '@/lib/whatsapp';
import { buildTrackingMessage, setDeliveryStage, DELIVERY_STAGE_LABEL, computeDistance, estimateEta, notifyCustomerStage } from '@/lib/delivery';
import DeliveryRouteMap from '@/components/DeliveryRouteMap';
import ReadyNotificationBus from '@/components/ReadyNotificationBus';
import ReadyOrderPoller from '@/components/ReadyOrderPoller';

const STAGE_FLOW: { stage: DeliveryStatus; label: string; icon: any; color: string }[] = [
  { stage: 'rider_picked',  label: 'Picked Up',     icon: PackageCheck, color: 'bg-amber-500 hover:bg-amber-600 text-white' },
  { stage: 'onway',         label: 'On the Way',    icon: Truck,        color: 'bg-blue-600 hover:bg-blue-700 text-white' },
  { stage: 'rider_reached', label: 'Reached',       icon: MapPin,       color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  { stage: 'delivered',     label: 'Delivered',     icon: CheckCircle,  color: 'bg-green-600 hover:bg-green-700 text-white' },
];

const RIDER_PORTAL_KEY = 'rider-portal-id';

function isPublicRiderRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.startsWith('#/rider-portal');
}

function getCurrentRider(): Rider | null {
  // Public portal: only trust saved rider id from PIN login
  if (isPublicRiderRoute()) {
    const rid = localStorage.getItem(RIDER_PORTAL_KEY) || '';
    if (rid) return getRiders().find(r => r.id === rid) || null;
    return null;
  }
  // Staff route: derive from logged-in user
  const uid = localStorage.getItem('pos-user-id') || '';
  const user = getUsers().find(u => u.id === uid);
  if (!user) return null;
  const riders = getRiders();
  let r = riders.find(rd => (rd.phone || '').replace(/\D/g, '') === ((user as any).phone || '').replace(/\D/g, ''));
  if (!r) r = riders.find(rd => rd.name.toLowerCase() === user.name.toLowerCase());
  if (!r && user.role === 'rider') {
    r = { id: 'rider_' + user.id, name: user.name, phone: (user as any).phone || '', isActive: true };
    saveRider(r);
  }
  return r || null;
}

export default function RiderAppPage() {
  const [rider, setRider] = useState<Rider | null>(() => getCurrentRider());
  const [allRiders] = useState(() => getRiders().filter(r => r.isActive));
  const [orders, setOrders] = useState<Order[]>(() => getOrders());
  const [tick, setTick] = useState(0);
  const [tracking, setTracking] = useState<boolean>(() => localStorage.getItem('rider-tracking') === '1');
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Public-portal login state
  const publicMode = isPublicRiderRoute();
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Refresh every 15s — P4 fix: pull from cloud + subscribe to live changes.
  useEffect(() => {
    let cancel = false;
    const pull = async () => {
      try { await refreshOrdersFromCloud(); } catch {}
      if (!cancel) { setOrders(getOrders()); setTick(x => x + 1); }
    };
    pull();
    const t = setInterval(pull, 15000);
    const unsub = onDataChange((col) => {
      if (col === 'orders' && !cancel) { setOrders(getOrders()); setTick(x => x + 1); }
    });
    return () => { cancel = true; clearInterval(t); unsub(); };
  }, []);

  // Rider heartbeat: every 30s stamp lastSeenAt so admin sees online/offline.
  useEffect(() => {
    if (!rider) return;
    const ping = () => {
      try {
        const fresh = getRiders().find(r => r.id === rider.id);
        if (!fresh) return;
        saveRider({ ...fresh, lastSeenAt: new Date().toISOString() });
      } catch {}
    };
    ping();
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(ping, 30_000);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [rider?.id]);

  // Ready-for-pickup toast (rider receives "Order #N ready, please pick up")
  useEffect(() => {
    if (!rider) return;
    const seen = new Set<string>();
    const tick = () => {
      const list = getOrders().filter(o =>
        o.orderType === 'delivery' &&
        o.deliveryStatus === 'ready' &&
        (!o.riderId || o.riderId === rider.id) &&
        !seen.has(o.id)
      );
      for (const o of list) {
        seen.add(o.id);
        toast.success(`📦 Order #${o.orderNumber} READY — please pick up`, { duration: 10000 });
      }
    };
    const t = setInterval(tick, 10000);
    tick();
    return () => clearInterval(t);
  }, [rider?.id]);

  // Live tracking: watch position, push to assigned orders
  useEffect(() => {
    if (!tracking || !rider) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      return;
    }
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); setTracking(false); return; }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMyPos({ lat, lng });
        // Push to all of my active orders
        const active = getOrders().filter(o =>
          o.orderType === 'delivery' &&
          o.riderId === rider.id &&
          o.deliveryStatus &&
          !['delivered', 'cancelled'].includes(o.deliveryStatus)
        );
        for (const o of active) {
          const delivery = { ...(o.delivery || {}) };
          delivery.riderLat = lat;
          delivery.riderLng = lng;
          delivery.route = [...(delivery.route || []), { lat, lng, t: new Date().toISOString() }].slice(-200);
          if (delivery.customerLat && delivery.customerLng) {
            delivery.distanceKm = computeDistance({ lat, lng }, { lat: delivery.customerLat, lng: delivery.customerLng });
            delivery.etaMinutes = estimateEta(delivery.distanceKm);
          }
          saveOrder({ ...o, delivery, riderPingedAt: new Date().toISOString() } as any);
        }
        setOrders(getOrders());
      },
      (err) => { console.warn(err); toast.error('GPS error: ' + err.message); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [tracking, rider]);

  const toggleTracking = () => {
    const next = !tracking;
    setTracking(next);
    localStorage.setItem('rider-tracking', next ? '1' : '0');
    if (next) toast.success('Live tracking ON'); else toast('Live tracking OFF');
  };

  const myOrders = useMemo(() => {
    if (!rider) return [];
    return orders
      .filter(o => o.orderType === 'delivery' && o.deliveryStatus && o.riderId === rider.id)
      .filter(o => !['delivered', 'cancelled'].includes(o.deliveryStatus!))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, rider, tick]);

  const unassigned = useMemo(() =>
    orders.filter(o => o.orderType === 'delivery' && o.deliveryStatus && !o.riderId &&
      ['ready', 'cooking', 'pending', 'accepted'].includes(o.deliveryStatus!))
    , [orders, tick]);

  const completedToday = useMemo(() => {
    if (!rider) return [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return orders.filter(o => o.riderId === rider.id && o.deliveredAt && new Date(o.deliveredAt).getTime() >= start.getTime());
  }, [orders, rider]);

  const claimOrder = (o: Order) => {
    if (!rider) return;
    const next = setDeliveryStage({ ...o, riderId: rider.id, riderName: rider.name, riderPhone: rider.phone }, 'rider_assigned');
    saveOrder(next);
    setOrders(getOrders());
    toast.success(`Order #${o.orderNumber} claimed`);
  };

  const advance = (o: Order, stage: DeliveryStatus) => {
    let next = setDeliveryStage(o, stage);
    if (stage === 'delivered') {
      next = { ...next, status: 'paid', paidAt: new Date().toISOString() } as Order;
      // Rider loyalty + lifetime delivered count
      try {
        const s = getSettings();
        if (rider && s?.riderLoyaltyEnabled !== false) {
          const fresh = getRiders().find(r => r.id === rider.id) || rider;
          const inc = Math.max(0, s?.riderLoyaltyPerDelivery ?? 1);
          saveRider({
            ...fresh,
            loyaltyPoints: (fresh.loyaltyPoints || 0) + inc,
            totalDeliveries: (fresh.totalDeliveries || 0) + 1,
          });
        }
      } catch {}
    }
    saveOrder(next);
    notifyCustomerStage(next, stage);
    setOrders(getOrders());
    toast.success(DELIVERY_STAGE_LABEL[stage]);
  };

  const sendTracking = (o: Order) => {
    const phone = normalizePhone(o.customer?.phone);
    if (!phone) { toast.error('No customer phone'); return; }
    openWhatsApp(phone, buildTrackingMessage(o));
  };

  if (!rider) {
    // Public portal: phone + PIN login
    if (publicMode) {
      const doLogin = () => {
        const ph = loginPhone.replace(/\D/g, '');
        if (ph.length < 10) { toast.error('Valid phone likhein'); return; }
        const all = getRiders();
        const match = all.find(r =>
          r.isActive && (r.phone || '').replace(/\D/g, '').slice(-10) === ph.slice(-10)
        );
        if (!match) { toast.error('No rider found for this phone number'); return; }
        const pin = (match.pin || '0000');
        if (loginPin !== pin) { toast.error('Incorrect PIN'); return; }
        localStorage.setItem(RIDER_PORTAL_KEY, match.id);
        setRider(match);
        toast.success(`Welcome ${match.name}!`);
      };
      return (
        <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
          <Card className="p-6 max-w-sm w-full space-y-4">
            <div className="text-center space-y-2">
              <div className="h-14 w-14 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Bike className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-extrabold">Rider Portal</h2>
              <p className="text-xs text-muted-foreground">Enter your phone and 4-digit PIN</p>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold">Phone Number</label>
              <input type="tel" value={loginPhone} onChange={e => setLoginPhone(e.target.value)} placeholder="03xxxxxxxxx"
                className="w-full h-11 px-3 rounded-md border bg-background text-base" autoFocus />
              <label className="text-[11px] font-semibold">PIN</label>
              <input type="password" inputMode="numeric" maxLength={6} value={loginPin}
                onChange={e => setLoginPin(e.target.value.replace(/\D/g, ''))} placeholder="••••"
                className="w-full h-11 px-3 rounded-md border bg-background text-base font-mono tracking-widest text-center"
                onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
            </div>
            <Button className="w-full h-11 text-sm font-bold" onClick={doLogin}>
              Login as Rider
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Default PIN: <b>0000</b> (admin Settings → Riders se change kar sakta hai)
            </p>
          </Card>
        </div>
      );
    }
    // Staff route: quick picker
    return (
      <div className="p-4 max-w-md mx-auto space-y-3">
        <Card className="p-4 text-center space-y-2">
          <Bike className="h-10 w-10 mx-auto text-primary" />
          <h2 className="font-bold">Select your rider profile</h2>
          <p className="text-xs text-muted-foreground">Your login isn't linked to a rider. Pick yourself:</p>
          {allRiders.length === 0 && <p className="text-xs text-destructive">No riders configured. Ask admin to add riders in Settings.</p>}
          <div className="space-y-2 pt-2">
            {allRiders.map(r => (
              <Button key={r.id} variant="outline" className="w-full justify-start" onClick={() => { localStorage.setItem('rider-profile-id', r.id); setRider(r); }}>
                <UserIcon className="h-4 w-4 mr-2" /> {r.name} <span className="ml-auto text-[10px] text-muted-foreground">{r.phone}</span>
              </Button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 lg:p-6 max-w-2xl mx-auto space-y-3">
      <ReadyNotificationBus />
      <ReadyOrderPoller types={['delivery']} />
      {/* Header */}
      <div className="rounded-2xl p-4 bg-gradient-hero text-primary-foreground shadow-elegant flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-white/15 text-primary-foreground flex items-center justify-center">
          <Bike className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold truncate">{rider.name}</div>
          <div className="text-[11px] opacity-80">{rider.phone}</div>
        </div>
        <Button size="sm" variant={tracking ? 'default' : 'secondary'} onClick={toggleTracking} className={tracking ? 'bg-green-600 hover:bg-green-700 text-white' : ''}>
          <Radio className={`h-4 w-4 mr-1 ${tracking ? 'animate-pulse' : ''}`} />
          {tracking ? 'LIVE' : 'Go Live'}
        </Button>
        {publicMode && (
          <Button size="sm" variant="ghost" title="Logout" className="text-primary-foreground hover:bg-white/15"
            onClick={() => { localStorage.removeItem(RIDER_PORTAL_KEY); setRider(null); setLoginPhone(''); setLoginPin(''); }}>
            <UserIcon className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Active" value={myOrders.length} accent="text-blue-600" />
        <StatTile label="Done Today" value={completedToday.length} accent="text-green-600" />
        <StatTile label="Earnings" value={`Rs.${completedToday.reduce((s, o) => s + (o.grandTotal || 0), 0).toLocaleString()}`} accent="text-primary" small />
      </div>

      {myPos && (
        <div className="text-[10px] text-muted-foreground text-center">
          📍 {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)} · pings save automatically
        </div>
      )}

      {/* My Orders */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
          <Truck className="h-3 w-3" /> My Active Orders ({myOrders.length})
        </h3>
        {myOrders.length === 0 && (
          <Card className="p-6 text-center text-xs text-muted-foreground">No active orders.</Card>
        )}
        <div className="space-y-2">
          {myOrders.map(o => <OrderCard key={o.id} order={o} riderPos={myPos} onAdvance={advance} onTracking={sendTracking} />)}
        </div>
      </div>

      {/* Unassigned orders to claim */}
      {unassigned.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
            <PackageCheck className="h-3 w-3" /> Available Orders ({unassigned.length})
          </h3>
          <div className="space-y-2">
            {unassigned.map(o => (
              <Card key={o.id} className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">#{o.orderNumber} · Rs. {o.grandTotal.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{o.customer?.name} · {o.customer?.address}</div>
                </div>
                <Button size="sm" onClick={() => claimOrder(o)}>Claim</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={() => setOrders(getOrders())}>
        <RefreshCw className="h-3 w-3 mr-1" /> Refresh
      </Button>
    </div>
  );
}

function OrderCard({ order, riderPos, onAdvance, onTracking }: { order: Order; riderPos?: { lat: number; lng: number } | null; onAdvance: (o: Order, s: DeliveryStatus) => void; onTracking: (o: Order) => void }) {
  const s = getSettings();
  const branch = (s?.restaurantLat != null && s?.restaurantLng != null) ? { lat: s.restaurantLat, lng: s.restaurantLng } : null;
  const phone = normalizePhone(order.customer?.phone);
  const lat = order.delivery?.customerLat;
  const lng = order.delivery?.customerLng;
  const stage = order.deliveryStatus || 'pending';
  const nextStages = STAGE_FLOW.filter(s => s.stage !== stage);

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-bold text-sm">#{order.orderNumber}</div>
        <Badge variant="secondary" className="text-[10px]">{DELIVERY_STAGE_LABEL[stage]}</Badge>
      </div>
      {order.customer && (
        <div className="space-y-0.5 text-[12px]">
          <div className="font-medium">{order.customer.name}</div>
          {phone && (
            <a href={`tel:${phone}`} className="text-primary inline-flex items-center gap-1">
              <Phone className="h-3 w-3" /> {order.customer.phone}
            </a>
          )}
          <div className="text-muted-foreground flex items-start gap-1">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{order.customer.address}</span>
          </div>
        </div>
      )}
      {(lat != null && lng != null) && (
        <DeliveryRouteMap
          branch={branch}
          rider={riderPos || null}
          customer={{ lat, lng }}
          height={220}
        />
      )}
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-primary">Rs. {order.grandTotal.toLocaleString()}</span>
        {order.delivery?.distanceKm != null && (
          <span className="text-muted-foreground">{order.delivery.distanceKm.toFixed(1)} km · ~{order.delivery.etaMinutes || estimateEta(order.delivery.distanceKm)} min</span>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        {lat != null && lng != null ? (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" variant="outline" className="w-full h-8 text-[11px]"><Navigation className="h-3 w-3 mr-1" /> Navigate</Button>
          </a>
        ) : order.customer?.address ? (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer.address)}`} target="_blank" rel="noreferrer" className="flex-1">
            <Button size="sm" variant="outline" className="w-full h-8 text-[11px]"><Navigation className="h-3 w-3 mr-1" /> Navigate</Button>
          </a>
        ) : null}
        <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!phone} onClick={() => onTracking(order)}>
          Tracking
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1 pt-1">
        {nextStages.map(s => (
          <Button key={s.stage} size="sm" className={`h-8 text-[11px] ${s.color}`} onClick={() => onAdvance(order, s.stage)}>
            <s.icon className="h-3 w-3 mr-1" /> {s.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function StatTile({ label, value, accent, small }: { label: string; value: any; accent?: string; small?: boolean }) {
  return (
    <Card className="p-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-extrabold ${accent || ''} ${small ? 'text-sm' : 'text-lg'}`}>{value}</div>
    </Card>
  );
}
