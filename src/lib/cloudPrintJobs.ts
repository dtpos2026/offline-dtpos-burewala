// ============================================================
// Cloud Print Jobs — cloud-synced print queue.
// Path: tenants/{tid}/printJobs/{id}
//
// Web POS, online website, rider portal — anyone can create a job.
// Windows EXE (PrintHost) listens in real-time, claims ONE job at a
// time via transaction (prevents duplicate printing), silently prints
// it on the configured printer, then marks it printed/failed.
//
// If no EXE is online, jobs stay `pending` and print when EXE opens.
// ============================================================
import {
  collection,
  doc,
  addDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  updateDoc,
  Unsubscribe,
} from '@/lib/offlineNoCloud';
import { cloudDb, isCloudConfigured } from './offlineNoCloud';
import { getTenantId, getDeviceId } from './tenant';

export type CloudPrintType = 'kot' | 'receipt' | 'rider' | 'token';
export type CloudPrintStatus = 'pending' | 'printing' | 'printed' | 'failed';
export type CloudPrintRole =
  | 'counter'   // customer receipt
  | 'kitchen'   // KOT
  | 'delivery'  // rider slip
  | 'display'   // customer display
  | 'token';    // tandoor token slip

export interface CloudPrintJob {
  id: string;
  orderId?: string;
  orderNumber?: number;
  branchId?: string;
  type: CloudPrintType;
  role: CloudPrintRole;
  paperSize: '58mm' | '80mm';
  copies: number;
  // HTML payload to render & print (already styled for thermal)
  html: string;
  // Optional structured payload (for ESC/POS mode in future)
  payload?: Record<string, any>;
  status: CloudPrintStatus;
  source: 'web' | 'pos' | 'website' | 'rider' | 'kds' | 'system';
  createdAt: any;
  claimedBy?: string;   // deviceId of EXE that claimed
  claimedAt?: any;
  printedAt?: any;
  failedAt?: any;
  retryCount: number;
  error?: string;
}

function colRef() {
  const tid = getTenantId();
  if (!tid) throw new Error('No tenant');
  return collection(cloudDb(), 'tenants', tid, 'printJobs');
}

export function isCloudPrintAvailable(): boolean {
  return isCloudConfigured() && !!getTenantId();
}

export interface CreateJobInput {
  type: CloudPrintType;
  role: CloudPrintRole;
  html: string;
  paperSize?: '58mm' | '80mm';
  copies?: number;
  orderId?: string;
  orderNumber?: number;
  branchId?: string;
  source?: CloudPrintJob['source'];
  payload?: Record<string, any>;
  /** Idempotency key — if a job with same dedupeKey exists pending/printing/printed,
   *  it will not be re-created. */
  dedupeKey?: string;
}

const recentDedupe = new Set<string>();

export async function createCloudPrintJob(input: CreateJobInput): Promise<string | null> {
  if (!isCloudPrintAvailable()) return null;

  if (input.dedupeKey) {
    if (recentDedupe.has(input.dedupeKey)) return null;
    recentDedupe.add(input.dedupeKey);
    setTimeout(() => recentDedupe.delete(input.dedupeKey!), 60_000);
  }

  const ref = await addDoc(colRef(), {
    type: input.type,
    role: input.role,
    html: input.html,
    paperSize: input.paperSize || '80mm',
    copies: Math.max(1, input.copies || 1),
    orderId: input.orderId || null,
    orderNumber: input.orderNumber || null,
    branchId: input.branchId || null,
    source: input.source || 'web',
    payload: input.payload || null,
    status: 'pending' as CloudPrintStatus,
    retryCount: 0,
    dedupeKey: input.dedupeKey || null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Subscribe to pending (and recently-failed retryable) jobs. */
export function subscribePendingJobs(
  handler: (jobs: CloudPrintJob[]) => void,
  opts: { branchId?: string; max?: number } = {},
): Unsubscribe {
  if (!isCloudPrintAvailable()) return () => {};
  const q = query(
    colRef(),
    where('status', 'in', ['pending', 'failed']),
    orderBy('createdAt', 'asc'),
    limit(opts.max || 25),
  );
  return onSnapshot(q, (snap) => {
    const jobs: CloudPrintJob[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((j: CloudPrintJob) => {
        if (j.status === 'failed' && (j.retryCount || 0) >= 3) return false;
        if (opts.branchId && j.branchId && j.branchId !== opts.branchId) return false;
        return true;
      });
    handler(jobs);
  }, (err) => { console.warn('[cloudPrintJobs] snapshot error', err); });
}

/** Atomically claim a pending job for THIS device. Returns the job, or null if
 *  already claimed by another device. */
export async function claimJob(jobId: string): Promise<CloudPrintJob | null> {
  const tid = getTenantId();
  if (!tid) return null;
  const ref = doc(cloudDb(), 'tenants', tid, 'printJobs', jobId);
  const deviceId = getDeviceId();

  try {
    const claimed = await runTransaction(cloudDb(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as CloudPrintJob;
      if (data.status !== 'pending' && data.status !== 'failed') return null;
      if (data.status === 'failed' && (data.retryCount || 0) >= 3) return null;
      tx.update(ref, {
        status: 'printing',
        claimedBy: deviceId,
        claimedAt: serverTimestamp(),
      });
      return { id: jobId, ...data, status: 'printing' as CloudPrintStatus, claimedBy: deviceId };
    });
    return claimed;
  } catch {
    return null;
  }
}

export async function markCloudJobPrinted(jobId: string) {
  const tid = getTenantId();
  if (!tid) return;
  const ref = doc(cloudDb(), 'tenants', tid, 'printJobs', jobId);
  await updateDoc(ref, {
    status: 'printed',
    printedAt: serverTimestamp(),
    error: null,
  });
}

export async function markCloudJobFailed(jobId: string, error: string) {
  const tid = getTenantId();
  if (!tid) return;
  const ref = doc(cloudDb(), 'tenants', tid, 'printJobs', jobId);
  const snap = await getDoc(ref);
  const retry = snap.exists() ? ((snap.data() as any).retryCount || 0) + 1 : 1;
  await updateDoc(ref, {
    status: 'failed',
    failedAt: serverTimestamp(),
    retryCount: retry,
    error: String(error).slice(0, 500),
  });
}

export async function retryCloudJob(jobId: string) {
  const tid = getTenantId();
  if (!tid) return;
  const ref = doc(cloudDb(), 'tenants', tid, 'printJobs', jobId);
  await updateDoc(ref, {
    status: 'pending',
    error: null,
    retryCount: 0,
    claimedBy: null,
  });
}
