// ============================================================
// CUSTOMER DISPLAY — the screen above the counter.
//
// The customer standing there needs two answers, readable from across the
// room: is my order being made, and is it ready. Everything else on this
// screen is secondary to those two columns, which is why they take the space
// and the banners take what is left.
//
// Design decisions worth keeping
// ------------------------------
//  • READY is the loud side. The numbers are the largest type on the screen,
//    green, and a newly-ready order flashes and is spoken aloud. Someone who
//    looked away for ten seconds must not miss their number.
//  • A ready order stays on screen for a hold period AFTER it is collected,
//    because a customer who stepped outside comes back and looks up.
//  • The media panel only appears when the shop has actually added banners.
//    An empty panel is worse than no panel.
//  • Nothing here can change an order. It is a display; every status comes
//    from the kitchen.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrders, getSettings, onDataChange } from '@/lib/store';
import type { Order, RestaurantSettings } from '@/lib/types';
import {
  loadDisplayConfig,
  announceOrder,
  type CustomerDisplayConfig,
  type DisplayMedia,
} from '@/lib/customerDisplay';
import { Volume2, VolumeX, Maximize2, ChefHat, CheckCircle2 } from 'lucide-react';

/** Orders the kitchen is still working on. */
function isPreparing(o: Order): boolean {
  const ks = o.kitchenStatus;
  if (ks === 'ready' || ks === 'served' || ks === 'delivered') return false;
  if (o.status === 'void' || o.status === 'cancelled') return false;
  return o.status === 'running' || o.status === 'hold' || o.status === 'partial' || ks === 'preparing' || ks === 'accepted';
}

/** Orders that are ready to collect. */
function isReady(o: Order): boolean {
  if (o.status === 'void' || o.status === 'cancelled') return false;
  return o.kitchenStatus === 'ready';
}

function minutesSince(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function CustomerDisplayPage() {
  const [cfg, setCfg] = useState<CustomerDisplayConfig>(() => loadDisplayConfig());
  const [settings, setSettings] = useState<RestaurantSettings>(() => getSettings());
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());

  // Orders already announced. Without this an order would be re-announced on
  // every refresh for as long as it stayed ready — which is how a display
  // ends up shouting the same number for two minutes.
  const announced = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  // When each order became ready, so it can be held on screen after collection.
  const readyAt = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const refresh = () => {
      setSettings(getSettings());
      setOrders(getOrders());
    };
    refresh();
    const unsub = onDataChange(col => {
      if (col === 'orders' || col === 'settings') refresh();
    });
    const poll = setInterval(refresh, 5000);
    // Wait times move; re-render on their own clock rather than on data.
    const clock = setInterval(() => setTick(n => n + 1), 15000);
    return () => { unsub(); clearInterval(poll); clearInterval(clock); };
  }, []);

  useEffect(() => {
    const onCfg = () => setCfg(loadDisplayConfig());
    window.addEventListener('dtpos-customer-display-changed', onCfg);
    return () => window.removeEventListener('dtpos-customer-display-changed', onCfg);
  }, []);

  const preparing = useMemo(
    () => orders.filter(isPreparing).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders],
  );

  const ready = useMemo(() => {
    const now = Date.now();
    const live = orders.filter(isReady);
    for (const o of live) if (!readyAt.current.has(o.id)) readyAt.current.set(o.id, now);
    // Hold each one on screen for the configured period after it went ready.
    const holdMs = cfg.readyHoldSeconds * 1000;
    return live
      .filter(o => now - (readyAt.current.get(o.id) || now) <= holdMs)
      .sort((a, b) => (readyAt.current.get(b.id) || 0) - (readyAt.current.get(a.id) || 0));
  }, [orders, cfg.readyHoldSeconds]);

  // Announce newly-ready orders.
  useEffect(() => {
    if (firstLoad.current) {
      // Everything already ready when the screen opened is not news.
      for (const o of ready) announced.current.add(o.id);
      firstLoad.current = false;
      return;
    }
    const fresh = ready.filter(o => !announced.current.has(o.id));
    if (!fresh.length) return;

    for (const o of fresh) announced.current.add(o.id);
    setFlash(prev => new Set([...prev, ...fresh.map(o => o.id)]));
    window.setTimeout(() => {
      setFlash(prev => {
        const next = new Set(prev);
        for (const o of fresh) next.delete(o.id);
        return next;
      });
    }, 6000);

    if (cfg.announce && !muted) {
      for (const o of fresh) announceOrder(o.orderNumber ?? '', cfg);
    }
  }, [ready, cfg, muted]);

  const goFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const hasMedia = cfg.media.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0b1220] text-white overflow-hidden flex flex-col"
         style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes cdIn { from { opacity:0; transform: scale(.9); } to { opacity:1; transform:none; } }
        @keyframes cdFlash {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.7); }
          50%     { box-shadow: 0 0 0 22px rgba(34,197,94,0); }
        }
        .cd-in    { animation: cdIn .3s cubic-bezier(.2,.7,.3,1) both; }
        .cd-flash { animation: cdIn .3s cubic-bezier(.2,.7,.3,1) both, cdFlash 1.5s ease-out 4; }
        @media (prefers-reduced-motion: reduce) { .cd-in,.cd-flash { animation:none !important; } }
      `}</style>

      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-4 bg-black/40 border-b border-white/10">
        {settings.logo && <img src={settings.logo} alt="" className="h-14 w-14 object-contain rounded" />}
        <div className="min-w-0">
          <div className="text-3xl font-black uppercase tracking-wide truncate">
            {settings.name || 'Restaurant'}
          </div>
          <div className="text-sm text-white/50 uppercase tracking-[0.25em]">{cfg.heading}</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-4xl font-black tabular-nums">
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={() => setMuted(m => !m)}
                  className="p-3 rounded-lg bg-white/10 hover:bg-white/20"
                  title={muted ? 'Announcements muted' : 'Announcements on'}>
            {muted ? <VolumeX className="h-6 w-6 text-white/50" /> : <Volume2 className="h-6 w-6" />}
          </button>
          <button onClick={goFullscreen} className="p-3 rounded-lg bg-white/10 hover:bg-white/20">
            <Maximize2 className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className={`flex-1 grid ${hasMedia ? 'grid-cols-3' : 'grid-cols-2'} gap-5 p-6 min-h-0`}>
        {/* PREPARING */}
        <section className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-3">
            <ChefHat className="h-7 w-7 text-amber-400" />
            <h2 className="text-2xl font-black tracking-widest text-amber-400">PREPARING</h2>
            <span className="ml-auto text-2xl font-black tabular-nums text-amber-400/70">{preparing.length}</span>
          </div>
          <div className="flex-1 overflow-hidden grid grid-cols-2 gap-3 content-start">
            {preparing.slice(0, 12).map(o => (
              <div key={o.id} className="cd-in rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 p-4 text-center">
                <div className="text-5xl font-black tabular-nums text-amber-300">#{o.orderNumber}</div>
                {cfg.showWaitTime && (
                  <div className="text-sm text-amber-200/60 mt-1 tabular-nums">{minutesSince(o.createdAt)} min</div>
                )}
              </div>
            ))}
            {preparing.length === 0 && (
              <div className="col-span-2 text-center text-white/30 text-xl py-16">No orders in the kitchen</div>
            )}
          </div>
        </section>

        {/* READY — the loud side */}
        <section className="flex flex-col min-h-0">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="h-7 w-7 text-green-400" />
            <h2 className="text-2xl font-black tracking-widest text-green-400">READY</h2>
            <span className="ml-auto text-2xl font-black tabular-nums text-green-400/70">{ready.length}</span>
          </div>
          <div className="flex-1 overflow-hidden grid grid-cols-2 gap-3 content-start">
            {ready.slice(0, 12).map(o => (
              <div
                key={o.id}
                className={`${flash.has(o.id) ? 'cd-flash' : 'cd-in'} rounded-2xl bg-green-500/15 border-2 border-green-400 p-4 text-center`}
              >
                <div className="text-6xl font-black tabular-nums text-green-300 leading-none">#{o.orderNumber}</div>
                <div className="text-sm font-bold text-green-200/80 mt-2 tracking-widest">COLLECT</div>
              </div>
            ))}
            {ready.length === 0 && (
              <div className="col-span-2 text-center text-white/30 text-xl py-16">Nothing ready yet</div>
            )}
          </div>
        </section>

        {/* MEDIA — only when the shop has actually added something */}
        {hasMedia && <MediaPanel media={cfg.media} defaultSeconds={cfg.mediaSeconds} />}
      </div>
    </div>
  );
}

/**
 * Rotating banners beside the order columns.
 *
 * A video plays through to its end and then hands over; an image waits its
 * configured time. Advancing on the video's own `ended` event rather than a
 * timer means a 30-second promo is never cut off at 8 seconds.
 */
function MediaPanel({ media, defaultSeconds }: { media: DisplayMedia[]; defaultSeconds: number }) {
  const [i, setI] = useState(0);
  const item = media[i % media.length];

  useEffect(() => {
    if (!item || item.kind === 'video') return;
    const secs = item.seconds || defaultSeconds;
    const t = setTimeout(() => setI(n => (n + 1) % media.length), Math.max(2, secs) * 1000);
    return () => clearTimeout(t);
  }, [item, defaultSeconds, media.length]);

  if (!item) return null;

  return (
    <section className="flex flex-col min-h-0 rounded-2xl overflow-hidden bg-black/40 border border-white/10">
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={item.src}
            className="w-full h-full object-contain"
            autoPlay muted playsInline
            onEnded={() => setI(n => (n + 1) % media.length)}
            // A video that cannot load must not freeze the rotation.
            onError={() => setI(n => (n + 1) % media.length)}
          />
        ) : (
          <img key={item.id} src={item.src} alt={item.caption || ''} className="cd-in w-full h-full object-contain" />
        )}
      </div>
      {item.caption && (
        <div className="px-4 py-3 text-center text-lg font-bold bg-black/60">{item.caption}</div>
      )}
      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 bg-black/60">
          {media.map((m, n) => (
            <span key={m.id}
                  className={`h-1.5 rounded-full transition-all ${n === i % media.length ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
      )}
    </section>
  );
}
