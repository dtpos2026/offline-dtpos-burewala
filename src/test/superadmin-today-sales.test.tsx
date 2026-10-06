// ============================================================
// SUPER ADMIN DASHBOARD — the "Today's sales" panel, rendered.
//
// The panel reads the device reports the dashboard already watches; here those
// reports come from a stubbed watchDevices. Pinned: each restaurant with its
// figure, the all-restaurants total, an honest "Not reported today", and no
// panel at all when the cloud cannot be read.
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const devices = vi.hoisted(() => ({ list: null as any[] | null }));
vi.mock('../../superadmin/src/cloud', async (orig) => {
  const real: any = await orig();
  const out: any = { ...real };
  for (const k of Object.keys(real)) if (k.startsWith('watch')) out[k] = () => () => {};
  out.watchAdmin = (cb: (u: any) => void) => { cb({ email: 'admin@digitaltarget.pk' }); return () => {}; };
  out.watchDevices = (cb: (l: any[]) => void, onErr?: (e: Error) => void) => {
    if (devices.list) cb(devices.list); else onErr?.(new Error('offline'));
    return () => {};
  };
  out.pushClient = async () => {};
  out.removeClient = async () => {};
  return out;
});
vi.mock('../../superadmin/src/DeviceMap', () => ({ default: () => null, escapeHtml: (s: string) => s }));
vi.mock('../../superadmin/src/LiveDeviceMap', () => ({ default: () => null }));

const HOUR = 3600_000;
const dev = (over: any) => ({ deviceId: Math.random().toString(36).slice(2), lastSyncAt: Date.now() - 2 * 60_000, salesDayEnd: Date.now() + 8 * HOUR, ...over });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('dtpos-superadmin-registry', JSON.stringify([
    { key: 'K1', business: 'Restaurant A', owner: 'A', phone: '0300', plan: 'yearly', maxDevices: 2, expiryDate: null, issuedAt: Date.now(), devices: [] },
  ]));
});

async function openDashboard() {
  const { default: App } = await import('../../superadmin/src/App');
  render(<App />);
}

describe('Today’s sales on the Super Admin dashboard', () => {
  it('each restaurant with its figure, and the total', async () => {
    devices.list = [
      dev({ licenseKey: 'K1', salesToday: 80000, salesBills: 30 }),
      dev({ licenseKey: 'K1', salesToday: 45000, salesBills: 12 }),
      dev({ licenseKey: 'K2', business: 'Restaurant B', salesToday: 64250, salesBills: 21 }),
      dev({ licenseKey: 'K3', business: 'Restaurant C', salesToday: 5000, salesDayEnd: Date.now() - HOUR }), // yesterday's
    ];
    await openDashboard();
    expect(await screen.findByText("Today's sales")).toBeInTheDocument();
    const rows = document.querySelectorAll('[data-today-sales-row]');
    const text = Array.from(rows).map(r => (r.textContent || '').replace(/\s+/g, ' '));
    expect(text[0]).toMatch(/Restaurant A.*Today's Sales · 42 bills · .*2 of 2 computers.*Rs\. 125,000/);
    expect(text[1]).toMatch(/Restaurant B.*Today's Sales · 21 bills.*Rs\. 64,250/);
    expect(text[2]).toMatch(/Restaurant C.*Not reported today.*—/);
    expect(text[2]).not.toMatch(/5,000/);
    expect(document.querySelector('[data-today-sales-total]')!.textContent).toMatch(/All restaurants: Rs\. 189,250/);
  });

  it('says so when nobody has reported, and shows no panel when the cloud cannot be read', async () => {
    devices.list = [];
    await openDashboard();
    expect(await screen.findByText(/No restaurant has reported yet/)).toBeInTheDocument();
    cleanup();
    devices.list = null;
    await openDashboard();
    await screen.findByText('Licence health');
    expect(screen.queryByText("Today's sales")).toBeNull();
  });
});
