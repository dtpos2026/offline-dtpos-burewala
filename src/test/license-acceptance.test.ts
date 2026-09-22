// ============================================================
// LICENCE ACCEPTANCE — Premium Phase 1, scenarios A–E.
//
// Runs the real licenseService / licenseSync / cloudLink code against:
//   • an in-memory Electron bridge (one encrypted vault per computer)
//   • a fake Firestore REST server that applies the same append-only rule
//     the published Firestore rules apply to licenseDevices/{key}
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mintLicenseKey } from '@/licensing/licenseKey';

// ---------- fake Firestore ----------
type Doc = { fields: Record<string, any>; updateTime: string };
const server = new Map<string, Doc>();
let clock = 1;
let requests: string[] = [];

const str = (v: string) => ({ stringValue: v });
const int = (v: number) => ({ integerValue: String(v) });
const docId = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);

function adminSetStatus(collection: 'licenseStatus' | 'deviceStatus', id: string, status: string, updatedAt = Date.now()) {
  server.set(`${collection}/${docId(id)}`, { fields: { status: str(status), updatedAt: int(updatedAt) }, updateTime: `t${clock++}` });
}
function adminRemoveFromLedger(key: string, deviceId: string) {
  const d = server.get(`licenseDevices/${docId(key)}`);
  if (!d) return;
  const values = (d.fields.devices.arrayValue.values as any[]).filter(v => v.stringValue !== deviceId);
  server.set(`licenseDevices/${docId(key)}`, { fields: { ...d.fields, devices: { arrayValue: { values } } }, updateTime: `t${clock++}` });
}
function ledger(key: string): string[] {
  const d = server.get(`licenseDevices/${docId(key)}`);
  return d ? (d.fields.devices.arrayValue.values as any[]).map(v => v.stringValue) : [];
}

const respond = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

async function fakeFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input);
  const docPath = decodeURIComponent(url.pathname.split('/documents/')[1] || '');
  const method = init?.method || 'GET';
  requests.push(`${method} ${docPath}`);
  const existing = server.get(docPath);
  if (method === 'GET') return existing ? respond(200, { ...existing, name: docPath }) : respond(404, { error: { code: 404 } });
  if (method === 'PATCH') {
    const body = JSON.parse(String(init?.body || '{}'));
    if (docPath.startsWith('licenseDevices/')) {
      if (url.searchParams.get('currentDocument.exists') === 'false' && existing) return respond(409);
      const pre = url.searchParams.get('currentDocument.updateTime');
      if (pre && (!existing || existing.updateTime !== pre)) return respond(400);
      // Firestore rule: create with exactly one device, or append exactly one.
      const next = (body.fields.devices.arrayValue.values as any[]).map(v => v.stringValue);
      const prev = existing ? ledger(docPath.split('/')[1]) : [];
      if (existing ? !(next.length === prev.length + 1 && prev.every(p => next.includes(p))) : next.length !== 1) return respond(403);
    }
    server.set(docPath, { fields: body.fields, updateTime: `t${clock++}` });
    return respond(200, {});
  }
  return respond(405);
}

// ---------- fake computers ----------
const vaults = new Map<string, unknown>();
let currentComputer = 'HW-COMPUTER-A';
let online = true;

function useComputer(id: string) {
  currentComputer = id;
  (window as any).electronAPI = {
    getHardwareId: async () => ({ success: true, hardwareId: currentComputer, installationId: `inst-${currentComputer}` }),
    licenseLoad: async () => ({ success: true, data: vaults.has(currentComputer) ? structuredClone(vaults.get(currentComputer)) : null }),
    licenseSave: async (p: unknown) => { vaults.set(currentComputer, structuredClone(p)); return { success: true }; },
    licenseClear: async () => { vaults.delete(currentComputer); return { success: true }; },
  };
}

/** A fresh app start on the current computer: new module instances. */
async function boot() {
  vi.resetModules();
  const svc = await import('@/licensing/licenseService');
  const sync = await import('@/licensing/licenseSync');
  return { ...svc, ...sync };
}

async function activateOn(computer: string, key: string) {
  useComputer(computer);
  const app = await boot();
  const r = await app.activate({ licenseKey: key, businessName: 'Burewala Grill', ownerName: 'Owner', mobileNumber: '03001234567' }, '1.12.0');
  return { app, r };
}

beforeEach(() => {
  server.clear();
  vaults.clear();
  requests = [];
  online = true;
  localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

describe('Licence A — activate online, restart offline, no re-prompt', () => {
  it('opens from the local vault with no network call, and stays usable', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    const { r } = await activateOn('HW-COMPUTER-A', key);
    expect(r.ok).toBe(true);
    expect(r.slot?.result).toBe('confirmed');
    expect(ledger(key)).toEqual(['HW-COMPUTER-A']);

    // Restart with the internet off.
    online = false;
    requests = [];
    const app = await boot();
    const gate = await app.evaluateGate('1.12.0');
    expect(gate.state).toBe('ok');
    expect(requests).toEqual([]); // the gate never touched the network
    expect((await app.syncLicenseStatus()).reachable).toBe(false);

    // And again (reopen).
    const again = await (await boot()).evaluateGate('1.12.0');
    expect(again.state).toBe('ok');
  });

  it('the gate does not wait for the server even when online', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    await activateOn('HW-COMPUTER-A', key);
    requests = [];
    const gate = await (await boot()).evaluateGate('1.12.0');
    expect(gate.state).toBe('ok');
    expect(requests).toEqual([]);
  });
});

describe('Licence B — a second computer is a different device; limits apply', () => {
  it('a 1-device key refuses computer B with a clear message and saves nothing', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    await activateOn('HW-COMPUTER-A', key);
    const { app, r } = await activateOn('HW-COMPUTER-B', key);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/maximum number of computers \(1\)/);
    expect(vaults.has('HW-COMPUTER-B')).toBe(false);
    expect((await app.evaluateGate('1.12.0')).state).toBe('unactivated');
    // Computer A is untouched.
    useComputer('HW-COMPUTER-A');
    expect((await (await boot()).evaluateGate('1.12.0')).state).toBe('ok');
  });

  it('a 2-device key accepts B and refuses C', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    expect((await activateOn('HW-COMPUTER-A', key)).r.ok).toBe(true);
    expect((await activateOn('HW-COMPUTER-B', key)).r.ok).toBe(true);
    const c = await activateOn('HW-COMPUTER-C', key);
    expect(c.r.ok).toBe(false);
    expect(ledger(key)).toEqual(['HW-COMPUTER-A', 'HW-COMPUTER-B']);
  });

  it('re-activating the same computer does not use a second slot', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    await activateOn('HW-COMPUTER-A', key);
    const again = await activateOn('HW-COMPUTER-A', key);
    expect(again.r.ok).toBe(true);
    expect(ledger(key)).toEqual(['HW-COMPUTER-A']);
  });

  it('an offline activation beyond the limit is caught at the first sync', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    await activateOn('HW-COMPUTER-A', key);
    online = false;
    const { app, r } = await activateOn('HW-COMPUTER-B', key);
    expect(r.ok).toBe(true);
    expect(r.slot?.result).toBe('unavailable');
    online = true;
    const s = await app.syncLicenseStatus();
    expect(s.verdict?.status).toBe('device-limit');
    const gate = await app.evaluateGate('1.12.0');
    expect(gate.state).toBe('blocked');
    if (gate.state === 'blocked') expect(gate.message).toMatch(/maximum number of computers/);
  });
});

describe('Licence C — suspend reaches the POS on the next sync', () => {
  it('blocks with the exact message, stays blocked offline, and lifts when re-activated', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    const { app } = await activateOn('HW-COMPUTER-A', key);
    adminSetStatus('licenseStatus', key, 'suspended');
    const s = await app.syncLicenseStatus();
    expect(s.reachable).toBe(true);
    expect(s.changed).toBe(true);
    const gate = await app.evaluateGate('1.12.0');
    expect(gate.state).toBe('blocked');
    if (gate.state === 'blocked') expect(gate.message).toBe('Your software license has been suspended by the administrator.');

    // Offline restart — the verdict lives in the vault.
    online = false;
    localStorage.clear(); // clearing browser storage must not undo it
    expect((await (await boot()).evaluateGate('1.12.0')).state).toBe('blocked');

    online = true;
    adminSetStatus('licenseStatus', key, 'active');
    const app2 = await boot();
    await app2.syncLicenseStatus();
    expect((await app2.evaluateGate('1.12.0')).state).toBe('ok');
  });

  it('a pending licence shows the payment message', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    const { app } = await activateOn('HW-COMPUTER-A', key);
    adminSetStatus('licenseStatus', key, 'pending');
    await app.syncLicenseStatus();
    const gate = await app.evaluateGate('1.12.0');
    expect(gate.state === 'blocked' && gate.message).toBe('Your license/payment is pending. Please contact the administrator.');
  });

  it('a half answer (one document unreachable) changes nothing', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    const { app } = await activateOn('HW-COMPUTER-A', key);
    adminSetStatus('licenseStatus', key, 'suspended');
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => (String(u).includes('/deviceStatus/') ? respond(500) : fakeFetch(u, i))));
    expect((await app.syncLicenseStatus()).reachable).toBe(false);
    expect((await app.evaluateGate('1.12.0')).state).toBe('ok');
  });
});

describe('Licence D — revoke', () => {
  it('a revoked device is blocked with the revoke message; re-activating does not lift it', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    const { app } = await activateOn('HW-COMPUTER-A', key);
    adminSetStatus('deviceStatus', 'HW-COMPUTER-A', 'revoked');
    await app.syncLicenseStatus();
    const gate = await app.evaluateGate('1.12.0');
    expect(gate.state === 'blocked' && gate.message).toBe('Your software license has been revoked.');

    const again = await activateOn('HW-COMPUTER-A', key);
    await again.app.syncLicenseStatus();
    expect((await again.app.evaluateGate('1.12.0')).state).toBe('blocked');
  });
});

describe('Licence E — deleting one device does not touch the others', () => {
  it('A is removed, B keeps working; A can be registered again into the freed slot', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    await activateOn('HW-COMPUTER-A', key);
    const b = await activateOn('HW-COMPUTER-B', key);

    // Super Admin: Delete device A (tombstone + slot freed).
    adminSetStatus('deviceStatus', 'HW-COMPUTER-A', 'deleted', Date.now());
    adminRemoveFromLedger(key, 'HW-COMPUTER-A');

    useComputer('HW-COMPUTER-A');
    const a = await boot();
    await a.syncLicenseStatus();
    const gateA = await a.evaluateGate('1.12.0');
    expect(gateA.state).toBe('blocked');
    if (gateA.state === 'blocked') expect(gateA.reason).toBe('deleted');

    useComputer('HW-COMPUTER-B');
    const b2 = await boot();
    await b2.syncLicenseStatus();
    expect((await b2.evaluateGate('1.12.0')).state).toBe('ok');
    expect(b.r.ok).toBe(true);

    // DELETE BUG (v1.11): re-entering the key on A kept the old activation
    // date, so the tombstone kept blocking forever. Now it registers again.
    await new Promise(r => setTimeout(r, 5));
    const again = await activateOn('HW-COMPUTER-A', key);
    expect(again.r.ok).toBe(true);
    await again.app.syncLicenseStatus();
    expect((await again.app.evaluateGate('1.12.0')).state).toBe('ok');
    expect(ledger(key).sort()).toEqual(['HW-COMPUTER-A', 'HW-COMPUTER-B']);
  });

  it('a per-device suspend blocks only that device', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 2 });
    await activateOn('HW-COMPUTER-A', key);
    await activateOn('HW-COMPUTER-B', key);
    adminSetStatus('deviceStatus', 'HW-COMPUTER-A', 'suspended');

    useComputer('HW-COMPUTER-A');
    const a = await boot();
    await a.syncLicenseStatus();
    expect((await a.evaluateGate('1.12.0')).state).toBe('blocked');

    useComputer('HW-COMPUTER-B');
    const bb = await boot();
    await bb.syncLicenseStatus();
    expect((await bb.evaluateGate('1.12.0')).state).toBe('ok');
  });
});

describe('upgrade: licences activated before v1.12', () => {
  it('a legacy install is registered even when the ledger is already full (grandfathered)', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    await activateOn('HW-COMPUTER-A', key);
    // Computer B was activated by v1.11 (no slot record) and has been running.
    useComputer('HW-COMPUTER-B');
    vaults.set('HW-COMPUTER-B', {
      licenseKey: key, businessName: 'Burewala Grill', ownerName: 'Owner', mobileNumber: '0300',
      plan: 'yearly', status: 'active', expiryDate: null, deviceId: 'HW-COMPUTER-B', maxDevices: 1,
      activatedAt: Date.now() - 86400000, lastVerifiedAt: Date.now(), lastSeenClock: Date.now(),
    });
    const app = await boot();
    const s = await app.syncLicenseStatus();
    expect(s.verdict?.status).toBe('active');
    expect((await app.evaluateGate('1.12.0')).state).toBe('ok');
    expect(ledger(key)).toEqual(['HW-COMPUTER-A', 'HW-COMPUTER-B']);
  });

  it('a v1.11 "deleted" verdict in browser storage is still honoured until the first sync', async () => {
    const { key } = await mintLicenseKey({ plan: 'yearly', maxDevices: 1 });
    useComputer('HW-COMPUTER-A');
    const t = Date.now() - 1000;
    vaults.set('HW-COMPUTER-A', {
      licenseKey: key, businessName: 'X', ownerName: 'Y', mobileNumber: '0', plan: 'yearly', status: 'active',
      expiryDate: null, deviceId: 'HW-COMPUTER-A', maxDevices: 1, activatedAt: t - 86400000, lastVerifiedAt: t, lastSeenClock: t,
    });
    localStorage.setItem('dtpos-remote-verdict', JSON.stringify({ status: 'suspended', checkedAt: t, key }));
    online = false;
    expect((await (await boot()).evaluateGate('1.12.0')).state).toBe('blocked');
  });
});
