// DT POS — Marketing Contacts (manually added by Super Admin)
// For Digital Target marketing campaigns — separate from approved restaurants.
// Stored at top-level cloud collection: marketingContacts/{id}

import { cloudDb } from '@/lib/offlineNoCloud';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp,
  query, orderBy,
} from '@/lib/offlineNoCloud';

export interface MarketingContact {
  id: string;
  name: string;             // contact person / sales lead name
  ownerName?: string;       // restaurant owner (purchaser) — appears on invoice
  phone: string;
  city: string;
  restaurantName: string;
  address?: string;
  notes?: string;
  source?: string;          // "Facebook Ads" | "Walk-in" | "Referral" | …
  linkedTenantId?: string;  // approved restaurant tenant linked to this contact
  linkedDeviceIds?: string[]; // approved device ids selected for this contact
  createdAt?: any;
}

export async function fetchContacts(): Promise<MarketingContact[]> {
  const q = query(collection(cloudDb(), 'marketingContacts'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function createContact(data: Omit<MarketingContact, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(collection(cloudDb(), 'marketingContacts'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateContact(id: string, data: Partial<MarketingContact>): Promise<void> {
  await updateDoc(doc(cloudDb(), 'marketingContacts', id), data as any);
}

export async function deleteContact(id: string): Promise<void> {
  await deleteDoc(doc(cloudDb(), 'marketingContacts', id));
}

export const CONTACT_SOURCES = [
  'Facebook Ads', 'Instagram', 'WhatsApp', 'Walk-in', 'Referral', 'Cold Call', 'Other',
] as const;
