// ============================================================
// LICENCE VERDICT — what the server says this machine may do.
//
// Pure functions only, so the rules that decide whether a restaurant can
// open its POS are pinned by tests. Three independent server records feed in:
//
//   licenseStatus/{key}      set by Super Admin for the whole licence
//   deviceStatus/{deviceId}  set by Super Admin for this one computer
//   licenseDevices/{key}     the device slots this licence has handed out
//
// The strictest one wins. A "deleted" device tombstone written BEFORE the
// latest activation on this machine belongs to the old registration and is
// ignored — that is what lets a removed computer be activated again.
// ============================================================

export type SlotState = 'pending' | 'confirmed' | 'grandfathered' | 'denied';

export interface RemoteStatusDoc {
  status: string;
  message?: string;
  updatedAt?: number;
}

export interface ServerVerdict {
  /** active | suspended | revoked | pending | deleted | device-limit | expired | disabled */
  status: string;
  /** Optional note typed by the administrator. */
  message?: string;
  /** When the administrator last changed the record that decided this verdict. */
  updatedAt?: number;
  /** When this machine last heard from the server. */
  checkedAt: number;
  /** Which record decided the verdict. */
  scope: 'license' | 'device' | 'slot' | 'none';
}

/** Order matters: the first one present wins. */
const PRIORITY = ['revoked', 'suspended', 'deleted', 'pending', 'device-limit', 'disabled', 'expired'] as const;

export const BLOCKING_STATUSES: readonly string[] = PRIORITY;

export function isBlockingStatus(status: string | undefined | null): boolean {
  return !!status && BLOCKING_STATUSES.includes(status.toLowerCase());
}

/** A deleted-device tombstone older than this machine's latest activation. */
export function isSupersededTombstone(doc: RemoteStatusDoc | null | undefined, lastActivationAt: number | undefined): boolean {
  if (!doc || doc.status !== 'deleted') return false;
  if (!lastActivationAt) return false;
  return lastActivationAt > (doc.updatedAt || 0);
}

export function computeVerdict(input: {
  license: RemoteStatusDoc | null;
  device: RemoteStatusDoc | null;
  slot: SlotState | undefined;
  lastActivationAt: number | undefined;
  now: number;
}): ServerVerdict {
  const candidates: ServerVerdict[] = [];
  const lic = input.license ? { ...input.license, status: (input.license.status || 'active').toLowerCase() } : null;
  const dev = input.device ? { ...input.device, status: (input.device.status || 'active').toLowerCase() } : null;

  if (dev && !isSupersededTombstone(dev, input.lastActivationAt) && isBlockingStatus(dev.status)) {
    candidates.push({ status: dev.status, message: dev.message, updatedAt: dev.updatedAt, checkedAt: input.now, scope: 'device' });
  }
  if (lic && isBlockingStatus(lic.status)) {
    candidates.push({ status: lic.status, message: lic.message, updatedAt: lic.updatedAt, checkedAt: input.now, scope: 'license' });
  }
  if (input.slot === 'denied') {
    candidates.push({ status: 'device-limit', checkedAt: input.now, scope: 'slot' });
  }
  if (!candidates.length) return { status: 'active', checkedAt: input.now, scope: 'none' };
  candidates.sort((a, b) => PRIORITY.indexOf(a.status as never) - PRIORITY.indexOf(b.status as never));
  return candidates[0];
}

/**
 * Which slot state to ask the ledger for.
 *  - a licence activated before v1.12.0 has no slot record: it was already
 *    running here, so it is registered even when the ledger is full
 *    (grandfathered) rather than locked out by an upgrade.
 *  - a new activation must fit inside the licence's device limit.
 */
export function slotPolicy(slot: SlotState | undefined): { needsClaim: boolean; allowOverLimit: boolean } {
  if (slot === 'confirmed' || slot === 'grandfathered') return { needsClaim: false, allowOverLimit: false };
  if (slot === undefined) return { needsClaim: true, allowOverLimit: true };
  return { needsClaim: true, allowOverLimit: false };
}

/** Decision for one ledger read. Pure: the network write happens elsewhere. */
export function decideSlot(ledger: string[], deviceId: string, maxDevices: number, allowOverLimit: boolean):
  { outcome: 'present' | 'append' | 'full'; used: number; max: number } {
  const unique = Array.from(new Set(ledger.filter(Boolean)));
  const max = Math.max(1, Number(maxDevices) || 1);
  if (unique.includes(deviceId)) return { outcome: 'present', used: unique.length, max };
  if (unique.length >= max && !allowOverLimit) return { outcome: 'full', used: unique.length, max };
  return { outcome: 'append', used: unique.length, max };
}
