// ============================================================
// POS LAYOUT PREVIEW — the POS screen drawn at its real size, then shrunk.
//
// Every width, column count and card size comes from the same engine the
// POS uses (lib/posLayout.ts), laid out in real CSS pixels for the chosen
// window, so "what you see in the preview" is what the till draws. Only
// this thumbnail is scaled down to fit the Settings page; the POS itself
// never uses scaling.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computePosLayout, containerFor, HEADER_HEIGHT, RESIZE_HANDLE,
  type ScreenLayoutConfig, type PosLayout,
} from '@/lib/posLayout';

export interface PreviewItem { name: string; price: number; image?: string }

interface Props {
  windowW: number;
  windowH: number;
  touch: boolean;
  config: ScreenLayoutConfig;
  categoryLayoutSetting: 'top' | 'side';
  preferredColumns: number;
  items: PreviewItem[];
  categories: string[];
  /** Largest width the thumbnail may take on the Settings page. */
  maxWidth?: number;
  /** Largest height — keeps a portrait preview on one screen. */
  maxHeight?: number;
  onLayout?: (l: PosLayout) => void;
}

const SEARCH_BAR = 44;
const RIBBON = 46;

export default function PosLayoutPreview({
  windowW, windowH, touch, config, categoryLayoutSetting, preferredColumns, items, categories, maxWidth = 820, maxHeight = 560, onLayout,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(maxWidth);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBoxW(Math.min(maxWidth, el.clientWidth || maxWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  const container = useMemo(() => containerFor(windowW, windowH, config), [windowW, windowH, config]);
  const layout = useMemo(() => computePosLayout({
    width: container.width, height: container.height, touch, categoryLayoutSetting, preferredColumns, config,
  }), [container, touch, categoryLayoutSetting, preferredColumns, config]);
  useEffect(() => { onLayout?.(layout); }, [layout, onLayout]);

  const scale = Math.min(boxW / windowW, maxHeight / windowH);
  const bottomCart = layout.cartPlacement === 'bottom';
  const sideCart = layout.cartPlacement === 'side';
  const gridH = container.height - (bottomCart ? layout.cartHeight : 0) - SEARCH_BAR - (layout.categoryPlacement === 'top' ? RIBBON : 0);
  const cardH = Math.round(layout.cardImageHeight * 0.66) + (layout.density === 'compact' ? 52 : 60);
  const rows = Math.max(1, Math.ceil(gridH / (cardH + layout.gap)));
  const count = Math.min(72, rows * layout.productColumns);
  const sample = items.length ? items : [{ name: 'Menu item', price: 450 }];
  const cats = categories.length ? categories : ['All', 'Starters', 'BBQ', 'Karahi', 'Rice', 'Drinks'];
  const keypadVisible = config.keypad !== 'hide';

  return (
    <div ref={boxRef} className="w-full">
      <div
        className="relative overflow-hidden rounded-lg border-2 border-border shadow-md bg-background"
        style={{ width: windowW * scale, height: windowH * scale, maxWidth: '100%' }}
        aria-label={`POS preview at ${windowW} × ${windowH}`}
      >
        <div
          style={{ width: windowW, height: windowH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          className="flex text-foreground"
        >
          {/* App menu */}
          {container.menuWidth > 0 && (
            <div style={{ width: container.menuWidth }} className="h-full shrink-0 bg-gradient-sidebar flex flex-col items-center gap-3 py-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="rounded-md bg-sidebar-foreground/20" style={{ height: 26, width: container.menuWidth > 100 ? container.menuWidth - 36 : 30 }} />
              ))}
            </div>
          )}
          <div className="flex-1 flex flex-col min-w-0">
            <div style={{ height: HEADER_HEIGHT }} className="shrink-0 bg-gradient-sidebar border-b-2 border-sidebar-border flex items-center px-4">
              <div className="h-4 w-48 rounded bg-sidebar-foreground/30" />
              <div className="ml-auto h-6 w-40 rounded bg-sidebar-foreground/15" />
            </div>
            <div className={`flex-1 flex min-h-0 ${bottomCart ? 'flex-col' : ''}`}>
              {/* Products */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-pos-grid">
                <div style={{ height: SEARCH_BAR }} className="shrink-0 border-b bg-card/60 flex items-center gap-2 px-3">
                  <div className="h-7 flex-1 rounded-md border bg-background" />
                  <div className="h-7 w-20 rounded-md border bg-card" />
                </div>
                {layout.categoryPlacement === 'top' && (
                  <div style={{ height: RIBBON }} className="shrink-0 border-b-2 bg-card/40 flex items-center gap-2 px-3 overflow-hidden">
                    {cats.slice(0, 14).map((c, i) => (
                      <span key={c + i} className="cat-pill" data-active={i === 0}>{c}</span>
                    ))}
                  </div>
                )}
                <div className="flex-1 flex min-h-0">
                  {layout.categoryPlacement === 'side' && (
                    <div style={{ width: layout.categoryWidth }} className="shrink-0 border-r-2 bg-card/40 py-2 overflow-hidden">
                      {cats.slice(0, 16).map((c, i) => (
                        <div key={c + i} className="cat-pill mx-1.5 mb-1.5 truncate" data-active={i === 0} style={{ width: layout.categoryWidth - 12 }}>{c}</div>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden" style={{ padding: layout.padding }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${layout.productColumns}, minmax(0, 1fr))`, gap: layout.gap }}>
                      {Array.from({ length: count }).map((_, i) => {
                        const it = sample[i % sample.length];
                        return (
                          <div key={i} className="bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm">
                            {it.image
                              ? <img src={it.image} alt="" className="w-full object-cover" style={{ height: layout.cardImageHeight }} />
                              : <div className="w-full bg-gradient-to-br from-primary/8 to-accent/30" style={{ height: Math.round(layout.cardImageHeight * 0.66) }} />}
                            <div className={layout.density === 'compact' ? 'p-2' : 'p-2.5'}>
                              <p className="text-sm font-extrabold truncate leading-snug">{it.name}</p>
                              <span className="mt-2 inline-block text-sm font-extrabold text-primary bg-primary/10 border border-primary/25 rounded-md px-1.5 py-0.5">Rs.{Math.round(it.price).toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              {/* Cart */}
              {layout.cartPlacement !== 'drawer' && (
                <>
                  {sideCart && <div style={{ width: RESIZE_HANDLE }} className="shrink-0 bg-border/40" />}
                  <div
                    style={bottomCart ? { height: layout.cartHeight } : { width: layout.cartWidth }}
                    className={`shrink-0 bg-pos-cart shadow-lg flex flex-col ${bottomCart ? 'border-t-2' : 'border-l'}`}
                  >
                    <div className="px-3 py-2 border-b space-y-1.5">
                      <div className="text-sm font-extrabold">CART <span className="ml-2 text-[10px] text-muted-foreground">3 items</span></div>
                      <div className="grid grid-cols-3 gap-1">
                        {['Dine-In', 'Takeaway', 'Delivery'].map((t, i) => (
                          <div key={t} className={`h-7 rounded-md text-[10px] font-bold flex items-center justify-center ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-card border'}`}>{t}</div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 px-3 py-2 space-y-1.5 overflow-hidden">
                      {sample.slice(0, 3).map((it, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border bg-card px-2 py-1.5 text-xs">
                          <span className="truncate font-semibold">{it.name}</span>
                          <span className="font-bold">Rs.{Math.round(it.price).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {keypadVisible && (
                      <div className="px-3 pb-2 border-t-2 border-primary/20">
                        <div className="text-[10px] font-extrabold uppercase text-muted-foreground py-1">🔢 Keypad</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => (
                            <div key={k} className="rounded-lg bg-gradient-sidebar text-sidebar-foreground text-sm font-extrabold flex items-center justify-center" style={{ height: layout.touch ? layout.touchTarget - 4 : 36 }}>{k}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="px-3 py-2 border-t bg-card/60">
                      <div className="flex justify-between text-sm font-extrabold"><span>GRAND TOTAL</span><span className="text-primary">Rs.1,850</span></div>
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <div className="h-9 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">PAY</div>
                        <div className="h-9 rounded-md border bg-card text-xs font-bold flex items-center justify-center">Kitchen</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {layout.cartPlacement === 'drawer' && (
          <div className="absolute bottom-2 right-2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1">Cart opens as a panel</div>
        )}
      </div>
    </div>
  );
}
