// The Customer Intelligence card finds a customer's bills whether the phone
// was typed as 0322-6677889, 03226677889 or 923226677889.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const order = (n: number, phone: string) => ({
  id: `o${n}`, orderNumber: n, orderType: 'delivery', status: 'paid', items: [], subtotal: 1000, discount: 0, tax: 0,
  serviceCharge: 0, serviceChargePercent: 0, grandTotal: 1000, createdAt: new Date().toISOString(), notes: '',
  customer: { id: phone, name: 'Zainab Ali', phone, address: '' },
});

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  localStorage.setItem('desi-pos-data', JSON.stringify({
    orders: [order(1, '0322-6677889'), order(2, '03226677889'), order(3, '0300-1234567')],
    menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], users: [], categories: [], settings: { name: 'T' }, orderCounter: 3,
  }));
});

describe('getCustomerOrders', () => {
  it('matches the typed, digits-only and normalised forms of one number', async () => {
    const { getCustomerOrders, computeCustomerStats } = await import('@/lib/customers');
    for (const key of ['0322-6677889', '03226677889', '923226677889']) {
      expect(getCustomerOrders(key).map(o => o.orderNumber).sort(), key).toEqual([1, 2]);
    }
    expect(computeCustomerStats('0322-6677889').totalOrders).toBe(2);
    expect(getCustomerOrders('0311-0000000')).toEqual([]);
  });
});
