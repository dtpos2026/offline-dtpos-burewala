// ============================================================
// BILL -> PRINT -> SETTLEMENT, walked end to end.
//
// Each stage of this chain has its own tests. What none of them covered is
// the chain: the bill is taken, the KOT reaches the kitchen, the receipt
// reaches the counter printer with the right geometry, the money lands in the
// day's takings, and the shift report adds up to the same figure.
//
// That gap is where the two worst faults of this release lived. Both were
// invisible to every unit test and obvious at the counter:
//
//   • the print queue resolved its printer from the SHOP settings, which no
//     screen wrote, so every bill queued as Pending with a working printer
//     plugged in;
//   • the raw builders read one shop-level margin and ignored the printer's
//     own, so the same bill moved through the driver and not through raw.
//
// This file walks the whole thing with the real modules and no mocks beyond
// the Windows bridge, which does not exist in a test runner.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Order } from '@/lib/types';

const STORE_KEY = 'desi-pos-data';
const PRINTERS_KEY = 'dtpos-printer-settings-v1';

function seedShop() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    categories: [{ id: 'c1', name: 'Main', sortOrder: 1 }],
    menuItems: [
      { id: 'm1', name: 'Zinger Burger', price: 500, categoryId: 'c1', isActive: true, isAvailable: true },
      { id: 'm2', name: 'Cold Drink', price: 100, categoryId: 'c1', isActive: true, isAvailable: true },
    ],
    orders: [], stockLogs: [], customers: [], recipes: [], tables: [], users: [], inventory: [],
    settings: {
      name: 'FIRST CHEF', currencySymbol: 'Rs ',
      defaultPrinter: 'POS-80', kotPrinter: 'KITCHEN-80',
      autoKotOnSave: true,
    },
    orderCounter: 0,
  }));
}

/** A counter printer calibrated by hand, and a kitchen printer on 58mm. */
function seedPrinters() {
  localStorage.setItem(PRINTERS_KEY, JSON.stringify({
    printers: [
      {
        id: 'p-counter', name: 'Counter', connection: 'system', printerName: 'POS-80',
        role: 'counter', paperSize: '80mm', printMode: 'raw',
        leftMarginMm: 3, rightMarginMm: 5, topFeedMm: 0, bottomFeedMm: 0,
        autoCut: true, beep: false, copies: 1, escposMode: false,
        browserBackup: true, enabled: true,
      },
      {
        id: 'p-kitchen', name: 'Kitchen', connection: 'system', printerName: 'KITCHEN-80',
        role: 'kitchen', paperSize: '58mm', printMode: 'raw',
        leftMarginMm: 1.5, rightMarginMm: 1.5, topFeedMm: 0, bottomFeedMm: 0,
        autoCut: false, beep: true, copies: 1, escposMode: false,
        browserBackup: true, enabled: true,
      },
    ],
    deviceAssignments: {},
  }));
  // The margin passes have already run on this machine; leave the seed alone.
  localStorage.setItem('dtpos-printer-margins-equalised-v1', '1');
  localStorage.setItem('dtpos-printer-safe-inset-v1', '1');
  localStorage.setItem('dtpos-printer-escpos-folded-v1', '1');
}

function bill(n: number, lines: Array<[string, number, number]>): Order {
  const items = lines.map(([name, price, qty], i) => ({
    id: `l${n}-${i}`, menuItemId: `m${i + 1}`, name, price, quantity: qty, lineTotal: price * qty,
  }));
  const total = items.reduce((a, i) => a + i.lineTotal, 0);
  return {
    id: `bill-${n}`, orderNumber: n, orderType: 'takeaway', status: 'paid',
    items, subtotal: total, discount: 0, tax: 0, serviceCharge: 0, grandTotal: total,
    createdAt: new Date().toISOString(), paidAt: new Date().toISOString(),
    paymentMethod: 'cash', kitchenStatus: 'pending',
  } as unknown as Order;
}

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  seedShop();
  seedPrinters();
});

describe('a bill taken at the counter', () => {
  it('is saved, queued for both printers, and lands in the day\'s orders', async () => {
    const store = await import('@/lib/store');
    const queue = await import('@/lib/printQueue');

    const order = bill(1, [['Zinger Burger', 500, 2], ['Cold Drink', 100, 1]]);
    store.saveOrder(order);

    expect(store.getOrders().find(o => o.id === 'bill-1')?.grandTotal).toBe(1100);

    const receipt = queue.enqueueReceipt(order);
    const kot = queue.enqueueKot(order);
    expect(receipt, 'the receipt was never queued').toBeTruthy();
    expect(kot, 'the KOT was never queued').toBeTruthy();

    // THE PENDING-BILL FAULT: the queue resolves its target from the SHOP
    // settings, not from Printer Center. A job with no printerId is a job
    // that cannot print, and that is what filled the Pending list.
    expect(receipt!.printerId, 'the receipt job has no printer to go to').toBe('POS-80');
    expect(kot!.printerId, 'the KOT job has no printer to go to').toBe('KITCHEN-80');
  });

  it('does not queue the same receipt twice for one payment', async () => {
    const queue = await import('@/lib/printQueue');
    const order = bill(2, [['Zinger Burger', 500, 1]]);
    expect(queue.enqueueReceipt(order)).toBeTruthy();
    expect(queue.enqueueReceipt(order), 'a second identical receipt was queued').toBeNull();
  });

  it('clears from the queue once it has printed', async () => {
    const queue = await import('@/lib/printQueue');
    const order = bill(3, [['Zinger Burger', 500, 1]]);
    const job = queue.enqueueReceipt(order)!;
    queue.markPrinting(job.id);
    queue.markPrinted(job.id);
    expect(queue.getProcessableJobs().some(j => j.id === job.id)).toBe(false);
  });

  it('keeps a failed job retryable rather than losing the bill', async () => {
    const queue = await import('@/lib/printQueue');
    const order = bill(4, [['Zinger Burger', 500, 1]]);
    const job = queue.enqueueReceipt(order)!;
    queue.markFailed(job.id, 'printer offline');
    expect(queue.getProcessableJobs().some(j => j.id === job.id)).toBe(true);
  });
});

describe('what actually reaches each printer', () => {
  it('builds the counter slip with the counter printer\'s own margins', async () => {
    const { prewarmDirectPrint, slipGeometryFor } = await import('@/printing/directPrint');
    prewarmDirectPrint();
    await new Promise(r => setTimeout(r, 10));

    const geom = slipGeometryFor('receipt');
    // The hand-calibrated pair, reaching the raw path at last.
    expect(geom.leftMm).toBe(3);
    expect(geom.rightMm).toBe(5);
    expect(geom.paper).toBe('80mm');
    expect(geom.autoCut).toBe(true);
    expect(geom.beep).toBe(false);
  });

  it('builds the kitchen ticket on the kitchen printer\'s paper, not the shop\'s', async () => {
    const { prewarmDirectPrint, slipGeometryFor } = await import('@/printing/directPrint');
    prewarmDirectPrint();
    await new Promise(r => setTimeout(r, 10));

    const geom = slipGeometryFor('kot');
    expect(geom.paper).toBe('58mm');
    expect(geom.autoCut).toBe(false);
    expect(geom.beep).toBe(true);
  });

  it('turns that geometry into the bytes the printer receives', async () => {
    const { buildReceiptBytes, buildKotBytes } = await import('@/printing/escposBuilder');
    const store = await import('@/lib/store');
    const settings = store.getSettings();
    const order = bill(5, [['Zinger Burger', 500, 2]]);

    const receipt = buildReceiptBytes(order, settings, { paper: '80mm', leftMm: 3, rightMm: 5, autoCut: true });
    const gsL = receipt.findIndex((b, i) => b === 0x1d && receipt[i + 1] === 0x4c);
    expect(receipt[gsL + 2] | (receipt[gsL + 3] << 8), 'GS L is not the 3mm the shop set').toBe(24);
    expect(receipt.some((b, i) => b === 0x1d && receipt[i + 1] === 0x56), 'no cut').toBe(true);

    const kot = buildKotBytes(order, settings, {}, { paper: '58mm', leftMm: 1.5, rightMm: 1.5, autoCut: false, beep: true });
    const gsW = kot.findIndex((b, i) => b === 0x1d && kot[i + 1] === 0x57);
    // 58mm head = 384 dots, less 1.5mm (12 dots) a side.
    expect(kot[gsW + 2] | (kot[gsW + 3] << 8)).toBe(384 - 24);
    expect(kot.some((b, i) => b === 0x1d && kot[i + 1] === 0x56), 'cut on a printer set not to').toBe(false);
    expect(Buffer.from(kot).toString('latin1')).toContain('FIRST CHEF');
  });
});

describe('settlement', () => {
  it('counts every paid bill of the session exactly once', async () => {
    const store = await import('@/lib/store');
    const bills = [
      bill(11, [['Zinger Burger', 500, 2]]),        // 1000
      bill(12, [['Cold Drink', 100, 3]]),           // 300
      bill(13, [['Zinger Burger', 500, 1], ['Cold Drink', 100, 2]]), // 700
    ];
    for (const b of bills) store.saveOrder(b);

    const paid = store.getOrders().filter(o => o.status === 'paid');
    expect(paid).toHaveLength(3);
    expect(paid.reduce((a, o) => a + (o.grandTotal || 0), 0)).toBe(2000);
  });

  it('leaves a voided bill out of the takings', async () => {
    const store = await import('@/lib/store');
    store.saveOrder(bill(21, [['Zinger Burger', 500, 2]]));
    store.saveOrder({ ...bill(22, [['Cold Drink', 100, 1]]), status: 'void' } as Order);

    const takings = store.getOrders()
      .filter(o => o.status === 'paid')
      .reduce((a, o) => a + (o.grandTotal || 0), 0);
    expect(takings).toBe(1000);
  });

  it('prints a shift report whose total matches the orders it was built from', async () => {
    const store = await import('@/lib/store');
    const { buildShiftReportBytes } = await import('@/printing/escposBuilder');
    for (const b of [bill(31, [['Zinger Burger', 500, 2]]), bill(32, [['Cold Drink', 100, 3]])]) {
      store.saveOrder(b);
    }
    const paid = store.getOrders().filter(o => o.status === 'paid');
    const actualSales = paid.reduce((a, o) => a + (o.grandTotal || 0), 0);

    const bytes = buildShiftReportBytes(
      {
        summary: { actualSales, subTotal: actualSales, productAmount: actualSales, discount: 0, serviceCharge: 0, rounding: 0, refundAmount: 0 },
        transactions: { checkedOut: paid.length },
        totals: { catQty: 5, catAmt: actualSales },
      },
      store.getSettings(),
      { paper: '80mm', leftMm: 3, rightMm: 5 },
    );

    const text = Buffer.from(bytes).toString('latin1');
    expect(text).toContain('SHIFT REPORT');
    // The figure the orders add up to, however the shop's currency is formatted.
    expect(text.replace(/,/g, '')).toContain(String(actualSales));
    expect(actualSales).toBe(1300);
    // And it is positioned by the same margins as the bills it summarises.
    const gsL = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x4c);
    expect(bytes[gsL + 2] | (bytes[gsL + 3] << 8)).toBe(24);
  });
});
