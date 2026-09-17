// ============================================================
// PRINTER NAME MATCHING — shared, robust, testable.
//
// Client bug (v1.0.39b): "BIXOLON SRP-352plusIII (Copy 1)" Windows me
// mojood tha lekin software kehta tha "detect nahi ho raha", aur print ki
// koshish hi nahi karta tha.
//
// Windows par naam match na hone ki asal wajahen:
//   • "(Copy 1)" / "(Copy 2)"      — duplicate driver install
//   • "(redirected 2)"             — RDP / session printers
//   • double spaces, non-breaking space (\u00A0), trailing space
//   • `name` aur `displayName` ka farq
//   • printer rename ho jaye aur settings me purana naam reh jaye
//
// Yeh module wohi 6-marhala logic rakhta hai jo electron/main.cjs me hai,
// taake renderer (Settings/Diagnostics) bhi wahi faisla kare aur ghalat
// "not detected" warning na dikhaye.
// ============================================================

export interface SystemPrinterLike {
  name?: string;
  displayName?: string;
}

/** Spaces normalize + lowercase. */
export function normalizePrinterName(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "(Copy 1)" / "(redirected 2)" jaise suffix hata deta hai. */
export function stripPrinterSuffix(s: string | undefined | null): string {
  return normalizePrinterName(s)
    .replace(/\s*\((?:copy|redirected)\s*\d*\)\s*$/i, '')
    .trim();
}

export type PrinterMatchStage =
  | 'exact' | 'normalized' | 'no-suffix' | 'starts-with' | 'contains' | 'reverse' | 'none';

export interface PrinterMatchResult {
  printer: SystemPrinterLike | null;
  /** Windows ka asal naam (print ke liye yehi bhejna hai). */
  name: string;
  stage: PrinterMatchStage;
}

/**
 * Requested naam ko installed printers me dhoondo — sakht se narm tak.
 * Pehla marhala jo match kare wohi jeetta hai (sab se zyada bharosemand).
 */
export function matchPrinter(
  requested: string | undefined | null,
  printers: SystemPrinterLike[] | undefined | null,
): PrinterMatchResult {
  const list = Array.isArray(printers) ? printers : [];
  const raw = String(requested ?? '').replace(/\u00A0/g, ' ').trim();
  if (!raw || list.length === 0) return { printer: null, name: '', stage: 'none' };

  const reqN = normalizePrinterName(raw);
  const reqS = stripPrinterSuffix(raw);

  const stages: Array<[PrinterMatchStage, (p: SystemPrinterLike) => boolean]> = [
    ['exact', p => String(p.name ?? '') === raw || String(p.displayName ?? '') === raw],
    ['normalized', p => normalizePrinterName(p.name) === reqN || normalizePrinterName(p.displayName) === reqN],
    ['no-suffix', p => stripPrinterSuffix(p.name) === reqS || stripPrinterSuffix(p.displayName) === reqS],
    ['starts-with', p => !!reqS && (normalizePrinterName(p.name).startsWith(reqS) || normalizePrinterName(p.displayName).startsWith(reqS))],
    ['contains', p => reqS.length >= 4 && (normalizePrinterName(p.name).includes(reqS) || normalizePrinterName(p.displayName).includes(reqS))],
    // Ulta: settings me chhota naam ho aur Windows ka naam lamba
    ['reverse', p => {
      if (reqS.length < 4) return false;
      const n = normalizePrinterName(p.name);
      const d = normalizePrinterName(p.displayName);
      return (!!n && reqS.includes(n)) || (!!d && reqS.includes(d));
    }],
  ];

  for (const [stage, fn] of stages) {
    const hit = list.find(fn);
    if (hit) return { printer: hit, name: String(hit.name ?? '') || raw, stage };
  }
  return { printer: null, name: '', stage: 'none' };
}

/** Kya yeh printer Windows me mojood hai (narm matching ke sath)? */
export function isPrinterInstalled(
  requested: string | undefined | null,
  printers: SystemPrinterLike[] | undefined | null,
): boolean {
  return matchPrinter(requested, printers).printer !== null;
}
