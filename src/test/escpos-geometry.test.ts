// ============================================================
// ESC/POS GEOMETRY — the sticky-setting locks.
//
// `GS L` (left margin) and `GS W` (print area width) live in the printer's
// NVRAM. They survive between jobs AND power cycles, and `ESC @` does not
// clear them on many models. A printer that was ever left with a non-zero
// left margin, or a print-area width below its full dot count, prints every
// later job shifted and short — content tight to the left with a wide blank
// band on the right — no matter what the POS sends.
//
// The builder therefore states both on EVERY job, unconditionally. These
// tests exist so that "optimising away the redundant bytes" cannot silently
// bring the lopsided slip back.
// ============================================================
import { describe, it, expect } from 'vitest';
import { EscposDoc, columnsFor } from '@/printing/escposBuilder';
import { buildAlignmentTestBytes } from '@/printing/alignmentTest';
import { resolveReceiptLayout } from '@/printing/receiptLayout';
import { repairLegacyMargins, DEFAULT_SIDE_MARGIN_MM, defaultPrinterConfig } from '@/lib/printerSettings';

/** Find a command's operands in the byte stream, or null. */
function findCommand(bytes: number[], a: number, b: number): [number, number] | null {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === a && bytes[i + 1] === b) return [bytes[i + 2], bytes[i + 3]];
  }
  return null;
}
const word = (lo: number, hi: number) => lo | (hi << 8);

describe('sticky printer geometry', () => {
  it('states GS L and GS W on every job', () => {
    for (const paper of ['58mm', '80mm', '110mm'] as const) {
      const bytes = new EscposDoc(paper).bytes();
      expect(findCommand(bytes, 0x1d, 0x4c), `${paper} is missing GS L`).not.toBeNull();
      expect(findCommand(bytes, 0x1d, 0x57), `${paper} is missing GS W`).not.toBeNull();
    }
  });

  it('sets the left margin to zero when no margin is configured', () => {
    // A leftover non-zero left margin in printer memory is exactly what shifts
    // the slip right and eats the right edge.
    const bytes = new EscposDoc('80mm').bytes();
    const gsL = findCommand(bytes, 0x1d, 0x4c)!;
    expect(word(gsL[0], gsL[1])).toBe(0);
  });

  it('sets the print area to the full printable width when unmargined', () => {
    const bytes = new EscposDoc('80mm').bytes();
    const gsW = findCommand(bytes, 0x1d, 0x57)!;
    expect(word(gsW[0], gsW[1])).toBe(576);

    const narrow = new EscposDoc('58mm').bytes();
    const gsW58 = findCommand(narrow, 0x1d, 0x57)!;
    expect(word(gsW58[0], gsW58[1])).toBe(384);
  });

  it('translates mm margins into the matching dot values', () => {
    const doc = new EscposDoc('80mm', { leftMm: 2, rightMm: 2 });
    const bytes = doc.bytes();
    const gsL = findCommand(bytes, 0x1d, 0x4c)!;
    const gsW = findCommand(bytes, 0x1d, 0x57)!;
    // 8 dots per mm at 203 DPI.
    expect(word(gsL[0], gsL[1])).toBe(16);
    expect(word(gsW[0], gsW[1])).toBe(576 - 32);
    expect(doc.layout.contentMm).toBe(68);
  });

  it('emits GS L before any text so the margin applies to the whole slip', () => {
    const doc = new EscposDoc('80mm', { leftMm: 2, rightMm: 2 });
    doc.line('ITEM');
    const bytes = doc.bytes();
    const gsLAt = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x4c);
    const textAt = bytes.findIndex(b => b === 'I'.charCodeAt(0));
    expect(gsLAt).toBeGreaterThanOrEqual(0);
    expect(gsLAt).toBeLessThan(textAt);
  });
});

describe('column counts', () => {
  it('reads the shared paper profile rather than a local table', () => {
    // A local copy claimed 64 columns on 110mm where the profile says 69.
    expect(columnsFor('80mm')).toBe(48);
    expect(columnsFor('58mm')).toBe(32);
    expect(columnsFor('110mm')).toBe(69);
  });

  it('narrows the usable columns when margins narrow the content', () => {
    const wide = resolveReceiptLayout({ paper: '80mm', leftMm: 0, rightMm: 0 });
    const tight = resolveReceiptLayout({ paper: '80mm', leftMm: 6, rightMm: 6 });
    expect(tight.columnsFontA).toBeLessThan(wide.columnsFontA);
  });
});

describe('alignment test slip bytes', () => {
  it('carries the geometry commands and a cut', () => {
    const bytes = buildAlignmentTestBytes({ paper: '80mm', leftMm: 2, rightMm: 2 });
    expect(findCommand(bytes, 0x1d, 0x4c)).not.toBeNull();
    expect(findCommand(bytes, 0x1d, 0x57)).not.toBeNull();
    // GS V — cut.
    expect(bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56)).toBe(true);
  });

  it('is not an empty slip', () => {
    expect(buildAlignmentTestBytes({ paper: '80mm' }).length).toBeGreaterThan(200);
  });
});

describe('printer margin defaults', () => {
  it('creates new printers with equal side margins', () => {
    // These shipped as 3mm left against 10mm right — a built-in 7mm
    // asymmetry fed straight into the print path on every bill.
    const cfg = defaultPrinterConfig();
    expect(cfg.leftMarginMm).toBe(DEFAULT_SIDE_MARGIN_MM);
    expect(cfg.rightMarginMm).toBe(DEFAULT_SIDE_MARGIN_MM);
    expect(cfg.leftMarginMm).toBe(cfg.rightMarginMm);
  });

  it('repairs machines still holding the old lopsided default', () => {
    const repaired = repairLegacyMargins([
      { ...defaultPrinterConfig(), leftMarginMm: 3, rightMarginMm: 10 },
    ]);
    expect(repaired[0].leftMarginMm).toBe(DEFAULT_SIDE_MARGIN_MM);
    expect(repaired[0].rightMarginMm).toBe(DEFAULT_SIDE_MARGIN_MM);
  });

  it('never overwrites a deliberate calibration', () => {
    // A shop that tuned its own printer to 4/1 is compensating for that
    // machine. Re-centring those numbers would be a second bug, not a fix.
    const tuned = { ...defaultPrinterConfig(), leftMarginMm: 4, rightMarginMm: 1 };
    const repaired = repairLegacyMargins([tuned]);
    expect(repaired[0].leftMarginMm).toBe(4);
    expect(repaired[0].rightMarginMm).toBe(1);
  });
});
