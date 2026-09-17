// ============================================================
// TOKEN RULES — category + individual item assignment.
//
// The client's requirement, pinned:
//   "A restaurant should be able to assign as many menu categories as
//    required ... Also add Individual Item Assignment. Category 'Burgers' is
//    NOT selected, but 'Zinger Burger' is individually selected — that item
//    must still trigger token printing. Do not make item selection dependent
//    on category selection."
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  resolveTokenRules,
  getTokenLines,
  getTokenLinesFromCart,
  orderNeedsToken,
  tokenLinesAmount,
  tokenRulesPatch,
  type TokenRuleSettings,
} from '@/lib/tokenRules';
import type { CartItem, MenuItem, Order } from '@/lib/types';

const menu = [
  { id: 'm-zinger', name: 'Zinger Burger', categoryId: 'c-burgers' },
  { id: 'm-beef', name: 'Beef Burger', categoryId: 'c-burgers' },
  { id: 'm-pizza', name: 'Fajita Pizza', categoryId: 'c-pizza' },
  { id: 'm-tikka', name: 'Chicken Tikka', categoryId: 'c-bbq' },
  { id: 'm-naan', name: 'Plain Naan', categoryId: 'c-bread' },
  { id: 'm-cola', name: 'Cola 500ml', categoryId: 'c-drinks' },
] as MenuItem[];

function line(menuItemId: string, name: string, quantity = 1, lineTotal = 100): CartItem {
  return { id: `l-${menuItemId}`, menuItemId, name, pricingType: 'fixed', price: lineTotal / quantity, quantity, lineTotal, note: '' };
}

const order = {
  items: [
    line('m-zinger', 'Zinger Burger', 2, 1100),
    line('m-beef', 'Beef Burger', 1, 500),
    line('m-pizza', 'Fajita Pizza', 1, 900),
    line('m-naan', 'Plain Naan', 8, 320),
    line('m-cola', 'Cola 500ml', 2, 240),
  ],
} as Order;

const names = (rows: { name: string }[]) => rows.map(r => r.name);

describe('resolveTokenRules', () => {
  it('reads an unlimited list of categories', () => {
    const r = resolveTokenRules({ tokenCategoryIds: ['c-burgers', 'c-pizza', 'c-bbq', 'c-drinks', 'c-bread'] });
    expect(r.categoryIds.size).toBe(5);
    expect(r.hasRules).toBe(true);
  });

  it('keeps a shop that configured the old single category working', () => {
    // Upgrading must not silently stop tokens printing.
    const r = resolveTokenRules({ tokenCategoryId: 'c-bread' });
    expect(r.categoryIds.has('c-bread')).toBe(true);
    expect(r.hasRules).toBe(true);
  });

  it('merges the legacy category into a new list rather than replacing it', () => {
    const r = resolveTokenRules({ tokenCategoryId: 'c-bread', tokenCategoryIds: ['c-bbq'] });
    expect([...r.categoryIds].sort()).toEqual(['c-bbq', 'c-bread']);
  });

  it('reports no rules when nothing is configured', () => {
    expect(resolveTokenRules({}).hasRules).toBe(false);
    expect(resolveTokenRules({ tokenCategoryIds: [] }).hasRules).toBe(false);
  });

  it('ignores malformed stored values instead of throwing', () => {
    // Deliberately malformed, as a corrupted localStorage entry would be.
    const r = resolveTokenRules({ tokenCategoryIds: 'not-an-array', tokenMenuItemIds: [null, 7, 'm-zinger'] } as unknown as TokenRuleSettings);
    expect(r.categoryIds.size).toBe(0);
    expect([...r.menuItemIds]).toEqual(['m-zinger']);
  });
});

describe('category rules', () => {
  it('puts every item of every selected category on the token', () => {
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-burgers', 'c-bread'] };
    expect(names(getTokenLines(order, settings, menu)))
      .toEqual(['Zinger Burger', 'Beef Burger', 'Plain Naan']);
  });

  it('supports many categories at once, with no built-in limit', () => {
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-burgers', 'c-pizza', 'c-bread', 'c-drinks'] };
    expect(getTokenLines(order, settings, menu)).toHaveLength(5);
  });
});

describe('individual item rules', () => {
  it('prints a token for an item whose category is NOT selected', () => {
    // The exact case from the requirement.
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: [], tokenMenuItemIds: ['m-zinger'] };
    expect(names(getTokenLines(order, settings, menu))).toEqual(['Zinger Burger']);
  });

  it('does not drag in the rest of that item\'s category', () => {
    const settings = { tokenPrintEnabled: true, tokenMenuItemIds: ['m-zinger'] };
    expect(names(getTokenLines(order, settings, menu))).not.toContain('Beef Burger');
  });
});

describe('the two rule kinds working together', () => {
  it('matches the union of categories and individual items', () => {
    const settings = {
      tokenPrintEnabled: true,
      tokenCategoryIds: ['c-bread'],
      tokenMenuItemIds: ['m-zinger'],
    };
    expect(names(getTokenLines(order, settings, menu))).toEqual(['Zinger Burger', 'Plain Naan']);
  });

  it('never double-counts an item covered by both rules', () => {
    const settings = {
      tokenPrintEnabled: true,
      tokenCategoryIds: ['c-burgers'],
      tokenMenuItemIds: ['m-zinger'],
    };
    const rows = getTokenLines(order, settings, menu);
    expect(names(rows)).toEqual(['Zinger Burger', 'Beef Burger']);
    expect(rows.filter(r => r.name === 'Zinger Burger')).toHaveLength(1);
  });

  it('carries the ordered quantity through to the slip', () => {
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-bread'] };
    expect(getTokenLines(order, settings, menu)[0]).toEqual({ name: 'Plain Naan', qty: 8 });
  });

  it('skips zero-quantity lines', () => {
    const emptied = { items: [line('m-naan', 'Plain Naan', 0, 0)] } as Order;
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-bread'] };
    expect(getTokenLines(emptied, settings, menu)).toHaveLength(0);
  });
});

describe('orderNeedsToken', () => {
  it('is false when token printing is switched off, whatever the rules say', () => {
    expect(orderNeedsToken(order, { tokenPrintEnabled: false, tokenCategoryIds: ['c-bread'] }, menu)).toBe(false);
  });

  it('is false when nothing on this order matches', () => {
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-bbq'] };
    expect(orderNeedsToken(order, settings, menu)).toBe(false);
  });

  it('is true when a category matches', () => {
    expect(orderNeedsToken(order, { tokenPrintEnabled: true, tokenCategoryIds: ['c-bread'] }, menu)).toBe(true);
  });

  it('is true when only an individual item matches', () => {
    expect(orderNeedsToken(order, { tokenPrintEnabled: true, tokenMenuItemIds: ['m-zinger'] }, menu)).toBe(true);
  });
});

describe('sales exclusion', () => {
  it('excludes exactly the lines that got a token, under both rule kinds', () => {
    const settings = { tokenPrintEnabled: true, tokenCategoryIds: ['c-bread'], tokenMenuItemIds: ['m-zinger'] };
    // Plain Naan 320 + Zinger Burger 1100
    expect(tokenLinesAmount(order, settings, menu)).toBe(1420);
  });

  it('excludes nothing when no rule is configured', () => {
    expect(tokenLinesAmount(order, { tokenPrintEnabled: true }, menu)).toBe(0);
  });
});

describe('cart selection (POS token button)', () => {
  it('returns the cart lines, not just names, so they can be removed after printing', () => {
    const cart = [line('m-zinger', 'Zinger Burger', 1, 550), line('m-pizza', 'Fajita Pizza', 1, 900)];
    const picked = getTokenLinesFromCart(cart, { tokenMenuItemIds: ['m-zinger'] }, menu);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe('l-m-zinger');
  });
});

describe('saving rules', () => {
  it('clears the legacy single category so a removed category stays removed', () => {
    const patch = tokenRulesPatch(['c-bbq'], ['m-zinger']);
    expect(patch.tokenCategoryIds).toEqual(['c-bbq']);
    expect(patch.tokenMenuItemIds).toEqual(['m-zinger']);
    expect(patch.tokenCategoryId).toBeUndefined();
    // And the saved shape round-trips through the reader.
    const r = resolveTokenRules(patch);
    expect([...r.categoryIds]).toEqual(['c-bbq']);
    expect([...r.menuItemIds]).toEqual(['m-zinger']);
  });

  it('de-duplicates a list built from repeated clicks', () => {
    const patch = tokenRulesPatch(['c-bbq', 'c-bbq'], ['m-zinger', 'm-zinger', '']);
    expect(patch.tokenCategoryIds).toEqual(['c-bbq']);
    expect(patch.tokenMenuItemIds).toEqual(['m-zinger']);
  });
});
