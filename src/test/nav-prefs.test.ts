// ============================================================
// MODULE VISIBILITY (Settings → Modules) — navigation only.
//
// The promise: hiding a module removes a button and nothing else. Every module
// a user may open is always somewhere — in the sidebar, under More, hidden (and
// listed in Settings → Modules) — never lost; Settings can never be hidden;
// permissions stay the only thing that decides who may open a module.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { PAGES, defaultPermissionsForRole, type PageDef } from '@/lib/permissions';
import {
  DEFAULT_MAIN_KEYS, EMPTY_NAV_PREFS, LOCKED_KEYS, NAV_PREFS_KEY, moveModule, placementOf, readNavPrefs, resetNavPrefs,
  resolveNav, setPlacement, toggleFavorite, writeNavPrefs, type NavPrefs,
} from '@/lib/navPrefs';

const all = (n: ReturnType<typeof resolveNav>) => [...n.favorites, ...n.main, ...n.more, ...n.hidden, ...n.locked].map(p => p.key);
const keys = (list: PageDef[]) => list.map(p => p.key);
const adminPages = PAGES;

beforeEach(() => localStorage.clear());

describe('defaults', () => {
  it('shows the everyday modules in the sidebar, in order, and the rest under More', () => {
    const n = resolveNav(adminPages, EMPTY_NAV_PREFS);
    expect(keys(n.main)).toEqual(DEFAULT_MAIN_KEYS.filter(k => adminPages.some(p => p.key === k)));
    expect(keys(n.main)[0]).toBe('pos');
    expect(n.favorites).toEqual([]);
    expect(n.hidden).toEqual([]);
    expect(keys(n.locked)).toEqual(['settings']);
    expect(n.more.length).toBeGreaterThan(20);
    expect(keys(n.more)).not.toContain('settings');
  });

  it('no module is ever lost: every page a user may open lands in exactly one place', () => {
    const cases: NavPrefs[] = [
      EMPTY_NAV_PREFS,
      { v: 1, placement: { pos: 'hidden', dashboard: 'more', reports: 'hidden', backup: 'main' }, order: [], favorites: ['backup', 'inventory', 'hr'] },
      { v: 1, placement: Object.fromEntries(adminPages.map(p => [p.key, 'hidden' as const])), order: [], favorites: [] },
    ];
    for (const prefs of cases) {
      const placed = all(resolveNav(adminPages, prefs));
      expect([...placed].sort()).toEqual(keys(adminPages).sort());
      expect(new Set(placed).size).toBe(placed.length);
    }
  });

  it('a cashier only ever sees what the permission system gave them', () => {
    const allowed = new Set(defaultPermissionsForRole('cashier'));
    const pages = PAGES.filter(p => allowed.has(p.key));
    const n = resolveNav(pages, { ...EMPTY_NAV_PREFS, favorites: ['users', 'hr'] }); // stars for modules they may not open
    expect(all(n).every(k => allowed.has(k))).toBe(true);
    expect(keys(n.favorites)).toEqual([]); // starring something you cannot open shows nothing
    expect(all(n)).not.toContain('users');
  });
});

describe('hiding, moving and starring', () => {
  it('Hidden takes a module out of the sidebar and More but keeps it listed for Settings → Modules', () => {
    const p = setPlacement(adminPages, EMPTY_NAV_PREFS, 'kitchen', 'hidden');
    const n = resolveNav(adminPages, p);
    expect(keys(n.main)).not.toContain('kitchen');
    expect(keys(n.more)).not.toContain('kitchen');
    expect(keys(n.hidden)).toEqual(['kitchen']);
    // and it can be brought back
    const back = resolveNav(adminPages, setPlacement(adminPages, p, 'kitchen', 'main'));
    expect(keys(back.main)).toContain('kitchen');
    expect(back.hidden).toEqual([]);
  });

  it('More and Sidebar are swappable; a module moved to the sidebar joins the end of it', () => {
    const p = setPlacement(adminPages, EMPTY_NAV_PREFS, 'recipes', 'main');
    const n = resolveNav(adminPages, p);
    expect(keys(n.main).at(-1)).toBe('recipes');
    const p2 = setPlacement(adminPages, p, 'pickup', 'more');
    expect(keys(resolveNav(adminPages, p2).main)).not.toContain('pickup');
    expect(keys(resolveNav(adminPages, p2).more)).toContain('pickup');
  });

  it('Settings is locked: it cannot be hidden, moved or starred', () => {
    expect(LOCKED_KEYS).toEqual(['settings']);
    expect(placementOf('settings', { ...EMPTY_NAV_PREFS, placement: { settings: 'hidden' } })).toBe('main');
    expect(setPlacement(adminPages, EMPTY_NAV_PREFS, 'settings', 'hidden')).toBe(EMPTY_NAV_PREFS);
    expect(toggleFavorite(EMPTY_NAV_PREFS, 'settings')).toBe(EMPTY_NAV_PREFS);
    expect(moveModule(adminPages, EMPTY_NAV_PREFS, 'settings', 1)).toBe(EMPTY_NAV_PREFS);
    const n = resolveNav(adminPages, { ...EMPTY_NAV_PREFS, placement: { settings: 'hidden' } });
    expect(keys(n.locked)).toEqual(['settings']);
  });

  it('a starred module moves to the top group and leaves the main list (no duplicates)', () => {
    const p = toggleFavorite(EMPTY_NAV_PREFS, 'inventory');
    const n = resolveNav(adminPages, p);
    expect(keys(n.favorites)).toEqual(['inventory']);
    expect(keys(n.main)).not.toContain('inventory');
    expect(keys(resolveNav(adminPages, toggleFavorite(p, 'inventory')).favorites)).toEqual([]);
  });

  it('a starred module that is hidden stays hidden', () => {
    const p = setPlacement(adminPages, toggleFavorite(EMPTY_NAV_PREFS, 'reports'), 'reports', 'hidden');
    const n = resolveNav(adminPages, p);
    expect(keys(n.favorites)).toEqual([]);
    expect(keys(n.hidden)).toContain('reports');
  });

  it('Up / Down swaps with the neighbour that shares its place, and stops at the ends', () => {
    const start = keys(resolveNav(adminPages, EMPTY_NAV_PREFS).main);
    const down = moveModule(adminPages, EMPTY_NAV_PREFS, start[0], 1);
    const after = keys(resolveNav(adminPages, down).main);
    expect(after.slice(0, 2)).toEqual([start[1], start[0]]);
    expect(after.slice(2)).toEqual(start.slice(2));
    expect(moveModule(adminPages, EMPTY_NAV_PREFS, start[0], -1)).toBe(EMPTY_NAV_PREFS); // already first
    expect(moveModule(adminPages, EMPTY_NAV_PREFS, start.at(-1)!, 1)).toBe(EMPTY_NAV_PREFS); // already last
  });

  it('order edits do not disturb where the other modules sit', () => {
    const p = moveModule(adminPages, setPlacement(adminPages, EMPTY_NAV_PREFS, 'wastage', 'main'), 'wastage', -1);
    const n = resolveNav(adminPages, p);
    expect(keys(n.main).at(-2)).toBe('wastage');
    const mainSet = new Set(keys(n.main));
    for (const k of DEFAULT_MAIN_KEYS) expect(mainSet.has(k)).toBe(true);
  });
});

describe('storage', () => {
  it('reads what it wrote, per device, under its own key', () => {
    const p = setPlacement(adminPages, toggleFavorite(EMPTY_NAV_PREFS, 'hr'), 'delivery', 'hidden');
    writeNavPrefs(p);
    expect(localStorage.getItem(NAV_PREFS_KEY)).toBeTruthy();
    const back = readNavPrefs();
    expect(back.favorites).toEqual(['hr']);
    expect(back.placement.delivery).toBe('hidden');
    resetNavPrefs();
    expect(localStorage.getItem(NAV_PREFS_KEY)).toBeNull();
    expect(readNavPrefs()).toEqual(EMPTY_NAV_PREFS);
  });

  it('survives damaged storage without throwing or hiding anything', () => {
    for (const bad of ['not json', '[]', '{"placement":5}', '{"placement":{"pos":"vanish"},"order":[1,2],"favorites":"x"}', 'null']) {
      localStorage.setItem(NAV_PREFS_KEY, bad);
      const p = readNavPrefs();
      expect(p.v).toBe(1);
      expect(keys(resolveNav(adminPages, p).hidden)).toEqual([]);
    }
  });

  it('ignores a stored placement for Settings', () => {
    localStorage.setItem(NAV_PREFS_KEY, JSON.stringify({ v: 1, placement: { settings: 'hidden', pos: 'more' }, order: [], favorites: [] }));
    const p = readNavPrefs();
    expect(p.placement.settings).toBeUndefined();
    expect(p.placement.pos).toBe('more');
  });

  it('never touches business data: only its own key is written', () => {
    localStorage.setItem('desi-pos-data', '{"orders":[1]}');
    writeNavPrefs(toggleFavorite(EMPTY_NAV_PREFS, 'menu'));
    resetNavPrefs();
    expect(localStorage.getItem('desi-pos-data')).toBe('{"orders":[1]}');
  });
});
