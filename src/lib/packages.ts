// DT POS — Subscription Packages (Super Admin defined)
// Stored at top-level cloud collection: adminPackages/{id}
// Owner sees these implicitly through invoices; only Super Admin manages them.

import { cloudDb } from '@/lib/offlineNoCloud';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy,
} from '@/lib/offlineNoCloud';

export interface AdminPackage {
  id: string;
  name: string;             // e.g. "Starter 6 Months"
  setupFeeRs: number;       // one-time setup fee
  monthlyRs: number;        // per-month recurring fee
  durationMonths: number;   // package length (e.g. 6)
  description?: string;
  includedFeatures?: string[]; // bullet list shown on invoice
  active: boolean;
  createdAt?: any;
}

export function packageTotal(p: { setupFeeRs: number; monthlyRs: number; durationMonths: number }): number {
  return (p.setupFeeRs || 0) + (p.monthlyRs || 0) * (p.durationMonths || 0);
}

export async function fetchPackages(): Promise<AdminPackage[]> {
  const q = query(collection(cloudDb(), 'adminPackages'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function createPackage(data: Omit<AdminPackage, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(cloudDb(), 'adminPackages'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePackage(id: string, data: Partial<AdminPackage>): Promise<void> {
  await updateDoc(doc(cloudDb(), 'adminPackages', id), data as any);
}

export async function deletePackage(id: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), 'adminPackages', id));
}
