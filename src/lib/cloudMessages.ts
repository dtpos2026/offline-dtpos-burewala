// ============================================================
// DT MESSAGES — two-way notes between the shop (POS) and Digital
// Target's Super Admin panel.
//
// Both sides share ONE Firestore collection: `supportMessages`
//   { clientKey, business, phone, from: 'admin' | 'shop', text,
//     createdAt (ms), read }
//
// The POS talks to Firestore over plain REST (no Firebase SDK), stays
// offline-first (last messages are cached) and never blocks the UI.
// ============================================================

const PROJECT_ID = 'dtpos-offline';
const API_KEY = 'AIzaSyCgLRlvTaXyuk13vWCQ1vCKUbAmC5IY9cU';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CACHE_KEY = 'dtpos-messages-cache';
const READ_KEY = 'dtpos-messages-read-at';

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

export function cachedMessages(): DTMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function cache(list: DTMessage[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, 100))); } catch { /* quota */ }
}

/** Download the thread for this shop (plus general notes sent to everyone). */
export async function fetchMessages(ctx: MessageContext): Promise<DTMessage[]> {
  if (!navigator.onLine) return cachedMessages();
  const url = `${BASE}/supportMessages?pageSize=200&key=${API_KEY}`;
  const res = await withTimeout(fetch(url).then(r => (r.ok ? r.json() : null)), 9000);
  if (!res || !Array.isArray(res.documents)) return cachedMessages();
  const key = ctx.licenseKey || '';
  const list = (res.documents.map(parseDoc).filter(Boolean) as DTMessage[])
    .filter(m => !m.clientKey || !key || m.clientKey === key)
    .sort((a, b) => a.createdAt - b.createdAt);
  cache(list);
  return list;
}

/** Send a note from this shop to Digital Target. */
export async function sendShopMessage(text: string, ctx: MessageContext): Promise<boolean> {
  const body = text.trim();
  if (!body) return false;
  if (!navigator.onLine) return false;
  const fields: Record<string, unknown> = {
    from: { stringValue: 'shop' },
    text: { stringValue: body },
    createdAt: { integerValue: String(Date.now()) },
    read: { booleanValue: false },
    clientKey: { stringValue: ctx.licenseKey || '' },
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
