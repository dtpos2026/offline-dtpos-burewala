// ============================================================
// ADMIN PASSWORD RESET — Super Admin sets a new administrator password and
// the offline POS applies it by itself.
//
// Pinned:
//   • the sealed code opens only with the licence it was made for, cannot be
//     altered, expires, and never contains the password in the clear;
//   • the store changes ONLY an administrator account (never a cashier), can
//     bring back a switched-off admin, can create one when none exists, and
//     lifts a PIN lock;
//   • the POS picks the command up from adminResets/{licence}, applies it
//     once, tells Super Admin through the heartbeat, and ignores a stale,
//     foreign or unreadable one;
//   • the same code works when pasted by hand (a PC that never goes online).
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sealReset, openReset, passwordProblem, RESET_TTL_MS } from '@/licensing/adminReset';

const KEY = 'DTPOS-ST-ABCD-EFGH-JKLM';
const STORE_KEY = 'desi-pos-data';
type SeedUser = Record<string, unknown>;
const USERS = (): SeedUser[] => [
  { id: 'admin-default', name: 'Administrator', username: 'admin', password: 'forgotten', role: 'admin', isActive: true, pin: '1234' },
  { id: 'u-cashier', name: 'Cashier', username: 'cashier', password: 'c-pass', role: 'cashier', isActive: true },
];
function seed(users: SeedUser[] = USERS()) {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [], menuItems: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], users, categories: [],
    paymentAccounts: [], settings: { name: 'Sample Restaurant' }, orderCounter: 0,
  }));
}

describe('the sealed code', () => {
  it('opens with the licence it was made for', async () => {
    const { token, command } = await sealReset(KEY, { password: 'N3w-Pass!' });
    expect(token.startsWith('DTP1.')).toBe(true);
    const r = await openReset(token, KEY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.password).toBe('N3w-Pass!');
      expect(r.command.id).toBe(command.id);
      expect(r.command.username).toBe('');
    }
  });

  it('does not carry the password in the clear', async () => {
    const { token } = await sealReset(KEY, { password: 'Plain-Secret-77' });
    expect(token).not.toContain('Plain-Secret-77');
    expect(atob(token.slice(5).replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('Plain-Secret-77');
  });

  it('reads the key the way the POS stores it (case and dashes do not matter)', async () => {
    const { token } = await sealReset(KEY, { password: 'abcdef' });
    expect((await openReset(token, KEY.toLowerCase().replace(/-/g, ' '))).ok).toBe(true);
  });

  it('refuses another restaurant\'s licence', async () => {
    const { token } = await sealReset(KEY, { password: 'abcdef' });
    const r = await openReset(token, 'DTPOS-ST-ZZZZ-YYYY-XXXX');
    expect(r).toEqual({ ok: false, reason: 'wrong-licence' });
  });

  it('refuses a code that was altered', async () => {
    const { token } = await sealReset(KEY, { password: 'abcdef' });
    const flipped = token.slice(0, -4) + (token.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect((await openReset(flipped, KEY)).ok).toBe(false);
  });

  it('refuses text that is not a code', async () => {
    for (const bad of ['', 'hello', 'DTP1.', 'DTP1.@@@', 'DTR1.abc.def', 'DTP1.AAAA']) {
      expect(await openReset(bad, KEY)).toEqual({ ok: false, reason: 'format' });
    }
  });

  it('expires after seven days', async () => {
    const t0 = 1_700_000_000_000;
    const { token } = await sealReset(KEY, { password: 'abcdef' }, t0);
    expect((await openReset(token, KEY, t0 + RESET_TTL_MS - 1000)).ok).toBe(true);
    expect(await openReset(token, KEY, t0 + RESET_TTL_MS + 1000)).toEqual({ ok: false, reason: 'expired' });
  });

  it('survives being pasted with line breaks', async () => {
    const { token } = await sealReset(KEY, { password: 'abcdef' });
    const wrapped = token.replace(/(.{40})/g, '$1\n  ');
    expect((await openReset(wrapped, KEY)).ok).toBe(true);
  });

  it('checks the password before sealing', async () => {
    expect(passwordProblem('abc')).toMatch(/at least 6/);
    expect(passwordProblem(' abcdef')).toMatch(/space/);
    expect(passwordProblem('x'.repeat(65))).toMatch(/at most 64/);
    expect(passwordProblem('abcdef')).toBe('');
    await expect(sealReset(KEY, { password: 'abc' })).rejects.toThrow(/at least 6/);
  });
});

describe('the store', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('sets the administrator password, and the new one signs in', async () => {
    seed();
    const s = await import('@/lib/store');
    expect(s.applyAdminPasswordReset({ password: 'Brand-New-1' })).toEqual({ outcome: 'applied', username: 'admin' });
    expect(s.authenticateUser('admin', 'Brand-New-1').reason).toBe('ok');
    expect(s.authenticateUser('admin', 'forgotten').reason).toBe('bad_password');
  });

  it('never touches another user', async () => {
    seed();
    const s = await import('@/lib/store');
    s.applyAdminPasswordReset({ password: 'Brand-New-1' });
    expect(s.authenticateUser('cashier', 'c-pass').reason).toBe('ok');
    expect(s.applyAdminPasswordReset({ username: 'cashier', password: 'Brand-New-1' })).toEqual({ outcome: 'not-admin' });
    expect(s.authenticateUser('cashier', 'c-pass').reason).toBe('ok');
  });

  it('can name an administrator other than "admin"', async () => {
    seed([...USERS(), { id: 'u-owner', name: 'Owner', username: 'owner', password: 'old', role: 'admin', isActive: true }]);
    const s = await import('@/lib/store');
    expect(s.applyAdminPasswordReset({ username: ' Owner ', password: 'Owner-Pass-9' })).toEqual({ outcome: 'applied', username: 'owner' });
    expect(s.authenticateUser('owner', 'Owner-Pass-9').reason).toBe('ok');
    expect(s.authenticateUser('admin', 'forgotten').reason).toBe('ok');
    expect(s.applyAdminPasswordReset({ username: 'nobody', password: 'Owner-Pass-9' })).toEqual({ outcome: 'not-found' });
  });

  it('prefers the main "admin" account when several administrators exist', async () => {
    seed([{ id: 'u-owner', name: 'Owner', username: 'owner', password: 'old', role: 'admin', isActive: true }, ...USERS()]);
    const s = await import('@/lib/store');
    expect(s.applyAdminPasswordReset({ password: 'Main-Pass-1' }).username).toBe('admin');
    expect(s.authenticateUser('owner', 'old').reason).toBe('ok');
  });

  it('brings back an administrator who had been switched off', async () => {
    seed([{ id: 'admin-default', name: 'Administrator', username: 'admin', password: 'x', role: 'admin', isActive: false }, USERS()[1]]);
    const s = await import('@/lib/store');
    expect(s.applyAdminPasswordReset({ password: 'Back-Again-1' }).outcome).toBe('reactivated');
    expect(s.authenticateUser('admin', 'Back-Again-1').reason).toBe('ok');
  });

  it('restores a demoted "admin" account instead of making a second one', async () => {
    seed([{ id: 'admin-default', name: 'Administrator', username: 'admin', password: 'x', role: 'cashier', isActive: true }]);
    const s = await import('@/lib/store');
    expect(s.applyAdminPasswordReset({ password: 'Restored-1' })).toEqual({ outcome: 'reactivated', username: 'admin' });
    expect(s.getUsers().filter(u => u.username === 'admin')).toHaveLength(1);
    expect(s.getUsers().find(u => u.username === 'admin')?.role).toBe('admin');
    expect(s.authenticateUser('admin', 'Restored-1').reason).toBe('ok');
  });

  it('lifts a PIN lock so the administrator can get in', async () => {
    seed();
    localStorage.setItem('dtpos-pin-lock', JSON.stringify({ 'admin-default': { fails: 5, until: Date.now() + 60_000 }, other: { fails: 2 } }));
    const s = await import('@/lib/store');
    s.applyAdminPasswordReset({ password: 'Brand-New-1' });
    expect(s.authenticateUserByPin('admin-default', '1234').reason).toBe('ok');
    expect(JSON.parse(localStorage.getItem('dtpos-pin-lock') || '{}').other).toEqual({ fails: 2 });
  });
});

// ---------- the POS picks the command up from Firestore ----------
describe('the POS picks the command up', () => {
  const docs = new Map<string, Record<string, unknown>>();
  let requests: string[] = [];
  let httpStatus = 200;

  const idOf = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
  const putCommand = async (password = 'Cloud-Pass-1', username = '') => {
    const { token } = await sealReset(KEY, { password, username });
    docs.set(`adminResets/${idOf(KEY)}`, { token: { stringValue: token } });
    return token;
  };

  beforeEach(() => {
    localStorage.clear();
    docs.clear();
    requests = [];
    httpStatus = 200;
    vi.resetModules();
    vi.doMock('@/licensing/licenseService', () => ({ loadLicense: async () => ({ licenseKey: KEY, deviceId: 'DEV-1' }) }));
    vi.stubGlobal('fetch', async (input: string) => {
      const path = decodeURIComponent(new URL(input).pathname.split('/documents/')[1] || '');
      requests.push(path);
      if (httpStatus !== 200) return { ok: false, status: httpStatus, json: async () => ({}) } as Response;
      const d = docs.get(path);
      return d ? { ok: true, status: 200, json: async () => ({ name: path, fields: d }) } as Response
        : { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    seed();
  });

  it('applies a waiting command once and records it for the heartbeat', async () => {
    await putCommand();
    const sync = await import('@/licensing/adminResetSync');
    const s = await import('@/lib/store');
    const heard: string[] = [];
    window.addEventListener('dtpos-admin-reset', e => heard.push((e as CustomEvent).detail.outcome), { once: true });

    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'applied', outcome: 'applied', username: 'admin' });
    expect(requests).toContain(`adminResets/${idOf(KEY)}`);
    expect(s.authenticateUser('admin', 'Cloud-Pass-1').reason).toBe('ok');
    expect(heard).toEqual(['applied']);

    const { getAdminResetLog } = await import('@/lib/cloudLink');
    expect(getAdminResetLog().last).toMatchObject({ result: 'applied' });

    // The administrator changes it again; the same command must not come back.
    s.applyAdminPasswordReset({ password: 'Chosen-By-Owner-1' });
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'already' });
    expect(s.authenticateUser('admin', 'Chosen-By-Owner-1').reason).toBe('ok');
  });

  it('applies a newer command after an older one', async () => {
    const sync = await import('@/licensing/adminResetSync');
    const s = await import('@/lib/store');
    await putCommand('First-Pass-1');
    await sync.syncAdminReset({ force: true });
    await putCommand('Second-Pass-2');
    expect((await sync.syncAdminReset({ force: true })).status).toBe('applied');
    expect(s.authenticateUser('admin', 'Second-Pass-2').reason).toBe('ok');
  });

  it('does nothing when no command is waiting', async () => {
    const sync = await import('@/licensing/adminResetSync');
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'none' });
    expect((await import('@/lib/store')).authenticateUser('admin', 'forgotten').reason).toBe('ok');
  });

  it('does nothing when the server cannot be read (rules not published, offline)', async () => {
    await putCommand();
    httpStatus = 403;
    const sync = await import('@/licensing/adminResetSync');
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'offline' });
    expect((await import('@/lib/store')).authenticateUser('admin', 'forgotten').reason).toBe('ok');
  });

  it('ignores a command sealed for another restaurant', async () => {
    const { token } = await sealReset('DTPOS-ST-ZZZZ-YYYY-XXXX', { password: 'Not-For-You-1' });
    docs.set(`adminResets/${idOf(KEY)}`, { token: { stringValue: token } });
    const sync = await import('@/licensing/adminResetSync');
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'invalid', reason: 'wrong-licence' });
    expect((await import('@/lib/store')).authenticateUser('admin', 'forgotten').reason).toBe('ok');
  });

  it('checks the server only every ten minutes on its own, but at once when asked', async () => {
    const sync = await import('@/licensing/adminResetSync');
    await sync.syncAdminReset();            // first automatic look
    await sync.syncAdminReset();            // too soon: no request
    await sync.syncAdminReset();
    expect(requests).toHaveLength(1);
    await sync.syncAdminReset({ force: true });
    expect(requests).toHaveLength(2);
  });

  it('the sign-in screen, where someone is waiting, may ask more often', async () => {
    const sync = await import('@/licensing/adminResetSync');
    await sync.syncAdminReset({ minIntervalMs: 55_000 });
    await sync.syncAdminReset({ minIntervalMs: 55_000 });   // within a minute: no request
    expect(requests).toHaveLength(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 56_000);
    await sync.syncAdminReset({ minIntervalMs: 55_000 });   // a minute later: asks again
    await sync.syncAdminReset();                            // ... but an ordinary caller still waits ten minutes
    vi.useRealTimers();
    expect(requests).toHaveLength(2);
  });

  it('reports a command that names the wrong user instead of retrying it', async () => {
    await putCommand('Cloud-Pass-1', 'cashier');
    const sync = await import('@/licensing/adminResetSync');
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'rejected', outcome: 'not-admin' });
    expect(await sync.syncAdminReset({ force: true })).toEqual({ status: 'already' });
    const { getAdminResetLog } = await import('@/lib/cloudLink');
    expect(getAdminResetLog().last?.result).toBe('not-admin');
  });

  it('works from a pasted code with no internet at all', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('offline'); });
    const sync = await import('@/licensing/adminResetSync');
    const { token } = await sealReset(KEY, { password: 'Pasted-Pass-1' });
    expect(await sync.applyResetToken(`  ${token}\n`, KEY)).toEqual({ status: 'applied', outcome: 'applied', username: 'admin' });
    expect((await import('@/lib/store')).authenticateUser('admin', 'Pasted-Pass-1').reason).toBe('ok');
    expect(await sync.applyResetToken('nonsense', KEY)).toEqual({ status: 'invalid', reason: 'format' });
  });

  it('explains each outcome in plain English', async () => {
    const { describeReset } = await import('@/licensing/adminResetSync');
    expect(describeReset({ status: 'applied', outcome: 'applied', username: 'admin' })).toEqual({ ok: true, text: expect.stringContaining('Sign in as "admin"') });
    expect(describeReset({ status: 'none' }).ok).toBe(false);
    expect(describeReset({ status: 'invalid', reason: 'expired' }).text).toMatch(/expired/);
  });
});

describe('the heartbeat reports the reset', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('sends the last reset, and the whole device document stays under the Firestore field limit', async () => {
    let body: { fields: Record<string, unknown> } | null = null;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') body = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const link = await import('@/lib/cloudLink');
    link.saveAdminResetLog({ applied: ['abc'], last: { id: 'abc', at: 1_700_000_000_000, result: 'applied' } });
    link.cacheDeviceLocation({ coords: { latitude: 30.1, longitude: 72.6, accuracy: 20 } } as GeolocationPosition);
    link.recordLogin();
    const ok = await link.sendHeartbeat({
      deviceId: 'DEV-1', licenseKey: KEY, business: 'B', owner: 'O', phone: '0300', plan: 'yearly', expiryDate: 1, appVersion: '1.21.0',
      activatedAt: 1, lastActivationAt: 1, installationId: 'I', slot: 'confirmed',
      sales: { day: '2026-10-06', total: 1, bills: 1, dayEnd: 2 } as never,
    });
    expect(ok).toBe(true);
    const f = body!.fields;
    expect(f.adminResetId).toEqual({ stringValue: 'abc' });
    expect(f.adminResetResult).toEqual({ stringValue: 'applied' });
    expect(f.adminResetAt).toEqual({ integerValue: '1700000000000' });
    // firestore.rules: devices/{id} must stay under 45 fields, with every optional field filled in.
    const optional = ['manufacturer', 'model', 'osName', 'osVersion', 'hostname', 'country', 'region', 'city'];
    expect(Object.keys(f).length + optional.filter(k => !(k in f)).length).toBeLessThan(45);
    expect(readFileSync(resolve(__dirname, '..', '..', 'superadmin/firestore.rules'), 'utf8')).toMatch(/request\.resource\.data\.size\(\) < 45/);
  });

  it('sends nothing about resets until one has been applied', async () => {
    let body: { fields: Record<string, unknown> } | null = null;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') body = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const link = await import('@/lib/cloudLink');
    await link.sendHeartbeat({ deviceId: 'DEV-1', licenseKey: KEY });
    expect(Object.keys(body!.fields).some(k => k.startsWith('adminReset'))).toBe(false);
  });
});

describe('the Firestore rule', () => {
  const rules = readFileSync(resolve(__dirname, '..', '..', 'superadmin/firestore.rules'), 'utf8');
  const block = rules.slice(rules.indexOf('match /adminResets/'), rules.indexOf('match /{document=**}'));

  it('lets the POS read one command by ID but never list or write', () => {
    expect(block).toMatch(/allow get: if true;/);
    expect(block).toMatch(/allow list, write: if request\.auth != null;/);
    expect(block).not.toMatch(/allow (create|update|delete)[^;]*: if true/);
  });

  it('is documented verbatim in the Super Admin reference', () => {
    const doc = readFileSync(resolve(__dirname, '..', '..', 'docs/SUPER_ADMIN.md'), 'utf8');
    expect(doc).toContain('match /adminResets/{licenseId} {');
  });
});
