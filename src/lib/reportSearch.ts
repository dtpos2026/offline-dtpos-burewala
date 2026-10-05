// ============================================================
// REPORT SEARCH — find any bill or item, and total it by category and product.
//
// Two jobs, both pure (no storage, no screen):
//
//   1. filterOrders(): narrow a list of bills with one search box (bill number,
//      customer, phone, product, category, cashier, table, payment …) and/or the
//      specific filters — product, category, customer, payment method, order type,
//      cashier, quantity and sales amount.
//
//   2. itemSales(): total what was sold per product and per category: quantity, sales,
//      discounts, service charge and the net amount.
//
// A bill carries its discount and service charge as ONE figure for the whole bill, not
// per item. To total them by product they are shared across the bill's items in proportion
// to what each item cost — the same way a bill splits when it is divided between guests.
// The shares always add back up to the bill's own figures, to the paisa, so the report
// totals equal the money in the till.
// ============================================================
import type { CartItem, Order } from './types';

export type PaymentFilter = 'all' | 'cash' | 'card' | 'online' | 'credit';
export type OrderTypeFilter = 'all' | 'dining' | 'takeaway' | 'delivery';

export interface ReportFilters {
  /** One box for everything: matches bill number, customer, phone, product, category, cashier, table, payment. */
  text?: string;
  billNo?: string;
  product?: string;
  /** Category ids; empty / undefined = every category. */
  categoryIds?: string[];
  customer?: string;
  payment?: PaymentFilter;
  orderType?: OrderTypeFilter;
  cashierId?: string;
  /** Total quantity of the items on the bill that match the product / category filter (or all items when none is set). */
  minQty?: number;
  maxQty?: number;
  /** The bill's grand total. */
  minAmount?: number;
  maxAmount?: number;
}

export interface CatalogItem { id: string; name?: string; categoryId?: string }
export interface CatalogCategory { id: string; name: string }

export interface Catalog {
  items: CatalogItem[];
  categories: CatalogCategory[];
}

export const UNCATEGORISED_ID = '__none__';
export const UNCATEGORISED_NAME = 'Uncategorised';

const norm = (s: unknown) => String(s ?? '').toLowerCase().trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A lookup from menu item id to its category, built once per report. */
export function makeCatalog(items: CatalogItem[], categories: CatalogCategory[]): Catalog & {
  categoryOf: (line: Pick<CartItem, 'menuItemId'>) => { id: string; name: string };
} {
  const itemById = new Map(items.map(i => [i.id, i]));
  const catById = new Map(categories.map(c => [c.id, c]));
  return {
    items,
    categories,
    categoryOf: line => {
      const cid = itemById.get(line.menuItemId)?.categoryId;
      const cat = cid ? catById.get(cid) : undefined;
      return cat ? { id: cat.id, name: cat.name } : { id: UNCATEGORISED_ID, name: UNCATEGORISED_NAME };
    },
  };
}
export type ReportCatalog = ReturnType<typeof makeCatalog>;

const lineName = (l: CartItem) => `${l.name}${l.variantName ? ` ${l.variantName}` : ''}`;
const cashierIdOf = (o: Order) => (o as any).cashierId || (o as any).createdBy || (o as any).createdByUid || '';

/** The lines of a bill that the product / category filters point at (all lines when neither is set). */
export function matchingLines(order: Order, f: ReportFilters, catalog: ReportCatalog): CartItem[] {
  const product = norm(f.product);
  const cats = f.categoryIds && f.categoryIds.length ? new Set(f.categoryIds) : null;
  const candidates = (order.items || []).filter(l => {
    if (product && !norm(lineName(l)).includes(product)) return false;
    if (cats && !cats.has(catalog.categoryOf(l).id)) return false;
    return true;
  });
  // The search box also points at items: typing "chicken" totals the chicken lines. When the words
  // matched something else on the bill (its number, the customer, the payment) every line counts.
  const words = norm(f.text).split(/\s+/).filter(Boolean);
  if (words.length) {
    const hits = candidates.filter(l => {
      const hay = norm(`${lineName(l)} ${catalog.categoryOf(l).name}`);
      return words.some(w => hay.includes(w));
    });
    if (hits.length) return hits;
  }
  return candidates;
}

/** True when any search field is in use. */
export function hasActiveFilters(f: ReportFilters): boolean {
  return !!(
    norm(f.text) || norm(f.billNo) || norm(f.product) || norm(f.customer)
    || (f.categoryIds && f.categoryIds.length)
    || (f.payment && f.payment !== 'all') || (f.orderType && f.orderType !== 'all') || f.cashierId
    || num(f.minQty) > 0 || num(f.maxQty) > 0 || num(f.minAmount) > 0 || num(f.maxAmount) > 0
  );
}

function matchesText(order: Order, text: string, catalog: ReportCatalog): boolean {
  const q = norm(text);
  if (!q) return true;
  // Several words must ALL be found, anywhere on the bill ("chicken cash dining").
  const hay = [
    order.orderNumber, order.customer?.name, order.customer?.phone, order.tableName, (order as any).tableLabel,
    order.cashierName, order.waiterName, order.riderName, order.paymentMethod, order.paymentAccountName,
    order.orderType, order.orderType === 'dining' ? 'dine-in dine in' : '', order.status, order.notes,
    ...(order.items || []).map(l => `${lineName(l)} ${catalog.categoryOf(l).name}`),
  ].map(norm).join(' | ');
  return q.split(/\s+/).every(w => hay.includes(w));
}

/** Narrows a list of bills. Every filter that is set must hold (they add up: AND). */
export function filterOrders(orders: Order[], f: ReportFilters, catalog: ReportCatalog): Order[] {
  if (!hasActiveFilters(f)) return orders;
  const billNo = norm(f.billNo).replace(/^#/, '');
  const customer = norm(f.customer);
  const minQty = num(f.minQty), maxQty = num(f.maxQty);
  const minAmt = num(f.minAmount), maxAmt = num(f.maxAmount);
  const lineFilter = !!(norm(f.product) || (f.categoryIds && f.categoryIds.length));

  return orders.filter(o => {
    if (billNo && !String(o.orderNumber ?? '').toLowerCase().includes(billNo)) return false;
    if (customer && !norm(`${o.customer?.name || ''} ${o.customer?.phone || ''}`).includes(customer)) return false;
    if (f.payment && f.payment !== 'all' && (o.paymentMethod || 'cash') !== f.payment) return false;
    if (f.orderType && f.orderType !== 'all' && o.orderType !== f.orderType) return false;
    if (f.cashierId && cashierIdOf(o) !== f.cashierId) return false;
    if (minAmt > 0 && num(o.grandTotal) < minAmt) return false;
    if (maxAmt > 0 && num(o.grandTotal) > maxAmt) return false;
    if (!matchesText(o, f.text || '', catalog)) return false;

    const lines = matchingLines(o, f, catalog);
    if (lineFilter && lines.length === 0) return false;
    if (minQty > 0 || maxQty > 0) {
      const qty = lines.reduce((s, l) => s + num(l.quantity), 0);
      if (minQty > 0 && qty < minQty) return false;
      if (maxQty > 0 && qty > maxQty) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Item / category totals
// ---------------------------------------------------------------------------

export interface SalesFigures {
  qty: number;
  /** Sold at menu price, before discount and service charge. */
  sales: number;
  discount: number;
  serviceCharge: number;
  /** sales − discount + service charge. */
  net: number;
}

export interface ItemSalesRow extends SalesFigures {
  key: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** Number of bills the item appears on. */
  bills: number;
}

export interface CategorySalesRow extends SalesFigures {
  categoryId: string;
  categoryName: string;
  items: ItemSalesRow[];
  bills: number;
}

export interface ItemSalesResult {
  categories: CategorySalesRow[];
  items: ItemSalesRow[];
  totals: SalesFigures & { bills: number };
}

const zero = (): SalesFigures => ({ qty: 0, sales: 0, discount: 0, serviceCharge: 0, net: 0 });

/**
 * Shares one figure (a bill's discount or service charge) across its lines in proportion to
 * line total. The last line takes the remainder, so the shares add up exactly.
 */
export function shareAcrossLines(total: number, lineTotals: number[]): number[] {
  const sum = lineTotals.reduce((s, n) => s + n, 0);
  if (!(total > 0) || lineTotals.length === 0) return lineTotals.map(() => 0);
  if (!(sum > 0)) {
    const even = round2(total / lineTotals.length);
    return lineTotals.map((_, i) => (i === lineTotals.length - 1 ? round2(total - even * (lineTotals.length - 1)) : even));
  }
  let given = 0;
  return lineTotals.map((n, i) => {
    if (i === lineTotals.length - 1) return round2(total - given);
    const part = round2(total * n / sum);
    given = round2(given + part);
    return part;
  });
}

/**
 * What was sold, per item and per category, over a list of bills.
 * `onlyMatching` (default on) counts only the lines the product / category filters point at,
 * so searching "Chicken" totals the chicken items and not the whole bill they were on.
 */
export function itemSales(orders: Order[], catalog: ReportCatalog, f: ReportFilters = {}, onlyMatching = true): ItemSalesResult {
  const items = new Map<string, ItemSalesRow>();
  const billsOnItem = new Map<string, Set<string>>();
  const billsOnCat = new Map<string, Set<string>>();
  const allBills = new Set<string>();

  for (const o of orders) {
    const lines = (o.items || []).filter(l => num(l.quantity) !== 0 || num(l.lineTotal) !== 0);
    if (!lines.length) continue;
    const discountShares = shareAcrossLines(num(o.discount), lines.map(l => num(l.lineTotal)));
    const serviceShares = shareAcrossLines(num(o.serviceCharge), lines.map(l => num(l.lineTotal)));
    const wanted = onlyMatching ? new Set(matchingLines(o, f, catalog)) : null;

    lines.forEach((l, i) => {
      if (wanted && !wanted.has(l)) return;
      const cat = catalog.categoryOf(l);
      const name = lineName(l).trim() || 'Item';
      // One row per product name within its category (a menu item and its variants are separate rows).
      const key = `${cat.id}::${l.menuItemId}::${norm(l.variantName)}::${norm(l.name)}`;
      const row = items.get(key) || { ...zero(), key, name, categoryId: cat.id, categoryName: cat.name, bills: 0 };
      const sales = num(l.lineTotal);
      row.qty = round2(row.qty + num(l.quantity));
      row.sales = round2(row.sales + sales);
      row.discount = round2(row.discount + discountShares[i]);
      row.serviceCharge = round2(row.serviceCharge + serviceShares[i]);
      row.net = round2(row.sales - row.discount + row.serviceCharge);
      items.set(key, row);
      (billsOnItem.get(key) || billsOnItem.set(key, new Set()).get(key)!).add(o.id);
      (billsOnCat.get(cat.id) || billsOnCat.set(cat.id, new Set()).get(cat.id)!).add(o.id);
      allBills.add(o.id);
    });
  }

  const itemRows = [...items.values()].map(r => ({ ...r, bills: billsOnItem.get(r.key)?.size || 0 }));
  const cats = new Map<string, CategorySalesRow>();
  for (const r of itemRows) {
    const c = cats.get(r.categoryId) || { ...zero(), categoryId: r.categoryId, categoryName: r.categoryName, items: [], bills: billsOnCat.get(r.categoryId)?.size || 0 };
    c.qty = round2(c.qty + r.qty);
    c.sales = round2(c.sales + r.sales);
    c.discount = round2(c.discount + r.discount);
    c.serviceCharge = round2(c.serviceCharge + r.serviceCharge);
    c.net = round2(c.sales - c.discount + c.serviceCharge);
    c.items.push(r);
    cats.set(r.categoryId, c);
  }
  const categories = [...cats.values()]
    .map(c => ({ ...c, items: c.items.sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.net - a.net || a.categoryName.localeCompare(b.categoryName));

  const totals = categories.reduce((t, c) => ({
    qty: round2(t.qty + c.qty),
    sales: round2(t.sales + c.sales),
    discount: round2(t.discount + c.discount),
    serviceCharge: round2(t.serviceCharge + c.serviceCharge),
    net: round2(t.net + c.net),
    bills: t.bills,
  }), { ...zero(), bills: allBills.size });

  return { categories, items: itemRows.sort((a, b) => b.net - a.net || a.name.localeCompare(b.name)), totals };
}

/** Rows ready for a spreadsheet: one line per product with its category. */
export function itemSalesCsv(result: ItemSalesResult): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Category', 'Product', 'Bills', 'Qty sold', 'Sales', 'Discount', 'Service charge', 'Net amount'];
  const lines = [head.join(',')];
  for (const c of result.categories) {
    for (const r of c.items) lines.push([c.categoryName, r.name, r.bills, r.qty, r.sales, r.discount, r.serviceCharge, r.net].map(esc).join(','));
  }
  const t = result.totals;
  lines.push(['TOTAL', '', t.bills, t.qty, t.sales, t.discount, t.serviceCharge, t.net].map(esc).join(','));
  return lines.join('\n');
}
