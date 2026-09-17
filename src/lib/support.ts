// Support messaging — owner ↔ Super Admin (Digital Target)
// Stored at: tenants/{tid}/support/{id}
//   { from: 'owner'|'admin', body, createdAt, read, category?, status?,
//     imageUrl?, meta?, intent?, aiGenerated?, authorEmail? }
// Internal notes: tenants/{tid}/internalNotes/{id}  (Super Admin only via rules)
import { cloudDb, cloudStorage } from '@/lib/offlineNoCloud';
import {
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp,
  doc, updateDoc, getDocs, where, writeBatch, getDoc, collectionGroup,
} from '@/lib/offlineNoCloud';
import { ref as sRef, uploadBytes, getDownloadURL } from '@/lib/offlineNoCloud';

export type SupportFrom = 'owner' | 'admin';
export type SupportStatus = 'new' | 'in_progress' | 'replied' | 'fixed' | 'closed';
export type SupportCategory =
  | 'printer' | 'order' | 'report' | 'payment'
  | 'inventory' | 'feature' | 'bug' | 'general';

export interface SupportMeta {
  restaurantName?: string;
  branchName?: string;
  userName?: string;
  deviceName?: string;
  appVersion?: string;
}

export interface SupportMessage {
  id: string;
  from: SupportFrom;
  body: string;
  createdAt: any;
  read?: boolean;
  authorEmail?: string;
  category?: SupportCategory;
  status?: SupportStatus;
  imageUrl?: string;
  meta?: SupportMeta;
  intent?: 'bug' | 'feature' | 'improvement' | 'urgent' | 'question';
  aiGenerated?: boolean;
  /** Tenant ID — populated only when retrieved via collectionGroup query. */
  _tenantId?: string;
}

export interface InternalNote {
  id: string;
  body: string;
  authorEmail: string;
  assignedTo?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  expectedFixDate?: string;
  fixVersion?: string;
  createdAt: any;
}

export function listenSupport(tenantId: string, cb: (msgs: SupportMessage[]) => void) {
  const q = query(collection(cloudDb(), 'tenants', tenantId, 'support'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
  }, err => console.warn('support listen', err));
}

export async function sendSupportMessage(
  tenantId: string,
  from: SupportFrom,
  body: string,
  authorEmail?: string,
  extra?: Partial<Pick<SupportMessage, 'category' | 'imageUrl' | 'meta' | 'intent' | 'aiGenerated' | 'status'>>,
): Promise<string> {
  const ref = await addDoc(collection(cloudDb(), 'tenants', tenantId, 'support'), {
    from, body: body.trim(), authorEmail: authorEmail || '',
    createdAt: serverTimestamp(), read: false,
    status: extra?.status || (from === 'owner' ? 'new' : 'replied'),
    ...(extra?.category   ? { category: extra.category } : {}),
    ...(extra?.imageUrl   ? { imageUrl: extra.imageUrl } : {}),
    ...(extra?.meta       ? { meta: extra.meta } : {}),
    ...(extra?.intent     ? { intent: extra.intent } : {}),
    ...(extra?.aiGenerated? { aiGenerated: true } : {}),
  });
  return ref.id;
}

export async function setMessageStatus(
  tenantId: string, messageId: string, status: SupportStatus,
) {
  await updateDoc(doc(cloudDb(), 'tenants', tenantId, 'support', messageId), { status });
}

export async function markRead(tenantId: string, side: SupportFrom) {
  const other: SupportFrom = side === 'admin' ? 'owner' : 'admin';
  try {
    const snap = await getDocs(query(
      collection(cloudDb(), 'tenants', tenantId, 'support'),
      where('from', '==', other), where('read', '==', false),
    ));
    if (snap.empty) return;
    const batch = writeBatch(cloudDb());
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (e) { console.warn('markRead', e); }
}

export async function fetchUnreadCounts(tenantIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(tenantIds.map(async tid => {
    try {
      const snap = await getDocs(query(
        collection(cloudDb(), 'tenants', tid, 'support'),
        where('from', '==', 'owner'), where('read', '==', false),
      ));
      if (!snap.empty) out[tid] = snap.size;
    } catch {}
  }));
  return out;
}

/* -------------------- Image upload -------------------- */

export async function uploadSupportImage(tenantId: string, file: File): Promise<string> {
  const path = `support/${tenantId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
  const ref = sRef(cloudStorage(), path);
  await uploadBytes(ref, file);
  return getDownloadURL(ref);
}

/* -------------------- Internal notes (Super Admin only) -------------------- */
// Stored at /supportInternalNotes/{tid}/items/{id} (outside tenants/) so that
// tenant owners cannot read them via the owner-wide rule on tenants/{tid}/**.

export function listenInternalNotes(
  tenantId: string, cb: (notes: InternalNote[]) => void,
) {
  const q = query(
    collection(cloudDb(), 'supportInternalNotes', tenantId, 'items'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
  }, err => console.warn('internalNotes', err));
}

export async function addInternalNote(
  tenantId: string,
  note: Omit<InternalNote, 'id' | 'createdAt'>,
) {
  await addDoc(collection(cloudDb(), 'supportInternalNotes', tenantId, 'items'), {
    ...note, createdAt: serverTimestamp(),
  });
}

/* -------------------- Global inbox (collectionGroup) -------------------- */

export function listenGlobalSupportInbox(cb: (msgs: SupportMessage[]) => void) {
  // Super Admin only — gets all support messages across tenants.
  const q = query(
    collectionGroup(cloudDb(), 'support'),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => {
      const tid = d.ref.parent.parent?.id;
      return { id: d.id, _tenantId: tid, ...(d.data() as any) };
    }));
  }, err => console.warn('globalInbox', err));
}

/* -------------------- WhatsApp helpers -------------------- */

export function waLink(phone: string, message: string): string {
  const digits = (phone || '').replace(/[^\d]/g, '');
  let p = digits;
  if (p.startsWith('0')) p = '92' + p.slice(1);
  else if (!p.startsWith('92') && p.length === 10) p = '92' + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

export async function fetchTenantPhone(tenantId: string): Promise<string> {
  try {
    const s = await getDoc(doc(cloudDb(), 'tenants', tenantId, 'meta', 'settings'));
    if (s.exists()) {
      const d: any = s.data();
      return d.phone1 || d.phone || d.contactPhone || '';
    }
  } catch {}
  return '';
}
