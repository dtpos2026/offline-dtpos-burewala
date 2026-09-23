// ============================================================
// OFFLINE BILLING — cloud storage (Firestore) with a browser mirror.
// See billingModel.ts for the data and firestore.rules for access:
// invoices and the profile are staff-only; invoiceVerify/{code} can be read
// one document at a time by anyone holding the QR code.
// ============================================================
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { firestoreSafe } from './firestoreSafe';
import { docIdFor } from './cloud';
import { verifyLicenseKey, PLAN_LABEL } from '@pos/licensing/licenseKey';
import {
  DEFAULT_PROFILE, verifyRecordFor,
  type BillingProfile, type OfflineInvoice, type VerifyRecord,
} from './billingModel';

const LS_INVOICES = 'dtpos-superadmin-invoices';
const LS_PROFILE = 'dtpos-superadmin-billing-profile';

export function cachedInvoices(): OfflineInvoice[] {
  try { const v = JSON.parse(localStorage.getItem(LS_INVOICES) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function cachedProfile(): BillingProfile {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(LS_PROFILE) || '{}') }; } catch { return { ...DEFAULT_PROFILE }; }
}

export function watchInvoices(cb: (list: OfflineInvoice[]) => void, onErr?: (e: Error) => void) {
  return onSnapshot(collection(db, 'offlineInvoices'), snap => {
    const list = snap.docs.map(d => d.data() as OfflineInvoice).filter(i => i && i.id);
    try { localStorage.setItem(LS_INVOICES, JSON.stringify(list)); } catch { /* quota */ }
    cb(list);
  }, e => onErr?.(e as Error));
}

export function watchProfile(cb: (p: BillingProfile) => void, onErr?: (e: Error) => void) {
  return onSnapshot(doc(db, 'offlineBilling', 'profile'), snap => {
    const p = { ...DEFAULT_PROFILE, ...(snap.exists() ? (snap.data() as Partial<BillingProfile>) : {}) };
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(p)); } catch { /* quota */ }
    cb(p);
  }, e => onErr?.(e as Error));
}

export async function saveProfile(p: BillingProfile) {
  await setDoc(doc(db, 'offlineBilling', 'profile'), firestoreSafe({ ...p, updatedAt: Date.now(), by: auth.currentUser?.email || 'admin' }));
}

/** What the licence looks like right now, for the verification record. */
async function licenceInfo(key: string): Promise<{ status: string; plan: string; expiry: string }> {
  const out = { status: 'unknown', plan: '', expiry: '' };
  if (!key) return out;
  const check = await verifyLicenseKey(key);
  if (!check.ok || !check.payload) return { ...out, status: 'invalid key' };
  out.plan = PLAN_LABEL[check.payload.plan] || check.payload.plan;
  out.expiry = check.payload.expiryDate ? new Date(check.payload.expiryDate).toISOString().slice(0, 10) : 'Lifetime';
  const expired = !!check.payload.expiryDate && Date.now() > check.payload.expiryDate;
  try {
    const s = await getDoc(doc(db, 'licenseStatus', docIdFor(check.key)));
    const server = s.exists() ? String((s.data() as { status?: string }).status || 'active') : 'active';
    out.status = expired && server === 'active' ? 'expired' : server;
  } catch {
    out.status = expired ? 'expired' : 'active';
  }
  return out;
}

/** Save the invoice, then (re)publish the public verification record for its QR. */
export async function saveInvoice(inv: OfflineInvoice, profile: BillingProfile): Promise<void> {
  const stamped = { ...inv, updatedAt: Date.now(), by: auth.currentUser?.email || 'admin' };
  await setDoc(doc(db, 'offlineInvoices', inv.id), firestoreSafe(stamped));
  const record = verifyRecordFor(stamped, profile, await licenceInfo(inv.customer.licenseKey));
  await setDoc(doc(db, 'invoiceVerify', inv.verifyCode), firestoreSafe(record));
}

export async function deleteInvoice(inv: OfflineInvoice): Promise<void> {
  await deleteDoc(doc(db, 'offlineInvoices', inv.id));
  if (inv.verifyCode) await deleteDoc(doc(db, 'invoiceVerify', inv.verifyCode));
}

/** Public read used by the verification page (no sign-in needed). */
export async function fetchVerification(code: string): Promise<VerifyRecord | null> {
  if (!/^[A-Z0-9]{8,32}$/.test(code)) return null;
  const s = await getDoc(doc(db, 'invoiceVerify', code));
  return s.exists() ? (s.data() as VerifyRecord) : null;
}
