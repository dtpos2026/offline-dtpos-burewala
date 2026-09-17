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
