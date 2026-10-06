// ============================================================
// EVERY BILL SAYS WHAT WAS CHARGED — and only that.
//
// What is pinned, for every receipt design the shop can pick (the classic
// designs, the premium and DT Retail templates, the raw ESC/POS slip and the
// QR text):
//   • a percentage discount prints its rate and the amount: "Discount (10%)  -200";
//   • a percentage service charge prints its rate and the amount: "Service Charge (10%)  180";
//   • a flat discount or flat charge prints the amount with no invented rate;
//   • a delivery charge that is in the total is on the slip too, so the lines add up;
//   • a bill with none of them prints none of those lines;
//   • a saved percentage that no longer explains the amount (stacked event + manual
//     discount, or an amount a manager typed over) is not printed.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import ReceiptPreview from '@/components/ReceiptPreview';
import { ALL_PREMIUM_TEMPLATES } from '@/lib/premiumReceiptTemplates';
import { buildReceiptBytes } from '@/printing/escposBuilder';
import { receiptText } from '@/lib/receiptCodes';
import { discountLabel, discountPercentShown, taxLabel, variantNote } from '@/lib/billLabels';
import { toLiveBill } from '@/lib/liveBill';
import { buildSampleOrder } from '@/lib/sampleOrder';

const CLASSIC_DESIGNS = [
  'standard', 'compact-thermal', 'classic', 'modern', 'compact', 'luxury', 'executive', 'royal', 'bistro',
  'heritage', 'metro', 'shahenshah', 'taste-bistro', 'food-palace', 'spice-house', 'taimoor',
  'design1-table', 'design2-box', 'design3-modern', 'design4-compact', 'design5-delivery',
  'sero', 'bero', 'kot-style', 'kot-classic',
];
const ALL_DESIGNS = [...CLASSIC_DESIGNS, ...ALL_PREMIUM_TEMPLATES.map(t => t.id)];

const settings: any = { name: 'Lotus Café', currencySymbol: 'Rs', paperSize: '80mm' };
const base = (over: any = {}) => ({
  ...buildSampleOrder(),
  orderType: 'delivery',
  items: [
    { id: 'a', menuItemId: 'a', name: 'Chicken Karahi', pricingType: 'fixed', price: 1500, quantity: 1, lineTotal: 1500, note: '' },
    { id: 'b', menuItemId: 'b', name: 'Naan', pricingType: 'fixed', price: 100, quantity: 5, lineTotal: 500, note: '' },
  ],
  subtotal: 2000,
  discount: 0, discountPercent: undefined, discountTitle: undefined,
  serviceCharge: 0, serviceChargePercent: 0, serviceChargeType: undefined,
  tax: 0, deliveryChargeAmount: 0,
  ...over,
});

// 2,000 − 10% (200) = 1,800 → + 10% service (180) → + delivery 150 = 2,130
const PERCENT_BILL = base({
  discount: 200, discountPercent: 10,
  serviceCharge: 180, serviceChargePercent: 10, serviceChargeType: 'percent',
  deliveryChargeAmount: 150, grandTotal: 2130,
});
// Flat: 2,000 − 300 + 250 = 1,950
const FLAT_BILL = base({
  discount: 300, serviceCharge: 250, serviceChargePercent: 0, serviceChargeType: 'pkr', grandTotal: 1950,
});
const PLAIN_BILL = base({ grandTotal: 2000 });

const textOf = (order: any, design: string) => {
  const { container, unmount } = render(<ReceiptPreview order={order} settings={{ ...settings, receiptDesign: design }} />);
  const t = (container.textContent || '').replace(/\s+/g, ' ');
  unmount();
  return t;
};

const DISCOUNT_10 = /Disc(ount)?\s*\(10%\)\s*-\s*(Rs\.?\s*)?200|DISCOUNT \(10%\)\s*-200/i;
const SERVICE_10 = /Service( Charge)?\s*\(10%\)\s*(Rs\.?\s*)?180|SERVICE \(10%\)\s*180/i;
const DELIVERY_150 = /Delivery( Charge)?\s*(Rs\.?\s*)?150/i;

describe('every receipt design prints the charges on the bill', () => {
  it.each(ALL_DESIGNS)('%s: percentage discount, percentage service charge and delivery, with rates and amounts', design => {
    const t = textOf(PERCENT_BILL, design);
    expect(t).toMatch(DISCOUNT_10);
    expect(t).toMatch(SERVICE_10);
    expect(t).toMatch(DELIVERY_150);
    expect(t).toMatch(/2,?130/);
  });

  it.each(ALL_DESIGNS)('%s: flat amounts print without an invented rate', design => {
    const t = textOf(FLAT_BILL, design);
    expect(t).toMatch(/Disc(ount)?\s*-\s*(Rs\.?\s*)?300|DISCOUNT\s*-300/i);
    expect(t).toMatch(/Service( Charge)?\s*(Rs\.?\s*)?250|SERVICE\s*250/i);
    expect(t).not.toMatch(/\(\d+(\.\d+)?%\)/);
  });

  it.each(ALL_DESIGNS)('%s: a bill without them has no such lines', design => {
    const t = textOf(PLAIN_BILL, design);
    expect(t).not.toMatch(/Service|SERVICE/);
    expect(t).not.toMatch(/Disc(ount)?\b|DISCOUNT/i);
    // (the order type "delivery" may sit right before the date: that is not a charge line)
    expect(t).not.toMatch(/Delivery( Charge)?\s*(Rs\.?\s*)?[\d,]+(\.\d+)?(?![\d-])/i);
  });
});

describe('the raw ESC/POS slip (Fast Billing / Raw text)', () => {
  const raw = (order: any) => Buffer.from(buildReceiptBytes(order, settings)).toString('latin1').replace(/ +/g, ' ');
  it('prints the rates and amounts', () => {
    const t = raw(PERCENT_BILL);
    expect(t).toMatch(/Discount \(10%\) -Rs ?200/);
    expect(t).toMatch(/Service Charge \(10%\) Rs ?180/);
    expect(t).toMatch(/Delivery Rs ?150/);
  });
  it('prints nothing it does not have', () => {
    const t = raw(PLAIN_BILL);
    expect(t).not.toMatch(/Discount|Service|Delivery Rs/);
  });
});

describe('the QR text a phone reads', () => {
  it('carries the rates too', () => {
    const t = receiptText(PERCENT_BILL as any, settings);
    expect(t).toMatch(/Discount \(10%\) -200 \| Service \(10%\) 180 \| Delivery 150/);
  });
});

describe('the discount words', () => {
  it('a percentage, a flat amount, and the shop’s own title', () => {
    expect(discountLabel({ discount: 200, discountPercent: 10, subtotal: 2000 })).toBe('Discount (10%)');
    expect(discountLabel({ discount: 300, subtotal: 2000 })).toBe('Discount');
    expect(discountLabel({ discount: 200, discountPercent: 10, subtotal: 2000, discountTitle: 'Eid Discount' })).toBe('Eid Discount (10%)');
    expect(discountLabel({ discount: 200, discountPercent: 10, subtotal: 2000, discountTitle: 'Discount 10%' })).toBe('Discount 10%');
  });
  it('a percentage that no longer explains the amount is left out', () => {
    // Event 10% + manual 5% on 2,000 = 300; the saved rate is the manual 5%.
    const stacked = { discount: 300, discountPercent: 5, subtotal: 2000 };
    expect(discountPercentShown(stacked)).toBe(0);
    expect(discountLabel(stacked)).toBe('Discount');
    expect(discountLabel({ ...stacked, discountTitle: 'Event Discount 10% + Discount 5%' })).toBe('Event Discount 10% + Discount 5%');
    // Only part of the bill could be discounted (excluded categories): still the right rate.
    expect(discountPercentShown({ discount: 150, discountPercent: 10, subtotal: 2000 })).toBe(10);
  });
  it('the tax rate is the shop’s real one, never a made-up 5%', () => {
    expect(taxLabel({ taxPercent: 16 })).toBe('Tax (16%)');
    expect(taxLabel({})).toBe('Tax');
    const src = readFileSync(resolve(__dirname, '..', 'components', 'ReceiptPreview.tsx'), 'utf8');
    expect(src).not.toMatch(/Tax \(5%\)/);
    expect(src).not.toMatch(/<span>Delivery Charge<\/span><span>\{order\.serviceCharge/);
  });
});

describe('the bill editor keeps the bill honest', () => {
  const src = readFileSync(resolve(__dirname, '..', 'pages', 'BillEditorPage.tsx'), 'utf8');
  it('keeps the delivery charge in the total when it recalculates', () => {
    expect(src).toMatch(/\+ \(o\.serviceCharge \|\| 0\) \+ \(o\.deliveryChargeAmount \|\| 0\);/);
  });
  it('an amount typed by the manager drops the old percentage', () => {
    expect(src).toMatch(/discountPercent: changed \? undefined : draft\.discountPercent/);
  });
});

describe('a sized item prints its size once', () => {
  // The POS names the line "Pepperoni Feast - Large" and keeps "Large" as its variant too.
  const sized = base({ items: [{ id: 'p', menuItemId: 'p', name: 'Pepperoni Feast - Large', variantName: 'Large', variantType: 'size', pricingType: 'fixed', price: 1600, quantity: 1, lineTotal: 1600, note: '' }], subtotal: 1600, grandTotal: 1600 });
  it('the rule', () => {
    expect(variantNote({ name: 'Pepperoni Feast - Large', variantName: 'Large' })).toBe('');
    expect(variantNote({ name: 'Zinger Burger', variantName: 'Large' })).toBe('Large');
    expect(variantNote({ name: 'Zinger Burger' })).toBe('');
  });
  it.each(['dtr-modern', 'dtr-restaurant', 'dtr-classic', ...ALL_PREMIUM_TEMPLATES.filter(t => !t.id.startsWith('dtr-')).slice(0, 3).map(t => t.id)])('%s', design => {
    expect(textOf(sized, design)).not.toMatch(/Large\s*\(Large\)/);
  });
  it('raw slip, QR text and the Customer Display', () => {
    expect(Buffer.from(buildReceiptBytes(sized as any, settings)).toString('latin1')).not.toMatch(/Large \(Large\)/);
    expect(receiptText(sized as any, settings)).not.toMatch(/Large \(Large\)/);
    expect(toLiveBill({ lines: [{ name: 'Pepperoni Feast - Large', variantName: 'Large', quantity: 1, lineTotal: 1600 }], total: 1600 })!.lines[0].name).toBe('Pepperoni Feast - Large');
  });
});
