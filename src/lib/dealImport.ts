// ============================================================
// DEALS & COMBOS — Excel bulk import (parse, validate, preview, commit).
//
// Upload → Validate → Preview → Confirm → Import → Result. This module is the
// validate/commit half and holds no UI, so every rule is tested directly.
//
// Rules that matter to a shop:
//   • one row per item; rows are grouped into deals by Deal Name (or Code);
//   • every item must already be on the menu, and an item with sizes/inches
//     must say which one — the same rule as creating a deal by hand;
//   • a deal with any error is not imported at all: no half deals;
//   • an existing deal is never overwritten unless the shop chose "Update".
// Nothing here deletes or rewrites other data.
// ============================================================
import * as XLSX from 'xlsx';
import type { Category, Deal, DealItem, MenuItem } from './types';
import { DEAL_COLUMNS, DEAL_EXAMPLE_ROWS, DEAL_RULES, type DealField } from './excelGuides';
import { DEALS_CATEGORY_ID } from './deals';

export type DuplicateMode = 'skip' | 'update';

export interface DealIssue {
  level: 'error' | 'warning';
  /** Excel row number (1-based, as Excel shows it). */
  row?: number;
  deal?: string;
  message: string;
}

export interface DealLine {
  row: number;
  itemName: string;
  menuItemId?: string;
  menuItemName?: string;
  variantName?: string;
  variantType?: 'size' | 'inch';
  quantity: number;
  unitPrice?: number;
}

export interface ParsedDeal {
  key: string;
  name: string;
  price: number;
  isActive: boolean;
  rows: number[];
  lines: DealLine[];
  /** Ready-to-save items (only meaningful when status is new/update). */
  items: DealItem[];
  errors: DealIssue[];
  warnings: DealIssue[];
  existingId?: string;
  status: 'new' | 'update' | 'duplicate' | 'invalid';
}

export interface DealParseResult {
  sheetName: string;
  headerRow: number;
  /** Which file header fed which field. */
  columns: Partial<Record<DealField, string>>;
  deals: ParsedDeal[];
  /** Problems with the file itself (wrong structure) — nothing importable. */
  fileErrors: string[];
  /** Row problems that belong to no deal (e.g. a row without a deal name). */
  rowIssues: DealIssue[];
  counts: { ready: number; update: number; failed: number; warnings: number; rows: number };
}

export interface DealImportContext {
  menuItems: MenuItem[];
  categories: Category[];
  existingDeals: Deal[];
}

// ---------- helpers ----------
const headerKey = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Name matching: case, spacing and punctuation do not matter. */
export const nameKey = (s: unknown) => String(s ?? '').normalize('NFKC').toLowerCase()
  .replace(/[\s_\-]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
/** Variant matching: "12 Inch", '12"', "12in" and "12" are the same; "Large" = "large". */
const variantKey = (s: unknown) => String(s ?? '').toLowerCase()
  .replace(/(\d)\s*(inches|inch|in)\b/g, '$1').replace(/[^a-z0-9.]/g, '');
const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

function parsePrice(v: unknown): number | 'invalid' | undefined {
  const t = cellText(v);
  if (!t) return undefined;
  const n = typeof v === 'number' ? v : Number(t.replace(/(rs\.?|pkr|\/-)/gi, '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 'invalid';
}
function parseQty(v: unknown): number | 'invalid' | undefined {
  const t = cellText(v);
  if (!t) return undefined;
  const n = typeof v === 'number' ? v : Number(t.replace(/[,\s]/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 'invalid';
}
function parseActive(v: unknown): boolean | 'unknown' {
  const t = cellText(v).toLowerCase();
  if (!t || ['yes', 'y', 'true', '1', 'active', 'on', 'show'].includes(t)) return true;
  if (['no', 'n', 'false', '0', 'inactive', 'off', 'hide', 'hidden'].includes(t)) return false;
  return 'unknown';
}

const FIELD_BY_HEADER: Map<string, DealField> = (() => {
  const m = new Map<string, DealField>();
  for (const c of DEAL_COLUMNS) for (const h of [c.header, ...c.aliases]) m.set(headerKey(h), c.field);
  return m;
})();

/** Find the header row (a title above it is fine) and map columns to fields. */
function findHeader(aoa: unknown[][]): { row: number; map: Map<number, DealField>; names: Partial<Record<DealField, string>> } | null {
  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const map = new Map<number, DealField>();
    const names: Partial<Record<DealField, string>> = {};
    (aoa[r] || []).forEach((cell, i) => {
      const f = FIELD_BY_HEADER.get(headerKey(cell));
      if (f && !(f in names)) { map.set(i, f); names[f] = cellText(cell); }
    });
    if (names.dealName && names.itemName) return { row: r, map, names };
  }
  return null;
}

// ---------- the parser ----------
/**
 * @param rowOffset  index of the sheet's first used row (0 when it starts at
 *                   A1), so every row number reported is the one Excel shows.
 */
export function parseDealRows(aoa: unknown[][], ctx: DealImportContext, mode: DuplicateMode = 'skip', sheetName = 'Sheet1', rowOffset = 0): DealParseResult {
  const out: DealParseResult = { sheetName, headerRow: 0, columns: {}, deals: [], fileErrors: [], rowIssues: [], counts: { ready: 0, update: 0, failed: 0, warnings: 0, rows: 0 } };
  const head = findHeader(aoa);
  if (!head) {
    out.fileErrors.push('Wrong file structure: no header row with "Deal Name" and "Item Name" was found in the first 15 rows. Download the template to see the exact layout.');
    return out;
  }
  out.headerRow = head.row + 1 + rowOffset;
  out.columns = head.names;
  const missing = DEAL_COLUMNS.filter(c => c.required && !head.names[c.field]).map(c => `"${c.header}"`);
  if (missing.length) {
    out.fileErrors.push(`Wrong file structure: required column${missing.length > 1 ? 's' : ''} ${missing.join(', ')} missing. Found: ${Object.values(head.names).map(n => `"${n}"`).join(', ') || 'none'}.`);
    return out;
  }

  // ----- the menu, indexed -----
  const catName = new Map(ctx.categories.map(c => [c.id, c.name]));
  const pool = ctx.menuItems.filter(i => !i.deleted && i.categoryId !== DEALS_CATEGORY_ID && !ctx.existingDeals.some(d => d.id === i.id));
  const byName = new Map<string, MenuItem[]>();
  for (const i of pool) { const k = nameKey(i.name); byName.set(k, [...(byName.get(k) || []), i]); }
  const byCode = new Map<string, MenuItem>();
  for (const i of pool) {
    byCode.set(i.id.toLowerCase(), i);
    for (const v of [...(i.sizeVariants || []), ...(i.inchVariants || [])]) if (v.sku) byCode.set(String(v.sku).toLowerCase(), i);
  }
  const existingByName = new Map(ctx.existingDeals.map(d => [nameKey(d.name), d]));

  // ----- rows → groups -----
  type Group = { key: string; name: string; code?: string; rows: Array<{ row: number; v: Partial<Record<DealField, unknown>> }> };
  const groups = new Map<string, Group>();
  let carry: Group | null = null;
  for (let r = head.row + 1; r < aoa.length; r++) {
    const cells = aoa[r] || [];
    const v: Partial<Record<DealField, unknown>> = {};
    head.map.forEach((f, i) => { v[f] = cells[i]; });
    const excelRow = r + 1 + rowOffset;
    if (Object.values(v).every(x => !cellText(x))) { carry = null; continue; } // blank row ends a merged block
    out.counts.rows++;
    const name = cellText(v.dealName);
    const code = cellText(v.dealCode);
    let g: Group | undefined;
    if (!name && !code) {
      if (!carry) { out.rowIssues.push({ level: 'error', row: excelRow, message: 'Deal Name is empty and there is no deal above it to continue.' }); continue; }
      g = carry;
      if (!cellText(v.itemName)) { out.rowIssues.push({ level: 'error', row: excelRow, message: 'Row has no Deal Name and no Item Name.' }); continue; }
    } else {
      const key = code ? `code:${code.toLowerCase()}` : `name:${nameKey(name)}`;
      g = groups.get(key);
      if (!g) { g = { key, name: name || code, code: code || undefined, rows: [] }; groups.set(key, g); }
      else if (!g.name && name) g.name = name;
    }
    g.rows.push({ row: excelRow, v });
    carry = g;
  }
  if (!groups.size && !out.rowIssues.length) out.fileErrors.push('The file has a header row but no deal rows under it.');

  // ----- validate each deal -----
  const seenNames = new Map<string, string>();
  for (const g of groups.values()) {
    const deal: ParsedDeal = { key: g.key, name: g.name, price: 0, isActive: true, rows: g.rows.map(x => x.row), lines: [], items: [], errors: [], warnings: [], status: 'new' };
    const err = (message: string, row?: number) => deal.errors.push({ level: 'error', row, deal: g.name, message });
    const warn = (message: string, row?: number) => deal.warnings.push({ level: 'warning', row, deal: g.name, message });

    if (!g.name.trim()) err('Deal Name is empty.', deal.rows[0]);

    // price: needed once, identical when repeated
    const prices = new Map<number, number[]>();
    for (const { row, v } of g.rows) {
      const p = parsePrice(v.dealPrice);
      if (p === 'invalid') err(`Invalid deal price "${cellText(v.dealPrice)}" — use a number above 0.`, row);
      else if (p !== undefined) prices.set(p, [...(prices.get(p) || []), row]);
    }
    if (prices.size === 0 && !deal.errors.some(e => /price/.test(e.message))) err('Deal Price is missing — put the price on at least one row of the deal.', deal.rows[0]);
    else if (prices.size > 1) err(`Different prices for the same deal: ${[...prices.entries()].map(([p, rows]) => `${p} (row ${rows.join(', ')})`).join(' vs ')}.`);
    else if (prices.size === 1) deal.price = [...prices.keys()][0];

    // active: first explicit value wins
    for (const { row, v } of g.rows) {
      const a = parseActive(v.active);
      if (a === 'unknown') warn(`Active "${cellText(v.active)}" not understood — treated as Yes.`, row);
      else if (cellText(v.active)) { deal.isActive = a; break; }
    }

    // items
    for (const { row, v } of g.rows) {
      const itemName = cellText(v.itemName);
      const code = cellText(v.itemCode);
      const q = parseQty(v.quantity);
      if (!itemName && !code) { err('Item Name is empty.', row); continue; }
      if (q === undefined) err(`Quantity is empty for "${itemName || code}".`, row);
      else if (q === 'invalid') err(`Invalid quantity "${cellText(v.quantity)}" for "${itemName || code}" — use a whole number from 1 to 999.`, row);

      // find the menu item
      let item: MenuItem | undefined;
      if (code) {
        item = byCode.get(code.toLowerCase());
        if (!item) { err(`Item Code "${code}" is not on the menu.`, row); continue; }
      } else {
        let candidates = byName.get(nameKey(itemName)) || [];
        const cat = cellText(v.category);
        if (candidates.length > 1 && cat) {
          const inCat = candidates.filter(i => nameKey(catName.get(i.categoryId)) === nameKey(cat));
          if (inCat.length) candidates = inCat;
        }
        if (!candidates.length) {
          const k = nameKey(itemName);
          const near = pool.filter(i => { const n = nameKey(i.name); return k.length >= 3 && (n.includes(k) || k.includes(n)); }).slice(0, 3).map(i => `"${i.name}"`);
          err(`"${itemName}" is not on the menu.${near.length ? ` Did you mean ${near.join(' or ')}?` : ' Add it to the menu first, or fix the spelling.'}`, row);
          continue;
        }
        if (candidates.length > 1) {
          err(`"${itemName}" matches ${candidates.length} menu items (categories: ${candidates.map(i => catName.get(i.categoryId) || '?').join(', ')}). Add the Category column to choose one.`, row);
          continue;
        }
        item = candidates[0];
        if (cat && nameKey(catName.get(item.categoryId)) !== nameKey(cat)) warn(`"${item.name}" is in category "${catName.get(item.categoryId) || '—'}", not "${cat}" — used anyway.`, row);
      }
      if (!item.isActive) warn(`"${item.name}" is inactive on the menu.`, row);

      // variant
      const sizes = (item.sizeVariants || []).filter(x => x?.name);
      const inches = (item.inchVariants || []).filter(x => x?.name);
      const vText = cellText(v.variant);
      let variantName: string | undefined;
      let variantType: 'size' | 'inch' | undefined;
      let unitPrice: number | undefined = item.price;
      if (vText) {
        const vk = variantKey(vText);
        const s = sizes.find(x => variantKey(x.name) === vk);
        const i = inches.find(x => variantKey(x.name) === vk || (x.inches !== undefined && String(x.inches) === vk));
        if (s) { variantName = s.name; variantType = 'size'; unitPrice = s.price; }
        else if (i) { variantName = i.name; variantType = 'inch'; unitPrice = i.price; }
        else if (!sizes.length && !inches.length) { err(`"${item.name}" has no sizes/inches on the menu, but Variant "${vText}" was given. Leave Variant empty.`, row); continue; }
        else { err(`Invalid variant "${vText}" for "${item.name}". Available: ${[...sizes, ...inches].map(x => x.name).join(', ')}.`, row); continue; }
      } else if (sizes.length || inches.length) {
        err(`"${item.name}" has sizes/inches — say which one in the Variant column (${[...sizes, ...inches].map(x => x.name).join(', ')}).`, row);
        continue;
      }

      if (typeof q !== 'number') continue;
      const same = deal.lines.find(l => l.menuItemId === item!.id && (l.variantName || '') === (variantName || ''));
      if (same) {
        same.quantity += q;
        warn(`"${item.name}${variantName ? ` — ${variantName}` : ''}" is listed twice; quantities added (now ${same.quantity}).`, row);
        continue;
      }
      deal.lines.push({ row, itemName, menuItemId: item.id, menuItemName: item.name, variantName, variantType, quantity: q, unitPrice });
    }
    if (!deal.lines.length && !deal.errors.length) err('The deal has no items.');

    // separately-priced sanity check (a warning, never a block)
    const separate = deal.lines.reduce((a, l) => a + (Number(l.unitPrice) || 0) * l.quantity, 0);
    if (deal.price && separate > 0 && deal.price > separate) warn(`Deal price ${deal.price} is higher than the items bought separately (${separate}).`);

    // duplicates: within the file, then against existing deals
    const nk = nameKey(g.name);
    if (nk && seenNames.has(nk)) err(`Duplicate deal name in this file (same as deal code ${seenNames.get(nk)}).`, deal.rows[0]);
    else if (nk) seenNames.set(nk, g.code || g.name);

    const existing = nk ? existingByName.get(nk) : undefined;
    if (deal.errors.length) deal.status = 'invalid';
    else if (existing && mode === 'skip') {
      deal.status = 'duplicate';
      deal.errors.push({ level: 'error', deal: g.name, row: deal.rows[0], message: `A deal named "${existing.name}" already exists — skipped. Choose "Update existing deals" to replace it.` });
    } else if (existing) { deal.status = 'update'; deal.existingId = existing.id; }

    deal.items = deal.lines.map(l => ({ menuItemId: l.menuItemId!, quantity: l.quantity, ...(l.variantName ? { variantName: l.variantName, variantType: l.variantType } : {}) }));
    out.deals.push(deal);
  }

  out.counts.ready = out.deals.filter(d => d.status === 'new').length;
  out.counts.update = out.deals.filter(d => d.status === 'update').length;
  out.counts.failed = out.deals.filter(d => d.status === 'invalid' || d.status === 'duplicate').length;
  out.counts.warnings = out.deals.reduce((a, d) => a + d.warnings.length, 0);
  return out;
}

/** Read a workbook: the sheet named Deals/Combos, else the first one. */
export function parseDealWorkbook(wb: XLSX.WorkBook, ctx: DealImportContext, mode: DuplicateMode = 'skip'): DealParseResult {
  const name = wb.SheetNames.find(n => /deal|combo/i.test(n)) || wb.SheetNames[0];
  if (!name) {
    return { sheetName: '', headerRow: 0, columns: {}, deals: [], fileErrors: ['The file has no sheets.'], rowIssues: [], counts: { ready: 0, update: 0, failed: 0, warnings: 0, rows: 0 } };
  }
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true, raw: true }) as unknown[][];
  const offset = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
  return parseDealRows(aoa, ctx, mode, name, offset);
}

// ---------- commit ----------
export interface DealImportSummary {
  successful: number;
  created: number;
  updated: number;
  failed: number;
  warnings: number;
  issues: DealIssue[];
}

export function commitDeals(
  parsed: DealParseResult,
  io: { saveDeal: (d: Deal) => void; syncDealToMenu: (d: Deal) => void; genId: () => string; existingDeals: Deal[]; now?: () => string },
): DealImportSummary {
  const sum: DealImportSummary = { successful: 0, created: 0, updated: 0, failed: 0, warnings: 0, issues: [...parsed.rowIssues] };
  const now = io.now || (() => new Date().toISOString());
  for (const d of parsed.deals) {
    sum.warnings += d.warnings.length;
    sum.issues.push(...d.warnings);
    if (d.status !== 'new' && d.status !== 'update') { sum.failed++; sum.issues.push(...d.errors); continue; }
    const prev = d.existingId ? io.existingDeals.find(x => x.id === d.existingId) : undefined;
    const deal: Deal = {
      id: prev?.id || io.genId(),
      name: d.name.trim(),
      ...(prev?.image ? { image: prev.image } : {}),
      items: d.items,
      price: d.price,
      isActive: d.isActive,
      createdAt: prev?.createdAt || now(),
    };
    try {
      io.saveDeal(deal);
      io.syncDealToMenu(deal);
      sum.successful++;
      if (prev) sum.updated++; else sum.created++;
    } catch (e: any) {
      sum.failed++;
      sum.issues.push({ level: 'error', deal: d.name, row: d.rows[0], message: `Could not be saved: ${e?.message || e}` });
    }
  }
  sum.issues.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return sum;
}

/** The result as CSV, for the shop to fix the file. */
export function issuesCsv(issues: DealIssue[]): string {
  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return ['Row,Deal,Level,Message', ...issues.map(i => [i.row ?? '', q(i.deal), i.level, q(i.message)].join(','))].join('\r\n');
}

// ---------- template ----------
/**
 * A ready template: the Deals sheet (examples built from THIS shop's menu
 * where possible), the shop's menu as a reference (exact names, categories,
 * variants), and the instructions.
 */
export function buildDealTemplate(menuItems: MenuItem[], categories: Category[]): XLSX.WorkBook {
  const catName = new Map(categories.map(c => [c.id, c.name]));
  const pool = menuItems.filter(i => !i.deleted && i.isActive && i.categoryId !== DEALS_CATEGORY_ID);
  const withVariant = pool.find(i => (i.sizeVariants?.length || 0) + (i.inchVariants?.length || 0) > 0);
  const plain = pool.filter(i => !(i.sizeVariants?.length || i.inchVariants?.length)).slice(0, 2);
  const head = DEAL_EXAMPLE_ROWS[0];
  let rows: string[][] = DEAL_EXAMPLE_ROWS.slice(1);
  if (plain.length >= 1) {
    const vName = withVariant ? (withVariant.sizeVariants?.[0]?.name || withVariant.inchVariants?.[0]?.name || '') : '';
    const line = (i: MenuItem, qty: string, variant = '') => ['Family Deal 1', '2499', i.name, qty, variant, catName.get(i.categoryId) || '', 'Yes'];
    rows = [
      line(plain[0], '2'),
      ...(withVariant ? [line(withVariant, '1', vName)] : []),
      ...(plain[1] ? [line(plain[1], '1')] : []),
    ];
  }
  const wb = XLSX.utils.book_new();
  const deals = XLSX.utils.aoa_to_sheet([head, ...rows]);
  deals['!cols'] = head.map(h => ({ wch: Math.max(12, h.length + 4) }));
  XLSX.utils.book_append_sheet(wb, deals, 'Deals');
  const ref = [['Item Name', 'Category', 'Variants (use one in the Variant column)', 'Price'],
    ...pool.map(i => [i.name, catName.get(i.categoryId) || '', [...(i.sizeVariants || []), ...(i.inchVariants || [])].map(v => v.name).join(', '), String(i.price || '')])];
  const refSheet = XLSX.utils.aoa_to_sheet(ref);
  refSheet['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 36 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Menu Items (reference)');
  const help = [['DT POS — Deals & Combos import'], [''], ['Column', 'Required', 'Type', 'What to put'],
    ...DEAL_COLUMNS.map(c => [c.header, c.required ? 'Yes' : 'No', c.type, c.description]), [''], ['Rules'], ...DEAL_RULES.map(r => [r])];
  const helpSheet = XLSX.utils.aoa_to_sheet(help);
  helpSheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, helpSheet, 'Instructions');
  return wb;
}
