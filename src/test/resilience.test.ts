// ============================================================
// WHAT HAPPENS WHEN THINGS GO WRONG, AND WHAT IT COSTS THE SHOP.
//
// Three faults this codebase was carrying quietly:
//
//   1. Hundreds of bare `catch {}` blocks, so a failure in the POS left no
//      trace at all. A support call could only ever start and end with "it
//      stopped working".
//   2. The whole database in ONE localStorage key, against a 5–10 MB quota.
//      Past that, every write threw into a console.error nobody reads, and a
//      cashier would carry on taking bills that were not being saved.
//   3. An order archive that merged every order a shop had ever taken into
//      another single key, forever, in the same budget.
//
// None of these show up in a demo. All of them show up in month six.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Order } from '@/lib/types';
import {
  reportFault, recentFaults, clearFaultsForTests, describeError,
} from '@/lib/faultLog';
import {
  exportMachineSetup, importMachineSetup, SETUP_KEYS, setupFileName, SETUP_FORMAT,
} from '@/lib/machineSetup';
import { capArchive, ARCHIVE_MAX } from '@/lib/orderArchive';

describe('a failure leaves a trace', () => {
  beforeEach(() => { clearFaultsForTests(); localStorage.clear(); });

  it('records what went wrong and where', () => {
    reportFault('pay: save order', new Error('disk full'));
    const [f] = recentFaults();
    expect(f.where).toBe('pay: save order');
    expect(f.detail).toBe('disk full');
    expect(f.level).toBe('ERROR');
  });

  it('reads a message out of anything that was thrown', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('plain string')).toBe('plain string');
    expect(describeError({ message: 'from an object' })).toBe('from an object');
    expect(describeError(null)).toBe('unknown error');
  });

  it('does not let one repeating fault fill the log', () => {
    // A failing printer retried every 600ms would otherwise write thousands
    // of identical lines and bury the one that matters.
    for (let i = 0; i < 50; i++) reportFault('print: spooler', new Error('printer offline'));
    expect(recentFaults()).toHaveLength(1);
  });

  it('still records a DIFFERENT fault from the same place', () => {
    reportFault('print: spooler', new Error('printer offline'));
    reportFault('print: spooler', new Error('out of paper'));
    expect(recentFaults()).toHaveLength(2);
  });

  it('never throws, whatever it is handed', () => {
    // It is called from inside catch blocks. A logger that can throw would
    // turn a handled failure into an unhandled one.
    const circular: any = {};
    circular.self = circular;
    expect(() => reportFault('weird', circular)).not.toThrow();
    expect(() => reportFault('weird', undefined)).not.toThrow();
  });

  it('keeps only the recent ones in memory', () => {
    for (let i = 0; i < 300; i++) reportFault(`place ${i}`, new Error(`e${i}`));
    expect(recentFaults().length).toBeLessThanOrEqual(100);
    // Newest first, so the screen shows what just happened.
    expect(recentFaults()[0].where).toBe('place 299');
  });
});

describe('this machine\'s setup survives the machine', () => {
  beforeEach(() => localStorage.clear());

  it('carries the numbers somebody found with a ruler', () => {
    localStorage.setItem('dtpos-print-margins', JSON.stringify({ left: 3, right: 5 }));
    localStorage.setItem('dtpos-printer-settings-v1', JSON.stringify({ printers: [{ id: 'p1' }] }));

    const doc = exportMachineSetup('Counter 1');
    expect(doc.format).toBe(SETUP_FORMAT);
    expect(doc.values['dtpos-print-margins']).toContain('"left":3');
    expect(doc.note).toBe('Counter 1');
  });

  it('restores them onto a replacement computer', () => {
    localStorage.setItem('dtpos-print-margins', JSON.stringify({ left: 3, right: 5 }));
    const doc = exportMachineSetup();

    localStorage.clear();                       // the new PC
    const res = importMachineSetup(doc);
    expect(res.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem('dtpos-print-margins')!)).toEqual({ left: 3, right: 5 });
  });

  it('carries the migration flags, so the new machine is not re-migrated', () => {
    // A safe-inset top-up running again over a shop's own calibration would
    // undo the very thing this file exists to preserve.
    localStorage.setItem('dtpos-print-margins', JSON.stringify({ left: 3, right: 5 }));
    localStorage.setItem('dtpos-printer-safe-inset-v1', '1');
    const doc = exportMachineSetup();
    localStorage.clear();
    importMachineSetup(doc);
    expect(localStorage.getItem('dtpos-printer-safe-inset-v1')).toBe('1');
  });

  it('carries no sales, customers or licence keys', () => {
    // A settings file you cannot safely hand to somebody is not a settings
    // file. Checked against the keys that actually hold shop data, rather
    // than by word — "dtpos-customer-display-v1" is the screen above the
    // counter, not anybody's customer records.
    const DATA_KEYS = [
      'desi-pos-data',              // the whole database
      'dt-pos-order-archive',       // sales history
      'dt_pos_current_user',        // who is logged in
      'pos-user-id',
      'dtpos-license',              // licence material
      'dtpos-print-queue', 'pos-print-queue',
    ];
    for (const { key } of SETUP_KEYS) {
      for (const data of DATA_KEYS) {
        expect(key.startsWith(data), `${key} is shop data, not machine setup`).toBe(false);
      }
    }
  });

  it('exports only keys it has declared', () => {
    // A prefix sweep would quietly start exporting whatever a future release
    // happens to store under the same naming — including something that
    // should not leave the machine. The list is the decision.
    localStorage.setItem('dtpos-something-new-and-private', 'secret');
    localStorage.setItem('dtpos-print-margins', '{"left":3}');
    const doc = exportMachineSetup();
    expect(Object.keys(doc.values)).toContain('dtpos-print-margins');
    expect(Object.keys(doc.values)).not.toContain('dtpos-something-new-and-private');
  });

  it('refuses a file that is not ours', () => {
    expect(importMachineSetup('{"format":"something-else"}').ok).toBe(false);
    expect(importMachineSetup('not json at all').ok).toBe(false);
  });

  it('refuses a file from a newer release rather than half-applying it', () => {
    const res = importMachineSetup({ format: SETUP_FORMAT, version: 99, values: {}, flags: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/newer version/i);
  });

  it('leaves a key it does not recognise alone, and says so', () => {
    const res = importMachineSetup({
      format: SETUP_FORMAT, version: 1,
      values: { 'dtpos-print-margins': '{"left":2}', 'some-future-setting': 'x' },
      flags: {},
    });
    expect(res.ok).toBe(true);
    expect(res.skipped).toContain('some-future-setting');
    expect(localStorage.getItem('some-future-setting')).toBeNull();
  });

  it('names the file so a shop recognises it a year later', () => {
    expect(setupFileName('Lotus Cafe & Restaurant')).toMatch(/^Lotus-Cafe-Restaurant-machine-setup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('the archive stops growing forever', () => {
  const order = (n: number, daysAgo: number): Order => ({
    id: `o${n}`, orderNumber: n, status: 'paid', items: [],
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  } as unknown as Order);

  it('keeps a generous history', () => {
    // A shop doing 150 bills a day keeps well over a year.
    expect(ARCHIVE_MAX).toBeGreaterThanOrEqual(20_000);
  });

  it('drops the OLDEST when the cap is passed, never the newest', () => {
    const orders = Array.from({ length: 30 }, (_, i) => order(i, 30 - i));
    const kept = capArchive(orders, 10);
    expect(kept).toHaveLength(10);
    // Newest ten: orders 20..29.
    expect(kept.map(o => o.orderNumber).sort((a, b) => a! - b!)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it('leaves a short archive completely alone', () => {
    const orders = Array.from({ length: 5 }, (_, i) => order(i, i));
    expect(capArchive(orders, 10)).toHaveLength(5);
  });
});

describe('running out of storage is visible, not silent', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); clearFaultsForTests(); });

  it('reports the fault instead of only a console line', async () => {
    const store = await import('@/lib/store');
    const faults = await import('@/lib/faultLog');
    faults.clearFaultsForTests();

    // Make every write fail the way a full quota does.
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      const e: any = new Error('exceeded the quota');
      e.name = 'QuotaExceededError';
      throw e;
    };
    try {
      store.saveOrder({
        id: 'quota-1', orderNumber: 1, status: 'paid', items: [],
        createdAt: new Date().toISOString(),
      } as unknown as Order);
      await new Promise(r => setTimeout(r, 20));
    } finally {
      Storage.prototype.setItem = real;
    }

    const reported = faults.recentFaults();
    expect(reported.some(f => /cache full/i.test(f.where)), 'a full cache was not reported').toBe(true);
    expect(store.isLocalCacheFull()).toBe(true);
  });
});
