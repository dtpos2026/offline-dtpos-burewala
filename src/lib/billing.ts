// DT POS — Client billing helpers (Super Admin side)
// Invoices + payments stored per-tenant under tenants/{tid}/invoices and /payments.
// Plan expiry stored on userIndex/{tid}.planExpiryAt (Timestamp).

import { cloudDb } from '@/lib/offlineNoCloud';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy, Timestamp, setDoc,
} from '@/lib/offlineNoCloud';
import { getPlan } from '@/lib/plans';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  number: string;          // INV-2026-0001
  issuedAt: any;           // Timestamp
  dueAt?: any;             // Timestamp
  periodStart?: string;    // ISO date
  periodEnd?: string;      // ISO date
  planId: string;
  months: number;
  amount: number;
  discount?: number;
  tax?: number;
  total: number;
  status: InvoiceStatus;
  notes?: string;
  paidAmount?: number;
  paidAt?: any;
  // Package fields (optional — set when invoice generated from a package)
  packageId?: string;
  packageName?: string;
  setupFee?: number;
  monthlyFee?: number;
  includedFeatures?: string[];
  // Client snapshot (frozen at invoice time)
  clientPhone?: string;
  clientAddress?: string;
  approvedDevices?: number;
  // Owner / marketing contact snapshot (frozen at invoice time)
  contactId?: string;
  ownerName?: string;
  contactName?: string;
}

export interface Payment {
  id: string;
  paidAt: any;
  amount: number;
  method: 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'card' | 'other';
  months: number;          // months added to plan
  invoiceId?: string;
  invoiceNumber?: string;
  notes?: string;
  receivedBy?: string;
}

// ---------- Plan expiry ----------
export function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') return new Date(ts);
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  return null;
}

export function daysUntil(ts: any): number | null {
  const d = tsToDate(ts);
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isExpired(ts: any): boolean {
  const d = tsToDate(ts);
  if (!d) return false;
  return d.getTime() < Date.now();
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ---------- Fetch ----------
export async function fetchInvoices(tenantId: string): Promise<Invoice[]> {
  const q = query(collection(cloudDb(), 'tenants', tenantId, 'invoices'), orderBy('issuedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function fetchPayments(tenantId: string): Promise<Payment[]> {
  const q = query(collection(cloudDb(), 'tenants', tenantId, 'payments'), orderBy('paidAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

// ---------- Create / update ----------
export async function createInvoice(tenantId: string, data: {
  planId: string; months: number; amount: number; discount?: number; tax?: number;
  periodStart?: string; periodEnd?: string; dueAt?: Date | null; notes?: string;
  packageId?: string; packageName?: string; setupFee?: number; monthlyFee?: number;
  includedFeatures?: string[];
  clientPhone?: string; clientAddress?: string; approvedDevices?: number;
  contactId?: string; ownerName?: string; contactName?: string;
}): Promise<string> {
  const all = await fetchInvoices(tenantId);
  const yr = new Date().getFullYear();
  const seq = all.filter(i => (i.number || '').includes(`INV-${yr}-`)).length + 1;
  const number = `INV-${yr}-${String(seq).padStart(4, '0')}`;
  const total = (data.amount - (data.discount || 0)) + (data.tax || 0);

  const payload: any = {
    number,
    issuedAt: serverTimestamp(),
    planId: data.planId,
    months: data.months,
    amount: data.amount,
    discount: data.discount || 0,
    tax: data.tax || 0,
    total,
    status: 'sent' as InvoiceStatus,
    notes: data.notes || '',
  };
  if (data.dueAt) payload.dueAt = Timestamp.fromDate(data.dueAt);
  if (data.periodStart) payload.periodStart = data.periodStart;
  if (data.periodEnd) payload.periodEnd = data.periodEnd;
  if (data.packageId) payload.packageId = data.packageId;
  if (data.packageName) payload.packageName = data.packageName;
  if (data.setupFee && data.setupFee > 0) payload.setupFee = data.setupFee;
  if (data.monthlyFee && data.monthlyFee > 0) payload.monthlyFee = data.monthlyFee;
  if (data.includedFeatures && data.includedFeatures.length) payload.includedFeatures = data.includedFeatures;
  if (data.clientPhone) payload.clientPhone = data.clientPhone;
  if (data.clientAddress) payload.clientAddress = data.clientAddress;
  if (data.contactId) payload.contactId = data.contactId;
  if (data.ownerName) payload.ownerName = data.ownerName;
  if (data.contactName) payload.contactName = data.contactName;
  if (typeof data.approvedDevices === 'number') payload.approvedDevices = data.approvedDevices;

  const ref = await addDoc(collection(cloudDb(), 'tenants', tenantId, 'invoices'), payload);
  return ref.id;
}

export async function deleteInvoice(tenantId: string, invoiceId: string) {
  await deleteDoc(doc(cloudDb(), 'tenants', tenantId, 'invoices', invoiceId));
}

export async function updateInvoice(tenantId: string, invoiceId: string, patch: Partial<Invoice>) {
  const clean: any = {};
  Object.entries(patch).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
  await updateDoc(doc(cloudDb(), 'tenants', tenantId, 'invoices', invoiceId), clean);
}

// Recompute invoice status + paidAmount from all linked payments (partial-pay aware)
async function reconcileInvoice(tenantId: string, invoiceId: string) {
  const allPay = await fetchPayments(tenantId);
  const paidSum = allPay
    .filter(p => p.invoiceId === invoiceId)
    .reduce((s, p) => s + (p.amount || 0), 0);
  const invDocs = await getDocs(collection(cloudDb(), 'tenants', tenantId, 'invoices'));
  const inv = invDocs.docs.find(d => d.id === invoiceId);
  if (!inv) return;
  const data = inv.data() as any;
  const total = data.total || 0;
  let status: InvoiceStatus;
  if (total > 0 && paidSum >= total) status = 'paid';
  else if (paidSum > 0) status = 'sent'; // partial
  else status = data.status === 'paid' ? 'sent' : (data.status || 'sent');
  const patch: any = { paidAmount: paidSum, status };
  if (status === 'paid') patch.paidAt = serverTimestamp();
  await updateDoc(doc(cloudDb(), 'tenants', tenantId, 'invoices', invoiceId), patch);
}

export async function deletePayment(tenantId: string, paymentId: string, opts?: { invoiceId?: string }) {
  await deleteDoc(doc(cloudDb(), 'tenants', tenantId, 'payments', paymentId));
  if (opts?.invoiceId) {
    try { await reconcileInvoice(tenantId, opts.invoiceId); } catch {}
  }
}

export async function recordPayment(tenantId: string, data: {
  amount: number; method: Payment['method']; months: number;
  invoice?: Invoice | null; notes?: string; receivedBy?: string;
  currentExpiry?: any; extendExpiry?: boolean;
}): Promise<void> {
  const payload: any = {
    paidAt: serverTimestamp(),
    amount: data.amount,
    method: data.method,
    months: data.months,
    notes: data.notes || '',
    receivedBy: data.receivedBy || '',
  };
  if (data.invoice) {
    payload.invoiceId = data.invoice.id;
    payload.invoiceNumber = data.invoice.number;
  }
  await addDoc(collection(cloudDb(), 'tenants', tenantId, 'payments'), payload);

  // Partial-payment aware status update
  if (data.invoice) {
    try { await reconcileInvoice(tenantId, data.invoice.id); } catch {}
  }

  // Extend plan expiry on userIndex
  if (data.extendExpiry !== false && data.months > 0) {
    const cur = tsToDate(data.currentExpiry);
    const base = (cur && cur.getTime() > Date.now()) ? cur : new Date();
    const newExpiry = addMonths(base, data.months);
    await updateDoc(doc(cloudDb(), 'userIndex', tenantId), {
      planExpiryAt: Timestamp.fromDate(newExpiry),
      lastPaymentAt: serverTimestamp(),
    });
  }
}

export async function setPlanExpiry(tenantId: string, expiry: Date | null) {
  await updateDoc(doc(cloudDb(), 'userIndex', tenantId), {
    planExpiryAt: expiry ? Timestamp.fromDate(expiry) : null,
  });
}

// ---------- Client-side expiry cache (owner side) ----------
const EXPIRY_LS_KEY = 'pos-tenant-plan-expiry';
export function setCurrentTenantExpiry(ms: number | null | undefined) {
  try {
    if (ms && ms > 0) localStorage.setItem(EXPIRY_LS_KEY, String(ms));
    else localStorage.removeItem(EXPIRY_LS_KEY);
  } catch {}
}
export function getCurrentTenantExpiryMs(): number | null {
  try {
    const v = localStorage.getItem(EXPIRY_LS_KEY);
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}

export function formatRs(n: number): string {
  return 'Rs ' + (n || 0).toLocaleString('en-PK');
}

export function planPriceFor(planId: string, months: number): number {
  return getPlan(planId).monthlyPriceRs * months;
}
