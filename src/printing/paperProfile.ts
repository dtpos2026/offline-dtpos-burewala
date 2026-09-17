// ============================================================
// PAPER PROFILES — the one place a paper size is described.
//
// Every print path (HTML preview, Electron driver print, ESC/POS raster and
// ESC/POS raw text) reads its widths from here. Before this module the same
// four numbers were written out separately in printGeometry.ts, printCss.ts,
// escposBuilder.ts and electron/escposRaster.cjs, and they disagreed — which
// is how a slip could be laid out at one width and printed at another.
//
// The numbers
// -----------
//   paperMm      physical roll width
//   printableMm  the width the thermal head can actually mark. ALWAYS less
//                than the roll: an 80mm roll marks ~72mm, a 58mm roll ~48mm.
//                Authoring a template at the ROLL width is what makes the
//                driver clip or rescale it, and a rescaled slip lands
//                off-centre. Author at the printable width.
//   dots         printableMm at 203 DPI (8 dots/mm) — what `GS W` is set to
//                and what the raster stage packs into.
//   charsFontA   monospace columns in Font A (12x24 dots)
//   charsFontB   monospace columns in Font B (9x17 dots)
//
// The character counts are not decoration: the alignment-test ruler is
// exactly `charsFontA` characters wide, so if a ruler wraps to a second line
// on real paper the constant here is wrong — fix the constant, never the
// font size.
// ============================================================

export type PaperProfileId = '58mm' | '80mm' | '110mm';

export interface PaperProfile {
  id: PaperProfileId;
  /** Human label for Printer Settings. */
  label: string;
  /** Physical roll width (mm). */
  paperMm: number;
  /** Width the head can mark (mm). */
  printableMm: number;
  /** Printable width in printer dots at 203 DPI. */
  dots: number;
  /** Monospace columns in Font A. */
  charsFontA: number;
  /** Monospace columns in Font B. */
  charsFontB: number;
}

/**
 * 203 DPI thermal heads mark 8 dots per millimetre. Every profile below
 * satisfies `dots === printableMm * DOTS_PER_MM`; `assertProfileConsistency`
 * holds that true and the test suite pins it.
 */
export const DOTS_PER_MM = 8;

export const PAPER_PROFILES: Record<PaperProfileId, PaperProfile> = {
  '58mm': {
    id: '58mm',
    label: '58 mm (compact)',
    paperMm: 58,
    printableMm: 48,
    dots: 384,
    charsFontA: 32,
    charsFontB: 42,
  },
  '80mm': {
    id: '80mm',
    label: '80 mm (standard)',
    paperMm: 80,
    printableMm: 72,
    dots: 576,
    charsFontA: 48,
    charsFontB: 64,
  },
  '110mm': {
    id: '110mm',
    label: '110 mm (wide)',
    paperMm: 110,
    printableMm: 104,
    dots: 832,
    charsFontA: 69,
    charsFontB: 92,
  },
};

/** Every profile a user may pick in Printer Settings. */
export const PAPER_PROFILE_LIST: PaperProfile[] = [
  PAPER_PROFILES['80mm'],
  PAPER_PROFILES['58mm'],
  PAPER_PROFILES['110mm'],
];

/** Resolve a stored/unknown value to a real profile, defaulting to 80mm. */
export function paperProfileOf(value: unknown): PaperProfile {
  const id = String(value ?? '') as PaperProfileId;
  return PAPER_PROFILES[id] ?? PAPER_PROFILES['80mm'];
}

/** Physical roll width (mm). */
export function paperMmOf(value: unknown): number {
  return paperProfileOf(value).paperMm;
}

/** Markable width (mm) — always narrower than the roll. */
export function printableMmOf(value: unknown): number {
  return paperProfileOf(value).printableMm;
}

/** Printable width in printer dots at 203 DPI. */
export function printableDotsOf(value: unknown): number {
  return paperProfileOf(value).dots;
}

/** Monospace columns for the chosen ESC/POS font. */
export function columnsOf(value: unknown, font: 'A' | 'B' = 'A'): number {
  const p = paperProfileOf(value);
  return font === 'B' ? p.charsFontB : p.charsFontA;
}

/**
 * Guard the invariant the whole pipeline rests on. Called by the tests and
 * cheap enough to call at startup: a profile whose dots and millimetres
 * disagree silently shifts every margin on that paper size.
 */
export function assertProfileConsistency(): void {
  for (const p of Object.values(PAPER_PROFILES)) {
    if (p.dots !== p.printableMm * DOTS_PER_MM) {
      throw new Error(
        `Paper profile ${p.id} is inconsistent: ${p.printableMm}mm x ${DOTS_PER_MM} != ${p.dots} dots`,
      );
    }
    if (p.printableMm >= p.paperMm) {
      throw new Error(
        `Paper profile ${p.id} claims a printable width (${p.printableMm}mm) that is not narrower than the roll (${p.paperMm}mm)`,
      );
    }
  }
}
