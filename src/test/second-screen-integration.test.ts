// ============================================================
// THE SECOND SCREEN — does anything that happens in the POS reach it?
//
// The Kitchen Display and the Customer Display are separate Electron windows
// running the same code as the POS. They only read. That is what made the
// fault invisible in every unit test and obvious on the shop floor:
//
//   `loadData()` returns an in-memory cache, filled once from localStorage and
//   then reused. In the POS window every mutation replaces it. In a read-only
//   window NOTHING ever replaced it, so the five-second poll returned the same
//   snapshot forever — a customer's number never moved to READY, a new ticket
//   never reached the kitchen board, and both screens showed whatever was on
//   them when the shop opened them.
//
// A `storage` event is what a browser gives every OTHER window when one of
// them writes, and never to the window that wrote. These tests pin that it is
// listened to, that it invalidates, and that it cannot throw away a mutation
// this window has not flushed yet.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const STORAGE_KEY = 'desi-pos-data';

async function freshStore() {
  vi.resetModules();
  const store = await import('@/lib/store');
  // First read seeds and schedules a write. Let that land, so what follows
  // models a display window sitting idle rather than one mid-mutation.
  store.getOrders();
  await new Promise(r => setTimeout(r, 0));
  return store;
}

/** What another window writing looks like from in here. */
function remoteWrite(patch: (data: any) => void) {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : {};
  patch(data);
  const json = JSON.stringify(data);
  // setItem inside the SAME window does not fire `storage`, so the event is
  // dispatched explicitly — which is exactly what the browser does for us in
  // the real two-window case.
  localStorage.setItem(STORAGE_KEY, json);
  window.dispatchEvent(new StorageEvent('storage', {
    key: STORAGE_KEY, newValue: json, storageArea: localStorage,
  }));
}

describe('a read-only window sees what the POS window writes', () => {
  beforeEach(() => { localStorage.clear(); });

  it('picks up an order the POS window added', async () => {
    const store = await freshStore();
    const before = store.getOrders().length;

    remoteWrite(data => {
      data.orders = [...(data.orders || []), {
        id: 'remote-1', orderNumber: 77, status: 'running',
        kitchenStatus: 'preparing', items: [], createdAt: new Date().toISOString(),
      }];
    });

    const after = store.getOrders();
    expect(after.length).toBe(before + 1);
    expect(after.some(o => o.id === 'remote-1')).toBe(true);
  });

  it('picks up a status change, which is how a number reaches READY', async () => {
    const store = await freshStore();
    remoteWrite(data => {
      data.orders = [{
        id: 'remote-2', orderNumber: 78, status: 'running',
        kitchenStatus: 'preparing', items: [], createdAt: new Date().toISOString(),
      }];
    });
    expect(store.getOrders().find(o => o.id === 'remote-2')?.kitchenStatus).toBe('preparing');

    remoteWrite(data => { data.orders[0].kitchenStatus = 'ready'; });
    expect(store.getOrders().find(o => o.id === 'remote-2')?.kitchenStatus).toBe('ready');
  });

  it('tells its subscribers, so the screen does not wait for the next poll', async () => {
    const store = await freshStore();
    const seen: string[] = [];
    const unsub = store.onDataChange(c => seen.push(c));

    remoteWrite(data => { data.orders = [{ id: 'r3', orderNumber: 79, items: [], createdAt: new Date().toISOString() }]; });
    // The announcement is coalesced so a burst of remote writes is one event.
    await new Promise(r => setTimeout(r, 220));
    unsub();

    expect(seen.length).toBeGreaterThan(0);
  });

  it('ignores a write that is not this app\'s data', async () => {
    const store = await freshStore();
    remoteWrite(data => { data.orders = [{ id: 'keep', orderNumber: 1, items: [], createdAt: new Date().toISOString() }]; });
    expect(store.getOrders().some(o => o.id === 'keep')).toBe(true);

    // Another module's key changing must not disturb the store.
    localStorage.setItem('dtpos-print-margins', '{"left":2}');
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'dtpos-print-margins', newValue: '{"left":2}', storageArea: localStorage,
    }));
    expect(store.getOrders().some(o => o.id === 'keep')).toBe(true);
  });
});

describe('the read-only screens are genuinely read-only', () => {
  it('the customer display never writes an order', () => {
    // It is a display. Every status on it comes from the kitchen; a screen
    // that could change an order would be a second, unaudited till.
    const page = read('pages/CustomerDisplayPage.tsx');
    expect(/setOrderKitchenStatus|saveOrder|updateOrder|addOrder/.test(page)).toBe(false);
  });

  it('the kitchen board changes only the kitchen status', () => {
    const page = read('pages/KdsTvPage.tsx');
    expect(page).toContain('setOrderKitchenStatus');
    expect(/saveOrder|deleteOrder|voidOrder/.test(page)).toBe(false);
  });
});


describe('invalidating the cache does not cost this window its own writes', () => {
  beforeEach(() => { localStorage.clear(); });

  it('keeps a bill this window saved when a remote write arrives after it', () => {
    // The realistic sequence: this window saves, the other window re-reads
    // (its own storage event told it to) and writes on top. Both survive,
    // because invalidating only discards the CACHE — the data is on disk.
    return freshStore().then(store => {
      store.saveOrder({
        id: 'local-1', orderNumber: 90, status: 'paid', items: [],
        createdAt: new Date().toISOString(),
      } as any);

      remoteWrite(data => {
        data.orders = [...(data.orders || []), {
          id: 'remote-only', orderNumber: 91, items: [], createdAt: new Date().toISOString(),
        }];
      });

      const ids = store.getOrders().map(o => o.id);
      expect(ids, 'the bill this window counted was lost').toContain('local-1');
      expect(ids, 'the remote order never arrived').toContain('remote-only');
    });
  });

  it('flushes an unwritten mutation before it drops the cache', () => {
    // A mutation still in memory would go with the cache. The handler flushes
    // first for that reason, which the source has to keep doing.
    const src = read('lib/store.ts');
    const handler = src.slice(src.indexOf("addEventListener('storage'"));
    const flushAt = handler.indexOf('flushPendingWrite');
    const clearAt = handler.indexOf('cachedData = null');
    expect(flushAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(-1);
    expect(flushAt, 'the cache is dropped before the pending write is flushed').toBeLessThan(clearAt);
  });
});
