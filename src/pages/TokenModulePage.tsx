// ============================================================
// TOKEN MODULE — the token register.
//
// Counts, payment state and department reconciliation for the tokens the
// shop has issued. Reads the token RECORDS from the application database,
// so what is shown here is the same data the reports use, not a browser-only
// tally that a cleared cache would lose.
//
// The per-item summary from the original localStorage ledger is kept below,
// so a shop that has been running on the old register still sees its history
// after upgrading.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getTokenSummary } from '@/lib/tokenLedger';
import { getCategories, getSettings } from '@/lib/store';
import {
  filterTokenRecords,
  summariseTokens,
  setTokenPaid,
  tokenDateKey,
  type TokenFilters,
} from '@/lib/tokenRecords';
import type { TokenRecord } from '@/lib/types';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const money = (n: number, symbol: string) =>
  `${symbol}${(Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

export default function TokenModulePage() {
  const [dateKey, setDateKey] = useState(tokenDateKey());
  const [paymentStatus, setPaymentStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [departmentId, setDepartmentId] = useState('');
  const [tokenNumber, setTokenNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [reprintedOnly, setReprintedOnly] = useState(false);
  const [tick, setTick] = useState(0);

  const settings = useMemo(() => {
    try { return getSettings() as any; } catch { return {}; }
  }, [tick]);
  const tokenOn = !!settings.tokenPrintEnabled;
  const paymentMode = !!settings.tokenPaymentMode;
  const currency = settings.currencySymbol || 'Rs ';
  const categories = useMemo(() => {
    try { return getCategories() as { id: string; name: string }[]; } catch { return []; }
  }, [tick]);

  const filters: TokenFilters = useMemo(() => ({
    dateKey: dateKey || undefined,
    paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
    departmentId: departmentId || undefined,
    tokenNumber: tokenNumber || undefined,
    orderNumber: orderNumber || undefined,
    cashierName: cashierName || undefined,
    reprintedOnly: reprintedOnly || undefined,
  }), [dateKey, paymentStatus, departmentId, tokenNumber, orderNumber, cashierName, reprintedOnly]);

  const records = useMemo(() => filterTokenRecords(filters), [filters, tick]);
  const summary = useMemo(() => summariseTokens(records), [records]);
  // The old localStorage ledger, for shops upgrading with existing history.
  const legacy = useMemo(() => {
    try { return getTokenSummary(dateKey); } catch { return null; }
  }, [dateKey, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    window.addEventListener('dtpos-token-ledger-change', refresh);
    const t = setInterval(refresh, 5000);
    return () => { window.removeEventListener('dtpos-token-ledger-change', refresh); clearInterval(t); };
  }, [refresh]);

  const togglePaid = (record: TokenRecord) => {
    const next = record.paymentStatus !== 'paid';
    const updated = setTokenPaid(record.id, next);
    if (!updated) { toast.error('Token not found'); return; }
    if (updated.paymentStatus === 'not_applicable') {
      toast.error('Turn on Token Payment Mode to track token payments');
      return;
    }
    toast.success(next ? `Token #${record.tokenNumber} marked paid` : `Token #${record.tokenNumber} marked unpaid`);
    refresh();
  };

  const clearFilters = () => {
    setPaymentStatus('all'); setDepartmentId(''); setTokenNumber('');
    setOrderNumber(''); setCashierName(''); setReprintedOnly(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">🎟 Token Management</h1>
          <p className="text-xs text-muted-foreground">
            Token register, payment status and department reconciliation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            value={dateKey}
            onChange={e => setDateKey(e.target.value || tokenDateKey())}
          />
          <Button asChild size="sm" variant="outline"><Link to="/printer-settings">Printing Center</Link></Button>
        </div>
      </div>

      {!tokenOn && (
        <Card className="p-3 text-xs font-semibold text-amber-600">
          Token printing is currently OFF — turn it on in the Printing Center and select a
          category or item, and tokens will be counted here.
        </Card>
      )}

      {/* ---- Counts ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4 text-center">
          <p className="text-3xl font-black">{summary.total}</p>
          <p className="text-xs font-semibold text-muted-foreground">Total Tokens</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-3xl font-black">{summary.totalPieces}</p>
          <p className="text-xs font-semibold text-muted-foreground">Total Pieces</p>
        </Card>
        {paymentMode ? (
          <>
            <Card className="p-4 text-center">
              <p className="text-3xl font-black text-emerald-600">{summary.paid}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Paid · {money(summary.paidAmount, currency)}
              </p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-black text-amber-600">{summary.unpaid}</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Unpaid · {money(summary.unpaidAmount, currency)}
              </p>
            </Card>
          </>
        ) : (
          <>
            <Card className="p-4 text-center">
              <p className="text-3xl font-black">{summary.reprinted}</p>
              <p className="text-xs font-semibold text-muted-foreground">Reprinted</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-3xl font-black">{summary.perDepartment.length}</p>
              <p className="text-xs font-semibold text-muted-foreground">Departments</p>
            </Card>
          </>
        )}
      </div>

      {paymentMode && (
        <p className="text-[11px] text-muted-foreground">
          Reprints are shown separately and never counted as another token sale —
          {' '}{summary.reprinted} of these {summary.total} token(s) have been printed more than once.
        </p>
      )}

      {/* ---- Filters ---- */}
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-[11px]">Payment</Label>
            <select
              className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-xs"
              value={paymentStatus}
              onChange={e => setPaymentStatus(e.target.value as never)}
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Department</Label>
            <select
              className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-xs"
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
            >
              <option value="">All</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Token #</Label>
            <input
              className="mt-1 block w-24 rounded-md border bg-background px-2 py-1.5 text-xs"
              value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} placeholder="any"
            />
          </div>
          <div>
            <Label className="text-[11px]">Order #</Label>
            <input
              className="mt-1 block w-24 rounded-md border bg-background px-2 py-1.5 text-xs"
              value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="any"
            />
          </div>
          <div>
            <Label className="text-[11px]">Cashier</Label>
            <input
              className="mt-1 block w-28 rounded-md border bg-background px-2 py-1.5 text-xs"
              value={cashierName} onChange={e => setCashierName(e.target.value)} placeholder="any"
            />
          </div>
          <label className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs">
            <input type="checkbox" checked={reprintedOnly} onChange={e => setReprintedOnly(e.target.checked)} />
            Reprinted only
          </label>
          <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
        </div>
      </Card>

      {/* ---- Department reconciliation ---- */}
      {summary.perDepartment.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-bold">Department reconciliation</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            What the system issued. Count the detachable stubs each counter kept and compare.
          </p>
          <div className="space-y-1">
            {summary.perDepartment.map(d => (
              <div key={d.departmentId} className="flex items-center justify-between border-b border-dashed py-1 text-sm">
                <span className="font-semibold">{d.departmentName}</span>
                <span className="text-xs text-muted-foreground">{d.tokens} token(s)</span>
                <span className="font-bold tabular-nums">{d.qty} pcs</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Records ---- */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold">Tokens ({records.length})</h3>
        {records.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tokens match these filters.</p>
        ) : (
          <div className="max-h-[28rem] space-y-1 overflow-auto">
            {records.map(t => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
                <span className="w-16 shrink-0 font-black">#{t.tokenNumber}</span>
                <span className="w-20 shrink-0 text-muted-foreground">
                  {t.orderNumber != null ? `Order ${t.orderNumber}` : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t.items.map(i => `${i.name}×${i.qty}`).join(', ')}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{t.totalPieces} pcs</span>
                {t.reprintCount > 0 && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-700">
                    REPRINT ×{t.reprintCount}
                  </span>
                )}
                {t.paymentStatus !== 'not_applicable' && (
                  <button
                    onClick={() => togglePaid(t)}
                    className={`shrink-0 rounded px-1.5 py-0.5 font-bold ${
                      t.paymentStatus === 'paid'
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-amber-500/15 text-amber-700'
                    }`}
                    title="Click to change"
                  >
                    {t.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}
                    {t.amount ? ` · ${money(t.amount, currency)}` : ''}
                  </button>
                )}
                <span className="shrink-0 text-muted-foreground">
                  {new Date(t.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {t.cashierName ? ` · ${t.cashierName}` : ''}
                  {t.source === 'manual' ? ' · manual' : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- Legacy register (pre-upgrade history) ---- */}
      {legacy && legacy.perItem.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-bold">Item-wise register</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Day register from before the token records were introduced — kept so earlier
            history is not lost.
          </p>
          <div className="space-y-1">
            {legacy.perItem.map(it => (
              <div key={it.name} className="flex justify-between border-b border-dashed py-1 text-sm">
                <span>{it.name}</span>
                <span className="font-bold">{it.qty} pcs</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
