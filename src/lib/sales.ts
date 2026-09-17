/**
 * Sales classification helpers — single source of truth for reports/dashboards.
 * Credit / Void / Complimentary / Cancelled orders are NEVER counted as paid sales.
 * Partial orders count for the amount actually received (paidRevenue).
 */
import { Order } from './types';
import { getSettings, getMenuItems } from './store';
import { tokenLinesAmount } from './tokenRules';

/** Amount of tandoor token items that should NOT be included in the sale count
 *  (tokenCountsInSales === false). Otherwise 0. */
export function tokenExcludedAmount(o: Order): number {
  try {
    const st: any = getSettings();
    if (!st.tokenPrintEnabled || st.tokenCountsInSales !== false) return 0;
    // Both rule kinds count: a line excluded from the sale because it is a
    // token item must be the same set of lines that got a token printed.
    return tokenLinesAmount(o, st, getMenuItems());
  } catch { return 0; }
}

/** Order whose money has actually been (fully) collected (cash/card/online). */
export function isPaidSale(o: Order): boolean {
  if (!o) return false;
  if (o.status !== 'paid') return false;
  if (o.paymentMethod === 'credit') return false; // credit orders are pending until received
  return true;
}

/** Bill for which some amount has been received, with the rest still pending. */
export function isPartialSale(o: Order): boolean {
  if (!o) return false;
  if (o.status === 'partial') return true;
  // legacy safety: amountPaid set but status still running/hold
  const paid = Number(o.amountPaid || 0);
  return paid > 0 && paid < Number(o.grandTotal || 0)
    && (o.status === 'running' || o.status === 'hold');
}

/** Amount actually received against this order (for revenue counting). */
export function paidRevenue(o: Order): number {
  if (!o) return 0;
  let rev = 0;
  if (isPartialSale(o)) rev = Number(o.amountPaid || 0);
  else if (isPaidSale(o)) rev = Number(o.amountPaid ?? o.grandTotal ?? 0);
  if (rev <= 0) return 0;
  // Tandoor token exclusion (setting-controlled, reports-only — bill unchanged)
  return Math.max(0, rev - tokenExcludedAmount(o));
}

/** Outstanding balance for partial orders. */
export function balanceDue(o: Order): number {
  if (!o) return 0;
  const total = Number(o.grandTotal || 0);
  const paid = Number(o.amountPaid || 0);
  return Math.max(0, total - paid);
}

/** Credit order (pending or partially received). */
export function isCreditOrder(o: Order): boolean {
  return o?.paymentMethod === 'credit';
}

export function isVoid(o: Order): boolean { return o?.status === 'void'; }
export function isComplimentary(o: Order): boolean { return o?.status === 'complimentary'; }
export function isCancelled(o: Order): boolean { return o?.status === 'cancelled'; }
export function isVoidish(o: Order): boolean { return isVoid(o) || isComplimentary(o) || isCancelled(o); }
export function isOpen(o: Order): boolean { return o?.status === 'running' || o?.status === 'hold'; }

export type SalesBucket = 'paid' | 'partial' | 'credit' | 'void' | 'complimentary' | 'cancelled' | 'open';

export function bucketize(o: Order): SalesBucket {
  if (isVoid(o)) return 'void';
  if (isComplimentary(o)) return 'complimentary';
  if (isCancelled(o)) return 'cancelled';
  if (isCreditOrder(o)) return 'credit';
  if (isPaidSale(o)) return 'paid';
  if (isPartialSale(o)) return 'partial';
  return 'open';
}

/** Sum of revenue that has actually been received (paid + partial portions). */
export function totalPaidSales(orders: Order[]): number {
  return orders.reduce((s, o) => s + paidRevenue(o), 0);
}
