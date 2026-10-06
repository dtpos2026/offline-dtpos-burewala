// ============================================================
// TODAY'S SALES, per restaurant — from the device reports the panel already
// watches. Nothing else is fetched.
//
// Each POS computer adds its own sales for its current business day to the
// heartbeat it sends every five minutes while online (src/lib/todaySales.ts).
// Computers of one licence are one restaurant; each keeps its own bills, so
// their figures add up. A figure from a business day that has already ended is
// not "today" and is not shown as if it were.
// ============================================================
import type { DeviceDoc } from './deviceState';

export interface RestaurantSales {
  /** Licence key (or the device id for a computer without one). */
  key: string;
  name: string;
  /** Today's total over the computers that reported today. */
  total: number;
  bills: number;
  /** Computers that reported a figure for today / computers seen for this restaurant. */
  reporting: number;
  devices: number;
  /** The newest of today's reports (ms), 0 when none. */
  updatedAt: number;
}

/** True when this computer's figure is for the business day that is still running. */
export function reportsToday(d: Pick<DeviceDoc, 'salesToday' | 'salesDayEnd'>, now = Date.now()): boolean {
  return typeof d.salesToday === 'number' && Number.isFinite(d.salesToday)
    && typeof d.salesDayEnd === 'number' && now < d.salesDayEnd;
}

export function restaurantSales(
  devices: DeviceDoc[],
  names: Map<string, string> = new Map(),
  now = Date.now(),
): RestaurantSales[] {
  const byKey = new Map<string, RestaurantSales>();
  for (const d of devices) {
    const key = (d.licenseKey || '').trim() || d.deviceId;
    let r = byKey.get(key);
    if (!r) {
      r = { key, name: '', total: 0, bills: 0, reporting: 0, devices: 0, updatedAt: 0 };
      byKey.set(key, r);
    }
    r.devices++;
    if (!r.name) r.name = (names.get(key) || d.business || '').trim();
    if (!reportsToday(d, now)) continue;
    r.reporting++;
    r.total += d.salesToday as number;
    r.bills += Number(d.salesBills) || 0;
    r.updatedAt = Math.max(r.updatedAt, Number(d.lastSyncAt) || 0);
  }
  const list = Array.from(byKey.values()).map(r => ({
    ...r,
    name: r.name || 'Unnamed restaurant',
    total: Math.round(r.total * 100) / 100,
  }));
  // Restaurants with a figure first, biggest first; the rest by name.
  return list.sort((a, b) =>
    (b.reporting > 0 ? 1 : 0) - (a.reporting > 0 ? 1 : 0)
    || b.total - a.total
    || a.name.localeCompare(b.name));
}

/** "Rs. 125,000" — whole rupees unless there are paisa. */
export function formatSales(n: number): string {
  const v = Number(n) || 0;
  return `Rs. ${v.toLocaleString('en-PK', { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 })}`;
}
