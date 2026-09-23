// ============================================================
// DEALS & COMBOS — bulk Excel import (section 5) and the Excel guides (4, 6).
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDealRows, parseDealWorkbook, commitDeals, buildDealTemplate, issuesCsv, type DealImportContext } from '@/lib/dealImport';
import { DEAL_COLUMNS, dealImportGuide, menuImportGuide, excelGuidesMarkdown, MENU_ITEM_COLUMNS } from '@/lib/excelGuides';
import type { Deal, MenuItem } from '@/lib/types';

const item = (id: string, name: string, categoryId: string, price: number, extra: Partial<MenuItem> = {}): MenuItem =>
  ({ id, name, categoryId, pricingType: 'fixed', price, ratePerKg: 0, isActive: true, ...extra } as MenuItem);

const ctx = (over: Partial<DealImportContext> = {}): DealImportContext => ({
  categories: [{ id: 'c-b', name: 'Burgers', icon: '', sortOrder: 0 }, { id: 'c-p', name: 'Pizza', icon: '', sortOrder: 1 },
    { id: 'c-d', name: 'Drinks', icon: '', sortOrder: 2 }, { id: 'c-s', name: 'Sides', icon: '', sortOrder: 3 }, { id: 'c-k', name: 'Kids', icon: '', sortOrder: 4 }],
  menuItems: [
    item('zinger', 'Zinger Burger', 'c-b', 550),
    item('pizza', 'Chicken Pizza', 'c-p', 0, { pricingType: 'size', sizeVariants: [{ name: 'Small', price: 650 }, { name: 'Medium', price: 1100 }, { name: 'Large', price: 1450 }] }),
    item('pan', 'Pan Pizza', 'c-p', 0, { pricingType: 'inch', inchVariants: [{ name: '9 Inch', price: 900, inches: 9 }, { name: '12"', price: 1300, inches: 12 }] }),
    item('drink', '1.5 Liter Drink', 'c-d', 250),
    item('fries-s', 'Fries', 'c-s', 200),
    item('fries-k', 'Fries', 'c-k', 150),
    item('old', 'Old Burger', 'c-b', 300, { isActive: false }),
    item('gone', 'Deleted Burger', 'c-b', 300, { deleted: true }),
  ],
  existingDeals: [{ id: 'd-student', name: 'Student Deal', items: [], price: 699, isActive: true, createdAt: '2026-01-01' }],
  ...over,
});

const H = ['Deal Name', 'Deal Price', 'Item Name', 'Quantity', 'Variant', 'Category', 'Active'];
const parse = (rows: unknown[][], mode: 'skip' | 'update' = 'skip', c = ctx()) => parseDealRows([H, ...rows], c, mode);
const errorsOf = (r: ReturnType<typeof parse>) => [...r.rowIssues, ...r.deals.flatMap(d => d.errors)].map(e => e.message);

describe('a single deal', () => {
  it('groups rows into one deal with items, variants and price', () => {
    const r = parse([
      ['Family Deal 1', 'Rs 2,499', 'Zinger Burger', 2, '', 'Burgers', 'Yes'],
      ['Family Deal 1', 2499, 'chicken  pizza', '1', 'large', '', ''],
      ['Family Deal 1', '', '1.5 LITER DRINK', 1, '', '', ''],
    ]);
    expect(r.fileErrors).toEqual([]);
    expect(r.deals).toHaveLength(1);
    const d = r.deals[0];
    expect(d).toMatchObject({ name: 'Family Deal 1', price: 2499, isActive: true, status: 'new' });
    expect(d.items).toEqual([
      { menuItemId: 'zinger', quantity: 2 },
      { menuItemId: 'pizza', quantity: 1, variantName: 'Large', variantType: 'size' },
      { menuItemId: 'drink', quantity: 1 },
    ]);
    expect(r.counts).toMatchObject({ ready: 1, failed: 0 });
  });

  it('merged Deal Name cells (blank below) continue the deal above', () => {
    const r = parse([
      ['Combo A', 999, 'Zinger Burger', 1],
      ['', '', 'Fries', 1, '', 'Sides'],
    ]);
    expect(r.deals[0].items.map(i => i.menuItemId)).toEqual(['zinger', 'fries-s']);
  });

  it('inch variants match "12 Inch", 12" and 12', () => {
    for (const v of ['12 Inch', '12"', '12', '12in']) {
      const r = parse([['Pan Deal', 1500, 'Pan Pizza', 1, v]]);
      expect(r.deals[0].items[0], v).toEqual({ menuItemId: 'pan', quantity: 1, variantName: '12"', variantType: 'inch' });
    }
  });
});

describe('multiple deals', () => {
  it('imports several deals from one sheet, in file order', () => {
    const r = parse([
      ['Deal A', 1000, 'Zinger Burger', 1], ['Deal A', 1000, 'Fries', 1, '', 'Sides'],
      ['Deal B', 1200, 'Chicken Pizza', 1, 'Medium'],
      ['Deal C', 400, '1.5 Liter Drink', 2],
    ]);
    expect(r.deals.map(d => [d.name, d.items.length, d.status])).toEqual([['Deal A', 2, 'new'], ['Deal B', 1, 'new'], ['Deal C', 1, 'new']]);
  });
  it('a title above the header and blank rows are fine; row numbers are Excel\'s', () => {
    const r = parseDealRows([['My deals for October'], [], H, ['Deal A', 1000, 'Nope Burger', 1]], ctx());
    expect(r.headerRow).toBe(3);
    expect(r.deals[0].errors[0].row).toBe(4);
  });
});

describe('validation', () => {
  it('wrong structure: missing required columns, or no header at all', () => {
    const a = parseDealRows([['Deal Name', 'Item Name'], ['A', 'Zinger Burger']], ctx());
    expect(a.fileErrors[0]).toMatch(/"Deal Price", "Quantity" missing/);
    const b = parseDealRows([['Name', 'Price'], ['x', 1]], ctx());
    expect(b.fileErrors[0]).toMatch(/no header row with "Deal Name" and "Item Name"/);
  });
  it('missing deal name', () => {
    const r = parse([['', 500, 'Zinger Burger', 1]]);
    expect(r.rowIssues[0]).toMatchObject({ row: 2, message: expect.stringMatching(/Deal Name is empty/) });
  });
  it('invalid, missing and conflicting prices', () => {
    expect(errorsOf(parse([['A', 'abc', 'Zinger Burger', 1]]))[0]).toMatch(/Invalid deal price "abc"/);
    expect(errorsOf(parse([['A', 0, 'Zinger Burger', 1]]))[0]).toMatch(/Invalid deal price/);
    expect(errorsOf(parse([['A', '', 'Zinger Burger', 1]]))[0]).toMatch(/Deal Price is missing/);
    expect(errorsOf(parse([['A', 500, 'Zinger Burger', 1], ['A', 600, '1.5 Liter Drink', 1]]))[0]).toMatch(/Different prices/);
  });
  it('missing item and item not on the menu (with a suggestion)', () => {
    expect(errorsOf(parse([['A', 500, '', 1]]))[0]).toMatch(/Item Name is empty/);
    expect(errorsOf(parse([['A', 500, 'Zinger', 1]]))[0]).toMatch(/"Zinger" is not on the menu\. Did you mean "Zinger Burger"/);
    expect(errorsOf(parse([['A', 500, 'Deleted Burger', 1]]))[0]).toMatch(/not on the menu/);
  });
  it('invalid quantities', () => {
    for (const q of ['', 0, -1, 1.5, 'two', 1000]) expect(errorsOf(parse([['A', 500, 'Zinger Burger', q]]))[0], String(q)).toMatch(/quantity/i);
  });
  it('invalid or missing variant', () => {
    expect(errorsOf(parse([['A', 500, 'Chicken Pizza', 1, 'XL']]))[0]).toMatch(/Invalid variant "XL" for "Chicken Pizza"\. Available: Small, Medium, Large/);
    expect(errorsOf(parse([['A', 500, 'Chicken Pizza', 1]]))[0]).toMatch(/has sizes\/inches — say which one/);
    expect(errorsOf(parse([['A', 500, 'Zinger Burger', 1, 'Large']]))[0]).toMatch(/has no sizes\/inches/);
  });
  it('same name in two categories needs the Category column', () => {
    expect(errorsOf(parse([['A', 500, 'Fries', 1]]))[0]).toMatch(/matches 2 menu items \(categories: Sides, Kids\)/);
    expect(parse([['A', 500, 'Fries', 1, '', 'Kids']]).deals[0].items[0].menuItemId).toBe('fries-k');
  });
  it('a deal with one bad row is not imported at all', () => {
    const r = parse([['A', 500, 'Zinger Burger', 1], ['A', 500, 'Nope', 1]]);
    expect(r.deals[0].status).toBe('invalid');
    expect(r.counts).toMatchObject({ ready: 0, failed: 1 });
  });
  it('warnings do not block: inactive item, repeated item, price above separate total, odd Active value', () => {
    const r = parse([['A', 5000, 'Old Burger', 1, '', '', 'maybe'], ['A', '', 'Old Burger', 2]]);
    const d = r.deals[0];
    expect(d.status).toBe('new');
    expect(d.items).toEqual([{ menuItemId: 'old', quantity: 3 }]);
    const w = d.warnings.map(x => x.message).join(' | ');
    expect(w).toMatch(/inactive/);
    expect(w).toMatch(/listed twice; quantities added \(now 3\)/);
    expect(w).toMatch(/higher than the items bought separately \(900\)/);
    expect(w).toMatch(/Active "maybe" not understood/);
  });
  it('Active = No imports the deal hidden', () => {
    expect(parse([['A', 500, 'Zinger Burger', 1, '', '', 'No']]).deals[0].isActive).toBe(false);
  });
});

describe('duplicates', () => {
  it('an existing deal is skipped by default, updated only when asked', () => {
    const skip = parse([['student deal', 699, 'Zinger Burger', 1]]);
    expect(skip.deals[0].status).toBe('duplicate');
    expect(skip.deals[0].errors[0].message).toMatch(/already exists — skipped/);
    const upd = parse([['Student Deal', 749, 'Zinger Burger', 1]], 'update');
    expect(upd.deals[0]).toMatchObject({ status: 'update', existingId: 'd-student' });
  });
  it('two deal codes with the same name in one file', () => {
    const r = parseDealRows([[...H, 'Deal Code'], ['Box', 500, 'Zinger Burger', 1, '', '', '', 'B1'], ['Box', 600, '1.5 Liter Drink', 1, '', '', '', 'B2']], ctx());
    expect(r.deals[1].errors[0].message).toMatch(/Duplicate deal name in this file/);
  });
});

describe('import and result summary', () => {
  it('saves valid deals (into the menu too), skips failed ones, and counts', () => {
    const r = parse([
      ['Deal A', 1000, 'Zinger Burger', 1],
      ['Deal B', 1000, 'Nope', 1],
      ['Student Deal', 749, 'Zinger Burger', 2],
      ['Deal C', 5000, 'Old Burger', 1],
    ], 'update');
    const saveDeal = vi.fn(); const syncDealToMenu = vi.fn();
    let n = 0;
    const sum = commitDeals(r, { saveDeal, syncDealToMenu, genId: () => `id${++n}`, existingDeals: ctx().existingDeals, now: () => 'NOW' });
    expect(sum).toMatchObject({ successful: 3, created: 2, updated: 1, failed: 1 });
    expect(sum.warnings).toBeGreaterThanOrEqual(2);
    expect(saveDeal).toHaveBeenCalledTimes(3);
    expect(syncDealToMenu).toHaveBeenCalledTimes(3);
    const updated = saveDeal.mock.calls.map(c => c[0] as Deal).find(d => d.id === 'd-student')!;
    expect(updated).toMatchObject({ price: 749, createdAt: '2026-01-01', items: [{ menuItemId: 'zinger', quantity: 2 }] });
    expect(sum.issues.find(i => i.level === 'error')).toMatchObject({ row: 3, deal: 'Deal B' });
    expect(issuesCsv(sum.issues).split('\r\n')[0]).toBe('Row,Deal,Level,Message');
  });
  it('a failing save is reported, the rest still import', () => {
    const r = parse([['A', 500, 'Zinger Burger', 1], ['B', 500, '1.5 Liter Drink', 1]]);
    const saveDeal = vi.fn((d: Deal) => { if (d.name === 'A') throw new Error('disk full'); });
    const sum = commitDeals(r, { saveDeal, syncDealToMenu: vi.fn(), genId: () => Math.random().toString(36), existingDeals: [] });
    expect(sum).toMatchObject({ successful: 1, failed: 1 });
    expect(sum.issues.find(i => i.level === 'error')!.message).toMatch(/disk full/);
  });
});

describe('real .xlsx files', () => {
  it('the downloadable template imports cleanly against the shop\'s own menu', () => {
    const c = ctx();
    const wb = buildDealTemplate(c.menuItems, c.categories);
    expect(wb.SheetNames).toEqual(['Deals', 'Menu Items (reference)', 'Instructions']);
    const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const r = parseDealWorkbook(back, { ...c, existingDeals: [] });
    expect(r.fileErrors).toEqual([]);
    expect(r.deals).toHaveLength(1);
    expect(r.deals[0].status).toBe('new');
    const ref = XLSX.utils.sheet_to_json(back.Sheets['Menu Items (reference)'], { header: 1 }) as string[][];
    expect(ref.some(row => row[0] === 'Chicken Pizza' && /Small, Medium, Large/.test(row[2]))).toBe(true);
    expect(ref.some(row => row[0] === 'Deleted Burger')).toBe(false);
  });
  it('picks the sheet named Deals and reports Excel row numbers when the data does not start at A1', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['notes']]), 'Notes');
    const ws = XLSX.utils.aoa_to_sheet([H, ['A', 500, 'Nope', 1]], { origin: 'B3' } as any);
    XLSX.utils.book_append_sheet(wb, ws, 'Deals');
    const back = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const r = parseDealWorkbook(back, ctx());
    expect(r.sheetName).toBe('Deals');
    expect(r.headerRow).toBe(3);
    expect(r.deals[0].errors[0].row).toBe(4);
  });
});

describe('Excel guides (copyable, one source with the parser)', () => {
  it('the deal guide lists every column the parser reads, with required/optional', () => {
    const g = dealImportGuide();
    for (const c of DEAL_COLUMNS) expect(g).toContain(`| ${c.header} | ${c.required ? 'Yes' : 'No'} |`);
    expect(g).toMatch(/Family Deal 1/);
    expect(g).toMatch(/One row = one item inside a deal/);
  });
  it('the menu guide documents the variant columns and says deals go elsewhere', () => {
    const g = menuImportGuide();
    for (const c of MENU_ITEM_COLUMNS) expect(g).toContain(`| ${c.header} |`);
    expect(g).toMatch(/Deals do NOT go in the menu file/);
  });
  it('docs/EXCEL_IMPORT_GUIDE.md is the same text as the app shows', () => {
    const md = readFileSync(resolve(__dirname, '../../docs/EXCEL_IMPORT_GUIDE.md'), 'utf8');
    expect(md).toBe(excelGuidesMarkdown());
  });
});
