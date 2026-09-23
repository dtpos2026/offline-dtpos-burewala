import { useEffect, useState, useMemo } from 'react';
import { getOrders, deleteOrder, getSettings, getBranches, getCurrentBranchId, logOrderReprint } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { FileText, AlertTriangle, ChevronDown, ChevronUp, Printer, Trash2, Building2, User as UserIcon } from 'lucide-react';
import { Order } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReceiptPreview from '@/components/ReceiptPreview';
import { toast } from 'sonner';
import { getCurrentScope, orderBelongsTo, listCashierUsers } from '@/lib/cashierScope';
import DateTimeRangeFilter, { DateTimeRange } from '@/components/DateTimeRangeFilter';
import { getCurrentBusinessDay } from '@/lib/businessDay';
import { printThermalReport, reportMoney, reportTime, type ReportBlock } from '@/printing/thermalReport';

export default function ReportsPage() {
  const [orders, setOrders] = useState(() => getOrders());
  const [range, setRange] = useState<DateTimeRange>(() => {
    const bd = getCurrentBusinessDay();
    return { startMs: bd.startMs, endMs: bd.endMs, preset: 'today' };
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reprintOrder, setReprintOrder] = useState<Order | null>(null);
  const settings = getSettings();

  const scope = useMemo(() => getCurrentScope(), []);
  const cashierUsers = useMemo(() => scope.restrict ? [] : listCashierUsers(), [scope.restrict]);
  const [cashierFilter, setCashierFilter] = useState<string>(scope.restrict ? scope.userId : 'all');

  const allBranches = getBranches().filter(b => b.isActive);
  const activeBranchId = getCurrentBranchId();
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const currentBranchName = allBranches.find(b => b.id === branchFilter)?.name;

  const refresh = () => setOrders(getOrders());


  useEffect(() => {
    const syncOrders = () => setOrders(getOrders());
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncOrders();
    };

    window.addEventListener('focus', syncOrders);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', syncOrders);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const filterByBranch = (list: Order[]) =>
    allBranches.length === 0 || branchFilter === 'all'
      ? list
      : list.filter(o => !o.branchId || o.branchId === branchFilter);

  const filterByCashier = (list: Order[]) =>
    cashierFilter === 'all' ? list : list.filter(o => orderBelongsTo(o, cashierFilter));

  const filterByDate = (list: Order[]) =>
    list.filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= range.startMs && t < range.endMs;
    });

  const baseFilter = (list: Order[]) => filterByDate(filterByCashier(filterByBranch(list)));
  const deps = [orders, range.startMs, range.endMs, branchFilter, cashierFilter];

  const paidOrders = useMemo(() => baseFilter(orders.filter(o => o.status === 'paid')), deps);
  const runningOrders = useMemo(() => baseFilter(orders.filter(o => o.status === 'running')), deps);
  const voidOrders = useMemo(() => baseFilter(orders.filter(o => o.status === 'void')), deps);
  const cancelledOrders = useMemo(() => baseFilter(orders.filter(o => o.status === 'cancelled')), deps);
  const compOrders = useMemo(() => baseFilter(orders.filter(o => o.status === 'complimentary')), deps);
  const creditOrders = useMemo(() => baseFilter(orders.filter(o => (o as any).status === 'credit' || o.status === 'credit_received')), deps);

  // Admin: per-cashier breakdown (only meaningful when "All cashiers" is selected).
  const cashierBreakdown = useMemo(() => {
    if (scope.restrict || cashierFilter !== 'all') return [];
    const map = new Map<string, { name: string; count: number; total: number; cash: number }>();
    for (const o of paidOrders) {
      const id = (o as any).cashierId || (o as any).createdBy || 'unknown';
      const name = (o as any).cashierName || 'Unknown';
      const e = map.get(id) || { name, count: 0, total: 0, cash: 0 };
      e.count += 1;
      e.total += o.grandTotal || 0;
      if ((o.paymentMethod || 'cash') === 'cash') e.cash += o.grandTotal || 0;
      map.set(id, e);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [paidOrders, scope.restrict, cashierFilter]);


  const totalSales = paidOrders.reduce((s, o) => s + o.grandTotal, 0);
  const diningSales = paidOrders.filter(o => o.orderType === 'dining').reduce((s, o) => s + o.grandTotal, 0);
  const takeawaySales = paidOrders.filter(o => o.orderType === 'takeaway').reduce((s, o) => s + o.grandTotal, 0);
  const deliverySales = paidOrders.filter(o => o.orderType === 'delivery').reduce((s, o) => s + o.grandTotal, 0);
  // Source breakdown
  const bySource = (src: string) => paidOrders.filter(o => (o.source || 'pos') === src);
  const websiteOrders = bySource('website');
  const otOrders = bySource('order_taker');
  const posOrders = paidOrders.filter(o => !o.source || o.source === 'pos');
  const websiteSales = websiteOrders.reduce((s, o) => s + o.grandTotal, 0);
  const otSales = otOrders.reduce((s, o) => s + o.grandTotal, 0);
  const posSales = posOrders.reduce((s, o) => s + o.grandTotal, 0);
  const unpaidCount = runningOrders.length;
  const unpaidAmount = runningOrders.reduce((s, o) => s + o.grandTotal, 0);
  const voidAmount = voidOrders.reduce((s, o) => s + o.grandTotal, 0);
  const cancelledAmount = cancelledOrders.reduce((s, o) => s + o.grandTotal, 0);
  const compAmount = compOrders.reduce((s, o) => s + o.grandTotal, 0);
  const creditAmount = creditOrders.reduce((s, o) => s + o.grandTotal, 0);
  const totalReprints = paidOrders.reduce((s, o) => s + (o.reprintCount || 0), 0);

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this bill?')) return;
    deleteOrder(id);
    refresh();
    toast.success('Bill deleted');
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const logoHtml = settings.logo ? `<div style="text-align:center;margin-bottom:10px"><img src="${settings.logo}" style="max-height:60px;object-fit:contain" /><h1 style="margin:5px 0 2px;font-size:20px">${settings.name}</h1><p style="margin:0;font-size:12px;color:#555">${settings.address || ''}</p><p style="margin:2px 0;font-size:12px">${settings.phone1 || ''}${settings.phone2 ? ' | ' + settings.phone2 : ''}</p></div>` : `<h2 style="text-align:center">${settings.name}</h2>`;
    w.document.write(`<html><head><title>Sales Report</title>
      <style>body{font-family:Arial;padding:20px;font-size:13px}table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:12px}th{background:#800020;color:#fff}</style></head>
      <body>${logoHtml}
      <h3 style="text-align:center;margin:10px 0 5px">Sales Report</h3>
      <p style="text-align:center;font-size:12px;color:#555">Period: ${new Date(range.startMs).toLocaleString('en-PK')} to ${new Date(range.endMs).toLocaleString('en-PK')}</p>
      <p>Total Sales: PKR ${totalSales.toLocaleString()} (${paidOrders.length} orders)</p>
      <table><tr><th>#</th><th>Customer</th><th>Phone</th><th>Type</th><th>Payment</th><th>Account</th><th>Items</th><th>Total</th><th>Date</th></tr>
      ${paidOrders.map(o => `<tr><td>${o.orderNumber}</td><td>${o.customer?.name || '—'}</td><td>${o.customer?.phone || '—'}</td><td>${o.orderType}</td><td>${(o.paymentMethod || 'cash').toUpperCase()}</td><td>${o.paymentAccountName || ((o.paymentMethod || 'cash') === 'cash' ? 'Cash Drawer' : '—')}</td><td>${o.items.length}</td><td>${o.grandTotal.toLocaleString()}</td><td>${new Date(o.createdAt).toLocaleString()}</td></tr>`).join('')}
      </table></body></html>`);
    w.document.close();
    w.print();
  };

  // 80mm POS Summary / Detailed — the shared thermal report layout, printed
  // on the counter printer at its real content width (see thermalReport.ts).
  const printPosReport = async (includeOrders: boolean) => {
    const money = (n: number) => reportMoney(n);
    const byPay = new Map<string, number>();
    for (const o of paidOrders) {
      const k = (o.paymentMethod || 'cash').toUpperCase();
      byPay.set(k, (byPay.get(k) || 0) + (o.grandTotal || 0));
    }
    const count = (t: string) => paidOrders.filter(o => o.orderType === t).length;
    const blocks: ReportBlock[] = [
      { kind: 'section', title: 'Sales' },
      { kind: 'table', head: ['Order type', 'Orders', 'Amount'], rows: [
        ['Dine-In', String(count('dining')), money(diningSales)],
        ['Takeaway', String(count('takeaway')), money(takeawaySales)],
        ['Delivery', String(count('delivery')), money(deliverySales)],
      ], foot: ['Total', String(paidOrders.length), money(diningSales + takeawaySales + deliverySales)] },
      { kind: 'section', title: 'Payments' },
      { kind: 'table', head: ['Method', 'Amount'], rows: [...byPay.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)]) },
      { kind: 'total', label: 'TOTAL SALES', value: money(totalSales) },
    ];
    if (unpaidCount || voidOrders.length || cancelledOrders.length || compOrders.length) {
      blocks.push({ kind: 'section', title: 'Other bills' });
      blocks.push({ kind: 'table', head: ['Status', 'Bills', 'Amount'], rows: [
        ['Unpaid (running)', String(unpaidCount), money(unpaidAmount)],
        ['Void', String(voidOrders.length), money(voidAmount)],
        ['Cancelled', String(cancelledOrders.length), money(cancelledAmount)],
        ['Complimentary', String(compOrders.length), money(compAmount)],
      ].filter(r => r[1] !== '0') });
    }
    if (includeOrders) {
      blocks.push({ kind: 'section', title: `Paid orders (${paidOrders.length})` });
      for (const o of paidOrders) {
        const account = o.paymentAccountName || ((o.paymentMethod || 'cash') === 'cash' ? 'Cash drawer' : '');
        blocks.push({
          kind: 'entry',
          title: `#${o.orderNumber} ${String(o.orderType || '').toUpperCase()}`,
          value: money(o.grandTotal),
          lines: [
            `${o.customer?.name || 'Walk-in'}${o.customer?.phone ? ` · ${o.customer.phone}` : ''}`,
            `Payment: ${(o.paymentMethod || 'cash').toUpperCase()}${account ? ` · ${account}` : ''}`,
            reportTime(o.createdAt),
          ],
        });
      }
    }
    const cashierName = cashierFilter === 'all' ? (scope.restrict ? scope.name : 'All cashiers') : (cashierUsers.find(c => c.id === cashierFilter)?.name || '');
    const res = await printThermalReport({
      title: includeOrders ? 'Sales Report (Detailed)' : 'Sales Summary',
      meta: [
        ['From', reportTime(range.startMs)],
        ['To', reportTime(range.endMs)],
        ...(allBranches.length ? [['Branch', branchFilter === 'all' ? 'All branches' : (currentBranchName || '')] as [string, string]] : []),
        ['Cashier', cashierName],
      ],
      blocks,
      footer: settings.marketingFooter,
    });
    if (!res.success) toast.error(`Report not printed: ${res.error || 'printer unavailable'}`);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {settings.logo && (
          <img src={settings.logo} alt="Logo" className="h-10 w-10 object-contain rounded" />
        )}
        <h2 className="text-lg font-bold">{settings.name || 'Reports'}</h2>
        {allBranches.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 border bg-primary/10 border-primary/40">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="h-6 text-[11px] bg-transparent border-0 outline-none font-semibold cursor-pointer"
            >
              <option value="all">All Branches</option>
              {allBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        {scope.restrict ? (
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 border bg-primary/10 border-primary/40">
            <UserIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold">{scope.name} — Your data only</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 border bg-gold/10 border-gold/40">
            <UserIcon className="h-3.5 w-3.5 text-gold" />
            <select
              value={cashierFilter}
              onChange={e => setCashierFilter(e.target.value)}
              className="h-6 text-[11px] bg-transparent border-0 outline-none font-semibold cursor-pointer"
            >
              <option value="all">All Cashiers</option>
              {cashierUsers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <DateTimeRangeFilter value={range} onChange={setRange} />
          <Button size="sm" variant="outline" onClick={printReport}><FileText className="h-3 w-3 mr-1" /> Export PDF</Button>
          <Button size="sm" variant="outline" onClick={() => void printPosReport(false)} title="Summary only (saves paper)"><Printer className="h-3 w-3 mr-1" /> POS Summary</Button>
          <Button size="sm" variant="outline" onClick={() => void printPosReport(true)} title="Summary + order list"><Printer className="h-3 w-3 mr-1" /> POS Detailed</Button>
        </div>
      </div>

      {allBranches.length > 0 && (
        <div className="text-xs text-muted-foreground -mt-3">
          Showing data for: <span className="font-bold text-primary">{branchFilter === 'all' ? 'All Branches' : currentBranchName}</span>
          {activeBranchId && branchFilter !== activeBranchId && branchFilter !== 'all' && (
            <span className="ml-2 text-amber-600">⚠ Filter is different from active POS branch ({allBranches.find(b => b.id === activeBranchId)?.name})</span>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Sales (Paid)</p>
          <p className="text-xl font-bold text-primary">PKR {totalSales.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{paidOrders.length} orders</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Dining</p>
          <p className="text-lg font-bold text-status-info">PKR {diningSales.toLocaleString()}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Takeaway</p>
          <p className="text-lg font-bold text-status-warning">PKR {takeawaySales.toLocaleString()}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Delivery</p>
          <p className="text-lg font-bold text-status-teal">PKR {deliverySales.toLocaleString()}</p>
        </div>
      </div>

      {/* Source Breakdown — Website / Order Taker / POS */}
      <div className="bg-card border-2 border-primary/20 rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          📡 Sales by Source
          <span className="text-[10px] font-normal text-muted-foreground">(where the order came from)</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg p-3 bg-status-success/10 border border-status-success/30">
            <p className="text-[10px] uppercase tracking-wider text-status-success font-bold">🌐 Website</p>
            <p className="text-lg font-extrabold text-status-success">PKR {websiteSales.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{websiteOrders.length} orders</p>
          </div>
          <div className="rounded-lg p-3 bg-status-teal/10 border border-status-teal/30">
            <p className="text-[10px] uppercase tracking-wider text-status-teal font-bold">🛵 Delivery</p>
            <p className="text-lg font-extrabold text-status-teal">PKR {deliverySales.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{paidOrders.filter(o => o.orderType === 'delivery').length} orders</p>
          </div>
          <div className="rounded-lg p-3 bg-status-warning/10 border border-status-warning/30">
            <p className="text-[10px] uppercase tracking-wider text-status-warning font-bold">📋 Order Taker</p>
            <p className="text-lg font-extrabold text-status-warning">PKR {otSales.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{otOrders.length} orders</p>
          </div>
          <div className="rounded-lg p-3 bg-status-info/10 border border-status-info/30">
            <p className="text-[10px] uppercase tracking-wider text-status-info font-bold">🖥️ POS Counter</p>
            <p className="text-lg font-extrabold text-status-info">PKR {posSales.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{posOrders.length} orders</p>
          </div>
        </div>
      </div>

      {unpaidCount > 0 && (
        <div className="bg-status-warning/10 border border-status-warning/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-status-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Unpaid / Running Bills</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-status-warning">{unpaidCount}</span> orders — PKR {unpaidAmount.toLocaleString()} NOT in sales.
            </p>
          </div>
        </div>
      )}

      {/* Status Buckets — keeps paid sales clean and tracks every other status separately */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <BucketCard label="Paid (Sales)" count={paidOrders.length} amount={totalSales} tone="text-status-success bg-status-success/10" />
        <BucketCard label="Running" count={runningOrders.length} amount={unpaidAmount} tone="text-gold bg-gold/15" />
        <BucketCard label="Credit" count={creditOrders.length} amount={creditAmount} tone="text-status-info bg-status-info/10" />
        <BucketCard label="Void" count={voidOrders.length} amount={voidAmount} tone="text-destructive bg-destructive/10" />
        <BucketCard label="Cancelled" count={cancelledOrders.length} amount={cancelledAmount} tone="text-muted-foreground bg-muted" />
        <BucketCard label="Complimentary" count={compOrders.length} amount={compAmount} tone="text-status-purple bg-status-purple/10" />
      </div>

      {/* Cashier Performance — admin only, when viewing All Cashiers */}
      {!scope.restrict && cashierFilter === 'all' && cashierBreakdown.length > 0 && (
        <div className="bg-card border-2 border-gold/30 rounded-xl p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            👥 Cashier Performance
            <span className="text-[10px] font-normal text-muted-foreground">(each cashier's own account — for verification at closing time)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2">Cashier</th>
                  <th className="text-right p-2">Orders</th>
                  <th className="text-right p-2">Total Sales</th>
                  <th className="text-right p-2">Cash</th>
                  <th className="text-right p-2">Other</th>
                </tr>
              </thead>
              <tbody>
                {cashierBreakdown.map(row => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-semibold">👤 {row.name}</td>
                    <td className="p-2 text-right">{row.count}</td>
                    <td className="p-2 text-right font-bold text-primary">PKR {row.total.toLocaleString()}</td>
                    <td className="p-2 text-right text-status-success">PKR {row.cash.toLocaleString()}</td>
                    <td className="p-2 text-right text-muted-foreground">PKR {(row.total - row.cash).toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="font-extrabold bg-gold/10">
                  <td className="p-2">TOTAL</td>
                  <td className="p-2 text-right">{cashierBreakdown.reduce((s, r) => s + r.count, 0)}</td>
                  <td className="p-2 text-right text-primary">PKR {cashierBreakdown.reduce((s, r) => s + r.total, 0).toLocaleString()}</td>
                  <td className="p-2 text-right text-status-success">PKR {cashierBreakdown.reduce((s, r) => s + r.cash, 0).toLocaleString()}</td>
                  <td className="p-2 text-right">PKR {cashierBreakdown.reduce((s, r) => s + (r.total - r.cash), 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}



      <div className="text-[10px] text-muted-foreground">
        Reprints in current view: <span className="font-bold">{totalReprints}</span> (paid bills with re-issued receipts)
      </div>

      {/* Order List with expandable details */}
      <div className="bg-card border rounded-xl">
        <div className="px-4 py-3 border-b"><h3 className="text-sm font-semibold">Paid Orders</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-bold">#</th>
                <th className="text-left px-4 py-2 font-bold">Customer</th>
                <th className="text-left px-4 py-2 font-bold">Phone</th>
                <th className="text-left px-4 py-2 font-bold">Type</th>
                <th className="text-left px-4 py-2 font-bold">Payment</th>
                <th className="text-left px-4 py-2 font-bold">Account</th>
                <th className="text-right px-4 py-2 font-bold">Amount</th>
                <th className="text-left px-4 py-2 font-bold">Date & Time</th>
                <th className="text-center px-4 py-2 font-bold">Reprints</th>
                <th className="text-center px-4 py-2 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paidOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(order => (
                <>
                  <tr key={order.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>
                    <td className="px-4 py-2 font-bold">#{order.orderNumber}</td>
                    <td className="px-4 py-2">{order.customer?.name || '—'}</td>
                    <td className="px-4 py-2">{order.customer?.phone || '—'}</td>
                    <td className="px-4 py-2 capitalize">{order.orderType}</td>
                    <td className="px-4 py-2 uppercase">{order.paymentMethod || 'cash'}</td>
                    <td className="px-4 py-2">{order.paymentAccountName || (order.paymentMethod === 'cash' || !order.paymentMethod ? 'Cash Drawer' : '—')}</td>
                    <td className="px-4 py-2 text-right font-bold text-primary">PKR {order.grandTotal.toLocaleString()}</td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(order.createdAt).toLocaleString('en-PK')}</td>
                    <td className="px-4 py-2 text-center">
                      {order.reprintCount ? (
                        <span title={(order.reprintLog || []).map(r => `${r.type} • ${r.by || '-'} • ${new Date(r.at).toLocaleString('en-PK')}`).join('\n')}
                          className="inline-block px-1.5 py-0.5 rounded bg-status-warning/15 text-status-warning text-[10px] font-bold">
                          {order.reprintCount}×
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); logOrderReprint(order.id, 'receipt'); setReprintOrder(order); refresh(); }}>
                          <Printer className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        {expandedId === order.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </div>
                    </td>
                  </tr>
                  {expandedId === order.id && (
                    <tr key={order.id + '-detail'}>
                      <td colSpan={10} className="px-4 py-3 bg-muted/20">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Items Ordered</p>
                            <div className="space-y-0.5">
                              {order.items.map(item => (
                                <div key={item.id} className="flex justify-between text-xs">
                                  <span>{item.name} x{item.quantity}</span>
                                  <span className="font-semibold">PKR {item.lineTotal.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Bill Summary</p>
                            <div className="space-y-0.5 text-xs">
                              <div className="flex justify-between"><span>Subtotal</span><span>{order.subtotal.toLocaleString()}</span></div>
                              {order.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{order.discount.toLocaleString()}</span></div>}
                              {order.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{order.tax.toLocaleString()}</span></div>}
                              <div className="flex justify-between font-bold border-t pt-1"><span>Grand Total</span><span>PKR {order.grandTotal.toLocaleString()}</span></div>
                               <div className="flex justify-between text-muted-foreground"><span>Payment</span><span className="capitalize">{order.paymentMethod || 'cash'}</span></div>
                               <div className="flex justify-between text-muted-foreground"><span>Account</span><span>{order.paymentAccountName || (order.paymentMethod === 'cash' || !order.paymentMethod ? 'Cash Drawer' : '—')}</span></div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {paidOrders.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">No paid orders</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reprint Dialog */}
      <Dialog open={!!reprintOrder} onOpenChange={() => setReprintOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reprint Receipt</DialogTitle></DialogHeader>
          {reprintOrder && <ReceiptPreview order={reprintOrder} settings={settings} autoPrint />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BucketCard({ label, count, amount, tone }: { label: string; count: number; amount: number; tone: string }) {
  return (
    <div className={`rounded-lg border p-2.5 ${tone}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-sm font-extrabold mt-0.5">PKR {amount.toLocaleString()}</p>
      <p className="text-[10px] opacity-70">{count} bills</p>
    </div>
  );
}
