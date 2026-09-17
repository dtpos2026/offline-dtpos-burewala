// ============================================================
// Device-local PRINT QUALITY settings (thermal raster printing).
//
//  • mode      — 'auto' picks safe defaults; 'manual' uses the values below.
//  • darkness  — 1 (light) .. 10 (very dark). Controls how many dots fire.
//  • bold      — adds a 1-dot smear so thin fonts stay solid/clean.
//  • scale     — render resolution multiplier (1 = printer dots, 2 = 2x
//                supersampling for the sharpest small text, 3 = maximum).
//
// Saved per computer in localStorage — every counter can tune its own printer.
// ============================================================

export interface PrintQuality {
  mode: 'auto' | 'manual';
  darkness: number;
  bold: boolean;
  scale: number;
}

const KEY = 'dtpos-print-quality-v1';

export const DEFAULT_QUALITY: PrintQuality = { mode: 'auto', darkness: 7, bold: true, scale: 2 };
const AUTO_QUALITY: PrintQuality = { mode: 'auto', darkness: 7, bold: true, scale: 2 };

function clampDarkness(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_QUALITY.darkness;
  return Math.max(1, Math.min(10, v));
}

function clampScale(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_QUALITY.scale;
  return Math.max(1, Math.min(3, v));
}

export function loadPrintQuality(): PrintQuality {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_QUALITY };
    const p = JSON.parse(raw) || {};
    return {
      mode: p.mode === 'manual' ? 'manual' : 'auto',
      darkness: clampDarkness(p.darkness),
      bold: p.bold !== false,
      scale: clampScale(p.scale),
    };
  } catch {
    return { ...DEFAULT_QUALITY };
  }
}

export function savePrintQuality(q: PrintQuality) {
  const safe: PrintQuality = {
    mode: q.mode === 'manual' ? 'manual' : 'auto',
    darkness: clampDarkness(q.darkness),
    bold: q.bold !== false,
    scale: clampScale(q.scale),
  };
  try { localStorage.setItem(KEY, JSON.stringify(safe)); } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent('dtpos-print-quality-changed', { detail: safe })); } catch { /* no window */ }
}

export function resetPrintQuality() {
  savePrintQuality({ ...DEFAULT_QUALITY });
}

/** The values actually sent to the printer (auto mode ignores manual tweaks). */
export function effectivePrintQuality(): PrintQuality {
  const q = loadPrintQuality();
  return q.mode === 'manual' ? q : { ...AUTO_QUALITY };
}
