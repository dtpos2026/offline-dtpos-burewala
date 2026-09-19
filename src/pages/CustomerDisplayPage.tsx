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
//    and a newly-ready order flashes and is spoken aloud. Someone who looked
//    away for ten seconds must not miss their number.
//  • A ready order stays on screen for a hold period AFTER it is collected,
//    because a customer who stepped outside comes back and looks up.
//  • The media panel only appears when the shop has actually added banners
//    AND has left room for them. An empty panel is worse than no panel.
//  • Nothing here can change an order. It is a display; every status comes
//    from the kitchen.
//
// Whose screen this is
// --------------------
// The restaurant's. Its logo and its name are the largest things in the
// header. Digital Target wrote the software and appears once, small, at the
// bottom of the header — a developer credit, not the branding.
//
// Templates and sizes
// -------------------
// Every colour comes from a template (src/lib/displayTemplates.ts) applied as
// CSS custom properties, and every size is a `clamp()` against the viewport.
// That is what makes one build work on a 1920x1080 TV, a 1366x768 monitor and
// a small square panel over a counter: the layout reflows and the type scales,
// rather than one fixed design being stretched to fit.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrders, getSettings, onDataChange } from '@/lib/store';
import type { Order, RestaurantSettings } from '@/lib/types';
import {
  loadDisplayConfig,
  announceOrder,
  resolveDisplayTemplate,
  mediaStyle,
  type CustomerDisplayConfig,
  type DisplayMedia,
} from '@/lib/customerDisplay';
import { templateVars, scaledFont, DEVELOPER_CREDIT } from '@/lib/displayTemplates';
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

/**
 * The screen's own dimensions, kept current.
 *
 * Automatic template mode needs the real numbers, not a guess: this window is
 * opened full-screen on whichever monitor the shop chose, and that monitor can
 * be anything from a 4K TV to a 1024x768 panel.
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

export default function CustomerDisplayPage() {
  const [cfg, setCfg] = useState<CustomerDisplayConfig>(() => loadDisplayConfig());
  const [settings, setSettings] = useState<RestaurantSettings>(() => getSettings());
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const { w, h } = useViewport();

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

  const template = useMemo(
    () => resolveDisplayTemplate(cfg, w, h),
    [cfg.templateId, cfg.templateMode, w, h], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

  // The ratio is the shop's, but the template supplies it when the shop has
  // not moved it off the default — a "Media Focused" template that still gave
  // the orders 70% of the screen would not be media focused.
  const ratio = Math.max(20, Math.min(100, cfg.orderRatio ?? template.orderRatio));
  const hasMedia = cfg.media.length > 0 && ratio < 100;
  // Below this the screen is too narrow to run orders and banners side by
  // side; the banners move under the orders instead of squeezing both.
  const narrow = w < 1100;

  const cardsPerColumn = template.density === 'compact' ? 16 : 12;
  const numberScale = template.numberScale;

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden flex flex-col"
      style={{
        ...templateVars(template),
        background: 'var(--dt-bg)',
        color: 'var(--dt-text)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <style>{`
        @keyframes cdIn { from { opacity:0; transform: scale(.9); } to { opacity:1; transform:none; } }
        @keyframes cdFlash {
          0%,100% { box-shadow: 0 0 0 0 var(--dt-ready); }
          50%     { box-shadow: 0 0 0 22px transparent; }
        }
        .cd-in    { animation: cdIn .3s cubic-bezier(.2,.7,.3,1) both; }
        .cd-flash { animation: cdIn .3s cubic-bezier(.2,.7,.3,1) both, cdFlash 1.5s ease-out 4; }
        @media (prefers-reduced-motion: reduce) { .cd-in,.cd-flash { animation:none !important; } }
      `}</style>

      {/* ===== HEADER — the RESTAURANT's, not the software's ===== */}
      <div
        className="flex items-center gap-4 px-[2vw] py-[1.2vh] border-b shrink-0"
        style={{ background: 'var(--dt-accent)', color: 'var(--dt-on-accent)', borderColor: 'var(--dt-border)' }}
      >
        {settings.logo && (
          <img
            src={settings.logo}
            alt=""
            className="object-contain rounded shrink-0"
            style={{ height: 'clamp(2.5rem,5vh,4.5rem)', width: 'clamp(2.5rem,5vh,4.5rem)' }}
          />
        )}
        <div className="min-w-0">
          <div
            className="font-black uppercase tracking-wide truncate leading-tight"
            style={{ fontSize: scaledFont(2.25, template.typeScale, 1.4) }}
          >
            {settings.name || 'Restaurant'}
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="uppercase tracking-[0.25em] opacity-70"
                  style={{ fontSize: scaledFont(0.85, template.typeScale, 0.3) }}>
              {cfg.heading}
            </span>
            {cfg.showDeveloperCredit && (
              <span className="uppercase tracking-[0.2em] opacity-40"
                    style={{ fontSize: scaledFont(0.6, template.typeScale, 0.2) }}>
                {DEVELOPER_CREDIT}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="font-black tabular-nums" style={{ fontSize: scaledFont(2.5, template.typeScale, 1.2) }}>
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={() => setMuted(m => !m)}
                  className="p-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.14)' }}
                  title={muted ? 'Announcements muted' : 'Announcements on'}>
            {muted ? <VolumeX className="h-6 w-6 opacity-50" /> : <Volume2 className="h-6 w-6" />}
          </button>
          <button onClick={goFullscreen} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.14)' }}>
            <Maximize2 className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* ===== BOARD =====
          The split is a grid template built from the shop's ratio, so 70/30,
          50/50 and 30/70 are the same mechanism rather than three layouts. On
          a narrow screen it becomes rows, because two columns at 900px wide
          gives neither the orders nor the banners enough room. */}
      <div
        className="flex-1 grid gap-[1.2vw] p-[1.2vw] min-h-0"
        style={
          hasMedia
            ? narrow
              ? { gridTemplateRows: `${ratio}fr ${100 - ratio}fr` }
              : { gridTemplateColumns: `${ratio}fr ${100 - ratio}fr` }
            : undefined
        }
      >
        <div className="grid grid-cols-2 gap-[1.2vw] min-h-0 min-w-0">
          <OrderColumn
            title="PREPARING"
            icon={<ChefHat style={{ width: '1.6em', height: '1.6em' }} />}
            colour="var(--dt-preparing)"
            orders={preparing.slice(0, cardsPerColumn)}
            total={preparing.length}
            empty="No orders in the kitchen"
            template={template}
            numberScale={numberScale}
            renderExtra={o => cfg.showWaitTime
              ? <div className="tabular-nums opacity-60" style={{ fontSize: scaledFont(0.9, template.typeScale, 0.3) }}>
                  {minutesSince(o.createdAt)} min
                </div>
              : null}
          />
          <OrderColumn
            title="READY"
            icon={<CheckCircle2 style={{ width: '1.6em', height: '1.6em' }} />}
            colour="var(--dt-ready)"
            orders={ready.slice(0, cardsPerColumn)}
            total={ready.length}
            empty="Nothing ready yet"
            template={template}
            numberScale={numberScale * 1.15}
            flash={flash}
            renderExtra={() => (
              <div className="font-bold tracking-widest opacity-80"
                   style={{ fontSize: scaledFont(0.9, template.typeScale, 0.3) }}>
                COLLECT
              </div>
            )}
          />
        </div>

        {hasMedia && <MediaPanel media={cfg.media} defaultSeconds={cfg.mediaSeconds} template={template} />}
      </div>
    </div>
  );
}

/**
 * One status column.
 *
 * Extracted because PREPARING and READY differ only in colour, heading and
 * what sits under the number — writing them twice is how the two sides end up
 * with different padding after a few changes.
 */
function OrderColumn({
  title, icon, colour, orders, total, empty, template, numberScale, flash, renderExtra,
}: {
  title: string;
  icon: React.ReactNode;
  colour: string;
  orders: Order[];
  total: number;
  empty: string;
  template: { typeScale: number };
  numberScale: number;
  flash?: Set<string>;
  renderExtra?: (o: Order) => React.ReactNode;
}) {
  return (
    <section className="flex flex-col min-h-0 min-w-0">
      <div className="flex items-center gap-3 mb-[1vh]" style={{ color: colour }}>
        <span style={{ fontSize: scaledFont(1.1, template.typeScale, 0.4) }}>{icon}</span>
        <h2 className="font-black tracking-widest" style={{ fontSize: scaledFont(1.6, template.typeScale, 0.7) }}>
          {title}
        </h2>
        <span className="ml-auto font-black tabular-nums opacity-70"
              style={{ fontSize: scaledFont(1.6, template.typeScale, 0.7) }}>
          {total}
        </span>
      </div>
      <div className="flex-1 overflow-hidden grid grid-cols-2 gap-[0.8vw] content-start">
        {orders.map(o => (
          <div
            key={o.id}
            className={`${flash?.has(o.id) ? 'cd-flash' : 'cd-in'} text-center p-[1vw] border-2`}
            style={{
              borderRadius: 'var(--dt-radius)',
              background: 'var(--dt-surface)',
              borderColor: colour,
            }}
          >
            <div className="font-black tabular-nums leading-none"
                 style={{ color: colour, fontSize: scaledFont(3.5, numberScale, 2.2) }}>
              #{o.orderNumber}
            </div>
            {renderExtra?.(o)}
          </div>
        ))}
        {total === 0 && (
          <div className="col-span-2 text-center opacity-30 py-[6vh]"
               style={{ fontSize: scaledFont(1.25, template.typeScale, 0.5) }}>
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Rotating banners beside the order columns.
 *
 * A video plays through to its end and then hands over; an image waits its
 * configured time. Advancing on the video's own `ended` event rather than a
 * timer means a 30-second promo is never cut off at 8 seconds.
 *
 * Each item carries its own fit, position and size, applied as CSS against
 * the original file. Nothing is re-encoded on the way in or on the way out,
 * so a shop's poster is shown at the quality they uploaded it at.
 */
function MediaPanel({
  media, defaultSeconds, template,
}: {
  media: DisplayMedia[];
  defaultSeconds: number;
  template: { typeScale: number };
}) {
  const [i, setI] = useState(0);
  const item = media[i % media.length];

  useEffect(() => {
    if (!item || item.kind === 'video') return;
    const secs = item.seconds || defaultSeconds;
    const t = setTimeout(() => setI(n => (n + 1) % media.length), Math.max(2, secs) * 1000);
    return () => clearTimeout(t);
  }, [item, defaultSeconds, media.length]);

  if (!item) return null;

  const style = mediaStyle(item) as React.CSSProperties;

  return (
    <section className="flex flex-col min-h-0 min-w-0 overflow-hidden border"
             style={{ borderRadius: 'var(--dt-radius)', background: '#000', borderColor: 'var(--dt-border)' }}>
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {item.kind === 'video' ? (
          <video
            key={item.id}
            src={item.src}
            style={style}
            autoPlay muted playsInline
            onEnded={() => setI(n => (n + 1) % media.length)}
            // A video that cannot load must not freeze the rotation.
            onError={() => setI(n => (n + 1) % media.length)}
          />
        ) : (
          <img key={item.id} src={item.src} alt={item.caption || ''} className="cd-in" style={style} />
        )}
      </div>
      {item.caption && (
        <div className="px-4 py-3 text-center font-bold"
             style={{ background: 'var(--dt-accent)', color: 'var(--dt-on-accent)', fontSize: scaledFont(1.1, template.typeScale, 0.4) }}>
          {item.caption}
        </div>
      )}
      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2" style={{ background: 'rgba(0,0,0,0.6)' }}>
          {media.map((m, n) => (
            <span key={m.id}
                  className={`h-1.5 rounded-full transition-all ${n === i % media.length ? 'w-6' : 'w-1.5 opacity-30'}`}
                  style={{ background: 'var(--dt-text)' }} />
          ))}
        </div>
      )}
    </section>
  );
}
