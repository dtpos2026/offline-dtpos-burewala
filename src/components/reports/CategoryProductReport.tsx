// ============================================================
// Category / product wise sales: pick a category (or all of them) and see every
// item sold — quantity, sales, discounts, service charge and the net amount.
// Pure view over itemSales(); the figures are computed in lib/reportSearch.ts.
// ============================================================
import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogCategory, CategorySalesRow, ItemSalesResult, ItemSalesRow } from '@/lib/reportSearch';

type SortKey = 'net' | 'qty' | 'sales' | 'name';

interface Props {
  result: ItemSalesResult;
  categories: CatalogCategory[];
  categoryId: string;
  onCategoryChange: (id: string) => void;
  onCsv: () => void;
  onPrint: () => void;
  /** Shown above the table: what period / search these figures are for. */
  caption?: string;
}

const money = (n: number) => `PKR ${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function sorter<T extends { qty: number; sales: number; net: number }>(key: SortKey, nameOf: (r: T) => string) {
  return (a: T, b: T) => {
    if (key === 'name') return nameOf(a).localeCompare(nameOf(b));
    return (b[key] - a[key]) || nameOf(a).localeCompare(nameOf(b));
  };
}

function Figures({ r, bold }: { r: Pick<ItemSalesRow, 'qty' | 'sales' | 'discount' | 'serviceCharge' | 'net'>; bold?: boolean }) {
  const cls = `px-3 py-1.5 text-right tabular-nums ${bold ? 'font-bold' : ''}`;
  return (
    <>
      <td className={cls}>{qtyFmt(r.qty)}</td>
      <td className={cls}>{money(r.sales)}</td>
      <td className={`${cls} ${r.discount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{r.discount > 0 ? `-${money(r.discount)}` : '—'}</td>
      <td className={`${cls} ${r.serviceCharge > 0 ? '' : 'text-muted-foreground'}`}>{r.serviceCharge > 0 ? money(r.serviceCharge) : '—'}</td>
      <td className={`${cls} text-primary`}>{money(r.net)}</td>
    </>
  );
}

export default function CategoryProductReport({ result, categories, categoryId, onCategoryChange, onCsv, onPrint, caption }: Props) {
  const [sort, setSort] = useState<SortKey>('net');

  const cats = useMemo<CategorySalesRow[]>(() => {
    const byCat = [...result.categories].sort(sorter<CategorySalesRow>(sort, c => c.categoryName));
    return byCat.map(c => ({ ...c, items: [...c.items].sort(sorter<ItemSalesRow>(sort, i => i.name)) }));
  }, [result, sort]);

  const t = result.totals;
  const single = !!categoryId;

  return (
    <section data-testid="category-product-report" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="cp-cat">Category</label>
          <select id="cp-cat" className="h-9 min-w-[200px] rounded-md border bg-background px-2 text-sm" value={categoryId} onChange={e => onCategoryChange(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground" htmlFor="cp-sort">Sort by</label>
          <select id="cp-sort" className="h-9 rounded-md border bg-background px-2 text-sm" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            <option value="net">Net amount</option>
            <option value="qty">Quantity sold</option>
            <option value="sales">Sales</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCsv} disabled={!cats.length}><Download className="mr-1.5 h-3.5 w-3.5" /> Excel / CSV</Button>
          <Button type="button" size="sm" variant="outline" onClick={onPrint} disabled={!cats.length}><Printer className="mr-1.5 h-3.5 w-3.5" /> Print 80mm</Button>
        </div>
      </div>

      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {([
          ['Quantity sold', qtyFmt(t.qty), ''],
          ['Total sales', money(t.sales), ''],
          ['Discounts', t.discount > 0 ? `-${money(t.discount)}` : '—', 'text-destructive'],
          ['Service charge', t.serviceCharge > 0 ? money(t.serviceCharge) : '—', ''],
          ['Net amount', money(t.net), 'text-primary'],
        ] as const).map(([k, v, tone]) => (
          <div key={k} className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className={`mt-0.5 text-lg font-extrabold tabular-nums ${tone}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs" data-testid="category-product-table">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-bold">{single ? 'Product' : 'Category / product'}</th>
              <th className="px-3 py-2 text-right font-bold">Qty sold</th>
              <th className="px-3 py-2 text-right font-bold">Sales</th>
              <th className="px-3 py-2 text-right font-bold">Discount</th>
              <th className="px-3 py-2 text-right font-bold">Service charge</th>
              <th className="px-3 py-2 text-right font-bold">Net amount</th>
            </tr>
          </thead>
          <tbody>
            {cats.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nothing sold for this search in this period.</td></tr>
            )}
            {cats.map(c => (
              <CategoryBlock key={c.categoryId} c={c} showHeader={!single} />
            ))}
          </tbody>
          {cats.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gold/10 font-extrabold">
                <td className="px-3 py-2">TOTAL · {t.bills} bills</td>
                <Figures r={t} bold />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Discounts and service charge are saved on the whole bill; here they are shared across that bill's items in proportion to their price,
        so the totals match your sales exactly. Tax and delivery charges are not included.
      </p>
    </section>
  );
}

function CategoryBlock({ c, showHeader }: { c: CategorySalesRow; showHeader: boolean }) {
  return (
    <>
      {showHeader && (
        <tr className="border-b bg-muted/40" data-testid="category-row">
          <td className="px-3 py-2 font-extrabold">{c.categoryName} <span className="font-normal text-muted-foreground">· {c.items.length} item{c.items.length === 1 ? '' : 's'}</span></td>
          <Figures r={c} bold />
        </tr>
      )}
      {c.items.map(i => (
        <tr key={i.key} className="border-b last:border-b-0 hover:bg-muted/20" data-testid="product-row">
          <td className={`px-3 py-1.5 ${showHeader ? 'pl-7' : ''}`}>{i.name}</td>
          <Figures r={i} />
        </tr>
      ))}
    </>
  );
}
