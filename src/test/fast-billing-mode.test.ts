// ============================================================
// FAST BILLING MODE — one switch, every slip.
//
// A shop that chooses speed wants it on everything. A raw bill followed by a
// rendered token is the worst of both: two looks, two speeds. These tests pin
// that the switch reaches all four slip types and that a single printer can
// still override it for hardware that refuses raw bytes.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePrintMode, wantsRaw, wantsDriverOnly } from '@/printing/printMode';
import { EscposDoc, buildShiftReportBytes, columnsFor } from '@/printing/escposBuilder';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('mode resolution', () => {
  it('turns every slip raw when the shop switch is on', () => {
    expect(resolvePrintMode({ settings: { fastRawPrintMode: true } })).toBe('raw');
    expect(wantsRaw({ settings: { fastRawPrintMode: true } })).toBe(true);
  });

  it('keeps the designed template when the switch is off', () => {
    expect(resolvePrintMode({ settings: { fastRawPrintMode: false } })).toBe('auto');
    expect(resolvePrintMode({ settings: {} })).toBe('auto');
    expect(resolvePrintMode({})).toBe('auto');
  });

  it('lets one printer override the shop switch', () => {
    // Mixed hardware is real: a counter printer may refuse raw bytes while
    // the kitchen printer is happy with them.
    expect(resolvePrintMode({
      printerConfig: { printMode: 'driver' },
      settings: { fastRawPrintMode: true },
    })).toBe('driver');

    expect(resolvePrintMode({
      printerConfig: { printMode: 'raw' },
      settings: { fastRawPrintMode: false },
    })).toBe('raw');
  });

  it('treats an auto printer as deferring to the shop switch', () => {
    expect(resolvePrintMode({
      printerConfig: { printMode: 'auto' },
      settings: { fastRawPrintMode: true },
    })).toBe('raw');
  });

  it('reports driver-only separately from raw', () => {
    expect(wantsDriverOnly({ printerConfig: { printMode: 'driver' } })).toBe(true);
    expect(wantsDriverOnly({ settings: { fastRawPrintMode: true } })).toBe(false);
  });
});

describe('every slip type consults the shared resolver', () => {
  const CALL_SITES = [
    { slip: 'customer receipt', file: 'components/ReceiptPreview.tsx' },
    { slip: 'KOT', file: 'components/KitchenReceipt.tsx' },
    { slip: 'token', file: 'components/TokenReceipt.tsx' },
    { slip: 'token (slip helper)', file: 'lib/tokenSlip.ts' },
    { slip: 'shift report', file: 'components/ShiftReport.tsx' },
  ];

  it('imports the resolver rather than re-deciding locally', () => {
    // Each of these components used to work the mode out for itself, which is
    // how the bill honoured it while the KOT, the token and the report did not.
    for (const { slip, file } of CALL_SITES) {
      const src = read(file);
      expect(
        /from '@\/printing\/printMode'/.test(src),
        `${slip} (${file}) does not use the shared print-mode resolver`,
      ).toBe(true);
    }
  });

  it('never re-implements the precedence inline', () => {
    for (const { slip, file } of CALL_SITES) {
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(
        /printMode\s*\|\|\s*'auto'/.test(code),
        `${slip} (${file}) still decides the mode inline`,
      ).toBe(false);
    }
  });
});

describe('the shift report has a raw renderer', () => {
  // It was the one slip with no raw builder, so Fast Billing produced a raw
  // bill, a raw KOT, a raw token — and then a rendered report.
  const data = {
    range: {},
    summary: { productAmount: 6080, discount: 0, serviceCharge: 0, rounding: 0, subTotal: 6080, refundAmount: 0, actualSales: 6080 },
    tax: { taxable: 0, taxPct: 0, taxAmount: 0 },
    transactions: { checkedOut: 12, avgIncome: 506.67, soldProducts: 24, refunded: 0, refundedProducts: 0 },
    drawer: { startingCash: 0, orderIncome: 6080, refund: 0, expectedCash: 6080, actualEndingCash: 6080 },
    payments: [{ method: 'cash', amount: 6080, percent: 100 }],
    types: [{ type: 'dining', orders: 12, amount: 6080 }],
    categories: [{ name: 'Burger', qty: 20, amount: 3960 }],
    products: [{ name: 'Chapli Kabab burger', qty: 2, amount: 500 }],
    totals: { catQty: 24, catAmt: 6080 },
  };

  it('produces a real slip with the geometry commands and a cut', () => {
    const bytes = buildShiftReportBytes(data, { name: 'FIRST CHEF', paperSize: '80mm' } as any);
    expect(bytes.length).toBeGreaterThan(300);
    expect(bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x4c)).toBe(true); // GS L
    expect(bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x57)).toBe(true); // GS W
    expect(bytes.some((b, i) => b === 0x1d && bytes[i + 1] === 0x56)).toBe(true); // GS V cut
  });

  it('survives a report with no sales at all', () => {
    const bytes = buildShiftReportBytes({}, { name: 'SHOP', paperSize: '80mm' } as any);
    expect(bytes.length).toBeGreaterThan(80);
  });
});

describe('enlarged text wraps on word boundaries', () => {
  it('halves the usable columns at double width', () => {
    // GS ! doubles the glyph, so half as many characters fit. The builder did
    // not track this and the printer hard-wrapped mid-word: the client's slip
    // read "FIRST CHEF PIZZA & BUR / GER".
    const d = new EscposDoc('80mm');
    expect(d.effectiveCols).toBe(columnsFor('80mm'));
    d.size(2, 2);
    expect(d.effectiveCols).toBe(Math.floor(columnsFor('80mm') / 2));
  });

  it('breaks a long shop name between words, not inside one', () => {
    const d = new EscposDoc('80mm');
    d.size(2, 2).fit('FIRST CHEF PIZZA & BURGER');
    const text = Buffer.from(d.bytes()).toString('latin1');
    expect(text).not.toContain('BUR\nGER');
    expect(text).toContain('BURGER');
  });

  it('restores the full column count when the size goes back to normal', () => {
    const d = new EscposDoc('80mm');
    d.size(2, 2);
    d.size(1, 1);
    expect(d.effectiveCols).toBe(columnsFor('80mm'));
  });
});
