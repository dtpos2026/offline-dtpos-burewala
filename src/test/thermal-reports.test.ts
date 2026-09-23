// ============================================================
// THERMAL REPORTS — POS Summary / Detailed, Shift, GRN, supplier statement
// (sections 1, 7, 8, 9).
//
// Proven here: the reports no longer print from a browser window at the
// paper width (the clipping cause), they go to the counter printer through
// the same path as the shift report, every value is kept whole, long labels
// wrap instead of being cut, and the text-mode (ESC/POS) version never runs
// past the paper's columns. The rendered layout was also checked in real
// Chromium through scripts/simulate-print.mjs (0 px overflow, ink exactly at
// the configured margins). Not provable here: a physical 80 mm printer.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EscposDoc } from '@/printing/escposBuilder';
import { thermalReportHtml, thermalReportBytes, reportMoney, esc, type ThermalReportDoc } from '@/printing/thermalReport';
import { shiftReportDoc, shiftReportHtml } from '@/components/ShiftReport';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const shop = { name: 'LOTUS CAFE & RESTAURANT', address: 'Green Belt 73, Satellite Town, Jhang', phone1: '0300-7623533', logo: 'data:image/png;base64,AAAA', currencySymbol: 'Rs', paperSize: '80mm' };
const LONG = 'Chicken Tikka Boneless Handi Special Family Size with Extra Cheese';

function shiftData(over: any = {}): any {
  return {
    settings: shop,
    range: { from: new Date('2026-09-23T09:00:00'), to: new Date('2026-09-23T23:00:00'), label: '14h', staffName: 'Ali' },
    summary: { productAmount: 1234567.5, discount: 100, serviceCharge: 0, temporaryCharge: 0, rounding: 0, subTotal: 1234467.5, refundAmount: 0, actualSales: 1234467.5 },
    tax: { taxable: 0, taxPct: 0, taxAmount: 0 },
    transactions: { checkedOut: 10, avgIncome: 123446.75, soldProducts: 20, refunded: 0, refundedProducts: 0 },
    drawer: { startingCash: 0, orderIncome: 1000, payIn: 0, refund: 0, payOut: 0, expectedCash: 1000, actualEndingCash: 1000 },
    payments: [{ method: 'cash', amount: 1234467.5, percent: 100 }], payTotal: 1234467.5,
    types: [{ type: 'dining', orders: 10, amount: 1234467.5 }],
    categories: [{ name: 'BBQ', qty: 20, amount: 1234467.5 }],
    products: [{ name: LONG, qty: 20, amount: 1234467.5 }],
    totals: { catQty: 20, catAmt: 1234467.5 },
    ...over,
  };
}

describe('the report layout', () => {
  const doc: ThermalReportDoc = {
    title: 'Sales Summary',
    meta: [['From', '23 Sep 2026, 09:00'], ['Supplier', 'A <b>bold</b> name']],
    blocks: [
      { kind: 'row', label: LONG, value: reportMoney(1234567.5, 'Rs') },
      { kind: 'table', head: ['Item', 'Qty', 'Amount'], rows: [[LONG, '3', 'Rs 4,500']], foot: ['Total', '3', 'Rs 4,500'] },
      { kind: 'total', label: 'TOTAL SALES', value: reportMoney(98765, 'Rs') },
    ],
    footer: 'Thank you',
  };

  it('carries the restaurant branding: logo, name, address, phone, title', () => {
    const html = thermalReportHtml(doc, shop);
    for (const s of ['dtr-logo', 'LOTUS CAFE &amp; RESTAURANT', 'Green Belt 73', '0300-7623533', 'Sales Summary']) expect(html).toContain(s);
    expect(html).toContain('Powered by Digital Target');
    expect(thermalReportHtml(doc, { ...shop, receiptShowPoweredBy: false })).not.toContain('Powered by Digital Target');
  });

  it('escapes what the shop typed', () => {
    const html = thermalReportHtml(doc, shop);
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; name');
    expect(esc('<img onerror=x>')).toBe('&lt;img onerror=x&gt;');
  });

  it('rows wrap long labels and keep values whole (no nowrap/max-width tricks the print CSS overrides)', () => {
    const html = thermalReportHtml(doc, shop);
    expect(html).toMatch(/\.dtr-row>\.l\{flex:1 1 0%;min-width:34%\}/);
    expect(html).toMatch(/\.dtr-tbl>\.n\{text-align:right;white-space:nowrap\}/);
    expect(html).toContain('grid-template-columns:minmax(0,1fr) auto auto');
    expect(html).toContain(LONG); // wrapped, never truncated
  });

  it('money is grouped and never splits between the symbol and the number', () => {
    expect(reportMoney(1234567.5, 'Rs')).toBe('Rs 1,234,567.50');
    expect(reportMoney(1200, 'PKR')).toBe('PKR 1,200');
    expect(reportMoney(-3200, 'Rs')).toBe('-Rs 3,200');
    expect(reportMoney(99, '')).toBe('99');
  });

  it('ESC/POS text version: every line fits the paper and nothing is cut off', async () => {
    const bytes = await thermalReportBytes(doc, shop, { paper: '80mm' });
    const cols = new EscposDoc('80mm').cols;
    const text = String.fromCharCode(...bytes).replace(/[\x00-\x09\x0b-\x1f]./g, '');
    const lines = text.split('\n').map(l => l.replace(/[^\x20-\x7e]/g, ''));
    for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(cols);
    const flat = lines.join(' ').replace(/\s+/g, ' ');
    for (const w of LONG.split(' ')) expect(flat).toContain(w);
    expect(flat).toContain('1,234,567.50');
  });
});

describe('ESC/POS rows wrap instead of truncating', () => {
  it('long label: every word printed, value flush right on the last line', () => {
    const d = new EscposDoc('80mm');
    const before = d.bytes().length;
    d.lr(LONG, 'Rs 1,234,560');
    const lines = String.fromCharCode(...d.bytes().slice(before)).split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(d.cols);
    expect(lines.join(' ').replace(/\s+/g, ' ')).toContain(LONG);
    expect(lines[lines.length - 1].endsWith('Rs 1,234,560')).toBe(true);
  });
  it('short label: one line, as before', () => {
    const d = new EscposDoc('80mm');
    const before = d.bytes().length;
    d.lr('Cash', 'Rs 10');
    const out = String.fromCharCode(...d.bytes().slice(before));
    expect(out.split('\n').filter(Boolean)).toHaveLength(1);
    expect(out.trimEnd().length).toBe(d.cols);
  });
});

describe('shift report', () => {
  it('now shows the restaurant header (it used to read a settings key that does not exist)', () => {
    const html = shiftReportHtml(shiftData());
    expect(html).toContain('LOTUS CAFE &amp; RESTAURANT');
    expect(html).toContain('Green Belt 73');
  });
  it('keeps every section of the client sample', () => {
    const doc = shiftReportDoc(shiftData());
    const titles = doc.blocks.filter(b => b.kind === 'section').map(b => (b as any).title);
    expect(titles).toEqual(['Summary', 'Tax', 'Transactions', 'Cash drawer', 'Payment report', 'Order types', 'Sold categories', 'Sold products']);
    expect(doc.blocks.some(b => b.kind === 'total' && b.label === 'Actual sales')).toBe(true);
  });
  it('payment amount and percent are separate columns (the old 74px column overflowed)', () => {
    const html = shiftReportHtml(shiftData());
    expect(html).toMatch(/Rs 1,234,467\.50<\/span><span class="n">100\.0%/);
  });
});

describe('every thermal report goes to the counter printer, not a browser window', () => {
  it('POS Summary / Detailed', () => {
    const src = read('pages/ReportsPage.tsx');
    const fn = src.slice(src.indexOf('const printPosReport'), src.indexOf('return (', src.indexOf('const printPosReport')));
    expect(fn).toContain('printThermalReport(');
    expect(fn).not.toMatch(/window\.open|w\.print\(\)|size:\$\{paperWidth\}/);
  });
  it('GRN (supplier receiving) slip', () => {
    const src = read('pages/ReceivingPage.tsx');
    expect(src).toContain('printThermalReport(');
    expect(src).not.toMatch(/window\.open\(''/);
  });
  it('supplier statement and accounts report print 80mm on the printer', () => {
    expect(read('pages/PartyMasterPage.tsx')).toMatch(/printThermalReport\(\{\s*title: `\$\{p\.type === 'supplier' \? 'Supplier' : 'Party'\} Statement`/);
    expect(read('pages/AccountsPage.tsx')).toMatch(/async function printAccounts80mm[\s\S]*printThermalReport\(/);
  });
  it('the report uses the shift report route: counter printer, report margins, content width, raw text when chosen', () => {
    const src = read('printing/thermalReport.ts');
    expect(src).toMatch(/resolvePrinterForRole\(pset, 'counter', getDeviceId\(\)\)/);
    expect(src).toMatch(/resolveSlipMargin\('report'/);
    expect(src).toMatch(/contentWidthMm: cfg\?\.printWidthMm/);
    expect(src).toMatch(/wantsRaw\(\{ printerConfig: cfg, settings \}\)/);
    expect(src).not.toMatch(/window\.open/);
  });
});

describe('printing a report', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });
  it('hands the report to printNode with the report margins and the printer content width', async () => {
    const printNode = vi.fn(async () => ({ success: true }));
    vi.doMock('@/printing', () => ({ printNode }));
    vi.doMock('@/lib/printerSettings', () => ({
      loadPrinterSettings: async () => ({}),
      resolvePrinterForRole: () => ({ connection: 'system', printerName: 'BIXOLON SRP-352', leftMarginMm: 3, rightMarginMm: 3, printWidthMm: 66 }),
    }));
    const { printThermalReport } = await import('@/printing/thermalReport');
    const res = await printThermalReport({ title: 'Sales Summary', blocks: [{ kind: 'row', label: 'Orders', value: '12' }] });
    expect(res.success).toBe(true);
    const [portal, opts] = printNode.mock.calls[0] as any;
    expect(opts).toMatchObject({ printerName: 'BIXOLON SRP-352', marginLeftMm: 3, marginRightMm: 3, contentWidthMm: 66, silent: true });
    expect(portal.textContent).toContain('Sales Summary');
    vi.doUnmock('@/printing');
    vi.doUnmock('@/lib/printerSettings');
  });
});
