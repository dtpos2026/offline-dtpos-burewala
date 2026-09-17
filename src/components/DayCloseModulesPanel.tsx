// ============================================================
// DAY CLOSE — MODULE SELECTION
// Client requirement: "on close there should be an option to finish all the
// data that exists, so selecting it zeroes everything out, while some modules stay as they are."
//
// Har module ka apna checkbox. Sirf select kiye hue modules zero
// are affected — the rest remain untouched. Orders are archived
// BEFORE being wiped (reports remain intact).
// ============================================================
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { resetSelectedData, getOrders, getCurrentUser } from '@/lib/store';

interface ModuleDef {
  key: string;
  label: string;
  desc: string;
  /** Is this normally zeroed on a routine day-close? */
  daily?: boolean;
  danger?: boolean;
}

const MODULES: ModuleDef[] = [
  { key: 'orders', label: 'Orders / Sales', desc: 'All bills — moved to archive (reports stay safe)', daily: true },
  { key: 'tables', label: 'Tables status', desc: 'Sab tables free ho jayengi', daily: true },
  { key: 'stockLogs', label: 'Stock Logs', desc: 'Stock in/out ki history', daily: true },
  { key: 'wastages', label: 'Wastage entries', desc: 'Zaya hone ka record', daily: true },
  { key: 'dailyCashCloses', label: 'Cash Close records', desc: 'Rozana cash closing entries' },
  { key: 'transactions', label: 'Transactions (Accounts)', desc: 'Income/expense entries', danger: true },
  { key: 'ledger', label: 'Ledger', desc: 'Party khata entries', danger: true },
  { key: 'parties', label: 'Parties (Suppliers/Customers)', desc: 'Supplier and customer ledgers', danger: true },
  { key: 'customers', label: 'Customers', desc: 'Customer database', danger: true },
  { key: 'receivingEntries', label: 'Receiving / Purchases', desc: 'Kharidari entries', danger: true },
  { key: 'inventory', label: 'Inventory items', desc: 'Poora stock master — DHYAN SE', danger: true },
  { key: 'attendance', label: 'Attendance', desc: 'Staff hazri record' },
  { key: 'advances', label: 'Advances', desc: 'Staff advance record' },
  { key: 'marketingContacts', label: 'Marketing contacts', desc: 'Campaign contacts' },
];

const EXTRAS = [
  { key: '__printQueue', label: 'Print Queue', desc: 'Pending/failed print jobs saaf' },
  { key: '__tokenLedger', label: 'Token Register', desc: 'Tandoor token ki ginti zero' },
];

export default function DayCloseModulesPanel() {
  const [sel, setSel] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    MODULES.forEach(m => { if (m.daily) init[m.key] = true; });
    init['__printQueue'] = true;
    return init;
  });
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setSel(p => ({ ...p, [k]: !p[k] }));
  const selectedKeys = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
  const dataKeys = selectedKeys.filter(k => !k.startsWith('__'));
  const isAdmin = (getCurrentUser()?.role || '') === 'admin';

  const run = async () => {
    if (selectedKeys.length === 0) { toast.error('No module selected'); return; }
    if (!isAdmin) { toast.error('Only Admin can perform a day close'); return; }
    const names = MODULES.filter(m => sel[m.key]).map(m => m.label).concat(EXTRAS.filter(e => sel[e.key]).map(e => e.label));
    const ordersCount = sel['orders'] ? getOrders().length : 0;
    const msg = `DAY CLOSE — these modules will be reset to ZERO:\n\n• ${names.join('\n• ')}\n\n` +
      (sel['orders'] ? `${ordersCount} orders will be moved to the archive (they remain visible in reports).\n\n` : '') +
      `This cannot be undone. Continue?`;
    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      if (dataKeys.length) await resetSelectedData(dataKeys as any);
      if (sel['__printQueue']) {
        try { const { clearAllPendingJobs } = await import('@/lib/printQueue'); clearAllPendingJobs(); } catch {}
        try { localStorage.removeItem('dtpos-print-queue'); } catch {}
      }
      if (sel['__tokenLedger']) {
        try { localStorage.removeItem('dtpos-token-ledger-v1'); } catch {}
      }
      toast.success(`Day Close mukammal — ${names.length} module zero ho gaye`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast.error('Day Close fail: ' + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ k, label, desc, danger }: { k: string; label: string; desc: string; danger?: boolean }) => (
    <label className={`flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer border ${sel[k] ? (danger ? 'bg-destructive/10 border-destructive/40' : 'bg-primary/10 border-primary/40') : 'bg-muted/30 border-transparent'}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4" checked={!!sel[k]} onChange={() => toggle(k)} />
      <div className="min-w-0">
        <p className="text-xs font-bold">{label}{danger && <span className="text-destructive ml-1">⚠</span>}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </label>
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold">Day Close — Module Selection</h3>
          <p className="text-xs text-muted-foreground">
            Only the selected modules will be zeroed out; the rest will remain as they are.
            Orders are archived first — reports for past dates remain intact.
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => { const n: Record<string, boolean> = {}; MODULES.forEach(m => n[m.key] = true); EXTRAS.forEach(e => n[e.key] = true); setSel(n); }}>
          Select All
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSel({})}>Clear All</Button>
        <Button size="sm" variant="outline" onClick={() => { const n: Record<string, boolean> = {}; MODULES.forEach(m => { if (m.daily) n[m.key] = true; }); n['__printQueue'] = true; setSel(n); }}>
          Daily Default
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-1.5">
        {MODULES.map(m => <Row key={m.key} k={m.key} label={m.label} desc={m.desc} danger={m.danger} />)}
        {EXTRAS.map(e => <Row key={e.key} k={e.key} label={e.label} desc={e.desc} />)}
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs font-bold">{selectedKeys.length} module select</span>
        <Button variant="destructive" disabled={busy || selectedKeys.length === 0} onClick={run}>
          <Trash2 className="h-4 w-4 mr-1" /> {busy ? 'Processing…' : 'Day Close — Zero Selected'}
        </Button>
      </div>
      {!isAdmin && <p className="text-[11px] text-destructive font-semibold">Only Admin can perform this action.</p>}
    </Card>
  );
}
