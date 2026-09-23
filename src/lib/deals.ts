// ============================================================
// DEALS ↔ MENU — shared by manual deal creation and the Excel bulk import.
//
// A deal is billed from the POS as a menu item in the "Deals" category that
// carries the deal's own id. Keeping this in one place means a deal created
// by hand and one imported from Excel land in the menu identically.
// ============================================================
import { getCategories, saveCategory, saveMenuItem } from './store';
import type { Category, Deal, MenuItem } from './types';

export const DEALS_CATEGORY_ID = 'cat-deals';

export function ensureDealsCategory(): Category {
  const cats = getCategories();
  let cat = cats.find(c => c.id === DEALS_CATEGORY_ID) || cats.find(c => c.name.toLowerCase() === 'deals');
  if (!cat) {
    cat = { id: DEALS_CATEGORY_ID, name: 'Deals', icon: '🎁', sortOrder: cats.length };
    saveCategory(cat);
  }
  return cat;
}

export function syncDealToMenu(d: Deal) {
  const cat = ensureDealsCategory();
  const item: MenuItem = {
    id: d.id, // same id as deal so we can find/remove easily
    name: d.name,
    categoryId: cat.id,
    pricingType: 'fixed' as any,
    price: d.price,
    ratePerKg: 0,
    isActive: d.isActive,
  };
  saveMenuItem(item);
}
