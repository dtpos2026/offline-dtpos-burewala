// ============================================================
// STOCK ENGINE — deducts inventory stock when a sale happens.
//
// Previously this did not exist: inventory items were added
// but stock never decreased on sale ("Inventory not
// working"). Now stock is consumed for every paid order.
//
// Two methods (priority order):
//   1. RECIPE — the menu item's recipe components are deducted
//      (restaurant: 1 burger = 1 bun + 150g meat …)
//   2. DIRECT LINK — if MenuItem.inventoryItemId is set, 1 sale = 1 unit
//      deducted (for minimart/retail; weight items deduct in kg)
//
// Idempotent: the `stockConsumed` flag is set on the order, so
// re-saving/printing/editing does not cause double deduction.
// ============================================================
import type { Order, InventoryItem, MenuItem, Recipe } from './types';

export interface StockMovement {
  id: string;
  at: number;
  orderId: string;
  orderNumber?: number | string;
  inventoryItemId: string;
  itemName: string;
  qtyBefore: number;
  qtyChange: number;   // negative = sale
  qtyAfter: number;
  reason: 'sale' | 'sale-reversal' | 'manual';
}

const MOVE_KEY = 'dtpos-stock-movements';
const MAX_MOVES = 2000;

export function getStockMovements(): StockMovement[] {
  try { return JSON.parse(localStorage.getItem(MOVE_KEY) || '[]'); } catch { return []; }
}

function appendMovements(list: StockMovement[]) {
  if (!list.length) return;
  try {
    const all = [...getStockMovements(), ...list].slice(-MAX_MOVES);
    localStorage.setItem(MOVE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event('dtpos-stock-change'));
  } catch {}
}

/** Convert g/ml to base unit (kg/l) — for recipe component units. */
function toBaseQty(qty: number, unit: string, baseUnit?: string): number {
  const u = String(unit || '').toLowerCase();
  const b = String(baseUnit || '').toLowerCase();
  if ((u === 'g' && (b === 'kg' || b === '')) || (u === 'ml' && (b === 'l' || b === ''))) return qty / 1000;
  if (u === 'kg' && b === 'g') return qty * 1000;
  if (u === 'l' && b === 'ml') return qty * 1000;
  return qty;
}

export interface ConsumeDeps {
  getInventory: () => InventoryItem[];
  getMenuItems: () => MenuItem[];
  getRecipes: () => Recipe[];
  saveInventoryItem: (i: InventoryItem) => void;
  /** Append rows to the Stock Log the Inventory page shows. Optional. */
  appendStockLogs?: (rows: { inventoryItemId: string; type: 'sale'; quantity: number; note: string }[]) => void;
}

/**
 * Consume stock for an order. Returns how many items were adjusted.
 * Only runs for paid/credit_received orders, and only once.
 */
export function consumeStockForOrder(order: Order, deps: ConsumeDeps): { changed: number; consumed: boolean } {
  if (!order) return { changed: 0, consumed: false };
  const counted = order.status === 'paid' || (order.status as any) === 'credit_received';
  if (!counted) return { changed: 0, consumed: false };
  if ((order as any).stockConsumed) return { changed: 0, consumed: true }; // already done

  const inventory = deps.getInventory();
  if (!inventory.length) { (order as any).stockConsumed = true; return { changed: 0, consumed: true }; }

  const menu = deps.getMenuItems();
  const recipes = deps.getRecipes();
  const invById = new Map(inventory.map(i => [i.id, { ...i }]));
  const menuById = new Map(menu.map(m => [m.id, m]));

  // menuItemId → recipe (default recipe; variant recipes future-safe)
  const recipeFor = (menuItemId: string): Recipe | undefined =>
    recipes.find(r => r.menuItemId === menuItemId && !r.variantKey)
    || recipes.find(r => r.menuItemId === menuItemId);

  const deductions = new Map<string, number>(); // inventoryItemId → base qty to deduct

  for (const line of ((order.items || []) as any[])) {
    const mi = menuById.get(line.menuItemId);
    if (!mi) continue;
    const qty = Number(line.quantity || 0) || 0;
    // Weight items: calculated in kg (from weightGrams)
    const kg = Number(line.weightGrams || 0) / 1000;
    const multiplier = mi.pricingType === 'weight' ? (kg > 0 ? kg : qty) : qty;
    if (multiplier <= 0) continue;

    const recipe = recipeFor(mi.id);
    if (recipe && recipe.components?.length) {
      for (const c of recipe.components) {
        const inv = invById.get(c.inventoryItemId);
        if (!inv) continue;
        const base = toBaseQty(Number(c.quantity || 0), c.unit, inv.baseUnit);
        if (base > 0) deductions.set(inv.id, (deductions.get(inv.id) || 0) + base * multiplier);
      }
      continue;
    }
    // Direct stock link (retail/minimart). When the menu item has no explicit
    // link, fall back to matching on barcode and then on name — minimart
    // catalogues are often imported without the link being set.
    let directId: string | undefined = (mi as any).inventoryItemId;
    if (!directId || !invById.has(directId)) {
      const barcode = String((mi as any).barcode || '').trim();
      const name = String(mi.name || '').trim().toLowerCase();
      directId = undefined;
      for (const inv of invById.values()) {
        if (barcode && String((inv as any).barcode || '').trim() === barcode) { directId = inv.id; break; }
      }
      if (!directId && name) {
        for (const inv of invById.values()) {
          if (String(inv.name || '').trim().toLowerCase() === name) { directId = inv.id; break; }
        }
      }
    }
    if (directId && invById.has(directId)) {
      deductions.set(directId, (deductions.get(directId) || 0) + multiplier);
    }
  }

  const moves: StockMovement[] = [];
  let changed = 0;
  for (const [invId, amount] of deductions) {
    const inv = invById.get(invId);
    if (!inv || amount <= 0) continue;
    const before = Number(inv.quantity || 0);
    const after = Math.round((before - amount) * 1000) / 1000;
    inv.quantity = after;
    deps.saveInventoryItem(inv);
    changed++;
    moves.push({
      id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      orderId: order.id,
      orderNumber: (order as any).orderNumber,
      inventoryItemId: inv.id,
      itemName: inv.name,
      qtyBefore: before,
      qtyChange: -amount,
      qtyAfter: after,
      reason: 'sale',
    });
  }
  appendMovements(moves);
  // Mirror into the Stock Log so the Inventory page keeps showing sale
  // deductions exactly as it did when three different code paths wrote them.
  if (deps.appendStockLogs && moves.length) {
    deps.appendStockLogs(moves.map(m => ({
      inventoryItemId: m.inventoryItemId,
      type: 'sale' as const,
      quantity: Math.abs(m.qtyChange),
      note: `Auto-deduct • Order #${(order as any).orderNumber ?? ''} • sale`,
    })));
  }
  (order as any).stockConsumed = true;
  try {
    if (changed) console.log('%c[stock]', 'color:#0ea5e9;font-weight:700', 'consumed for order', (order as any).orderNumber, moves.map(m => `${m.itemName} ${m.qtyChange}`));
  } catch {}
  return { changed, consumed: true };
}

/** Restore stock on void/refund (reversal). */
export function reverseStockForOrder(order: Order, deps: ConsumeDeps): number {
  if (!order || !(order as any).stockConsumed) return 0;
  const moves = getStockMovements().filter(m => m.orderId === order.id && m.reason === 'sale');
  if (!moves.length) return 0;
  const inventory = deps.getInventory();
  const invById = new Map(inventory.map(i => [i.id, { ...i }]));
  const back: StockMovement[] = [];
  let n = 0;
  for (const m of moves) {
    const inv = invById.get(m.inventoryItemId);
    if (!inv) continue;
    const before = Number(inv.quantity || 0);
    const after = Math.round((before + Math.abs(m.qtyChange)) * 1000) / 1000;
    inv.quantity = after;
    deps.saveInventoryItem(inv);
    n++;
    back.push({ ...m, id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), qtyBefore: before, qtyChange: Math.abs(m.qtyChange), qtyAfter: after, reason: 'sale-reversal' });
  }
  appendMovements(back);
  (order as any).stockConsumed = false;
  return n;
}
