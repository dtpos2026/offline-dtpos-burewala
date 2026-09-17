// Global Print Host — mounted once in AppLayout & Order Taker portal.
// Processes the centralized print queue ONE job at a time so the browser
// never shows overlapping/duplicate print dialogs. Renders the correct
// hidden receipt (KOT or customer receipt) with autoPrint, then advances.
//
// Backward-compat: triggerAutoKot(orderId) still works — it now enqueues a
// KOT job through the centralized print queue.
import { useEffect, useRef, useState } from 'react';
import { getOrders, getSettings } from '@/lib/store';
import {
  getProcessableJobs,
  markPrinting,
  markPrintCommandSent,
  markPrinted,
  markFailed,
  onPrintQueueChange,
  enqueueKot,
  type PrintJob,
} from '@/lib/printQueue';
import KitchenReceipt from '@/components/KitchenReceipt';
import ReceiptPreview from '@/components/ReceiptPreview';
import TokenReceipt from '@/components/TokenReceipt';
import { prewarmDirectPrint } from '@/printing/directPrint';
import { forceExitThermalPrintMode } from '@/lib/thermal-print';
import type { Order } from '@/lib/types';
import { prewarmPrintGuard } from '@/licensing/printGuard';

interface ActiveRender {
  job: PrintJob;
  order: Order;
  copyIndex: number; // 0-based copy currently printing
}

const PRINT_BUFFER_MS = 500; // receipt dialog fallback buffer; KOT waits for native print callback

// ===== Cross-instance lock =====
// Both AppLayout and OrderTakerPortal mount AutoKotPrinter.
// Agar dono ek hi waqt active hon to ek hi job pe race kar ke DOUBLE
// end up silently printing. The lock ensures that at any given time only
// ek instance hi queue process kare.
const HOST_LOCK_KEY = 'dtpos-print-host-lock';
const HOST_LOCK_TTL = 8000; // ms; auto-expire to recover from crashed tabs
function acquireHostLock(hostId: string): boolean {
  try {
    const raw = localStorage.getItem(HOST_LOCK_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id === hostId) {
        localStorage.setItem(HOST_LOCK_KEY, JSON.stringify({ id: hostId, at: Date.now() }));
        return true;
      }
      if (typeof p?.at === 'number' && Date.now() - p.at < HOST_LOCK_TTL) return false;
    }
    localStorage.setItem(HOST_LOCK_KEY, JSON.stringify({ id: hostId, at: Date.now() }));
    return true;
  } catch { return true; }
}
function releaseHostLock(hostId: string) {
  try {
    const raw = localStorage.getItem(HOST_LOCK_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p?.id === hostId) localStorage.removeItem(HOST_LOCK_KEY);
  } catch {}
}

// ===== DOUBLE-PRINT FIX =====
// AutoKotPrinter is mounted in two places (AppLayout + OrderTakerPortal).
// Dono ek hi queue process karte thay → har KOT/receipt DO BAAR chhapti thi.
// localStorage lock race me haar jata tha (dono ne ek hi waqt claim kiya).
// Now a module-level singleton: within one JS context, only the FIRST instance
// becomes the printer host, the rest stay silent — deterministic, race-free.
let ACTIVE_HOST_ID: string | null = null;

export default function AutoKotPrinter() {
  const [active, setActive] = useState<ActiveRender | null>(null);
  const busyRef = useRef(false);
  const processNextRef = useRef<(() => void) | null>(null);
  const myHostId = useRef<string>(`host_${Math.random().toString(36).slice(2, 9)}`);
  const [isPrimaryHost, setIsPrimaryHost] = useState(false);

  // Licence guard ko pehle se garam kar lo — pehle bill par zero intezar.
  useEffect(() => {
    prewarmPrintGuard();
    // Printer mapping ko pehle se load kar lo — pehla direct print bhi bina rukey.
    prewarmDirectPrint();
    // Printer config bhi pehle se garam — pehla bill bhi bina rukey chhape.
    void import('@/components/ReceiptPreview').then(m => m.prewarmReceiptPrinting?.());
  }, []);

  useEffect(() => {
    if (ACTIVE_HOST_ID === null) {
      ACTIVE_HOST_ID = myHostId.current;
      setIsPrimaryHost(true);
      try { console.log('%c[DT-Print]', 'color:#0ea5e9;font-weight:700', 'primary print host', myHostId.current); } catch {}
    } else if (ACTIVE_HOST_ID === myHostId.current) {
      setIsPrimaryHost(true);
    } else {
      setIsPrimaryHost(false);
      try { console.log('%c[DT-Print]', 'color:#f59e0b', 'passive host (double-print guard)', myHostId.current); } catch {}
    }
    return () => {
      if (ACTIVE_HOST_ID === myHostId.current) ACTIVE_HOST_ID = null;
    };
  }, []); // to chain the next job immediately after completion
  // Per-instance host ID — ensures two AutoKotPrinter mounts in the same tab
  // (AppLayout + OrderTakerPortal) don't both acquire the lock and print
  // duplicate KOTs for the same job.
  const hostIdRef = useRef(`host_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    // ===== FIX v1.0.38 (queue jam + double print) =====
    // Pehle yeh guard effect ke AAKHIR me tha (subscription aur 50ms
    // kick-off ke BAAD), aur dependency array khali `[]` thi jabke
    // `isPrimaryHost` doosre effect me set hota hai. Do masle:
    //   1. Pehle run par isPrimaryHost hamesha false hota tha → effect
    //      jaldi return kar jata tha → 2s poll KABHI start nahi hua aur
    //      cleanup bhi register nahi hui (listener leak).
    //   2. Passive hosts phir bhi queue-change par jobs process kar lete
    //      thay → ek hi KOT do dafa chhapti thi.
    // Ab guard sab se upar hai aur effect isPrimaryHost par re-run hota hai.
    if (!isPrimaryHost) return;

    let cancelled = false;
    const hostId = hostIdRef.current;

    const advance = () => {
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostId);
      // process the next job on the next tick
      setTimeout(processNext, 0);
    };

    const processNext = () => {
      if (cancelled || busyRef.current) return;
      if (!acquireHostLock(hostId)) return; // another instance is processing
      const jobs = getProcessableJobs();
      if (jobs.length === 0) { releaseHostLock(hostId); return; }
      // Silent KOT Mode: hold all auto KOT jobs in queue (user must manually release)
      const silent = !!getSettings().kotSilentMode;
      // FIX: Silent-KOT hold should only apply to AUTO jobs. The user's explicit
      // \"Send Kitchen\" / reprint (manual flag) HAMESHA print ho.
      const allowedJobs = silent ? jobs.filter(j => j.printType !== 'kot' || j.manual) : jobs;
      // Payment must feel immediate: when Pay queued a receipt and KOT together,
      // send the complete paid receipt first. The kitchen job follows separately.
      const job = allowedJobs.find(j => j.printType === 'receipt') || allowedJobs[0];
      if (!job) { releaseHostLock(hostId); return; }
      const order = getOrders().find(o => o.id === job.orderId);
      if (!order) {
        // order missing — mark printed to drop it from the queue
        markPrinted(job.id);
        releaseHostLock(hostId);
        setTimeout(processNext, 0);
        return;
      }
      busyRef.current = true;
      markPrinting(job.id);
      // Render the selected receipt/KOT/token component first. The hidden worker
      // converts that exact design to ESC/POS raster data, so fast printing never
      // bypasses templates, compact mode, logos, or Urdu fonts.
      setActive({ job, order, copyIndex: 0 });
    };

    const unsub = onPrintQueueChange(() => {
      if (!busyRef.current) processNext();
    });
    // kick off in case there are pending jobs at mount
    const t = setTimeout(processNext, 0);
    processNextRef.current = processNext;
    const poll = setInterval(() => { if (!busyRef.current) processNext(); }, 600); // 5s→2s→0.6s: removes the long gap before KOT after receipt

    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(poll);
      unsub();
      processNextRef.current = null;
    };
  }, [isPrimaryHost]);

  // ===== FIX (blank/no receipt): pehle receipts ko 500ms timer pe printed
  // mark kar ke component UNMOUNT kar diya jata tha — jabke asal print
  // (settings load + render delay ke baad) ~600ms+ pe fire hota tha. Portal
  // already removed from the DOM → the printer would get a blank page or nothing at all.
  // Ab receipt bhi KOT ki tarah onAutoPrintComplete callback ka intezar
  // does this. A 20s safety timeout prevents the queue from getting stuck. =====
  useEffect(() => {
    if (!active) return;
    // Stamp the moment print command is fired (first copy only)
    if (active.copyIndex === 0) {
      try { markPrintCommandSent(active.job.id); } catch {}
    }
    // ===== FIX (queue-jam / "everything prints on restart"): safety
    // timeout now applies to BOTH KOT + receipt. Previously the KOT callback would
    // miss ho jata to busyRef hamesha true → POORI queue jam → har naya
    // never fire and the print would stay pending, only flushing on restart. =====
    const safety = setTimeout(() => {
      markFailed(active.job.id, `${active.job.printType} print timeout (no completion callback)`);
      // A job that never called back may also have left the POS in print
      // mode (white screen, UI hidden). Releasing the queue is not enough —
      // give the cashier their screen back too.
      forceExitThermalPrintMode();
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostIdRef.current);
      setTimeout(() => { if (!busyRef.current) processNextRef.current?.(); }, 200);
    }, 20000);
    // ===== FIX (parallel-host race): keep the lock alive while a job runs —
    // TTL is 8s; during a long job a second host would jump in and print at the
    // SAME time (corrupt/blank). Every 3s heartbeat = only one printer host at a time. =====
    const heartbeat = setInterval(() => {
      try { localStorage.setItem('dtpos-print-host-lock', JSON.stringify({ id: hostIdRef.current, at: Date.now() })); } catch {}
    }, 3000);
    return () => { clearTimeout(safety); clearInterval(heartbeat); };
  }, [active]);

  const handleReceiptComplete = (result: { success: boolean; error?: string }) => {
    if (!active) return;
    if (!result.success) {
      markFailed(active.job.id, result.error || 'Receipt print failed');
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostIdRef.current);
      setTimeout(() => { if (!busyRef.current) processNextRef.current?.(); }, 0);
      return;
    }
    const totalCopies = Math.max(1, active.job.copies || 1);
    if (active.copyIndex + 1 < totalCopies) {
      setActive(a => (a ? { ...a, copyIndex: a.copyIndex + 1 } : a));
    } else {
      markPrinted(active.job.id);
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostIdRef.current);
      setTimeout(() => { if (!busyRef.current) processNextRef.current?.(); }, 0); // chain straight into the next job
    }
  };

  const handleKotComplete = (result: { success: boolean; error?: string }) => {
    if (!active) return;
    if (!result.success) {
      markFailed(active.job.id, result.error || 'KOT print failed');
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostIdRef.current);
      return;
    }
    const totalCopies = Math.max(1, active.job.copies || 1);
    if (active.copyIndex + 1 < totalCopies) {
      setActive(a => (a ? { ...a, copyIndex: a.copyIndex + 1 } : a));
    } else {
      markPrinted(active.job.id);
      busyRef.current = false;
      setActive(null);
      releaseHostLock(hostIdRef.current);
      setTimeout(() => { if (!busyRef.current) processNextRef.current?.(); }, 0); // chain straight into the next job
    }
  };

  if (!active) return null;
  const settings = getSettings();
  const isToken = active.job.printType === 'token';
  const isReceipt = active.job.printType === 'receipt' || active.job.printType === 'rider';

  return (
    <div style={{ position: 'fixed', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
      {isToken ? (
        <TokenReceipt
          key={`${active.job.id}-${active.copyIndex}`}
          order={active.order}
          settings={settings}
          autoPrint
          onAutoPrintComplete={handleReceiptComplete}
          printerOverride={active.job.printerId}
        />
      ) : isReceipt ? (
        <ReceiptPreview
          key={`${active.job.id}-${active.copyIndex}`}
          order={active.order}
          settings={settings}
          autoPrint
          showPrintButton={false}
          onAutoPrintComplete={handleReceiptComplete}
          printerOverride={active.job.printerId}
        />
      ) : (
        <KitchenReceipt
          key={`${active.job.id}-${active.copyIndex}`}
          order={active.order}
          settings={settings}
          printerOverride={active.job.printerId}
          autoPrint
          autoPrintDelayMs={0}
          showPrintButton={false}
          onAutoPrintComplete={handleKotComplete}
          updateMode={active.job.updateMode}
          diffItemIds={active.job.diffItemIds}
          diffDeltas={active.job.diffDeltas}
          cancelDeltas={active.job.cancelDeltas}
          cancelNames={active.job.cancelNames}
        />
      )}
    </div>
  );
}

/** Backward-compatible helper — enqueues a KOT through the central queue. */
export function triggerAutoKot(orderId: string) {
  try {
    const order = getOrders().find(o => o.id === orderId);
    if (order) enqueueKot(order);
  } catch {}
}
