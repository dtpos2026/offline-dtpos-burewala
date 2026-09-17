// ============================================================
// SALES REPORT — category-wise + product-wise, order-type breakdown,
// date ranges (today/yesterday/week/month/year/custom), printable.
// Client feedback #1 & #2 (Report sample + Day Close report).
// ============================================================
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getOrders, getMenuItems, getCategories, getSettings } from '@/lib/store';
import { isPaidSale, isPartialSale, isVoidish, paidRevenue } from '@/lib/sales';
import { getAllHistoricalOrders } from '@/lib/orderArchive';
import type { Order } from '@/lib/types';
import { Printer, Receipt } from 'lucide-react';
import ShiftReportPreview, { printShiftReport } from '@/components/ShiftReport';
import { toast } from 'sonner';

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';
type ViewKey = 'category' | 'product' | 'ordertype' | 'payment' | 'shift';

const ORDER_TYPES: { key: string; label: string }[] = [
  { key: 'dining', label: 'Dine-In' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'foodpanda', label: 'Online / Drive' },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function rangeFor(key: RangeKey, cFrom: string, cTo: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  switch (key) {
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: 'Yesterday' };
    }
    case 'week': {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now), label: 'Last 7 Days' };
    }
    case 'month': {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(f), to: endOfDay(now), label: 'This Month' };
    }
    case 'year': {
      const f = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(f), to: endOfDay(now), label: 'This Year' };
    }
    case 'custom': {
      const f = cFrom ? new Date(cFrom) : startOfDay(now);
      const t = cTo ? new Date(cTo) : now;
      return { from: startOfDay(f), to: endOfDay(t), label: `${cFrom || '—'} → ${cTo || '—'}` };
    }
    default:
      return { from: startOfDay(now), to: endOfDay(now), label: 'Today' };
  }
}

export default function SalesReportPage() {
  const settings: any = getSettings();
  const sym = settings.currencySymbol || 'Rs.';
  const [range, setRange] = useState<RangeKey>('today');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [view, setView] = useState<ViewKey>('category');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { from, to, label } = rangeFor(range, cFrom, cTo);

  const data = useMemo(() => {
    const menu = getMenuItems();
    const cats = getCategories();
    const catName = new Map(cats.map((c: any) => [c.id, c.name]));
    const itemCat = new Map(menu.map((m: any) => [m.id, m.categoryId]));

    // FIX: include archive too — show older sales even after day close
    const orders = getAllHistoricalOrders(getOrders()).filter((o: Order) => {
      if (isVoidish(o)) return false;
      if (!(isPaidSale(o) || isPartialSale(o))) return false;
      const t = new Date((o as any).paidAt || (o as any).updatedAt || o.createdAt || 0).getTime();
      if (t < from.getTime() || t > to.getTime()) return false;
      if (typeFilter !== 'all' && (o.orderType || 'dining') !== typeFilter) return false;
      return true;
    });

    const byCat = new Map<string, { qty: number; amount: number }>();
    const byProd = new Map<string, { qty: number; amount: number; cat: string }>();
    const byType = new Map<string, { orders: number; amount: number }>();
    const byPay = new Map<string, { orders: number; amount: number }>();
    let gross = 0, discount = 0, tax = 0, service = 0, net = 0, itemCount = 0;

    for (const o of orders) {
      const rev = paidRevenue(o);
      net += rev;
      gross += Number((o as any).subtotal || 0);
      discount += Number((o as any).discount || (o as any).discountAmount || 0);
      tax += Number((o as any).tax || 0);
      service += Number((o as any).serviceCharge || 0);

      const t = o.orderType || 'dining';
      const tRow = byType.get(t) || { orders: 0, amount: 0 };
      tRow.orders++; tRow.amount += rev; byType.set(t, tRow);

      const pm = (o as any).paymentMethod || 'cash';
      const pRow = byPay.get(pm) || { orders: 0, amount: 0 };
      pRow.orders++; pRow.amount += rev; byPay.set(pm, pRow);

      for (const it of ((o.items || []) as any[])) {
        const qty = Number(it.quantity || 0);
        const amt = Number(it.lineTotal || 0);
        itemCount += qty;
        const cid = itemCat.get(it.menuItemId) || '';
        const cname = catName.get(cid) || 'Uncategorized';
        const c = byCat.get(cname) || { qty: 0, amount: 0 };
        c.qty += qty; c.amount += amt; byCat.set(cname, c);
        const p = byProd.get(it.name) || { qty: 0, amount: 0, cat: cname };
        p.qty += qty; p.amount += amt; byProd.set(it.name, p);
      }
    }

    const sortDesc = (a: any, b: any) => b[1].amount - a[1].amount;
    return {
      orders,
      totals: { gross, discount, tax, service, net, itemCount, orderCount: orders.length },
      cats: Array.from(byCat.entries()).sort(sortDesc),
      prods: Array.from(byProd.entries()).sort(sortDesc),
      types: Array.from(byType.entries()).sort(sortDesc),
      pays: Array.from(byPay.entries()).sort(sortDesc),
    };
  }, [from.getTime(), to.getTime(), typeFilter]);

  const money = (n: number) => `${sym} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto print:p-0 print-dark-report">
      {/* FIX (client): report print used to come out very light — force full
          black, bold, and exact color rendering on both thermal/laser. */}
      <style>{`
        @media print {
          .print-dark-report, .print-dark-report * {
            color: #000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            text-shadow: none !important;
            opacity: 1 !important;
          }
          .print-dark-report table, .print-dark-report th, .print-dark-report td {
            border-color: #000 !important;
            border-width: 1px !important;
          }
          .print-dark-report th { background: #ddd !important; font-weight: 900 !important; }
          .print-dark-report td, .print-dark-report p, .print-dark-report span { font-weight: 600 !important; }
          .print-dark-report h1, .print-dark-report h2, .print-dark-report h3 { font-weight: 900 !important; }
          .print-dark-report .text-gray-600, .print-dark-report .text-muted-foreground { color: #000 !important; }
          /* A4 report: the global slip @page rule forces 80mm — override it. */
          @page { size: A4 portrait; margin: 10mm; }
          html, body { width: auto !important; background: #fff !important; }
          /* Long reports must break across pages with repeating headers. */
          .print-dark-report table { page-break-inside: auto !important; width: 100% !important; }
          .print-dark-report thead { display: table-header-group !important; }
          .print-dark-report tr { page-break-inside: avoid !important; }
        }
      `}</style>
      {/* ===== Controls (print me chhup jate hain) ===== */}
      <div className="print:hidden space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">📊 Sales Report</h1>
            <p className="text-xs text-muted-foreground">Category-wise · Product-wise · Order type · Payment</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              toast.info('Printing Shift Report…');
              const r = await printShiftReport({ from, to, label, startingCash: Number((settings as any).startingCash || 0) });
              r.success ? toast.success('Sent to Shift Report printer') : toast.error('Print fail: ' + (r.error || 'unknown'));
            }}>
              <Receipt className="h-4 w-4 mr-1" /> Print Shift Report (Thermal)
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print A4
            </Button>
          </div>
        </div>

        <Card className="p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['month', 'This Month'], ['year', 'This Year'], ['custom', 'Custom Dates']] as [RangeKey, string][]).map(([k, lbl]) => (
              <button key={k} onClick={() => setRange(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${range === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 hover:bg-muted border-transparent'}`}>
                {lbl}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-background" />
              <span className="text-xs text-muted-foreground">se</span>
              <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm bg-background" />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            <button onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold border ${typeFilter === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-muted/50 border-transparent'}`}>All Types</button>
            {ORDER_TYPES.map(t => (
              <button key={t.key} onClick={() => setTypeFilter(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold border ${typeFilter === t.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-muted/50 border-transparent'}`}>{t.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t pt-3">
            {([['category', '📁 Category-wise'], ['product', '🍔 Product-wise'], ['ordertype', '🚚 Order Type'], ['payment', '💳 Payment Type'], ['shift', '🧾 Shift Report']] as [ViewKey, string][]).map(([k, lbl]) => (
              <button key={k} onClick={() => setView(k)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold border ${view === k ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted/50 border-transparent'}`}>{lbl}</button>
            ))}
          </div>
        </Card>
      </div>

      {/* ===== Printable report ===== */}
      <div className="bg-white text-black rounded-lg border p-5 print:border-0 print:p-0">
        <div className="text-center border-b-2 border-black pb-2 mb-3">
          <h2 className="text-lg font-black uppercase">{settings.restaurantName || 'DT POS'}</h2>
          <p className="text-xs">{settings.address || ''}{settings.phone ? ` · ${settings.phone}` : ''}</p>
          <p className="text-sm font-bold mt-1">SALES REPORT — {label.toUpperCase()}</p>
          <p className="text-[11px]">
            {from.toLocaleDateString()} — {to.toLocaleDateString()}
            {typeFilter !== 'all' ? ` · ${ORDER_TYPES.find(t => t.key === typeFilter)?.label}` : ' · All Order Types'}
          </p>
          <p className="text-[10px] text-gray-600">Printed: {new Date().toLocaleString()}</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            ['Orders', String(data.totals.orderCount)],
            ['Items Sold', String(data.totals.itemCount)],
            ['Discount', money(data.totals.discount)],
            ['NET SALES', money(data.totals.net)],
          ].map(([k, v]) => (
            <div key={k} className="border border-black p-2 text-center">
              <p className="text-[10px] uppercase font-bold">{k}</p>
              <p className="text-sm font-black">{v}</p>
            </div>
          ))}
        </div>

        {/* Order type summary — always shown (client requirement: dine-in/takeaway/delivery) */}
        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr><th colSpan={3} className="border border-black bg-gray-100 p-1 text-left font-black uppercase">Order Type Breakdown</th></tr>
            <tr className="font-bold">
              <th className="border border-black p-1 text-left">Type</th>
              <th className="border border-black p-1 text-right">Orders</th>
              <th className="border border-black p-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ORDER_TYPES.map(t => {
              const row = data.types.find(([k]) => k === t.key)?.[1] || { orders: 0, amount: 0 };
              return (
                <tr key={t.key}>
                  <td className="border border-black p-1">{t.label}</td>
                  <td className="border border-black p-1 text-right">{row.orders}</td>
                  <td className="border border-black p-1 text-right font-bold">{money(row.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Selected view */}
        {view === 'category' && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr><th colSpan={3} className="border border-black bg-gray-100 p-1 text-left font-black uppercase">Category-wise Sales</th></tr>
              <tr className="font-bold">
                <th className="border border-black p-1 text-left">Category</th>
                <th className="border border-black p-1 text-right">Qty</th>
                <th className="border border-black p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.cats.length === 0 ? (
                <tr><td colSpan={3} className="border border-black p-3 text-center">No sales in this range</td></tr>
              ) : data.cats.map(([name, v]) => (
                <tr key={name}>
                  <td className="border border-black p-1">{name}</td>
                  <td className="border border-black p-1 text-right">{v.qty}</td>
                  <td className="border border-black p-1 text-right font-bold">{money(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'product' && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr><th colSpan={4} className="border border-black bg-gray-100 p-1 text-left font-black uppercase">Product-wise Sales</th></tr>
              <tr className="font-bold">
                <th className="border border-black p-1 text-left">Product</th>
                <th className="border border-black p-1 text-left">Category</th>
                <th className="border border-black p-1 text-right">Qty</th>
                <th className="border border-black p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.prods.length === 0 ? (
                <tr><td colSpan={4} className="border border-black p-3 text-center">No sales in this range</td></tr>
              ) : data.prods.map(([name, v]) => (
                <tr key={name}>
                  <td className="border border-black p-1">{name}</td>
                  <td className="border border-black p-1">{v.cat}</td>
                  <td className="border border-black p-1 text-right">{v.qty}</td>
                  <td className="border border-black p-1 text-right font-bold">{money(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'ordertype' && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr><th colSpan={3} className="border border-black bg-gray-100 p-1 text-left font-black uppercase">Order Type Detail</th></tr>
              <tr className="font-bold">
                <th className="border border-black p-1 text-left">Type</th>
                <th className="border border-black p-1 text-right">Orders</th>
                <th className="border border-black p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.types.map(([k, v]) => (
                <tr key={k}>
                  <td className="border border-black p-1 capitalize">{ORDER_TYPES.find(t => t.key === k)?.label || k}</td>
                  <td className="border border-black p-1 text-right">{v.orders}</td>
                  <td className="border border-black p-1 text-right font-bold">{money(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'payment' && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr><th colSpan={3} className="border border-black bg-gray-100 p-1 text-left font-black uppercase">Payment Type Breakdown</th></tr>
              <tr className="font-bold">
                <th className="border border-black p-1 text-left">Payment</th>
                <th className="border border-black p-1 text-right">Orders</th>
                <th className="border border-black p-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.pays.map(([k, v]) => (
                <tr key={k}>
                  <td className="border border-black p-1 capitalize">{k}</td>
                  <td className="border border-black p-1 text-right">{v.orders}</td>
                  <td className="border border-black p-1 text-right font-bold">{money(v.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'shift' && (
          <div className="py-2">
            <p className="text-center text-[11px] text-gray-600 mb-2 print:hidden">Shift Report — thermal preview (aap ke sample format ke mutabiq)</p>
            <ShiftReportPreview range={{ from, to, label, startingCash: Number((settings as any).startingCash || 0) }} />
          </div>
        )}

        {/* Grand total */}
        <table className="w-full text-xs border-collapse mt-4">
          <tbody>
            <tr><td className="border border-black p-1 font-bold">Gross Sales</td><td className="border border-black p-1 text-right">{money(data.totals.gross)}</td></tr>
            <tr><td className="border border-black p-1 font-bold">Discount</td><td className="border border-black p-1 text-right">- {money(data.totals.discount)}</td></tr>
            <tr><td className="border border-black p-1 font-bold">Service Charge</td><td className="border border-black p-1 text-right">{money(data.totals.service)}</td></tr>
            <tr><td className="border border-black p-1 font-bold">Tax / GST</td><td className="border border-black p-1 text-right">{money(data.totals.tax)}</td></tr>
            <tr className="text-sm"><td className="border-2 border-black p-1.5 font-black uppercase">Net Sales</td><td className="border-2 border-black p-1.5 text-right font-black">{money(data.totals.net)}</td></tr>
          </tbody>
        </table>

        <p className="text-center text-[10px] mt-4 border-t pt-2">DT POS Enterprise · Digital Target · TAMi Software House</p>
      </div>
    </div>
  );
}
