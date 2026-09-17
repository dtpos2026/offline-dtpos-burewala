// ============================================================
// CAPTURE WIDTH — the squeezed-slip lock.
//
// A silent test print came back with equal margins printed ON the slip
// ("Margins T:0 R:2 B:0 L:2 mm") and yet the content covered only about 60%
// of the paper, with a wide blank band down the right. The margins were never
// the problem: the capture was.
//
// The worker measured the slip as Math.max(rect.width, scrollWidth). The
// document is laid out at exactly the content width, so scrollWidth only
// exceeds rect.width when a child OVERFLOWS — a long unbroken word, a table
// that will not compress. That overflow is blank paper to the right, and
// taking it as the capture width meant the downscale to the printer's dots
// squeezed the whole receipt into a fraction of the roll.
//
// These tests pin the arithmetic of that squeeze, so the width can never
// silently go back to following scrollWidth.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveReceiptLayout, layoutCss } from '@/printing/receiptLayout';

const mainCjs = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');

/** What fraction of the paper the ink ends up covering. */
function inkCoverage(authoredPx: number, overflowPx: number, contentDots: number, paperDots: number) {
  const capturedPx = authoredPx + overflowPx;
  // The capture is downscaled so its FULL width maps onto contentDots.
  const inkDots = (authoredPx / capturedPx) * contentDots;
  return inkDots / paperDots;
}

describe('the squeeze this caused', () => {
  it('shows how a modest overflow cost most of the paper', () => {
    const layout = resolveReceiptLayout({ paper: '80mm', leftMm: 2, rightMm: 2 });
    const authored = Math.round(layout.contentMm * (96 / 25.4));

    // No overflow: the ink fills the printable area.
    const clean = inkCoverage(authored, 0, layout.contentDots, layout.printableDots);
    expect(clean).toBeGreaterThan(0.9);

    // A child overflowing by two thirds of the slip drops coverage to the
    // "about 60% of the paper" the photographed slip showed.
    const squeezed = inkCoverage(authored, Math.round(authored * 0.62), layout.contentDots, layout.printableDots);
    expect(squeezed).toBeLessThan(0.65);
  });
});

describe('the worker measures the authored width', () => {
  it('no longer takes the maximum of rect width and scrollWidth', () => {
    expect(mainCjs).not.toMatch(/Math\.max\(\s*r\.width,\s*root\.scrollWidth/);
  });

  it('still lets the slip grow downwards', () => {
    // Height legitimately follows the content; only width is authored.
    expect(mainCjs).toMatch(/scrollHeight/);
  });

  it('reports the overflow instead of silently absorbing it', () => {
    expect(mainCjs).toMatch(/slip overflow/i);
  });
});

describe('the layout prevents horizontal overflow at source', () => {
  it('clips sideways but never vertically', () => {
    const css = layoutCss(resolveReceiptLayout({ paper: '80mm' }), 'raster');
    expect(css).toMatch(/overflow-x:\s*hidden/);
    expect(css).toMatch(/overflow-y:\s*visible/);
  });
});
