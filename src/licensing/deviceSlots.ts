// ============================================================
// LICENSE DEVICE SLOTS — pure logic, koi cloud import nahi.
//
// Alag file is liye hai ke yeh asal faisla karti hai ke kaunsi machine
// license use kar sakti hai — aur is ko unit-test kiya ja sake (licenseService
// offline key helpers import karta hai).
// ============================================================

/** cloud Timestamp / number / ISO string → millis. */
function tsToMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

export type LicenseDeviceStatus = 'active' | 'unlinked';

/**
 * Ek license se juda hua device.
 * v1.0.38: pehle license me sirf EK `deviceId` string hoti thi — is liye
 * doosre PC par activation kabhi mumkin nahi tha, aur "Reset Device" purani
 * device ka record bhi mita deta tha (wapas aane par dobara license mangta tha).
 * Ab har device ka record rehta hai (history preserve) aur `status` batata hai
 * ke slot ghera hua hai ya khali.
 */
export interface LicenseDevice {
  id: string;
  name?: string;
  status: LicenseDeviceStatus;
  firstActivatedAt?: number | null;
  lastSeenAt?: number | null;
  unlinkedAt?: number | null;
  unlinkedBy?: string;
  appVersion?: string;
}

/** cloud se aaye devices ko normalize karo (purane licenses ke liye bhi). */
export function readDevices(lic: any): LicenseDevice[] {
  const raw = Array.isArray(lic?.devices) ? lic.devices : [];
  const list: LicenseDevice[] = raw
    .filter((d: any) => d && d.id)
    .map((d: any) => ({
      id: String(d.id),
      name: d.name || '',
      status: d.status === 'unlinked' ? 'unlinked' : 'active',
      firstActivatedAt: tsToMillis(d.firstActivatedAt) ?? d.firstActivatedAt ?? null,
      lastSeenAt: tsToMillis(d.lastSeenAt) ?? d.lastSeenAt ?? null,
      unlinkedAt: tsToMillis(d.unlinkedAt) ?? d.unlinkedAt ?? null,
      unlinkedBy: d.unlinkedBy || '',
      appVersion: d.appVersion || '',
    }));
  // ===== BACKWARD COMPAT (bohot ahem) =====
  // Purane licenses me sirf `deviceId` hai aur `devices` array nahi. Aise
  // license ko us device ke saath migrate karo taake pehle se activated
  // customers logout na hon.
  const legacy = String(lic?.deviceId || '').trim();
  if (legacy && !list.some(d => d.id === legacy)) {
    list.unshift({
      id: legacy,
      name: lic?.deviceName || '',
      status: 'active',
      firstActivatedAt: tsToMillis(lic?.activatedAt) ?? null,
      lastSeenAt: tsToMillis(lic?.lastSeenAt) ?? null,
    });
  }
  return list;
}

/** License par kitne devices allowed hain (default 1 — purana behaviour). */
export function readMaxDevices(lic: any): number {
  const n = Number(lic?.maxDevices ?? lic?.allowedDevices ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function activeDevices(list: LicenseDevice[]): LicenseDevice[] {
  return list.filter(d => d.status === 'active');
}

/**
 * Faisla: yeh device activate ho sakti hai ya nahi.
 * IMPORTANT: sirf ACTIVE devices ginte hain — unlinked/historical records
 * nayi activation ko block nahi karte (client ka asal masla yehi tha).
 */
/**
 * NOTE: yeh ek hi shape hai (discriminated union nahi) kyunki project me
 * `strictNullChecks: false` hai — us halat me TS union ko narrow nahi karta
 * aur `r.message` par error deta hai. Ek flat shape sab jagah safe chalti hai.
 */
export interface DeviceSlotResult {
  ok: boolean;
  /** Updated device list (sirf ok === true par meaningful). */
  devices: LicenseDevice[];
  /** true = mojooda record dobara use hua (naya slot nahi laga). */
  reused: boolean;
  /** ok === false par wajah. */
  message?: string;
}

export function resolveDeviceSlot(lic: any, deviceId: string): DeviceSlotResult {
  const list = readDevices(lic);
  const max = readMaxDevices(lic);
  const existing = list.find(d => d.id === deviceId);

  // Pehle se active — same PC dobara khul rahi hai. Koi naya slot nahi chahiye.
  if (existing && existing.status === 'active') {
    existing.lastSeenAt = Date.now();
    return { ok: true, devices: list, reused: true };
  }

  const usedSlots = activeDevices(list).length;
  if (usedSlots >= max) {
    return {
      ok: false,
      devices: list,
      reused: false,
      message: max === 1
        ? 'This license is already activated on another computer. Ask the admin to unlink the old device.'
        : `This license allows ${max} devices and all ${max} slots are in use. Ask the admin to unlink an old device.`,
    };
  }

  if (existing) {
    // Purani device wapas aa gayi (unlinked thi) — usi record ko dobara
    // active karo taake history bani rahe.
    existing.status = 'active';
    existing.lastSeenAt = Date.now();
    existing.unlinkedAt = null;
    return { ok: true, devices: list, reused: true };
  }

  list.push({
    id: deviceId,
    status: 'active',
    firstActivatedAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return { ok: true, devices: list, reused: false };
}

/** cloud me likhne ke liye plain object (undefined values allowed nahi). */
export function devicesForWrite(list: LicenseDevice[]): any[] {
  return list.map(d => ({
    id: d.id,
    name: d.name || '',
    status: d.status,
    firstActivatedAt: d.firstActivatedAt ?? null,
    lastSeenAt: d.lastSeenAt ?? null,
    unlinkedAt: d.unlinkedAt ?? null,
    unlinkedBy: d.unlinkedBy || '',
    appVersion: d.appVersion || '',
  }));
}
