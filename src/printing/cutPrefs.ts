// ============================================================
// COMPATIBILITY CUT — "feed, then cut" for printers that cut early.
//
// Some thermal printers (older models, and some BIXOLON / clone units) start the
// cut as soon as the last dot row is printed. The blade sits 15–25 mm above the
// print head, so the last line of the slip — the footer, "Printed …" — is still
// below the blade and is cut through, and the rest comes out on top of the NEXT
// slip. The normal sequence (`ESC d n` feed lines, then `GS V 0`) depends on the
// printer honouring the feed command and on its line spacing; this option does
// not rely on either:
//
//   raster (rendered slip, RAW)   COMPAT_PAD_MM of blank dot rows printed as part
//                                 of the image, then a few plain line feeds, then
//                                 the cut — the paper moves because ink rows are
//                                 being printed, whatever the feed command does.
//   ESC/POS text / LAN            plain LF bytes (the most universal feed), at least
//                                 COMPAT_MIN_TEXT_FEED_LINES of them, then the cut.
//   Windows driver                COMPAT_DRIVER_EXTRA_MM more blank paper before the
//                                 dot the driver has to print, then its own cut.
//
// It costs about 8–10 mm of paper per slip, so it is OFF unless a shop turns it on.
// Device-local (this computer's printers), like Print Quality and Margins.
// ============================================================

export const COMPAT_CUT_KEY = 'dtpos-compat-cut';
/** Blank paper printed (as dot rows) before the cut on the raster path. */
export const COMPAT_PAD_MM = 20;
/** Plain line feeds after that padding, before the cut. */
export const COMPAT_FEED_LINES = 3;
/** Fewest line feeds on the ESC/POS text path. */
export const COMPAT_MIN_TEXT_FEED_LINES = 8;
/** Extra blank paper on the Windows-driver path. */
export const COMPAT_DRIVER_EXTRA_MM = 8;

export function isCompatCut(): boolean {
  try { return localStorage.getItem(COMPAT_CUT_KEY) === '1'; } catch { return false; }
}

export function setCompatCut(on: boolean): void {
  try {
    if (on) localStorage.setItem(COMPAT_CUT_KEY, '1'); else localStorage.removeItem(COMPAT_CUT_KEY);
  } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new CustomEvent('dtpos-compat-cut-changed', { detail: { on } })); } catch { /* no window */ }
}
