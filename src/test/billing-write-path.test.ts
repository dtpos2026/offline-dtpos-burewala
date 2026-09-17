// ============================================================
// BILLING WRITE PATH — v1.0.40 regression locks
//
// Two client-visible problems are pinned here:
//   1. "Pay freezes the window" — saving one bill used to serialise the whole
//      database once per mutated row (order, table, every inventory row,
//      customer profile), a dozen times per click.
//   2. Inventory going down several units per sale — three independent stock
//      deduction paths ran for the same paid order.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Order } from '@/lib/types';

const STORE_KEY = 'desi-pos-data';

/** A shop with a linked menu -> inventory, plus some sales history. */
function seedShop(historyBills = 200) {
  const names = ['Chicken Karahi', 'Seekh Kabab', 'Chicken Tikka', 'Biryani', 'Malai Boti', 'Handi'];
  const db: Record<string, unknown> & { orders: unknown[] } = {
    categories: [{ id: 'c1', name: 'Main', sortOrder: 1 }],
    inventory: names.map((n, i) => ({
      id: 'inv' + i, name: n, quantity: 500, baseUnit: 'pcs', unit: 'pcs', minQuantity: 5,
    })),
    menuItems: names.map((n, i) => ({
      id: 'm' + i, name: n, price: 300 + i * 50, categoryId: 'c1',
      isActive: true, isAvailable: true, inventoryItemId: 'inv' + i,
    })),
    orders: [], stockLogs: [], customers: [], recipes: [], tables: [], users: [],
    settings: { name: 'Test Shop' },
    orderCounter: historyBills,
  };
  for (let i = 0; i < historyBills; i++) {
    db.orders.push({
      id: 'o' + i, orderNumber: i + 1, orderType: 'takeaway', status: 'paid',
      items: [{ id: 'l' + i, menuItemId: 'm0', name: names[0], price: 300, quantity: 2, lineTotal: 600 }],
      subtotal: 600, discount: 0, tax: 0, serviceCharge: 0, grandTotal: 600,
      createdAt: new Date().toISOString(), stockConsumed: true,
    });
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function paidOrder(lines: number): Order {
  const items = Array.from({ length: lines }, (_, i) => ({
    id: 'line' + i, menuItemId: 'm' + i, name: 'Item ' + i,
    price: 300, quantity: 2, lineTotal: 600,
  }));
  return {
    id: 'new-bill-1', orderNumber: 9001, orderType: 'takeaway', status: 'paid',
    items, subtotal: 600 * lines, discount: 0, tax: 0, serviceCharge: 0,
    grandTotal: 600 * lines, createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(), paymentMethod: 'cash',
    customer: { id: 'cust1', name: 'Walk-in', phone: '03001234567' },
  } as unknown as Order;
}

describe('saving a paid bill', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('serialises the database at most twice, however many lines the bill has', async () => {
    seedShop(200);
    const store = await import('@/lib/store');
    const spy = vi.spyOn(Storage.prototype, 'setItem');

    store.saveOrder(paidOrder(6));
    // let the coalescing microtask run
    await Promise.resolve();
    await new Promise(r => setTimeout(r, 0));

    const dbWrites = spy.mock.calls.filter(c => c[0] === STORE_KEY).length;
    expect(dbWrites).toBeGreaterThan(0);          // it really did persist
    expect(dbWrites).toBeLessThanOrEqual(2);      // was ~12 before v1.0.40
    spy.mockRestore();
  });

  it('deducts each linked inventory item exactly once', async () => {
    seedShop(20);
    const store = await import('@/lib/store');
    const before = store.getInventory().map(i => ({ id: i.id, qty: i.quantity }));

    store.saveOrder(paidOrder(3));
    await new Promise(r => setTimeout(r, 0));

    const after = store.getInventory();
    for (const b of before) {
      const a = after.find(i => i.id === b.id)!;
      const sold = ['inv0', 'inv1', 'inv2'].includes(b.id) ? 2 : 0;   // qty 2 per line
      expect(`${b.id}: ${a.quantity}`).toBe(`${b.id}: ${b.qty - sold}`);
    }
  });

  it('never deducts twice when the same paid bill is saved again', async () => {
    seedShop(20);
    const store = await import('@/lib/store');
    const order = paidOrder(2);

    store.saveOrder(order);
    await new Promise(r => setTimeout(r, 0));
    const afterFirst = store.getInventory().find(i => i.id === 'inv0')!.quantity;

    // reprint / edit / status touch — all funnel back through saveOrder
    store.saveOrder(store.getOrders().find(o => o.id === order.id)!);
    await new Promise(r => setTimeout(r, 0));

    expect(store.getInventory().find(i => i.id === 'inv0')!.quantity).toBe(afterFirst);
  });

  it('records the sale in the stock log so Inventory still shows it', async () => {
    seedShop(10);
    const store = await import('@/lib/store');
    store.saveOrder(paidOrder(3));
    await new Promise(r => setTimeout(r, 0));

    const sales = store.getStockLogs().filter(l => l.type === 'sale');
    expect(sales.length).toBe(3);
    expect(sales[0].note).toContain('#9001');
  });

  it('persists the bill immediately rather than on a timer', async () => {
    seedShop(10);
    const store = await import('@/lib/store');
    store.saveOrder(paidOrder(2));

    // no awaiting, no timers: a crash right here must not lose the bill
    const persisted = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    expect((persisted.orders || []).some((o: { id: string }) => o.id === 'new-bill-1')).toBe(true);
  });
});
