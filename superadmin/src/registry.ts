// ============================================================
// CLIENT REGISTRY — the Super Admin panel's local database.
//
// Everything lives in this browser's localStorage. There is no server and
// no cloud, so the one real risk is losing the machine: Export backup
// writes the whole registry to a JSON file, and Import reads it back.
// ============================================================
import type { LicensePlan } from '@pos/licensing/licenseKey';

export type ClientStatus = 'active' | 'expired' | 'suspended';

export interface DeviceRecord {
  /** Hardware ID reported by the shop's activation code. */
  id: string;
  activatedAt: number;
  lat?: number;
  lng?: number;
  appVersion?: string;
  /** Set when Digital Target approved a device beyond the key's device limit. */
  approved?: boolean;
}

export interface Client {
  /** The license key — also the primary key of this registry. */
  key: string;
  business: string;
  owner: string;
  phone: string;
  plan: LicensePlan;
  maxDevices: number;
  /** Epoch millis, or null for a lifetime licence. */
  expiryDate: number | null;
  issuedAt: number;
  /** Set by hand when Digital Target stops supporting a shop. */
  suspended?: boolean;
  notes?: string;
  /** Filled in when an activation code is imported. */
  devices: DeviceRecord[];
}

const KEY = 'dtpos-superadmin-registry';

export function loadClients(): Client[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.map(normalise) : [];
  } catch {
    return [];
  }
}

function normalise(c: Partial<Client>): Client {
  return {
    key: String(c.key || ''),
    business: c.business || '',
    owner: c.owner || '',
    phone: c.phone || '',
    plan: (c.plan || 'monthly') as LicensePlan,
    maxDevices: Number(c.maxDevices) || 1,
    expiryDate: typeof c.expiryDate === 'number' ? c.expiryDate : null,
    issuedAt: Number(c.issuedAt) || Date.now(),
    suspended: !!c.suspended,
    notes: c.notes || '',
    devices: Array.isArray(c.devices) ? c.devices : [],
  };
}

export function saveClients(list: Client[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

export function upsertClient(list: Client[], client: Client): Client[] {
  const i = list.findIndex(c => c.key === client.key);
  if (i < 0) return [client, ...list];
  const next = [...list];
  next[i] = client;
  return next;
}

/**
 * The device record for a pasted activation code. Optional details are
 * included only when the code has them: a shop that declined location has no
 * lat/lng, an older POS sends no version. (Written as `undefined` they made
 * the cloud reject the whole client record.)
 */
export function deviceFromReceipt(
  rec: { device: string; at: number; lat?: number; lng?: number; ver?: string },
  approved = false,
): DeviceRecord {
  const d: DeviceRecord = { id: String(rec.device), activatedAt: Number(rec.at) || Date.now() };
  if (typeof rec.lat === 'number' && Number.isFinite(rec.lat)) d.lat = rec.lat;
  if (typeof rec.lng === 'number' && Number.isFinite(rec.lng)) d.lng = rec.lng;
  if (rec.ver) d.appVersion = String(rec.ver);
  if (approved) d.approved = true;
  return d;
}

/** A device seen for the first time is added; a returning one is refreshed. */
export function mergeDevice(client: Client, device: DeviceRecord): Client {
  const devices = [...client.devices];
  const i = devices.findIndex(d => d.id === device.id);
  if (i < 0) devices.push(device);
  else devices[i] = { ...devices[i], ...device };
  return { ...client, devices };
}

export function statusOf(c: Client): ClientStatus {
  if (c.suspended) return 'suspended';
  if (c.expiryDate && Date.now() > c.expiryDate) return 'expired';
  return 'active';
}

export function daysLeft(c: Client): number | null {
  if (!c.expiryDate) return null;
  return Math.ceil((c.expiryDate - Date.now()) / 86400000);
}

export function exportBackup(list: Client[]) {
  const blob = new Blob([JSON.stringify({ v: 1, exportedAt: Date.now(), clients: list }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dtpos-clients-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportCsv(list: Client[]) {
  const q = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Key', 'Business', 'Owner', 'Phone', 'Plan', 'Devices', 'Activated', 'Expiry', 'Status'].join(',')];
  for (const c of list) {
    rows.push([
      c.key, q(c.business), q(c.owner), q(c.phone), c.plan,
      `${c.devices.length}/${c.maxDevices}`,
      String(c.devices.length),
      c.expiryDate ? new Date(c.expiryDate).toISOString().slice(0, 10) : 'lifetime',
      statusOf(c),
    ].join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dtpos-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Read a backup file back in. Returns the merged list, newest record winning. */
export async function importBackup(file: File, current: Client[]): Promise<Client[]> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const incoming: Client[] = (Array.isArray(parsed) ? parsed : parsed.clients || []).map(normalise);
  let merged = [...current];
  for (const c of incoming) {
    if (!c.key) continue;
    const existing = merged.find(x => x.key === c.key);
    merged = upsertClient(merged, existing && existing.issuedAt > c.issuedAt ? existing : c);
  }
  return merged;
}

// ============================================================
// Device slots — how the panel spots a key used on a second machine.
// The POS is offline, so this registry is the place where a duplicate
// activation becomes visible: paste the activation code and, if the key's
// device limit is already full, Digital Target decides (approve or replace).
// ============================================================

/** Is this hardware ID already linked to the client? */
export function hasDevice(c: Client, deviceId: string): boolean {
  return c.devices.some(d => d.id === deviceId);
}

/** Slots taken vs allowed on a key. */
export function slotUsage(c: Client): { used: number; max: number; full: boolean } {
  const max = Math.max(1, Number(c.maxDevices) || 1);
  const used = c.devices.length;
  return { used, max, full: used >= max };
}

/** Drop one machine so its slot frees up (client keeps working elsewhere). */
export function removeDevice(c: Client, deviceId: string): Client {
  return { ...c, devices: c.devices.filter(d => d.id !== deviceId) };
}
