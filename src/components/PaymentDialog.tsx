import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPaymentAccounts, findCustomerByPhone, getSettings } from '@/lib/store';
import { PaymentAccount, PaymentMethod, PaymentEntry } from '@/lib/types';
import { Banknote, Landmark, Wallet, Smartphone, CreditCard, Sparkles, SplitSquareHorizontal, CheckCircle2, Printer, Delete } from 'lucide-react';

interface Result {
  /** Primary method (first payment) for legacy fields. */
  method: PaymentMethod;
  accountId?: string;
  accountName?: string;
  cashReceived?: number;
  /** Full breakdown — single, split, or partial. */
  payments: Omit<PaymentEntry, 'id' | 'at' | 'by'>[];
  totalReceived: number;
  loyaltyPointsUsed?: number;
  loyaltyRedeemValue?: number;
  /** The premium screen's "Print receipt" box, when shown: print (or not) this one bill's receipt. */
  printReceipt?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  grandTotal: number;
  onConfirm: (r: Result) => void;
  customerPhone?: string;
  /** When set, dialog title says "Receive Remaining Payment" and disables loyalty redeem. */
  remainingMode?: boolean;
  /** Shows a "Print receipt" box (premium screen), ticked as given — what Settings would do for this bill. */
  defaultPrintReceipt?: boolean;
}

/** One-tap "notes the customer might hand over" above the amount due: 1,952 → 2,000 and 5,000. */
export function suggestedNotes(due: number): number[] {
  if (!(due > 0)) return [];
  const out: number[] = [];
  for (const step of [100, 500, 1000, 5000]) {
    const n = Math.ceil(due / step) * step;
    if (n > due && !out.includes(n)) out.push(n);
  }
  return out.slice(-3);
}

const ICONS: Record<string, any> = {
  bank: Landmark, jazzcash: Smartphone, easypaisa: Smartphone,
  wallet: Wallet, cash: Banknote, other: CreditCard,
};

type Mode = 'cash' | 'online' | 'split' | 'custom';

export default function PaymentDialog({ open, onClose, grandTotal, onConfirm, customerPhone, remainingMode, defaultPrintReceipt }: Props) {
  // Settings → General → Payment screen: Premium (default) or Classic. Same logic, different layout.
  const premium = (getSettings() as any)?.paymentDialogStyle !== 'classic';
  const [printReceipt, setPrintReceipt] = useState(defaultPrintReceipt !== false);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [mode, setMode] = useState<Mode>('cash');
  // Custom payment type (NETS, PayNow, GrabPay …) — sourced from settings
  const [customType, setCustomType] = useState<string>('');
  const [accountId, setAccountId] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  // Split-mode amounts
  const [splitCash, setSplitCash] = useState('');
  const [splitOnline, setSplitOnline] = useState('');
  const [splitAccountId, setSplitAccountId] = useState('');
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [availablePoints, setAvailablePoints] = useState(0);
  const [redeemRate, setRedeemRate] = useState(1);
  const [minRedeem, setMinRedeem] = useState(100);
  const [loyaltyOn, setLoyaltyOn] = useState(false);

  useEffect(() => {
    if (open) {
      const accs = getPaymentAccounts().filter(a => a.isActive !== false);
      setAccounts(accs);
      setMode('cash');
      setAccountId('');
      setSplitCash('');
      setSplitOnline('');
      const firstOnline = accs.find(a => a.type !== 'cash');
      setSplitAccountId(firstOnline?.id || '');
      const s = getSettings();
      const on = !!s?.loyaltyEnabled && !remainingMode;
      setLoyaltyOn(on);
      const rate = Number(s?.loyaltyRedeemRate) > 0 ? Number(s.loyaltyRedeemRate) : 1;
      const minR = Number(s?.loyaltyMinRedeemPoints) > 0 ? Number(s.loyaltyMinRedeemPoints) : 100;
      setRedeemRate(rate);
      setMinRedeem(minR);
      let pts = 0; let nm = '';
      if (on && customerPhone) {
        const c = findCustomerByPhone(customerPhone);
        if (c) { pts = c.loyaltyPoints || 0; nm = c.name || ''; }
      }
      setAvailablePoints(pts);
      setCustomerName(nm);
      setRedeemPoints(0);
      setCashReceived(String(grandTotal));
      setPrintReceipt(defaultPrintReceipt !== false);
    }
  }, [open, grandTotal, customerPhone, remainingMode, defaultPrintReceipt]);

  const onlineAccts = useMemo(() => accounts.filter(a => a.type !== 'cash'), [accounts]);
  const redeemValue = Math.round(redeemPoints * redeemRate);
  const netDue = Math.max(0, grandTotal - redeemValue);
  const canRedeem = loyaltyOn && availablePoints >= minRedeem;

  const splitCashNum = parseFloat(splitCash) || 0;
  const splitOnlineNum = parseFloat(splitOnline) || 0;
  const splitTotal = splitCashNum + splitOnlineNum;

  const cashReceivedNum = parseFloat(cashReceived) || 0;

  // Total received depending on mode
  const totalReceived = mode === 'cash' ? Math.min(cashReceivedNum, netDue) || cashReceivedNum
                     : (mode === 'online' || mode === 'custom') ? netDue
                     : splitTotal;
  const remainingAfter = Math.max(0, netDue - totalReceived);
  const isPartial = totalReceived > 0 && totalReceived < netDue;

  const applyMaxRedeem = () => {
    const maxByTotal = Math.floor(grandTotal / Math.max(0.0001, redeemRate));
    const max = Math.min(availablePoints, maxByTotal);
    setRedeemPoints(max);
    setCashReceived(String(Math.max(0, grandTotal - Math.round(max * redeemRate))));
  };
  const clearRedeem = () => { setRedeemPoints(0); setCashReceived(String(grandTotal)); };

  const confirm = () => {
    const loyaltyExtras = {
      ...(redeemPoints > 0 ? { loyaltyPointsUsed: redeemPoints, loyaltyRedeemValue: redeemValue } : {}),
      ...(premium && defaultPrintReceipt !== undefined ? { printReceipt } : {}),
    };
    const payments: Omit<PaymentEntry, 'id' | 'at' | 'by'>[] = [];

    if (mode === 'cash') {
      const amt = Math.min(cashReceivedNum, netDue); // change is NOT a payment
      if (amt <= 0) return;
      payments.push({ method: 'cash', amount: amt });
      const total = amt;
      onConfirm({
        method: 'cash',
        cashReceived: cashReceivedNum,
        payments,
        totalReceived: total,
        ...loyaltyExtras,
      });
    } else if (mode === 'custom') {
      // Custom type: label is used as the method (for reports) + accountName (for receipt)
      const label = customType || 'OTHER';
      payments.push({ method: label.toLowerCase() as any, accountName: label, amount: netDue });
      onConfirm({
        method: label.toLowerCase() as any,
        accountName: label,
        payments,
        totalReceived: netDue,
        ...loyaltyExtras,
      });
    } else if (mode === 'online') {
      const acc = accounts.find(a => a.id === accountId);
      if (!acc) return;
      payments.push({ method: 'online', accountId: acc.id, accountName: acc.name, amount: netDue });
      onConfirm({
        method: 'online',
        accountId: acc.id,
        accountName: acc.name,
        payments,
        totalReceived: netDue,
        ...loyaltyExtras,
      });
    } else {
      // split
      if (splitTotal <= 0) return;
      if (splitCashNum > 0) payments.push({ method: 'cash', amount: splitCashNum });
      if (splitOnlineNum > 0) {
        const acc = accounts.find(a => a.id === splitAccountId);
        if (!acc) return;
        payments.push({ method: 'online', accountId: acc.id, accountName: acc.name, amount: splitOnlineNum });
      }
      const primary = payments[0];
      onConfirm({
        method: primary.method,
        accountId: primary.accountId,
        accountName: primary.accountName,
        cashReceived: splitCashNum || undefined,
        payments,
        totalReceived: Math.min(splitTotal, netDue),
        ...loyaltyExtras,
      });
    }
  };

  const fillSplitRemaining = (target: 'cash' | 'online') => {
    const other = target === 'cash' ? splitOnlineNum : splitCashNum;
    const rem = Math.max(0, netDue - other);
    if (target === 'cash') setSplitCash(String(rem));
    else setSplitOnline(String(rem));
  };

  const confirmDisabled =
    (mode === 'online' && !accountId) ||
    (mode === 'custom' && !customType) ||
    (mode === 'split' && splitTotal <= 0) ||
    (mode === 'split' && splitOnlineNum > 0 && !splitAccountId) ||
    (mode === 'cash' && cashReceivedNum <= 0) ||
    (redeemPoints > 0 && redeemPoints < minRedeem);

  const btnLabel = isPartial
    ? `⏳ Partial Pay · Rs.${totalReceived.toLocaleString()} (Due Rs.${remainingAfter.toLocaleString()})`
    : `✓ Confirm Payment${redeemValue > 0 ? ` · Rs.${netDue.toLocaleString()}` : ''}`;

  if (premium) {
    const st: any = getSettings() || {};
    const customTypes = ((st.customPaymentTypes as string[]) || []).filter(Boolean);
    const cfgQuick = ((st.quickCashAmounts as number[]) || []).filter((n: number) => n > 0);
    const notes = cfgQuick.length ? cfgQuick.slice(0, 5) : suggestedNotes(netDue);
    const change = Math.max(0, cashReceivedNum - netDue);
    const due = mode === 'cash' ? Math.max(0, netDue - cashReceivedNum) : remainingAfter;
    const fmt = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
    const tiles: Array<{ id: Mode; label: string; Icon: any; disabled?: boolean; hint?: string }> = [
      { id: 'cash', label: 'Cash', Icon: Banknote },
      { id: 'online', label: 'Online', Icon: Landmark, disabled: onlineAccts.length === 0, hint: 'Add a payment account in Settings → Accounts' },
      { id: 'split', label: 'Split', Icon: SplitSquareHorizontal, disabled: onlineAccts.length === 0, hint: 'Needs a payment account' },
      ...(customTypes.length ? [{ id: 'custom' as Mode, label: 'Other', Icon: Wallet }] : []),
    ];
    const pickTile = (id: Mode) => {
      setMode(id);
      if (id === 'custom' && !customType) setCustomType(customTypes[0] || '');
    };
    const typeKey = (k: string) => setCashReceived(prev => k === '⌫' ? String(prev).slice(0, -1) : (String(prev) === '0' ? k : String(prev) + k));

    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent
          data-pay-premium
          className="gap-0 p-0 sm:max-w-[780px]"
          onKeyDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (e.key === 'Enter' && !confirmDisabled && tag !== 'BUTTON' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); confirm(); }
          }}
        >
          <DialogHeader className="flex-row items-center gap-3 space-y-0 border-b px-6 py-4 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></span>
            <DialogTitle className="text-xl font-extrabold">{remainingMode ? 'Receive Remaining Payment' : 'Payment'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 px-6 py-5 md:grid-cols-2">
            {/* Left: the total, how they pay, loyalty, print */}
            <div className="space-y-4">
              <div data-pay-total className="rounded-2xl bg-gradient-to-br from-primary to-primary/75 px-5 py-5 text-center text-primary-foreground shadow-lg">
                <div className="text-sm font-semibold opacity-90">{remainingMode ? 'Balance Due' : 'Total Payable'}</div>
                <div className="mt-1 text-4xl font-black tracking-tight tabular-nums">Rs. {fmt(netDue)}</div>
                {redeemValue > 0 && (
                  <div className="mt-1 text-xs opacity-85">Rs. {fmt(grandTotal)} − loyalty Rs. {fmt(redeemValue)}</div>
                )}
              </div>

              <div role="radiogroup" aria-label="Payment method" className={`grid gap-2 ${tiles.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {tiles.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === t.id}
                    data-pay-method={t.id}
                    disabled={t.disabled}
                    title={t.disabled ? t.hint : undefined}
                    onClick={() => pickTile(t.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      mode === t.id ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <t.Icon className="h-5 w-5" />
                    {t.label}
                  </button>
                ))}
              </div>

              {canRedeem && (
                <div className="space-y-2 rounded-xl border-2 border-amber-400/70 bg-amber-50 p-3 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-xs">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    <span className="font-bold text-amber-800 dark:text-amber-200">{customerName || 'Customer'} has {availablePoints} loyalty points</span>
                    <span className="ml-auto text-[10px] text-amber-700 dark:text-amber-300">1 pt = Rs.{redeemRate} · min {minRedeem}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      placeholder="Points to use"
                      value={redeemPoints || ''}
                      onChange={e => {
                        const v = Math.max(0, Math.min(availablePoints, parseInt(e.target.value) || 0));
                        setRedeemPoints(v);
                        setCashReceived(String(Math.max(0, grandTotal - Math.round(v * redeemRate))));
                      }}
                      className="h-9 text-sm font-bold"
                    />
                    <Button size="sm" variant="outline" onClick={applyMaxRedeem} className="h-9 text-xs font-bold">Max</Button>
                    {redeemPoints > 0 && <Button size="sm" variant="ghost" onClick={clearRedeem} className="h-9 text-xs">Clear</Button>}
                  </div>
                  {redeemPoints > 0 && redeemPoints < minRedeem && <p className="text-[11px] font-bold text-status-warning">At least {minRedeem} points</p>}
                </div>
              )}

              {defaultPrintReceipt !== undefined && (
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    data-pay-print
                    checked={printReceipt}
                    onChange={e => setPrintReceipt(e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  Print receipt
                </label>
              )}
            </div>

            {/* Right: what was received */}
            <div className="space-y-3">
              {mode === 'cash' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold" htmlFor="pay-received">Amount Received</label>
                    <Input
                      id="pay-received"
                      data-pay-amount
                      type="number"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      className="h-14 text-2xl font-extrabold tabular-nums"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-pay-exact onClick={() => setCashReceived(String(netDue))}
                      className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/15">Exact</button>
                    {notes.map((v: number) => (
                      <button key={v} type="button" data-pay-note={v} onClick={() => setCashReceived(String(v))}
                        className="rounded-lg border bg-card px-4 py-2 text-sm font-bold hover:border-primary/50">{fmt(v)}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => (
                      <button key={k} type="button" onClick={() => typeKey(k)} aria-label={k === '⌫' ? 'Delete' : k}
                        className="flex h-10 items-center justify-center rounded-lg border bg-background text-base font-bold hover:bg-accent active:scale-[0.97]">
                        {k === '⌫' ? <Delete className="h-5 w-5 text-destructive" /> : k}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {mode === 'online' && (
                <div className="max-h-[42vh] space-y-2 overflow-y-auto">
                  <div className="text-sm font-semibold">Received in</div>
                  {onlineAccts.map(a => {
                    const Icon = ICONS[a.type] || CreditCard;
                    return (
                      <button key={a.id} type="button" data-pay-account={a.id} onClick={() => setAccountId(a.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${accountId === a.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}>
                        <Icon className="h-5 w-5 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-extrabold">{a.name}</div>
                          {a.accountNumber && <div className="truncate text-[11px] text-muted-foreground">{a.accountNumber}</div>}
                        </div>
                        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{a.type}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {mode === 'split' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-sm font-semibold">
                      <span>Cash</span>
                      <button type="button" onClick={() => fillSplitRemaining('cash')} className="text-[11px] text-primary underline">rest in cash</button>
                    </label>
                    <Input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)} placeholder="0" className="h-11 text-base font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-sm font-semibold">
                      <span>Online</span>
                      <button type="button" onClick={() => fillSplitRemaining('online')} className="text-[11px] text-primary underline">rest online</button>
                    </label>
                    <Input type="number" value={splitOnline} onChange={e => setSplitOnline(e.target.value)} placeholder="0" className="h-11 text-base font-bold" />
                    {splitOnlineNum > 0 && (
                      <select value={splitAccountId} onChange={e => setSplitAccountId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Select online account…</option>
                        {onlineAccts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {mode === 'custom' && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Payment type</div>
                  <div className="flex flex-wrap gap-2">
                    {customTypes.map(t => (
                      <button key={t} type="button" onClick={() => setCustomType(t)}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-bold ${customType === t ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card hover:border-primary/40'}`}>{t}</button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">"{customType || '—'}" is shown on the receipt and in reports.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div data-pay-change className="rounded-xl border bg-card px-4 py-3">
                  <div className="text-xs font-semibold text-muted-foreground">Change</div>
                  <div className={`text-2xl font-black tabular-nums ${mode === 'cash' && change > 0 ? 'text-status-success' : 'text-status-success/80'}`}>Rs. {fmt(mode === 'cash' ? change : 0)}</div>
                </div>
                <div data-pay-due className="rounded-xl border bg-card px-4 py-3">
                  <div className="text-xs font-semibold text-muted-foreground">Due (Credit)</div>
                  <div className={`text-2xl font-black tabular-nums ${due > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>Rs. {fmt(due)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pinned to the bottom of the popup: on a short screen the options scroll, the buttons never do. */}
          <div data-pay-confirm className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t bg-[hsl(var(--ui-dialog-bg,var(--background)))] px-6 py-4">
            <Button variant="outline" size="lg" onClick={onClose} className="font-bold">Back to cart</Button>
            <Button
              size="lg"
              data-pay-complete
              onClick={confirm}
              disabled={confirmDisabled}
              className={`h-12 gap-2 px-6 text-base font-extrabold text-white ${isPartial ? 'bg-amber-500 hover:bg-amber-600' : 'bg-status-success hover:bg-status-success/90'}`}
            >
              <CheckCircle2 className="h-5 w-5" />
              {isPartial ? `Partial Pay · Rs. ${fmt(totalReceived)} (Due Rs. ${fmt(remainingAfter)})` : 'Complete Sale'}
              <kbd className="rounded border border-white/50 px-1.5 py-0.5 text-[10px] font-bold">Enter</kbd>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>💳 {remainingMode ? 'Receive Remaining Payment' : 'Payment Receive'}</DialogTitle>
        </DialogHeader>

        <div className="bg-primary/10 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">{remainingMode ? 'BALANCE DUE' : 'AMOUNT DUE'}</p>
          <p className={`text-3xl font-extrabold ${redeemValue > 0 ? 'text-status-success' : 'text-primary'}`}>
            PKR {netDue.toLocaleString()}
          </p>
          {redeemValue > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Original Rs.{grandTotal.toLocaleString()} − Loyalty Rs.{redeemValue.toLocaleString()}
            </p>
          )}
        </div>

        {canRedeem && (
          <div className="rounded-lg border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <div className="flex-1 text-xs">
                <div className="font-extrabold text-amber-800 dark:text-amber-200">
                  🏆 {customerName || 'Customer'} has {availablePoints} loyalty points
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-300">
                  Rate: 1 pt = Rs.{redeemRate} · Min redeem: {minRedeem} pts
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 items-center">
              <Input
                type="number"
                placeholder="Points to use"
                value={redeemPoints || ''}
                onChange={e => {
                  const v = Math.max(0, Math.min(availablePoints, parseInt(e.target.value) || 0));
                  setRedeemPoints(v);
                  setCashReceived(String(Math.max(0, grandTotal - Math.round(v * redeemRate))));
                }}
                className="h-9 text-sm font-bold"
              />
              <Button size="sm" variant="outline" onClick={applyMaxRedeem} className="h-9 text-xs font-bold whitespace-nowrap">Max</Button>
              {redeemPoints > 0 && (
                <Button size="sm" variant="ghost" onClick={clearRedeem} className="h-9 text-xs">✕</Button>
              )}
            </div>
            {redeemPoints > 0 && redeemPoints < minRedeem && (
              <p className="text-[10px] text-status-warning font-bold">Min {minRedeem} pts required</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setMode('cash')}
            className={`p-2.5 rounded-lg border-2 font-bold flex flex-col items-center gap-1 transition-all ${
              mode === 'cash' ? 'bg-status-success/15 border-status-success text-status-success' : 'bg-card border-border hover:bg-accent'
            }`}
          >
            <Banknote className="h-5 w-5" />
            <span className="text-[11px]">💵 Cash</span>
          </button>
          <button
            onClick={() => setMode('online')}
            disabled={onlineAccts.length === 0}
            className={`p-2.5 rounded-lg border-2 font-bold flex flex-col items-center gap-1 transition-all ${
              mode === 'online' ? 'bg-status-info/15 border-status-info text-status-info' : 'bg-card border-border hover:bg-accent'
            } ${onlineAccts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Landmark className="h-5 w-5" />
            <span className="text-[11px]">🏦 Online</span>
          </button>
          <button
            onClick={() => setMode('split')}
            disabled={onlineAccts.length === 0}
            className={`p-2.5 rounded-lg border-2 font-bold flex flex-col items-center gap-1 transition-all ${
              mode === 'split' ? 'bg-amber-500/15 border-amber-500 text-amber-700' : 'bg-card border-border hover:bg-accent'
            } ${onlineAccts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <SplitSquareHorizontal className="h-5 w-5" />
            <span className="text-[11px]">🔀 Split</span>
          </button>
        </div>

        {/* CUSTOM PAYMENT TYPES (NETS / PayNow / GrabPay …) — Settings se */}
        {(() => {
          const types = (((getSettings() as any).customPaymentTypes as string[]) || []).filter(Boolean);
          if (types.length === 0) return null;
          return (
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">Other Payment Types</label>
              <div className="flex flex-wrap gap-1.5">
                {types.map(t => (
                  <button
                    key={t}
                    onClick={() => { setMode('custom'); setCustomType(t); }}
                    className={`px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all ${
                      mode === 'custom' && customType === t
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-card border-border hover:bg-accent'
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>
          );
        })()}

        {mode === 'custom' && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-muted-foreground">Payment Type</p>
            <p className="text-lg font-black">{customType}</p>
            <p className="text-xs">Amount: <b>{netDue.toFixed(2)}</b></p>
            <p className="text-[11px] text-muted-foreground mt-1">"{customType}" will be shown on both the receipt and reports.</p>
          </div>
        )}

        {mode === 'cash' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground">Cash Received (partial allowed)</label>
            <Input
              type="number"
              value={cashReceived}
              onChange={e => setCashReceived(e.target.value)}
              className="h-12 text-lg font-extrabold text-center"
              autoFocus
            />
            {/* NUMPAD (client #4): clicking digits is 10x faster than up/down arrows */}
            <div className="grid grid-cols-3 gap-1">
              {['1','2','3','4','5','6','7','8','9','00','0','⌫'].map(k => (
                <button
                  key={k}
                  onClick={() => setCashReceived(prev => k === '⌫' ? String(prev).slice(0, -1) : (String(prev) === '0' ? k : String(prev) + k))}
                  className="h-10 rounded-lg bg-muted hover:bg-accent text-base font-extrabold active:scale-95 transition-all"
                >{k}</button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(() => {
                // FIX (client): the Quick Amounts from Settings should appear here
                const cfg = (((getSettings() as any).quickCashAmounts as number[]) || []).filter(n => n > 0);
                return [netDue, ...(cfg.length ? cfg : [500, 1000, 2000, 5000, 10000])];
              })().map(v => (
                <button
                  key={v}
                  onClick={() => setCashReceived(String(v))}
                  className="h-8 text-[11px] font-bold bg-muted hover:bg-accent rounded-md"
                >Rs.{v.toLocaleString()}</button>
              ))}
            </div>
            {/* Quick discount presets — also on the payment screen (client request) */}
            {(() => {
              const st: any = getSettings();
              const pcts = ((st.discountPresets as number[]) || []).filter(n => n > 0 && n < 100);
              const amts = ((st.discountAmountPresets as number[]) || []).filter(n => n > 0);
              if (pcts.length === 0 && amts.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1 pt-1 border-t">
                  <span className="text-[10px] font-bold text-muted-foreground w-full">Quick Discount</span>
                  {pcts.map(p => (
                    <button key={`dp${p}`} onClick={() => setCashReceived(String(Math.max(0, Math.round((netDue - netDue * p / 100) * 100) / 100)))}
                      className="px-2 py-1 rounded-md text-[11px] font-extrabold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20">-{p}%</button>
                  ))}
                  {amts.map(a => (
                    <button key={`da${a}`} onClick={() => setCashReceived(String(Math.max(0, Math.round((netDue - a) * 100) / 100)))}
                      className="px-2 py-1 rounded-md text-[11px] font-extrabold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">-{a}</button>
                  ))}
                </div>
              );
            })()}
            {cashReceivedNum > netDue && (
              <div className="text-center text-sm font-bold text-status-success">
                Change: Rs. {(cashReceivedNum - netDue).toLocaleString()}
              </div>
            )}
            {cashReceivedNum > 0 && cashReceivedNum < netDue && (
              <div className="text-center text-sm font-bold text-amber-600">
                ⏳ Partial — Rs. {(netDue - cashReceivedNum).toLocaleString()} pending
              </div>
            )}
          </div>
        )}

        {mode === 'online' && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {onlineAccts.length === 0 ? (
              <div className="text-xs text-center text-muted-foreground py-6">
                No payment account added. Add one from Settings → Accounts → Payment Accounts.
              </div>
            ) : onlineAccts.map(a => {
              const Icon = ICONS[a.type] || CreditCard;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccountId(a.id)}
                  className={`w-full p-3 rounded-lg border-2 flex items-center gap-3 transition-all text-left ${
                    accountId === a.id ? 'bg-primary/10 border-primary' : 'bg-card border-border hover:bg-accent'
                  }`}
                >
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold truncate">{a.name}</div>
                    {a.accountNumber && <div className="text-[11px] text-muted-foreground truncate">{a.accountNumber}</div>}
                  </div>
                  <span className="text-[10px] uppercase font-bold bg-muted px-2 py-0.5 rounded">{a.type}</span>
                </button>
              );
            })}
          </div>
        )}

        {mode === 'split' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>💵 Cash portion</span>
                <button onClick={() => fillSplitRemaining('cash')} className="text-[10px] text-primary underline">fill remaining</button>
              </label>
              <Input
                type="number"
                value={splitCash}
                onChange={e => setSplitCash(e.target.value)}
                placeholder="0"
                className="h-11 text-base font-bold text-center"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground flex items-center justify-between">
                <span>🏦 Online portion</span>
                <button onClick={() => fillSplitRemaining('online')} className="text-[10px] text-primary underline">fill remaining</button>
              </label>
              <Input
                type="number"
                value={splitOnline}
                onChange={e => setSplitOnline(e.target.value)}
                placeholder="0"
                className="h-11 text-base font-bold text-center"
              />
              {splitOnlineNum > 0 && (
                <select
                  value={splitAccountId}
                  onChange={e => setSplitAccountId(e.target.value)}
                  className="w-full h-9 text-xs rounded-md border border-input bg-background px-2"
                >
                  <option value="">Select online account…</option>
                  {onlineAccts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              )}
            </div>
            <div className="rounded-md bg-muted p-2 text-xs flex justify-between font-bold">
              <span>Total received:</span>
              <span className={isPartial ? 'text-amber-600' : 'text-status-success'}>Rs. {splitTotal.toLocaleString()}</span>
            </div>
            {isPartial && (
              <div className="text-center text-xs font-bold text-amber-600">
                ⏳ Rs. {remainingAfter.toLocaleString()} pending — will remain on the bill slip
              </div>
            )}
          </div>
        )}

        {/* Pinned to the bottom of the popup: on a short screen the options scroll, the confirm button never does. */}
        <div data-pay-confirm className="sticky -bottom-6 z-10 -mx-6 -mb-6 border-t bg-[hsl(var(--ui-dialog-bg,var(--background)))] px-6 pb-6 pt-3">
          <Button
            className={`w-full h-12 text-base font-extrabold ${isPartial ? 'bg-amber-500 hover:bg-amber-600' : 'bg-status-success hover:bg-status-success/90'}`}
            onClick={confirm}
            disabled={confirmDisabled}
          >
            {btnLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
