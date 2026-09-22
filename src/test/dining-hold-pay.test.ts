// ============================================================
// DINING — Premium Phase 1, "Dining test".
//
//   bill generated → HOLD → shows HOLD — UNPAID (still an open bill)
//   → PAY → PAID, persisted
//   → with "Print Receipt Automatically on Dining Payment" ON  → one receipt
//   → with it OFF                                               → no print
//   → a failing printer never un-pays the bill or pays it twice
//   → a reprint never creates a sale, a payment or a new ID
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Order } from '@/lib/types';
import { billStatus, receiptOnPay, paidMessage } from '@/lib/billStatus';

const STORE_KEY = 'desi-pos-data';

function seed(orders: Order[], settings: Record<string, unknown> = {}) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders, menuItems: [], inventory: [], stockLogs: [], customers: [],
    recipes: [], tables: [], users: [], categories: [],
    settings: { name: 'Test', kotEnabled: true, ...settings }, orderCounter: orders.length,
  }));
}

function diningBill(id = 'd1', n = 201): Order {
  return {
    id, orderNumber: n, orderType: 'dining', status: 'running', tableId: 't1', tableName: 'T-1',
    items: [{ id: 'l1', menuItemId: 'm1', name: 'Chicken Karahi', price: 1800, quantity: 1, lineTotal: 1800 }],
    subtotal: 1800, discount: 0, tax: 0, serviceCharge: 0, serviceChargePercent: 0, grandTotal: 1800,
    createdAt: new Date().toISOString(), notes: '',
  } as unknown as Order;
}

/** What the POS pay path does: save the bill as paid FIRST, then print. */
async function pay(order: Order) {
  const store = await import('@/lib/store');
  const q = await import('@/lib/printQueue');
  const stamp = new Date().toISOString();
  const paid: Order = {
    ...order, status: 'paid', paidAt: stamp, paymentMethod: 'cash', amountPaid: order.grandTotal, cashReceived: order.grandTotal,
    payments: [{ id: 'p1', method: 'cash', amount: order.grandTotal, at: stamp, by: 'cashier' }],
  } as Order;
  store.saveOrder(paid);
  return { paid, printed: q.printReceiptAfterPayment(paid), store, q };
}

describe('bill status model', () => {
  it('Unpaid, Hold, Paid and Cancelled are four different things', () => {
    const labels = (['running', 'hold', 'paid', 'cancelled'] as const).map(status => billStatus({ status, grandTotal: 100 } as Order).label);
    expect(labels).toEqual(['UNPAID', 'HOLD — UNPAID', 'PAID', 'CANCELLED']);
    expect(new Set(labels).size).toBe(4);
  });
  it('a held bill is still awaiting payment; a cancelled one is not', () => {
    expect(billStatus({ status: 'hold' } as Order).awaitingPayment).toBe(true);
    expect(billStatus({ status: 'cancelled' } as Order).awaitingPayment).toBe(false);
  });
  it('HOLD — UNPAID uses the warning (orange) tone', () => {
    expect(billStatus({ status: 'hold' } as Order).className).toMatch(/status-warning/);
  });
  it('a running bill with money received reads as partially paid', () => {
    expect(billStatus({ status: 'running', amountPaid: 500, grandTotal: 1800 } as Order).label).toBe('PARTIALLY PAID');
  });
});

describe('Dining: Hold → Pay', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('a held bill stays in the open list and becomes PAID when paid', async () => {
    seed([diningBill()]);
    const store = await import('@/lib/store');
    store.saveOrder({ ...store.getOrders()[0], status: 'hold' });

    const open = store.getOrders().filter(o => ['running', 'hold', 'partial'].includes(o.status));
    expect(open.map(o => o.id)).toEqual(['d1']);
    expect(billStatus(open[0]).label).toBe('HOLD — UNPAID');

    await pay(open[0]);
    vi.resetModules(); // "restart"
    const after = (await import('@/lib/store')).getOrders();
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('paid');
    expect(after[0].amountPaid).toBe(1800);
    expect(billStatus(after[0]).label).toBe('PAID');
  });

  it('auto-print ON (default): exactly one receipt is queued', async () => {
    seed([diningBill()]);
    const { printed, q } = await pay(diningBill());
    expect(printed).toEqual({ decision: 'print', queued: true });
    expect(q.getPrintQueue().filter(j => j.printType === 'receipt')).toHaveLength(1);
    expect(paidMessage(201, printed.decision, printed.queued)).toBe('Bill #201 paid — receipt sent to the printer');
  });

  it('auto-print OFF: the bill is PAID and nothing is printed', async () => {
    seed([diningBill()], { diningReceiptOnPay: false });
    const { printed, q, store } = await pay(diningBill());
    expect(printed.decision).toBe('skip-dining');
    expect(printed.queued).toBe(false);
    expect(q.getPrintQueue().filter(j => j.printType === 'receipt')).toHaveLength(0);
    expect(store.getOrders()[0].status).toBe('paid');
  });

  it('auto-print OFF applies to dining only — takeaway still prints', async () => {
    const takeaway = { ...diningBill('t1', 202), orderType: 'takeaway' } as Order;
    seed([takeaway], { diningReceiptOnPay: false });
    const { printed } = await pay(takeaway);
    expect(printed).toEqual({ decision: 'print', queued: true });
  });

  it('a manual reprint still works after an OFF payment', async () => {
    seed([diningBill()], { diningReceiptOnPay: false });
    const { paid, q } = await pay(diningBill());
    expect(q.enqueueReceipt(paid, { force: true })).toBeTruthy();
  });
});

describe('Payment never depends on printing', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('a printer that fails every retry leaves the bill PAID, once', async () => {
    seed([diningBill()]);
    const { paid, q, store } = await pay(diningBill());
    const job = q.getPrintQueue().find(j => j.printType === 'receipt')!;
    q.markFailed(job.id, 'printer offline');
    q.markFailed(job.id, 'printer offline');
    q.markFailed(job.id, 'printer offline');

    const orders = store.getOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(paid.id);
    expect(orders[0].status).toBe('paid');
    expect(orders[0].payments).toHaveLength(1);
    expect(orders[0].amountPaid).toBe(1800);
  });

  it('a print queue that throws cannot throw into the pay path', async () => {
    seed([diningBill()]);
    const q = await import('@/lib/printQueue');
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string) => {
      if (k === 'pos-print-queue') throw new Error('quota exceeded');
    });
    expect(() => q.printReceiptAfterPayment({ ...diningBill(), status: 'paid' } as Order)).not.toThrow();
    spy.mockRestore();
  });

  it('the message never claims printing that did not happen', () => {
    expect(paidMessage(7, 'print', false)).not.toMatch(/sent to the printer/);
    expect(paidMessage(7, 'skip-all', false)).toBe('Bill #7 paid');
  });
});

describe('Reprint', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('prints the existing bill: no new sale, payment or ID', async () => {
    const paidBill = { ...diningBill(), status: 'paid', amountPaid: 1800, paidAt: new Date().toISOString(),
      payments: [{ id: 'p1', method: 'cash', amount: 1800, at: new Date().toISOString(), by: 'x' }] } as Order;
    seed([paidBill]);
    const q = await import('@/lib/printQueue');
    const store = await import('@/lib/store');
    const before = JSON.stringify(store.getOrders().map(o => [o.id, o.orderNumber, o.status, o.amountPaid, o.payments?.length]));

    const job1 = q.enqueueReceipt(paidBill, { force: true });
    expect(job1).toBeTruthy();
    q.markPrinted(job1!.id);
    // A second press within seconds is a double click, not a second copy.
    expect(q.enqueueReceipt(paidBill, { force: true })).toBeFalsy();
    // Later on, a reprint is allowed again — still the same bill.
    const later = Date.now() + 60_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(later);
    const job2 = q.enqueueReceipt(paidBill, { force: true });
    now.mockRestore();
    expect(job2?.orderId).toBe(paidBill.id);

    const after = JSON.stringify(store.getOrders().map(o => [o.id, o.orderNumber, o.status, o.amountPaid, o.payments?.length]));
    expect(after).toBe(before);
    expect(store.getOrders()).toHaveLength(1);
  });
});

describe('receipt-on-pay decision', () => {
  it('global "no receipt" wins over the dining switch', () => {
    expect(receiptOnPay({ orderType: 'dining' }, { noReceiptOnPay: true, diningReceiptOnPay: true })).toBe('skip-all');
    expect(receiptOnPay({ orderType: 'dining' }, {})).toBe('print');
    expect(receiptOnPay({ orderType: 'dining' }, { diningReceiptOnPay: false })).toBe('skip-dining');
    expect(receiptOnPay({ orderType: 'delivery' }, { diningReceiptOnPay: false })).toBe('print');
  });
});
