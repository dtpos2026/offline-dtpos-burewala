// DT POS — Subscription Plans (Super Admin defined)
// Different from Packages: Plans = device-tier monthly/yearly tiers.
// Stored at top-level cloud collection: adminPlans/{id}

import { cloudDb } from '@/lib/offlineNoCloud';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy,
} from '@/lib/offlineNoCloud';

export interface AdminPlan {
  id: string;
  name: string;             // e.g. "Basic" / "Starter" / "Pro" / "Enterprise"
  maxDevices: number;       // 0 = unlimited
  monthlyRs: number;
  yearlyRs: number;
  features?: string[];
  active: boolean;
  createdAt?: any;
}

export async function fetchAdminPlans(): Promise<AdminPlan[]> {
  const q = query(collection(cloudDb(), 'adminPlans'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function createAdminPlan(data: Omit<AdminPlan, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(cloudDb(), 'adminPlans'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAdminPlan(id: string, data: Partial<AdminPlan>): Promise<void> {
  await updateDoc(doc(cloudDb(), 'adminPlans', id), data as any);
}

export async function deleteAdminPlan(id: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), 'adminPlans', id));
}
