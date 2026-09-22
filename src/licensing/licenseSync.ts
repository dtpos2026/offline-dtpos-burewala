// ============================================================
// LICENCE SYNC — the background half of the licence check.
//
// The gate opens the POS from the local vault alone. This module then asks
// the server, when there is internet, what the administrator has decided:
//
//   1. licence-wide status  (Suspend / Revoke / Pending for the whole key)
//   2. this device's status (Suspend / Revoke / Remove for this computer)
//   3. this device's slot   (does it fit inside the licence's device limit?)
//
// The answer is written into the encrypted vault, so it holds offline too,
// and a `dtpos-license-verdict` event tells the gate to re-evaluate.
// Nothing here ever runs before the POS has opened, and nothing here can
// block billing: every call is timeout-capped and failures change nothing.
// ============================================================
import { claimDeviceSlot, fetchServerStatus, storeVerdict } from '@/lib/cloudLink';
import {
  computeVerdict, decideSlot, isSupersededTombstone, slotPolicy,
  type ServerVerdict, type SlotState,
} from './licenseVerdict';
import { loadLicense, registerSlotClaimer, updateLicense, type SlotCheck } from './licenseService';

export interface SyncResult {
  /** The server answered. False offline or on a timeout — nothing changed. */
  reachable: boolean;
  /** The verdict differs from what this computer knew before. */
  changed: boolean;
  verdict?: ServerVerdict;
  /** Set when the device slot could not be checked (e.g. rules not published). */
  slotUnavailable?: string;
}

async function claim(licenseKey: string, deviceId: string, maxDevices: number, allowOverLimit: boolean): Promise<SlotCheck & { reason?: string }> {
  const r = await claimDeviceSlot(licenseKey, deviceId, ledger => decideSlot(ledger, deviceId, maxDevices, allowOverLimit));
  if (r.result === 'unavailable') return { result: 'unavailable', reason: r.reason };
  return { result: r.result, used: r.used, max: r.max };
}

// Activation asks for a slot before saving anything.
registerSlotClaimer((key, deviceId, max) => claim(key, deviceId, max, false));

let inflight: Promise<SyncResult> | null = null;

export function syncLicenseStatus(): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = run().finally(() => { inflight = null; });
  return inflight;
}

async function run(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { reachable: false, changed: false };
  const lic = await loadLicense();
  if (!lic?.licenseKey || !lic.deviceId) return { reachable: false, changed: false };

  const status = await fetchServerStatus(lic.licenseKey, lic.deviceId);
  // Both documents or nothing: half an answer must not unblock or block anyone.
  if (!status.license.reachable || !status.device.reachable) return { reachable: false, changed: false };
  const licenseDoc = status.license.doc;
  const deviceDoc = status.device.doc;
  const lastActivationAt = lic.lastActivationAt || lic.activatedAt;

  // Slot: only worth asking for when the device itself is not blocked.
  let slot: SlotState | undefined = lic.slot;
  let slotUsed = lic.slotUsed;
  let slotMax = lic.slotMax;
  let slotUnavailable: string | undefined;
  const deviceBlocked = !!deviceDoc
    && ['deleted', 'revoked'].includes(deviceDoc.status)
    && !isSupersededTombstone(deviceDoc, lastActivationAt);
  const policy = slotPolicy(lic.slot);
  if (policy.needsClaim && !deviceBlocked) {
    const r = await claim(lic.licenseKey, lic.deviceId, lic.maxDevices, policy.allowOverLimit);
    if (r.result === 'confirmed') {
      const over = (r.used ?? 0) > (r.max ?? lic.maxDevices);
      slot = over ? 'grandfathered' : 'confirmed';
      slotUsed = r.used; slotMax = r.max;
    } else if (r.result === 'denied') {
      slot = 'denied';
      slotUsed = r.used; slotMax = r.max;
    } else {
      slotUnavailable = r.reason;
    }
  }

  const verdict = computeVerdict({
    license: licenseDoc,
    device: deviceDoc,
    slot,
    lastActivationAt,
    now: Date.now(),
  });

  const before = lic.server?.status;
  await updateLicense(l => (l.licenseKey !== lic.licenseKey ? null : {
    ...l,
    server: verdict,
    slot,
    slotUsed,
    slotMax,
  })).catch(() => null);
  storeVerdict({
    status: verdict.status,
    message: verdict.message,
    checkedAt: verdict.checkedAt,
    updatedAt: verdict.updatedAt,
    key: lic.licenseKey,
  });
  return { reachable: true, changed: before !== verdict.status, verdict, slotUnavailable };
}
