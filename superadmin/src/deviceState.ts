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
