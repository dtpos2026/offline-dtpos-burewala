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

export function archiveOrders(orders: Order[]) {
  if (!orders.length) return;
  try {
    const existing = getArchivedOrders();
    const byId = new Map<string, Order>();
    for (const o of existing) byId.set(o.id, o);
    for (const o of orders) byId.set(o.id, o);
    const merged = Array.from(byId.values());
    localStorage.setItem(key(), JSON.stringify(merged));
  } catch (e) {
    console.error('archiveOrders failed', e);
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
