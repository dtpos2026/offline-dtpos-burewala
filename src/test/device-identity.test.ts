// ============================================================
// DEVICE IDENTITY — "restart without internet asks for the licence again".
//
// Root cause (v1.11.0 and earlier): the hardware ID contained the MAC of the
// first network adapter that was UP. With Wi-Fi/Ethernet disconnected Windows
// drops that adapter from os.networkInterfaces(), the ID changed, the vault key
// changed and the vault could not be opened.
//
// These tests drive the real electron/deviceIdentity.cjs against a temp
// userData folder with a fake `reg` / `getmac`.
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const idm = require_('../../electron/deviceIdentity.cjs');
const {
  createIdentityStore, legacyHardwareId, legacyVaultKey, parseGetmac, candidateMacs,
  parseMachineGuid, isV2Vault,
} = idm;

const FACTS = { platform: 'win32', arch: 'x64', cpuModel: 'Intel(R) Core(TM) i5-8250U', cores: 8, memGb: 8, hostname: 'CASHIER-1' };
const GUID_A = '5f0c6a8e-1111-4a8b-9c3d-000000000001';
const GUID_B = '5f0c6a8e-2222-4a8b-9c3d-000000000002';
const WIFI = 'a4:5e:60:11:22:33';
const ETH = '10:7b:44:aa:bb:cc';

const regOut = (guid: string) =>
  `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    ${guid}\r\n\r\n`;
const getmacOut = (rows: [string, string, string][]) =>
  rows.map(([name, mac, transport]) => `"${name}","Adapter","${mac.replace(/:/g, '-').toUpperCase()}","${transport}"`).join('\r\n');

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtpos-id-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function store(opts: {
  guid?: string | null;
  nets?: Record<string, { mac: string; internal: boolean }[]>;
  getmac?: string;
  facts?: typeof FACTS;
}) {
  const logs: string[] = [];
  const s = createIdentityStore({
    userDataDir: () => dir,
    platform: 'win32',
    facts: opts.facts || FACTS,
    nets: () => opts.nets || {},
    run: async (cmd: string) => {
      if (cmd === 'reg') return opts.guid ? regOut(opts.guid) : '';
      if (cmd === 'powershell.exe') return opts.guid || '';
      if (cmd === 'getmac') return opts.getmac || '';
      return '';
    },
    log: (_l: string, e: string, d: string) => logs.push(`${e}: ${d}`),
  });
  return { s, logs };
}

/** Write a vault exactly the way v1.11.0 did (no header, key from the legacy HWID). */
function writeLegacyVault(mac: string, payload: object) {
  const crypto = require_('crypto');
  const hwid = legacyHardwareId(mac, FACTS);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', legacyVaultKey(hwid), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ ...payload, deviceId: hwid }), 'utf8'), cipher.final()]);
  fs.writeFileSync(path.join(dir, 'license.vault'), Buffer.concat([iv, cipher.getAuthTag(), data]));
  return hwid;
}

const LIC = { licenseKey: 'DTPOS-TEST-TEST-TEST-TEST', businessName: 'Burewala Grill' };

describe('parsers', () => {
  it('reads MachineGuid from reg.exe output', () => {
    expect(parseMachineGuid(regOut(GUID_A))).toBe(GUID_A);
    expect(parseMachineGuid('ERROR: The system was unable to find the specified registry key')).toBe('');
  });

  it('reads every MAC from getmac, including disconnected adapters', () => {
    const out = getmacOut([['Wi-Fi', WIFI, 'Media disconnected'], ['Ethernet', ETH, '\\Device\\Tcpip_{X}'], ['VPN', 'N/A', 'Disabled']]);
    expect(parseGetmac(out)).toEqual([WIFI, ETH]);
  });

  it('keeps the legacy preference order and always tries "no adapter"', () => {
    const nets = { 'Wi-Fi': [{ mac: WIFI, internal: false }], Loopback: [{ mac: '00:00:00:00:00:00', internal: true }] };
    expect(candidateMacs(nets, [ETH, WIFI])).toEqual([WIFI, ETH, '']);
  });
});

describe('stable identity', () => {
  it('a fresh install gets an ID that does not change when the network does', async () => {
    const online = store({ guid: GUID_A, nets: { 'Wi-Fi': [{ mac: WIFI, internal: false }] } }).s;
    const a = await online.describe();
    expect(a.success).toBe(true);
    await online.saveLicense({ ...LIC, deviceId: a.deviceId });
    expect(isV2Vault(fs.readFileSync(path.join(dir, 'license.vault')))).toBe(true);

    // Restart with every adapter down.
    const offline = store({ guid: GUID_A, nets: {} }).s;
    const b = await offline.describe();
    expect(b.deviceId).toBe(a.deviceId);
    expect(b.installationId).toBe(a.installationId);
    const loaded = await offline.loadLicense();
    expect(loaded.data?.licenseKey).toBe(LIC.licenseKey);
    expect(loaded.tampered).toBeFalsy();
  });

  it('a computer rename does not lose the licence', async () => {
    const s1 = store({ guid: GUID_A }).s;
    const id = await s1.describe();
    await s1.saveLicense({ ...LIC, deviceId: id.deviceId });
    const s2 = store({ guid: GUID_A, facts: { ...FACTS, hostname: 'COUNTER-PC' } }).s;
    expect((await s2.loadLicense()).data?.licenseKey).toBe(LIC.licenseKey);
  });

  it('two computers get different IDs', async () => {
    const a = await store({ guid: GUID_A }).s.describe();
    fs.rmSync(path.join(dir, 'device-identity.json'));
    const b = await store({ guid: GUID_B }).s.describe();
    expect(a.deviceId).not.toBe(b.deviceId);
  });
});

describe('upgrade from v1.11.0 (legacy vault)', () => {
  it('REGRESSION: activated with Wi-Fi on, restarted with Wi-Fi off — opens, keeps its device ID', async () => {
    const legacyId = writeLegacyVault(WIFI, LIC);
    // Offline: Wi-Fi is missing from os.networkInterfaces(), but getmac still lists it.
    const { s, logs } = store({ guid: GUID_A, nets: {}, getmac: getmacOut([['Wi-Fi', WIFI, 'Media disconnected']]) });
    const r = await s.loadLicense();
    expect(r.data?.licenseKey).toBe(LIC.licenseKey);
    expect((await s.describe()).deviceId).toBe(legacyId);
    expect(logs.join('\n')).toMatch(/migrated/);
    // Rewritten in the new format, original kept as a backup.
    expect(isV2Vault(fs.readFileSync(path.join(dir, 'license.vault')))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'license.vault.v1.bak'))).toBe(true);

    // From now on no MAC is needed at all.
    const later = store({ guid: GUID_A, nets: {}, getmac: '' }).s;
    expect((await later.loadLicense()).data?.licenseKey).toBe(LIC.licenseKey);
    expect((await later.describe()).deviceId).toBe(legacyId);
  });

  it('a vault written while every adapter was down (empty MAC) also migrates', async () => {
    const legacyId = writeLegacyVault('', LIC);
    const s = store({ guid: GUID_A, nets: { Ethernet: [{ mac: ETH, internal: false }] } }).s;
    expect((await s.loadLicense()).data?.licenseKey).toBe(LIC.licenseKey);
    expect((await s.describe()).deviceId).toBe(legacyId);
  });
});

describe('copy protection', () => {
  it('a vault and identity file copied to another computer cannot be opened', async () => {
    const a = store({ guid: GUID_A }).s;
    const idA = await a.describe();
    await a.saveLicense({ ...LIC, deviceId: idA.deviceId });

    // Same folder, different machine.
    const { s: b, logs } = store({ guid: GUID_B });
    const r = await b.loadLicense();
    expect(r.data).toBeNull();
    expect(r.tampered).toBe(true);
    const idB = await b.describe();
    expect(idB.deviceId).not.toBe(idA.deviceId);
    expect(idB.installationId).not.toBe(idA.installationId);
    expect(logs.join('\n')).toMatch(/belongs to another computer/);
  });

  it('an edited vault is rejected', async () => {
    const s = store({ guid: GUID_A }).s;
    await s.saveLicense({ ...LIC, deviceId: (await s.describe()).deviceId });
    const file = path.join(dir, 'license.vault');
    const buf = fs.readFileSync(file);
    buf[buf.length - 1] ^= 0xff;
    fs.writeFileSync(file, buf);
    expect((await store({ guid: GUID_A }).s.loadLicense()).tampered).toBe(true);
  });
});

describe('identity unavailable', () => {
  it('never falls back to a different fingerprint, and retries on the next call', async () => {
    const a = store({ guid: GUID_A }).s;
    await a.saveLicense({ ...LIC, deviceId: (await a.describe()).deviceId });

    let guid: string | null = null;
    const s = createIdentityStore({
      userDataDir: () => dir, platform: 'win32', facts: FACTS, nets: () => ({}),
      run: async (cmd: string) => (cmd === 'reg' ? (guid ? regOut(guid) : '') : (cmd === 'powershell.exe' ? (guid || '') : '')),
    });
    const first = await s.loadLicense();
    expect(first.identityUnavailable).toBe(true);
    expect(first.tampered).toBeFalsy();
    expect(fs.existsSync(path.join(dir, 'license.vault'))).toBe(true); // nothing destroyed
    expect((await s.saveLicense({ ...LIC })).success).toBe(false);

    guid = GUID_A; // registry readable again
    expect((await s.loadLicense()).data?.licenseKey).toBe(LIC.licenseKey);
  });
});
