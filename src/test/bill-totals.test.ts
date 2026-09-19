// ============================================================
// WHAT THE CUSTOMER PAYS.
//
// This arithmetic lived inline in a three-thousand-line screen, which meant
// the one calculation in this application that handles money was the one
// calculation nobody could test. It is now a module, and this file is the
// lock on it.
//
// These tests describe what the software DOES, not what it arguably should:
// a shop has been billing with these rules, and a "tidier" formula would be a
// silent change to what customers are charged.
// ============================================================
import { describe, it, expect } from 'vitest';
import { computeBillTotals, computeSubtotals, type BillInput } from '@/lib/billTotals';

const MENU = [
  { id: 'burger', categoryId: 'food' },
  { id: 'cola', categoryId: 'drinks' },
  { id: 'cigs', categoryId: 'tobacco' },
];

function bill(over: Partial<BillInput> = {}): BillInput {
  return {
    lines: [{ menuItemId: 'burger', lineTotal: 1000 }],
    menuItems: MENU,
    settings: {},
    discountMode: 'pkr',
    ...over,
  };
}

describe('the subtotal', () => {
  it('is the sum of the lines', () => {
    const t = computeBillTotals(bill({
      lines: [
        { menuItemId: 'burger', lineTotal: 1000 },
        { menuItemId: 'cola', lineTotal: 250 },
      ],
    }));
    expect(t.subtotal).toBe(1250);
    expect(t.grandTotal).toBe(1250);
  });

  it('is zero for an empty cart, not NaN', () => {
    const t = computeBillTotals(bill({ lines: [] }));
    expect(t.subtotal).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('survives a line with a missing total', () => {
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: undefined as any }, { menuItemId: 'cola', lineTotal: 100 }],
    }));
    expect(t.subtotal).toBe(100);
  });
});

describe('what a discount is allowed to touch', () => {
  const lines = [
    { menuItemId: 'burger', lineTotal: 1000 },
    { menuItemId: 'cigs', lineTotal: 500 },
  ];

  it('excludes a whole category', () => {
    // A staff discount must not come off the cigarettes.
    const { subtotal, discountableSubtotal } = computeSubtotals({
      lines, menuItems: MENU,
      settings: { discountExcludedCategoryIds: ['tobacco'] },
    });
    expect(subtotal).toBe(1500);
    expect(discountableSubtotal).toBe(1000);
  });

  it('excludes a single item', () => {
    const { discountableSubtotal } = computeSubtotals({
      lines, menuItems: MENU,
      settings: { discountExcludedItemIds: ['cigs'] },
    });
    expect(discountableSubtotal).toBe(1000);
  });

  it('applies a percentage only to the discountable part', () => {
    const t = computeBillTotals(bill({
      lines,
      settings: { discountExcludedCategoryIds: ['tobacco'] },
      discountMode: 'percent',
      discountPercent: 10,
    }));
    // 10% of 1000, not of 1500.
    expect(t.manualDiscount).toBe(100);
    expect(t.grandTotal).toBe(1400);
  });
});

describe('discounts', () => {
  it('takes a flat amount', () => {
    const t = computeBillTotals(bill({ discountMode: 'pkr', discountAmount: 150 }));
    expect(t.manualDiscount).toBe(150);
    expect(t.grandTotal).toBe(850);
  });

  it('takes a percentage', () => {
    const t = computeBillTotals(bill({ discountMode: 'percent', discountPercent: 15 }));
    expect(t.manualDiscount).toBe(150);
    expect(t.grandTotal).toBe(850);
  });

  it('uses only the mode the cashier is in', () => {
    // Both fields carry a value, but 'percent' is selected: the flat amount
    // must be ignored rather than added on top.
    const t = computeBillTotals(bill({
      discountMode: 'percent', discountPercent: 10, discountAmount: 999,
    }));
    expect(t.manualDiscount).toBe(100);
  });

  it('adds an automatic event discount', () => {
    const t = computeBillTotals(bill({
      settings: { eventDiscountEnabled: true, eventDiscountType: 'percent', eventDiscountPercent: 20 },
    }));
    expect(t.eventDiscount).toBe(200);
    expect(t.grandTotal).toBe(800);
  });

  it('ignores an event discount that is switched off', () => {
    const t = computeBillTotals(bill({
      settings: { eventDiscountEnabled: false, eventDiscountType: 'percent', eventDiscountPercent: 20 },
    }));
    expect(t.eventDiscount).toBe(0);
    expect(t.grandTotal).toBe(1000);
  });

  it('stacks event, manual and promo', () => {
    const t = computeBillTotals(bill({
      settings: { eventDiscountEnabled: true, eventDiscountType: 'pkr', eventDiscountAmount: 100 },
      discountMode: 'pkr', discountAmount: 50,
      promoDiscount: 25,
    }));
    expect(t.totalDiscount).toBe(175);
    expect(t.grandTotal).toBe(825);
  });

  it('NEVER lets a bill go negative', () => {
    // Three stacked discounts on a small bill is how a till ends up owing the
    // customer money.
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 100 }],
      settings: { eventDiscountEnabled: true, eventDiscountType: 'pkr', eventDiscountAmount: 500 },
      discountMode: 'pkr', discountAmount: 500,
      promoDiscount: 500,
    }));
    expect(t.totalDiscount).toBe(100);
    expect(t.grandTotal).toBe(0);
    expect(t.grandTotal).toBeGreaterThanOrEqual(0);
  });

  it('caps a flat discount larger than the bill', () => {
    const t = computeBillTotals(bill({ discountMode: 'pkr', discountAmount: 5000 }));
    expect(t.manualDiscount).toBe(1000);
    expect(t.grandTotal).toBe(0);
  });
});

describe('service charge and tax', () => {
  it('follows the shop\'s worked example exactly', () => {
    // item 100 -> SC 10% = 10 -> base 110 -> GST 9% = 9.90 -> total 119.90
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 100 }],
      settings: { serviceChargePercent: 10, taxPercent: 9, taxMode: 'exclusive' },
    }));
    expect(t.serviceCharge).toBe(10);
    expect(t.taxableBase).toBe(110);
    expect(t.taxAmount).toBe(9.9);
    expect(t.grandTotal).toBe(119.9);
  });

  it('charges the service charge on the DISCOUNTED amount', () => {
    const t = computeBillTotals(bill({
      settings: { serviceChargePercent: 10 },
      discountMode: 'pkr', discountAmount: 200,
    }));
    // 10% of 800, not of 1000.
    expect(t.serviceCharge).toBe(80);
    expect(t.grandTotal).toBe(880);
  });

  it('taxes the service charge too', () => {
    const t = computeBillTotals(bill({
      settings: { serviceChargePercent: 10, taxPercent: 10, taxMode: 'exclusive' },
    }));
    expect(t.taxableBase).toBe(1100);   // 1000 + 100 service
    expect(t.taxAmount).toBe(110);
    expect(t.grandTotal).toBe(1210);
  });

  it('shows inclusive tax without adding it again', () => {
    // The tax is already inside the price; it is only broken out on the slip.
    const t = computeBillTotals(bill({
      settings: { taxPercent: 9, taxMode: 'inclusive' },
    }));
    expect(t.grandTotal).toBe(1000);
    expect(t.taxAmount).toBeCloseTo(1000 * 9 / 109, 2);
  });

  it('falls back to a flat legacy tax when no percentage is set', () => {
    const t = computeBillTotals(bill({ settings: { taxAmount: 75 } }));
    expect(t.taxAmount).toBe(75);
    expect(t.grandTotal).toBe(1075);
  });

  it('prefers the percentage over the legacy flat amount', () => {
    const t = computeBillTotals(bill({ settings: { taxPercent: 10, taxAmount: 999 } }));
    expect(t.taxAmount).toBe(100);
  });
});

describe('delivery charge', () => {
  it('is added on a delivery order', () => {
    const t = computeBillTotals(bill({ settings: { deliveryCharge: 120 }, orderType: 'delivery' }));
    expect(t.deliveryCharge).toBe(120);
    expect(t.grandTotal).toBe(1120);
  });

  it('is not added on takeaway or dine-in', () => {
    for (const type of ['takeaway', 'dine_in', undefined]) {
      const t = computeBillTotals(bill({ settings: { deliveryCharge: 120 }, orderType: type }));
      expect(t.deliveryCharge).toBe(0);
      expect(t.grandTotal).toBe(1000);
    }
  });

  it('is never discounted and never taxed', () => {
    const t = computeBillTotals(bill({
      settings: { deliveryCharge: 100, taxPercent: 10, taxMode: 'exclusive' },
      discountMode: 'percent', discountPercent: 50,
      orderType: 'delivery',
    }));
    // 1000 - 500 = 500, +10% tax = 550, then delivery 100 on top.
    expect(t.taxableBase).toBe(500);
    expect(t.taxAmount).toBe(50);
    expect(t.grandTotal).toBe(650);
  });
});

describe('rounding', () => {
  it('leaves the total alone when rounding is off', () => {
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 101 }],
      settings: { taxPercent: 9, taxMode: 'exclusive' },
    }));
    expect(t.roundingAdjust).toBe(0);
    expect(t.grandTotal).toBeCloseTo(110.09, 2);
  });

  it('rounds to the nearest rupee', () => {
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 101 }],
      settings: { taxPercent: 9, taxMode: 'exclusive', roundingMode: '1' },
    }));
    expect(t.grandTotal).toBe(110);
    expect(t.roundingAdjust).toBeCloseTo(-0.09, 2);
  });

  it('rounds to five and ten paisa', () => {
    const at = (mode: any) => computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 101 }],
      settings: { taxPercent: 9, taxMode: 'exclusive', roundingMode: mode },
    })).grandTotal;
    expect(at('0.05')).toBeCloseTo(110.1, 2);
    expect(at('0.10')).toBeCloseTo(110.1, 2);
  });

  it('reports the adjustment, so the slip and the till agree', () => {
    const t = computeBillTotals(bill({
      lines: [{ menuItemId: 'burger', lineTotal: 101 }],
      settings: { taxPercent: 9, taxMode: 'exclusive', roundingMode: '1' },
    }));
    // What was charged, less what was adjusted, is what was calculated.
    expect(t.grandTotal - t.roundingAdjust).toBeCloseTo(110.09, 2);
  });
});

describe('a whole bill, end to end', () => {
  it('adds up the way the slip prints it', () => {
    const t = computeBillTotals({
      lines: [
        { menuItemId: 'burger', lineTotal: 1200 },   // 2 x 600
        { menuItemId: 'cola', lineTotal: 200 },      // 2 x 100
        { menuItemId: 'cigs', lineTotal: 600 },      // excluded from discount
      ],
      menuItems: MENU,
      settings: {
        discountExcludedCategoryIds: ['tobacco'],
        serviceChargePercent: 5,
        taxPercent: 16, taxMode: 'exclusive',
        deliveryCharge: 150,
        roundingMode: '1',
      },
      discountMode: 'percent', discountPercent: 10,
      promoDiscount: 50,
      orderType: 'delivery',
    });

    expect(t.subtotal).toBe(2000);
    expect(t.discountableSubtotal).toBe(1400);        // cigarettes excluded
    expect(t.manualDiscount).toBe(140);               // 10% of 1400
    expect(t.totalDiscount).toBe(190);                // + promo 50
    expect(t.netSubtotal).toBe(1810);
    expect(t.serviceCharge).toBe(91);                 // 5% of 1810, rounded
    expect(t.taxableBase).toBe(1901);
    expect(t.taxAmount).toBeCloseTo(304.16, 2);
    expect(t.deliveryCharge).toBe(150);
    // 1901 + 304.16 + 150 = 2355.16 -> 2355
    expect(t.grandTotal).toBe(2355);

    // And the parts genuinely reconcile to the whole.
    const rebuilt = t.subtotal - t.totalDiscount + t.serviceCharge
      + t.taxAmount + t.deliveryCharge + t.roundingAdjust;
    expect(rebuilt).toBeCloseTo(t.grandTotal, 2);
  });
});
