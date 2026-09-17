// ============================================================
// TOKEN RECORDS — payment state, reprint protection, department stubs.
//
// The rule this file exists to protect:
//   "If a token is printed again from Retrieve, it must NOT create a new
//    sale or duplicate token record ... Do not count the reprint as a
//    second token sale."
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MenuItem, Order, TokenRecord } from '@/lib/types';

// ---- in-memory stand-in for the application database -------------------
let db: TokenRecord[] = [];
const menu: MenuItem[] = [
  { id: 'm-sajji', name: 'Sajji Full', categoryId: 'c-sajji' },
  { id: 'm-naan', name: 'Tandoori Naan', categoryId: 'c-tandoor' },
  { id: 'm-cola', name: 'Cola', categoryId: 'c-bar' },
  { id: 'm-fries', name: 'Fries', categoryId: 'c-kitchen' },
] as MenuItem[];
const categories = [
  { id: 'c-sajji', name: 'Sajji' },
  { id: 'c-tandoor', name: 'Tandoor' },
  { id: 'c-bar', name: 'Bar' },
  { id: 'c-kitchen', name: 'Kitchen' },
];

vi.mock('@/lib/store', () => ({
  getTokenRecords: () => db,
  saveTokenRecord: (r: TokenRecord) => {
    const i = db.findIndex(x => x.id === r.id);
    if (i >= 0) db[i] = r; else db.push(r);
  },
  deleteTokenRecord: (id: string) => { db = db.filter(x => x.id !== id); },
  getMenuItems: () => menu,
  getCategories: () => categories,
}));

const {
  issueToken, setTokenPaid, findTokenForOrder, nextTokenNumber,
  filterTokenRecords, summariseTokens, groupByDepartment, tokenDateKey,
} = await import('@/lib/tokenRecords');
const { buildDepartmentStubs } = await import('@/lib/tokenDepartments');

function line(menuItemId: string, name: string, quantity: number, lineTotal: number) {
  return { id: `l-${menuItemId}`, menuItemId, name, pricingType: 'fixed' as const, price: lineTotal / quantity, quantity, lineTotal, note: '' };
}

function makeOrder(id = 'o1', orderNumber = 1107): Order {
  return {
    id,
    orderNumber,
    orderType: 'dining',
    status: 'running',
    items: [
      line('m-sajji', 'Sajji Full', 6, 6000),
      line('m-naan', 'Tandoori Naan', 4, 200),
      line('m-cola', 'Cola', 3, 300),
      line('m-fries', 'Fries', 1, 250),
    ],
    subtotal: 6750, discount: 0, tax: 0, serviceCharge: 0, serviceChargePercent: 0,
    grandTotal: 6750, createdAt: new Date().toISOString(), notes: '',
  } as Order;
}

// Sajji + Tandoor + Bar are token departments; Kitchen is not.
const settings: any = {
  tokenPrintEnabled: true,
  tokenCategoryIds: ['c-sajji', 'c-tandoor', 'c-bar'],
};

beforeEach(() => { db = []; });

describe('issuing a token', () => {
  it('creates one record carrying the order and its token lines', () => {
    const r = issueToken({ order: makeOrder(), settings })!;
    expect(r.isReprint).toBe(false);
    expect(db).toHaveLength(1);
    expect(r.record.orderNumber).toBe(1107);
    // Kitchen is not a token department, so Fries is not on the token.
    expect(r.record.items.map(i => i.name)).toEqual(['Sajji Full', 'Tandoori Naan', 'Cola']);
    expect(r.record.totalPieces).toBe(13);
  });

  it('tags each line with the department it belongs to', () => {
    const r = issueToken({ order: makeOrder(), settings })!;
    expect(r.record.items.map(i => i.departmentName)).toEqual(['Sajji', 'Tandoor', 'Bar']);
    expect(r.record.departmentIds).toEqual(['c-sajji', 'c-tandoor', 'c-bar']);
  });

  it('numbers tokens from 1 each day', () => {
    expect(nextTokenNumber()).toBe(1);
    issueToken({ order: makeOrder('o1', 1), settings });
    issueToken({ order: makeOrder('o2', 2), settings });
    expect(nextTokenNumber()).toBe(3);
    expect(db.map(t => t.tokenNumber)).toEqual([1, 2]);
  });

  it('returns nothing when the order has no token items', () => {
    const order = makeOrder();
    order.items = [line('m-fries', 'Fries', 1, 250)];
    expect(issueToken({ order, settings })).toBeNull();
    expect(db).toHaveLength(0);
  });
});

describe('reprint protection', () => {
  it('returns the SAME record instead of minting a second token', () => {
    const order = makeOrder();
    const first = issueToken({ order, settings })!;
    const again = issueToken({ order, settings })!;

    expect(again.isReprint).toBe(true);
    expect(again.record.id).toBe(first.record.id);
    expect(again.record.tokenNumber).toBe(first.record.tokenNumber);
    // The whole point: still one token in the database.
    expect(db).toHaveLength(1);
  });

  it('counts the reprints without changing the token or its amount', () => {
    const order = makeOrder();
    const first = issueToken({ order, settings })!;
    issueToken({ order, settings });
    const third = issueToken({ order, settings })!;

    expect(third.record.reprintCount).toBe(2);
    expect(third.record.amount).toBe(first.record.amount);
    expect(third.record.lastReprintAt).toBeTruthy();
  });

  it('does not add to the token count or the token sales total', () => {
    const order = makeOrder();
    issueToken({ order, settings });
    const before = summariseTokens(filterTokenRecords({}));
    issueToken({ order, settings });
    issueToken({ order, settings });
    const after = summariseTokens(filterTokenRecords({}));

    expect(after.total).toBe(before.total);
    expect(after.totalAmount).toBe(before.totalAmount);
    expect(after.totalPieces).toBe(before.totalPieces);
    // The reprint IS visible, just not as another sale.
    expect(after.reprinted).toBe(1);
  });

  it('keeps separate orders on separate tokens', () => {
    issueToken({ order: makeOrder('o1', 1107), settings });
    issueToken({ order: makeOrder('o2', 1108), settings });
    expect(db).toHaveLength(2);
    expect(findTokenForOrder('o1')!.orderNumber).toBe(1107);
    expect(findTokenForOrder('o2')!.orderNumber).toBe(1108);
  });
});

describe('token payment mode', () => {
  it('OFF — a token carries no payment state at all', () => {
    const r = issueToken({ order: makeOrder(), settings })!;
    expect(r.record.paymentStatus).toBe('not_applicable');
    const s = summariseTokens(filterTokenRecords({}));
    // Not counted as money owed, which is the point of leaving it off.
    expect(s.unpaid).toBe(0);
    expect(s.totalAmount).toBe(0);
  });

  it('ON — an unpaid order produces an unpaid token with its amount', () => {
    const r = issueToken({ order: makeOrder(), settings: { ...settings, tokenPaymentMode: true } })!;
    expect(r.record.paymentStatus).toBe('unpaid');
    expect(r.record.amount).toBe(6500); // 6000 + 200 + 300
    const s = summariseTokens(filterTokenRecords({}));
    expect(s.unpaid).toBe(1);
    expect(s.unpaidAmount).toBe(6500);
  });

  it('ON — a paid order produces a paid token', () => {
    const order = makeOrder();
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    const r = issueToken({ order, settings: { ...settings, tokenPaymentMode: true } })!;
    expect(r.record.paymentStatus).toBe('paid');
    expect(summariseTokens(filterTokenRecords({})).paidAmount).toBe(6500);
  });

  it('can be settled later from Token Management', () => {
    const r = issueToken({ order: makeOrder(), settings: { ...settings, tokenPaymentMode: true } })!;
    const paid = setTokenPaid(r.record.id, true, { paymentMethod: 'cash' })!;
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.paidAt).toBeTruthy();
    const s = summariseTokens(filterTokenRecords({}));
    expect(s.paid).toBe(1);
    expect(s.unpaid).toBe(0);
  });

  it('refuses to set a paid state on a token the shop does not charge for', () => {
    const r = issueToken({ order: makeOrder(), settings })!;
    const same = setTokenPaid(r.record.id, true)!;
    expect(same.paymentStatus).toBe('not_applicable');
  });
});

describe('filters', () => {
  beforeEach(() => {
    const a = issueToken({ order: makeOrder('o1', 1107), settings: { ...settings, tokenPaymentMode: true } })!;
    setTokenPaid(a.record.id, true);
    issueToken({ order: makeOrder('o2', 1108), settings: { ...settings, tokenPaymentMode: true } });
    issueToken({ order: makeOrder('o1', 1107), settings: { ...settings, tokenPaymentMode: true } }); // reprint
  });

  it('separates paid from unpaid', () => {
    expect(filterTokenRecords({ paymentStatus: 'paid' })).toHaveLength(1);
    expect(filterTokenRecords({ paymentStatus: 'unpaid' })).toHaveLength(1);
  });

  it('finds a token by its order number', () => {
    expect(filterTokenRecords({ orderNumber: 1108 })).toHaveLength(1);
  });

  it('lists only the reprinted ones when asked', () => {
    const reprinted = filterTokenRecords({ reprintedOnly: true });
    expect(reprinted).toHaveLength(1);
    expect(reprinted[0].orderNumber).toBe(1107);
  });

  it('filters by department', () => {
    expect(filterTokenRecords({ departmentId: 'c-sajji' })).toHaveLength(2);
    expect(filterTokenRecords({ departmentId: 'c-kitchen' })).toHaveLength(0);
  });

  it('filters by day', () => {
    expect(filterTokenRecords({ dateKey: tokenDateKey() })).toHaveLength(2);
    expect(filterTokenRecords({ dateKey: '2000-01-01' })).toHaveLength(0);
  });
});

describe('department reconciliation', () => {
  it('reports pieces per department for a physical count', () => {
    issueToken({ order: makeOrder(), settings });
    const s = summariseTokens(filterTokenRecords({}));
    const sajji = s.perDepartment.find(d => d.departmentName === 'Sajji')!;
    // The system says 6 — the Sajji counter should hold 6 stubs.
    expect(sajji.qty).toBe(6);
    expect(sajji.tokens).toBe(1);
  });

  it('groups a token\'s lines by department', () => {
    const r = issueToken({ order: makeOrder(), settings })!;
    const groups = groupByDepartment(r.record);
    expect(groups.map(g => [g.departmentName, g.qty])).toEqual([
      ['Sajji', 6], ['Tandoor', 4], ['Bar', 3],
    ]);
  });
});

describe('detachable stub split modes', () => {
  const on = (extra: Record<string, unknown> = {}) =>
    ({ ...settings, tokenDepartmentMode: true, ...extra });

  it('per piece (default) prints one countable stub per unit sold', () => {
    // The reconciliation case: the system says Sajji 6, so the Sajji counter
    // must end up holding SIX pieces of paper, not one saying "6".
    const stubs = buildDepartmentStubs(makeOrder(), on(), menu)!;
    const sajji = stubs.filter(s => s.itemName === 'Sajji Full');
    expect(sajji).toHaveLength(6);
    expect(sajji.every(s => s.qty === 1)).toBe(true);
    // 6 Sajji + 4 Naan + 3 Cola
    expect(stubs).toHaveLength(13);
  });

  it('numbers each piece so a missing one is obvious', () => {
    const stubs = buildDepartmentStubs(makeOrder(), on(), menu)!;
    const sajji = stubs.filter(s => s.itemName === 'Sajji Full');
    expect(sajji.map(s => `${s.index} of ${s.ofTotal}`)).toEqual([
      '1 of 6', '2 of 6', '3 of 6', '4 of 6', '5 of 6', '6 of 6',
    ]);
  });

  it('per item prints one stub per menu line carrying its quantity', () => {
    const stubs = buildDepartmentStubs(makeOrder(), on({ tokenStubMode: 'item' }), menu)!;
    expect(stubs).toHaveLength(3);
    expect(stubs.map(s => [s.itemName, s.qty])).toEqual([
      ['Cola', 3], ['Sajji Full', 6], ['Tandoori Naan', 4],
    ]);
  });

  it('per department prints one summary stub per counter', () => {
    const stubs = buildDepartmentStubs(makeOrder(), on({ tokenStubMode: 'department' }), menu)!;
    expect(stubs.map(s => [s.departmentName, s.qty])).toEqual([
      ['Bar', 3], ['Sajji', 6], ['Tandoor', 4],
    ]);
    expect(stubs.every(s => !s.itemName)).toBe(true);
  });

  it('falls back to per item rather than emptying the roll on a huge order', () => {
    const order = makeOrder();
    order.items = [line('m-naan', 'Tandoori Naan', 200, 10000)];
    const stubs = buildDepartmentStubs(order, on(), menu)!;
    expect(stubs).toHaveLength(1);
    expect(stubs[0].qty).toBe(200);
  });

  it('still honours the department selection in every mode', () => {
    for (const mode of ['piece', 'item', 'department'] as const) {
      const stubs = buildDepartmentStubs(
        makeOrder(),
        on({ tokenStubMode: mode, tokenDepartmentIds: ['c-sajji'] }),
        menu,
      )!;
      expect(stubs.every(s => s.departmentName === 'Sajji')).toBe(true);
    }
  });
});

describe('detachable department stubs', () => {
  it('prints nothing extra when the mode is off', () => {
    expect(buildDepartmentStubs(makeOrder(), settings, menu)).toBeUndefined();
  });

  it('builds one stub per department when the mode is on', () => {
    const stubs = buildDepartmentStubs(
      makeOrder(),
      { ...settings, tokenDepartmentMode: true, tokenStubMode: 'department' },
      menu,
    )!;
    expect(stubs.map(s => [s.departmentName, s.qty])).toEqual([
      ['Bar', 3], ['Sajji', 6], ['Tandoor', 4],
    ]);
  });

  it('narrows to the departments the shop selected', () => {
    const stubs = buildDepartmentStubs(
      makeOrder(),
      { ...settings, tokenDepartmentMode: true, tokenStubMode: 'department', tokenDepartmentIds: ['c-sajji'] },
      menu,
    )!;
    expect(stubs).toHaveLength(1);
    expect(stubs[0].departmentName).toBe('Sajji');
  });

  it('never stubs an item that would not get a token at all', () => {
    // Kitchen is not a token department, so Fries gets no stub even if the
    // shop ticks Kitchen in the department list.
    const stubs = buildDepartmentStubs(
      makeOrder(),
      { ...settings, tokenDepartmentMode: true, tokenDepartmentIds: ['c-kitchen'] },
      menu,
    );
    expect(stubs).toBeUndefined();
  });

  it('is undefined when no token rule is configured', () => {
    expect(buildDepartmentStubs(makeOrder(), { tokenDepartmentMode: true }, menu)).toBeUndefined();
  });
});
