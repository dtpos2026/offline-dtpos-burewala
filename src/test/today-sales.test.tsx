// ============================================================
// TODAY'S SALES IN THE SUPER ADMIN — one figure per restaurant.
//
// What is pinned:
//   • the POS counts its paid bills of the current business day, the same rule
//     as its dashboard (credit, void, cancelled and running bills are not sales);
//   • the figure rides the heartbeat the POS already sends: no new request, and the
//     device document stays inside the Firestore rule (fewer than 45 fields);
//   • the heartbeat carries only the total, bill count and the day — no bill, item
//     or customer detail;
//   • the Super Admin adds up the computers of one licence, never shows yesterday's
//     figure as today's, and says "Not reported today" instead of inventing Rs 0;
//   • the dashboard shows it from the device reports it already watches.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { todaySales } from '@/lib/todaySales';
import type { BusinessDayWindow } from '@/lib/businessDay';
import { restaurantSales, reportsToday, formatSales } from '../../superadmin/src/todaySales';

const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');

// Business day 6 Oct 2026, 08:00 → 7 Oct 03:00 (local).
const START = new Date(2026, 9, 6, 8, 0).getTime();
const END = new Date(2026, 9, 7, 3, 0).getTime();
const WIN: BusinessDayWindow = { startMs: START, endMs: END, label: '2026-10-06', start: new Date(START), end: new Date(END) };
const at = (h: number, m = 0, day = 6) => new Date(2026, 9, day, h, m).toISOString();

const bill = (over: any) => ({ id: Math.random().toString(36), status: 'paid', paymentMethod: 'cash', grandTotal: 1000, createdAt: at(12), paidAt: at(12), ...over });

describe('the POS works out its figure', () => {
  it('paid bills inside the business day, including after midnight', () => {
    const orders = [
      bill({ grandTotal: 2200 }),
      bill({ grandTotal: 1500.5, paymentMethod: 'card' }),
      bill({ grandTotal: 800, paidAt: at(1, 30, 7), createdAt: at(1, 0, 7) }), // 1:30 am, same business day
      bill({ grandTotal: 999, status: 'running' }),
      bill({ grandTotal: 999, status: 'cancelled' }),
      bill({ grandTotal: 999, paymentMethod: 'credit' }),
      bill({ grandTotal: 999, paidAt: at(7, 59), createdAt: at(7, 50) }),           // before opening
      bill({ grandTotal: 999, paidAt: at(3, 0, 7), createdAt: at(2, 50, 7) }),     // after close
    ];
    expect(todaySales(orders as any, WIN)).toEqual({ day: '2026-10-06', total: 4500.5, bills: 3, dayEnd: END });
  });
  it('no sales yet is a real zero', () => {
    expect(todaySales([], WIN)).toEqual({ day: '2026-10-06', total: 0, bills: 0, dayEnd: END });
  });
});

describe('it rides the heartbeat the POS already sends', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('one PATCH of the device document, small enough for the rule, with no bill detail', async () => {
    const calls: Array<{ url: string; init?: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url: String(url), init });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const { sendHeartbeat } = await import('@/lib/cloudLink');
    const ok = await sendHeartbeat({
      deviceId: 'dev-1', licenseKey: 'DT-AAAA', business: 'Lotus Café',
      sales: { day: '2026-10-06', total: 125000, bills: 42, dayEnd: END },
    });
    expect(ok).toBe(true);
    const patches = calls.filter(c => c.init?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toMatch(/\/devices\/dev-1\?/);
    const fields = JSON.parse(patches[0].init.body).fields;
    expect(fields.salesToday).toEqual({ integerValue: '125000' });
    expect(fields.salesBills).toEqual({ integerValue: '42' });
    expect(fields.salesDay).toEqual({ stringValue: '2026-10-06' });
    expect(fields.salesDayEnd).toEqual({ integerValue: String(END) });
    // firestore.rules: devices/{id} must stay under 45 fields — with every optional field filled in.
    const allFields = Object.keys(fields).length
      + ['phone', 'owner', 'plan', 'expiryDate', 'appVersion', 'installationId', 'activatedAt', 'lastActivationAt', 'slot',
        'manufacturer', 'model', 'osName', 'osVersion', 'hostname', 'firstLoginAt', 'lastLoginAt',
        'country', 'region', 'city'].filter(k => !(k in fields)).length;
    expect(allFields).toBeLessThan(45);
    expect(read('superadmin/firestore.rules')).toMatch(/request\.resource\.data\.size\(\) < 45/);
    expect(JSON.stringify(fields)).not.toMatch(/items|customer|grandTotal|orderNumber/);
  });

  it('the POS hands its own figure to the heartbeat, and nothing breaks if it cannot', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/sales: \(\(\) => \{ try \{ return todaySales\(getOrders\(\)\); \} catch \{ return null; \} \}\)\(\),/);
    // cloudLink stays free of the bills store: only the type is imported.
    expect(read('src/lib/cloudLink.ts')).toMatch(/import type \{ TodaySales \} from '\.\/todaySales';/);
  });
});

describe('the Super Admin adds it up per restaurant', () => {
  const NOW = START + 6 * 3600_000; // 2 pm
  const dev = (over: any) => ({ deviceId: Math.random().toString(36), lastSyncAt: NOW - 120_000, salesDayEnd: END, ...over });

  it('computers of one licence add up; yesterday’s figure is not today’s', () => {
    const list = restaurantSales([
      dev({ licenseKey: 'K1', business: 'Lotus Café', salesToday: 80000, salesBills: 30 }),
      dev({ licenseKey: 'K1', business: 'Lotus Café', salesToday: 45000, salesBills: 12, lastSyncAt: NOW - 60_000 }),
      dev({ licenseKey: 'K2', business: 'Karachi Grill', salesToday: 99000, salesBills: 50, salesDayEnd: START }), // ended
      dev({ licenseKey: 'K3', business: 'Old Version Dhaba' }), // never sent a figure
      dev({ licenseKey: 'K4', salesToday: 2500.5, salesBills: 1 }),
    ], new Map([['K4', 'Burewala Biryani']]), NOW);

    expect(list.map(r => [r.name, r.total, r.bills, r.reporting, r.devices])).toEqual([
      ['Lotus Café', 125000, 42, 2, 2],
      ['Burewala Biryani', 2500.5, 1, 1, 1],
      ['Karachi Grill', 0, 0, 0, 1],
      ['Old Version Dhaba', 0, 0, 0, 1],
    ]);
    expect(list[0].updatedAt).toBe(NOW - 60_000);
    expect(reportsToday({ salesToday: 0, salesDayEnd: END }, NOW)).toBe(true); // a real zero is a figure
    expect(reportsToday({ salesDayEnd: END }, NOW)).toBe(false);
  });

  it('reads like money', () => {
    expect(formatSales(125000)).toBe('Rs. 125,000');
    expect(formatSales(2500.5)).toBe('Rs. 2,500.5');
  });

  it('the dashboard shows it from the device reports it already watches', () => {
    const app = read('superadmin/src/App.tsx');
    expect(app).toMatch(/title="Today's sales"/);
    expect(app).toMatch(/return restaurantSales\(live, names\);/);
    expect(app).toMatch(/Today's Sales · \{r\.bills\}/);
    expect(app).toMatch(/Not reported today/);
    // No new subscription for it: one watchDevices on the dashboard, as before.
    const dash = app.slice(app.indexOf('function Dashboard('), app.indexOf('function Stat('));
    expect(dash.match(/watchDevices\(/g)).toHaveLength(1);
  });
});
