// ============================================================
// DT MESSAGES — two-way notes between the shop (POS) and Digital
// Target's Super Admin panel.
//
// Both sides share ONE Firestore collection: `supportMessages`
//   { clientKey, business, phone, from: 'admin' | 'shop', text,
//     createdAt (ms), read }
//
// Each restaurant sees ONLY its own thread (clientKey = its licence key) and
// the announcements Digital Target sends to everyone (lib/messageRouting.ts).
// The POS asks Firestore for exactly those — it never downloads the other
// restaurants' messages — and does not ask at all until it knows its own
// licence key. The cache is kept per licence key.
//
// The POS talks to Firestore over plain REST (no Firebase SDK), stays
// offline-first (last messages are cached) and never blocks the UI.
// ============================================================
import { BROADCAST_KEY, isForShop } from './messageRouting';

const PROJECT_ID = 'dtpos-offline';
const API_KEY = 'AIzaSyCgLRlvTaXyuk13vWCQ1vCKUbAmC5IY9cU';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CACHE_KEY = 'dtpos-messages-cache-v2';
/** Before v1.19.1 the cache could hold other restaurants' messages: it is thrown away, never shown. */
const OLD_CACHE_KEY = 'dtpos-messages-cache';
const READ_KEY = 'dtpos-messages-read-at';
/** More than any one restaurant's thread; the list is sorted here, so no Firestore index is needed. */
const MAX_FETCH = 500;

export interface DTMessage {
  id: string;
  from: 'admin' | 'shop';
  text: string;
  createdAt: number;
  clientKey?: string;
  business?: string;
}

export interface MessageContext {
  licenseKey?: string;
  business?: string;
  phone?: string;
}

function num(f: any): number {
  if (!f) return 0;
  return Number(f.integerValue ?? f.doubleValue ?? 0);
}
function str(f: any): string {
  return String(f?.stringValue ?? '');
}

function parseDoc(d: any): DTMessage | null {
  const id = String(d?.name || '').split('/').pop() || '';
  if (!id) return null;
  const f = d.fields || {};
  const from = str(f.from) === 'admin' ? 'admin' : 'shop';
  return {
    id,
    from,
    text: str(f.text),
    createdAt: num(f.createdAt) || Date.parse(d.createTime || '') || 0,
    clientKey: str(f.clientKey),
    business: str(f.business),
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return await Promise.race([
    p.catch(() => null),
    new Promise<null>(r => setTimeout(() => r(null), ms)),
  ]);
}

function dropOldCache() {
  try { localStorage.removeItem(OLD_CACHE_KEY); } catch { /* storage blocked */ }
}

/** The last messages this restaurant downloaded — only when they were saved for this same licence. */
export function cachedMessages(licenseKey?: string): DTMessage[] {
  dropOldCache();
  const key = (licenseKey || '').trim();
  if (!key) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!raw || raw.key !== key || !Array.isArray(raw.list)) return [];
    return (raw.list as DTMessage[]).filter(m => isForShop(m, key));
  } catch { return []; }
}

function cache(key: string, list: DTMessage[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, list: list.slice(-100) })); } catch { /* quota */ }
}

/** The Firestore query for one restaurant: its own thread and the announcements to everyone. */
export function threadQuery(licenseKey: string) {
  return {
    structuredQuery: {
      from: [{ collectionId: 'supportMessages' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'clientKey' },
          op: 'IN',
          value: { arrayValue: { values: [{ stringValue: licenseKey }, { stringValue: BROADCAST_KEY }] } },
        },
      },
      limit: MAX_FETCH,
    },
  };
}

/** Download this restaurant's thread (plus Digital Target's announcements to everyone). */
export async function fetchMessages(ctx: MessageContext): Promise<DTMessage[]> {
  const key = (ctx.licenseKey || '').trim();
  // Not known yet which restaurant this is: ask for nothing, show nothing.
  if (!key) return [];
  if (!navigator.onLine) return cachedMessages(key);
  const res = await withTimeout(
    fetch(`${BASE}:runQuery?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(threadQuery(key)),
    }).then(r => (r.ok ? r.json() : null)),
    9000,
  );
  if (!Array.isArray(res)) return cachedMessages(key);
  const list = (res.map((row: any) => (row?.document ? parseDoc(row.document) : null)).filter(Boolean) as DTMessage[])
    // The query already asks for these only; checked again so nothing else can ever be shown.
    .filter(m => isForShop(m, key))
    .sort((a, b) => a.createdAt - b.createdAt);
  cache(key, list);
  return list;
}

/** Send a note from this shop to Digital Target. Never without this restaurant's licence key. */
export async function sendShopMessage(text: string, ctx: MessageContext): Promise<boolean> {
  const body = text.trim();
  const key = (ctx.licenseKey || '').trim();
  if (!body || !key) return false;
  if (!navigator.onLine) return false;
  const fields: Record<string, unknown> = {
    from: { stringValue: 'shop' },
    text: { stringValue: body },
    createdAt: { integerValue: String(Date.now()) },
    read: { booleanValue: false },
    clientKey: { stringValue: key },
    business: { stringValue: ctx.business || '' },
    phone: { stringValue: ctx.phone || '' },
  };
  const ok = await withTimeout(
    fetch(`${BASE}/supportMessages?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }).then(r => r.ok),
    9000,
  );
  return !!ok;
}

export function lastReadAt(): number {
  return Number(localStorage.getItem(READ_KEY) || 0);
}

export function markAllRead() {
  try { localStorage.setItem(READ_KEY, String(Date.now())); } catch { /* quota */ }
}

export function unreadCount(list: DTMessage[]): number {
  const at = lastReadAt();
  return list.filter(m => m.from === 'admin' && m.createdAt > at).length;
}
