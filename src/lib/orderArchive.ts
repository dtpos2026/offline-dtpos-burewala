// Persistent archive of orders that survives Day Close.
// Admin-only history for daily / weekly / monthly reporting.
import { Order } from './types';
import { getTenantId } from './tenant';

function key(): string {
  const tid = getTenantId() || 'local';
  return `dt-pos-order-archive::${tid}`;
}

export function getArchivedOrders(): Order[] {
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * How many orders the archive keeps.
 *
 * It used to keep every order a shop had ever taken, merged into ONE
 * localStorage key, forever. localStorage is roughly 5–10 MB and this sits
 * alongside the live database in the same budget, so a busy counter would
 * fill it in months and then every write — live sales included — would start
 * failing.
 *
 * 20,000 is deliberately generous: a shop doing 150 bills a day keeps well
 * over a year, which is more history than the reports screens ask for, while
 * staying inside a couple of megabytes. Beyond that the OLDEST orders drop
 * off, because a report from two years ago is not what anybody is looking at
 * and it is not worth risking today's sales to hold.
 *
 * Day Close already writes its own full backup, so nothing that drops off
 * here is the only copy.
 */
export const ARCHIVE_MAX = 20_000;

function whenOf(o: Order): number {
  const t = new Date((o as any).paidAt || (o as any).updatedAt || o.createdAt || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Keep the newest `ARCHIVE_MAX` orders, newest first.
 *
 * Exported so the cap is testable without touching storage — the whole point
 * of a cap is that somebody can prove it holds.
 */
export function capArchive(orders: Order[], max = ARCHIVE_MAX): Order[] {
  if (orders.length <= max) return orders;
  return [...orders].sort((a, b) => whenOf(b) - whenOf(a)).slice(0, max);
}

export function archiveOrders(orders: Order[]) {
  if (!orders.length) return;
  try {
    const existing = getArchivedOrders();
    const byId = new Map<string, Order>();
    for (const o of existing) byId.set(o.id, o);
    for (const o of orders) byId.set(o.id, o);
    const merged = capArchive(Array.from(byId.values()));
    try {
      localStorage.setItem(key(), JSON.stringify(merged));
    } catch (e: any) {
      // Still too big for what is left of the quota. Halve it and try once
      // more rather than losing the whole archive to a failed write — a
      // shorter history beats no history, and beats a throw on the Day Close
      // path where this runs.
      const half = capArchive(merged, Math.floor(ARCHIVE_MAX / 2));
      try {
        localStorage.setItem(key(), JSON.stringify(half));
      } catch {
        void import('./faultLog')
          .then(m => m.reportFault('archive: could not save', e))
          .catch(() => {});
        return;
      }
      void import('./faultLog')
        .then(m => m.reportFault(
          'archive: trimmed to fit',
          `Storage was full, so the order archive was cut to ${half.length} orders. Day Close backups still hold the rest.`,
          'WARN',
        ))
        .catch(() => {});
    }
  } catch (e) {
    void import('./faultLog').then(m => m.reportFault('archive: save failed', e)).catch(() => {});
  }
}

export function clearArchivedOrders() {
  try { localStorage.removeItem(key()); } catch {}
}

/** Merge live + archived, dedup by id (live wins). */
export function getAllHistoricalOrders(liveOrders: Order[]): Order[] {
  const byId = new Map<string, Order>();
  for (const o of getArchivedOrders()) byId.set(o.id, o);
  for (const o of liveOrders) byId.set(o.id, o);
  return Array.from(byId.values());
}
