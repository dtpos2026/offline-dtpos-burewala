// Menu Manager's Price column shows what the item really costs.
import { describe, it, expect } from 'vitest';
import { menuPriceLabel } from '@/lib/menuPrice';

describe('menuPriceLabel', () => {
  const base = { price: 0, ratePerKg: 0 };
  it('fixed, weight and open price', () => {
    expect(menuPriceLabel({ ...base, pricingType: 'fixed', price: 550 })).toBe('PKR 550');
    expect(menuPriceLabel({ ...base, pricingType: 'weight', ratePerKg: 3600 })).toBe('PKR 3600/kg');
    expect(menuPriceLabel({ ...base, pricingType: 'manual' })).toBe('Open price');
  });
  it('size and inch items show their price range, never "PKR 0/kg"', () => {
    const pizza = { ...base, pricingType: 'size' as const, sizeVariants: [{ name: 'Small', price: 750 }, { name: 'Medium', price: 1250 }, { name: 'Large', price: 1750 }] };
    expect(menuPriceLabel(pizza)).toBe('PKR 750–1750');
    expect(menuPriceLabel({ ...base, pricingType: 'inch', inchVariants: [{ name: '9"', price: 900 }] })).toBe('PKR 900');
    expect(menuPriceLabel({ ...base, pricingType: 'both', sizeVariants: [{ name: 'S', price: 500 }], inchVariants: [{ name: '12"', price: 1400 }] })).toBe('PKR 500–1400');
    expect(menuPriceLabel({ ...base, pricingType: 'size', sizeVariants: [] })).toBe('—');
  });
});
