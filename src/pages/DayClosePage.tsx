// ============================================================
// DAY CLOSE — the focused end-of-day screen.
//
// Day Close used to live at the bottom of Settings → Advanced, below every
// other settings group, so closing the day meant scrolling through the whole
// Settings page. This screen opens straight onto the two workflows:
//
//   1. DAY CLOSE   print the shift report, then close the business day
//                  (admin confirms; a cashier with permission can request it)
//   2. RESET SALE  zero selected modules (DayCloseModulesPanel)
//
// The workflows themselves are the existing ones, moved here unchanged:
// archive every bill first, then clear by status per the admin's settings,
// reset tables and the order number if chosen, write the audit entry.
// ============================================================
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CalendarCheck2, Eraser, FileBarChart2, Moon, Printer, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DayCloseModulesPanel from '@/components/DayCloseModulesPanel';
import { printShiftReport } from '@/components/ShiftReport';
import { getSettings, saveSettings, getTables, saveTable, getOrders, deleteOrder, exportData, getCurrentUser } from '@/lib/store';
import {
  getDayCloseConfig, saveDayCloseConfig, getPendingDayCloseRequests, addPendingDayCloseRequest,
  clearPendingDayCloseRequests, clearedByDayClose, dayCloseGroup, previewDayClose,
  type DayCloseConfig, type PendingDayCloseRequest,
} from '@/lib/dayCloseConfig';
import { userHasAccess } from '@/lib/permissions';
import { archiveOrders } from '@/lib/orderArchive';
import { saveBackupToCloud, logDayCloseEvent } from '@/lib/dayCloseBackup';
import { isCloudConfigured } from '@/lib/offlineNoCloud';

type Section = 'close' | 'reset';

const CLEAR_OPTIONS: { k: keyof DayCloseConfig; label: string }[] = [
  { k: 'clearPaidOrders', label: 'Paid / closed bills (today\'s sales)' },
  { k: 'clearRunningHoldBills', label: 'Running and HOLD — UNPAID bills' },
  { k: 'clearVoidComp', label: 'Void / complimentary / cancelled bills' },
  { k: 'clearCreditOrders', label: 'Credit orders' },
  { k: 'resetTables', label: 'Set every table to Free' },
  { k: 'resetOrderNumber', label: 'Restart the daily order number' },
  { k: 'autoBackup', label: 'Download a JSON backup first (recommended)' },
];

const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eod = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export default function DayClosePage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const canDayClose = isAdmin || userHasAccess(currentUser, 'day-close');

  const [section, setSection] = useState<Section>('close');
  const [dcFrom, setDcFrom] = useState('');
  const [dcTo, setDcTo] = useState('');
  const [startingCash, setStartingCash] = useState<number>(() => Number((getSettings() as any).startingCash || 0));
  const [showDayClose, setShowDayClose] = useState(false);
  const [dayCloseCfg, setDayCloseCfg] = useState<DayCloseConfig>(() => getDayCloseConfig());
  const [pendingRequests, setPendingRequests] = useState<PendingDayCloseRequest[]>(() => getPendingDayCloseRequests());
  const [ordersVersion, setOrdersVersion] = useState(0);

  const orders = useMemo(() => getOrders(), [ordersVersion, showDayClose]);
  const openBills = orders.filter(o => o.status === 'running' || o.status === 'hold' || o.status === 'partial');
  const heldBills = orders.filter(o => o.status === 'hold');
  const preview = useMemo(() => previewDayClose(orders, dayCloseCfg), [orders, dayCloseCfg]);

  // The drawer float used by the shift report. It used to be typed into the
  // Settings page state and lost unless another Settings tab was saved.
  const saveStartingCash = (v: number) => {
    const value = Number.isFinite(v) && v >= 0 ? v : 0;
    setStartingCash(value);
    saveSettings({ ...getSettings(), startingCash: value } as any);
  };

  const printReport = async (from: Date, to: Date, label: string) => {
    toast.info(`Printing the ${label} shift report…`);
    const r = await printShiftReport({ from, to, label, startingCash });
    if (r.success) toast.success('Shift report sent to the printer.');
    else toast.error('The shift report could not be printed: ' + (r.error || 'unknown error'));
  };

  const printPreset = (k: 'today' | 'yesterday' | 'week' | 'month' | 'year') => {
    const now = new Date();
    let from = sod(now), to = eod(now), label = 'Today';
    if (k === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); from = sod(y); to = eod(y); label = 'Yesterday'; }
    if (k === 'week') { const f = new Date(now); f.setDate(f.getDate() - 6); from = sod(f); label = 'Last 7 Days'; }
    if (k === 'month') { from = sod(new Date(now.getFullYear(), now.getMonth(), 1)); label = 'This Month'; }
    if (k === 'year') { from = sod(new Date(now.getFullYear(), 0, 1)); label = 'This Year'; }
    void printReport(from, to, label);
  };

  // ===== Day Close — moved unchanged from the Settings page =====
  const handleDayClose = async () => {
    if (!isAdmin) {
      toast.error('Only Admin can finalize Day Close');
      return;
    }
    const cfg = dayCloseCfg;
    const closeId = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dateStr = new Date().toISOString().slice(0, 10);
    let backupBytes = 0;
    let cloudOk = false;

    // 1. Backup snapshot — local download (admin safety) + cloud copy when a cloud is configured
    if (cfg.autoBackup) {
      const backupJson = exportData();
      backupBytes = new TextEncoder().encode(backupJson).length;

      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `day-close-backup-${dateStr}-${closeId.slice(-6)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      try {
        cloudOk = await saveBackupToCloud(backupJson, `${dateStr}__${closeId.slice(-6)}`);
      } catch { cloudOk = false; }
    }

    // 2. Always archive the full snapshot so admin can view weekly/monthly history.
    const all = getOrders();
    archiveOrders(all);

    // 3. Conditionally delete by status group, per admin's checkboxes.
    let cPaid = 0, cRun = 0, cVoid = 0, cCredit = 0;
    all.forEach(o => {
      if (!clearedByDayClose(o.status, cfg)) return;
      const g = dayCloseGroup(o.status);
      if (g === 'paid') cPaid++;
      else if (g === 'runningHold') cRun++;
      else if (g === 'voidComp') cVoid++;
      else if (g === 'credit') cCredit++;
      deleteOrder(o.id);
    });

    // 4. Reset tables (optional)
    if (cfg.resetTables) {
      getTables().forEach(t => {
        if (t.status !== 'free') saveTable({ ...t, status: 'free', currentOrderId: undefined });
      });
    }

    // 5. Reset daily order counter (optional)
    if (cfg.resetOrderNumber) {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('dt-pos-order-number') || k.includes('order-counter')) localStorage.removeItem(k);
        });
      } catch { /* ignore */ }
    }

    // 6. Audit log — who closed, what cleared, backup status.
    try {
      await logDayCloseEvent({
        id: closeId,
        closedAt: new Date().toISOString(),
        closedByUid: currentUser?.id || 'unknown',
        closedByName: currentUser?.name || 'Unknown',
        orderCount: all.length,
        cleared: { paid: cPaid, runningHold: cRun, voidComp: cVoid, credit: cCredit },
        config: { ...cfg } as any,
        backupBytes,
      });
    } catch { /* audit is best effort */ }

    // 7. Clear pending cashier requests — admin has now actioned them.
    clearPendingDayCloseRequests();
    setPendingRequests([]);

    setShowDayClose(false);
    setOrdersVersion(v => v + 1);
    const backupMsg = !cfg.autoBackup
      ? ''
      : !isCloudConfigured()
        ? ' Backup downloaded to this computer.'
        : cloudOk ? ' Backup downloaded and copied to the cloud.' : ' Backup downloaded; the cloud copy failed.';
    toast.success(`Day closed. ${cPaid + cRun + cVoid + cCredit} bills cleared; every bill is kept in the archive.${backupMsg}`);
  };

  const handleRequestDayClose = () => {
    if (!currentUser) { toast.error('Login required'); return; }
    addPendingDayCloseRequest({ by: currentUser.id, byName: currentUser.name });
    setPendingRequests(getPendingDayCloseRequests());
    toast.success('Day Close request sent — the admin will confirm it.');
  };

  const handleSaveDayCloseConfig = () => {
    saveDayCloseConfig(dayCloseCfg);
    toast.success('Day Close settings saved');
  };

  const handleDismissRequest = (id: string) => {
    const remaining = getPendingDayCloseRequests().filter(r => r.id !== id);
    clearPendingDayCloseRequests();
    remaining.forEach(r => addPendingDayCloseRequest({ by: r.by, byName: r.byName, note: r.note, at: r.at }));
    setPendingRequests(getPendingDayCloseRequests());
  };

  const setAll = (on: boolean) => {
    const next = { ...dayCloseCfg };
    (['clearPaidOrders', 'clearRunningHoldBills', 'clearVoidComp', 'clearCreditOrders', 'resetTables', 'resetOrderNumber'] as const)
      .forEach(k => { next[k] = on; });
    if (on) next.autoBackup = true;
    setDayCloseCfg(next);
    saveDayCloseConfig(next);
    toast.success(on ? 'Every option selected' : 'Nothing will be cleared');
  };

  const businessDate = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Moon className="h-6 w-6" /></div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Day Close</h1>
          <p className="text-xs text-muted-foreground">{businessDate} · {currentUser?.name || '—'} ({currentUser?.role || 'guest'}) · {isAdmin ? 'Full control' : canDayClose ? 'Can request a day close' : 'No Day Close access'}</p>
        </div>
      </div>

      {/* The two workflows, both visible at once */}
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Day Close sections">
        <SectionCard
          active={section === 'close'} onClick={() => setSection('close')} n={1}
          title="Day Close" icon={<CalendarCheck2 className="h-6 w-6" />}
          desc="Print the shift report and close the business day."
        />
        <SectionCard
          active={section === 'reset'} onClick={() => setSection('reset')} n={2}
          title="Reset Sale" icon={<Eraser className="h-6 w-6" />}
          desc="Reset selected modules — sales, tables, stock logs and more — to zero."
        />
      </div>

      {section === 'close' && (
        <div className="space-y-4" role="tabpanel" aria-label="Day Close">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Tile label="Open bills" value={openBills.length} tone={openBills.length ? 'warn' : 'ok'} />
            <Tile label="On HOLD — UNPAID" value={heldBills.length} tone={heldBills.length ? 'warn' : 'ok'} />
            <Tile label="Bills in the live list" value={orders.length} />
            <Tile label="Cashier requests" value={pendingRequests.length} tone={pendingRequests.length ? 'warn' : 'ok'} />
          </div>
          {openBills.length > 0 && (
            <div className="rounded-xl border border-status-warning/50 bg-status-warning/10 p-3 text-sm flex flex-wrap items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              <span>{openBills.length} bill{openBills.length === 1 ? ' is' : 's are'} still open{heldBills.length ? ` (${heldBills.length} on HOLD — UNPAID)` : ''}. Collect payment or check them before closing the day.</span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => navigate('/retray')}>Open Retrieve</Button>
            </div>
          )}

          {/* Step 1 — report */}
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-extrabold flex items-center gap-2"><FileBarChart2 className="h-4 w-4 text-primary" /> Step 1 · Shift report</h2>
            <p className="text-xs text-muted-foreground">Sales summary by category, product and payment method, on the thermal printer.</p>
            <div className="flex flex-wrap gap-1.5">
              {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['year', 'This year']] as const).map(([k, lbl]) => (
                <Button key={k} size="sm" variant={k === 'today' ? 'default' : 'outline'} onClick={() => printPreset(k)}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> {lbl}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => navigate('/sales-report')}>Full sales report</Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap border-t pt-2">
              <span className="text-xs font-medium text-muted-foreground">Custom dates:</span>
              <Input type="date" className="h-8 w-40" value={dcFrom} onChange={e => setDcFrom(e.target.value)} aria-label="From date" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" className="h-8 w-40" value={dcTo} onChange={e => setDcTo(e.target.value)} aria-label="To date" />
              <Button size="sm" variant="outline" disabled={!dcFrom} onClick={() => {
                void printReport(sod(new Date(dcFrom)), eod(new Date(dcTo || dcFrom)), `${dcFrom} → ${dcTo || dcFrom}`);
              }}>Print</Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="dc-float" className="text-xs font-medium text-muted-foreground">Starting cash (drawer float)</label>
              <Input id="dc-float" type="number" min={0} className="h-8 w-32" value={startingCash}
                onChange={e => setStartingCash(Number(e.target.value))}
                onBlur={e => saveStartingCash(Number(e.target.value))} />
              <span className="text-[11px] text-muted-foreground">Saved when you leave the field.</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Reports for past dates stay available after a Day Close — every bill goes to the permanent archive.</p>
          </div>

          {/* Step 2 — what gets cleared (admin) */}
          {isAdmin && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-extrabold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Step 2 · What Day Close clears</h2>
              <p className="text-[11px] text-muted-foreground">Only the ticked groups leave the live lists. The archive (admin history) always keeps every bill.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAll(true)}>Select all</Button>
                <Button size="sm" variant="outline" onClick={() => setAll(false)}>Clear all</Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {CLEAR_OPTIONS.map(row => (
                  <label key={row.k} className="flex items-center gap-2 text-xs cursor-pointer rounded-md border px-3 py-2">
                    <Checkbox checked={dayCloseCfg[row.k]} onCheckedChange={(v) => setDayCloseCfg(c => ({ ...c, [row.k]: !!v }))} />
                    <span>{row.label}</span>
                  </label>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={handleSaveDayCloseConfig}>Save Day Close settings</Button>
              <p className="text-[10px] text-muted-foreground">Which cashiers may request a Day Close is set with the "Day Close" permission in Users &amp; Roles.</p>
            </div>
          )}

          {isAdmin && pendingRequests.length > 0 && (
            <div className="bg-status-warning/10 border border-status-warning/40 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-bold">Cashier Day Close requests ({pendingRequests.length})</h2>
              {pendingRequests.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded p-2">
                  <span><b>{r.byName}</b> — {new Date(r.at).toLocaleString()}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleDismissRequest(r.id)}>Dismiss</Button>
                </div>
              ))}
            </div>
          )}

          {/* Step 3 — close */}
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-extrabold flex items-center gap-2"><Moon className="h-4 w-4 text-primary" /> Step 3 · Close the day</h2>
            {canDayClose ? (
              isAdmin ? (
                <Button size="lg" className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-bold" onClick={() => { setOrdersVersion(v => v + 1); setShowDayClose(true); }}>
                  Close the day (Admin)
                </Button>
              ) : (
                <>
                  <Button size="lg" className="w-full text-sm font-bold" onClick={handleRequestDayClose}>Request Day Close (the admin confirms)</Button>
                  <p className="text-[11px] text-muted-foreground text-center">Nothing is cleared by a request. The admin confirms it here, and only then are bills cleared.</p>
                </>
              )
            ) : (
              <p className="text-xs text-center text-muted-foreground">You do not have Day Close access. Ask the admin for the "Day Close" permission.</p>
            )}
          </div>
        </div>
      )}

      {section === 'reset' && (
        <div className="space-y-3" role="tabpanel" aria-label="Reset Sale">
          <DayCloseModulesPanel />
        </div>
      )}

      <Dialog open={showDayClose} onOpenChange={setShowDayClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Confirm Day Close
          </DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">All {preview.total} bills are copied to the archive first. Then these leave the live lists:</p>
            <ul className="space-y-1 text-xs">
              <li>Paid bills: <b>{preview.paid}</b></li>
              <li>Running and HOLD — UNPAID bills: <b>{preview.runningHold}</b></li>
              <li>Void / complimentary / cancelled: <b>{preview.voidComp}</b></li>
              <li>Credit orders: <b>{preview.credit}</b></li>
              <li>Staying in the live lists: <b>{preview.kept}</b></li>
            </ul>
            {preview.unpaidCleared > 0 && (
              <p className="rounded-md border border-status-warning/50 bg-status-warning/10 p-2 text-xs font-semibold">
                {preview.unpaidCleared} unpaid bill{preview.unpaidCleared === 1 ? '' : 's'}{preview.heldCleared ? ` (${preview.heldCleared} on HOLD — UNPAID)` : ''} will be removed from Retrieve and can no longer be paid there.
                Untick "Running and HOLD — UNPAID bills" in Step 2 to keep them open.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {dayCloseCfg.resetTables ? 'Every table is set to Free. ' : ''}
              {dayCloseCfg.resetOrderNumber ? 'The daily order number restarts. ' : ''}
              {dayCloseCfg.autoBackup ? 'A JSON backup is downloaded first.' : 'No backup is downloaded.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDayClose(false)}>Cancel</Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDayClose}>
                Confirm Day Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionCard({ active, onClick, n, title, desc, icon }: { active: boolean; onClick: () => void; n: number; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <button
      type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all ${active ? 'border-primary bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg' : 'border-primary/25 bg-card hover:border-primary'}`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${active ? 'bg-primary-foreground/15' : 'bg-primary/10 text-primary'}`}>{icon}</span>
      <span>
        <span className="block text-[11px] font-extrabold uppercase tracking-wider opacity-80">{n}</span>
        <span className="block text-lg font-extrabold leading-tight">{title}</span>
        <span className={`block text-xs mt-0.5 ${active ? 'opacity-90' : 'text-muted-foreground'}`}>{desc}</span>
      </span>
    </button>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'warn' ? 'border-status-warning/50 bg-status-warning/10' : 'bg-card'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}
