// cloud-backed "Call Waiter" / service call events from QR portal → POS device.
// Falls back gracefully when the online modules are off (no-op).
import { isCloudConfigured, cloudDb } from './offlineNoCloud';
import { getTenantId } from './tenant';
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy } from '@/lib/offlineNoCloud';

export interface ServiceCall {
  id: string;
  tableLabel: string;   // e.g. "Table 5"
  floorName?: string;
  message?: string;     // optional ("Need water", default "Call Waiter")
  at: string;           // ISO
  acked?: boolean;
}

function colRef() {
  const tid = getTenantId();
  if (!isCloudConfigured() || !tid) return null;
  return collection(cloudDb(), 'tenants', tid, 'serviceCalls');
}

export async function addServiceCall(input: Omit<ServiceCall, 'id' | 'at' | 'acked'>): Promise<ServiceCall | null> {
  const c = colRef();
  const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Strip undefined — the document store rejects undefined field values.
  const clean: any = { id, at: new Date().toISOString(), acked: false };
  Object.entries(input).forEach(([k, v]) => { if (v !== undefined && v !== null) clean[k] = v; });
  const sc = clean as ServiceCall;
  if (!c) {
    // Local fallback (single-device demo)
    try {
      const arr = JSON.parse(localStorage.getItem('dt-service-calls') || '[]');
      arr.push(sc);
      localStorage.setItem('dt-service-calls', JSON.stringify(arr.slice(-50)));
      window.dispatchEvent(new CustomEvent('dt-service-call', { detail: sc }));
    } catch {}
    return sc;
  }
  try {
    await setDoc(doc(c, id), sc);
    return sc;
  } catch (e) {
    console.error('addServiceCall failed', e);
    return null;
  }
}

export async function fetchServiceCalls(): Promise<ServiceCall[]> {
  const c = colRef();
  if (!c) {
    try { return JSON.parse(localStorage.getItem('dt-service-calls') || '[]'); } catch { return []; }
  }
  try {
    const snap = await getDocs(query(c, orderBy('at', 'desc')));
    return snap.docs.map(d => d.data() as ServiceCall);
  } catch { return []; }
}

export async function ackServiceCall(id: string) {
  const c = colRef();
  if (!c) {
    try {
      const arr: ServiceCall[] = JSON.parse(localStorage.getItem('dt-service-calls') || '[]');
      localStorage.setItem('dt-service-calls', JSON.stringify(arr.filter(x => x.id !== id)));
    } catch {}
    return;
  }
  try { await deleteDoc(doc(c, id)); } catch {}
}
