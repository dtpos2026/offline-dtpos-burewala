// The Price column of Menu Manager: one price, a per-kg rate, the size / inch
// range, or "Open price". (Earlier every non-fixed item showed its
// per-kg rate, so pizzas priced by size read "PKR 0/kg".)
import type { MenuItem } from './types';

/** The Price column: one price, a per-kg rate, the size / inch range, or "Open price". */
export function menuPriceLabel(item: Pick<MenuItem, 'pricingType' | 'price' | 'ratePerKg' | 'sizeVariants' | 'inchVariants'>): string {
  if (item.pricingType === 'fixed') return `PKR ${item.price}`;
  if (item.pricingType === 'weight') return `PKR ${item.ratePerKg}/kg`;
  if (item.pricingType === 'manual') return 'Open price';
  const prices = [...(item.sizeVariants || []), ...(item.inchVariants || [])].map(v => Number(v.price) || 0).filter(n => n > 0);
  if (!prices.length) return item.price ? `PKR ${item.price}` : '—';
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? `PKR ${lo}` : `PKR ${lo}–${hi}`;
}
