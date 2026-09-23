// ============================================================
// SUPER ADMIN — "Function setDoc() called with invalid data. Unsupported
// field value: undefined (found in document clients/DTPOS-…)".
//
// Seen when registering a device from the POS "Activation complete" code.
// A shop that declines location (or a PC without one) sends a code with no
// lat/lng, an older POS sends no version; the device record carried those as
// `undefined` and Firestore rejected the whole client record.
//
// These tests use the REAL Firestore SDK validation (WriteBatch.set runs the
// same checks as setDoc and never touches the network).
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { firestoreSafe } from '../../superadmin/src/firestoreSafe';
import { deviceFromReceipt, mergeDevice, type Client } from '../../superadmin/src/registry';

const writes = vi.hoisted(() => ({ setDoc: [] as any[][], addDoc: [] as any[][] }));
vi.mock('firebase/firestore', async (orig) => {
  const real: any = await orig();
  return {
    ...real,
    setDoc: vi.fn(async (...a: any[]) => { writes.setDoc.push(a); }),
    addDoc: vi.fn(async (...a: any[]) => { writes.addDoc.push(a); return { id: 'm1' }; }),
  };
});

// A Firestore with the SDK's DEFAULT strictness — what the panel had before.
const strictDb = getFirestore(initializeApp({ apiKey: 'x', projectId: 'demo-strict', appId: '1:1:web:1' }, 'strict'));
const validate = (data: unknown, id = 'DTPOS-FSJE-VHJE-K4R2-BC84') =>
  writeBatch(strictDb).set(doc(strictDb, 'clients', id), data as any, { merge: true });

/** A decoded activation code from a shop that declined location, older POS. */
const receipt = { key: 'DTPOS-FSJE-VHJE-K4R2-BC84', device: 'HW-9F2A', business: 'Burewala Grill', owner: 'Ali', phone: '0300', plan: 'yearly', at: 1_790_000_000_000, lat: undefined, lng: undefined, ver: undefined };
const client = (): Client => ({
  key: receipt.key, business: 'Burewala Grill', owner: 'Ali', phone: '0300', plan: 'yearly' as any,
  maxDevices: 2, expiryDate: null, issuedAt: 1, suspended: false, notes: '', devices: [],
});

function hasUndefined(v: unknown): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.some(hasUndefined);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).some(hasUndefined);
  return false;
}

describe('root cause, reproduced with the real SDK', () => {
  it('the record the old code built is rejected exactly as reported', () => {
    const old = { ...client(), devices: [{ id: receipt.device, activatedAt: receipt.at, lat: receipt.lat, lng: receipt.lng, appVersion: receipt.ver }], updatedAt: 1 };
    expect(() => validate(old)).toThrow(/Unsupported field value: undefined \(found in document clients\/DTPOS-FSJE-VHJE-K4R2-BC84\)/);
  });
});

describe('the device record from an activation code', () => {
  it('without location/version: no undefined fields, accepted by Firestore', () => {
    const d = deviceFromReceipt(receipt);
    expect(d).toEqual({ id: 'HW-9F2A', activatedAt: receipt.at });
    expect(Object.keys(d)).not.toContain('lat');
    const c = mergeDevice(client(), d);
    expect(() => validate({ ...c, updatedAt: 1 })).not.toThrow();
  });
  it('with location, version and approval: all kept', () => {
    expect(deviceFromReceipt({ ...receipt, lat: 30.16, lng: 72.68, ver: '1.13.0' }, true))
      .toEqual({ id: 'HW-9F2A', activatedAt: receipt.at, lat: 30.16, lng: 72.68, appVersion: '1.13.0', approved: true });
  });
  it('a zero coordinate is a real coordinate', () => {
    expect(deviceFromReceipt({ ...receipt, lat: 0, lng: 0 })).toMatchObject({ lat: 0, lng: 0 });
  });
});

describe('firestoreSafe', () => {
  it('removes undefined at every depth, keeps null/0/false/"" and does not mutate', () => {
    const input = { a: undefined, b: null, c: 0, d: false, e: '', f: { g: undefined, h: 1 }, list: [{ x: undefined, y: 2 }, undefined, 3] };
    const copy = JSON.parse(JSON.stringify(input));
    const out = firestoreSafe(input);
    expect(out).toEqual({ b: null, c: 0, d: false, e: '', f: { h: 1 }, list: [{ y: 2 }, 3] });
    expect(hasUndefined(out)).toBe(false);
    expect(JSON.parse(JSON.stringify(input))).toEqual(copy);
    expect('a' in input).toBe(true);
  });
  it('passes Firestore sentinels through untouched', () => {
    const ts = serverTimestamp();
    expect(firestoreSafe({ at: ts, x: undefined }).at).toBe(ts);
  });
});

describe('every Super Admin write is safe', () => {
  beforeEach(() => { writes.setDoc.length = 0; writes.addDoc.length = 0; });

  it('pushClient: a client whose device has undefined fields is written without them', async () => {
    const { pushClient } = await import('../../superadmin/src/cloud');
    const dirty: any = { ...client(), notes: undefined, devices: [{ id: 'HW-1', activatedAt: 1, lat: undefined, lng: undefined, appVersion: undefined }] };
    await pushClient(dirty);
    const [, data, opts] = writes.setDoc[0];
    expect(hasUndefined(data)).toBe(false);
    expect(data.devices).toEqual([{ id: 'HW-1', activatedAt: 1 }]);
    expect(opts).toEqual({ merge: true });
    expect(() => validate(data)).not.toThrow();
  });

  it('support note without a shop selected (clientKey/business/phone undefined)', async () => {
    const { sendMessage } = await import('../../superadmin/src/cloud');
    await sendMessage({ clientKey: undefined, business: undefined, phone: undefined, text: 'Hello' });
    const [, data] = writes.addDoc[0];
    expect(hasUndefined(data)).toBe(false);
    expect(data).toMatchObject({ text: 'Hello', from: 'admin', read: false });
    expect('clientKey' in data).toBe(false);
  });

  it('safety net: the panel\'s Firestore ignores undefined properties', async () => {
    const { db } = await import('../../superadmin/src/firebase');
    expect(() => writeBatch(db).set(doc(db, 'clients', 'k'), { a: 1, b: undefined } as any)).not.toThrow();
  });

  it('registering a code uses the clean builder; a failed save is retried, not marked as synced', () => {
    const app = readFileSync(resolve(__dirname, '../../superadmin/src/App.tsx'), 'utf8');
    expect(app).toMatch(/mergeDevice\(c, deviceFromReceipt\(rec, approved\)\)/);
    expect(app).not.toMatch(/lat: rec\.lat, lng: rec\.lng/);
    expect(app).toMatch(/if \(synced\.current\.get\(c\.key\) === json\) synced\.current\.delete\(c\.key\);/);
    const billing = readFileSync(resolve(__dirname, '../../superadmin/src/billingCloud.ts'), 'utf8');
    expect(billing.match(/firestoreSafe\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
