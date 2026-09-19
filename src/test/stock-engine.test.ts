// ============================================================
// STOCK COMING OFF A SALE.
//
// The fault this engine was written to end: three separate code paths all
// deducted stock for the same paid order, so a shop selling twenty burgers
// watched sixty come off the inventory. One path, one deduction, once.
//
// What has to hold, and what it costs when it does not:
//
//   • deduct EXACTLY once per order — anything else is inventory that does
//     not match the shelf, and a shop that stops trusting the numbers stops
//     using the feature;
//   • only for a paid order — a running bill has not sold anything yet;
//   • recipe units convert properly — 250 g of a 5 kg bag is 0.25, not 250,
//     and getting that wrong empties a store room on paper in one shift;
//   • a void puts it all back, exactly.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import type { Order, InventoryItem, MenuItem, Recipe } from '@/lib/types';
import { consumeStockForOrder, reverseStockForOrder, getStockMovements } from '@/lib/stockEngine';

function inv(id: string, name: string, quantity: number, baseUnit = 'pcs'): InventoryItem {
  return { id, name, quantity, baseUnit, unit: baseUnit, minQuantity: 0 } as unknown as InventoryItem;
}
function menu(id: string, name: string, extra: Record<string, unknown> = {}): MenuItem {
  return { id, name, price: 100, categoryId: 'c1', isActive: true, isAvailable: true, ...extra } as unknown as MenuItem;
}
function order(items: Array<Record<string, unknown>>, over: Record<string, unknown> = {}): Order {
  return {
    id: 'o1', orderNumber: 1, status: 'paid',
    createdAt: new Date().toISOString(),
    items: items.map((i, n) => ({ id: `l${n}`, quantity: 1, ...i })),
    ...over,
  } as unknown as Order;
}

/** A shop, with the saves recorded so a test can read them back. */
function shop(inventory: InventoryItem[], menuItems: MenuItem[], recipes: Recipe[] = []) {
  const store = new Map(inventory.map(i => [i.id, { ...i }]));
  const logs: Array<{ inventoryItemId: string; quantity: number }> = [];
  return {
    deps: {
      getInventory: () => Array.from(store.values()),
      getMenuItems: () => menuItems,
      getRecipes: () => recipes,
      saveInventoryItem: (i: InventoryItem) => { store.set(i.id, { ...i }); },
      appendStockLogs: (rows: any[]) => { logs.push(...rows); },
    },
    qty: (id: string) => Number(store.get(id)?.quantity ?? NaN),
    logs,
  };
}

beforeEach(() => localStorage.clear());

describe('a paid order takes stock off once', () => {
  it('deducts a directly linked item', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    const o = order([{ menuItemId: 'm-cola', quantity: 3 }]);

    const res = consumeStockForOrder(o, s.deps);
    expect(res.consumed).toBe(true);
    expect(s.qty('i-cola')).toBe(97);
  });

  it('DOES NOT deduct a second time — the triple-deduction fault', () => {
    // Three code paths used to run for the same order. Twenty burgers sold,
    // sixty off the shelf.
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    const o = order([{ menuItemId: 'm-cola', quantity: 3 }]);

    consumeStockForOrder(o, s.deps);
    consumeStockForOrder(o, s.deps);
    consumeStockForOrder(o, s.deps);

    expect(s.qty('i-cola'), 'stock came off more than once').toBe(97);
  });

  it('adds up several lines of the same item', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    consumeStockForOrder(order([
      { menuItemId: 'm-cola', quantity: 2 },
      { menuItemId: 'm-cola', quantity: 3 },
    ]), s.deps);
    expect(s.qty('i-cola')).toBe(95);
  });

  it('writes the sale into the stock log the Inventory page shows', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    consumeStockForOrder(order([{ menuItemId: 'm-cola', quantity: 2 }]), s.deps);
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0]).toMatchObject({ inventoryItemId: 'i-cola', quantity: 2 });
  });
});

describe('an order that has not sold anything', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['a running bill', { status: 'running' }],
    ['a held bill', { status: 'hold' }],
    ['a voided bill', { status: 'void' }],
    ['a cancelled bill', { status: 'cancelled' }],
  ];

  for (const [what, over] of cases) {
    it(`takes nothing off for ${what}`, () => {
      const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
      const res = consumeStockForOrder(order([{ menuItemId: 'm-cola', quantity: 5 }], over), s.deps);
      expect(res.consumed).toBe(false);
      expect(s.qty('i-cola')).toBe(100);
    });
  }

  it('does deduct for a credit sale, which IS a sale', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    consumeStockForOrder(order([{ menuItemId: 'm-cola', quantity: 4 }], { status: 'credit_received' }), s.deps);
    expect(s.qty('i-cola')).toBe(96);
  });
});

describe('recipes, and the units that empty a store room', () => {
  it('converts grams against a kilogram base', () => {
    // 250 g of a 5 kg bag is 0.25 off, not 250. Getting this wrong shows an
    // empty store room after one shift.
    const s = shop(
      [inv('i-flour', 'Flour', 5, 'kg')],
      [menu('m-naan', 'Naan')],
      [{ id: 'r1', menuItemId: 'm-naan', components: [{ inventoryItemId: 'i-flour', quantity: 250, unit: 'g' }] } as unknown as Recipe],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-naan', quantity: 2 }]), s.deps);
    expect(s.qty('i-flour')).toBe(4.5);   // 5 - (0.25 x 2)
  });

  it('converts millilitres against a litre base', () => {
    const s = shop(
      [inv('i-oil', 'Oil', 2, 'l')],
      [menu('m-fries', 'Fries')],
      [{ id: 'r1', menuItemId: 'm-fries', components: [{ inventoryItemId: 'i-oil', quantity: 100, unit: 'ml' }] } as unknown as Recipe],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-fries', quantity: 3 }]), s.deps);
    expect(s.qty('i-oil')).toBeCloseTo(1.7, 3);
  });

  it('takes every component of a recipe', () => {
    const s = shop(
      [inv('i-bun', 'Bun', 50), inv('i-patty', 'Patty', 50), inv('i-cheese', 'Cheese', 1, 'kg')],
      [menu('m-burger', 'Burger')],
      [{
        id: 'r1', menuItemId: 'm-burger',
        components: [
          { inventoryItemId: 'i-bun', quantity: 1, unit: 'pcs' },
          { inventoryItemId: 'i-patty', quantity: 2, unit: 'pcs' },
          { inventoryItemId: 'i-cheese', quantity: 30, unit: 'g' },
        ],
      } as unknown as Recipe],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-burger', quantity: 4 }]), s.deps);
    expect(s.qty('i-bun')).toBe(46);
    expect(s.qty('i-patty')).toBe(42);
    expect(s.qty('i-cheese')).toBeCloseTo(0.88, 3);
  });

  it('prefers the recipe over a direct link', () => {
    // A menu item with both must not be deducted twice.
    const s = shop(
      [inv('i-bun', 'Bun', 50), inv('i-burger', 'Burger stock', 50)],
      [menu('m-burger', 'Burger', { inventoryItemId: 'i-burger' })],
      [{ id: 'r1', menuItemId: 'm-burger', components: [{ inventoryItemId: 'i-bun', quantity: 1, unit: 'pcs' }] } as unknown as Recipe],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-burger', quantity: 2 }]), s.deps);
    expect(s.qty('i-bun')).toBe(48);
    expect(s.qty('i-burger'), 'the direct link was deducted as well as the recipe').toBe(50);
  });
});

describe('items sold by weight', () => {
  it('deducts the weight, not the line count', () => {
    // 750 g of mutton is 0.75 off a kilogram-based stock, whatever the line
    // quantity says.
    const s = shop(
      [inv('i-mutton', 'Mutton', 10, 'kg')],
      [menu('m-mutton', 'Mutton', { pricingType: 'weight', inventoryItemId: 'i-mutton' })],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-mutton', quantity: 1, weightGrams: 750 }]), s.deps);
    expect(s.qty('i-mutton')).toBe(9.25);
  });

  it('falls back to the quantity when no weight was entered', () => {
    const s = shop(
      [inv('i-mutton', 'Mutton', 10, 'kg')],
      [menu('m-mutton', 'Mutton', { pricingType: 'weight', inventoryItemId: 'i-mutton' })],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-mutton', quantity: 2 }]), s.deps);
    expect(s.qty('i-mutton')).toBe(8);
  });
});

describe('when the link was never set', () => {
  it('matches a minimart item on its barcode', () => {
    // Imported catalogues routinely arrive without the inventory link.
    const s = shop(
      [{ ...inv('i-chips', 'Lays Salted', 20), barcode: '8964001' } as any],
      [menu('m-chips', 'Something Else', { barcode: '8964001' })],
    );
    consumeStockForOrder(order([{ menuItemId: 'm-chips', quantity: 3 }]), s.deps);
    expect(s.qty('i-chips')).toBe(17);
  });

  it('falls back to an exact name match', () => {
    const s = shop([inv('i-chips', 'Lays Salted', 20)], [menu('m-chips', 'lays salted')]);
    consumeStockForOrder(order([{ menuItemId: 'm-chips', quantity: 2 }]), s.deps);
    expect(s.qty('i-chips')).toBe(18);
  });

  it('leaves stock alone when nothing matches at all', () => {
    const s = shop([inv('i-chips', 'Lays Salted', 20)], [menu('m-other', 'Imported Biscuit')]);
    const res = consumeStockForOrder(order([{ menuItemId: 'm-other', quantity: 2 }]), s.deps);
    expect(s.qty('i-chips')).toBe(20);
    expect(res.changed).toBe(0);
  });
});

describe('a void puts it back', () => {
  it('restores exactly what was taken', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    const o = order([{ menuItemId: 'm-cola', quantity: 7 }]);

    consumeStockForOrder(o, s.deps);
    expect(s.qty('i-cola')).toBe(93);

    const n = reverseStockForOrder(o, s.deps);
    expect(n).toBe(1);
    expect(s.qty('i-cola')).toBe(100);
  });

  it('restores every component of a recipe', () => {
    const s = shop(
      [inv('i-flour', 'Flour', 5, 'kg'), inv('i-ghee', 'Ghee', 2, 'kg')],
      [menu('m-naan', 'Naan')],
      [{
        id: 'r1', menuItemId: 'm-naan',
        components: [
          { inventoryItemId: 'i-flour', quantity: 250, unit: 'g' },
          { inventoryItemId: 'i-ghee', quantity: 20, unit: 'g' },
        ],
      } as unknown as Recipe],
    );
    const o = order([{ menuItemId: 'm-naan', quantity: 4 }]);
    consumeStockForOrder(o, s.deps);
    reverseStockForOrder(o, s.deps);
    expect(s.qty('i-flour')).toBeCloseTo(5, 3);
    expect(s.qty('i-ghee')).toBeCloseTo(2, 3);
  });

  it('does nothing for an order whose stock never came off', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    expect(reverseStockForOrder(order([{ menuItemId: 'm-cola', quantity: 5 }], { status: 'void' }), s.deps)).toBe(0);
    expect(s.qty('i-cola')).toBe(100);
  });

  it('can be re-consumed after a reversal, and only once again', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    const o = order([{ menuItemId: 'm-cola', quantity: 5 }]);
    consumeStockForOrder(o, s.deps);
    reverseStockForOrder(o, s.deps);
    consumeStockForOrder(o, s.deps);
    consumeStockForOrder(o, s.deps);
    expect(s.qty('i-cola')).toBe(95);
  });
});

describe('the movement trail', () => {
  it('records what came off, so a discrepancy can be traced', () => {
    const s = shop([inv('i-cola', 'Cola', 100)], [menu('m-cola', 'Cola', { inventoryItemId: 'i-cola' })]);
    consumeStockForOrder(order([{ menuItemId: 'm-cola', quantity: 6 }]), s.deps);

    const moves = getStockMovements().filter(m => m.reason === 'sale');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ inventoryItemId: 'i-cola', qtyBefore: 100, qtyChange: -6, qtyAfter: 94 });
  });
});
