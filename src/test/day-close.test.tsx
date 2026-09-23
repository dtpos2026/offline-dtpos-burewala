// ============================================================
// DAY CLOSE — Premium Phase 1, "Day Close test".
//
// The Day Close logic was moved out of Settings unchanged into its own
// screen. These pin (a) the clearing rules to what the old handler did,
// (b) that the new screen opens on the two workflows and really closes the
// day, and (c) that Settings and the menu lead straight to it.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { dayCloseGroup, clearedByDayClose, previewDayClose, type DayCloseConfig } from '@/lib/dayCloseConfig';

const CFG_DEFAULT: DayCloseConfig = {
  clearPaidOrders: true, clearRunningHoldBills: true, clearVoidComp: false, clearCreditOrders: false,
  resetTables: true, resetOrderNumber: true, autoBackup: false,
};

describe('which bills a Day Close clears (unchanged rules)', () => {
  it('groups statuses exactly as the Settings handler did', () => {
    expect(dayCloseGroup('paid')).toBe('paid');
    expect(dayCloseGroup('running')).toBe('runningHold');
    expect(dayCloseGroup('hold')).toBe('runningHold');
    for (const s of ['void', 'complimentary', 'cancelled']) expect(dayCloseGroup(s)).toBe('voidComp');
    for (const s of ['credit_pending', 'credit_received']) expect(dayCloseGroup(s)).toBe('credit');
    // never cleared by any option
    for (const s of ['partial', 'pending_approval', 'rejected']) {
      expect(dayCloseGroup(s)).toBe('kept');
      expect(clearedByDayClose(s, { ...CFG_DEFAULT, clearPaidOrders: true, clearRunningHoldBills: true, clearVoidComp: true, clearCreditOrders: true })).toBe(false);
    }
  });

  it('the confirmation preview counts what will leave the live lists, and flags held bills', () => {
    const p = previewDayClose(
      [{ status: 'paid' }, { status: 'paid' }, { status: 'hold' }, { status: 'running' }, { status: 'void' }, { status: 'partial' }],
      CFG_DEFAULT,
    );
    expect(p).toMatchObject({ paid: 2, runningHold: 2, voidComp: 0, kept: 2, unpaidCleared: 2, heldCleared: 1, total: 6 });
    expect(previewDayClose([{ status: 'hold' }], { ...CFG_DEFAULT, clearRunningHoldBills: false }).kept).toBe(1);
  });
});

// ---------- the real screen ----------
const STORE_KEY = 'desi-pos-data';
function bill(id: string, n: number, status: string) {
  return {
    id, orderNumber: n, orderType: 'dining', status,
    items: [{ id: 'l' + n, menuItemId: 'm1', name: 'Karahi', price: 1000, quantity: 1, lineTotal: 1000 }],
    subtotal: 1000, discount: 0, tax: 0, serviceCharge: 0, serviceChargePercent: 0, grandTotal: 1000,
    createdAt: new Date().toISOString(), notes: '',
  };
}
function seed(role: 'admin' | 'cashier', perms?: string[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [bill('a', 1, 'paid'), bill('b', 2, 'paid'), bill('c', 3, 'hold'), bill('d', 4, 'partial')],
    menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [],
    tables: [{ id: 't1', name: 'T-1', seats: 4, status: 'running', currentOrderId: 'c' }],
    users: [{ id: 'u1', name: 'Owner', username: 'owner', role, isActive: true, permissions: perms }],
    categories: [], settings: { name: 'Test' }, orderCounter: 4,
  }));
  localStorage.setItem('pos-user-id', 'u1');
}

async function renderPage() {
  const { default: DayClosePage } = await import('@/pages/DayClosePage');
  return render(<MemoryRouter><DayClosePage /></MemoryRouter>);
}

describe('the Day Close screen', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('opens straight onto the two workflows', async () => {
    seed('admin');
    await renderPage();
    expect(screen.getByRole('tab', { name: /Day Close/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Reset Sale/ })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 · Shift report/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Reset Sale/ }));
    expect(screen.getByText(/Reset Sale — choose what to reset/)).toBeInTheDocument();
  });

  it('warns about the bill on HOLD — UNPAID before closing', async () => {
    seed('admin');
    await renderPage();
    expect(screen.getByText(/still open \(1 on HOLD — UNPAID\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close the day \(Admin\)/ }));
    expect(await screen.findByText(/will be removed from Retrieve/)).toBeInTheDocument();
  });

  it('admin confirm: archives everything, clears per settings, frees tables', async () => {
    seed('admin');
    // jsdom has no blob URLs; the backup download step needs them.
    (URL as any).createObjectURL = vi.fn(() => 'blob:backup');
    (URL as any).revokeObjectURL = vi.fn();
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Close the day \(Admin\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirm Day Close/ }));
    const store = await import('@/lib/store');
    const { getArchivedOrders } = await import('@/lib/orderArchive');
    await waitFor(() => expect(store.getOrders().map(o => o.id)).toEqual(['d'])); // partial is never cleared
    expect(getArchivedOrders().map(o => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(store.getTables()[0].status).toBe('free');
    expect((URL as any).createObjectURL).toHaveBeenCalledTimes(1); // the JSON backup was produced first
  });

  it('a cashier with the permission can only request', async () => {
    seed('cashier', ['pos', 'day-close']);
    await renderPage();
    expect(screen.queryByRole('button', { name: /Close the day \(Admin\)/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Request Day Close/ }));
    const { getPendingDayCloseRequests } = await import('@/lib/dayCloseConfig');
    expect(getPendingDayCloseRequests()).toHaveLength(1);
    expect((await import('@/lib/store')).getOrders()).toHaveLength(4); // nothing cleared
  });

  it('the drawer float is saved (it used to be lost unless another tab was saved)', async () => {
    seed('admin');
    await renderPage();
    const input = screen.getByLabelText(/Starting cash/);
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.blur(input, { target: { value: '5000' } });
    expect(((await import('@/lib/store')).getSettings() as any).startingCash).toBe(5000);
  });
});

describe('getting there', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
  it('the menu entry and the route lead to /day-close', () => {
    expect(read('lib/permissions.ts')).toMatch(/key: 'day-close',\s+path: '\/day-close'/);
    expect(read('App.tsx')).toMatch(/<Route path="\/day-close" element=\{<DayClosePage \/>\} \/>/);
  });
  it('Settings no longer carries the workflow, it opens the screen', () => {
    const settings = read('pages/SettingsPage.tsx');
    expect(settings).not.toMatch(/handleDayClose/);
    expect(settings).toMatch(/navigate\('\/day-close'\)/);
  });
  it('bills are archived before any is removed', () => {
    const page = read('pages/DayClosePage.tsx');
    expect(page.indexOf('archiveOrders(all)')).toBeGreaterThan(0);
    expect(page.indexOf('archiveOrders(all)')).toBeLessThan(page.indexOf('deleteOrder(o.id)'));
  });
});
