// ============================================================
// RECEIPT LAYOUT — the equal-margin locks.
//
// The fault these pin was reported repeatedly and "fixed" repeatedly,
// because only ONE of the two print paths was ever measured. The raster
// path was symmetric; the driver path laid the slip out at the content
// width inside a full-roll page with no centring, so it printed 0mm on the
// left and 11.9mm on the right of an 80mm roll.
//
// These tests assert the property directly — equal in, equal out, on every
// paper profile and BOTH modes — rather than asserting the CSS text, so a
// future refactor that changes the stylesheet but keeps the geometry still
// passes, and one that quietly re-breaks the centring cannot.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  resolveReceiptLayout,
  expectedMargins,
  pageWidthMmFor,
  contentOffsetMmFor,
  layoutCss,
  type LayoutMode,
} from '@/printing/receiptLayout';
import {
  PAPER_PROFILES,
  assertProfileConsistency,
  columnsOf,
  DOTS_PER_MM,
} from '@/printing/paperProfile';
import { alignmentTestLines } from '@/printing/alignmentTest';

const PROFILES = ['58mm', '80mm', '110mm'] as const;
const MODES: LayoutMode[] = ['raster', 'html'];

describe('paper profiles', () => {
  it('keeps dots and millimetres in step at 203 DPI', () => {
    // escposRaster.cjs derives its dots-per-mm from these numbers. If a
    // profile drifts, every margin on that paper lands somewhere else.
    expect(() => assertProfileConsistency()).not.toThrow();
    for (const p of Object.values(PAPER_PROFILES)) {
      expect(p.dots).toBe(p.printableMm * DOTS_PER_MM);
    }
  });

  it('never claims the roll width as printable', () => {
    // Authoring at the roll width is what makes the driver clip or rescale
    // the slip, and a rescaled slip lands off-centre.
    for (const p of Object.values(PAPER_PROFILES)) {
      expect(p.printableMm).toBeLessThan(p.paperMm);
    }
  });

  it('pins the documented character counts', () => {
    expect(columnsOf('80mm', 'A')).toBe(48);
    expect(columnsOf('80mm', 'B')).toBe(64);
    expect(columnsOf('58mm', 'A')).toBe(32);
    expect(columnsOf('58mm', 'B')).toBe(42);
  });
});

describe('equal margins', () => {
  it('prints the same gap on both edges when left and right are equal', () => {
    for (const paper of PROFILES) {
      for (const mm of [0, 1, 2, 3, 5]) {
        const layout = resolveReceiptLayout({ paper, leftMm: mm, rightMm: mm });
        for (const mode of MODES) {
          const { leftGapMm, rightGapMm } = expectedMargins(layout, mode);
          expect(
            Math.abs(leftGapMm - rightGapMm),
            `${paper} @ ${mm}mm (${mode}) → L ${leftGapMm} / R ${rightGapMm}`,
          ).toBeLessThanOrEqual(0.1);
        }
      }
    }
  });

  it('places the content block so both paper edges get the same blank band', () => {
    // This is the arithmetic the driver path got wrong: it offset the block
    // by the user margin alone and ignored the head's own unprintable inset,
    // so every millimetre of slack piled up on the right.
    for (const paper of PROFILES) {
      const layout = resolveReceiptLayout({ paper, leftMm: 2, rightMm: 2 });
      const pageMm = pageWidthMmFor(layout, 'html');
      const offset = contentOffsetMmFor(layout, 'html');
      const trailing = pageMm - offset - layout.contentMm;
      expect(Math.abs(offset - trailing), `${paper}: left ${offset} vs right ${trailing}`)
        .toBeLessThanOrEqual(0.1);
    }
  });

  it('splits leftover width evenly when a calibrated content width is used', () => {
    // A calibration override used to honour the left margin and dump the
    // remainder on the right.
    const layout = resolveReceiptLayout({ paper: '80mm', contentWidthMm: 60 });
    expect(layout.contentMm).toBe(60);
    expect(layout.leftMm).toBeCloseTo(layout.rightMm, 1);
  });

  it('equalises an asymmetric pair unless the caller opts in', () => {
    // Asymmetric values reached this resolver from an old shipped default, a
    // stale migration and a restored backup, and every one printed a slip hard
    // against the left edge with a wide band down the right. Equalising here
    // means no stored value, however it got there, can do that again.
    const fixed = resolveReceiptLayout({ paper: '80mm', leftMm: 3, rightMm: 10 });
    expect(fixed.leftMm).toBe(fixed.rightMm);
    // The SMALLER side wins: widening both would eat printable width.
    expect(fixed.leftMm).toBe(3);
  });

  it('honours an explicit calibration when asymmetry is opted into', () => {
    // Compensating for one machine's head offset is the one legitimate reason
    // for the two sides to differ.
    const layout = resolveReceiptLayout({ paper: '80mm', leftMm: 6, rightMm: 1, allowAsymmetric: true });
    expect(layout.leftMm).toBe(6);
    expect(layout.rightMm).toBe(1);
    expect(layout.contentMm).toBe(65);
  });

  it('fills the full printable width when no margin is set', () => {
    // The head already cannot mark ~4mm of each edge, and that inset IS the
    // visual margin. Subtracting more made the raw slip narrower than the
    // same bill printed through the Windows driver.
    const layout = resolveReceiptLayout({ paper: '80mm' });
    expect(layout.contentMm).toBe(72);
    expect(layout.contentDots).toBe(576);
    expect(layout.columnsFontA).toBe(48);
  });
});

describe('layout CSS', () => {
  it('never emits a fixed pixel width', () => {
    // Chromium maps CSS mm at 96 DPI while the head prints at 203 DPI, so a
    // px width can never line up with the paper.
    for (const paper of PROFILES) {
      const layout = resolveReceiptLayout({ paper, leftMm: 2, rightMm: 2 });
      for (const mode of MODES) {
        expect(layoutCss(layout, mode)).not.toMatch(/width:\s*\d+px/);
      }
    }
  });

  it('carries enough specificity to beat the shared portal rule', () => {
    // printCss.ts styles the active portal at the FULL ROLL width with
    // !important, and the snapshot root carries that class and attribute.
    // A less specific selector loses and the slip is laid out at 80mm again.
    const layout = resolveReceiptLayout({ paper: '80mm', leftMm: 2, rightMm: 2 });
    const css = layoutCss(layout, 'html');
    expect(css).toContain('.dt-fast-root.receipt-print-portal[data-active-print="true"]');
  });

  it('makes tables and rules span the full content width', () => {
    const layout = resolveReceiptLayout({ paper: '80mm', leftMm: 2, rightMm: 2 });
    const css = layoutCss(layout, 'html');
    expect(css).toMatch(/\.dt-fast-root table[\s\S]*?width:\s*100%/);
    expect(css).toContain('box-sizing: border-box !important');
  });

  it('gives the raster mode a page that is exactly the content', () => {
    // One CSS millimetre must be one printed millimetre — nothing to rescale.
    const layout = resolveReceiptLayout({ paper: '80mm', leftMm: 2, rightMm: 2 });
    expect(pageWidthMmFor(layout, 'raster')).toBe(layout.contentMm);
    expect(contentOffsetMmFor(layout, 'raster')).toBe(0);
    expect(pageWidthMmFor(layout, 'html')).toBe(layout.paperMm);
  });
});

describe('alignment test slip', () => {
  it('rules exactly one full line, which must not wrap', () => {
    // If this ever exceeds the column count the ruler wraps on paper and the
    // margins look wrong when they are not. Fix the constant, not the font.
    for (const paper of PROFILES) {
      const layout = resolveReceiptLayout({ paper, leftMm: 0, rightMm: 0 });
      const lines = alignmentTestLines({ paper });
      const ruler = lines.find(l => /^=+$/.test(l));
      expect(ruler, `${paper} has no ruler line`).toBeTruthy();
      expect(ruler!.length).toBe(layout.columnsFontA);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(layout.columnsFontA);
    }
  });

  it('is 48 characters on 80mm and 32 on 58mm', () => {
    expect(alignmentTestLines({ paper: '80mm' }).find(l => /^=+$/.test(l))!.length).toBe(48);
    expect(alignmentTestLines({ paper: '58mm' }).find(l => /^=+$/.test(l))!.length).toBe(32);
  });

  it('puts LEFT and RIGHT hard against opposite edges', () => {
    const line = alignmentTestLines({ paper: '80mm' }).find(l => l.startsWith('LEFT'))!;
    expect(line.startsWith('LEFT')).toBe(true);
    expect(line.endsWith('RIGHT')).toBe(true);
    expect(line.length).toBe(48);
  });

  it('records the profile, dot width and strategy on the slip itself', () => {
    // A photograph of the slip has to be self-describing, or a support call
    // turns into guesswork about which settings produced it.
    const text = alignmentTestLines({ paper: '80mm', strategy: 'raw-escpos' }).join('\n');
    expect(text).toContain('80mm');
    expect(text).toContain('576');
    expect(text).toContain('raw-escpos');
  });
});
