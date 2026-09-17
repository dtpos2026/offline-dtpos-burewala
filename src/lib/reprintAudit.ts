/**
 * Reprint Audit Log — every customer-receipt reprint from the Bill Reprint
 * page records an entry. Local-only in the offline build.
 * Read-only on the UI: cashier cannot edit / delete entries.
 */
import { cloudDb, isCloudConfigured } from './offlineNoCloud';
import { getTenantId } from './tenant';
import { collection, doc, setDoc, getDocs, serverTimestamp, query, orderBy, limit } from '@/lib/offlineNoCloud';

const LS_KEY = 'pos-reprint-audit-v1';

export interface ReprintAuditEntry {
  id: string;
  at: string;              // ISO
  orderId: string;
  billNumber: number;
  reprintedBy: string;
  reprintedByRole?: string;
  orderStatus: string;
  type: 'receipt' | 'kot' | 'token';
}

function readLocal(): ReprintAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function writeLocal(arr: ReprintAuditEntry[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(0, 1000))); } catch {}
}

export function getReprintLog(): ReprintAuditEntry[] {
  return readLocal().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function logReprint(opts: {
  orderId: string;
  billNumber: number;
  orderStatus: string;
  type?: 'receipt' | 'kot' | 'token';
}): ReprintAuditEntry {
  const entry: ReprintAuditEntry = {
    id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    orderId: opts.orderId,
    billNumber: opts.billNumber,
    orderStatus: opts.orderStatus,
    type: opts.type || 'receipt',
    reprintedBy: localStorage.getItem('pos-user-name') || localStorage.getItem('pos-user-id') || 'unknown',
    reprintedByRole: localStorage.getItem('pos-user-role') || undefined,
  };
  const all = readLocal();
  all.unshift(entry);
  writeLocal(all);

  // Best-effort cloud mirror
  if (isCloudConfigured()) {
    const tid = getTenantId();
    if (tid) {
      try {
        setDoc(doc(cloudDb(), 'tenants', tid, 'reprintLogs', entry.id), {
          ...entry,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      } catch {}
    }
  }
  return entry;
}

export async function fetchCloudReprintLog(max = 200): Promise<ReprintAuditEntry[]> {
  if (!isCloudConfigured()) return [];
  const tid = getTenantId();
  if (!tid) return [];
  try {
    const q = query(collection(cloudDb(), 'tenants', tid, 'reprintLogs'), orderBy('at', 'desc'), limit(max));
    const snap = await getDocs(q);
    const arr: ReprintAuditEntry[] = [];
    snap.forEach(d => arr.push(d.data() as ReprintAuditEntry));
    return arr;
  } catch { return []; }
}
