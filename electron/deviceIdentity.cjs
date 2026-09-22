// ============================================================
// DEVICE IDENTITY + LICENCE VAULT (v1.12.0)
//
// Up to v1.11.0 the hardware ID mixed in the MAC address of the first network
// adapter that was UP. Windows drops a disconnected Wi-Fi/Ethernet adapter
// from os.networkInterfaces(), so with the internet off the hardware ID
// changed, the vault key changed with it, the vault could not be opened and
// the POS asked for the licence key again. The same drift created duplicate
// "ghost" rows in the Super Admin device list.
//
// The identity is now bound to values that do not depend on the network:
//   • Windows: the MachineGuid Windows writes once at install time
//   • Linux:   /etc/machine-id        • macOS: IOPlatformUUID
//
//   userData/device-identity.json  { deviceId, installationId, binding }
//   userData/license.vault         "DTV2" + iv + tag + AES-256-GCM data
//
// `binding` is a hash of the machine fingerprint, so an identity file copied
// to another computer is detected and replaced, and the vault key is derived
// from the same fingerprint, so a copied vault cannot be opened.
//
// Existing installs keep their device ID: a legacy vault is opened by
// re-deriving the old hardware ID from every MAC the machine owns (including
// disconnected adapters, via getmac), then rewritten in the v2 format.
// ============================================================
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const VAULT_MAGIC = Buffer.from('DTV2', 'ascii');
const IDENTITY_FILE = 'device-identity.json';
const VAULT_FILE = 'license.vault';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- host facts ----------
function hostFacts() {
  const cpus = os.cpus() || [];
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus.length ? cpus[0].model : 'unknown-cpu',
    cores: cpus.length,
    memGb: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    hostname: os.hostname(),
  };
}

// ---------- legacy (<= v1.11.0) — only used to open old vaults ----------
function legacyHardwareId(mac, facts) {
  const raw = [facts.platform, facts.arch, facts.cpuModel, facts.cores, facts.memGb, mac, facts.hostname].join('|');
  return 'HW-' + sha256hex(raw).slice(0, 32).toUpperCase();
}
const legacyVaultKey = (hwid) => sha256('dtpos-lic::' + hwid);

/** MACs in Node's format (lower-case, colon separated) from `getmac /v /fo csv /nh`. */
function parseGetmac(stdout) {
  const out = [];
  const re = /\b([0-9A-Fa-f]{2}(?:[-:][0-9A-Fa-f]{2}){5})\b/g;
  let m;
  while ((m = re.exec(String(stdout || '')))) out.push(m[1].replace(/-/g, ':').toLowerCase());
  return out;
}

/** Every MAC the legacy formula could have used, in its own preference order first. */
function candidateMacs(nets, extra) {
  const list = [];
  const push = (mac) => {
    const v = String(mac || '').toLowerCase();
    if (!v || v === '00:00:00:00:00:00' || list.includes(v)) return;
    list.push(v);
  };
  for (const name of Object.keys(nets || {}).sort()) {
    for (const ni of nets[name] || []) if (ni && !ni.internal) push(ni.mac);
  }
  for (const mac of extra || []) push(mac);
  list.push(''); // the legacy formula with no adapter up at all
  return list;
}

// ---------- current fingerprint ----------
function parseMachineGuid(stdout) {
  const m = /MachineGuid\s+REG_SZ\s+([0-9A-Fa-f-]{36})/.exec(String(stdout || ''));
  return m ? m[1].toLowerCase() : '';
}

function parseIoregUuid(stdout) {
  const m = /"IOPlatformUUID"\s*=\s*"([0-9A-Fa-f-]{36})"/.exec(String(stdout || ''));
  return m ? m[1].toLowerCase() : '';
}

const fingerprintOf = (source, value, facts) => `${source}:${value}|${facts.platform}|${facts.arch}`;
const bindingOf = (fingerprint) => sha256hex('dtpos-bind::' + fingerprint);
const vaultKeyOf = (fingerprint) => sha256('dtpos-lic-v2::' + fingerprint);
const derivedDeviceId = (fingerprint) => 'HW-' + sha256hex('dtpos-device::' + fingerprint).slice(0, 32).toUpperCase();

// ---------- vault codec ----------
function encryptVault(key, obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([VAULT_MAGIC, iv, cipher.getAuthTag(), data]);
}

const isV2Vault = (buf) => Buffer.isBuffer(buf) && buf.length > 32 && buf.subarray(0, 4).equals(VAULT_MAGIC);

/** Throws when the key is wrong or the file was edited. */
function decryptVault(key, buf) {
  const body = isV2Vault(buf) ? buf.subarray(4) : buf;
  const iv = body.subarray(0, 12);
  const tag = body.subarray(12, 28);
  const data = body.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

function tryDecrypt(key, buf) {
  try { return decryptVault(key, buf); } catch { return null; }
}

/** Write to a temp file and rename, so a power cut never leaves half a vault. */
function atomicWrite(file, buf) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

/**
 * @param {object} deps
 *   userDataDir         directory holding the identity file and the vault
 *   run(cmd, args, ms)  resolves stdout ('' on failure) — injected for tests
 *   platform            defaults to process.platform
 *   facts               defaults to hostFacts()
 *   nets                defaults to os.networkInterfaces()
 *   readText(file)      optional, for /etc/machine-id in tests
 *   log(level, event, detail)
 */
function createIdentityStore(deps) {
  const platform = deps.platform || process.platform;
  const log = deps.log || (() => {});
  const run = deps.run;
  const identityPath = () => path.join(deps.userDataDir(), IDENTITY_FILE);
  const vaultPath = () => path.join(deps.userDataDir(), VAULT_FILE);
  const readText = deps.readText || ((f) => fs.readFileSync(f, 'utf8'));

  let memo = null;

  async function readFingerprint(facts) {
    if (platform === 'win32') {
      for (let attempt = 0; attempt < 3; attempt++) {
        const guid = parseMachineGuid(await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], 5000));
        if (guid) return { fingerprint: fingerprintOf('win', guid, facts), source: 'machine-guid' };
      }
      const ps = String(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid"], 8000)).trim().toLowerCase();
      if (/^[0-9a-f-]{36}$/.test(ps)) return { fingerprint: fingerprintOf('win', ps, facts), source: 'machine-guid' };
      return null;
    }
    if (platform === 'linux') {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try {
          const v = String(readText(f)).trim().toLowerCase();
          if (/^[0-9a-f]{32}$/.test(v)) return { fingerprint: fingerprintOf('linux', v, facts), source: 'machine-id' };
        } catch { /* try the next one */ }
      }
      return null;
    }
    if (platform === 'darwin') {
      const uuid = parseIoregUuid(await run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], 5000));
      if (uuid) return { fingerprint: fingerprintOf('mac', uuid, facts), source: 'platform-uuid' };
      return null;
    }
    return null;
  }

  function readIdentityFile() {
    try { return JSON.parse(fs.readFileSync(identityPath(), 'utf8')); } catch { return null; }
  }

  function readVaultFile() {
    try { return fs.existsSync(vaultPath()) ? fs.readFileSync(vaultPath()) : null; } catch { return null; }
  }

  async function legacyMacs() {
    const extra = platform === 'win32' ? parseGetmac(await run('getmac', ['/v', '/fo', 'csv', '/nh'], 6000)) : [];
    return candidateMacs(deps.nets ? deps.nets() : os.networkInterfaces(), extra);
  }

  /** Open a pre-v1.12 vault with any MAC this machine owns. */
  async function openLegacyVault(buf, facts) {
    const macs = await legacyMacs();
    const ids = macs.map(mac => legacyHardwareId(mac, facts));
    ids.push('HW-UNKNOWN');
    for (const hwid of ids) {
      const lic = tryDecrypt(legacyVaultKey(hwid), buf);
      if (lic) return { lic, hwid };
    }
    return null;
  }

  async function build() {
    const facts = deps.facts || hostFacts();
    const fp = await readFingerprint(facts);
    const idFile = readIdentityFile();

    if (!fp) {
      // Never fall back to a weaker fingerprint for a machine that already has
      // one: the vault would look foreign and the POS would ask for the key.
      log('ERROR', 'device-identity', 'machine fingerprint could not be read');
      return { error: 'identity-unavailable' };
    }

    const binding = bindingOf(fp.fingerprint);
    const idValid = !!idFile && idFile.binding === binding && typeof idFile.deviceId === 'string' && !!idFile.deviceId;
    if (idFile && !idValid) log('WARN', 'device-identity', 'identity file belongs to another computer or is damaged — issuing a new one');

    const key = vaultKeyOf(fp.fingerprint);
    let deviceId = idValid ? idFile.deviceId : '';
    let installationId = idValid && idFile.installationId ? idFile.installationId : '';
    let migrated = false;

    const buf = readVaultFile();
    if (buf && !isV2Vault(buf)) {
      const legacy = await openLegacyVault(buf, facts);
      if (legacy) {
        const lic = { ...legacy.lic, deviceId: legacy.lic.deviceId || legacy.hwid };
        try {
          fs.copyFileSync(vaultPath(), vaultPath() + '.v1.bak');
          atomicWrite(vaultPath(), encryptVault(key, lic));
          migrated = true;
          deviceId = lic.deviceId;
          log('INFO', 'device-identity', 'licence vault migrated to the network-independent format');
        } catch (e) {
          log('ERROR', 'device-identity', 'vault migration write failed: ' + e);
        }
      } else {
        log('WARN', 'device-identity', 'legacy licence vault could not be opened on this computer');
      }
    } else if (buf) {
      const lic = tryDecrypt(key, buf);
      // The licence remembers the ID the server knows this machine by.
      if (lic && lic.deviceId) deviceId = lic.deviceId;
    }

    if (!deviceId) deviceId = derivedDeviceId(fp.fingerprint);
    if (!installationId) installationId = crypto.randomUUID();

    const next = {
      version: 1, deviceId, installationId, binding,
      fingerprintSource: fp.source,
      createdAt: idValid && idFile.createdAt ? idFile.createdAt : Date.now(),
    };
    if (!idValid || idFile.deviceId !== deviceId || idFile.installationId !== installationId) {
      try { atomicWrite(identityPath(), Buffer.from(JSON.stringify(next, null, 2))); }
      catch (e) { log('ERROR', 'device-identity', 'identity file write failed: ' + e); }
    }
    return { deviceId, installationId, source: fp.source, migrated, key };
  }

  /** Resolved once per run; a failed read is retried on the next call. */
  async function resolve() {
    if (!memo) memo = build().then(r => { if (r.error) memo = null; return r; }, e => { memo = null; throw e; });
    return memo;
  }

  async function loadLicense() {
    const id = await resolve();
    if (id.error) return { success: true, data: null, identityUnavailable: true };
    const buf = readVaultFile();
    if (!buf) return { success: true, data: null };
    const lic = isV2Vault(buf) ? tryDecrypt(id.key, buf) : null;
    if (!lic) {
      log('WARN', 'license-load', 'vault could not be opened (copied from another computer or damaged)');
      return { success: true, data: null, tampered: true };
    }
    return { success: true, data: lic };
  }

  async function saveLicense(payload) {
    const id = await resolve();
    if (id.error) return { success: false, error: 'identity-unavailable' };
    atomicWrite(vaultPath(), encryptVault(id.key, payload));
    return { success: true };
  }

  function clearLicense() {
    if (fs.existsSync(vaultPath())) fs.unlinkSync(vaultPath());
    return { success: true };
  }

  async function describe() {
    const id = await resolve();
    if (id.error) return { success: false, error: id.error };
    return { success: true, hardwareId: id.deviceId, deviceId: id.deviceId, installationId: id.installationId, source: id.source, migrated: id.migrated };
  }

  return { resolve, loadLicense, saveLicense, clearLicense, describe };
}

module.exports = {
  createIdentityStore,
  // exported for tests
  legacyHardwareId, legacyVaultKey, parseGetmac, candidateMacs, parseMachineGuid, parseIoregUuid,
  fingerprintOf, bindingOf, vaultKeyOf, derivedDeviceId, encryptVault, decryptVault, isV2Vault, hostFacts,
};
