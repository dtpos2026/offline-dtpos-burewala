import { useState, useEffect, useMemo, useRef } from 'react';
import { getOrders, getSettings, getKitchens, getMenuItems, onDataChange, setOrderKitchenStatus } from '@/lib/store';
import { Order, RestaurantSettings, CartItem } from '@/lib/types';
import { Maximize2, Volume2, VolumeX, AlertTriangle, Clock, ChefHat } from 'lucide-react';
import {
  loadKitchenDisplay, resolveKitchenTemplate, kitchenColumns,
  type KitchenDisplayConfig,
} from '@/lib/kitchenDisplay';
import { templateVars, scaledFont, DEVELOPER_CREDIT } from '@/lib/displayTemplates';

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

/**
 * The screen's own dimensions, kept current.
 *
 * The board is opened full-screen on whichever monitor the shop chose, and
 * that can be anything from a 4K TV to a 1024x768 panel. Automatic template
 * mode and the column count both need the real numbers.
 */
function useViewport() {
  const [size, setSize] = useState(() => ({
    w: typeof window === 'undefined' ? 1920 : window.innerWidth,
    h: typeof window === 'undefined' ? 1080 : window.innerHeight,
  }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
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
  const [display, setDisplay] = useState<KitchenDisplayConfig>(() => loadKitchenDisplay());
  const [soundOn, setSoundOn] = useState(() => loadKitchenDisplay().sound);
  const { w: vw, h: vh } = useViewport();
  const template = useMemo(
    () => resolveKitchenTemplate(display, vw, vh),
    [display.templateId, display.templateMode, vw, vh], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const columns = kitchenColumns(display, vw, template.density);
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

  // The board is usually a second window; a settings change in the POS window
  // has to reach it without the shop restarting the display.
  useEffect(() => {
    const onCfg = () => {
      const next = loadKitchenDisplay();
      setDisplay(next);
      setSoundOn(next.sound);
    };
    window.addEventListener('dtpos-kitchen-display-changed', onCfg);
    return () => window.removeEventListener('dtpos-kitchen-display-changed', onCfg);
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
    <div
      className="fixed inset-0 z-[9999] overflow-auto"
      style={{
        ...templateVars(template),
        background: 'var(--dt-bg)',
        color: 'var(--dt-text)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
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
          0%, 100% { box-shadow: 0 0 0 0 var(--dt-preparing); }
          50%      { box-shadow: 0 0 0 10px transparent; }
        }
        @keyframes kdsLate {
          0%, 100% { border-color: var(--dt-alert); opacity: 1; }
          50%      { border-color: var(--dt-alert); opacity: .72; }
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
      {/* ===== HEADER — the RESTAURANT's board =====
          Its logo and its name are the largest things here. Digital Target
          built the software and appears once, small, underneath. */}
      <div
        className="sticky top-0 z-10 border-b px-6 py-3 flex items-center gap-4"
        style={{ background: 'var(--dt-accent)', color: 'var(--dt-on-accent)', borderColor: 'var(--dt-border)' }}
      >
        {settings.logo && <img src={settings.logo} alt="" className="h-10 w-10 object-contain rounded shrink-0" />}
        <div className="min-w-0">
          <div className="font-black uppercase tracking-wide truncate"
               style={{ fontSize: scaledFont(1.25, template.typeScale, 0.6) }}>
            {settings.name || 'Restaurant'}
          </div>
          {display.showDeveloperCredit && (
            <div className="uppercase tracking-widest opacity-50" style={{ fontSize: '10px' }}>
              {DEVELOPER_CREDIT}
            </div>
          )}
        </div>
        <div
          className="ml-4 px-4 py-1.5 rounded-md border font-black uppercase tracking-wider shrink-0"
          style={{
            borderColor: 'var(--dt-preparing)',
            color: 'var(--dt-preparing)',
            fontSize: scaledFont(0.875, template.typeScale, 0.3),
          }}
        >
          <ChefHat className="h-4 w-4 inline mr-1.5" />{kitchenName}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="font-black tabular-nums" style={{ fontSize: scaledFont(1.5, template.typeScale, 0.7) }}>
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={() => setSoundOn(s => !s)} className="p-2 rounded-md"
                  style={{ background: 'rgba(127,127,127,0.25)' }}>
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 opacity-50" />}
          </button>
          <button onClick={goFullscreen} className="p-2 rounded-md" style={{ background: 'rgba(127,127,127,0.25)' }}>
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="px-6 py-2 grid grid-cols-4 gap-3 border-b"
           style={{ background: 'var(--dt-surface)', borderColor: 'var(--dt-border)' }}>
        {[
          { label: 'ACTIVE', value: visible.length, color: 'var(--dt-text)' },
          { label: 'PENDING', value: visible.filter(v => !v.order.kitchenStatus || v.order.kitchenStatus === 'pending').length, color: 'var(--dt-preparing)' },
          { label: 'COOKING', value: visible.filter(v => v.order.kitchenStatus === 'preparing').length, color: 'var(--dt-preparing)' },
          { label: 'DELAYED', value: visible.filter(v => Math.floor((Date.now() - new Date(v.order.createdAt).getTime()) / 60000) >= warn).length, color: 'var(--dt-alert)' },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-[10px] font-bold tracking-widest opacity-60">{s.label}</div>
            <div className="font-black tabular-nums"
                 style={{ color: s.color, fontSize: scaledFont(1.875, template.typeScale, 0.9) }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Order grid */}
      {/* Ticket columns come from the screen's real width, not from breakpoints:
          a 1366-wide monitor and a 3840-wide TV are both "xl" to Tailwind and
          are not remotely the same board. */}
      <div
        className="p-4 grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visible.map(({ order, items }) => {
          const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
          const isDelayed = mins >= warn;
          const isWarn = mins >= prep && mins < warn;
          const ks = order.kitchenStatus || 'pending';
          const customerName = (order as any).customerName || order.customer?.name || (order as any).creditCustomerName;
          // Status colour comes from the template, so a shop that picks the
          // Clean board gets its darker, print-legible set and the Colourful
          // one gets its loud set — same meaning, different palette.
          const statusClr = isDelayed ? 'var(--dt-alert)'
            : isWarn ? 'var(--dt-preparing)'
            : ks === 'ready' ? 'var(--dt-ready)'
            : ks === 'preparing' ? 'var(--dt-preparing)'
            : 'var(--dt-border)';
          const timeClr = isDelayed ? 'var(--dt-alert)' : isWarn ? 'var(--dt-preparing)' : 'var(--dt-ready)';
          const actionClr = ks === 'pending' ? 'var(--dt-preparing)'
            : ks === 'accepted' ? 'var(--dt-preparing)'
            : ks === 'preparing' ? 'var(--dt-ready)'
            : 'var(--dt-border)';
          const isNew = freshIds.has(order.id);
          return (
            <div
              key={order.id}
              className={`border-2 p-3 flex flex-col ${isNew ? 'kds-new' : 'kds-card'} ${isDelayed ? 'kds-late' : ''}`}
              style={{
                borderRadius: 'var(--dt-radius)',
                background: 'var(--dt-surface)',
                borderColor: statusClr,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-black" style={{ fontSize: scaledFont(1.5, template.numberScale, 0.8) }}>
                    #{order.orderNumber}
                  </div>
                  {isNew && (
                    <span className="text-[10px] font-black tracking-widest rounded px-1.5 py-0.5 shrink-0"
                          style={{ background: 'var(--dt-preparing)', color: 'var(--dt-bg)' }}>
                      NEW
                    </span>
                  )}
                </div>
                <div className="font-black tabular-nums px-2 py-0.5 rounded"
                     style={{ color: timeClr, border: `1px solid ${timeClr}`, fontSize: scaledFont(0.875, template.typeScale, 0.25) }}>
                  {isDelayed ? <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> : <Clock className="h-3.5 w-3.5 inline mr-1" />}
                  {mins}m
                </div>
              </div>
              <div className="uppercase tracking-wide mb-2 flex flex-wrap gap-x-2 opacity-60"
                   style={{ fontSize: scaledFont(0.7, template.typeScale, 0.2) }}>
                <span>{order.orderType}</span>
                {order.tableName && <span>· {order.tableName}</span>}
                {customerName && <span>· {customerName}</span>}
              </div>
              <div className="space-y-1 flex-1">
                {items.map(it => (
                  <div key={it.id} className="rounded px-2 py-1.5 flex items-center justify-between gap-2"
                       style={{ background: 'rgba(127,127,127,0.16)' }}>
                    <div className="min-w-0">
                      <div className="font-bold truncate" style={{ fontSize: scaledFont(0.875, template.typeScale, 0.3) }}>
                        {it.name}
                      </div>
                      {it.note && (
                        <div className="italic truncate" style={{ color: 'var(--dt-preparing)', fontSize: scaledFont(0.7, template.typeScale, 0.2) }}>
                          📝 {it.note}
                        </div>
                      )}
                    </div>
                    <div className="font-black shrink-0"
                         style={{ color: 'var(--dt-preparing)', fontSize: scaledFont(1.125, template.numberScale, 0.5) }}>
                      ×{it.quantity}
                    </div>
                  </div>
                ))}
              </div>
              {order.notes && (
                <div className="mt-2 italic" style={{ color: 'var(--dt-preparing)', fontSize: scaledFont(0.7, template.typeScale, 0.2) }}>
                  📝 {order.notes}
                </div>
              )}
              <button
                onClick={() => advance(order.id, ks)}
                className="mt-2 w-full py-2 font-black tracking-wider transition hover:opacity-85"
                style={{
                  borderRadius: 'var(--dt-radius)',
                  background: actionClr,
                  color: 'var(--dt-bg)',
                  fontSize: scaledFont(0.75, template.typeScale, 0.22),
                }}
              >
                {labelFor(ks)}
              </button>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="col-span-full text-center py-32 opacity-40">
            <ChefHat className="h-20 w-20 mx-auto mb-4" />
            <div className="font-black" style={{ fontSize: scaledFont(1.5, template.typeScale, 0.7) }}>
              NO ACTIVE ORDERS
            </div>
            <div className="mt-2" style={{ fontSize: scaledFont(0.875, template.typeScale, 0.3) }}>
              Waiting for new orders…
            </div>
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
        <div className="sticky bottom-0 backdrop-blur border-t px-4 py-2"
             style={{ background: 'var(--dt-surface)', borderColor: 'var(--dt-border)' }}>
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-[10px] font-black tracking-widest opacity-50 shrink-0">
              RECENTLY FINISHED
            </span>
            {recent.map(o => {
              const cancelled = o.status === 'void' || o.status === 'cancelled';
              const clr = cancelled ? 'var(--dt-alert)' : 'var(--dt-ready)';
              return (
                <div
                  key={o.id}
                  className="kds-strip-item shrink-0 border px-3 py-1.5 flex items-center gap-2"
                  style={{ borderRadius: 'var(--dt-radius)', borderColor: clr }}
                >
                  <span className={`font-black tabular-nums ${cancelled ? 'line-through' : ''}`}
                        style={{ color: clr, fontSize: scaledFont(1.125, template.numberScale, 0.5) }}>
                    #{o.orderNumber}
                  </span>
                  <span className="text-[10px] font-black tracking-wider" style={{ color: clr }}>
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
