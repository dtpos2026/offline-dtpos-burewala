import { useState } from 'react';
import { getOrders, saveOrder, getSettings } from '@/lib/store';
import { Order } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Printer, Eye, CreditCard, Ban, XCircle, RotateCcw, ChefHat, Globe, PauseCircle, PlayCircle } from 'lucide-react';
import ReceiptPreview from '@/components/ReceiptPreview';
import KitchenReceipt from '@/components/KitchenReceipt';
import ReasonDialog from '@/components/ReasonDialog';
import { enqueueKot, enqueueReceipt, enqueueToken } from '@/lib/printQueue';
import { billStatus } from '@/lib/billStatus';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import ReceivePaymentButton from '@/components/ReceivePaymentButton';
import { balanceDue } from '@/lib/sales';

type ReasonAction = { type: 'void' | 'cancelled'; order: Order } | null;

const OPEN_STATUSES = new Set(['running', 'hold', 'credit_pending', 'partial', 'pending_approval']);
const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

/** Open bills, or today's paid bills (for View / Reprint only). */
function loadBills(scope: 'open' | 'paid'): Order[] {
  return getOrders().filter(o => (scope === 'open'
    ? OPEN_STATUSES.has(o.status)
    : (o.status === 'paid' || o.status === 'credit_received') && isToday(o.paidAt || o.createdAt)));
}

export default function RetrayPage() {
  const settings = getSettings();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'dining' | 'delivery' | 'takeaway'>('all');
  const [scope, setScope] = useState<'open' | 'paid'>('open');
  const [orders, setOrders] = useState(() => loadBills('open'));
  const [view, setView] = useState<Order | null>(null);
  const [kitchenView, setKitchenView] = useState<Order | null>(null);
  const [reasonFor, setReasonFor] = useState<ReasonAction>(null);

  const refresh = (next: 'open' | 'paid' = scope) => setOrders(loadBills(next));
  const switchScope = (next: 'open' | 'paid') => { setScope(next); refresh(next); };
  const holdCount = scope === 'open' ? orders.filter(o => o.status === 'hold').length : 0;

  /** Hold = finished but not paid. It stays an open bill; the table stays occupied. */
  const setHold = (o: Order, hold: boolean) => {
    saveOrder({ ...o, status: hold ? 'hold' : 'running' });
    toast.success(hold ? `Bill #${o.orderNumber} is on HOLD — UNPAID` : `Bill #${o.orderNumber} is open again`);
    refresh();
  };

  const filtered = orders
    .filter(o => tab === 'all' || o.orderType === tab)
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        o.orderNumber.toString().includes(q) ||
        (o.customer?.name || '').toLowerCase().includes(q) ||
        (o.customer?.phone || '').toLowerCase().includes(q) ||
        (o.tableName || '').toLowerCase().includes(q) ||
        (o.riderName || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const tokenPrint = (o: Order) => {
    const ok = enqueueToken(o);
    if (ok) toast.success(`Token #${o.orderNumber} sent to tandoor printer + counted in register`);
    else toast.error('No token printed — either Tandoor Token is off, no category/item is selected in Printing Center, or this order has no token items');
  };

  // Pay opens the payment screen for this bill, so the method, the amount
  // received and the change are recorded with it.
  const payNow = (o: Order) => {
    navigate(`/?retrieve=${o.id}&pay=1`);
  };

  const submitReason = (reason: string) => {
    if (!reasonFor) return;
    const { order, type } = reasonFor;
    const stamp = new Date().toISOString();
    const by = localStorage.getItem('pos-user-name') || 'admin';
    if (type === 'void') {
      saveOrder({ ...order, status: 'void', voidReason: reason, voidedAt: stamp, voidBy: by });
      toast.success(`Bill #${order.orderNumber} voided`);
    } else {
      saveOrder({ ...order, status: 'cancelled', cancelReason: reason, cancelledAt: stamp, cancelledBy: by });
      toast.success(`Bill #${order.orderNumber} cancelled`);
    }
    setReasonFor(null);
    refresh();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-primary" /> Retrieve — View, Reprint, Hold, Pay, Cancel
        </h2>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button size="sm" variant={scope === 'open' ? 'default' : 'ghost'} className="h-8 text-xs" onClick={() => switchScope('open')}>Open bills</Button>
          <Button size="sm" variant={scope === 'paid' ? 'default' : 'ghost'} className="h-8 text-xs" onClick={() => switchScope('paid')}>Paid today</Button>
        </div>
        {holdCount > 0 && (
          <Badge className="text-xs bg-status-warning text-status-warning-foreground border-status-warning font-extrabold">{holdCount} on HOLD — UNPAID</Badge>
        )}
        <Input
          placeholder="Search bill #, customer, table, rider…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({orders.length})</TabsTrigger>
          <TabsTrigger value="dining">Dining</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
          <TabsTrigger value="takeaway">Takeaway</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{scope === 'open' ? 'No open bills.' : 'No bills paid today.'}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(o => {
                const st = billStatus(o);
                const open = OPEN_STATUSES.has(o.status);
                return (
                <Card key={o.id} className={`p-4 space-y-2 ${st.key === 'hold' ? 'border-2 border-status-warning shadow-[0_0_0_3px_hsl(var(--status-warning)/0.15)]' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{o.orderNumber}</span>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {o.source === 'website' && (
                        <Badge className="text-[10px] bg-blue-500/15 text-blue-700 border-blue-500/30 border">
                          <Globe className="h-3 w-3 mr-1" /> Web Order
                        </Badge>
                      )}
                      {o.source === 'website' && !o.kotPrinted && (
                        <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30 border">
                          KOT pending
                        </Badge>
                      )}
                      <Badge className={`text-[10px] border tracking-wide ${st.className}`}>{st.label}</Badge>
                      <Badge variant="secondary" className="capitalize text-xs">{o.orderType}</Badge>
                    </div>
                  </div>
                  {o.tableName && <p className="text-xs text-muted-foreground">Table: {o.tableName}</p>}
                  {o.customer?.name && <p className="text-xs text-muted-foreground">Customer: {o.customer.name}{o.customer.phone ? ` · ${o.customer.phone}` : ''}</p>}
                  {o.orderType === 'dining' && o.waiterName && <p className="text-xs text-muted-foreground">🧑‍🍳 Waiter: <span className="font-medium text-foreground">{o.waiterName}</span></p>}
                  {o.orderType === 'delivery' && o.riderName && <p className="text-xs text-muted-foreground">🛵 Rider: <span className="font-medium text-foreground">{o.riderName}</span></p>}
                  {o.orderType === 'delivery' && !o.riderName && <p className="text-xs text-amber-700">🛵 Rider: <span className="italic">Not assigned</span></p>}
                  <p className="text-xs text-muted-foreground">{o.items.length} items</p>
                  <p className="text-sm font-bold text-primary">PKR {o.grandTotal.toLocaleString()}</p>
                  {(o.status === 'partial' || (o.amountPaid && o.amountPaid > 0)) && (
                    <p className="text-[11px] font-bold text-amber-700">
                      Paid Rs.{Number(o.amountPaid || 0).toLocaleString()} · Due Rs.{balanceDue(o).toLocaleString()}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString('en-PK')}
                    {o.paidAt && o.status !== 'running' && o.status !== 'hold' ? ` · paid ${new Date(o.paidAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setView(o)}>
                      <Eye className="h-3 w-3 mr-1" /> View
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                      const job = enqueueReceipt(o, { force: true });
                      if (job) toast.success(`Receipt #${o.orderNumber} sent to the printer.`);
                      else toast.warning(`Receipt #${o.orderNumber} was not queued — a reprint may already be in progress.`);
                    }}>
                      <Printer className="h-3 w-3 mr-1" /> Reprint
                    </Button>
                    {open && (<>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-8 text-xs ${!o.kotPrinted ? 'border-status-warning text-status-warning hover:bg-status-warning/10' : ''}`}
                      onClick={() => {
                        // The enqueue can legitimately refuse (KOT disabled, a
                        // job already queued for this order). It used to be
                        // ignored and a success toast shown regardless, so a
                        // refused KOT looked exactly like a printed one — the
                        // "I press Reprint KOT and nothing comes out" report.
                        const job = enqueueKot(o, { force: true });
                        if (job) {
                          toast.success(`KOT #${o.orderNumber} sent to the kitchen.`);
                        } else {
                          toast.warning(
                            `KOT #${o.orderNumber} was not queued. A KOT for this order may already be printing, or KOT printing is turned off in Settings.`,
                          );
                        }
                        setTimeout(refresh, 500);
                      }}
                    >
                      <ChefHat className="h-3 w-3 mr-1" /> {o.kotPrinted ? 'Reprint KOT' : 'Send to Kitchen'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => tokenPrint(o)} className="text-xs h-8">
                      🫓 Token
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-status-info text-status-info hover:bg-status-info/10"
                      onClick={() => navigate('/?retrieve=' + o.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    {o.status === 'running' && (
                      <Button size="sm" variant="outline" className="h-8 text-xs border-status-warning text-status-warning hover:bg-status-warning/10"
                        onClick={() => setHold(o, true)} title="The guest has finished but not paid yet">
                        <PauseCircle className="h-3 w-3 mr-1" /> Hold
                      </Button>
                    )}
                    {o.status === 'hold' && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setHold(o, false)} title="Open the bill again (still unpaid)">
                        <PlayCircle className="h-3 w-3 mr-1" /> Resume
                      </Button>
                    )}
                    {balanceDue(o) > 0 && (o.status === 'partial' || (o.amountPaid || 0) > 0) && (
                      <ReceivePaymentButton order={o} onUpdated={() => refresh()} />
                    )}
                    <Button size="sm" className="h-8 text-xs bg-status-success text-status-success-foreground hover:bg-status-success/90"
                      onClick={() => payNow(o)}>
                      <CreditCard className="h-3 w-3 mr-1" /> Pay
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setReasonFor({ type: 'cancelled', order: o })}>
                      <XCircle className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => setReasonFor({ type: 'void', order: o })}>
                      <Ban className="h-3 w-3 mr-1" /> Void
                    </Button>
                    </>)}
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Order #{view?.orderNumber}</DialogTitle></DialogHeader>
          {view && <ReceiptPreview order={view} settings={settings} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!kitchenView} onOpenChange={() => setKitchenView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Kitchen Slip — #{kitchenView?.orderNumber}</DialogTitle></DialogHeader>
          {kitchenView && <KitchenReceipt order={kitchenView} settings={settings} autoPrint />}
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={!!reasonFor}
        onOpenChange={(v) => { if (!v) setReasonFor(null); }}
        title={reasonFor?.type === 'void' ? 'Void Bill — Reason Required' : 'Cancel Bill — Reason Required'}
        onConfirm={submitReason}
      />
    </div>
  );
}
