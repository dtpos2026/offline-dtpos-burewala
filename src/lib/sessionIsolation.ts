// Strict cross-tenant cache wipe.
//
// In the same browser, if a user first logs in to tenant A, then logs out
// and logs in to tenant B, NONE of tenant A's cached data should appear in
// tenant B's session. This file wipes every possible storage layer
// on tenant switch:
//
//   1. localStorage  — pos-* / desi-pos-* / enc::* (non-current tenant)
//   2. sessionStorage — everything (tab-level)
//   3. IndexedDB     — cloud offline cache + image cache
//   4. CacheStorage  — service worker / fetch caches
//   5. In-memory     — the pos-tenant-change event triggers store.ts
//
// A marker is stored keyed to the tenant ID — if the marker mismatches on
// load (some other browser tab already loaded a different tenant), a wipe
// is triggered before any data renders.

import { getTenantId } from './tenant';
import { wipeOtherTenants } from './secureStorage';

const SAFE_KEEP_KEYS = new Set<string>([
  'pos-tenant-id',
  'pos-tenant-name',
  'pos-device-id',
  'pos-owner-remember-email',
  'pos-owner-saved-email',
  'pos-remember-username',
  'pos-saved-username',
  'pos-user-role',
  'pos-current-user',     // active session marker
  'pos-active-tenant-marker',
  'dtpos-printer-settings-v1',
  'dtpos-print-margins',
]);

const SHARED_PREFIXES = ['pos-', 'desi-pos-'];

function isTenantScopedKey(k: string, currentTenantId: string | null): boolean {
  if (SAFE_KEEP_KEYS.has(k)) return false;
  if (currentTenantId && k === `desi-pos-data:${currentTenantId}`) return false;
  return SHARED_PREFIXES.some(p => k.startsWith(p));
}

/** Wipe every localStorage key that belongs to the *previous* tenant. */
function wipeSharedLocalStorage(currentTenantId: string | null): number {
  let removed = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (isTenantScopedKey(k, currentTenantId)) {
      localStorage.removeItem(k);
      removed++;
    }
  }
  return removed;
}

/** Wipe sessionStorage — tab-level, always safe to clear on tenant switch. */
function wipeSessionStorage(): number {
  const n = sessionStorage.length;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  return n;
}

/** Drop our image cache (and any stale DB an older build left behind). */
async function wipeIndexedDb(_currentTenantId: string | null): Promise<number> {
  if (!('indexedDB' in window)) return 0;
  // The only IndexedDB v1.0.40 creates. Databases left over from older
  // online builds are picked up by the dynamic enumeration below, which
  // Chromium (and therefore Electron) always supports.
  const known = ['pos-image-cache'];
  let dropped = 0;
  // If the browser supports databases() (Chrome/Edge), enumerate dynamically.
  try {
    const anyIdb = indexedDB as any;
    if (typeof anyIdb.databases === 'function') {
      const list: { name?: string }[] = await anyIdb.databases();
      list.forEach(db => { if (db.name) known.push(db.name); });
    }
  } catch { /* ignore */ }
  const uniq = Array.from(new Set(known));
  await Promise.all(uniq.map(name => new Promise<void>(resolve => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => { dropped++; resolve(); };
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch { resolve(); }
  })));
  return dropped;
}

/** Drop Cache Storage entries (service worker / fetch). */
async function wipeCacheStorage(): Promise<number> {
  if (!('caches' in window)) return 0;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    return keys.length;
  } catch { return 0; }
}

/** Full wipe — call before showing UI for the new tenant. */
export async function fullCrossTenantWipe(
  newTenantId: string | null,
  opts: { wipeIndexedDb?: boolean; wipeCacheStorage?: boolean } = {},
): Promise<void> {
  const wipeIdb = opts.wipeIndexedDb === true;
  const wipeCaches = opts.wipeCacheStorage === true;
  try { wipeOtherTenants(newTenantId); } catch { /* ignore */ }
  wipeSharedLocalStorage(newTenantId);
  wipeSessionStorage();
  // IMPORTANT: Do not delete the local IndexedDB stores while they are in use.
  // Deleting it during login makes the store emit "shutting down", then the
  // app falls back to empty/default data. Only hard logout uses this deep wipe.
  if (wipeIdb) void wipeIndexedDb(newTenantId);
  if (wipeCaches) void wipeCacheStorage();
}
/**
 * Forceful logout + cache wipe.
 * Use when account is invalid/deleted/disabled, or on intentional logout.
 * - Signs the local session out
 * - Clears tenant context
 * - Wipes localStorage / sessionStorage / IndexedDB / CacheStorage
 * - Shows toast with the reason (if provided)
 */
export async function forceLogoutAndWipe(reason?: string): Promise<void> {
  try { sessionStorage.setItem('pos-intentional-logout', '1'); } catch {}
  try {
    const { cloudAuth, isCloudConfigured } = await import('./offlineNoCloud');
    if (isCloudConfigured()) {
      const { signOut } = await import('@/lib/offlineNoCloud');
      try { await signOut(cloudAuth()); } catch {}
    }
  } catch {}
  try {
    const { clearTenant } = await import('./tenant');
    clearTenant();
  } catch {}
  try { localStorage.removeItem('pos-user-id'); } catch {}
  try { localStorage.removeItem('pos-user-role'); } catch {}
  try { localStorage.removeItem('pos-current-user'); } catch {}
  try { localStorage.removeItem('dt_pos_current_user'); } catch {}
  await fullCrossTenantWipe(null, { wipeIndexedDb: true, wipeCacheStorage: true });
  if (reason) {
    try {
      const { toast } = await import('sonner');
      toast.error(reason);
    } catch {}
  }
}

/** Offline Windows EXE logout: clear only the active staff session. Never wipe
 * restaurant DB, printer settings, margins, images, caches, or backups. */
export async function offlineStaffLogout(): Promise<void> {
  try { localStorage.removeItem('pos-user-id'); } catch {}
  try { localStorage.removeItem('pos-user-role'); } catch {}
  try { localStorage.removeItem('pos-current-user'); } catch {}
  try { localStorage.removeItem('dt_pos_current_user'); } catch {}
  try { sessionStorage.removeItem('pos-intentional-logout'); } catch {}
}


// ============== Active-tenant marker (multi-tab safety) ==============
// Each tab keeps its own session marker. If a different tenant logs in on
// another tab, this tab will detect it via the `storage` event and reload
// with fresh data.

const MARKER_KEY = 'pos-active-tenant-marker';

function writeMarker(tid: string | null) {
  try {
    if (tid) localStorage.setItem(MARKER_KEY, tid);
    else localStorage.removeItem(MARKER_KEY);
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  // On tenant change inside this tab — wipe everything from previous tenant.
  window.addEventListener('pos-tenant-change', async (e: Event) => {
    const detail = (e as CustomEvent).detail as { from: string | null; to: string | null };
    // Normal login (null → tenant) must be lightweight; the store is already
    // running, so wiping IndexedDB here breaks sync. Deep wipe is reserved for
    // forceLogoutAndWipe().
    await fullCrossTenantWipe(detail?.to ?? null);
    writeMarker(detail?.to ?? null);
  });

  // On first load — set marker + wipe any stale other-tenant data lying around.
  try {
    const cur = getTenantId();
    const prev = localStorage.getItem(MARKER_KEY);
    if (cur && prev && prev !== cur) {
      // A different tenant was last active here → hard wipe before rendering.
      void fullCrossTenantWipe(cur);
    }
    writeMarker(cur);
  } catch { /* ignore */ }

  // Another tab logged into a different tenant → reload this tab to avoid mixed data.
  window.addEventListener('storage', (e) => {
    if (e.key !== MARKER_KEY) return;
    const cur = getTenantId();
    if (cur && e.newValue && e.newValue !== cur) {
      // Force reload so this tab doesn't keep showing the old tenant's data.
      try { window.location.reload(); } catch { /* ignore */ }
    }
  });
}
