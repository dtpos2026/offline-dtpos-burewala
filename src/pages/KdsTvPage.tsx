import { useState, useEffect, useMemo, useRef } from 'react';
import { getOrders, getSettings, getKitchens, getMenuItems, onDataChange, setOrderKitchenStatus } from '@/lib/store';
import { Order, RestaurantSettings, CartItem } from '@/lib/types';
import { Maximize2, Volume2, VolumeX, AlertTriangle, Clock, ChefHat } from 'lucide-react';

function playBeep(urgent = false) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx: AudioContext = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = urgent ? 'square' : 'sine';
    o.frequency.value = urgent ? 880 : 660;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (urgent ? 0.8 : 0.35));
    o.start();
    o.stop(ctx.currentTime + (urgent ? 0.85 : 0.4));
    if (urgent) {
      setTimeout(() => playBeep(false), 300);
      setTimeout(() => playBeep(false), 600);
    }
  } catch {}
}

function getKitchenFromUrl(): string {
  try {
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return 'all';
    const qs = new URLSearchParams(hash.slice(qIdx + 1));
    return qs.get('kitchen') || 'all';
  } catch { return 'all'; }
}

export default function KdsTvPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [recent, setRecent] = useState<Order[]>([]);
  // Orders that appeared on this screen within the last few seconds. They get
  // a NEW flag and an entry animation so a cook glancing up mid-task sees at
  // once that something arrived, rather than having to re-scan the board.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const [settings, setSettings] = useState<RestaurantSettings>(() => getSettings());
  const kitchens = useMemo(() => getKitchens(), []);
  const menuItems = useMemo(() => getMenuItems(), []);
  const itemKitchen = useMemo(() => {
    const m = new Map<string, string | undefined>();
    menuItems.forEach(mi => m.set(mi.id, mi.kitchenId));
    return m;
  }, [menuItems]);

  const activeKitchen = useMemo(() => getKitchenFromUrl(), []);
  const [soundOn, setSoundOn] = useState(true);
  const known = useRef<Set<string>>(new Set());
  const first = useRef(true);

  const kitchenName = useMemo(() => {
    if (activeKitchen === 'all') return 'ALL KITCHENS';
    if (activeKitchen === '__none__') return 'UNASSIGNED';
    return kitchens.find(k => k.id === activeKitchen)?.name?.toUpperCase() || 'KITCHEN';
  }, [activeKitchen, kitchens]);

  useEffect(() => {
    const refresh = () => {
      setSettings(getSettings());
      const all = getOrders().filter(o => {
        if (o.status === 'void' || o.status === 'cancelled') return false;
        const ds = (o as any).deliveryStatus;
        if (ds === 'rider_picked' || ds === 'onway' || ds === 'rider_reached' || ds === 'delivered') return false;
        if (o.kitchenStatus === 'served' || o.kitchenStatus === 'delivered') return false;
        if (o.status === 'paid') return false;
        if (o.status === 'running' || o.status === 'hold' || o.status === 'partial') return true;
        return false;
      });
      const sorted = all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // ===== RECENTLY FINISHED =====
      // The kitchen needs a short memory, not a history. A cook who has just
      // marked an order ready wants to see it leave the active board AND
      // confirm it went, and a cancellation has to be noticed within seconds
      // or food keeps being made. Anything older than this window is no
      // longer news and would only crowd the screen.
      const RECENT_MS = 10 * 60 * 1000;
      const since = Date.now() - RECENT_MS;
      const stamp = (o: any) => new Date(o.updatedAt || o.paidAt || o.createdAt || 0).getTime();
      const finished = getOrders()
        .filter(o => stamp(o) >= since)
        .filter(o => {
          const cancelled = o.status === 'void' || o.status === 'cancelled';
          const done = o.kitchenStatus === 'served' || o.kitchenStatus === 'delivered'
            || o.kitchenStatus === 'ready' || o.status === 'paid';
          return cancelled || done;
        })
        .sort((a, b) => stamp(b) - stamp(a))
        .slice(0, 8);
      setRecent(finished);
      if (soundOn && !first.current) {
        const fresh = sorted.filter(o => !known.current.has(o.id));
        if (fresh.length > 0) {
          const urgent = fresh.some(o => {
            const m = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
            return m >= (getSettings().kitchenWarningMinutes || 10);
          });
          playBeep(urgent);
        }
      }
      if (!first.current) {
        const arrived = sorted.filter(o => !known.current.has(o.id)).map(o => o.id);
        if (arrived.length) {
          setFreshIds(prev => new Set([...prev, ...arrived]));
          // The NEW flag is a nudge, not a state: it clears itself so the
          // board does not slowly fill with things that are no longer new.
          window.setTimeout(() => {
            setFreshIds(prev => {
              const next = new Set(prev);
              for (const id of arrived) next.delete(id);
              return next;
            });
          }, 20000);
        }
      }
      known.current = new Set(sorted.map(o => o.id));
      first.current = false;
      setOrders(sorted);
    };
    refresh();
    const unsub = onDataChange((col) => {
      if (col === 'orders' || col === 'settings') refresh();
    });
    const interval = setInterval(refresh, 10000);
    return () => { unsub(); clearInterval(interval); };
  }, [soundOn]);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 20000);
    return () => clearInterval(t);
  }, []);

  // Auto-fullscreen on user gesture (browsers block auto)
  const goFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const filterItems = (items: CartItem[]): CartItem[] => {
    if (activeKitchen === 'all') return items;
    if (activeKitchen === '__none__') return items.filter(i => !itemKitchen.get(i.menuItemId));
    return items.filter(i => itemKitchen.get(i.menuItemId) === activeKitchen);
  };

  const visible = orders
    .map(o => ({ order: o, items: filterItems(o.items) }))
    .filter(x => x.items.length > 0);

  const warn = settings.kitchenWarningMinutes || 10;
  const prep = settings.kitchenPreparingMinutes || 5;

  const advance = (orderId: string, current: string | undefined) => {
    const next = current === 'pending' || !current ? 'accepted'
      : current === 'accepted' ? 'preparing'
      : current === 'preparing' ? 'ready'
      : current === 'ready' ? 'delivered'
      : 'delivered';
    setOrderKitchenStatus(orderId, next as any);
    setTick(n => n + 1);
  };

  const labelFor = (s: string | undefined) => {
    if (!s || s === 'pending') return 'TAP TO ACCEPT';
    if (s === 'accepted') return 'TAP TO START';
    if (s === 'preparing') return 'TAP WHEN READY';
    if (s === 'ready') return 'TAP TO DELIVER';
    return s.toUpperCase();
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white overflow-auto" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Animations are scoped to this screen and deliberately restrained:
          a kitchen display is watched for hours, so anything that moves
          constantly becomes noise the staff learn to ignore. A card animates
          once as it arrives, the NEW flag pulses while it is genuinely new,
          and a late order breathes — nothing else. `prefers-reduced-motion`
          is honoured because some people cannot work under movement. */}
      <style>{`
        @keyframes kdsIn {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes kdsNew {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.55); }
          50%      { box-shadow: 0 0 0 10px rgba(251,191,36,0); }
        }
        @keyframes kdsLate {
          0%, 100% { border-color: rgb(239,68,68); }
          50%      { border-color: rgb(248,113,113); }
        }
        .kds-card { animation: kdsIn .28s cubic-bezier(.2,.7,.3,1) both; }
        .kds-new  { animation: kdsIn .28s cubic-bezier(.2,.7,.3,1) both, kdsNew 1.6s ease-out 3; }
        .kds-late { animation: kdsLate 1.4s ease-in-out infinite; }
        .kds-strip-item { animation: kdsIn .22s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .kds-card, .kds-new, .kds-late, .kds-strip-item { animation: none !important; }
        }
      `}</style>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-zinc-900 via-black to-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
        {settings.logo && <img src={settings.logo} alt="" className="h-10 w-10 object-contain rounded" />}
        <div className="min-w-0">
          <div className="text-xl font-black uppercase tracking-wide truncate">{settings.name || 'Restaurant'}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest">DT POS · Powered by Digital Target</div>
        </div>
        <div className="ml-4 px-4 py-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-sm uppercase tracking-wider">
          <ChefHat className="h-4 w-4 inline mr-1.5" />{kitchenName}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-2xl font-black tabular-nums">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          <button onClick={() => setSoundOn(s => !s)} className="p-2 rounded-md bg-zinc-800 hover:bg-zinc-700">
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-zinc-500" />}
          </button>
          <button onClick={goFullscreen} className="p-2 rounded-md bg-zinc-800 hover:bg-zinc-700">
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-6 py-2 grid grid-cols-4 gap-3 bg-zinc-950 border-b border-zinc-900">
        {[
          { label: 'ACTIVE', value: visible.length, color: 'text-white' },
          { label: 'PENDING', value: visible.filter(v => !v.order.kitchenStatus || v.order.kitchenStatus === 'pending').length, color: 'text-amber-400' },
          { label: 'COOKING', value: visible.filter(v => v.order.kitchenStatus === 'preparing').length, color: 'text-blue-400' },
          { label: 'DELAYED', value: visible.filter(v => Math.floor((Date.now() - new Date(v.order.createdAt).getTime()) / 60000) >= warn).length, color: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-[10px] text-zinc-500 font-bold tracking-widest">{s.label}</div>
            <div className={`text-3xl font-black tabular-nums ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Order grid */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {visible.map(({ order, items }) => {
          const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
          const isDelayed = mins >= warn;
          const isWarn = mins >= prep && mins < warn;
          const ks = order.kitchenStatus || 'pending';
          const customerName = (order as any).customerName || order.customer?.name || (order as any).creditCustomerName;
          const borderClr = isDelayed ? 'border-red-500 ring-2 ring-red-500/50 animate-pulse'
            : isWarn ? 'border-amber-500'
            : ks === 'ready' ? 'border-green-500'
            : ks === 'preparing' ? 'border-blue-500'
            : 'border-zinc-700';
          const isNew = freshIds.has(order.id);
          return (
            <div
              key={order.id}
              className={`rounded-xl border-2 bg-zinc-900 p-3 flex flex-col ${borderClr} ${isNew ? 'kds-new' : 'kds-card'} ${isDelayed ? 'kds-late' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-2xl font-black">#{order.orderNumber}</div>
                  {isNew && (
                    <span className="text-[10px] font-black tracking-widest bg-amber-400 text-black rounded px-1.5 py-0.5 shrink-0">
                      NEW
                    </span>
                  )}
                </div>
                <div className={`text-sm font-black tabular-nums px-2 py-0.5 rounded ${isDelayed ? 'bg-red-500/20 text-red-400' : isWarn ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                  {isDelayed ? <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> : <Clock className="h-3.5 w-3.5 inline mr-1" />}
                  {mins}m
                </div>
              </div>
              <div className="text-[11px] text-zinc-400 uppercase tracking-wide mb-2 flex flex-wrap gap-x-2">
                <span>{order.orderType}</span>
                {order.tableName && <span>· {order.tableName}</span>}
                {customerName && <span>· {customerName}</span>}
              </div>
              <div className="space-y-1 flex-1">
                {items.map(it => (
                  <div key={it.id} className="bg-black/50 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{it.name}</div>
                      {it.note && <div className="text-[10px] italic text-amber-300 truncate">📝 {it.note}</div>}
                    </div>
                    <div className="text-lg font-black text-amber-400 shrink-0">×{it.quantity}</div>
                  </div>
                ))}
              </div>
              {order.notes && <div className="mt-2 text-[10px] italic text-amber-300/80">📝 {order.notes}</div>}
              <button
                onClick={() => advance(order.id, ks)}
                className={`mt-2 w-full py-2 rounded-lg font-black text-xs tracking-wider transition ${
                  ks === 'pending' ? 'bg-amber-500 hover:bg-amber-400 text-black'
                    : ks === 'accepted' ? 'bg-blue-500 hover:bg-blue-400 text-white'
                    : ks === 'preparing' ? 'bg-green-500 hover:bg-green-400 text-white'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                }`}
              >
                {labelFor(ks)}
              </button>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="col-span-full text-center py-32">
            <ChefHat className="h-20 w-20 mx-auto text-zinc-700 mb-4" />
            <div className="text-2xl font-black text-zinc-600">NO ACTIVE ORDERS</div>
            <div className="text-sm text-zinc-700 mt-2">Waiting for new orders…</div>
          </div>
        )}
      </div>

      {/* ===== RECENTLY FINISHED =====
          A short memory, pinned to the bottom so it never competes with the
          active board. Completed orders confirm to a cook that what they
          marked ready actually left; a CANCELLED entry is the one thing on
          this screen that must be noticed within seconds, because food is
          still being made until someone sees it. Hence the red treatment and
          the strike-through on the number. */}
      {recent.length > 0 && (
        <div className="sticky bottom-0 bg-zinc-950/95 backdrop-blur border-t border-zinc-800 px-4 py-2">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-[10px] font-black tracking-widest text-zinc-500 shrink-0">
              RECENTLY FINISHED
            </span>
            {recent.map(o => {
              const cancelled = o.status === 'void' || o.status === 'cancelled';
              return (
                <div
                  key={o.id}
                  className={`kds-strip-item shrink-0 rounded-lg border px-3 py-1.5 flex items-center gap-2 ${
                    cancelled
                      ? 'border-red-500/60 bg-red-500/10'
                      : 'border-green-500/40 bg-green-500/10'
                  }`}
                >
                  <span className={`font-black text-lg tabular-nums ${
                    cancelled ? 'text-red-400 line-through' : 'text-green-400'
                  }`}>
                    #{o.orderNumber}
                  </span>
                  <span className={`text-[10px] font-black tracking-wider ${
                    cancelled ? 'text-red-300' : 'text-green-300'
                  }`}>
                    {cancelled ? 'CANCELLED' : 'DONE'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
