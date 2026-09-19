// ============================================================
// WHAT THE CUSTOMER PAYS.
//
// This is the arithmetic between a cart and a grand total: discounts, service
// charge, tax, delivery, rounding. It lived inline in POSScreen.tsx among
// three thousand lines of screen, which meant the one calculation in this
// application that handles money was the one calculation nobody could test.
//
// It is moved here UNCHANGED. Every line below does what the screen did,
// including the rounding choices, and the tests that now exist lock that
// behaviour rather than describe a better version of it. A "tidier" formula
// would be a silent change to what a shop charges.
//
// The order of operations, which is the part that matters
// ------------------------------------------------------
//   1. Subtotal, from the cart.
//   2. Discounts, applied only to the DISCOUNTABLE part — a shop can exclude
//      categories or items, and a 10% staff discount must not come off the
//      cigarettes.
//   3. Service charge on what is left after discount.
//   4. Tax on subtotal-less-discount PLUS service charge, because the service
//      charge is part of the taxable supply.
//   5. Delivery, which is neither discounted nor taxed.
//   6. Rounding, last, so the figure on the slip is the figure in the till.
// ============================================================

export type TaxMode = 'exclusive' | 'inclusive';
export type DiscountMode = 'pkr' | 'percent';
export type RoundingMode = 'none' | '0.05' | '0.10' | '1';

export interface BillLine {
  menuItemId: string;
  /** quantity x price, already computed by the cart. */
  lineTotal: number;
}

export interface BillSettings {
  /** Automatic event discount. */
  eventDiscountEnabled?: boolean;
  eventDiscountType?: DiscountMode;
  eventDiscountPercent?: number;
  eventDiscountAmount?: number;
  /** Categories and items a discount may never touch. */
  discountExcludedCategoryIds?: string[];
  discountExcludedItemIds?: string[];
  serviceChargePercent?: number;
  taxPercent?: number;
  taxMode?: TaxMode;
  /** Legacy flat tax, used only when there is no percentage. */
  taxAmount?: number;
  deliveryCharge?: number;
  roundingMode?: RoundingMode;
}

export interface BillInput {
  lines: BillLine[];
  /** Menu items, for resolving which category a line belongs to. */
  menuItems: Array<{ id: string; categoryId?: string }>;
  settings: BillSettings;
  /** Which kind of manual discount the cashier is entering. */
  discountMode: DiscountMode;
  /** The flat amount, when discountMode is 'pkr'. */
  discountAmount?: number;
  /** The percentage, when discountMode is 'percent'. */
  discountPercent?: number;
  /** A promo code's discount, applied on top of the others. */
  promoDiscount?: number;
  orderType?: string;
}

export interface BillTotals {
  subtotal: number;
  /** The part of the subtotal a discount is allowed to touch. */
  discountableSubtotal: number;
  eventDiscount: number;
  manualDiscount: number;
  promoDiscount: number;
  totalDiscount: number;
  /** Subtotal less every discount. */
  netSubtotal: number;
  serviceCharge: number;
  /** What tax is charged on. */
  taxableBase: number;
  taxAmount: number;
  deliveryCharge: number;
  /** What rounding added or removed; negative means the customer pays less. */
  roundingAdjust: number;
  grandTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The subtotal, and the part of it a discount may be applied to. */
export function computeSubtotals(input: Pick<BillInput, 'lines' | 'menuItems' | 'settings'>) {
  const subtotal = input.lines.reduce((sum, c) => sum + (Number(c.lineTotal) || 0), 0);

  const excludedCats = input.settings.discountExcludedCategoryIds || [];
  const excludedItems = input.settings.discountExcludedItemIds || [];
  const discountableSubtotal = input.lines.reduce((sum, c) => {
    const mi = input.menuItems.find(m => m.id === c.menuItemId);
    const excluded = (mi && mi.categoryId ? excludedCats.includes(mi.categoryId) : false)
      || excludedItems.includes(c.menuItemId);
    return sum + (excluded ? 0 : (Number(c.lineTotal) || 0));
  }, 0);

  return { subtotal, discountableSubtotal };
}

export function computeBillTotals(input: BillInput): BillTotals {
  const s = input.settings || {};
  const { subtotal, discountableSubtotal } = computeSubtotals(input);

  // ----- Event discount (automatic), percent or flat -----
  const evtType: DiscountMode = (s.eventDiscountType || 'percent') as DiscountMode;
  const eventActive = !!s.eventDiscountEnabled && (
    (evtType === 'percent' && (s.eventDiscountPercent || 0) > 0)
    || (evtType === 'pkr' && (s.eventDiscountAmount || 0) > 0)
  );
  const eventPct = evtType === 'percent' ? (s.eventDiscountPercent || 0) : 0;
  const eventDiscount = !eventActive ? 0
    : evtType === 'percent'
      ? Math.round(discountableSubtotal * eventPct / 100)
      // A flat event discount can never exceed what it is discounting.
      : Math.min(discountableSubtotal, s.eventDiscountAmount || 0);

  // ----- Manual discount: percent OR flat, never both at once -----
  const manualPercentAmt = input.discountMode === 'percent'
    ? Math.round(discountableSubtotal * (input.discountPercent || 0) / 100)
    : 0;
  const manualPkrAmt = input.discountMode === 'pkr' ? (input.discountAmount || 0) : 0;
  const manualDiscount = Math.min(manualPercentAmt + manualPkrAmt, discountableSubtotal);

  const promoDiscount = input.promoDiscount || 0;

  // Everything together still cannot exceed the discountable part. Without
  // this cap a stacked event + manual + promo could take a bill negative.
  const totalDiscount = Math.min(discountableSubtotal, eventDiscount + manualDiscount + promoDiscount);

  // ----- Service charge, then tax on the two together -----
  // EXCLUSIVE: item 100 -> SC 10% = 10 -> base 110 -> GST 9% = 9.90 -> 119.90
  // INCLUSIVE: the tax is already inside the total and is only shown
  //            separately: base = total / 1.09, gst = total x 0.09 / 1.09
  const scPercent = s.serviceChargePercent || 0;
  const netSubtotal = subtotal - totalDiscount;
  const serviceCharge = Math.round(netSubtotal * scPercent / 100);
  const taxPct = Number(s.taxPercent) || 0;
  const taxMode: TaxMode = (s.taxMode as TaxMode) || 'exclusive';
  const taxableBase = netSubtotal + serviceCharge;

  let taxAmount = 0;
  let grandTotal = 0;
  if (taxPct > 0) {
    if (taxMode === 'inclusive') {
      grandTotal = taxableBase;
      taxAmount = round2(taxableBase * taxPct / (100 + taxPct));
    } else {
      taxAmount = round2(taxableBase * taxPct / 100);
      grandTotal = taxableBase + taxAmount;
    }
  } else {
    taxAmount = s.taxAmount || 0; // legacy flat tax
    grandTotal = taxableBase + taxAmount;
  }

  // ----- Delivery: not discounted, not taxed -----
  const deliveryCharge = input.orderType === 'delivery' ? Number(s.deliveryCharge || 0) : 0;
  grandTotal += deliveryCharge;

  // ----- Rounding, last, so the slip and the till agree -----
  const mode = s.roundingMode || 'none';
  const roundStep = mode === '0.05' ? 0.05 : mode === '0.10' ? 0.10 : mode === '1' ? 1 : 0;
  let roundingAdjust = 0;
  if (roundStep > 0) {
    const rounded = Math.round(grandTotal / roundStep) * roundStep;
    roundingAdjust = round2(rounded - grandTotal);
    grandTotal = round2(rounded);
  }

  return {
    subtotal,
    discountableSubtotal,
    eventDiscount,
    manualDiscount,
    promoDiscount,
    totalDiscount,
    netSubtotal,
    serviceCharge,
    taxableBase,
    taxAmount,
    deliveryCharge,
    roundingAdjust,
    grandTotal,
  };
}
