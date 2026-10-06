// ============================================================
// TODAY'S SALES — the one figure the Super Admin sees for each restaurant.
//
// The POS works it out from its own bills and hands it to the heartbeat it
// already sends every five minutes while online (lib/cloudLink.ts). No new
// request, no bill, item or customer detail: one total, how many bills, which
// business day it is, and when that day ends, so the panel can tell a figure
// for today from one left over from yesterday.
//
// The same rule as the dashboard's "Today" strip: paid sales (credit, void and
// cancelled bills are not sales) inside the current business day.
// ============================================================
import type { Order } from './types';
import { getCurrentBusinessDay, isInBusinessDay, type BusinessDayWindow } from './businessDay';
import { isPaidSale } from './sales';

export interface TodaySales {
  /** Business-day label, YYYY-MM-DD of the day's start. */
  day: string;
  /** Total of the paid bills, rounded to the paisa. */
  total: number;
  /** How many paid bills. */
  bills: number;
  /** When this business day ends (ms): after it, the figure is no longer "today". */
  dayEnd: number;
}

export function todaySales(orders: Order[], win: BusinessDayWindow = getCurrentBusinessDay()): TodaySales {
  let total = 0;
  let bills = 0;
  for (const o of orders) {
    if (!isPaidSale(o) || !isInBusinessDay(o.paidAt || o.createdAt, win)) continue;
    total += Number(o.grandTotal) || 0;
    bills++;
  }
  return { day: win.label, total: Math.round(total * 100) / 100, bills, dayEnd: win.endMs };
}

