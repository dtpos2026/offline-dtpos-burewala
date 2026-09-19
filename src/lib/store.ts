import {
  AppData, Category, MenuItem, Order, DiningTable, Floor, Kitchen, Waiter, Rider, User,
  TokenRecord,
  RestaurantSettings, InventoryItem, StockLog,
  Employee, Attendance, Leave, Payslip, Advance,
  AccountCategory, Transaction, Party, LedgerEntry, DailyCashClose, LedgerType,
  Recipe, Wastage, CustomerProfile, Branch, CreditPayment, PaymentMethod, PromoCode,
  PaymentAccount, Deal, CartItem,
} from './types';
import { consumeStockForOrder, reverseStockForOrder } from './stockEngine';

import { seedData } from './seed-data';
import { diffItemEdits, diffOrderMeta, makeEditLog } from './orderHistory';
import { isElectron, dbRead, dbWrite } from './electron';
import { getWhatsAppTemplates } from './whatsapp';
import { isCloudConfigured, cloudDb } from './offlineNoCloud';
import { getTenantId } from './tenant';
import {
  doc, getDoc, getDocFromServer, setDoc, deleteDoc, collection, getDocs, getDocsFromServer, writeBatch, onSnapshot, runTransaction,
} from '@/lib/offlineNoCloud';
import { toast } from 'sonner';

const STORAGE_KEY_BASE = 'desi-pos-data';
// Per-tenant cache key — different restaurants must NEVER share local cache,
// otherwise switching login shows stale data (e.g. branches) from previous tenant.
function STORAGE_KEY(): string {
  const tid = getTenantId();
  return tid ? `${STORAGE_KEY_BASE}:${tid}` : STORAGE_KEY_BASE;
}

let cachedData: AppData | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const STORE_INIT_TIMEOUT_MS = 18000;

function timeout<T>(promise: Promise<T>, ms: number, message = 'Store init timed out'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(t); resolve(value); },
      (error) => { clearTimeout(t); reject(error); },
    );
  });
}

function refreshCloudStoreInBackground() {
  void (async () => {
    try {
      const data = await cloudLoadAll();
      stampTenant(data);
      cachedData = data;
      try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(data)); } catch {}
      try { startRealtimeListeners(); } catch (e) { console.warn('[store] realtime listeners failed', e); }
      emitDataChange('*');
    } catch (e) {
      console.warn('[store] background cloud refresh skipped', e);
      try { startRealtimeListeners(); } catch {}
    }
  })();
}

// ============================================================
// TENANT GUARD — prevents data leak between restaurants
// ============================================================
// Every cached snapshot is stamped with the tenant id it belongs to.
// Any read/write that detects a mismatch is rejected so restaurant A's
// data can NEVER overwrite restaurant B's settings/menu/etc., even during
// the brief window between login → React re-render → initStore() finishing.
function cacheTenantId(): string | null {
  return (cachedData as any)?._tenantId || null;
}
function tenantGuardOk(): boolean {
  const tid = getTenantId();
  // No cache yet, or cache has no stamp (legacy), or stamp matches → OK
  if (!cachedData) return true;
  const stamped = cacheTenantId();
  if (!stamped) return true;
  return stamped === tid;
}
function stampTenant(data: AppData) {
  try { (data as any)._tenantId = getTenantId(); } catch {}
}

function isPublicStoreRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return /^#\/(order|track|rider-portal|order-taker)(\/|\?|$)/.test(window.location.hash || '');
}

function isEmptySeedLike(data: any): boolean {
  if (!data) return true;
  const hasBusinessData = ARRAY_COLLECTIONS.some(k => k !== 'users' && ((data as any)[k] || []).length > 0);
  const hasRestaurantIdentity = Boolean(
    data?.settings?.restaurantName || data?.settings?.name || data?.settings?.logo || data?.settings?.appLogo,
  );
  return !hasBusinessData && !hasRestaurantIdentity;
}

function emptyRuntimeData(): AppData {
  const data = seedData() as AppData;
  ensureFields(data);
  stampTenant(data);
  return data;
}
// React to tenant changes (login / logout / switch) — drop in-memory cache
// and stop listeners so the next read goes to the correct tenant's cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('pos-tenant-change', () => {
    // Drop any queued flush too — otherwise the previous tenant's snapshot
    // could be written back over the key that session isolation just wiped.
    pendingLocalWrite = false;
    cachedData = null;
    try { stopRealtimeListeners(); } catch { /* already stopped */ }
  });
}

// ============================================================
// Collection mapping — har array ek separate cloud collection
// ============================================================
const ARRAY_COLLECTIONS = [
  'categories', 'menuItems', 'orders', 'tables', 'floors', 'kitchens', 'waiters', 'riders', 'users',
  'inventory', 'stockLogs', 'employees', 'attendance', 'leaves', 'payslips', 'advances',
  'accountCategories', 'transactions', 'parties', 'ledger', 'dailyCashCloses',
  'tokenRecords',
  'receivingEntries', 'marketingContacts', 'recipes', 'wastages', 'customers', 'branches',
  'creditPayments', 'promoCodes', 'paymentAccounts', 'deals',
] as const;


type ArrayKey = typeof ARRAY_COLLECTIONS[number];


function ensureFields(data: AppData) {
  const d = data as any;
  for (const k of ARRAY_COLLECTIONS) if (!Array.isArray(d[k])) d[k] = [];
  // OFFLINE BUILD — guarantee a default admin login always exists.
  // Agar purana localStorage cache khali users[] ke saath save hua tha,
  // ya admin user delete kar diya gaya, to login lock-out se bachao.
  if (!isCloudConfigured()) {
    const users = d.users as any[];
    const hasAdmin = users.some(u => (u?.username || '').toLowerCase() === 'admin');
    if (!hasAdmin) {
      users.push({
        id: 'admin-default',
        name: 'Administrator',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        isActive: true,
      });
    }
  }
}


function tenantBase() {
  const tid = getTenantId();
  if (!tid) return null;
  return ['tenants', tid] as const;
}

function colRef(name: ArrayKey) {
  const base = tenantBase();
  if (!base) return null;
  return collection(cloudDb(), base[0], base[1], name);
}

function settingsRef() {
  const base = tenantBase();
  if (!base) return null;
  return doc(cloudDb(), base[0], base[1], 'meta', 'settings');
}

function counterRef() {
  const base = tenantBase();
  if (!base) return null;
  return doc(cloudDb(), base[0], base[1], 'meta', 'counter');
}

function publicOrderLookupRef(orderNo: string | number) {
  const base = tenantBase();
  if (!base || orderNo == null || orderNo === '') return null;
  return doc(cloudDb(), base[0], base[1], 'publicOrderLookups', String(orderNo));
}

function useCloudStore(): boolean {
  return isCloudConfigured() && !!getTenantId();
}

// ============================================================
// Cloud helpers — per-entity writes
// ============================================================
// The document store rejects `undefined` field values. Recursively strip them
// before any setDoc call.
function sanitizeForCloud<T>(value: T): T {
  if (value === null || value === undefined) return value as T;
  if (Array.isArray(value)) {
    return value
      .filter(v => v !== undefined)
      .map(v => sanitizeForCloud(v)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = sanitizeForCloud(v);
    }
    return out;
  }
  return value;
}

// ----- Sync status tracking (for offline indicator) -----
type SyncListener = (s: { online: boolean; pending: number; lastError?: string }) => void;
const syncListeners = new Set<SyncListener>();
let pendingWrites = 0;
let lastSyncError: string | undefined;
function emitSync() {
  const snap = { online: typeof navigator !== 'undefined' ? navigator.onLine : true, pending: pendingWrites, lastError: lastSyncError };
  syncListeners.forEach(l => { try { l(snap); } catch {} });
}
export function onSyncStatus(cb: SyncListener): () => void {
  syncListeners.add(cb);
  emitSync();
  return () => syncListeners.delete(cb);
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { lastSyncError = undefined; emitSync(); });
  window.addEventListener('offline', () => emitSync());
}
let toastDebounce = 0;
function reportCloudError(label: string, e: any) {
  lastSyncError = e?.message || String(e);
  console.error(`[cloud] ${label} failed`, e);
  const now = Date.now();
  if (now - toastDebounce > 5000) {
    toastDebounce = now;
    try { toast.error('Cloud sync issue — data is saved locally and will retry'); } catch {}
  }
  emitSync();
}

async function cloudSaveItem(col: ArrayKey, id: string, data: any) {
  if (!tenantGuardOk()) { console.warn('[cloud] BLOCKED save (tenant mismatch)', col, id); return; }
  const c = colRef(col); if (!c) return;
  pendingWrites++; emitSync();
  // Stamp local timestamp for conflict resolution (last-write-wins by _updatedAt).
  const stamped = { ...data, id, _updatedAt: Date.now() };
  try { await setDoc(doc(c, id), sanitizeForCloud(stamped)); }
  catch (e) { reportCloudError(`save ${col}/${id}`, e); }
  finally { pendingWrites = Math.max(0, pendingWrites - 1); emitSync(); }
}

async function cloudDeleteItem(col: ArrayKey, id: string) {
  if (!tenantGuardOk()) { console.warn('[cloud] BLOCKED delete (tenant mismatch)', col, id); return; }
  const c = colRef(col); if (!c) return;
  pendingWrites++; emitSync();
  try { await deleteDoc(doc(c, id)); }
  catch (e) { reportCloudError(`delete ${col}/${id}`, e); }
  finally { pendingWrites = Math.max(0, pendingWrites - 1); emitSync(); }
}

async function cloudSaveSettings(s: RestaurantSettings) {
  if (!tenantGuardOk()) { console.warn('[cloud] BLOCKED settings save (tenant mismatch)'); return; }
  const r = settingsRef(); if (!r) return;
  pendingWrites++; emitSync();
  try { await setDoc(r, sanitizeForCloud(s as any)); }
  catch (e) { reportCloudError('save settings', e); }
  finally { pendingWrites = Math.max(0, pendingWrites - 1); emitSync(); }
}

async function cloudSaveCounter(value: number) {
  if (!tenantGuardOk()) { console.warn('[cloud] BLOCKED counter save (tenant mismatch)'); return; }
  const r = counterRef(); if (!r) return;
  try { await setDoc(r, { value }); }
  catch (e) { reportCloudError('save counter', e); }
}

async function cloudSaveOrderLookup(order: Order) {
  const r = publicOrderLookupRef(order.orderNumber); if (!r) return;
  const phoneLast4 = (order.customer?.phone || '').replace(/\D/g, '').slice(-4);
  try {
    const existing = await getDocFromServer(r).catch(() => null);
    if (existing?.exists()) return;
    await setDoc(r, sanitizeForCloud({
      orderNo: String(order.orderNumber),
      orderId: order.id,
      phoneLast4: phoneLast4 || undefined,
      tableLabel: (order as any).tableLabel || undefined,
      source: order.source || undefined,
      createdAt: order.createdAt || undefined,
      updatedAt: new Date().toISOString(),
    }));
  } catch (e) { reportCloudError(`save public order lookup/${order.orderNumber}`, e); }
}

function backfillPublicOrderLookups(orders: Order[]) {
  for (const order of orders) {
    if (order?.id && order.orderNumber != null) cloudSaveOrderLookup(order);
  }
}

// ============================================================
// Real-time listeners (orders + a few hot collections)
// ============================================================
const activeUnsubs: Array<() => void> = [];
export function stopRealtimeListeners() {
  while (activeUnsubs.length) { try { activeUnsubs.pop()!(); } catch {} }
}
const DATA_CHANGE_EVENT = 'dt-pos-data-change';
const pendingChangeNames = new Set<string>();
let changeFlushTimer: ReturnType<typeof setTimeout> | null = null;
function emitDataChange(name: string) {
  pendingChangeNames.add(name);
  if (changeFlushTimer) return;
  // Debounce burst snapshots into one notification per ~120ms
  changeFlushTimer = setTimeout(() => {
    changeFlushTimer = null;
    const names = Array.from(pendingChangeNames);
    pendingChangeNames.clear();
    try {
      // Single combined event
      window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, { detail: { collection: '*', collections: names } }));
    } catch {}
    // And the same nudge to the other windows, so the kitchen board and the
    // counter screen react now rather than on their next poll. Fire-and-
    // forget by design: the till must never wait on a display.
    signalOtherWindows(names);
  }, 120);
}
export function onDataChange(cb: (collection: string) => void): () => void {
  const h = (e: Event) => {
    try {
      const det = (e as CustomEvent).detail || {};
      const names: string[] = det.collections || [det.collection || '*'];
      // Fire once per unique collection (component decides what to do)
      const seen = new Set<string>();
      for (const n of names) {
        if (seen.has(n)) continue;
        seen.add(n);
        cb(n);
      }
    } catch {}
  };
  window.addEventListener(DATA_CHANGE_EVENT, h);
  return () => window.removeEventListener(DATA_CHANGE_EVENT, h);
}

// Pending snapshot buffer — batch local writes to avoid storm
const pendingSnapshotData = new Map<string, any[]>();
let snapshotFlushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSnapshotFlush() {
  if (snapshotFlushTimer) return;
  snapshotFlushTimer = setTimeout(() => {
    snapshotFlushTimer = null;
    if (pendingSnapshotData.size === 0) return;
    const d = loadData();
    for (const [name, remoteArr] of pendingSnapshotData) {
      // Conflict-aware merge: keep local item if its _updatedAt is newer than remote's.
      // This protects against races where cloud snapshot arrives after a fresher local write.
      const localArr: any[] = ((d as any)[name] || []) as any[];
      const localById = new Map(localArr.map(x => [x?.id, x]));
      const merged: any[] = [];
      const seen = new Set<string>();
      for (const remote of remoteArr) {
        const id = remote?.id;
        if (!id) { merged.push(remote); continue; }
        seen.add(id);
        const local = localById.get(id);
        const lT = Number(local?._updatedAt || 0);
        const rT = Number(remote?._updatedAt || 0);
        merged.push(local && lT > rT ? local : remote);
      }
      // Preserve local-only items (unsynced pending writes not yet on server)
      for (const local of localArr) {
        if (local?.id && !seen.has(local.id) && Number(local?._updatedAt || 0) > 0) {
          merged.push(local);
        }
      }
      (d as any)[name] = merged;
    }
    pendingSnapshotData.clear();
    saveLocal(d);
  }, 80);
}

export function startRealtimeListeners() {
  if (!useCloudStore()) return;
  stopRealtimeListeners();
  const isPublicRoute = typeof window !== 'undefined' && /^#\/(order|track|rider-portal|order-taker)(\/|\?|$)/.test(window.location.hash || '');
  const liveCollections: ArrayKey[] = isPublicRoute
    ? ['orders', 'menuItems', 'categories', 'branches', 'riders', 'users', 'deals']
    : ['orders', 'menuItems', 'categories', 'inventory', 'customers', 'riders', 'tables', 'floors', 'kitchens', 'waiters', 'branches', 'promoCodes', 'paymentAccounts', 'users', 'deals'];
  for (const name of liveCollections) {
    const c = colRef(name); if (!c) continue;
    const unsub = onSnapshot(c, (snap) => {
      const arr: any[] = [];
      snap.forEach(d => arr.push(d.data()));
      pendingSnapshotData.set(name, arr);
      scheduleSnapshotFlush();
      emitDataChange(name);
    }, (err) => reportCloudError(`listen ${name}`, err));
    activeUnsubs.push(unsub);
  }
  // settings live
  const sr = settingsRef();
  if (sr) {
    const unsubS = onSnapshot(sr, (snap) => {
      if (!snap.exists()) return;
      const incoming: any = snap.data();
      const d = loadData();
      const localTs = (d as any)?.settings?.settingsUpdatedAt;
      const cloudTs = incoming?.settingsUpdatedAt;
      // Issue-7 fix (Order-Type popup reset): cloud ka PURANA snapshot local
      // ki nayi settings ko overwrite na kare. Pehle blind overwrite hota tha
      // — user toggle off karta, debounced cloud-write (600ms) se pehle/baad
      // aane wala stale snapshot setting wapas ON kar deta tha.
      if (localTs && (!cloudTs || new Date(cloudTs).getTime() < new Date(localTs).getTime())) {
        try { console.log('[store] stale settings snapshot ignored', { cloudTs, localTs }); } catch {}
        return;
      }
      (d as any).settings = incoming;
      saveLocal(d);
      emitDataChange('settings');
    }, (err) => reportCloudError('listen settings', err));
    activeUnsubs.push(unsubS);
  }
}


// One-time migration: if the old `data/all` doc exists, scatter it into collections
async function migrateLegacyDocIfPresent() {
  const base = tenantBase(); if (!base) return;
  const legacyRef = doc(cloudDb(), base[0], base[1], 'data', 'all');
  try {
    const snap = await getDoc(legacyRef);
    if (!snap.exists()) return;
    const old = snap.data() as AppData;
    console.log('[cloud] Migrating legacy data/all → collections…');
    const batch = writeBatch(cloudDb());
    for (const col of ARRAY_COLLECTIONS) {
      const arr = ((old as any)[col] || []) as any[];
      for (const item of arr) {
        if (!item?.id) continue;
        batch.set(doc(colRef(col)!, item.id), item);
      }
    }
    if (old.settings) batch.set(settingsRef()!, old.settings as any);
    if (typeof old.orderCounter === 'number') batch.set(counterRef()!, { value: old.orderCounter });
    await batch.commit();
    await deleteDoc(legacyRef);
    console.log('[cloud] Legacy migration complete.');
  } catch (e) {
    console.warn('[cloud] legacy migration skipped:', e);
  }
}

async function cloudLoadAll(): Promise<AppData> {
  // Pehle migrate (idempotent)
  await migrateLegacyDocIfPresent();

  const out: any = {};
  let loadedOrdersFromCloud = false;
  const loadErrors: Array<{ name: string; error: any }> = [];
  const publicRoute = isPublicStoreRoute();
  // Parallel load all collections. Public customer/staff links can only read
  // menu-facing collections, so keep permitted data instead of failing the
  // whole store when private collections (users/orders/etc.) are blocked.
  await Promise.all(ARRAY_COLLECTIONS.map(async (name) => {
    const c = colRef(name)!;
    try {
      const snap = await getDocsFromServer(c);
      const arr: any[] = [];
      snap.forEach(d => arr.push(d.data()));
      out[name] = arr;
      if (name === 'orders') loadedOrdersFromCloud = true;
    } catch (e: any) {
      const existing = (cachedData as any)?.[name];
      out[name] = Array.isArray(existing) ? existing : [];
      if (!publicRoute || e?.code !== 'permission-denied') {
        loadErrors.push({ name, error: e });
        console.warn(`[store] load ${name} skipped:`, e);
      }
    }
  }));

  if (loadErrors.length && !publicRoute) {
    const first = loadErrors[0];
    throw new Error(`Cloud data not fully loaded (${first.name}): ${first.error?.message || first.error?.code || first.error}`);
  }

  // Settings
  let sSnap;
  try {
    sSnap = publicRoute ? await getDoc(settingsRef()!) : await getDocFromServer(settingsRef()!);
  } catch (e: any) {
    if (!publicRoute) throw new Error(`Cloud settings not loaded: ${e?.message || e?.code || e}`);
    sSnap = await getDoc(settingsRef()!);
  }
  out.settings = sSnap.exists() ? sSnap.data() : (seedData() as any).settings;

  // Counter
  let cSnap;
  try {
    cSnap = publicRoute ? await getDoc(counterRef()!) : await getDocFromServer(counterRef()!);
  } catch (e: any) {
    if (!publicRoute) throw new Error(`Cloud counter not loaded: ${e?.message || e?.code || e}`);
    cSnap = await getDoc(counterRef()!);
  }
  out.orderCounter = cSnap.exists() ? (cSnap.data() as any).value || 0 : 0;

  ensureFields(out);
  if (loadedOrdersFromCloud) backfillPublicOrderLookups(out.orders || []);
  return out as AppData;
}

// First-time seed: write seed data into collections
async function cloudSeedIfEmpty(): Promise<AppData> {
  const seed = seedData() as AppData;
  ensureFields(seed);
  const batch = writeBatch(cloudDb());
  for (const col of ARRAY_COLLECTIONS) {
    const arr = ((seed as any)[col] || []) as any[];
    for (const item of arr) {
      if (!item?.id) continue;
      batch.set(doc(colRef(col)!, item.id), item);
    }
  }
  batch.set(settingsRef()!, seed.settings as any);
  batch.set(counterRef()!, { value: seed.orderCounter || 0 });
  await batch.commit();
  return seed;
}

// ============================================================
// initStore
// ============================================================
export async function initStore(): Promise<void> {
  // Reset in-memory cache — previous tenant's data must not leak across login switches.
  cachedData = null;
  let hasLocalCache = false;
  // STEP 1 — Instant: hydrate from per-tenant localStorage cache so UI can render immediately
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (raw) {
      const parsed = JSON.parse(raw);
      const stamped = parsed?._tenantId;
      // Only adopt if it belongs to the current tenant (or legacy unstamped blob).
      if (!stamped || stamped === getTenantId()) {
        ensureFields(parsed);
        stampTenant(parsed);
        if (useCloudStore() && isEmptySeedLike(parsed)) {
          // Old buggy builds could save empty/default data after a sync timeout.
          // Never trust that as the restaurant cache; force a real cloud load.
          localStorage.removeItem(STORAGE_KEY());
        } else {
          cachedData = parsed;
          hasLocalCache = true;
        }
      }
    }
  } catch {}

  if (useCloudStore()) {
    if (hasLocalCache) {
      refreshCloudStoreInBackground();
      return;
    }
    try {
      let data = await timeout(cloudLoadAll(), STORE_INIT_TIMEOUT_MS);
      // If everything is empty (fresh tenant), seed once. For existing tenants,
      // partial/failed cloud reads throw above, so we never overwrite with empty defaults.
      const allEmpty = ARRAY_COLLECTIONS.every(k => ((data as any)[k] || []).length === 0)
                      && isEmptySeedLike(data);
      if (allEmpty) {
        console.log('[cloud] Fresh tenant — seeding default data');
        data = await cloudSeedIfEmpty();
      }
      // One-time migration: legacy localStorage deals → cloud-synced deals collection.
      try {
        if ((!(data as any).deals || (data as any).deals.length === 0)) {
          const legacy = localStorage.getItem('dt-deals');
          if (legacy) {
            const arr = JSON.parse(legacy);
            if (Array.isArray(arr) && arr.length) {
              (data as any).deals = arr;
              for (const dl of arr) { if (dl?.id) cloudSaveItem('deals' as any, dl.id, dl); }
              console.log('[store] migrated', arr.length, 'legacy deals to cloud');
            }
          }
        }
      } catch {}
      stampTenant(data);
      cachedData = data;
      try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(data)); } catch {}
      try { startRealtimeListeners(); } catch (e) { console.warn('[store] realtime listeners failed', e); }
      return;
    } catch (e) {
      console.error('[store] cloud init failed; keeping app locked until cloud/cache is available:', e);
      refreshCloudStoreInBackground();
      throw e;
    }
  }


  // Electron file
  if (isElectron()) {
    try {
      const raw = await dbRead();
      if (raw) {
        cachedData = JSON.parse(raw);
        ensureFields(cachedData!);
        stampTenant(cachedData!);
        try { localStorage.setItem(STORAGE_KEY(), JSON.stringify(cachedData)); } catch {}
        return;
      }
    } catch (e) { console.error('[store] Electron read failed:', e); }
  }

  // localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (raw) {
      cachedData = JSON.parse(raw);
      ensureFields(cachedData!);
      stampTenant(cachedData!);
      return;
    }
  } catch (e) { console.error('[store] localStorage read failed:', e); }

  // Seed only in local/non-cloud mode. Cloud tenants must never see default data
  // when sync is slow, because it looks like restaurant data was deleted.
  if (useCloudStore()) {
    cachedData = emptyRuntimeData();
    return;
  }
  cachedData = seedData() as AppData;
  ensureFields(cachedData);
  stampTenant(cachedData);
  saveLocal(cachedData);
}

function loadData(): AppData {
  // Tenant guard — if cached data belongs to a different tenant, drop it.
  if (cachedData && !tenantGuardOk()) {
    console.warn('[store] dropping stale cache from previous tenant');
    cachedData = null;
  }
  if (cachedData) return cachedData;
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (raw) {
      const parsed = JSON.parse(raw);
      // Only adopt cached blob if its stamp matches current tenant (or unstamped legacy + we have a tenant).
      const stamped = parsed?._tenantId;
      const tid = getTenantId();
      if (!stamped || stamped === tid) {
        cachedData = parsed;
        ensureFields(cachedData!);
        stampTenant(cachedData!);
        return cachedData!;
      }
    }
  } catch (e) { console.error(e); }
  cachedData = useCloudStore() ? emptyRuntimeData() : seedData() as AppData;
  ensureFields(cachedData);
  stampTenant(cachedData);
  if (!useCloudStore()) saveLocal(cachedData);
  return cachedData;
}

// ============================================================
// PERSISTENCE  (v1.0.40 — the reason "Pay" used to freeze the window)
// ------------------------------------------------------------
// Every mutation used to serialise the ENTIRE database and write it to
// localStorage synchronously, then serialise it a SECOND time (pretty-printed,
// so roughly double the bytes) for the Electron file. Saving one paid bill
// touches the order, the table, each affected inventory row and the customer
// profile, so a single Pay click ran a dozen full-database serialisations
// back to back on the UI thread — which is exactly the freeze the cashier saw.
//
// Now: mutations mark the cache dirty and one flush runs at the end of the
// current task, so a whole Pay collapses into ONE serialisation, reused for
// both sinks. The durability window is a single microtask, and anything that
// must not be lost (a counted bill, logout, window close) forces a flush.
// ============================================================
let pendingLocalWrite = false;
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  // Microtask, not a timer: everything in the current synchronous operation
  // is coalesced, but the write still lands before the browser yields.
  queueMicrotask(() => { flushScheduled = false; flushPendingWrite(); });
}

/**
 * Serialise once and push to both sinks.
 * @param immediateDisk skip the Electron debounce (used for counted bills,
 *        logout and window close, where losing the write is not acceptable).
 */
function flushPendingWrite(immediateDisk = false) {
  if (!pendingLocalWrite || !cachedData) return;
  pendingLocalWrite = false;
  const json = JSON.stringify(cachedData);
  try { localStorage.setItem(STORAGE_KEY(), json); } catch (e) { console.error('[store] localStorage write failed', e); }
  if (isElectron()) {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (immediateDisk) {
      dbWrite(json).catch(err => console.error('[electron] write fail:', err));
    } else {
      writeTimer = setTimeout(() => {
        writeTimer = null;
        dbWrite(json).catch(err => console.error('[electron] write fail:', err));
      }, 200);
    }
  }
}

// Local cache only — used after every mutation
function saveLocal(data: AppData) {
  stampTenant(data);
  cachedData = data;
  pendingLocalWrite = true;
  scheduleFlush();
}

// ============================================================
// CROSS-WINDOW SYNC — why the second screen never updated.
//
// `loadData()` returns an in-memory `cachedData`, filled once from
// localStorage and then reused. In the POS window that is correct: every
// mutation goes through `saveLocal`, which replaces the cache and writes.
//
// But the Kitchen Display and the Customer Display are SEPARATE Electron
// windows running the same code. They only ever read, so nothing in them ever
// replaced that cache — it was filled when the window opened and stayed that
// way. Their five-second poll dutifully called `getOrders()` and got the same
// snapshot every time, so a customer's number never moved to READY, a new
// ticket never reached the kitchen board, and both screens showed whatever
// happened to be on them when the shop opened them.
//
// The `storage` event is the fix and it is exactly the right one: the browser
// fires it in every OTHER window when one of them writes, and never in the
// window that did the writing. Invalidating here and announcing a data change
// makes the read-only screens live without giving them a write path.
//
// The pending-write case. A mutation in THIS window is only in memory for a
// single microtask before it is flushed. If a remote write lands inside that
// window, ours is flushed first so it cannot be discarded — which means the
// remote change is briefly overwritten. That is last-write-wins, which is
// what this store has always been; the alternative on the table was a second
// screen that never updates at all.
// ============================================================
// ===== THE INSTANT SIGNAL =====
//
// The `storage` event below is the reliable cross-window signal, but it only
// fires once a write has been committed to disk, and this store batches its
// writes. A BroadcastChannel carries the nudge straight across at the moment
// the mutation happens, so a number reaching READY on the counter screen, or
// a ticket appearing on the kitchen board, is immediate rather than a beat
// behind.
//
// It is a NUDGE ONLY. No data travels on it — the receiving window drops its
// cache and re-reads from storage, exactly as it does for a storage event. So
// a browser without BroadcastChannel loses nothing but the promptness, and
// the till is never waiting on a display window for anything.
const SIGNAL_CHANNEL = 'dtpos-data-signal';
let signalChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') signalChannel = new BroadcastChannel(SIGNAL_CHANNEL);
} catch { signalChannel = null; }

/** Tell the other windows something changed. Never throws into a mutation. */
function signalOtherWindows(collections: string[]) {
  try { signalChannel?.postMessage({ collections, at: Date.now() }); } catch { /* best effort */ }
}

if (typeof window !== 'undefined') {
  let announce: ReturnType<typeof setTimeout> | null = null;

  const invalidateAndAnnounce = (collections: string[] = ['*']) => {
    // Never discard a mutation of ours that has not reached disk yet.
    if (pendingLocalWrite) { try { flushPendingWrite(true); } catch { /* best effort */ } }
    cachedData = null;
    if (announce) return;
    announce = setTimeout(() => {
      announce = null;
      try {
        window.dispatchEvent(new CustomEvent(DATA_CHANGE_EVENT, {
          detail: { collection: collections[0] || '*', collections },
        }));
      } catch { /* no window */ }
    }, 40);
  };

  try {
    signalChannel?.addEventListener('message', (e: MessageEvent) => {
      const cols = Array.isArray((e.data || {}).collections) ? e.data.collections : ['*'];
      invalidateAndAnnounce(cols);
    });
  } catch { /* the storage event below still covers it */ }

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY() || e.newValue === null) return;
    // Lazy: the next read re-parses. A burst of remote writes therefore costs
    // one parse per actual read, not one per event.
    invalidateAndAnnounce(['*']);
  });
}

// Last line of defence: never lose a pending write when the window goes away.
if (typeof window !== 'undefined') {
  const flushOnExit = () => { try { flushPendingWrite(true); } catch { /* closing anyway */ } };
  window.addEventListener('beforeunload', flushOnExit);
  window.addEventListener('pagehide', flushOnExit);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnExit();
  });
}

/** Force any pending local changes to the Electron JSON DB immediately.
 *  Used before offline staff logout so menu/settings/orders cannot appear to
 *  vanish if the user logs out right after making changes. */
export async function flushLocalStoreToDisk(): Promise<boolean> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const data = cachedData || loadData();
  if (!data) return true;
  stampTenant(data);
  pendingLocalWrite = false;
  const json = JSON.stringify(data);
  try { localStorage.setItem(STORAGE_KEY(), json); } catch { /* quota */ }
  if (!isElectron()) return true;
  try {
    return await dbWrite(json);
  } catch (err) {
    console.error('[electron] immediate write fail:', err);
    return false;
  }
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function upsert<T extends { id: string }>(arr: T[], item: T) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
}

// ============================================================
// Per-entity save helpers — local + cloud
// ============================================================
function saveEntity<T extends { id: string }>(col: ArrayKey, item: T) {
  const d = loadData();
  const arr = (d as any)[col] as T[];
  upsert(arr, item);
  saveLocal(d);
  if (useCloudStore()) cloudSaveItem(col, item.id, item);
}

function deleteEntity(col: ArrayKey, id: string) {
  const d = loadData();
  (d as any)[col] = ((d as any)[col] as any[]).filter(x => x.id !== id);
  saveLocal(d);
  if (useCloudStore()) cloudDeleteItem(col, id);
}

// ============ Categories ============
export function getCategories(): Category[] {
  // sortOrder ke mutabiq (client requirement: manual/ascending order)
  return loadData().categories
    .filter(c => !(c as any).deleted)
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name));
}
export function getDeletedCategories(): Category[] {
  return loadData().categories.filter(c => (c as any).deleted);
}
export function saveCategory(cat: Category) { saveEntity('categories', cat); }
/** Soft delete — moves to Recycle Bin. Restorable. */
export function deleteCategory(id: string) {
  const d = loadData();
  const c = d.categories.find(x => x.id === id);
  if (!c) return;
  saveEntity('categories', { ...c, deleted: true, deletedAt: Date.now() } as any);
}
export function restoreCategory(id: string) {
  const d = loadData();
  const c = d.categories.find(x => x.id === id);
  if (!c) return;
  const { deleted, deletedAt, ...clean } = c as any;
  saveEntity('categories', clean as Category);
}
export function permanentDeleteCategory(id: string) { deleteEntity('categories', id); }

// ============ Menu ============
export function getMenuItems(): MenuItem[] {
  // sortOrder ke mutabiq (client requirement: items ki bhi manual/ascending order)
  return loadData().menuItems
    .filter(m => !(m as any).deleted)
    .sort((a, b) => ((a as any).sortOrder ?? 9999) - ((b as any).sortOrder ?? 9999)
      || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }));
}
export function getDeletedMenuItems(): MenuItem[] {
  return loadData().menuItems.filter(m => (m as any).deleted);
}
export function saveMenuItem(item: MenuItem) { saveEntity('menuItems', item); }
/** Soft delete — moves to Recycle Bin. Restorable. */
export function deleteMenuItem(id: string) {
  const d = loadData();
  const m = d.menuItems.find(x => x.id === id);
  if (!m) return;
  saveEntity('menuItems', { ...m, deleted: true, deletedAt: Date.now() } as any);
}
export function restoreMenuItem(id: string) {
  const d = loadData();
  const m = d.menuItems.find(x => x.id === id);
  if (!m) return;
  const { deleted, deletedAt, ...clean } = m as any;
  saveEntity('menuItems', clean as MenuItem);
}
export function permanentDeleteMenuItem(id: string) { deleteEntity('menuItems', id); }

// ============ Orders ============
export function getOrders(): Order[] { return loadData().orders; }

/**
 * Pull latest orders from cloud into local cache. Used by the
 * Online Portal / Delivery Board / New-Order Notifier so website orders
 * appear without a full page reload.
 */
export async function refreshOrdersFromCloud(): Promise<Order[]> {
  if (!useCloudStore()) return getOrders();
  try {
    const c = colRef('orders'); if (!c) return getOrders();
    const snap = await getDocsFromServer(c);
    const arr: Order[] = [];
    snap.forEach(d => arr.push(d.data() as Order));
    const d = loadData();
    d.orders = arr;
    saveLocal(d);
    backfillPublicOrderLookups(arr);
    return arr;
  } catch (e) {
    console.error('[store] refreshOrdersFromCloud failed', e);
    return getOrders();
  }
}

/** Public-safe single order fetch. cloud rules allow GET for tracking, but not LIST. */
export async function getOrderFromCloudById(orderId: string): Promise<Order | null> {
  if (!orderId || !useCloudStore()) return getOrders().find(o => o.id === orderId) || null;
  try {
    const c = colRef('orders'); if (!c) return null;
    const snap = await getDocFromServer(doc(c, orderId));
    if (!snap.exists()) return null;
    const order = snap.data() as Order;
    const d = loadData();
    upsert(d.orders, order);
    saveLocal(d);
    return order;
  } catch (e) {
    console.error('[store] getOrderFromCloudById failed', e);
    return getOrders().find(o => o.id === orderId) || null;
  }
}

export async function getOrderFromCloudByLookup(orderNo: string | number, phoneLast4?: string, tableLabel?: string): Promise<Order | null> {
  if (!orderNo || !useCloudStore()) return null;
  try {
    const lookupRef = publicOrderLookupRef(orderNo); if (!lookupRef) return null;
    const snap = await getDocFromServer(lookupRef);
    if (!snap.exists()) return null;
    const lookup: any = snap.data();
    const expectedPhone = (phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const expectedTable = (tableLabel || '').trim().toLowerCase();
    if (expectedPhone && lookup.phoneLast4 && lookup.phoneLast4 !== expectedPhone) return null;
    if (expectedTable && lookup.tableLabel && !String(lookup.tableLabel).toLowerCase().includes(expectedTable)) return null;
    return await getOrderFromCloudById(lookup.orderId);
  } catch (e) {
    console.error('[store] getOrderFromCloudByLookup failed', e);
    return null;
  }
}
export function getNextOrderNumber(): number {
  const d = loadData();
  d.orderCounter += 1;
  saveLocal(d);
  if (useCloudStore()) cloudSaveCounter(d.orderCounter);
  return d.orderCounter;
}
/** Peek the next order number without incrementing (for previews). */
export function peekNextOrderNumber(): number {
  const d = loadData();
  return (d.orderCounter || 0) + 1;
}
/**
 * Atomic order number — uses cloud transaction so multiple devices/tabs
 * never get the same number. Falls back to local counter if offline.
 */
export async function getNextOrderNumberAsync(): Promise<number> {
  if (!useCloudStore()) return getNextOrderNumber();
  const r = counterRef();
  if (!r) return getNextOrderNumber();
  try {
    const next = await runTransaction(cloudDb(), async (tx) => {
      const snap = await tx.get(r);
      const cur = snap.exists() ? ((snap.data() as any).value || 0) : 0;
      const nv = cur + 1;
      tx.set(r, { value: nv });
      return nv;
    });
    const d = loadData();
    d.orderCounter = Math.max(d.orderCounter, next);
    saveLocal(d);
    return next;
  } catch (e) {
    console.warn('[store] atomic counter failed, fallback to local', e);
    return getNextOrderNumber();
  }
}
export function saveOrder(order: Order) {
  // Stamp current branch automatically if not set
  if (!order.branchId) {
    const bid = getCurrentBranchId();
    if (bid) order.branchId = bid;
  }
  const prev = loadData().orders.find(o => o.id === order.id);

  // ===== INVENTORY FIX: sale par stock minus =====
  // Previously stock was never deducted (client: "Inventory not working").
  // saveOrder is a single funnel — every pay path (POS, Running Bills, Retrieve,
  // Delivery, Receive Payment) goes through here. The flag prevents
  // double-deduction.
  if ((order.status === 'paid' || (order.status as any) === 'credit_received') && !(order as any).stockConsumed) {
    try {
      // Single funnel. Until v1.0.40 a paid bill went through THREE independent
      // deduction paths — consumeStockForOrder here, deductStockForOrder just
      // below, and consumeInventoryForOrder from the print queue — each with
      // its own (or no) duplicate guard, so a directly-linked item lost three
      // units of stock per sale. This is now the only one.
      consumeStockForOrder(order, {
        getInventory,
        getMenuItems,
        getRecipes,
        saveInventoryItem,
        appendStockLogs: appendSaleStockLogs,
      });
    } catch (e) { console.error('[stock] consume failed', e); }
  }
  // Void/cancel par stock wapas
  if ((order.status === 'void' || order.status === 'cancelled') && (order as any).stockConsumed) {
    try {
      reverseStockForOrder(order, { getInventory, getMenuItems, getRecipes, saveInventoryItem });
    } catch (e) { console.error('[stock] reverse failed', e); }
  }
  const wasCounted = prev && (prev.status === 'paid' || prev.status === 'credit_received');
  const isCounted = order.status === 'paid' || order.status === 'credit_received';

  // ===== Append-only edit history (auto-diff) =====
  try {
    const newLogs: import('./types').OrderEditLog[] = [];
    if (!prev) {
      newLogs.push(makeEditLog('CREATE', { newValue: `Order #${order.orderNumber}` }));
      for (const it of order.items || []) {
        newLogs.push(makeEditLog('ADD', { itemId: it.id, itemName: it.name, newValue: it.quantity }));
      }
    } else {
      newLogs.push(...diffItemEdits(prev.items, order.items));
      newLogs.push(...diffOrderMeta(prev, order));
    }
    if (newLogs.length) {
      order.editLogs = [...(order.editLogs || prev?.editLogs || []), ...newLogs];
    } else if (!order.editLogs && prev?.editLogs) {
      order.editLogs = prev.editLogs;
    }
  } catch (e) { console.warn('[edit-log] failed', e); }

  saveEntity('orders', order);
  // A bill that represents money taken must not sit in a debounce window:
  // push the whole snapshot to disk immediately. Everything else in this
  // save (stock rows, customer profile, table state) has already been folded
  // into the same in-memory snapshot, so this is still ONE serialisation.
  if (order.status === 'paid' || order.status === 'partial'
      || (order.status as any) === 'credit_received' || order.status === 'void'
      || order.status === 'cancelled') {
    try { flushPendingWrite(true); } catch (e) { console.error('[store] bill flush failed', e); }
  }
  if (useCloudStore()) cloudSaveOrderLookup(order);
  // Customer profile sync — pass a flag so totals only increment on the FIRST transition into a counted state.
  if (order.customer || order.creditCustomerPhone) {
    const shouldIncrement = isCounted && !wasCounted;
    try { upsertCustomerFromOrder(order, shouldIncrement); } catch (e) { console.error('[customer] upsert failed', e); }
  }
}

export function deleteOrder(id: string) {
  // Cashiers may only delete a running (unpaid) bill they just opened; they
  // must never wipe paid/void history rows. Admin/manager bypass this guard.
  try {
    const me = getCurrentUser();
    if (me && me.role !== 'admin' && me.role !== 'manager') {
      const o = loadData().orders.find(x => x.id === id);
      if (o && (o.status === 'paid' || o.status === 'void' || o.status === 'cancelled' || o.status === 'credit_received')) {
        try { toast.error('Only admin can delete sales history'); } catch {}
        return;
      }
    }
  } catch {}
  deleteEntity('orders', id);
}

/** Log a reprint event on an order (receipt / KOT / token). */
export function logOrderReprint(orderId: string, type: 'receipt' | 'kot' | 'token' = 'receipt', by?: string) {
  const o = loadData().orders.find(x => x.id === orderId);
  if (!o) return;
  const entry = { at: new Date().toISOString(), by: by || getCurrentUserName(), type };
  o.reprintLog = [...(o.reprintLog || []), entry];
  o.reprintCount = (o.reprintCount || 0) + 1;
  // Also append to permanent editLogs so it shows in Audit History
  try {
    o.editLogs = [...(o.editLogs || []), makeEditLog('REPRINT', { newValue: type, reason: by })];
  } catch {}
  saveEntity('orders', o);
}

function getCurrentUserName(): string | undefined {
  try {
    const u = JSON.parse(localStorage.getItem('dt_pos_current_user') || 'null');
    return u?.name || u?.username;
  } catch { return undefined; }
}

/** Phase 3 — Kitchen workflow status setter */
export function setOrderKitchenStatus(orderId: string, status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'served' | 'delivered') {
  const o = loadData().orders.find(x => x.id === orderId);
  if (!o) return;
  o.kitchenStatus = status;
  o.kitchenStatusAt = new Date().toISOString();
  // P2 fix: keep deliveryStatus in sync for delivery orders so Delivery Board / Rider App see it.
  if (status === 'ready' && (o.orderType as any) === 'delivery') {
    if (o.deliveryStatus !== 'delivered' && o.deliveryStatus !== 'cancelled') {
      o.deliveryStatus = 'ready';
      (o as any).readyAt = (o as any).readyAt || new Date().toISOString();
    }
  }
  // For dine-in/takeaway: stamp readyAt so TrackOrderPage + Pickup screens can react.
  if (status === 'ready' && !(o as any).readyAt) {
    (o as any).readyAt = new Date().toISOString();
  }
  saveEntity('orders', o);

  // ===== Auto-queue WhatsApp to customer on Ready =====
  // Works for dine-in, takeaway, AND delivery — silently adds to pending queue.
  if (status === 'ready' && o.customer?.phone) {
    try {
      // Lazy import to avoid circular deps
      import('./delivery').then(({ notifyCustomerStage }) => {
        notifyCustomerStage(o, 'ready');
      }).catch(() => {});
    } catch {}
  }
}

/**
 * Phase 3 — mark an order as Void / Complimentary / Cancelled with a required reason.
 * These statuses NEVER count as paid sales (see isPaidSale in src/lib/sales.ts).
 */
export function markOrderVoid(orderId: string, reason: string, by?: string) {
  const o = loadData().orders.find(x => x.id === orderId);
  if (!o) return;
  o.status = 'void';
  o.voidReason = reason;
  o.voidBy = by;
  o.voidedAt = new Date().toISOString();
  saveEntity('orders', o);
}
export function markOrderComplimentary(orderId: string, reason: string, by?: string) {
  const o = loadData().orders.find(x => x.id === orderId);
  if (!o) return;
  o.status = 'complimentary';
  o.complimentaryReason = reason;
  o.complimentaryBy = by;
  o.complimentaryAt = new Date().toISOString();
  saveEntity('orders', o);
}
export function markOrderCancelled(orderId: string, reason: string, by?: string) {
  const o = loadData().orders.find(x => x.id === orderId);
  if (!o) return;
  o.status = 'cancelled';
  o.cancelReason = reason;
  o.cancelledBy = by;
  o.cancelledAt = new Date().toISOString();
  saveEntity('orders', o);
}

// ============ Tables ============
export function getTables(): DiningTable[] { return loadData().tables; }
export function saveTable(table: DiningTable) { saveEntity('tables', table); }
export function deleteTable(id: string) { deleteEntity('tables', id); }

export function getFloors(): Floor[] {
  return (loadData().floors || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}
export function saveFloor(f: Floor) { saveEntity('floors', f); }
export function deleteFloor(id: string) { deleteEntity('floors', id); }

export function getKitchens(): Kitchen[] {
  return (loadData().kitchens || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}
export function saveKitchen(k: Kitchen) { saveEntity('kitchens', k); }
export function deleteKitchen(id: string) { deleteEntity('kitchens', id); }



// ============ Waiters ============
export function getWaiters(): Waiter[] { return loadData().waiters; }
export function saveWaiter(w: Waiter) { saveEntity('waiters', w); }
export function deleteWaiter(id: string) { deleteEntity('waiters', id); }

// ============ Riders ============
export function getRiders(): Rider[] { return loadData().riders; }
export function saveRider(r: Rider) { saveEntity('riders', r); }
export function deleteRider(id: string) { deleteEntity('riders', id); }

// ============ Users ============
export function getUsers(): User[] { return loadData().users; }
export function saveUser(u: User) { saveEntity('users', u); }
export function deleteUser(id: string) { deleteEntity('users', id); }

/** Currently logged-in POS user (resolved from localStorage 'pos-user-id'). */
export function getCurrentUser(): User | null {
  try {
    const id = localStorage.getItem('pos-user-id');
    if (!id) return null;
    return getUsers().find(u => u.id === id) || null;
  } catch { return null; }
}

/** True when the active user may freely switch branches (admin / manager). */
export function canSwitchBranch(): boolean {
  const u = getCurrentUser();
  if (!u) return true; // pre-login / super-admin context
  return u.role === 'admin' || u.role === 'manager';
}


// ============ Settings ============
export function getSettings(): RestaurantSettings {
  const s = loadData().settings;
  const normalizedSettings = {
    ...s,
    urduFont: s.urduFont || 'none',
    marketingFooter: (s.marketingFooter && s.marketingFooter.trim()) ? s.marketingFooter : 'DIGITAL TARGET SOFTWARE SOLUTIONS\nDeveloped By: Taimoor Younas\n📞 0345-1873354',
    paperSize: s.paperSize || '80mm',
    receiptSizePreset: s.receiptSizePreset || 'standard-80',
    receiptMode: s.receiptMode || 'continuous',
    printerDriverType: s.printerDriverType || 'escpos',
    disableExtraFeed: s.disableExtraFeed !== false,
    autoCut: s.autoCut !== false,
    cutMode: s.cutMode || 'full',
    receiptMarginTop: typeof s.receiptMarginTop === 'number' ? s.receiptMarginTop : 0,
    receiptMarginBottom: typeof s.receiptMarginBottom === 'number' ? s.receiptMarginBottom : 0,
    receiptMarginLeft: typeof s.receiptMarginLeft === 'number' ? Math.max(3, s.receiptMarginLeft) : 3,
    receiptMarginRight: typeof s.receiptMarginRight === 'number' ? Math.max(3, s.receiptMarginRight) : 3,
    receiptTrimMm: typeof s.receiptTrimMm === 'number' ? s.receiptTrimMm : 3,
    kitchenPreparingMinutes: s.kitchenPreparingMinutes || 5,
    kitchenWarningMinutes: Math.max(s.kitchenWarningMinutes || 10, s.kitchenPreparingMinutes || 5),
    defaultPrepTimeMinutes: typeof s.defaultPrepTimeMinutes === 'number' && s.defaultPrepTimeMinutes > 0 ? s.defaultPrepTimeMinutes : 15,
    autoReadyEnabled: s.autoReadyEnabled !== false,
    menuGridColumns: s.menuGridColumns || 6,
    categoryLayout: s.categoryLayout || 'top',
    // Phase-1: Silent Print ON by default (Electron silent direct print).
    // User can explicitly disable in Settings → Printing.
    silentPrint: s.silentPrint !== false,
    // Fast billing: bill sirf printer par jata hai; screen par tab hi aata hai
    // jab user khud Receipt/Reprint button dabaye (ya yeh toggle ON ho).
    showBillOnScreen: s.showBillOnScreen === true,
    kotEnabled: s.kotEnabled !== false,
    autoPrintKot: s.autoPrintKot !== false,
    autoKitchenPrint: s.autoKitchenPrint !== false,
    manualSendToKitchen: s.manualSendToKitchen === true,
    kotFallbackToReceipt: s.kotFallbackToReceipt !== false,
  } as RestaurantSettings;

  return {
    ...normalizedSettings,
    whatsappTemplates: getWhatsAppTemplates(normalizedSettings),
    defaultPaidWhatsAppTemplateId: normalizedSettings.defaultPaidWhatsAppTemplateId || 'paid-default',
    defaultDeliveryWhatsAppTemplateId: normalizedSettings.defaultDeliveryWhatsAppTemplateId || 'delivery-default',
  };
}
let settingsSyncTimer: any = null;
export function saveSettings(s: RestaurantSettings) {
  // Issue-7 fix: har save par timestamp stamp — cloud snapshot isi se compare
  // prevents being overwritten by OLD settings (toggle reset bug).
  (s as any).settingsUpdatedAt = new Date().toISOString();
  const d = loadData();
  d.settings = s;
  saveLocal(d);
  // Debounce remote writes — typing in Settings shouldn't push per keystroke
  if (useCloudStore()) {
    if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
    settingsSyncTimer = setTimeout(() => { cloudSaveSettings(s); }, 600);
  }
}


// ============ Backup & Restore ============
export function exportData(): string { return JSON.stringify(loadData(), null, 2); }

export interface RestoreSummary {
  ok: boolean;
  version?: string | number;
  counts: Record<string, number>;
  settingsRestored: boolean;
  usersRestored: number;
  errors: string[];
}

/** Restore a backup JSON. Returns a summary of what was applied. Never throws
 *  — instead returns { ok:false, errors:[...] } so the UI can show a clear message.
 *  Missing collections are filled with []; default admin is re-seeded if absent.
 */
export function importData(json: string): RestoreSummary {
  const summary: RestoreSummary = {
    ok: false, counts: {}, settingsRestored: false, usersRestored: 0, errors: [],
  };
  let data: any;
  try { data = JSON.parse(json); }
  catch (e: any) { summary.errors.push('Backup file is not valid JSON: ' + (e?.message || e)); return summary; }
  if (!data || typeof data !== 'object') { summary.errors.push('Backup file is empty or corrupt.'); return summary; }

  // Migration: fill missing collections
  for (const k of ARRAY_COLLECTIONS) {
    if (!Array.isArray((data as any)[k])) (data as any)[k] = [];
    summary.counts[k] = ((data as any)[k] as any[]).length;
  }
  if (!data.settings || typeof data.settings !== 'object') data.settings = (seedData() as any).settings;
  summary.settingsRestored = !!data.settings;
  summary.usersRestored = (data.users as any[]).length;
  summary.version = data.version || data.orderCounter;

  ensureFields(data as AppData);           // guarantees default admin exists
  stampTenant(data as AppData);
  try {
    saveLocal(data as AppData);
  } catch (e: any) {
    summary.errors.push('Could not save restored data: ' + (e?.message || e));
    return summary;
  }
  // Notify UI
  try { window.dispatchEvent(new CustomEvent('pos-data-changed', { detail: { collection: '*' } })); } catch {}

  // Push to cloud when applicable (offline build is a no-op).
  if (useCloudStore()) {
    (async () => {
      const batch = writeBatch(cloudDb());
      for (const col of ARRAY_COLLECTIONS) {
        const arr = ((data as any)[col] || []) as any[];
        for (const item of arr) {
          if (!item?.id) continue;
          batch.set(doc(colRef(col)!, item.id), item);
        }
      }
      if (data.settings) batch.set(settingsRef()!, data.settings as any);
      batch.set(counterRef()!, { value: data.orderCounter || 0 });
      try { await batch.commit(); } catch (e) { console.error('[cloud] import push failed', e); }
    })();
  }
  summary.ok = true;
  return summary;
}

// ============ Login helpers (offline) ============
export type AuthReason = 'not_found' | 'inactive' | 'bad_password' | 'no_db' | 'ok';
/** Case-insensitive username, trim whitespace on both sides. Password: only
 *  trim leading/trailing whitespace (accidental copy-paste) — actual chars preserved.
 *  Returns { user, reason }. Guaranteed not to throw. */
export function authenticateUser(username: string, password: string): { user: User | null; reason: AuthReason } {
  const uname = (username || '').trim().toLowerCase();
  const pw = (password || '').replace(/^\s+|\s+$/g, '');
  if (!uname) return { user: null, reason: 'not_found' };
  let users: User[] = [];
  try { users = getUsers() || []; } catch { return { user: null, reason: 'no_db' }; }
  if (!users.length) return { user: null, reason: 'no_db' };
  const match = users.find(u => (u.username || '').trim().toLowerCase() === uname);
  if (!match) return { user: null, reason: 'not_found' };
  if (match.isActive === false) return { user: null, reason: 'inactive' };
  const stored = (match.password || '').replace(/^\s+|\s+$/g, '');
  if (stored !== pw) return { user: null, reason: 'bad_password' };
  return { user: match, reason: 'ok' };
}

/** Guarantees baseline users exist. Called by UI "Repair Users" button and on
 *  every restore. Returns a short human-readable report. */
export function isSystemInitialized(): boolean {
  try {
    return (getUsers() || []).some(u => u.role === 'admin' && u.isActive !== false);
  } catch { return false; }
}

/**
 * Recovery (repair / recreate default users) is an administrative operation.
 * It is allowed only when the system has no admin yet (first install), when an
 * admin is already signed in, or when a valid admin password is supplied.
 */
export function canRunRecovery(adminPassword?: string): boolean {
  if (!isSystemInitialized()) return true;
  try {
    const current = getCurrentUser();
    if (current && current.role === 'admin' && current.isActive !== false) return true;
    const pw = (adminPassword || '').trim();
    if (!pw) return false;
    return (getUsers() || []).some(u =>
      u.role === 'admin' && u.isActive !== false && (u.password || '').trim() === pw);
  } catch { return false; }
}

export function repairUsers(auth?: { adminPassword?: string }): { admin: 'existed' | 'created'; cashier: 'existed' | 'created'; blocked?: string } {
  // Authorisation is enforced here, not in the UI — hiding a button is never
  // enough for a recovery function.
  if (!canRunRecovery(auth?.adminPassword)) {
    return { admin: 'existed', cashier: 'existed', blocked: 'Administrator authorisation required' };
  }
  const d = loadData();
  let adminStatus: 'existed' | 'created' = 'existed';
  let cashierStatus: 'existed' | 'created' = 'existed';
  const hasAdmin = d.users.some(u => (u.username || '').toLowerCase() === 'admin' && u.isActive !== false);
  if (!hasAdmin) {
    d.users.push({ id: 'admin-default', name: 'Administrator', username: 'admin', password: 'admin123', role: 'admin', isActive: true } as any);
    adminStatus = 'created';
  }
  const hasCashier = d.users.some(u => (u.username || '').toLowerCase() === 'cashier' && u.isActive !== false);
  if (!hasCashier) {
    d.users.push({ id: 'cashier-default', name: 'Cashier', username: 'cashier', password: 'cashier123', role: 'cashier', isActive: true } as any);
    cashierStatus = 'created';
  }
  saveLocal(d);
  try { window.dispatchEvent(new CustomEvent('pos-data-changed', { detail: { collection: 'users' } })); } catch {}
  return { admin: adminStatus, cashier: cashierStatus };
}

/** Admin-only bulk clear of paid/void order history. Returns count removed. */
export function clearOrdersHistory(): { removed: number; blocked?: string } {
  const me = getCurrentUser();
  if (!me || me.role !== 'admin') return { removed: 0, blocked: 'Only admin can clear sales history' };
  const d = loadData();
  const before = d.orders.length;
  d.orders = d.orders.filter(o => o.status !== 'paid' && o.status !== 'void' && o.status !== 'cancelled' && o.status !== 'credit_received');
  const removed = before - d.orders.length;
  saveLocal(d);
  try { window.dispatchEvent(new CustomEvent('pos-data-changed', { detail: { collection: 'orders' } })); } catch {}
  return { removed };
}
export function resetData() {
  const data = seedData();
  ensureFields(data as any);
  saveLocal(data as any);
  if (useCloudStore()) {
    (async () => {
      for (const col of ARRAY_COLLECTIONS) {
        const snap = await getDocs(colRef(col)!);
        const batch = writeBatch(cloudDb());
        snap.forEach(d => batch.delete(d.ref));
        try { await batch.commit(); } catch {}
      }
      await cloudSeedIfEmpty();
    })();
  }
}

/** Selectively wipe given collections (local + cloud). Does NOT re-seed. */
export async function resetSelectedData(keys: readonly ArrayKey[]) {
  const d = loadData() as any;
  // ===== FIX (Day Close ke baad report 0 dikhati thi) =====
  // Orders wipe karne se PEHLE unhe permanent archive me daalo, warna
  // purani tareekhon ki sales report hamesha ke liye ghayab ho jati thi.
  if (keys.includes('orders' as any) && Array.isArray(d.orders) && d.orders.length) {
    try {
      const { archiveOrders } = await import('./orderArchive');
      archiveOrders(d.orders);
      console.log('[day-close] archived orders:', d.orders.length);
    } catch (e) { console.error('[day-close] archive failed', e); }
  }
  for (const k of keys) d[k] = [];
  saveLocal(d);
  if (useCloudStore()) {
    for (const col of keys) {
      try {
        const snap = await getDocs(colRef(col)!);
        const batch = writeBatch(cloudDb());
        snap.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      } catch (e) { console.error('[reset]', col, e); }
    }
  }
}

export const RESETTABLE_COLLECTIONS = ARRAY_COLLECTIONS;
export type ResettableCollection = ArrayKey;

// ============ Inventory ============
export function getInventory(): InventoryItem[] { return loadData().inventory || []; }
export function saveInventoryItem(item: InventoryItem) { saveEntity('inventory', item); }
export function deleteInventoryItem(id: string) { deleteEntity('inventory', id); }
// ============ Token records ============
// Business records for every token issued — payment state, print/reprint
// history, department breakdown. Stored in the application database beside
// orders, not in browser storage.
export function getTokenRecords(): TokenRecord[] { return loadData().tokenRecords || []; }
export function saveTokenRecord(record: TokenRecord) { saveEntity('tokenRecords', record); }
export function deleteTokenRecord(id: string) { deleteEntity('tokenRecords', id); }

export function getStockLogs(): StockLog[] { return loadData().stockLogs || []; }
export function addStockLog(log: StockLog) { saveEntity('stockLogs', log); }
/**
 * Append several sale rows to the Stock Log in ONE store write.
 * The quantities themselves are already applied by the stock engine — this
 * only records the history the Inventory page lists.
 */
function appendSaleStockLogs(rows: { inventoryItemId: string; type: 'sale'; quantity: number; note: string }[]) {
  if (!rows.length) return;
  const d = loadData();
  if (!d.stockLogs) d.stockLogs = [];
  const date = new Date().toISOString();
  for (const r of rows) {
    d.stockLogs.push({ id: genId(), inventoryItemId: r.inventoryItemId, type: r.type, quantity: r.quantity, note: r.note, date } as any);
  }
  saveLocal(d);
}

export function adjustStock(itemId: string, qty: number, type: 'in' | 'out' | 'adjustment' | 'sale', note: string) {
  const d = loadData();
  if (!d.inventory) d.inventory = [];
  if (!d.stockLogs) d.stockLogs = [];
  const item = d.inventory.find(x => x.id === itemId);
  if (!item) return;
  if (type === 'in') item.quantity += qty;
  else item.quantity = Math.max(0, item.quantity - qty);
  const log = { id: genId(), inventoryItemId: itemId, type, quantity: qty, note, date: new Date().toISOString() };
  d.stockLogs.push(log);
  saveLocal(d);
  if (useCloudStore()) {
    cloudSaveItem('inventory', item.id, item);
    cloudSaveItem('stockLogs', log.id, log);
  }
}

// ============ HR ============
export function getEmployees(): Employee[] { return loadData().employees || []; }
export function saveEmployee(e: Employee) { saveEntity('employees', e); }
export function deleteEmployee(id: string) { deleteEntity('employees', id); }

export function getAttendance(): Attendance[] { return loadData().attendance || []; }
export function saveAttendance(a: Attendance) { saveEntity('attendance', a); }
export function deleteAttendance(id: string) { deleteEntity('attendance', id); }
export function markAttendance(employeeId: string, date: string, status: Attendance['status'], inTime?: string, outTime?: string, note?: string) {
  const d = loadData();
  let existing = d.attendance.find(a => a.employeeId === employeeId && a.date === date);
  if (existing) {
    existing.status = status;
    if (inTime !== undefined) existing.inTime = inTime;
    if (outTime !== undefined) existing.outTime = outTime;
    if (note !== undefined) existing.note = note;
  } else {
    existing = { id: genId(), employeeId, date, status, inTime, outTime, note };
    d.attendance.push(existing);
  }
  saveLocal(d);
  if (useCloudStore()) cloudSaveItem('attendance', existing.id, existing);
}

export function getLeaves(): Leave[] { return loadData().leaves || []; }
export function saveLeave(l: Leave) { saveEntity('leaves', l); }
export function deleteLeave(id: string) { deleteEntity('leaves', id); }

export function getPayslips(): Payslip[] { return loadData().payslips || []; }
export function savePayslip(p: Payslip) { saveEntity('payslips', p); }
export function deletePayslip(id: string) { deleteEntity('payslips', id); }

export function getAdvances(): Advance[] { return loadData().advances || []; }
export function saveAdvance(a: Advance) { saveEntity('advances', a); }
export function deleteAdvance(id: string) { deleteEntity('advances', id); }

// ============ Accounts ============
export function getAccountCategories(): AccountCategory[] { return loadData().accountCategories || []; }
export function saveAccountCategory(c: AccountCategory) { saveEntity('accountCategories', c); }
export function deleteAccountCategory(id: string) { deleteEntity('accountCategories', id); }

export function getTransactions(): Transaction[] { return loadData().transactions || []; }
export function saveTransaction(t: Transaction) { saveEntity('transactions', t); }
export function deleteTransaction(id: string) { deleteEntity('transactions', id); }

export function getParties(): Party[] { return loadData().parties || []; }
export function saveParty(p: Party) { saveEntity('parties', p); }
export function deleteParty(id: string) { deleteEntity('parties', id); }

/** Centralized Party Master: find by case-insensitive name (+type) or create new. */
export function findOrCreateParty(
  name: string,
  type: LedgerType = 'supplier',
  extra?: { phone?: string; address?: string; openingBalance?: number },
): Party {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Party name required');
  const existing = (loadData().parties || []).find(
    p => p.name.trim().toLowerCase() === clean.toLowerCase() && p.type === type,
  );
  if (existing) {
    // Enrich missing fields without overwriting existing data
    let changed = false;
    const upd = { ...existing };
    if (extra?.phone && !existing.phone) { upd.phone = extra.phone; changed = true; }
    if (extra?.address && !existing.address) { upd.address = extra.address; changed = true; }
    if (changed) saveEntity('parties', upd);
    return upd;
  }
  const created: Party = {
    id: genId(),
    type,
    name: clean,
    phone: extra?.phone || '',
    address: extra?.address || '',
    openingBalance: extra?.openingBalance || 0,
    isActive: true,
  };
  saveEntity('parties', created);
  return created;
}

export function getLedger(): LedgerEntry[] { return loadData().ledger || []; }
export function addLedgerEntry(l: LedgerEntry) { saveEntity('ledger', l); }
export function deleteLedgerEntry(id: string) { deleteEntity('ledger', id); }

export function getDailyCashCloses(): DailyCashClose[] { return loadData().dailyCashCloses || []; }
export function saveDailyCashClose(c: DailyCashClose) { saveEntity('dailyCashCloses', c); }
export function deleteDailyCashClose(id: string) { deleteEntity('dailyCashCloses', id); }

// ============ Payment Accounts (Bank/JazzCash/Easypaisa) ============
export function getPaymentAccounts(): PaymentAccount[] {
  return (loadData() as any).paymentAccounts || [];
}
export function savePaymentAccount(a: PaymentAccount) { saveEntity('paymentAccounts' as any, a); }
export function deletePaymentAccount(id: string) { deleteEntity('paymentAccounts' as any, id); }

// ============ Receiving (GRN) ============
import type { ReceivingEntry, MarketingContact } from './types';
import { toBaseQty, getBaseUnit } from './units';

export function getReceivingEntries(): ReceivingEntry[] { return loadData().receivingEntries || []; }

/** Save a receiving entry AND auto-update stock + moving-average cost + supplier ledger. */
export function saveReceivingEntry(e: ReceivingEntry) {
  const d = loadData();
  const existing = (d.receivingEntries || []).find(x => x.id === e.id);

  // Only apply stock change for brand-new entries linked to an inventory item.
  if (!existing && e.inventoryItemId) {
    const item = (d.inventory || []).find(i => i.id === e.inventoryItemId);
    if (item) {
      const base = getBaseUnit(item);
      const baseQty = toBaseQty(item, e.quantity || 0, e.unit || base);
      const factor = baseQty > 0 && e.quantity > 0 ? baseQty / e.quantity : 1;
      const surcharge = e.surcharge || 0;
      const totalCost = ((e.rate || 0) * (e.quantity || 0)) + surcharge;
      const baseUnitCost = baseQty > 0 ? totalCost / baseQty : 0;

      // Moving average
      const oldQty = item.quantity || 0;
      const oldAvg = item.avgCostPrice ?? item.costPrice ?? 0;
      const newQty = oldQty + baseQty;
      const newAvg = newQty > 0 ? ((oldQty * oldAvg) + (baseQty * baseUnitCost)) / newQty : baseUnitCost;

      item.quantity = newQty;
      item.avgCostPrice = newAvg;
      if (baseUnitCost > 0) item.costPrice = baseUnitCost; // latest cost
      item.baseUnit = base;
      saveEntity('inventory', item);

      // Stamp computed fields back on the entry
      e.baseQty = baseQty;
      e.baseUnit = base;
      e.baseUnitCost = baseUnitCost;

      // Stock log
      const log = {
        id: genId(), inventoryItemId: item.id, type: 'in' as const,
        quantity: baseQty,
        note: `GRN • ${e.supplierName} • ${e.quantity} ${e.unit} @ Rs.${e.rate}${surcharge ? ` + Rs.${surcharge} surcharge` : ''}`,
        date: e.date || new Date().toISOString(),
      };
      d.stockLogs = d.stockLogs || [];
      d.stockLogs.push(log);
      saveLocal(d);
      if (useCloudStore()) cloudSaveItem('stockLogs', log.id, log);
    }
  }

  // ============ Party Master + Ledger auto-link ============
  if (!existing && e.supplierName && (e.supplierName || '').trim()) {
    try {
      const party = findOrCreateParty(e.supplierName.trim(), 'supplier');
      // Stamp party id on the receiving entry for traceability
      (e as any).partyId = party.id;
      // Create a credit ledger entry (we owe the supplier) for the receiving total
      const totalBill = ((e.rate || 0) * (e.quantity || 0)) + (e.surcharge || 0);
      if (totalBill > 0) {
        const ledgerEntry: LedgerEntry = {
          id: genId(),
          partyId: party.id,
          date: (e.date || new Date().toISOString()).slice(0, 10),
          description: `GRN • ${e.itemName} • ${e.quantity} ${e.unit}${e.surcharge ? ` (incl. Rs.${e.surcharge} surcharge)` : ''}`,
          debit: 0,
          credit: totalBill,
          reference: `GRN-${e.id}`,
        };
        saveEntity('ledger', ledgerEntry);
      }
    } catch (err) {
      console.warn('[receiving] party/ledger auto-link failed', err);
    }
  }

  saveEntity('receivingEntries', e);
}

export function deleteReceivingEntry(id: string) { deleteEntity('receivingEntries', id); }

// ============ Marketing ============
export function getMarketingContacts(): MarketingContact[] { return loadData().marketingContacts || []; }
export function saveMarketingContact(c: MarketingContact) { saveEntity('marketingContacts', c); }
export function deleteMarketingContact(id: string) { deleteEntity('marketingContacts', id); }

// Marketing template (single doc under meta/marketing)
function marketingMetaRef() {
  const base = tenantBase(); if (!base) return null;
  return doc(cloudDb(), base[0], base[1], 'meta', 'marketing');
}
const MARKETING_TPL_KEY = 'pos-marketing-template';
export function getMarketingTemplate(): string {
  try { return localStorage.getItem(MARKETING_TPL_KEY) || ''; } catch { return ''; }
}
export function saveMarketingTemplate(tpl: string) {
  try { localStorage.setItem(MARKETING_TPL_KEY, tpl); } catch {}
  if (useCloudStore()) {
    const r = marketingMetaRef(); if (!r) return;
    setDoc(r, { template: tpl }).catch(e => console.error('[cloud] marketing template save failed', e));
  }
}

// ============================================================
// RECIPES (BOM) & AUTO-STOCK DEDUCTION
// ============================================================
export function getRecipes(): Recipe[] { return loadData().recipes || []; }
export function getRecipeForMenuItem(menuItemId: string, variantKey?: string): Recipe | undefined {
  const all = loadData().recipes || [];
  // Prefer variant-specific recipe when variantKey is given; otherwise the default (empty variantKey) recipe.
  if (variantKey) {
    const v = all.find(r => r.menuItemId === menuItemId && (r.variantKey || '') === variantKey);
    if (v) return v;
  }
  return all.find(r => r.menuItemId === menuItemId && !r.variantKey);
}
export function saveRecipe(r: Recipe) { saveEntity('recipes', r); }
export function deleteRecipe(id: string) { deleteEntity('recipes', id); }

/** Build the variantKey used to scope a recipe to a specific size/inch variant. */
export function cartVariantKey(line: Pick<CartItem, 'variantType' | 'variantName'>): string {
  return line.variantName ? `${line.variantType || 'size'}:${line.variantName}` : '';
}

/** Deducts inventory based on each line's recipe. For weight-based items,
 *  qty multiplier = weightGrams / 1000. For fixed/manual items, multiplier = quantity.
 *  Variant-aware: picks recipe matching (menuItemId, variantKey) if present, else falls back to default. */
// ============================================================
// DEALS / COMBOS — tenant-synced (was localStorage-only in blink-modules)
// ============================================================
export function getDeals(): Deal[] { return (loadData() as any).deals || []; }
export function getDealById(id: string): Deal | undefined { return getDeals().find(d => d.id === id); }
export function saveDeal(deal: Deal) { saveEntity('deals' as any, deal); }
export function deleteDeal(id: string) { deleteEntity('deals' as any, id); }

// ============================================================
// WASTAGE
// ============================================================
export function getWastages(): Wastage[] { return loadData().wastages || []; }
export function saveWastage(w: Wastage) {
  // Persist record + actually deduct stock
  saveEntity('wastages', w);
  try { adjustStock(w.inventoryItemId, w.quantity, 'out', `Wastage: ${w.reason}${w.note ? ' — ' + w.note : ''}`); } catch (e) { console.error(e); }
}
export function deleteWastage(id: string) { deleteEntity('wastages', id); }

// ============================================================
// CUSTOMER DATABASE (Phase 5)
// ============================================================
import { normalizePhone } from './whatsapp';

export function getCustomers(): CustomerProfile[] { return loadData().customers || []; }
export function saveCustomer(c: CustomerProfile) { saveEntity('customers', c); }
export function deleteCustomer(id: string) { deleteEntity('customers', id); }

export function findCustomerByPhone(phone?: string): CustomerProfile | undefined {
  if (!phone) return;
  const key = normalizePhone(phone) || phone.replace(/[^\d]/g, '');
  if (!key) return;
  return (loadData().customers || []).find(c => c.id === key || c.phone.replace(/[^\d]/g, '') === key.replace(/[^\d]/g, ''));
}

/** Create or update a customer profile when an order is saved/paid. */
export function upsertCustomerFromOrder(order: Order, incrementTotals = true) {
  const cust = order.customer;
  const phoneRaw = cust?.phone || order.creditCustomerPhone;
  if (!phoneRaw) return;
  const key = normalizePhone(phoneRaw) || phoneRaw.replace(/[^\d]/g, '');
  if (!key) return;

  const name = cust?.name || order.creditCustomerName || 'Walk-in';
  const address = cust?.fullAddress || cust?.address || order.creditCustomerAddress || '';
  const d = loadData();
  if (!d.customers) d.customers = [];

  const now = new Date().toISOString();
  let profile = d.customers.find(c => c.id === key);
  if (!profile) {
    profile = {
      id: key,
      name,
      phone: phoneRaw,
      addresses: address ? [address] : [],
      totalOrders: 0,
      totalSpent: 0,
      firstOrderAt: now,
      createdAt: now,
    };
    d.customers.push(profile);
  }
  profile.name = profile.name || name;
  if (address && !profile.addresses.includes(address)) profile.addresses.push(address);

  // Merge structured address fields (only fill empties)
  if (cust) {
    profile.altPhone      = profile.altPhone      || cust.altPhone;
    profile.email         = profile.email         || cust.email;
    profile.province      = cust.province         || profile.province;
    profile.district      = cust.district         || profile.district;
    profile.city          = cust.city             || profile.city;
    profile.area          = cust.area             || profile.area;
    profile.society       = cust.society          || profile.society;
    profile.street        = cust.street           || profile.street;
    profile.streetNumber  = cust.streetNumber     || profile.streetNumber;
    profile.houseNumber   = cust.houseNumber      || profile.houseNumber;
    profile.fullAddress   = cust.fullAddress      || profile.fullAddress || address;
    if (cust.lat != null && cust.lng != null) {
      profile.lat = cust.lat;
      profile.lng = cust.lng;
      profile.locationLabel = cust.locationLabel || profile.locationLabel;
      profile.locationCapturedAt = cust.locationCapturedAt || now;
    }
  }
  if (order.branchId) profile.preferredBranchId = order.branchId;
  if (order.riderId) profile.lastRiderId = order.riderId;

  // Only counted (paid / credit_received) orders increment totals
  const counted = incrementTotals && (order.status === 'paid' || order.status === 'credit_received');
  if (counted) {
    profile.totalOrders += 1;
    profile.totalSpent += order.grandTotal || 0;
    profile.lastOrderAt = now;
    profile.avgOrderValue = Math.round(profile.totalSpent / Math.max(1, profile.totalOrders));
    // Grade
    const t = profile.totalSpent;
    profile.grade = t >= 50000 ? 'platinum' : t >= 20000 ? 'gold' : t >= 5000 ? 'silver' : 'regular';
    // Frequency
    if (profile.firstOrderAt && profile.totalOrders > 1) {
      const spanDays = (new Date(now).getTime() - new Date(profile.firstOrderAt).getTime()) / 86400000;
      profile.orderFrequencyDays = Math.max(1, Math.round(spanDays / (profile.totalOrders - 1)));
    }
    // Favourite item (top by qty across this order — incremental, light)
    const tally = new Map<string, { name: string; n: number }>();
    for (const it of order.items || []) {
      const k = it.menuItemId || it.name;
      const e = tally.get(k) || { name: it.name, n: 0 };
      e.n += it.quantity || 1;
      tally.set(k, e);
    }
    const top = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (top && !profile.favoriteItemId) {
      profile.favoriteItemId = top[0];
      profile.favoriteItemName = top[1].name;
    }

    // Loyalty Program — award points on counted orders
    try {
      const s = getSettings();
      if (s?.loyaltyEnabled) {
        // Deduct points used at checkout FIRST (redemption)
        const used = Number((order as any).loyaltyPointsUsed) || 0;
        if (used > 0) {
          profile.loyaltyPoints = Math.max(0, (profile.loyaltyPoints || 0) - used);
        }
        const earnRate = Number(s.loyaltyEarnPerRs100) > 0 ? Number(s.loyaltyEarnPerRs100) : 1;
        const earned = Math.floor(((order.grandTotal || 0) / 100) * earnRate);
        if (earned > 0) {
          profile.loyaltyPoints = (profile.loyaltyPoints || 0) + earned;
          profile.loyaltyLifetimePoints = (profile.loyaltyLifetimePoints || 0) + earned;
        }
      }
    } catch { /* loyalty optional */ }
  }



  saveLocal(d);
  if (useCloudStore()) cloudSaveItem('customers', profile.id, profile);
}

// ============================================================
// MULTI-BRANCH (Phase 6)
// ============================================================
const CURRENT_BRANCH_KEY = 'pos-current-branch';

export function getBranches(): Branch[] {
  return (loadData().branches || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
}
export function saveBranch(b: Branch) { saveEntity('branches', b); }
export function deleteBranch(id: string) { deleteEntity('branches', id); }

export function getCurrentBranchId(): string | null {
  try { return localStorage.getItem(CURRENT_BRANCH_KEY); } catch { return null; }
}
export function setCurrentBranchId(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_BRANCH_KEY, id);
    else localStorage.removeItem(CURRENT_BRANCH_KEY);
  } catch {}
}
export function getCurrentBranch(): Branch | null {
  const id = getCurrentBranchId();
  if (!id) return null;
  return getBranches().find(b => b.id === id) || null;
}

// ============================================================
// CREDIT / UDHAAR
// ============================================================
export function getCreditPayments(): CreditPayment[] {
  return loadData().creditPayments || [];
}
export function saveCreditPayment(p: CreditPayment) { saveEntity('creditPayments', p); }
export function deleteCreditPayment(id: string) { deleteEntity('creditPayments', id); }

/** All credit orders (paymentMethod = 'credit'). Excludes void/cancelled. */
export function getCreditOrders(): Order[] {
  return loadData().orders.filter(o =>
    o.paymentMethod === 'credit' &&
    o.status !== 'void' && o.status !== 'cancelled'
  );
}

/** Returns { paid, balance, status } for a given credit order id. */
export function getCreditOrderSummary(orderId: string): { total: number; paid: number; balance: number; status: 'unpaid' | 'partial' | 'paid' } {
  const order = loadData().orders.find(o => o.id === orderId);
  const total = order?.grandTotal || 0;
  const paid = getCreditPayments()
    .filter(p => p.orderId === orderId)
    .reduce((s, p) => s + (p.amount || 0), 0);
  const balance = Math.max(0, total - paid);
  const status: 'unpaid' | 'partial' | 'paid' =
    paid <= 0 ? 'unpaid' : balance <= 0 ? 'paid' : 'partial';
  return { total, paid, balance, status };
}

export function recordCreditPayment(orderId: string, amount: number, method: PaymentMethod = 'cash', note?: string, receivedBy?: string): CreditPayment {
  const order = loadData().orders.find(o => o.id === orderId);
  const p: CreditPayment = {
    id: genId(),
    orderId,
    customerName: order?.creditCustomerName || order?.customer?.name,
    customerPhone: order?.creditCustomerPhone || order?.customer?.phone,
    amount,
    method,
    date: new Date().toISOString(),
    receivedBy,
    note,
  };
  saveCreditPayment(p);
  return p;
}

export { genId };




// ============================================================
// PROMO CODES (Phase 11)
// ============================================================
export function getPromoCodes(): PromoCode[] {
  return loadData().promoCodes || [];
}
export function savePromoCode(p: PromoCode) {
  p.code = (p.code || '').trim().toUpperCase();
  saveEntity('promoCodes', p);
}
export function deletePromoCode(id: string) { deleteEntity('promoCodes', id); }

/** Validate a promo code against the current cart subtotal. Returns null if invalid. */
export function validatePromoCode(code: string, cartSubtotal: number): { promo: PromoCode; discount: number } | { error: string } {
  const norm = (code || '').trim().toUpperCase();
  if (!norm) return { error: 'Enter a promo code' };
  const promo = getPromoCodes().find(p => p.code === norm);
  if (!promo) return { error: 'Invalid promo code' };
  if (!promo.isActive) return { error: 'Promo code inactive' };
  const now = Date.now();
  if (promo.startDate && new Date(promo.startDate).getTime() > now) return { error: 'Promo not started yet' };
  if (promo.endDate && new Date(promo.endDate).getTime() + 86400000 < now) return { error: 'Promo expired' };
  if (promo.usageLimit && promo.usageCount >= promo.usageLimit) return { error: 'Promo usage limit reached' };
  if (promo.minOrderAmount && cartSubtotal < promo.minOrderAmount) return { error: `Minimum order Rs. ${promo.minOrderAmount}` };
  const discount = promo.discountType === 'percent'
    ? Math.round(cartSubtotal * (promo.discountValue || 0) / 100)
    : Math.min(cartSubtotal, promo.discountValue || 0);
  return { promo, discount };
}

/** Increment usage counter after order is paid with promo. */
export function incrementPromoUsage(code: string) {
  const norm = (code || '').trim().toUpperCase();
  if (!norm) return;
  const promo = getPromoCodes().find(p => p.code === norm);
  if (!promo) return;
  promo.usageCount = (promo.usageCount || 0) + 1;
  savePromoCode(promo);
}
