// ============================================================
// Cloud store for the Super Admin panel.
//
//   clients/{id}          — one licence per document (id = sanitised key)
//   supportMessages/{id}  — notes between Digital Target and a shop
//
// Reads are live (onSnapshot), so two admins on two machines always see the
// same registry. localStorage stays as the offline mirror.
// ============================================================
import {
  collection, doc, deleteDoc, setDoc, onSnapshot, query, orderBy, addDoc,
  updateDoc, serverTimestamp, arrayRemove, getDoc,
} from 'firebase/firestore';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, type User,
} from 'firebase/auth';
import { db, auth } from './firebase';
import type { Client } from './registry';

export const docIdFor = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);

// ---------- auth ----------
export function watchAdmin(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}
export async function adminSignIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function adminSignOut() {
  await signOut(auth);
}

// ---------- clients ----------
export function watchClients(cb: (list: Client[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'clients'),
    snap => cb(snap.docs.map(d => d.data() as Client).filter(c => c && c.key)),
    e => onErr?.(e as Error),
  );
}

export async function pushClient(c: Client) {
  await setDoc(doc(db, 'clients', docIdFor(c.key)), { ...c, updatedAt: Date.now() }, { merge: true });
}

export async function removeClient(key: string) {
  await deleteDoc(doc(db, 'clients', docIdFor(key)));
}

// ---------- devices (live installation monitoring) ----------
// Three kinds of record, kept apart on purpose:
//   devices/{id}        REPORTED by the POS (heartbeat) — what the shop's PC says
//   deviceStatus/{id}   DECIDED by Super Admin for one computer
//   licenseStatus/{key} DECIDED by Super Admin for every computer on a licence
//   licenseDevices/{key} which computers hold one of the licence's device slots
export type { DeviceDoc } from './deviceState';
import type { DeviceDoc } from './deviceState';

export interface StatusDoc { id: string; status: string; message?: string; updatedAt?: number; by?: string; deviceId?: string }

export function watchDevices(cb: (list: DeviceDoc[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'devices'),
    snap => cb(snap.docs.map(d => ({ deviceId: d.id, ...(d.data() as Omit<DeviceDoc, 'deviceId'>) }))),
    e => onErr?.(e as Error),
  );
}

function watchStatusCollection(name: 'deviceStatus' | 'licenseStatus', cb: (m: Map<string, StatusDoc>) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    collection(db, name),
    snap => cb(new Map(snap.docs.map(d => [d.id, { id: d.id, ...(d.data() as Omit<StatusDoc, 'id'>) }]))),
    e => onErr?.(e as Error),
  );
}

/** Per-device decisions, keyed by sanitised device ID. */
export const watchDeviceStatuses = (cb: (m: Map<string, StatusDoc>) => void, onErr?: (e: Error) => void) =>
  watchStatusCollection('deviceStatus', cb, onErr);

/** Licence-wide decisions, keyed by sanitised licence key. */
export const watchLicenseStatuses = (cb: (m: Map<string, StatusDoc>) => void, onErr?: (e: Error) => void) =>
  watchStatusCollection('licenseStatus', cb, onErr);

/** Device slots per licence, keyed by sanitised licence key. */
export function watchLedgers(cb: (m: Map<string, string[]>) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'licenseDevices'),
    snap => cb(new Map(snap.docs.map(d => [d.id, ((d.data() as { devices?: string[] }).devices || []).filter(Boolean)]))),
    e => onErr?.(e as Error),
  );
}

export type LicenceAction = 'active' | 'suspended' | 'revoked' | 'pending';

/**
 * Publish the authoritative licence status for EVERY computer on the key.
 * The POS reads it on its next online check (about once a minute).
 */
export async function setLicenseStatus(licenseKey: string, status: LicenceAction | 'expired', message = '') {
  await setDoc(doc(db, 'licenseStatus', docIdFor(licenseKey)), {
    status, message, updatedAt: Date.now(), by: auth.currentUser?.email || 'admin',
  }, { merge: true });
  await setDoc(doc(db, 'clients', docIdFor(licenseKey)), {
    suspended: status === 'suspended' || status === 'revoked', updatedAt: Date.now(),
  }, { merge: true });
}

/**
 * Per-device status — affects this one computer only. Other computers on the
 * same licence are not touched (use the licence status for that).
 */
export async function setDeviceStatus(deviceId: string, status: 'active' | 'suspended' | 'revoked', message = '') {
  await setDoc(doc(db, 'deviceStatus', docIdFor(deviceId)), {
    deviceId, status, message, updatedAt: Date.now(), by: auth.currentUser?.email || 'admin',
  }, { merge: true });
}

/**
 * Remove one computer: frees its device slot, deletes its heartbeat row and
 * leaves a "deleted" record so it cannot silently keep running on the old
 * activation. Entering the licence key on that computer again registers it
 * again (if a slot is free). Other computers on the licence are not touched.
 */
export async function removeDevice(deviceId: string, licenseKey?: string) {
  const updatedAt = Date.now();
  await setDoc(doc(db, 'deviceStatus', docIdFor(deviceId)), {
    deviceId, status: 'deleted', message: '', updatedAt, by: auth.currentUser?.email || 'admin',
  }, { merge: true });
  if (licenseKey) {
    const ref = doc(db, 'licenseDevices', docIdFor(licenseKey));
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, { devices: arrayRemove(deviceId), updatedAt });
  }
  await deleteDoc(doc(db, 'devices', docIdFor(deviceId)));
}

/** Clear a removal record, so the computer may report again without re-activation. */
export async function clearDeviceRemoval(deviceId: string) {
  await deleteDoc(doc(db, 'deviceStatus', docIdFor(deviceId)));
}

// ---------- support messages ----------
export interface SupportMessage {
  id: string;
  clientKey?: string;
  business?: string;
  phone?: string;
  from: 'admin' | 'shop';
  text: string;
  createdAt: number;
  read?: boolean;
}

export function watchMessages(cb: (list: SupportMessage[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    query(collection(db, 'supportMessages'), orderBy('createdAt', 'desc')),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<SupportMessage, 'id'>) }))),
    e => onErr?.(e as Error),
  );
}

export async function sendMessage(m: Omit<SupportMessage, 'id' | 'createdAt' | 'from'> & { from?: 'admin' | 'shop' }) {
  await addDoc(collection(db, 'supportMessages'), {
    ...m,
    from: m.from || 'admin',
    read: false,
    createdAt: Date.now(),
    serverAt: serverTimestamp(),
  });
}

export async function markMessageRead(id: string) {
  await updateDoc(doc(db, 'supportMessages', id), { read: true });
}

export async function deleteMessage(id: string) {
  await deleteDoc(doc(db, 'supportMessages', id));
}

// ---------- connection self-test ----------
// Firebase Console ki setup (Email/Password + Firestore + rules) sahi hai ya
// nahi — yeh ek click me bata deta hai, bina kisi doc ko chhue.
export interface CloudCheck { label: string; ok: boolean; detail: string; }

export async function cloudSelfTest(): Promise<CloudCheck[]> {
  const out: CloudCheck[] = [];
  const cfg = (await import('./firebase')).firebaseConfig;
  out.push({ label: 'Firebase project', ok: !!cfg.projectId, detail: cfg.projectId || 'missing' });

  // 1) Auth reachable + Email/Password provider enabled?
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${cfg.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'probe@example.com', continueUri: window.location.origin }),
      },
    );
    const j = await r.json().catch(() => ({}));
    if (r.ok) out.push({ label: 'Authentication', ok: true, detail: 'Reachable — Email/Password sign-in ready' });
    else if (/OPERATION_NOT_ALLOWED/.test(JSON.stringify(j)))
      out.push({ label: 'Authentication', ok: false, detail: 'Enable Email/Password in Firebase Console → Authentication → Sign-in method' });
    else if (/API_KEY|INVALID/.test(JSON.stringify(j)))
      out.push({ label: 'Authentication', ok: false, detail: 'API key rejected — check firebase.ts config' });
    else out.push({ label: 'Authentication', ok: false, detail: j?.error?.message || 'Unknown auth error' });
  } catch (e: any) {
    out.push({ label: 'Authentication', ok: false, detail: 'No internet / blocked: ' + (e?.message || e) });
  }

  // 2) Firestore database created?
  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/clients?pageSize=1&key=${cfg.apiKey}`,
    );
    if (r.ok) out.push({ label: 'Firestore', ok: true, detail: 'Database mojood hai (public read — rules tight karein)' });
    else if (r.status === 403 || r.status === 401)
      out.push({ label: 'Firestore', ok: true, detail: 'Database mojood hai aur rules sign-in maang rahe hain ✅' });
    else if (r.status === 404)
      out.push({ label: 'Firestore', ok: false, detail: 'Firestore database create karein: Console → Firestore Database → Create' });
    else out.push({ label: 'Firestore', ok: false, detail: `HTTP ${r.status}` });
  } catch (e: any) {
    out.push({ label: 'Firestore', ok: false, detail: 'No internet / blocked: ' + (e?.message || e) });
  }

  // 3) Signed-in staff session?
  out.push({
    label: 'Staff session',
    ok: !!auth.currentUser,
    detail: auth.currentUser?.email || 'Abhi sign-in nahi hua',
  });
  return out;
}

/** Live write+read check — sirf sign-in ke baad chalta hai. */
export async function cloudWriteTest(): Promise<CloudCheck> {
  try {
    const id = `__healthcheck__${Date.now()}`;
    await setDoc(doc(db, 'health', id), { at: Date.now(), by: auth.currentUser?.email || 'unknown' });
    await deleteDoc(doc(db, 'health', id));
    return { label: 'Write test', ok: true, detail: 'Cloud me likhna aur delete karna dono theek hain ✅' };
  } catch (e: any) {
    return { label: 'Write test', ok: false, detail: e?.code || e?.message || 'Write failed — Firestore rules check karein' };
  }
}
