// ============================================================
// LEGACY shim — kept for backward compatibility.
// All real logic now lives in src/printing/*.
// New code should import from '@/printing' directly.
//
// The previous implementation forced a minimum page height
// (paperWidth + 5mm) which printed ~85mm of blank paper after
// short receipts on Electron. That logic has been removed.
// ============================================================
import type { RestaurantSettings } from './types';
import { buildPrintCss as buildCss, injectPrintCss, paperWidthToMicrons, paperWidthToMm } from '@/printing';
import type { PaperSize } from '@/printing';
import { loadPrintMargins } from '@/lib/printMargins';

function safeMm(value: unknown, fallback: number, max = 100) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-max, Math.min(max, value))
    : fallback;
}

function positiveMm(value: number) { return Math.max(0, value); }
function offsetMm(value: number) { return Math.min(0, value); }

export function getThermalPaperWidthMicrons(paperWidth: RestaurantSettings['paperSize']) {
  return paperWidthToMicrons((paperWidth || '80mm') as PaperSize);
}

export function getPaperWidthMm(paperWidth: RestaurantSettings['paperSize']) {
  return paperWidthToMm((paperWidth || '80mm') as PaperSize);
}

export function getEffectiveReceiptMargins(settings: RestaurantSettings) {
  const deviceMargins = loadPrintMargins();
  return {
    top: safeMm(deviceMargins.top ?? settings.receiptMarginTop, 0, 100),
    bottom: safeMm(deviceMargins.bottom ?? settings.receiptMarginBottom, 0, 100),
    left: safeMm(deviceMargins.left ?? settings.receiptMarginLeft, 2, 100),
    right: safeMm(deviceMargins.right ?? settings.receiptMarginRight, 2, 100),
  };
}

/** No longer used to fix a page height — kept returning undefined so
 *  callers fall back to `usePrinterDefaultPageSize: true` (auto height). */
export function getThermalPrintJobHeightMm(rootEl: HTMLElement | null, _settings: RestaurantSettings): number | undefined {
  // OLD-POS PORT: measure the content's actual height and send it as the
  // page height — this makes the print start from the top and avoids extra
  // blank feed after the receipt (the page is exactly as long as the
  // content). Formula from the old software: px @96dpi → mm, +2mm safety, min 20mm.
  if (!rootEl || typeof rootEl.getBoundingClientRect !== 'function') return undefined;
  try {
    const rect = rootEl.getBoundingClientRect();
    const px = Math.max(rect?.height || 0, rootEl.scrollHeight || 0);
    if (!px || px < 4) return undefined;
    // +4mm slack — fonts/logo may grow slightly in the final render;
    // the page being a few mm larger is fine, smaller means page-2 spill.
    return Math.max(20, Math.ceil((px / 96) * 25.4) + 4);
  } catch { return undefined; }
}

export function measureThermalContentHeightMm(rootEl: HTMLElement | null, settings: RestaurantSettings, min = 18): number | undefined {
  const h = getThermalPrintJobHeightMm(rootEl, settings);
  return h == null ? undefined : Math.max(min, h);
}

export function shouldUsePrinterDefaultPageSize(_settings: RestaurantSettings) {
  // OLD-POS PORT: always FALSE — an explicit pageSize (width + measured height)
  // is sent for every print. Relying on the driver-default page was the root
  // cause of top-offset, uneven margins, and extra blank feed.
  return false;
}

/**
 * Longest a slip may legitimately hold the POS in print mode. While
 * `thermal-printing` is on the body the print CSS hides the whole POS UI, so
 * if a cleanup is ever missed the cashier is left staring at a white screen
 * with a slip in the corner and has to restart the app. Every session now
 * carries its own watchdog as a last line of defence — cleanup is still done
 * properly by the callers' `finally` blocks, this only catches the
 * impossible case.
 */
const PRINT_SESSION_WATCHDOG_MS = 15000;

/** Force the POS out of print mode, whatever left it there. */
export function forceExitThermalPrintMode() {
  if (typeof document === 'undefined') return;
  const body = document.body;
  body.classList.remove('thermal-printing');
  body.classList.remove('thermal-compact');
  body.classList.remove('thermal-compact-shrink-logo');
  delete body.dataset.printActive;
  document.querySelectorAll('.receipt-print-portal[data-active-print]')
    .forEach(el => el.removeAttribute('data-active-print'));
}

export function prepareThermalPrintSession(rootEl: HTMLElement | null, compact: boolean = false) {
  if (typeof document === 'undefined') return () => {};
  const body = document.body;
  const portal = rootEl?.closest('.receipt-print-portal') as HTMLElement | null;
  body.classList.add('thermal-printing');
  if (compact) body.classList.add('thermal-compact');
  body.dataset.printActive = 'true';
  if (portal) portal.dataset.activePrint = 'true';

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    clearTimeout(watchdog);
    body.classList.remove('thermal-printing');
    body.classList.remove('thermal-compact');
    delete body.dataset.printActive;
    if (portal) delete portal.dataset.activePrint;
  };
  const watchdog = setTimeout(() => {
    if (done) return;
    console.warn('[DT-Print] print session watchdog fired — restoring the POS screen');
    cleanup();
    forceExitThermalPrintMode();
  }, PRINT_SESSION_WATCHDOG_MS);

  return cleanup;
}

function applyPrintMarginVariables(rootEl: HTMLElement | null, settings?: RestaurantSettings) {
  if (!rootEl || !settings) return;
  const margins = getEffectiveReceiptMargins(settings);
  rootEl.style.setProperty('--dt-print-padding-top', `${positiveMm(margins.top)}mm`);
  rootEl.style.setProperty('--dt-print-padding-bottom', `${positiveMm(margins.bottom)}mm`);
  rootEl.style.setProperty('--dt-print-padding-left', `${positiveMm(margins.left)}mm`);
  rootEl.style.setProperty('--dt-print-padding-right', `${positiveMm(margins.right)}mm`);
  rootEl.style.setProperty('--dt-print-offset-top', `${offsetMm(margins.top)}mm`);
  rootEl.style.setProperty('--dt-print-offset-left', `${offsetMm(margins.left)}mm`);
  rootEl.style.setProperty('--dt-print-offset-right', `${offsetMm(margins.right)}mm`);
  rootEl.style.setProperty('--dt-print-offset-bottom', `${offsetMm(margins.bottom)}mm`);
  // Compact mode tuning (user-set from Settings)
  const s = settings as any;
  const fs = typeof s.receiptCompactFontSize === 'number' ? Math.max(10, Math.min(16, s.receiptCompactFontSize)) : 12;
  const lh = typeof s.receiptCompactLineHeight === 'number' ? Math.max(1, Math.min(2, s.receiptCompactLineHeight)) : 1.12;
  rootEl.style.setProperty('--dt-compact-font-size', `${fs}px`);
  rootEl.style.setProperty('--dt-compact-line-height', `${lh}`);
}

export function beginThermalPrintDomSession(
  rootEl: HTMLElement | null,
  paperWidth: NonNullable<RestaurantSettings['paperSize']>,
  _heightMm?: number,
  settings?: RestaurantSettings,
) {
  applyPrintMarginVariables(rootEl, settings);
  const compact = !!(settings as any)?.receiptCompactMode || (settings as any)?.receiptDesign === 'compact-thermal';
  const shrinkLogo = compact && (settings as any)?.receiptCompactPreserveLogo === false;
  if (typeof document !== 'undefined') {
    if (shrinkLogo) document.body.classList.add('thermal-compact-shrink-logo');
    else document.body.classList.remove('thermal-compact-shrink-logo');
  }
  const removeStyle = injectPrintCss(paperWidth as PaperSize, compact);
  const cleanupSession = prepareThermalPrintSession(rootEl, compact);
  return () => {
    cleanupSession();
    removeStyle();
    if (typeof document !== 'undefined') document.body.classList.remove('thermal-compact-shrink-logo');
  };
}

/**
 * Wait until the receipt is actually laid out and painted.
 *
 * Callers used to follow this with a flat `await sleep(150)` because a
 * freshly injected print stylesheet could still be settling and the printer
 * would capture a blank page. A fixed sleep is both too slow on a healthy
 * machine and too short on a loaded one, so it now waits for the things that
 * really matter: two animation frames (style + layout), webfonts (the usual
 * cause of a late reflow on a thermal slip), then one more frame to paint.
 * On a warm cache this returns in well under a frame's time.
 */
export function waitForThermalPrintLayout(): Promise<void> {
  const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
  const fonts = (): Promise<void> => {
    const f: any = typeof document !== 'undefined' ? (document as any).fonts : null;
    if (!f?.ready) return Promise.resolve();
    // Never let a stuck font loader hold a print job.
    return Promise.race([
      f.ready.then(() => undefined),
      new Promise<void>(r => setTimeout(r, 250)),
    ]);
  };
  return frame().then(frame).then(fonts).then(frame);
}

export function buildThermalPrintCss(paperWidth: NonNullable<RestaurantSettings['paperSize']>, _heightMm?: number, compact: boolean = false) {
  return buildCss(paperWidth as PaperSize, compact);
}
