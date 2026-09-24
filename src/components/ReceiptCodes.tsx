// ============================================================
// RECEIPT QR & BARCODE — drawn on the bill (Settings → Receipt → QR & Barcode).
//
// ReceiptPreview wraps every design in <ReceiptCodesProvider>; the codes then
// appear wherever a <ReceiptCodesSlot> for their position sits:
//   above  — top of the slip, before the shop's header
//   footer — the template's own QR spot, with its thank-you lines
//   below  — the very end of the slip
// With both switches off nothing renders and the bill is exactly as before.
//
// Printed sizes are whole printer dots. A thermal head marks dots 0.125mm
// apart (203 DPI); a QR module or barcode bar of 2.4 dots prints as 2 or 3
// at random and a scanner misreads it. Modules here are 2, 3 or 4 dots, in
// mm, so the image route and the Windows driver both land on the dot grid.
// ============================================================
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { Order, RestaurantSettings } from '@/lib/types';
import { encodeBarcode, QUIET_ZONE_MODULES, type LinearBarcode } from '@/lib/linearBarcode';
import {
  barcodeValueFor, qrCaption, qrValueFor, readReceiptCodes,
  type BarcodeSize, type CodePosition, type ReceiptCodesConfig,
} from '@/lib/receiptCodes';

/** Printer dots per mm (203 DPI). */
export const DOTS_PER_MM = 8;
/** Blank modules around a QR — the paper around it adds the rest. */
const QR_QUIET = 2;
const BAR_DOTS: Record<BarcodeSize, number> = { small: 2, medium: 3, large: 4 };
const BAR_HEIGHT_MM: Record<BarcodeSize, number> = { small: 8, medium: 10, large: 13 };

/** Widest code that still sits inside the slip's margins. */
export function maxCodeWidthMm(settings: unknown): number {
  return (settings as any)?.paperSize === '58mm' ? 44 : 64;
}

// ------------------------------------------------------------ geometry
export interface QrLayout { modules: number; dotsPerModule: number; widthMm: number; path: string; version: number }

/** QR modules sized to whole printer dots, as close to `sizeMm` as possible. */
export function qrLayout(value: string, sizeMm: number, maxMm: number): QrLayout | null {
  let qr: ReturnType<typeof QRCode.create>;
  try {
    qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  } catch {
    return null; // too much data for any QR: nothing is better than garbage
  }
  const size = qr.modules.size;
  const total = size + QR_QUIET * 2;
  const target = Math.min(sizeMm, maxMm);
  let dots = Math.max(2, Math.floor((target * DOTS_PER_MM) / total));
  while (dots > 2 && (total * dots) / DOTS_PER_MM > maxMm) dots--;
  if ((total * 2) / DOTS_PER_MM > maxMm) return null;
  // One path, horizontal runs merged: small markup, crisp edges.
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!qr.modules.data[y * size + x]) { x++; continue; }
      let run = 1;
      while (x + run < size && qr.modules.data[y * size + x + run]) run++;
      path += `M${x + QR_QUIET} ${y + QR_QUIET}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { modules: total, dotsPerModule: dots, widthMm: (total * dots) / DOTS_PER_MM, path, version: qr.version };
}

export interface BarcodeLayout {
  barcode: LinearBarcode;
  /** Bar/space widths in printer dots. */
  elements: number[];
  /** Narrow bar width in dots. */
  dotsPerModule: number;
  /** Blank on each side inside the image, in dots (the paper margin adds the rest). */
  quietDots: number;
  widthDots: number;
  widthMm: number;
  heightMm: number;
  /** True when Code 39 was too wide for the paper and Code 128 carries the text instead. */
  fellBack: boolean;
}

/**
 * Element widths in dots for a narrow bar of `x` dots. Code 39's wide
 * elements use 2.5:1 (2 → 5 dots, 3 → 7, 4 → 10): inside the format's
 * 2:1–3:1 range and a sixth narrower than 3:1 — Code 39 is a wide code.
 */
export function barcodeDots(barcode: LinearBarcode, x: number): number[] {
  if (barcode.format === 'code39') {
    const wide = x === 3 ? 7 : Math.round(x * 2.5);
    return barcode.widths.map(w => (w === 1 ? x : wide));
  }
  return barcode.widths.map(w => w * x);
}

/**
 * Bars sized to whole printer dots: the chosen bar width, narrower if the
 * slip needs it, never under 2 dots. The paper's margins supply the blank a
 * scanner needs beside the bars, so the image keeps only what fits. Code 39
 * too wide for the paper falls back to Code 128, which carries the same text
 * in about half the width — a code that prints beats one that does not.
 */
export function barcodeLayout(format: ReceiptCodesConfig['barcode']['format'], value: string, size: BarcodeSize, maxMm: number): BarcodeLayout | null {
  let barcode: LinearBarcode;
  try {
    barcode = encodeBarcode(format, value);
  } catch {
    return format === 'code39' ? fallBack(value, size, maxMm) : null;
  }
  const maxDots = Math.floor(maxMm * DOTS_PER_MM);
  for (let x = BAR_DOTS[size]; x >= 2; x--) {
    const elements = barcodeDots(barcode, x);
    const bars = elements.reduce((a, b) => a + b, 0);
    if (bars > maxDots) continue;
    const quietDots = Math.max(0, Math.min(QUIET_ZONE_MODULES * x, Math.floor((maxDots - bars) / 2)));
    const widthDots = bars + quietDots * 2;
    return {
      barcode, elements, dotsPerModule: x, quietDots, widthDots,
      widthMm: widthDots / DOTS_PER_MM, heightMm: BAR_HEIGHT_MM[size], fellBack: false,
    };
  }
  return format === 'code39' ? fallBack(value, size, maxMm) : null;
}

function fallBack(value: string, size: BarcodeSize, maxMm: number): BarcodeLayout | null {
  const l = barcodeLayout('code128', value, size, maxMm);
  return l ? { ...l, fellBack: true } : null;
}

// ------------------------------------------------------------ context
interface CodesCtx {
  order: Order;
  settings: RestaurantSettings;
  cfg: ReceiptCodesConfig;
  /** Receipt zoom (Settings → receipt scale): sizes are divided by it so the printed size is exact. */
  zoom: number;
  branch?: string;
}
const Ctx = createContext<CodesCtx | null>(null);

export function ReceiptCodesProvider({ order, settings, zoom = 1, branch, children }: {
  order: Order; settings: RestaurantSettings; zoom?: number; branch?: string; children: ReactNode;
}) {
  const cfg = useMemo(() => readReceiptCodes(settings), [settings]);
  const value = useMemo(() => ({ order, settings, cfg, zoom: zoom > 0 ? zoom : 1, branch }), [order, settings, cfg, zoom, branch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The codes' settings for the bill being drawn, or null outside a receipt. */
export function useReceiptCodes(): CodesCtx | null {
  return useContext(Ctx);
}

// ------------------------------------------------------------ drawing
const mm = (v: number, zoom: number) => `${Math.round((v / zoom) * 1000) / 1000}mm`;

export function QrCode({ layout, zoom = 1, label = 'QR code' }: { layout: QrLayout; zoom?: number; label?: string }) {
  return (
    <svg
      viewBox={`0 0 ${layout.modules} ${layout.modules}`}
      width={mm(layout.widthMm, zoom)}
      height={mm(layout.widthMm, zoom)}
      style={{ display: 'block', margin: '0 auto', width: mm(layout.widthMm, zoom), height: mm(layout.widthMm, zoom), background: '#fff' }}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-dots-per-module={layout.dotsPerModule}
    >
      <rect width={layout.modules} height={layout.modules} fill="#fff" />
      <path d={layout.path} fill="#000" />
    </svg>
  );
}

export function Barcode({ layout, showText, zoom = 1 }: { layout: BarcodeLayout; showText: boolean; zoom?: number }) {
  // Drawn in printer dots: one viewBox unit is one dot.
  const bars: ReactNode[] = [];
  let x = layout.quietDots;
  layout.elements.forEach((w, i) => {
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={1} fill="#000" />);
    x += w;
  });
  return (
    <div>
      <svg
        viewBox={`0 0 ${layout.widthDots} 1`}
        preserveAspectRatio="none"
        width={mm(layout.widthMm, zoom)}
        height={mm(layout.heightMm, zoom)}
        style={{ display: 'block', margin: '0 auto', width: mm(layout.widthMm, zoom), height: mm(layout.heightMm, zoom), background: '#fff' }}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Barcode ${layout.barcode.text}`}
        data-dots-per-module={layout.dotsPerModule}
      >
        <rect width={layout.widthDots} height={1} fill="#fff" />
        {bars}
      </svg>
      {showText && (
        <div style={{ fontFamily: "'Lucida Console','Consolas','Courier New',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '2px', marginTop: '1px' }}>
          {layout.barcode.text}
        </div>
      )}
    </div>
  );
}

/**
 * The shop's QR and/or barcode for one position. Renders nothing when neither
 * is switched on for it (or outside a receipt).
 */
export function ReceiptCodesSlot({ position }: { position: CodePosition }) {
  const ctx = useReceiptCodes();
  const qrOn = !!ctx && ctx.cfg.qr.enabled && ctx.cfg.qr.position === position;
  const barOn = !!ctx && ctx.cfg.barcode.enabled && ctx.cfg.barcode.position === position;
  const qr = useMemo(() => {
    if (!ctx || !qrOn) return null;
    const value = qrValueFor(ctx.order, ctx.settings, ctx.cfg, ctx.branch);
    return value ? qrLayout(value, ctx.cfg.qr.sizeMm, maxCodeWidthMm(ctx.settings)) : null;
  }, [ctx, qrOn]);
  const bar = useMemo(() => {
    if (!ctx || !barOn) return null;
    const value = barcodeValueFor(ctx.order, ctx.cfg);
    return value ? barcodeLayout(ctx.cfg.barcode.format, value, ctx.cfg.barcode.size, maxCodeWidthMm(ctx.settings)) : null;
  }, [ctx, barOn]);
  if (!ctx || (!qr && !bar)) return null;
  const caption = (t: string) => t
    ? <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '2px', lineHeight: 1.25 }}>{t}</div>
    : null;
  return (
    <div className="dt-receipt-codes" data-position={position} style={{ textAlign: 'center', padding: '4px 0', background: '#fff', color: '#000' }}>
      {qr && (
        <div style={{ padding: '2px 0' }}>
          <QrCode layout={qr} zoom={ctx.zoom} />
          {caption(qrCaption(ctx.cfg))}
        </div>
      )}
      {bar && (
        <div style={{ padding: '4px 0 2px' }}>
          <Barcode layout={bar} showText={ctx.cfg.barcode.showText} zoom={ctx.zoom} />
          {caption(ctx.cfg.barcode.caption.trim())}
        </div>
      )}
    </div>
  );
}
