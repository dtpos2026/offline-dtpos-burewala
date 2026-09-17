// ============================================================
// Device-local print margins (mm). User can set from 0 mm upward.
// Writes CSS variables consumed by src/printing/printCss.ts:
//   --dt-print-padding-top / -right / -bottom / -left
// Saved in localStorage per device (not synced) so each machine
// can tune to its own printer.
// ============================================================

export interface PrintMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Optional printable content width (mm). 0 = auto (use full paper width).
   *  Typical values: 48 (58mm paper), 68 (80mm paper), tune per printer. */
  contentWidthMm?: number;
}

const KEY = 'dtpos-print-margins';
/**
 * Equal 2mm side margins. The slip is laid out inside the head's printable
 * width, so 2mm a side is genuinely 2mm of blank paper on each edge rather
 * than a guess that the driver may or may not honour.
 */
export const DEFAULT_MARGINS: PrintMargins = { top: 0, right: 2, bottom: 0, left: 2, contentWidthMm: 0 };
// One-time geometry migration. v2 reset the old calibration values that
// created a top gap and a long blank tail. v3 moves to the new equal 2mm
// defaults now that margins are applied once, in printer dots, instead of
// being added as page padding on top of a rescaled layout — the old 3mm
// values were compensating for that double application.
// Only the device's print margins are touched; no shop or sales data.
const GEOM_FLAG = 'dtpos-print-geometry-v3';
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(GEOM_FLAG)) {
    localStorage.setItem(KEY, JSON.stringify(DEFAULT_MARGINS));
    localStorage.setItem(GEOM_FLAG, '1');
  }
} catch {}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < -100) return -100;
  if (n > 100) return 100;
  return Math.round(n * 10) / 10;
}

function positive(n: number): number { return Math.max(0, clamp(n)); }
function offset(n: number): number { return Math.min(0, clamp(n)); }

function clampWidth(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 30) return 30;
  if (n > 110) return 110;
  return Math.round(n * 10) / 10;
}

export function loadPrintMargins(): PrintMargins {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_MARGINS };
    const p = JSON.parse(raw);
    return {
      top: clamp(p.top ?? DEFAULT_MARGINS.top),
      right: clamp(p.right ?? DEFAULT_MARGINS.right),
      bottom: clamp(p.bottom ?? DEFAULT_MARGINS.bottom),
      left: clamp(p.left ?? DEFAULT_MARGINS.left),
      contentWidthMm: clampWidth(p.contentWidthMm ?? 0),
    };
  } catch {
    return { ...DEFAULT_MARGINS };
  }
}

export function savePrintMargins(m: PrintMargins) {
  const safe: PrintMargins = {
    top: clamp(m.top),
    right: clamp(m.right),
    bottom: clamp(m.bottom),
    left: clamp(m.left),
    contentWidthMm: clampWidth(m.contentWidthMm ?? 0),
  };
  try { localStorage.setItem(KEY, JSON.stringify(safe)); } catch {}
  applyPrintMargins(safe);
  try { window.dispatchEvent(new CustomEvent('dtpos-print-margins-changed', { detail: safe })); } catch {}
}

export function applyPrintMargins(m: PrintMargins = loadPrintMargins()) {
  if (typeof document === 'undefined') return;
  const r = document.documentElement.style;
  // CSS padding cannot be negative. Positive values become padding; negative
  // values become a physical content offset so badly-calibrated drivers can be
  // counter-adjusted from Printer Settings.
  r.setProperty('--dt-print-padding-top', `${positive(m.top)}mm`);
  r.setProperty('--dt-print-padding-right', `${positive(m.right)}mm`);
  r.setProperty('--dt-print-padding-bottom', `${positive(m.bottom)}mm`);
  r.setProperty('--dt-print-padding-left', `${positive(m.left)}mm`);
  r.setProperty('--dt-print-offset-top', `${offset(m.top)}mm`);
  r.setProperty('--dt-print-offset-left', `${offset(m.left)}mm`);
  r.setProperty('--dt-print-offset-right', `${offset(m.right)}mm`);
  r.setProperty('--dt-print-offset-bottom', `${offset(m.bottom)}mm`);
  if (m.contentWidthMm && m.contentWidthMm > 0) {
    r.setProperty('--dt-print-content-width', `${m.contentWidthMm}mm`);
  } else {
    r.removeProperty('--dt-print-content-width');
  }
}

export function resetPrintMargins() {
  savePrintMargins({ ...DEFAULT_MARGINS });
}
