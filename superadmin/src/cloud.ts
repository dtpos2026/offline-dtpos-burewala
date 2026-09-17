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
  updateDoc, serverTimestamp,
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
export interface DeviceDoc {
  deviceId: string;
  licenseKey?: string;
  business?: string; owner?: string; phone?: string;
  plan?: string; expiryDate?: number;
  appVersion?: string;
  manufacturer?: string; model?: string; osName?: string; osVersion?: string; hostname?: string;
  installedAt?: number; firstLoginAt?: number; lastLoginAt?: number; loginCount?: number;
  lastSyncAt?: number; lastVerifyAt?: number; licenseStatus?: string;
  country?: string; region?: string; city?: string; locationUpdatedAt?: number;
  latitude?: number; longitude?: number;
  locationAccuracyM?: number; locationSource?: string;
}

export function watchDevices(cb: (list: DeviceDoc[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'devices'),
    snap => cb(snap.docs.map(d => ({ deviceId: d.id, ...(d.data() as Omit<DeviceDoc, 'deviceId'>) }))),
    e => onErr?.(e as Error),
  );
}

/**
 * Publish the authoritative licence status. The POS reads this document on
 * every online verification, so Suspend/Activate takes effect by itself —
 * no reinstall, no key change.
 */
export async function setLicenseStatus(licenseKey: string, status: 'active' | 'suspended' | 'revoked' | 'expired', message = '') {
  await setDoc(doc(db, 'licenseStatus', docIdFor(licenseKey)), {
    status, message, updatedAt: Date.now(), by: auth.currentUser?.email || 'admin',
  }, { merge: true });
  await setDoc(doc(db, 'clients', docIdFor(licenseKey)), {
    suspended: status === 'suspended' || status === 'revoked', updatedAt: Date.now(),
  }, { merge: true });
}

/**
 * Per-device status. Yeh us waqt kaam aata hai jab device par licence key
 * abhi tak sync nahi hui — Suspend/Revoke phir bhi us machine par lag jata hai.
 */
export async function setDeviceStatus(deviceId: string, status: 'active' | 'suspended' | 'revoked', message = '') {
  const updatedAt = Date.now();
  await setDoc(doc(db, 'deviceStatus', docIdFor(deviceId)), {
    deviceId, status, message, updatedAt, by: auth.currentUser?.email || 'admin',
  }, { merge: true });
  // Keep the live monitoring row in sync immediately; previously the action
  // worked but the table stayed on the old status until the POS heartbeat.
  await setDoc(doc(db, 'devices', docIdFor(deviceId)), {
    deviceId, licenseStatus: status, lastVerifyAt: updatedAt,
  }, { merge: true });
}

/** Permanently remove a reported installation and leave a deleted tombstone.
 * The tombstone blocks that installation from silently reporting again. */
export async function removeDevice(deviceId: string) {
  await setDoc(doc(db, 'deviceStatus', docIdFor(deviceId)), {
    deviceId, status: 'deleted', message: 'Removed by Super Admin',
    updatedAt: Date.now(), by: auth.currentUser?.email || 'admin',
  }, { merge: true });
  await deleteDoc(doc(db, 'devices', docIdFor(deviceId)));
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
