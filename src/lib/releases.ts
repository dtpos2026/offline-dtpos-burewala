// ============================================================
// DT POS — Release / Auto-Update helper
// ============================================================
// Global cloud collection: systemReleases/{releaseId}
// Schema:
//   version: string
//   webVersion: string
//   title: string
//   notes: string
//   desktopUpdateUrl: string
//   forceUpdate: boolean
//   minimumSupportedVersion: string
//   status: 'draft' | 'released' | 'disabled'
//   createdAt / releasedAt: Timestamp
//   createdBy: string
// ============================================================

import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, type TimestampLike,
} from '@/lib/offlineNoCloud';
import { cloudDb, isCloudConfigured } from './offlineNoCloud';

export type ReleaseStatus = 'draft' | 'released' | 'disabled';

export interface SystemRelease {
  id: string;
  version: string;
  webVersion: string;
  title: string;
  notes: string;
  desktopUpdateUrl: string;
  forceUpdate: boolean;
  minimumSupportedVersion: string;
  status: ReleaseStatus;
  /** Empty/missing = broadcast to ALL tenants. Populated = only listed tenant UIDs. */
  targetTenantIds?: string[];
  createdAt?: TimestampLike | null;
  releasedAt?: TimestampLike | null;
  createdBy?: string;
}

/** Returns true if this release should be visible to the given tenant. */
export function isReleaseForTenant(release: SystemRelease | null | undefined, tenantId: string | null | undefined): boolean {
  if (!release) return false;
  const targets = release.targetTenantIds;
  if (!targets || targets.length === 0) return true; // broadcast
  if (!tenantId) return false;
  return targets.includes(tenantId);
}

const COLL = 'systemReleases';

// ---- semver-ish version compare ----
// "1.10.2" > "1.9.9" → 1 ; equal → 0 ; less → -1
export function compareVersions(a: string, b: string): number {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isUpdateAvailable(currentVersion: string, latestVersion: string): boolean {
  return compareVersions(latestVersion, currentVersion) > 0;
}

export function isBelowMinimum(currentVersion: string, minSupported: string): boolean {
  if (!minSupported) return false;
  return compareVersions(currentVersion, minSupported) < 0;
}

// ---- Subscribe to latest released release ----
// NOTE: We intentionally avoid a composite index (where status + orderBy releasedAt)
// because it required a remote index. Instead we filter by status only and
// sort/pick the latest client-side using compareVersions.
export function subscribeLatestRelease(cb: (r: SystemRelease | null) => void): () => void {
  if (!isCloudConfigured()) { cb(null); return () => {}; }
  try {
    const q = query(
      collection(cloudDb(), COLL),
      where('status', '==', 'released'),
    );
    return onSnapshot(q, (snap) => {
      if (snap.empty) { cb(null); return; }
      const all: SystemRelease[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Pick highest version
      all.sort((a, b) => compareVersions(b.version || '0', a.version || '0'));
      cb(all[0] || null);
    }, (err) => {
      console.warn('[releases] subscribeLatestRelease error:', err?.message || err);
      cb(null);
    });
  } catch (e: any) {
    console.warn('[releases] subscribeLatestRelease setup failed:', e?.message || e);
    cb(null);
    return () => {};
  }
}

// ---- Admin: list all releases (draft+released+disabled) ----
export function subscribeAllReleases(cb: (rows: SystemRelease[]) => void): () => void {
  if (!isCloudConfigured()) { cb([]); return () => {}; }
  try {
    const q = query(collection(cloudDb(), COLL));
    return onSnapshot(q, (snap) => {
      const rows: SystemRelease[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      rows.sort((a, b) => {
        const at = (a.createdAt as any)?.toMillis?.() || 0;
        const bt = (b.createdAt as any)?.toMillis?.() || 0;
        return bt - at;
      });
      cb(rows);
    }, (err) => {
      console.warn('[releases] subscribeAllReleases error:', err?.message || err);
      cb([]);
    });
  } catch (e: any) {
    console.warn('[releases] subscribeAllReleases setup failed:', e?.message || e);
    cb([]);
    return () => {};
  }
}

export async function createRelease(data: Omit<SystemRelease, 'id' | 'createdAt' | 'releasedAt'>): Promise<string> {
  const ref = await addDoc(collection(cloudDb(), COLL), {
    ...data,
    createdAt: serverTimestamp(),
    releasedAt: null,
  });
  return ref.id;
}

export async function updateRelease(id: string, patch: Partial<SystemRelease>): Promise<void> {
  await updateDoc(doc(cloudDb(), COLL, id), patch as any);
}

export async function publishRelease(id: string): Promise<void> {
  await updateDoc(doc(cloudDb(), COLL, id), {
    status: 'released',
    releasedAt: serverTimestamp(),
  });
}

export async function disableRelease(id: string): Promise<void> {
  await updateDoc(doc(cloudDb(), COLL, id), { status: 'disabled' });
}

export async function deleteRelease(id: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), COLL, id));
}

// Local "dismissed" tracking per device — so banner doesn't nag after user
// dismisses for the SAME version. Force updates ignore this.
const DISMISS_KEY = 'pos-release-dismissed-version';
export function dismissReleaseLocally(version: string) {
  try { localStorage.setItem(DISMISS_KEY, version); } catch {}
}
export function wasDismissed(version: string): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === version; } catch { return false; }
}
