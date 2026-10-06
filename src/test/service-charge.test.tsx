// ============================================================
// SERVICE CHARGE — percent or flat PKR, switched on per order type, editable per bill.
//
// What is pinned:
//   • Dine-In 10% on PKR 2,000 → Service Charge 200 → Total 2,200 (the owner's example);
//   • Takeaway / Delivery get nothing unless they are switched on;
//   • a flat PKR charge works the same way;
//   • a shop that never had the per-type switches keeps charging every type (nothing
//     changes silently on upgrade);
//   • a charge typed in on one bill wins over the automatic one, even when it is 0;
//   • the discount comes off first, tax is charged on the discounted bill + the charge;
//   • the Settings card writes explicit switches; the words on a slip match the charge.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeBillTotals, type BillInput } from '@/lib/billTotals';
import {
  describeServiceCharge, overrideFromOrder, resolveServiceCharge, serviceChargeAmount, serviceChargeAppliesTo,
  serviceChargeFields, serviceChargeLabel, serviceChargeSuffix,
} from '@/lib/serviceCharge';
import { discountLabel, discountLineTitle } from '@/lib/billLabels';
import ServiceChargeCard from '@/components/settings/ServiceChargeCard';
import PremiumReceipt from '@/components/PremiumReceipt';
import ReceiptPreview from '@/components/ReceiptPreview';
import { buildSampleOrder } from '@/lib/sampleOrder';
import { seedData } from '@/lib/seed-data';

const MENU = [{ id: 'biryani', categoryId: 'rice' }, { id: 'cola', categoryId: 'drinks' }];
function bill(over: Partial<BillInput> = {}): BillInput {
  return {
    lines: [{ menuItemId: 'biryani', lineTotal: 2000 }],
    menuItems: MENU,
    settings: {},
    discountMode: 'pkr',
    ...over,
  };
}
const DINE_ONLY = { dining: true, takeaway: false, delivery: false };

describe('Dine-In service charge', () => {
  it('10% on PKR 2,000 → 200, total 2,200', () => {
    const t = computeBillTotals(bill({ settings: { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY }, orderType: 'dining' }));
    expect(t.subtotal).toBe(2000);
    expect(t.serviceCharge).toBe(200);
    expect(t.grandTotal).toBe(2200);
    expect(t.serviceChargeMode).toBe('percent');
    expect(t.serviceChargeRate).toBe(10);
    expect(t.serviceChargeManual).toBe(false);
  });

  it('Takeaway and Delivery get nothing while only Dine-In is on', () => {
    const settings = { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY };
    expect(computeBillTotals(bill({ settings, orderType: 'takeaway' })).serviceCharge).toBe(0);
    expect(computeBillTotals(bill({ settings, orderType: 'delivery' })).serviceCharge).toBe(0);
    expect(computeBillTotals(bill({ settings, orderType: 'takeaway' })).grandTotal).toBe(2000);
  });

  it('each order type can be switched on by itself', () => {
    const settings = { serviceChargePercent: 5, serviceChargeOrderTypes: { dining: false, takeaway: true, delivery: true } };
    expect(computeBillTotals(bill({ settings, orderType: 'dining' })).serviceCharge).toBe(0);
    expect(computeBillTotals(bill({ settings, orderType: 'takeaway' })).serviceCharge).toBe(100);
    expect(computeBillTotals(bill({ settings, orderType: 'delivery' })).serviceCharge).toBe(100);
  });

  it('follows the order type when the cashier changes it on the same bill', () => {
    const settings = { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY };
    const dine = computeBillTotals(bill({ settings, orderType: 'dining' }));
    const take = computeBillTotals(bill({ settings, orderType: 'takeaway' }));
    expect(dine.grandTotal - take.grandTotal).toBe(200);
  });
});

describe('a flat PKR service charge', () => {
  const settings = { serviceChargeMode: 'pkr' as const, serviceChargeAmount: 150, serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY };
  it('is added once per bill, whatever the size of the bill', () => {
    expect(computeBillTotals(bill({ settings, orderType: 'dining' })).serviceCharge).toBe(150);
    expect(computeBillTotals(bill({ settings, orderType: 'dining', lines: [{ menuItemId: 'cola', lineTotal: 80 }] })).serviceCharge).toBe(150);
    expect(computeBillTotals(bill({ settings, orderType: 'dining' })).grandTotal).toBe(2150);
  });
  it('is not charged on an empty cart', () => {
    const t = computeBillTotals(bill({ settings, orderType: 'dining', lines: [] }));
    expect(t.serviceCharge).toBe(0);
    expect(t.grandTotal).toBe(0);
  });
  it('is not charged on an order type that is switched off', () => {
    expect(computeBillTotals(bill({ settings, orderType: 'delivery' })).serviceCharge).toBe(0);
  });
});

describe('shops that existed before the per-type switches', () => {
  it('keep charging every order type until the owner switches one off', () => {
    const legacy = { serviceChargePercent: 10 };
    for (const orderType of ['dining', 'takeaway', 'delivery']) {
      expect(computeBillTotals(bill({ settings: legacy, orderType })).serviceCharge, orderType).toBe(200);
    }
    expect(serviceChargeAppliesTo(legacy, 'takeaway')).toBe(true);
  });
  it('a missing key inside the switches also means on', () => {
    expect(serviceChargeAppliesTo({ serviceChargeOrderTypes: { dining: false } }, 'takeaway')).toBe(true);
    expect(serviceChargeAppliesTo({ serviceChargeOrderTypes: { dining: false } }, 'dining')).toBe(false);
  });
  it('a new shop starts with Dine-In only', () => {
    const seed: any = (seedData() as any).settings;
    expect(seed.serviceChargeOrderTypes).toEqual(DINE_ONLY);
    expect(seed.serviceChargePercent).toBe(0);
    expect(seed.serviceChargeMode).toBe('percent');
  });
});

describe('a service charge typed in on one bill', () => {
  const settings = { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY };
  it('adds one where the type has none', () => {
    const t = computeBillTotals(bill({ settings, orderType: 'takeaway', serviceChargeOverride: { mode: 'pkr', value: 75 } }));
    expect(t.serviceCharge).toBe(75);
    expect(t.serviceChargeManual).toBe(true);
    expect(t.grandTotal).toBe(2075);
  });
  it('replaces the automatic one with another percentage', () => {
    const t = computeBillTotals(bill({ settings, orderType: 'dining', serviceChargeOverride: { mode: 'percent', value: 5 } }));
    expect(t.serviceCharge).toBe(100);
    expect(t.grandTotal).toBe(2100);
  });
  it('removes it altogether when set to 0', () => {
    const t = computeBillTotals(bill({ settings, orderType: 'dining', serviceChargeOverride: { mode: 'percent', value: 0 } }));
    expect(t.serviceCharge).toBe(0);
    expect(t.grandTotal).toBe(2000);
    expect(t.serviceChargeManual).toBe(true);
  });
  it('is clamped to something sensible', () => {
    expect(resolveServiceCharge({}, 'dining', { mode: 'percent', value: 500 }).value).toBe(100);
    expect(resolveServiceCharge({}, 'dining', { mode: 'pkr', value: -20 }).value).toBe(0);
    expect(resolveServiceCharge({}, 'dining', { mode: 'pkr', value: NaN as any }).value).toBe(0);
  });
  it('survives being saved on the order and reopened', () => {
    const rule = resolveServiceCharge(settings, 'takeaway', { mode: 'pkr', value: 75 });
    const fields = serviceChargeFields(rule, 75);
    expect(fields).toEqual({ serviceChargePercent: 0, serviceChargeType: 'pkr', serviceChargeManual: true });
    expect(overrideFromOrder({ ...fields, serviceCharge: 75 })).toEqual({ mode: 'pkr', value: 75 });

    const pct = serviceChargeFields(resolveServiceCharge(settings, 'dining', { mode: 'percent', value: 12 }), 240);
    expect(overrideFromOrder({ ...pct, serviceCharge: 240 })).toEqual({ mode: 'percent', value: 12 });

    // An automatic charge is not an override: reopening the bill lets the settings decide again.
    const auto = serviceChargeFields(resolveServiceCharge(settings, 'dining'), 200);
    expect(auto.serviceChargeManual).toBeUndefined();
    expect(overrideFromOrder({ ...auto, serviceCharge: 200 })).toBeNull();
  });
});

describe('with a discount and tax', () => {
  it('the percentage is worked out after the discount', () => {
    const t = computeBillTotals(bill({
      settings: { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY },
      orderType: 'dining', discountMode: 'percent', discountPercent: 10,
    }));
    expect(t.totalDiscount).toBe(200);
    expect(t.netSubtotal).toBe(1800);
    expect(t.serviceCharge).toBe(180);
    expect(t.grandTotal).toBe(1980);
  });
  it('a flat charge is not reduced by the discount', () => {
    const t = computeBillTotals(bill({
      settings: { serviceChargeMode: 'pkr', serviceChargeAmount: 100, serviceChargeOrderTypes: DINE_ONLY },
      orderType: 'dining', discountMode: 'pkr', discountAmount: 500,
    }));
    expect(t.serviceCharge).toBe(100);
    expect(t.grandTotal).toBe(1600);
  });
  it('tax is charged on the discounted bill plus the service charge', () => {
    const t = computeBillTotals(bill({
      settings: { serviceChargePercent: 10, serviceChargeOrderTypes: DINE_ONLY, taxPercent: 10 },
      orderType: 'dining',
    }));
    expect(t.serviceCharge).toBe(200);
    expect(t.taxableBase).toBe(2200);
    expect(t.taxAmount).toBe(220);
    expect(t.grandTotal).toBe(2420);
  });
});

describe('the words on a slip', () => {
  it('a percentage charge names its rate, a flat one does not', () => {
    expect(serviceChargeLabel({ serviceChargePercent: 10, serviceChargeType: 'percent' })).toBe('Service Charge (10%)');
    expect(serviceChargeLabel({ serviceChargePercent: 0, serviceChargeType: 'pkr' })).toBe('Service Charge');
    expect(serviceChargeLabel({ serviceChargePercent: 7.5 }, 'Service')).toBe('Service (7.5%)');
  });
  it('orders saved before this existed read as percentages', () => {
    expect(serviceChargeSuffix({ serviceCharge: 100, serviceChargePercent: 5 })).toBe(' (5%)');
    expect(serviceChargeSuffix({ serviceCharge: 100 })).toBe('');
  });
  it('a percentage discount names its rate', () => {
    expect(discountLabel({ discountPercent: 10 })).toBe('Discount (10%)');
    expect(discountLabel({})).toBe('Discount');
    expect(discountLineTitle({ discountTitle: 'Eid Discount 10%' })).toBe('Eid Discount 10%');
    expect(discountLineTitle({ discountPercent: 15 })).toBe('Discount (15%)');
  });
  it('the amount helper rounds a percentage to whole rupees and leaves a flat one alone', () => {
    expect(serviceChargeAmount({ mode: 'percent', value: 10 }, 1255)).toBe(126);
    expect(serviceChargeAmount({ mode: 'pkr', value: 99.5 }, 10)).toBe(99.5);
    expect(serviceChargeAmount({ mode: 'pkr', value: 99.5 }, 0)).toBe(0);
  });
});

describe('the Settings card', () => {
  const base: any = { serviceChargePercent: 10, serviceChargeMode: 'percent', serviceChargeOrderTypes: DINE_ONLY };

  it('says what the configuration will do', () => {
    expect(describeServiceCharge(base)).toBe('10% is added automatically to Dine-In bills.');
    expect(describeServiceCharge({ serviceChargePercent: 0 })).toBe('No service charge is set.');
    expect(describeServiceCharge({ serviceChargeMode: 'pkr', serviceChargeAmount: 150, serviceChargeOrderTypes: { dining: true, takeaway: true, delivery: false } }))
      .toBe('PKR 150 is added automatically to Dine-In, Takeaway bills.');
    expect(describeServiceCharge({ serviceChargePercent: 10, serviceChargeOrderTypes: { dining: false, takeaway: false, delivery: false } }))
      .toMatch(/switched off for every order type/);
    // An older shop with no switches is charging every type — the summary says so.
    expect(describeServiceCharge({ serviceChargePercent: 5 })).toBe('5% is added automatically to Dine-In, Takeaway, Delivery bills.');
  });

  it('switching one order type writes all three explicitly', () => {
    const calls: any[] = [];
    render(<ServiceChargeCard settings={{ serviceChargePercent: 5 } as any} onChange={p => calls.push(p)} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Service charge on Takeaway' }));
    expect(calls[0]).toEqual({ serviceChargeOrderTypes: { dining: true, takeaway: false, delivery: true } });
  });

  it('switches between percentage and a fixed amount, and keeps each value separate', () => {
    const calls: any[] = [];
    const { rerender } = render(<ServiceChargeCard settings={base} onChange={p => calls.push(p)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fixed amount (PKR)' }));
    expect(calls.pop()).toEqual({ serviceChargeMode: 'pkr' });
    rerender(<ServiceChargeCard settings={{ ...base, serviceChargeMode: 'pkr', serviceChargeAmount: 120 }} onChange={p => calls.push(p)} />);
    const input = screen.getByLabelText('Service charge value') as HTMLInputElement;
    expect(input.value).toBe('120');
    fireEvent.change(input, { target: { value: '200' } });
    expect(calls.pop()).toEqual({ serviceChargeAmount: 200 });
  });

  it('caps a percentage at 100', () => {
    const calls: any[] = [];
    render(<ServiceChargeCard settings={base} onChange={p => calls.push(p)} />);
    fireEvent.change(screen.getByLabelText('Service charge value'), { target: { value: '250' } });
    expect(calls.pop()).toEqual({ serviceChargePercent: 100 });
  });

  it('shows the manual-edit switch as on unless it was turned off', () => {
    render(<ServiceChargeCard settings={base} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Allow editing the service charge on a bill' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('what the customer receipt shows', () => {
  const settings: any = { name: 'Lotus Café', currencySymbol: 'Rs ', paperSize: '80mm', thankYouText: 'Thanks' };
  const withCharges = (over: any) => ({ ...buildSampleOrder(), ...over });
  const text = (order: any, templateId: any) => {
    const { container, unmount } = render(<PremiumReceipt order={order} settings={settings} templateId={templateId} />);
    const t = (container.textContent || '').replace(/\s+/g, ' ');
    unmount();
    return t;
  };
  const DESIGNS = ['premium-paid-banner', 'dtr-classic', 'dtr-restaurant', 'dtr-ticket'] as const;

  it.each(DESIGNS)('%s: a 10% service charge and a 10% discount are shown on their own lines with the rate', id => {
    const t = text(withCharges({ subtotal: 2000, discount: 200, discountPercent: 10, discountTitle: undefined, serviceCharge: 180, serviceChargePercent: 10, serviceChargeType: 'percent', tax: 0, grandTotal: 1980 }), id);
    expect(t).toMatch(/Service Charge \(10%\)/);
    expect(t).toMatch(/Discount \(10%\)/);
    expect(t).toContain('180');
  });

  it.each(DESIGNS)('%s: a flat charge has no percentage', id => {
    const t = text(withCharges({ subtotal: 2000, discount: 0, serviceCharge: 150, serviceChargePercent: 0, serviceChargeType: 'pkr', tax: 0, grandTotal: 2150 }), id);
    expect(t).toMatch(/Service Charge/);
    expect(t).not.toMatch(/Service Charge \(/);
  });

  it.each(DESIGNS)('%s: with no service charge and no discount neither line is printed', id => {
    const t = text(withCharges({ subtotal: 2000, discount: 0, discountTitle: undefined, discountPercent: undefined, serviceCharge: 0, serviceChargePercent: 0, tax: 0, grandTotal: 2000 }), id);
    expect(t).not.toMatch(/Service/);
    expect(t).not.toMatch(/Discount/i);
  });

  it('the classic receipt designs follow the same rule', () => {
    for (const design of ['standard', 'classic', 'modern', 'design3-modern', 'compact-thermal']) {
      const s2: any = { ...settings, receiptDesign: design };
      const none = render(<ReceiptPreview order={withCharges({ subtotal: 2000, discount: 0, serviceCharge: 0, tax: 0, grandTotal: 2000 }) as any} settings={s2} />);
      const t0 = (none.container.textContent || '').replace(/\s+/g, ' ');
      none.unmount();
      expect(t0, design).not.toMatch(/Service/);
      expect(t0, `${design} must not print a zero discount`).not.toMatch(/DISCOUNT\s*0\.00|Discount\s*-?0(\.00)?\b/);

      const some = render(<ReceiptPreview order={withCharges({ subtotal: 2000, discount: 0, serviceCharge: 200, serviceChargePercent: 10, serviceChargeType: 'percent', tax: 0, grandTotal: 2200 }) as any} settings={s2} />);
      const t1 = (some.container.textContent || '').replace(/\s+/g, ' ');
      some.unmount();
      expect(t1, design).toMatch(/Service( Charge)?\s*\(10%\)|SERVICE \(10%\)/);
    }
  });
});

describe('a new shop', () => {
  it('starts with the category panel on the right, next to the bill', () => {
    expect((seedData() as any).settings.categoryLayout).toBe('right');
  });
});

describe('Design 3 (Modern) totals boxes', () => {
  const settings: any = { name: 'Lotus Café', currencySymbol: 'Rs ', paperSize: '58mm', receiptDesign: 'design3-modern' };
  const order = (over: any) => ({ ...buildSampleOrder(), ...over });
  it('shows every charge the bill has — service charge included — and no invented tax rate', () => {
    const { container, unmount } = render(<ReceiptPreview order={order({ discount: 100, serviceCharge: 85, serviceChargePercent: 5, serviceChargeType: 'percent', tax: 152 }) as any} settings={settings} />);
    const t = (container.textContent || '').replace(/\s+/g, ' ');
    unmount();
    expect(t).toMatch(/SUBTOTAL/);
    expect(t).toMatch(/DISCOUNT\s*-100\.00/);
    expect(t).toMatch(/SERVICE \(5%\)\s*85\.00/);
    expect(t).toMatch(/TAX\s*152\.00/);
    expect(t).not.toMatch(/TAX \(5%\)/);
  });
  it('leaves out what the bill does not have', () => {
    const { container, unmount } = render(<ReceiptPreview order={order({ discount: 0, serviceCharge: 0, tax: 0 }) as any} settings={settings} />);
    const t = (container.textContent || '').replace(/\s+/g, ' ');
    unmount();
    expect(t).toMatch(/SUBTOTAL/);
    expect(t).not.toMatch(/DISCOUNT|SERVICE|TAX/);
  });
  it('four boxes go two by two, so a 58 mm slip never shrinks to fit them', () => {
    const src = readFileSync(resolve(__dirname, '..', 'components', 'ReceiptPreview.tsx'), 'utf8');
    expect(src).toMatch(/const cols = boxes\.length <= 3 \? boxes\.length : 2;/);
  });
});
