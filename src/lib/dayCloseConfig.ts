// Day Close configuration + pending-request workflow.
// Admin controls *what* gets cleared via checkboxes. Cashier (with permission)
// can only *request* a day close — actual deletion happens when admin confirms.
import { getTenantId } from './tenant';

export interface DayCloseConfig {
  clearPaidOrders: boolean;       // paid / closed bills
  clearRunningHoldBills: boolean; // running + hold (unpaid)
  clearVoidComp: boolean;         // void / complimentary / cancelled
  clearCreditOrders: boolean;     // credit_pending / credit_received (udhaar)
  resetTables: boolean;           // mark all tables free
  resetOrderNumber: boolean;      // reset daily order counter
  autoBackup: boolean;            // download JSON before clearing
}

export interface PendingDayCloseRequest {
  id: string;
  by: string;        // user id
  byName: string;
  at: string;        // ISO timestamp
  note?: string;
}

const DEFAULT_CONFIG: DayCloseConfig = {
  clearPaidOrders: true,
  clearRunningHoldBills: true,
  clearVoidComp: false,
  clearCreditOrders: false,
  resetTables: true,
  resetOrderNumber: true,
  autoBackup: true,
};

const cfgKey = () => `dt-pos-dayclose-config::${getTenantId()}`;
const reqKey = () => `dt-pos-dayclose-pending::${getTenantId()}`;

export function getDayCloseConfig(): DayCloseConfig {
  try {
    const raw = localStorage.getItem(cfgKey());
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveDayCloseConfig(cfg: DayCloseConfig) {
  try { localStorage.setItem(cfgKey(), JSON.stringify(cfg)); } catch {}
}

export function getPendingDayCloseRequests(): PendingDayCloseRequest[] {
  try {
    const raw = localStorage.getItem(reqKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addPendingDayCloseRequest(req: Omit<PendingDayCloseRequest, 'id' | 'at'> & { at?: string }) {
  const list = getPendingDayCloseRequests();
  list.push({
    id: Math.random().toString(36).slice(2, 10),
    at: req.at || new Date().toISOString(),
    by: req.by,
    byName: req.byName,
    note: req.note,
  });
  try { localStorage.setItem(reqKey(), JSON.stringify(list)); } catch {}
}

export function clearPendingDayCloseRequests() {
  try { localStorage.removeItem(reqKey()); } catch {}
}

// ---------- which bills a Day Close clears ----------
// The grouping the Day Close handler has always used, in one place so the
// confirmation can say exactly what will happen before anything is cleared.
// Every bill is archived first; "cleared" means removed from the live lists.
// Bills in no group (partially paid, awaiting approval, rejected) are never
// cleared by a Day Close.
export type DayCloseGroup = 'paid' | 'runningHold' | 'voidComp' | 'credit' | 'kept';

export function dayCloseGroup(status: string): DayCloseGroup {
  if (status === 'paid') return 'paid';
  if (status === 'running' || status === 'hold') return 'runningHold';
  if (status === 'void' || status === 'complimentary' || status === 'cancelled') return 'voidComp';
  if (status === 'credit_pending' || status === 'credit_received') return 'credit';
  return 'kept';
}

export function clearedByDayClose(status: string, cfg: DayCloseConfig): boolean {
  switch (dayCloseGroup(status)) {
    case 'paid': return cfg.clearPaidOrders;
    case 'runningHold': return cfg.clearRunningHoldBills;
    case 'voidComp': return cfg.clearVoidComp;
    case 'credit': return cfg.clearCreditOrders;
    default: return false;
  }
}

export interface DayClosePreview {
  paid: number; runningHold: number; voidComp: number; credit: number;
  /** Cleared bills that were still unpaid (running or HOLD — UNPAID). */
  unpaidCleared: number;
  heldCleared: number;
  /** Bills that stay in the live lists. */
  kept: number;
  total: number;
}

export function previewDayClose(orders: { status: string }[], cfg: DayCloseConfig): DayClosePreview {
  const p: DayClosePreview = { paid: 0, runningHold: 0, voidComp: 0, credit: 0, unpaidCleared: 0, heldCleared: 0, kept: 0, total: orders.length };
  for (const o of orders) {
    if (!clearedByDayClose(o.status, cfg)) { p.kept++; continue; }
    const g = dayCloseGroup(o.status) as Exclude<DayCloseGroup, 'kept'>;
    p[g]++;
    if (g === 'runningHold') {
      p.unpaidCleared++;
      if (o.status === 'hold') p.heldCleared++;
    }
  }
  return p;
}
