// ============================================================
// DEVICE STATE — pure helpers for the Devices tab (no Firebase import, so
// the rules for "online", "last seen" and location wording are testable).
// ============================================================
export interface DeviceDoc {
  deviceId: string;
  licenseKey?: string;
  business?: string; owner?: string; phone?: string;
  plan?: string; expiryDate?: number;
  appVersion?: string;
  manufacturer?: string; model?: string; osName?: string; osVersion?: string; hostname?: string;
  installationId?: string; activatedAt?: number; lastActivationAt?: number; slot?: string;
  installedAt?: number; firstLoginAt?: number; lastLoginAt?: number; loginCount?: number;
  lastSyncAt?: number; lastVerifyAt?: number; licenseStatus?: string;
  country?: string; region?: string; city?: string; locationUpdatedAt?: number;
  latitude?: number; longitude?: number;
  locationAccuracyM?: number; locationSource?: string;
  /** Today's sales as this computer reports them (src/lib/todaySales.ts): business day, total, bills, when the day ends. */
  salesDay?: string; salesToday?: number; salesBills?: number; salesDayEnd?: number;
  /** The last administrator-password reset this computer applied (ID, when, outcome). */
  adminResetId?: string; adminResetAt?: number; adminResetResult?: string;
}

/** The POS reports every 5 minutes while it is open and connected. */
export const HEARTBEAT_MS = 5 * 60_000;
/** Two missed reports and a margin before a computer counts as offline. */
export const ONLINE_WINDOW_MS = 12 * 60_000;

export function isOnline(d: Pick<DeviceDoc, 'lastSyncAt'>, now = Date.now()): boolean {
  return !!d.lastSyncAt && now - d.lastSyncAt <= ONLINE_WINDOW_MS;
}

export function lastSeenLabel(ms: number | undefined, now = Date.now()): string {
  if (!ms) return 'Never reported';
  const diff = Math.max(0, now - ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Honest location wording: never implies GPS precision it does not have. */
export function locationLabel(d: DeviceDoc): string {
  const place = [d.city, d.region, d.country].filter(Boolean).join(', ');
  const hasPoint = typeof d.latitude === 'number' && typeof d.longitude === 'number' && (d.latitude !== 0 || d.longitude !== 0);
  if (!place && !hasPoint) return 'Location unavailable';
  if (d.locationSource === 'device') {
    return `${place || 'Device location'}${d.locationAccuracyM ? ` (±${Math.round(d.locationAccuracyM)} m)` : ''}`;
  }
  return `${place || 'Unknown area'} (approximate, from internet connection)`;
}


export interface StatusLike { status?: string; updatedAt?: number }

/**
 * What the server has decided for this computer, strictest first — the same
 * order the POS applies (src/licensing/licenseVerdict.ts).
 */
export function serverDecision(device: StatusLike | undefined, licence: StatusLike | undefined, d: Pick<DeviceDoc, 'lastActivationAt' | 'activatedAt'>):
  { status: string; scope: 'device' | 'licence' | 'none' } {
  const order = ['revoked', 'suspended', 'deleted', 'pending'];
  const since = d.lastActivationAt || d.activatedAt || 0;
  const dev = device?.status && !(device.status === 'deleted' && since > (device.updatedAt || 0)) ? device.status : '';
  const lic = licence?.status || '';
  const pick = [
    ...(order.includes(dev) ? [{ status: dev, scope: 'device' as const }] : []),
    ...(order.includes(lic) ? [{ status: lic, scope: 'licence' as const }] : []),
  ].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return pick[0] || { status: 'active', scope: 'none' };
}

// ---------- administrator password reset ----------
/** The first POS release that can receive a reset from this panel. */
export const RESET_MIN_POS_VERSION = '1.21.0';

export function versionAtLeast(version: string | undefined, min: string): boolean {
  if (!version) return false;
  const a = version.split('.').map(n => parseInt(n, 10) || 0);
  const b = min.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export interface ResetRow {
  deviceId: string;
  /** What to call this computer: its Windows name, else its model, else its ID. */
  label: string;
  state: 'applied' | 'failed' | 'waiting' | 'old-version';
  /** Plain-English line for the row. */
  text: string;
  at?: number;
}

const FAILED_TEXT: Record<string, string> = {
  'not-found': 'The username you typed does not exist on this computer.',
  'not-admin': 'That username is not an administrator on this computer.',
};

const sameKey = (a?: string, b?: string) =>
  (a || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === (b || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Where one pending reset stands on every computer that reports under the licence. */
export function resetProgress(devices: DeviceDoc[], licenseKey: string, resetId: string): ResetRow[] {
  return devices
    .filter(d => sameKey(d.licenseKey, licenseKey))
    .map((d): ResetRow => {
      const label = d.hostname || d.model || d.deviceId;
      if (d.adminResetId === resetId) {
        const r = d.adminResetResult || '';
        if (r === 'applied' || r === 'reactivated') {
          return { deviceId: d.deviceId, label, state: 'applied', at: d.adminResetAt, text: r === 'reactivated' ? 'Applied — the administrator account was switched back on.' : 'Applied.' };
        }
        return { deviceId: d.deviceId, label, state: 'failed', at: d.adminResetAt, text: FAILED_TEXT[r] || `Not applied (${r || 'unknown reason'}).` };
      }
      if (!versionAtLeast(d.appVersion, RESET_MIN_POS_VERSION)) {
        return { deviceId: d.deviceId, label, state: 'old-version', text: `Runs POS ${d.appVersion ? `v${d.appVersion}` : 'an older version'} — update it to v${RESET_MIN_POS_VERSION} or newer first.` };
      }
      return { deviceId: d.deviceId, label, state: 'waiting', text: isOnline(d) ? 'Waiting — will apply within a few minutes.' : `Waiting for this computer to go online (last seen ${lastSeenLabel(d.lastSyncAt)}).` };
    });
}
