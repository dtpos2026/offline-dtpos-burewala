// ============================================================
// Centralized Print Service / Queue (device-local)
// ------------------------------------------------------------
// Single source of truth for ALL printing (KOT, customer receipt,
// token, rider slip). Jobs are device-local on purpose — a physical
// printer is attached to one device, so jobs must NOT sync across
// devices (that would print the same slip on every terminal).
//
// Flow:  Order event -> enqueuePrint() -> Print Queue ->
//        PrintHost picks ONE job at a time -> renders + prints ->
//        markPrinted()/markFailed() -> next job.
//
// Duplicate protection:
//   - KOT: guarded by order.kotPrinted (a KOT for an order is enqueued once).
//   - Receipt: guarded by order.receiptPrinted unless force=true (reprint).
// ============================================================
import { getOrders, saveOrder, getSettings, getMenuItems } from './store';
import { orderNeedsToken } from './tokenRules';
import { appendPrintLog } from './printLog';
import type { Order } from './types';
import { buildKotRevision, nextKotNo, makeEditLog } from './orderHistory';

export type PrintType = 'kot' | 'receipt' | 'token' | 'rider';
export type PrintJobStatus = 'pending' | 'printing' | 'printed' | 'failed';

export interface PrintJob {
  id: string;
  orderId: string;
  orderNumber?: number;
  branchId?: string;
  printerId?: string;        // resolved printer name (station / default)
  station?: string;          // kitchen/station label
  printType: PrintType;
  copies: number;
  status: PrintJobStatus;
  retryCount: number;
  createdAt: string;         // enqueued at
  lastTriedAt?: string;
  // ===== Phase-2 timing instrumentation =====
  renderStartedAt?: string;  // when host began rendering DOM for print
  printCommandAt?: string;   // when print() / electron print fired
  printedAt?: string;        // success
  failedAt?: string;         // last failure
  durationMs?: number;       // enqueue -> done
  error?: string;
  errorReason?: 'no-printer' | 'offline' | 'render-failed' | 'unknown';
  // ===== KOT diff / update support =====
  updateMode?: boolean;
  diffItemIds?: string[];
  diffDeltas?: Record<string, number>;
  /** Items whose qty dropped below printedQty (cancellations/decrease). Value = qty cancelled (positive number). */
  cancelDeltas?: Record<string, number>;
  /** Snapshot of cancelled item names (id -> name) for rendering even after the line is fully removed. */
  cancelNames?: Record<string, string>;
  /** Sequential KOT number this print represents (1, 2, 3 …). */
  kotNo?: number;
  /** User's explicit action (Send Kitchen / Reprint) — bypasses the kotSilentMode hold. */
  manual?: boolean;
}

const QUEUE_KEY = 'pos-print-queue';
const QUEUE_EVENT = 'dt-pos-print-queue';
const MAX_RETRY = 3;

function genId() {
  return `pj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getPrintQueue(): PrintJob[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(jobs: PrintJob[]) {
  try {
    // keep last 100 jobs to avoid unbounded growth
    localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.slice(-100)));
  } catch {}
  notify();
}

function notify() {
  try {
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
  } catch {}
}

export function onPrintQueueChange(handler: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, handler);
  return () => window.removeEventListener(QUEUE_EVENT, handler);
}

/** Pending (or failed-with-retry-left) jobs in FIFO order. */
export function getProcessableJobs(): PrintJob[] {
  const stalePrintingBefore = Date.now() - 20000;
  return getPrintQueue().filter(
    j => j.status === 'pending'
      || (j.status === 'failed' && j.retryCount < MAX_RETRY)
      || (j.status === 'printing' && !!j.lastTriedAt && new Date(j.lastTriedAt).getTime() < stalePrintingBefore),
  );
}

export function getFailedJobs(): PrintJob[] {
  return getPrintQueue().filter(j => j.status === 'failed' && j.retryCount >= MAX_RETRY);
}

/** Resolve which printer a job should target based on settings + station. */
function resolvePrinter(printType: PrintType, station?: string, excludePrinter?: string): string | undefined {
  const s = getSettings();
  const pick = (...candidates: (string | undefined)[]) => {
    for (const c of candidates) if (c && c !== excludePrinter) return c;
    return undefined;
  };
  if (printType === 'kot') {
    if (station && s.stationPrinters && s.stationPrinters[station]) {
      return pick(s.stationPrinters[station], s.backupPrinter, s.kotFallbackToReceipt !== false ? s.defaultPrinter : undefined);
    }
    return pick(s.kotPrinter, s.kotFallbackToReceipt !== false ? s.defaultPrinter : undefined, s.backupPrinter);
  }
  if (printType === 'token') return pick(s.tokenPrinter, s.defaultPrinter, s.backupPrinter);
  return pick(s.defaultPrinter, s.backupPrinter);
}

/** Prevent a same job that was printed this recently from being re-enqueued (double-print guard). */
const RECENT_PRINT_WINDOW_MS = 15000;

interface EnqueueOpts {
  station?: string;
  copies?: number;
  force?: boolean; // bypass duplicate guard (reprint)
  updateMode?: boolean;
  diffItemIds?: string[];
  diffDeltas?: Record<string, number>;
  cancelDeltas?: Record<string, number>;
  cancelNames?: Record<string, string>;
  kotNo?: number;
  manual?: boolean;
}

/**
 * Enqueue a print job. Returns the created job, or null if skipped
 * (duplicate guard / disabled in settings).
 */
export function enqueuePrint(order: Order, printType: PrintType, opts: EnqueueOpts = {}): PrintJob | null {
  const s = getSettings();

  if (printType === 'kot') {
    if (s.kotEnabled === false) return null;
    // Approval gate — never send pending/rejected orders to the kitchen.
    if (order.status === 'pending_approval' || order.status === 'rejected') return null;
    // updateMode and force both bypass the duplicate guard.
    if (!opts.force && !opts.updateMode && order.kotPrinted) return null;
    // ===== Queue-level dedup =====
    // Prevent double-click / race conditions from enqueueing two identical KOTs
    // for the same order before the first one is marked printed.
    // ===== FIX (KOT double print): previously `force` bypassed dedup entirely,
    // and every manual button (Send Kitchen / Reprint) uses force — so a
    // double-click or two simultaneous paths resulted in TWO KOTs. Now force also:
    //   • does not create a new job if the same one is already pending/printing in the queue
    //   • rejects the same request again within 3 seconds (double-click)
    // (the real purpose of force is to bypass `order.kotPrinted`, not to print two slips.)
    {
      const dupPending = getPrintQueue().some(j =>
        j.orderId === order.id
        && j.printType === 'kot'
        && !!j.updateMode === !!opts.updateMode
        && (j.status === 'pending' || j.status === 'printing')
      );
      if (dupPending) {
        try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip KOT (already queued)', { no: order.orderNumber }); } catch {}
        return null;
      }
      const rapid = getPrintQueue().some(j =>
        j.orderId === order.id && j.printType === 'kot'
        && !!j.updateMode === !!opts.updateMode
        && Date.now() - new Date(j.createdAt || 0).getTime() < 3000
      );
      if (rapid) {
        try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip KOT (double-click 3s)', { no: order.orderNumber }); } catch {}
        return null;
      }
    }
    if (!opts.force && !opts.updateMode) {
      const pending = getPrintQueue().some(j =>
        j.orderId === order.id
        && j.printType === 'kot'
        && !j.updateMode
        && (j.status === 'pending' || j.status === 'printing')
      );
      if (pending) {
        try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip KOT', { orderId: order.id, no: order.orderNumber }); } catch {}
        return null;
      }
      // If the KOT for this order was just printed (within 15s), don't print again
      const justPrinted = getPrintQueue().some(j =>
        j.orderId === order.id && j.printType === 'kot' && !j.updateMode
        && j.status === 'printed' && Date.now() - new Date(j.printedAt || j.createdAt || 0).getTime() < RECENT_PRINT_WINDOW_MS
      );
      if (justPrinted) {
        try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip KOT (just printed)', { no: order.orderNumber }); } catch {}
        return null;
      }
    }
  }
  if (printType === 'receipt') {
    if (!opts.force && order.receiptPrinted) return null;
    // ===== Queue-level dedup =====
    // A receipt already queued or on the printer is never queued twice, and
    // that now holds for `force` too. Every pay path (POS, retrieve, pending
    // payments, receive payment) calls enqueueReceiptOnPay with force set, so
    // two of them firing for the same bill used to produce two slips. `force`
    // exists to bypass order.receiptPrinted for a deliberate reprint, not to
    // authorise a duplicate — and a real reprint is always more than a few
    // seconds after the automatic one.
    const dupPending = getPrintQueue().some(j =>
      j.orderId === order.id
      && j.printType === 'receipt'
      && (j.status === 'pending' || j.status === 'printing')
    );
    if (dupPending) {
      try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip receipt (already queued)', { no: order.orderNumber }); } catch { /* console gone */ }
      return null;
    }
    const rapid = getPrintQueue().some(j =>
      j.orderId === order.id && j.printType === 'receipt'
      && Date.now() - new Date(j.createdAt || 0).getTime() < 3000
    );
    if (rapid) {
      try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'dedup-skip receipt (double-submit 3s)', { no: order.orderNumber }); } catch { /* console gone */ }
      return null;
    }
  }

  const job: PrintJob = {
    id: genId(),
    orderId: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    printType,
    station: opts.station,
    printerId: resolvePrinter(printType, opts.station),
    copies: Math.max(1, opts.copies ?? (printType === 'kot' ? (s.kotCopies || 1) : 1)),
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updateMode: opts.updateMode,
    diffItemIds: opts.diffItemIds,
    diffDeltas: opts.diffDeltas,
    cancelDeltas: opts.cancelDeltas,
    cancelNames: opts.cancelNames,
    kotNo: opts.kotNo,
    manual: opts.manual || opts.force || undefined,
  };

  const queue = getPrintQueue();
  queue.push(job);
  saveQueue(queue);
  try {
    console.log('%c[DT-Print]', 'color:#7c3aed;font-weight:700',
      'enqueue', { type: printType, no: order.orderNumber, printer: job.printerId, copies: job.copies, jobId: job.id });
  } catch {}
  return job;
}

function updateJob(id: string, patch: Partial<PrintJob>) {
  const queue = getPrintQueue().map(j => (j.id === id ? { ...j, ...patch } : j));
  saveQueue(queue);
}

export function markPrinting(id: string) {
  const now = new Date().toISOString();
  updateJob(id, { status: 'printing', lastTriedAt: now, renderStartedAt: now });
}

/** Stamp the moment we actually fire the print command (electron/browser). */
export function markPrintCommandSent(id: string) {
  updateJob(id, { printCommandAt: new Date().toISOString() });
}

export function markPrinted(id: string) {
  const job = getPrintQueue().find(j => j.id === id);
  const now = new Date().toISOString();
  const duration = job ? (Date.now() - new Date(job.createdAt).getTime()) : undefined;
  updateJob(id, {
    status: 'printed',
    lastTriedAt: now,
    printedAt: now,
    durationMs: duration,
    error: undefined,
    errorReason: undefined,
  });
  try { console.log('%c[DT-Print]', 'color:#16a34a;font-weight:700', 'printed ✓', { jobId: id, durationMs: duration }); } catch {}
  // Issue-11 logging: log every print event to the device print-log
  try {
    if (job) {
      appendPrintLog({
        billNumber: job.orderNumber != null ? String(job.orderNumber) : job.orderId,
        printerName: job.printerId,
        printType: job.printType === 'kot' ? 'kitchen' : job.printType === 'receipt' ? 'receipt' : 'other',
        status: 'success',
        ms: duration,
      });
    }
  } catch {}
  if (!job) return;
  // Stamp the order with print flags
  try {
    const order = getOrders().find(o => o.id === job.orderId);
    if (order) {
      const patch: Partial<Order> = {
        printStatus: 'printed',
        printCount: (order.printCount || 0) + 1,
        lastPrintedAt: now,
      };
      if (job.printType === 'kot') {
        patch.kotPrinted = true;
        patch.kotLastPrintedAt = now;
        patch.kotPrintCount = (order.kotPrintCount || 0) + 1;
        if (!order.kotFirstPrintedAt) patch.kotFirstPrintedAt = now;

        // ===== Stamp printedQty on each item line =====
        // For update KOT: positive deltas bump printedQty up; cancel deltas pull printedQty down
        // so the cancelled qty is not reprinted on the next slip.
        const cancelDeltas = job.cancelDeltas || {};
        const items = (order.items || []).map(it => {
          if (job.updateMode) {
            const delta = job.diffDeltas?.[it.id];
            let newPrinted = it.printedQty || 0;
            if (typeof delta === 'number' && delta > 0) {
              newPrinted = Math.min(it.quantity, newPrinted + delta);
            }
            const cancelled = cancelDeltas[it.id];
            if (typeof cancelled === 'number' && cancelled > 0) {
              // FIX v1.0.38: yahan `Math.max(it.quantity, ...)` likha tha —
              // us se printedQty hamesha wapas poori quantity par chala jata
              // tha, yani cancellation kabhi asar hi nahi karti thi aur
              // agli KOT par cancelled item dobara chhap jata tha.
              // Sahi floor 0 hai, phir upper clamp current quantity par.
              newPrinted = Math.max(0, newPrinted - cancelled);
              // clamp so printedQty never exceeds current quantity
              newPrinted = Math.min(it.quantity, newPrinted);
            }
            return { ...it, printedQty: newPrinted };
          }
          return { ...it, printedQty: it.quantity };
        });
        patch.items = items;

        // ===== KOT activity log =====
        const logEntry: import('./types').KotLogEntry = {
          at: now,
          action: job.updateMode ? 'updated' : 'created',
          addedItems: job.updateMode
            ? (order.items || [])
                .filter(it => (job.diffDeltas?.[it.id] || 0) > 0)
                .map(it => ({ name: it.name, quantity: job.diffDeltas![it.id], note: it.note }))
            : undefined,
          removedItems: job.updateMode && Object.keys(cancelDeltas).length
            ? Object.entries(cancelDeltas).map(([id, qty]) => ({
                name: job.cancelNames?.[id] || (order.items || []).find(it => it.id === id)?.name || id,
                quantity: qty,
              }))
            : undefined,
        };
        patch.kotLog = [...(order.kotLog || []), logEntry];

        // ===== Permanent KOT Revision ledger =====
        try {
          const positiveDeltas: Record<string, number> = job.updateMode
            ? (job.diffDeltas || {})
            : Object.fromEntries((order.items || []).map(it => [it.id, it.quantity || 0]));
          // merge cancel deltas as negative values so the revision captures cancellations too
          const combined: Record<string, number> = { ...positiveDeltas };
          for (const [id, qty] of Object.entries(cancelDeltas)) combined[id] = -(qty);
          const rev = buildKotRevision({
            kotNo: nextKotNo(order),
            items: order.items || [],
            deltas: combined,
            isFirst: !job.updateMode,
          });
          // patch names for fully-removed cancelled lines (not in items[])
          rev.lines = rev.lines.map(l => {
            if (l.name && l.name !== l.itemId) return l;
            const nm = job.cancelNames?.[l.itemId];
            return nm ? { ...l, name: nm } : l;
          });
          rev.printedAt = now;
          patch.kotRevisions = [...(order.kotRevisions || []), rev];
          const editEntry = makeEditLog('REPRINT', {
            newValue: `KOT #${rev.kotNo} (${rev.type})`,
          });
          patch.editLogs = [...(order.editLogs || []), editEntry];
        } catch (e) { console.warn('[kot-revision] failed', e); }

        // ===== AUTO-COOKING =====
        try {
          const settings = getSettings();
          const autoCookingOn = settings?.autoCookingOnKot !== false;
          if (autoCookingOn && !order.cookingStartedAt) {
            patch.cookingStartedAt = now;
            if (!order.kitchenStatus || order.kitchenStatus === 'pending') {
              patch.kitchenStatus = 'preparing';
              patch.kitchenStatusAt = now;
            }
            if (order.orderType === 'delivery') {
              const ds = order.deliveryStatus;
              if (!ds || ds === 'pending' || ds === 'accepted') {
                patch.deliveryStatus = 'cooking';
              }
            }
          }
        } catch {}
      }
      if (job.printType === 'receipt') patch.receiptPrinted = true;
      saveOrder({ ...order, ...patch });
    }
  } catch {}
}

function classifyError(error?: string): PrintJob['errorReason'] {
  if (!error) return 'unknown';
  const e = error.toLowerCase();
  if (e.includes('no printer') || e.includes('not selected') || e.includes('not configured')) return 'no-printer';
  if (e.includes('offline') || e.includes('econnrefused') || e.includes('etimedout') || e.includes('unreachable')) return 'offline';
  if (e.includes('render') || e.includes('dom') || e.includes('iframe')) return 'render-failed';
  return 'unknown';
}

export function markFailed(id: string, error?: string) {
  const job = getPrintQueue().find(j => j.id === id);
  if (!job) return;
  const now = new Date().toISOString();
  const nextRetry = job.retryCount + 1;
  const reason = classifyError(error);
  // Phase-3: when retries exhaust and auto-reprint is enabled, one-shot failover to backup printer.
  const settings = getSettings();
  const autoReprint = settings.autoReprintOnFailure !== false;
  if (autoReprint && nextRetry >= MAX_RETRY && settings.backupPrinter && settings.backupPrinter !== job.printerId) {
    updateJob(id, {
      status: 'pending',
      retryCount: 0,
      lastTriedAt: now,
      failedAt: now,
      error: `${error || 'failed'} — switched to backup printer`,
      errorReason: reason,
      printerId: settings.backupPrinter,
    });
    try { console.warn('%c[DT-Print]', 'color:#f59e0b;font-weight:700', '⇄ failover to backup', { jobId: id, backup: settings.backupPrinter }); } catch {}
    return;
  }
  updateJob(id, {
    status: 'failed',
    retryCount: nextRetry,
    lastTriedAt: now,
    failedAt: now,
    error,
    errorReason: reason,
  });
  try { console.warn('%c[DT-Print]', 'color:#dc2626;font-weight:700', 'FAILED ✗', { jobId: id, error }); } catch {}
  // Issue-11: log failure too in print-log + show the user a CLEAR error once retries are exhausted
  try {
    appendPrintLog({
      billNumber: job.orderNumber != null ? String(job.orderNumber) : job.orderId,
      printerName: job.printerId,
      printType: job.printType === 'kot' ? 'kitchen' : job.printType === 'receipt' ? 'receipt' : 'other',
      status: 'failed',
      error: error || 'unknown',
    });
  } catch {}
  if (nextRetry >= MAX_RETRY) {
    // The bill itself was saved long before printing was attempted. Say so —
    // a cashier who reads "print failed" needs to know the sale is safe, and
    // needs a way to get the slip out once the printer is back.
    const what = job.printType === 'kot' ? 'Kitchen slip' : job.printType === 'token' ? 'Token' : 'Receipt';
    const why =
      reason === 'no-printer' ? 'no printer is selected'
      : reason === 'offline' ? 'the printer is not responding'
      : reason === 'render-failed' ? 'the slip could not be prepared'
      : 'the printer did not accept the job';
    try {
      import('sonner').then(({ toast }) =>
        toast.error(
          `Bill #${job.orderNumber ?? ''} saved successfully, but ${why}. ${what} not printed.`,
          {
            duration: 15000,
            description: `Printer: ${job.printerId || 'Windows default'} — the bill is safe and can be reprinted.`,
            action: { label: 'Retry print', onClick: () => retryJob(id) },
          },
        ));
    } catch { /* toast unavailable */ }
    try {
      window.dispatchEvent(new CustomEvent('dtpos-print-failed', {
        detail: { jobId: id, orderNumber: job.orderNumber, printType: job.printType, reason, error },
      }));
    } catch { /* no window */ }
    // Keep a reliable print state ON THE BILL, not just in the queue, so a
    // reprint later can tell "never came out" from "already printed".
    try {
      const order = getOrders().find(o => o.id === job.orderId);
      if (order && order.printStatus !== 'printed') {
        saveOrder({ ...order, printStatus: 'failed', lastPrintFailedAt: now, lastPrintError: error || 'print failed' } as any);
      }
    } catch (e) { console.warn('[DT-Print] could not stamp failed state on order', e); }
  }
}

/** Kitchen KOTs held back by Silent-KOT mode. These never reach the printer on
 *  their own, so Print Retry must show them and let the user release them —
 *  otherwise a kitchen slip simply disappears (client-reported bug). */
export function getHeldKotJobs(): PrintJob[] {
  if (!getSettings().kotSilentMode) return [];
  return getPrintQueue().filter(j => j.printType === 'kot' && !j.manual && (j.status === 'pending' || j.status === 'printing'));
}

/** Release a held kitchen KOT so the print host picks it up right now. */
export function releaseKotJob(id: string) {
  updateJob(id, { status: 'pending', manual: true, error: undefined, retryCount: 0 });
}

/** Manually retry a failed job (resets to pending). Kitchen jobs are marked
 *  manual so Silent-KOT mode cannot swallow the retry. */
export function retryJob(id: string) {
  const job = getPrintQueue().find(j => j.id === id);
  updateJob(id, { status: 'pending', error: undefined, ...(job?.printType === 'kot' ? { manual: true } : {}) });
}

export function retryAllFailed() {
  const queue = getPrintQueue().map(j =>
    j.status === 'failed' ? { ...j, status: 'pending' as const, retryCount: 0, error: undefined, manual: j.printType === 'kot' ? true : j.manual } : j,
  );
  saveQueue(queue);
}

export function clearPrintedJobs() {
  saveQueue(getPrintQueue().filter(j => j.status !== 'printed'));
}

/** User ka "Clear All Pending": tamam pending/failed/stuck jobs HAMESHA ke
 *  liye cancel — na ab printengi, na restart pe. (Restart-flush surprise ka
 *  ilaaj: purani jobs ura do, sirf naye commands print hon.) */
export function clearAllPendingJobs(): number {
  const queue = getPrintQueue();
  const n = queue.filter(j => j.status !== 'printed').length;
  saveQueue(queue.filter(j => j.status === 'printed'));
  try { console.log('%c[DT-Print]', 'color:#f59e0b;font-weight:700', 'ALL PENDING CLEARED by user', { removed: n }); } catch {}
  return n;
}

/** Convenience: KOT for an order, respecting per-item kitchen stations. */
export function enqueueKot(order: Order, opts: EnqueueOpts = {}) {
  return enqueuePrint(order, 'kot', opts);
}
export function enqueueReceipt(order: Order, opts: EnqueueOpts = {}) {
  return enqueuePrint(order, 'receipt', opts);
}

/** Manual Token Print (via button) — if a token category is set, print slip + register count. */
export function enqueueToken(order: Order): boolean {
  const st: any = getSettings();
  // Categories AND individually-selected items both qualify an order.
  if (!orderNeedsToken(order, st, getMenuItems())) return false;
  return !!enqueuePrint(order, 'token', { force: true, manual: true });
}

/** Payment ke waqt receipt — 'No receipt on pay' setting ka ek hi gate.
 *  When ON, the receipt will NOT print on pay (simple pay, retrieve-pay, pending-pay
 *  all). Reprint/Bill-Print buttons bypass this — they are explicit. */
export function enqueueReceiptOnPay(order: Order, opts: EnqueueOpts = {}) {
  // NOTE (v1.0.40): stock deduction used to be kicked off from here as well,
  // on top of the two paths inside saveOrder — three deductions for one sale.
  // saveOrder is the single funnel now (see stockEngine.consumeStockForOrder),
  // and it runs before this function is ever reached.
  // Tandoor Token: BEFORE the receipt and INDEPENDENT of noReceiptOnPay — the token
  // is for the tandoor, not for the customer.
  try {
    const st: any = getSettings();
    if (orderNeedsToken(order, st, getMenuItems())) {
      enqueuePrint(order, 'token', { force: true });
    }
  } catch {}
  try {
    if ((getSettings() as any).noReceiptOnPay) {
      console.log('%c[DT-Print]', 'color:#f59e0b', 'receipt on pay SKIPPED (noReceiptOnPay ON)', { order: order.orderNumber });
      return undefined;
    }
  } catch {}
  return enqueuePrint(order, 'receipt', { force: true, ...opts });
}

/**
 * Compute the diff between the order's current items and what has already been
 * printed (item.printedQty). Returns both positive deltas (new / increased items)
 * and cancel deltas (items whose qty dropped below printedQty, or fully removed
 * lines that still appear in a prior KOT revision).
 */
export function computeKotDiff(order: Order): {
  hasDiff: boolean;
  diffItemIds: string[];
  diffDeltas: Record<string, number>;
  cancelDeltas: Record<string, number>;
  cancelNames: Record<string, string>;
} {
  const diffDeltas: Record<string, number> = {};
  const cancelDeltas: Record<string, number> = {};
  const cancelNames: Record<string, string> = {};
  const diffItemIds: string[] = [];
  const currentIds = new Set<string>();
  for (const it of order.items || []) {
    currentIds.add(it.id);
    const printed = it.printedQty || 0;
    const delta = (it.quantity || 0) - printed;
    if (delta > 0) {
      diffDeltas[it.id] = delta;
      diffItemIds.push(it.id);
    } else if (delta < 0) {
      cancelDeltas[it.id] = -delta;
      cancelNames[it.id] = it.name;
    }
  }
  // Lines that were on a previous KOT but are now fully removed from the cart
  const printedItemIds = new Set<string>();
  for (const rev of order.kotRevisions || []) {
    for (const l of rev.lines || []) {
      if (l.deltaQty > 0) printedItemIds.add(l.itemId);
      // a previously cancelled line in a revision means already accounted for; skip if also currently absent
    }
  }
  // For absent items, try to determine how much was printed = sum of positive deltas - sum of cancel deltas in prior revisions
  for (const id of printedItemIds) {
    if (currentIds.has(id)) continue;
    let printed = 0;
    let alreadyCancelled = 0;
    let name = '';
    for (const rev of order.kotRevisions || []) {
      for (const l of rev.lines || []) {
        if (l.itemId !== id) continue;
        if (l.deltaQty > 0) printed += l.deltaQty;
        else alreadyCancelled += -l.deltaQty;
        if (l.name) name = l.name;
      }
    }
    const outstanding = printed - alreadyCancelled;
    if (outstanding > 0) {
      cancelDeltas[id] = outstanding;
      cancelNames[id] = name || id;
    }
  }
  const hasDiff = diffItemIds.length > 0 || Object.keys(cancelDeltas).length > 0;
  return { hasDiff, diffItemIds, diffDeltas, cancelDeltas, cancelNames };
}

export function enqueueKotUpdate(order: Order, opts: Omit<EnqueueOpts, 'updateMode' | 'diffItemIds' | 'diffDeltas' | 'cancelDeltas' | 'cancelNames' | 'force'> = {}) {
  const { hasDiff, diffItemIds, diffDeltas, cancelDeltas, cancelNames } = computeKotDiff(order);
  if (!hasDiff) return null;
  return enqueuePrint(order, 'kot', { ...opts, updateMode: true, diffItemIds, diffDeltas, cancelDeltas, cancelNames });
}

/**
 * Cancel KOT — tells the kitchen that the entire order is CANCELLED and cooking should stop.
 * Shows all items (printed or present in cart) as CANCELLED. Only send this if the
 * previous KOT was already printed (otherwise the kitchen never saw it).
 */
export function enqueueKotCancel(order: Order, opts: Omit<EnqueueOpts, 'updateMode' | 'diffItemIds' | 'diffDeltas' | 'cancelDeltas' | 'cancelNames'> = {}) {
  const cancelDeltas: Record<string, number> = {};
  const cancelNames: Record<string, string> = {};
  for (const it of (order.items || [])) {
    const printed = (it as any).printedQty ?? 0;
    const qty = Math.max(printed, it.quantity || 0);
    if (qty > 0) {
      cancelDeltas[it.id] = qty;
      cancelNames[it.id] = it.name;
    }
  }
  if (Object.keys(cancelDeltas).length === 0) return null;
  return enqueuePrint(order, 'kot', {
    ...opts,
    updateMode: true,
    diffItemIds: [],
    diffDeltas: {},
    cancelDeltas,
    cancelNames,
    force: true,
  });
}



// ============================================================
// Cloud Print Mirror — retained no-op in the offline build (there is no
// so the Windows EXE "Print Server" can print silently when this
// device is just a browser tab (web POS, online order, rider portal).
// Caller passes pre-rendered HTML (already styled for thermal).
// ============================================================
export async function enqueueCloudPrint(args: {
  type: 'kot' | 'receipt' | 'rider' | 'token';
  role: 'counter' | 'kitchen' | 'delivery' | 'display';
  html: string;
  paperSize?: '58mm' | '80mm';
  copies?: number;
  order?: Order;
  source?: 'web' | 'pos' | 'website' | 'rider' | 'kds' | 'system';
  dedupeKey?: string;
}) {
  try {
    const { createCloudPrintJob, isCloudPrintAvailable } = await import('./cloudPrintJobs');
    if (!isCloudPrintAvailable()) return null;
    return await createCloudPrintJob({
      type: args.type,
      role: args.role,
      html: args.html,
      paperSize: args.paperSize || '80mm',
      copies: args.copies,
      orderId: args.order?.id,
      orderNumber: args.order?.orderNumber,
      branchId: args.order?.branchId,
      source: args.source || 'web',
      dedupeKey: args.dedupeKey || (args.order ? `${args.type}-${args.order.id}` : undefined),
    });
  } catch {
    return null;
  }
}
