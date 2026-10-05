// ============================================================
// The Reports search box and filters.
//
// One box finds anything on a bill (number, customer, phone, product, category,
// cashier, table, payment …); the filters below narrow by category, product,
// customer, payment method, order type, cashier, quantity and sales amount.
// Pure view: it only edits the `filters` object the page passes in.
// ============================================================
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { hasActiveFilters, type CatalogCategory, type ReportFilters } from '@/lib/reportSearch';

interface Props {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  categories: CatalogCategory[];
  /** Product names offered while typing in the Product box. */
  productNames: string[];
  /** Cashiers to pick from. Empty for a cashier who may only see their own bills. */
  cashiers: Array<{ id: string; name: string; role?: string }>;
  /** What is being searched, for the caption ("12 of 40 bills"). */
  matched: number;
  total: number;
  /** Open the extra filters by default. */
  expanded?: boolean;
  onToggleExpanded?: (open: boolean) => void;
}

const selectCls = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const label = 'mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground';

function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default function ReportSearchPanel({
  filters, onChange, categories, productNames, cashiers, matched, total, expanded = false, onToggleExpanded,
}: Props) {
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  return (
    <section data-testid="report-search" aria-label="Report search and filters" className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.text || ''}
            onChange={e => set({ text: e.target.value })}
            placeholder="Search anything — bill no, product, category, customer, phone, cashier, table…"
            className="h-9 pl-9"
            aria-label="Search reports"
          />
        </div>
        <Button
          type="button" size="sm" variant={expanded ? 'secondary' : 'outline'} className="h-9"
          onClick={() => onToggleExpanded?.(!expanded)} aria-expanded={expanded}
        >
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Filters
        </Button>
        {active && (
          <Button type="button" size="sm" variant="ghost" className="h-9 text-destructive" onClick={() => onChange({})}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground" data-testid="report-search-count">
          {active ? <><b className="text-foreground">{matched}</b> of {total} bills</> : <>{total} bills</>}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <div>
            <label className={label} htmlFor="rs-bill">Bill number</label>
            <Input id="rs-bill" className="h-9" inputMode="numeric" placeholder="e.g. 1042" value={filters.billNo || ''} onChange={e => set({ billNo: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="rs-cat">Category</label>
            <select id="rs-cat" className={selectCls} value={filters.categoryIds?.[0] || ''} onChange={e => set({ categoryIds: e.target.value ? [e.target.value] : undefined })}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="rs-prod">Product</label>
            <Input id="rs-prod" className="h-9" list="rs-products" placeholder="e.g. Chicken" value={filters.product || ''} onChange={e => set({ product: e.target.value })} />
            <datalist id="rs-products">{productNames.slice(0, 200).map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <div>
            <label className={label} htmlFor="rs-cust">Customer / phone</label>
            <Input id="rs-cust" className="h-9" placeholder="Name or number" value={filters.customer || ''} onChange={e => set({ customer: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="rs-pay">Payment method</label>
            <select id="rs-pay" className={selectCls} value={filters.payment || 'all'} onChange={e => set({ payment: e.target.value as ReportFilters['payment'] })}>
              <option value="all">All payments</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="rs-type">Order type</label>
            <select id="rs-type" className={selectCls} value={filters.orderType || 'all'} onChange={e => set({ orderType: e.target.value as ReportFilters['orderType'] })}>
              <option value="all">All order types</option>
              <option value="dining">Dine-In</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          {cashiers.length > 0 && (
            <div>
              <label className={label} htmlFor="rs-cashier">User / cashier</label>
              <select id="rs-cashier" className={selectCls} value={filters.cashierId || ''} onChange={e => set({ cashierId: e.target.value || undefined })}>
                <option value="">All users</option>
                {cashiers.map(c => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Product quantity</label>
            <div className="flex items-center gap-1">
              <Input className="h-9" inputMode="numeric" placeholder="min" aria-label="Minimum quantity" value={filters.minQty ?? ''} onChange={e => set({ minQty: numberOrUndefined(e.target.value) })} />
              <span className="text-muted-foreground">–</span>
              <Input className="h-9" inputMode="numeric" placeholder="max" aria-label="Maximum quantity" value={filters.maxQty ?? ''} onChange={e => set({ maxQty: numberOrUndefined(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className={label}>Sales amount (PKR)</label>
            <div className="flex items-center gap-1">
              <Input className="h-9" inputMode="numeric" placeholder="min" aria-label="Minimum amount" value={filters.minAmount ?? ''} onChange={e => set({ minAmount: numberOrUndefined(e.target.value) })} />
              <span className="text-muted-foreground">–</span>
              <Input className="h-9" inputMode="numeric" placeholder="max" aria-label="Maximum amount" value={filters.maxAmount ?? ''} onChange={e => set({ maxAmount: numberOrUndefined(e.target.value) })} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
