// ============================================================
// REPORTS — search by anything, and sales by category / product.
//
// What is pinned:
//   • one search box finds a bill by its number, customer, phone, product, category,
//     cashier, table or payment — several words must all be found;
//   • the specific filters (product, category, customer, payment, order type, cashier,
//     quantity, sales amount) each narrow the list, and add up;
//   • category / product totals: quantity, sales, discounts, service charge, net;
//   • a bill's discount and service charge are shared across its items so that the
//     report totals equal the bills' own figures exactly, to the paisa;
//   • searching "Chicken" totals the chicken lines, not the whole bill they were on;
//   • the panel and the report render and report what the user typed / picked.
// ============================================================
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import {
  filterOrders, hasActiveFilters, itemSales, itemSalesCsv, makeCatalog, shareAcrossLines, UNCATEGORISED_NAME,
  type ReportFilters,
} from '@/lib/reportSearch';
import ReportSearchPanel from '@/components/reports/ReportSearchPanel';
import CategoryProductReport from '@/components/reports/CategoryProductReport';

const CATS = [{ id: 'chicken', name: 'Chicken' }, { id: 'drinks', name: 'Drinks' }, { id: 'bread', name: 'Bread' }];
const ITEMS = [
  { id: 'karahi', name: 'Chicken Karahi', categoryId: 'chicken' },
  { id: 'tikka', name: 'Chicken Tikka', categoryId: 'chicken' },
  { id: 'cola', name: 'Cola', categoryId: 'drinks' },
  { id: 'naan', name: 'Naan', categoryId: 'bread' },
];
const catalog = makeCatalog(ITEMS, CATS);

let n = 0;
const line = (menuItemId: string, name: string, quantity: number, price: number, extra: any = {}) =>
  ({ id: `l${++n}`, menuItemId, name, pricingType: 'fixed', price, quantity, lineTotal: quantity * price, note: '', ...extra });

function bill(id: string, orderNumber: number, over: any = {}) {
  const items = over.items || [];
  const subtotal = items.reduce((s: number, l: any) => s + l.lineTotal, 0);
  const discount = over.discount || 0;
  const serviceCharge = over.serviceCharge || 0;
  return {
    id, orderNumber, orderType: 'dining', status: 'paid', paymentMethod: 'cash',
    subtotal, discount, serviceCharge, tax: 0,
    grandTotal: subtotal - discount + serviceCharge,
    createdAt: '2026-10-05T12:00:00.000Z', cashierId: 'u1', cashierName: 'Ali', ...over, items,
  } as any;
}

const A = bill('a', 1001, {
  customer: { name: 'Ahmed Khan', phone: '0300-1111111' }, tableName: 'T4',
  items: [line('karahi', 'Chicken Karahi', 2, 1200), line('naan', 'Naan', 4, 30), line('cola', 'Cola', 2, 100)],
  discount: 244, serviceCharge: 232, // 10% off then 10% service on 2720
});
const B = bill('b', 1002, {
  orderType: 'takeaway', paymentMethod: 'card', cashierId: 'u2', cashierName: 'Sara',
  customer: { name: 'Bilal', phone: '0321-2222222' },
  items: [line('tikka', 'Chicken Tikka', 1, 900), line('cola', 'Cola', 1, 100)],
});
const C = bill('c', 1003, {
  orderType: 'delivery', paymentMethod: 'online', cashierId: 'u1',
  items: [line('naan', 'Naan', 10, 30), line('ghost', 'Special Thali', 1, 500)], // 'ghost' is not on the menu
});
const D = bill('d', 1004, {
  items: [line('karahi', 'Chicken Karahi', 1, 1200, { variantName: 'Half' })], serviceCharge: 120,
});
const ALL = [A, B, C, D];
const ids = (list: any[]) => list.map(o => o.id);

describe('the search box', () => {
  it('finds a bill by its number, with or without #', () => {
    expect(ids(filterOrders(ALL, { text: '1002' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { billNo: '#1003' }, catalog))).toEqual(['c']);
  });
  it('finds a product, anywhere on the bill', () => {
    expect(ids(filterOrders(ALL, { text: 'chicken' }, catalog))).toEqual(['a', 'b', 'd']);
    expect(ids(filterOrders(ALL, { text: 'thali' }, catalog))).toEqual(['c']);
  });
  it('finds a category by its name', () => {
    expect(ids(filterOrders(ALL, { text: 'drinks' }, catalog))).toEqual(['a', 'b']);
  });
  it('finds a customer by name or phone, and a cashier, table or payment method', () => {
    expect(ids(filterOrders(ALL, { text: 'ahmed' }, catalog))).toEqual(['a']);
    expect(ids(filterOrders(ALL, { text: '2222222' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { text: 'sara' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { text: 'T4' }, catalog))).toEqual(['a']);
    expect(ids(filterOrders(ALL, { text: 'online' }, catalog))).toEqual(['c']);
  });
  it('needs every word, in any order', () => {
    expect(ids(filterOrders(ALL, { text: 'chicken card' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { text: 'card chicken' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { text: 'chicken nothing' }, catalog))).toEqual([]);
  });
  it('is not case sensitive and ignores surrounding spaces', () => {
    expect(ids(filterOrders(ALL, { text: '  CHICKEN  ' }, catalog))).toEqual(['a', 'b', 'd']);
  });
  it('an empty search returns the same list', () => {
    expect(filterOrders(ALL, {}, catalog)).toBe(ALL);
    expect(filterOrders(ALL, { text: '   ' }, catalog)).toEqual(ALL);
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ text: 'x' })).toBe(true);
  });
});

describe('the specific filters', () => {
  it('product', () => {
    expect(ids(filterOrders(ALL, { product: 'karahi' }, catalog))).toEqual(['a', 'd']);
    expect(ids(filterOrders(ALL, { product: 'half' }, catalog))).toEqual(['d']); // the variant is part of the name
  });
  it('category', () => {
    expect(ids(filterOrders(ALL, { categoryIds: ['chicken'] }, catalog))).toEqual(['a', 'b', 'd']);
    expect(ids(filterOrders(ALL, { categoryIds: ['bread'] }, catalog))).toEqual(['a', 'c']);
    expect(ids(filterOrders(ALL, { categoryIds: ['drinks', 'bread'] }, catalog))).toEqual(['a', 'b', 'c']);
  });
  it('customer', () => {
    expect(ids(filterOrders(ALL, { customer: 'bilal' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { customer: '0300' }, catalog))).toEqual(['a']);
  });
  it('payment method (a bill with none counts as cash)', () => {
    expect(ids(filterOrders([A, B, C, { ...D, paymentMethod: undefined }], { payment: 'cash' }, catalog))).toEqual(['a', 'd']);
    expect(ids(filterOrders(ALL, { payment: 'card' }, catalog))).toEqual(['b']);
  });
  it('Dine-In / Takeaway / Delivery', () => {
    expect(ids(filterOrders(ALL, { orderType: 'dining' }, catalog))).toEqual(['a', 'd']);
    expect(ids(filterOrders(ALL, { orderType: 'takeaway' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { orderType: 'delivery' }, catalog))).toEqual(['c']);
  });
  it('user / cashier', () => {
    expect(ids(filterOrders(ALL, { cashierId: 'u2' }, catalog))).toEqual(['b']);
    expect(ids(filterOrders(ALL, { cashierId: 'u1' }, catalog))).toEqual(['a', 'c', 'd']);
  });
  it('sales amount', () => {
    // A = 2720-244+232 = 2708, B = 1000, C = 800, D = 1320
    expect(ids(filterOrders(ALL, { minAmount: 1000 }, catalog))).toEqual(['a', 'b', 'd']);
    expect(ids(filterOrders(ALL, { maxAmount: 1000 }, catalog))).toEqual(['b', 'c']);
    expect(ids(filterOrders(ALL, { minAmount: 900, maxAmount: 1400 }, catalog))).toEqual(['b', 'd']);
  });
  it('product quantity counts the matching items (all items when no product is set)', () => {
    expect(ids(filterOrders(ALL, { product: 'naan', minQty: 5 }, catalog))).toEqual(['c']);
    expect(ids(filterOrders(ALL, { product: 'naan', maxQty: 4 }, catalog))).toEqual(['a']);
    expect(ids(filterOrders(ALL, { minQty: 11 }, catalog))).toEqual(['c']);
  });
  it('filters add up', () => {
    expect(ids(filterOrders(ALL, { categoryIds: ['chicken'], orderType: 'dining', cashierId: 'u1' }, catalog))).toEqual(['a', 'd']);
    expect(ids(filterOrders(ALL, { categoryIds: ['chicken'], orderType: 'dining', payment: 'card' }, catalog))).toEqual([]);
  });
});

describe('category and product totals', () => {
  it('Chicken: every chicken item with quantity, sales, discount, service charge and net', () => {
    const r = itemSales(ALL, catalog, { categoryIds: ['chicken'] });
    expect(r.categories.map(c => c.categoryName)).toEqual(['Chicken']);
    // Bill A's discount 244 and service 232 are shared across its three lines by price (2400 / 120 / 200 of 2720).
    // A menu item and its variant (Karahi / Karahi Half) are separate rows.
    expect(r.items.length).toBe(3);
    const karahi = r.items.find(i => i.name === 'Chicken Karahi')!;
    expect(karahi.qty).toBe(2);
    expect(karahi.sales).toBe(2400);
    expect(karahi.discount).toBeCloseTo(244 * 2400 / 2720, 1);
    expect(karahi.serviceCharge).toBeCloseTo(232 * 2400 / 2720, 1);
    expect(karahi.net).toBeCloseTo(2400 - karahi.discount + karahi.serviceCharge, 2);
    const half = r.items.find(i => i.name === 'Chicken Karahi Half')!;
    expect(half.qty).toBe(1);
    expect(half.serviceCharge).toBe(120); // the only line on its bill carries all of it
    expect(r.totals.qty).toBe(4);
    expect(r.totals.sales).toBe(2400 + 900 + 1200);
  });

  it('the shares add back up to the bills\' own figures, to the paisa', () => {
    const r = itemSales(ALL, catalog, {}, false);
    const sum = (k: string) => ALL.reduce((s, o) => s + (o[k] || 0), 0);
    expect(r.totals.sales).toBeCloseTo(sum('subtotal'), 2);
    expect(r.totals.discount).toBeCloseTo(sum('discount'), 2);
    expect(r.totals.serviceCharge).toBeCloseTo(sum('serviceCharge'), 2);
    expect(r.totals.net).toBeCloseTo(sum('grandTotal'), 2);
    expect(r.totals.bills).toBe(4);
  });

  it('shareAcrossLines is exact, even for awkward splits', () => {
    for (const [total, lines] of [[100, [1, 1, 1]], [244, [2400, 120, 200]], [0.1, [3, 3, 3]], [999.99, [7, 13, 29, 31]]] as const) {
      const shares = shareAcrossLines(total, [...lines]);
      expect(Math.round(shares.reduce((s, x) => s + x, 0) * 100) / 100).toBe(total);
      expect(shares.every(x => x >= 0)).toBe(true);
    }
    expect(shareAcrossLines(0, [10, 20])).toEqual([0, 0]);
    expect(shareAcrossLines(50, [0, 0])).toEqual([25, 25]); // free items still share evenly
    expect(shareAcrossLines(50, [])).toEqual([]);
  });

  it('searching a product totals those lines, not the whole bill', () => {
    const r = itemSales(filterOrders(ALL, { product: 'cola' }, catalog), catalog, { product: 'cola' });
    expect(r.items.map(i => i.name)).toEqual(['Cola']);
    expect(r.totals.qty).toBe(3);
    expect(r.totals.sales).toBe(300);
  });

  it('the search box narrows the items too, unless it matched something else on the bill', () => {
    const byWord = itemSales(filterOrders(ALL, { text: 'chicken' }, catalog), catalog, { text: 'chicken' });
    expect(byWord.categories.map(c => c.categoryName)).toEqual(['Chicken']);
    const byCustomer = itemSales(filterOrders(ALL, { text: 'bilal' }, catalog), catalog, { text: 'bilal' });
    expect(byCustomer.items.map(i => i.name).sort()).toEqual(['Chicken Tikka', 'Cola']);
  });

  it('an item no longer on the menu is kept, under Uncategorised', () => {
    const r = itemSales([C], catalog);
    expect(r.categories.map(c => c.categoryName).sort()).toEqual(['Bread', UNCATEGORISED_NAME].sort());
    expect(r.items.find(i => i.name === 'Special Thali')?.categoryName).toBe(UNCATEGORISED_NAME);
  });

  it('categories and items come out biggest first', () => {
    const r = itemSales(ALL, catalog);
    const nets = r.categories.map(c => c.net);
    expect(nets).toEqual([...nets].sort((a, b) => b - a));
    for (const c of r.categories) expect(c.items.map(i => i.net)).toEqual([...c.items.map(i => i.net)].sort((a, b) => b - a));
  });

  it('counts the bills each item and the whole report appear on', () => {
    const r = itemSales(ALL, catalog);
    expect(r.items.find(i => i.name === 'Naan')?.bills).toBe(2);
    expect(r.categories.find(c => c.categoryName === 'Chicken')?.bills).toBe(3);
  });

  it('survives empty input and odd lines', () => {
    expect(itemSales([], catalog).totals).toEqual({ qty: 0, sales: 0, discount: 0, serviceCharge: 0, net: 0, bills: 0 });
    expect(itemSales([bill('e', 1, { items: [] })], catalog).categories).toEqual([]);
    const odd = bill('f', 2, { items: [line('naan', 'Naan', undefined as any, undefined as any, { lineTotal: undefined })] });
    expect(() => itemSales([odd], catalog)).not.toThrow();
  });

  it('writes a CSV a spreadsheet can open, quoting names with commas', () => {
    const r = itemSales([bill('g', 5, { items: [line('naan', 'Naan, Garlic "Special"', 2, 50)] })], catalog);
    const csv = itemSalesCsv(r);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('Category,Product,Bills,Qty sold,Sales,Discount,Service charge,Net amount');
    expect(rows[1]).toBe('Bread,"Naan, Garlic ""Special""",1,2,100,0,0,100');
    expect(rows[rows.length - 1]).toBe('TOTAL,,1,2,100,0,0,100');
  });
});

describe('the search panel', () => {
  function Harness({ initial = {} as ReportFilters, open = true }) {
    const [f, setF] = useState<ReportFilters>(initial);
    const [expanded, setExpanded] = useState(open);
    const matched = filterOrders(ALL, f, catalog);
    return (
      <ReportSearchPanel
        filters={f} onChange={setF} categories={CATS} productNames={ITEMS.map(i => i.name!)}
        cashiers={[{ id: 'u1', name: 'Ali' }, { id: 'u2', name: 'Sara' }]}
        matched={matched.length} total={ALL.length} expanded={expanded} onToggleExpanded={setExpanded}
      />
    );
  }

  it('shows how many bills match as the user types, and clears', () => {
    render(<Harness open={false} />);
    expect(screen.getByTestId('report-search-count').textContent).toMatch(/4 bills/);
    fireEvent.change(screen.getByLabelText('Search reports'), { target: { value: 'chicken' } });
    expect(screen.getByTestId('report-search-count').textContent).toMatch(/3\s*of 4 bills/);
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByTestId('report-search-count').textContent).toMatch(/4 bills/);
  });

  it('has a control for every filter the owner asked for', () => {
    render(<Harness />);
    for (const name of [/Bill number/, /Category/, /Product/, /Customer/, /Payment method/, /Order type/, /User \/ cashier/, /Product quantity/, /Sales amount/]) {
      expect(screen.getAllByText(name).length, String(name)).toBeGreaterThan(0);
    }
    expect((screen.getByLabelText('Payment method') as HTMLSelectElement).textContent).toMatch(/Cash.*Card.*Online.*Credit/);
    expect((screen.getByLabelText('Order type') as HTMLSelectElement).textContent).toMatch(/Dine-In.*Takeaway.*Delivery/);
  });

  it('narrows by category and payment together', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'chicken' } });
    expect(screen.getByTestId('report-search-count').textContent).toMatch(/3\s*of 4/);
    fireEvent.change(screen.getByLabelText('Payment method'), { target: { value: 'card' } });
    expect(screen.getByTestId('report-search-count').textContent).toMatch(/1\s*of 4/);
  });

  it('hides the user filter when there are no users to pick (a cashier sees only their own bills)', () => {
    render(<ReportSearchPanel filters={{}} onChange={() => {}} categories={CATS} productNames={[]} cashiers={[]} matched={1} total={1} expanded />);
    expect(screen.queryByText(/User \/ cashier/)).toBeNull();
  });
});

describe('the category / product report', () => {
  const result = itemSales(ALL, catalog, {}, false);
  const noop = () => {};

  it('lists categories with their products and a total', () => {
    render(<CategoryProductReport result={result} categories={CATS} categoryId="" onCategoryChange={noop} onCsv={noop} onPrint={noop} />);
    const table = screen.getByTestId('category-product-table');
    expect(within(table).getAllByTestId('category-row').length).toBe(result.categories.length);
    expect(within(table).getAllByTestId('product-row').length).toBe(result.items.length);
    expect(table.textContent).toMatch(/TOTAL · 4 bills/);
    expect(table.textContent).toContain('Chicken Karahi');
  });

  it('one category shows only its products, without a category row', () => {
    const chicken = itemSales(ALL, catalog, { categoryIds: ['chicken'] });
    render(<CategoryProductReport result={chicken} categories={CATS} categoryId="chicken" onCategoryChange={noop} onCsv={noop} onPrint={noop} />);
    const table = screen.getByTestId('category-product-table');
    expect(within(table).queryAllByTestId('category-row').length).toBe(0);
    expect(within(table).getAllByTestId('product-row').length).toBe(3);
    expect(table.textContent).not.toContain('Cola');
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('chicken');
  });

  it('says so when nothing was sold, and disables export', () => {
    render(<CategoryProductReport result={itemSales([], catalog)} categories={CATS} categoryId="" onCategoryChange={noop} onCsv={noop} onPrint={noop} />);
    expect(screen.getByText(/Nothing sold for this search/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Excel/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows discounts and service charge only where there are some', () => {
    render(<CategoryProductReport result={itemSales([B], catalog)} categories={CATS} categoryId="" onCategoryChange={noop} onCsv={noop} onPrint={noop} />);
    const rows = screen.getAllByTestId('product-row');
    for (const r of rows) {
      const cells = r.querySelectorAll('td');
      expect(cells[3].textContent).toBe('—'); // discount
      expect(cells[4].textContent).toBe('—'); // service charge
    }
  });

  it('changing the category and calling export reach the page', () => {
    const calls: string[] = [];
    render(<CategoryProductReport result={result} categories={CATS} categoryId="" onCategoryChange={id => calls.push(`cat:${id}`)} onCsv={() => calls.push('csv')} onPrint={() => calls.push('print')} />);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'drinks' } });
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    fireEvent.click(screen.getByRole('button', { name: /Print 80mm/ }));
    expect(calls).toEqual(['cat:drinks', 'csv', 'print']);
  });
});
