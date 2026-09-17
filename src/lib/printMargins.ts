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
/**
 * Zero side margins by default.
 *
 * On an 80mm roll the head can only mark the middle ~72mm, so roughly 4mm of
 * each edge is ALREADY blank paper that no setting can print on. That inset is
 * the visual margin. Adding 2mm on top of it narrowed the slip to 68mm while
 * the Windows driver path was filling the full 72mm — which is why the raw
 * slip came out both lopsided AND narrower than the driver's.
 *
 * Zero here means: use everything the head can reach, and let the paper's own
 * unprintable edge be the margin. It is also what makes the raw path and the
 * driver path produce the same width.
 */
export const DEFAULT_MARGINS: PrintMargins = { top: 0, right: 0, bottom: 0, left: 0, contentWidthMm: 0 };
// ============================================================
// ONE-TIME GEOMETRY MIGRATION
//
// v2 reset calibration values that created a top gap and a long blank tail.
// v3 moved to equal 2mm defaults.
//
// v4 exists because v3 did not actually reach the machines that needed it.
// The flag is written on FIRST RUN of any build that carries it, so a client
// already running a v3 build had the flag set with whatever asymmetric values
// were in storage at the time. The migration then never ran again, and every
// later release inherited those numbers.
//
// That is why the equal-margin work still printed lopsided on real paper:
// the printer-config default was corrected, but `loadPrintMargins()` kept
// handing out the stale device values — and it feeds the receipt, the KOT,
// the token and the shift report alike, which is exactly the "it is on every
// slip" report. Physical paper was right and the code was wrong.
//
// Only the device's print margins are touched; no shop or sales data.
// ============================================================
const GEOM_FLAG = 'dtpos-print-geometry-v5';
// Flags from superseded migrations. They are cleared so that a machine which
// later downgrades and upgrades again is migrated rather than skipped.
const SUPERSEDED_FLAGS = ['dtpos-print-geometry-v2', 'dtpos-print-geometry-v3', 'dtpos-print-geometry-v4'];

try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem(GEOM_FLAG)) {
    localStorage.setItem(KEY, JSON.stringify(DEFAULT_MARGINS));
    localStorage.setItem(GEOM_FLAG, '1');
    for (const old of SUPERSEDED_FLAGS) {
      try { localStorage.removeItem(old); } catch { /* best effort */ }
    }
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

/**
 * Force the side margins equal, keeping top/bottom and any calibrated width.
 *
 * Offered as a one-click action because a machine can reach an asymmetric
 * pair in several ways — an old migration, a hand calibration, a restored
 * backup — and hunting for which one is not the shop's job.
 */
export function equaliseSideMargins(mm: number = DEFAULT_MARGINS.left): PrintMargins {
  const current = loadPrintMargins();
  const side = Math.max(0, Math.min(20, Math.round((Number(mm) || 0) * 10) / 10));
  const next: PrintMargins = { ...current, left: side, right: side };
  savePrintMargins(next);
  return next;
}

/** True when this device's stored side margins are not equal. */
export function hasUnequalSideMargins(m: PrintMargins = loadPrintMargins()): boolean {
  return Math.abs((Number(m.left) || 0) - (Number(m.right) || 0)) > 0.05;
}
