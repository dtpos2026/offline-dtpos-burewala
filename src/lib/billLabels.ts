// ============================================================
// BILL LABELS — the words a discount gets on a slip.
//
// A percentage discount reads "Discount (10%)"; a flat one just "Discount", with
// the amount on the right. Only presentation: the amounts come from the order.
// ============================================================

interface DiscountLike {
  discount?: number;
  discountPercent?: number;
  discountTitle?: string;
}

/** "Discount (10%)" for a percentage discount, "Discount" otherwise. */
export function discountLabel(order: DiscountLike, base = 'Discount'): string {
  const pct = Number(order.discountPercent) || 0;
  return pct > 0 && pct <= 100 ? `${base} (${+pct.toFixed(2)}%)` : base;
}

/** The line label for templates that show the shop's own title ("Eid Discount 10%") when there is one. */
export function discountLineTitle(order: DiscountLike): string {
  const title = (order.discountTitle || '').trim();
  return title || discountLabel(order);
}
