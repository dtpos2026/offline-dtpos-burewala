// ============================================================
// A running / hold bill as a card (Retrieve, Modern style).
//
// The same actions as the Classic card, in the same handlers — only ordered
// by how often they are used: Pay is the one big button, Edit sits beside it,
// and everything else lives under ⋯. Nothing here decides anything; every
// button calls the function the page passes in.
// ============================================================
import type { ReactNode } from 'react';
import { Ban, ChefHat, CreditCard, Eye, History, MoreHorizontal, Pause, Play, RotateCcw, Ticket } from 'lucide-react';
import type { Order } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { StatusBadge, type Tone } from '@/components/ui-kit';
import { balanceDue } from '@/lib/sales';
import { cn } from '@/lib/utils';

export interface BillCardActions {
  onView: (o: Order) => void;
  onHistory: (o: Order) => void;
  onKot: (o: Order) => void;
  onToken: (o: Order) => void;
  onEdit: (o: Order) => void;
  onPay: (o: Order) => void;
  onHold: (o: Order) => void;
  onResume: (o: Order) => void;
  onCancel: (o: Order) => void;
}

interface Props extends BillCardActions {
  order: Order;
  tableName?: string;
  canTakePayment: boolean;
  /** The "receive part payment" control, when it applies to this bill. */
  receivePayment?: ReactNode;
}

const STATUS_TONE: Record<string, { tone: Tone; edge: string; label: string }> = {
  running: { tone: 'success', edge: 'bg-[hsl(var(--status-success))]', label: 'Running' },
  hold: { tone: 'warning', edge: 'bg-[hsl(var(--status-warning))]', label: 'On hold' },
  partial: { tone: 'warning', edge: 'bg-[hsl(var(--status-warning))]', label: 'Part paid' },
  pending_approval: { tone: 'info', edge: 'bg-[hsl(var(--status-info))]', label: 'Awaiting approval' },
  credit_pending: { tone: 'accent', edge: 'bg-primary', label: 'Credit' },
};

export default function ModernBillCard(p: Props) {
  const { order } = p;
  const st = STATUS_TONE[order.status] || { tone: 'neutral' as Tone, edge: 'bg-border', label: order.status };
  const unpaid = (order.amountPaid || 0) <= 0 && order.status !== 'paid';
  const isRunning = order.status === 'running';
  const paidSome = order.status === 'partial' || (order.amountPaid || 0) > 0;
  const when = new Date(order.createdAt);
  const meta = [
    p.tableName,
    order.orderType ? order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1) : '',
    when.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
  ].filter(Boolean).join(' · ');

  return (
    <article
      data-bill-card={order.orderNumber}
      className="relative flex flex-col overflow-hidden rounded-[var(--ui-radius-card,1rem)] border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', st.edge)} />
      <div className="flex flex-1 flex-col gap-3 p-4 pl-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold leading-tight tracking-tight">#{order.orderNumber}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{meta}</div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {unpaid && <StatusBadge tone="danger" dot={false}>Unpaid</StatusBadge>}
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
          </div>
        </header>

        {(order.waiterName || order.orderType === 'delivery' || order.customer?.name) && (
          <div className="space-y-0.5 text-[12.5px] text-muted-foreground">
            {order.orderType === 'dining' && order.waiterName && <div>Waiter: <span className="font-semibold text-foreground">{order.waiterName}</span></div>}
            {order.orderType === 'delivery' && (
              order.riderName
                ? <div>Rider: <span className="font-semibold text-foreground">{order.riderName}</span>{order.riderPhone ? ` · ${order.riderPhone}` : ''}</div>
                : <div className="text-amber-700">Rider: not assigned yet</div>
            )}
            {order.customer?.name && <div>Customer: <span className="font-semibold text-foreground">{order.customer.name}</span></div>}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
          <div className="text-[12.5px] text-muted-foreground">
            <div>{order.items.length} item{order.items.length === 1 ? '' : 's'}</div>
            {order.cashierName && <div className="truncate">{order.cashierName}</div>}
          </div>
          <div className="text-right">
            <div className="text-[20px] font-extrabold leading-none tracking-tight tabular-nums">PKR {order.grandTotal.toLocaleString()}</div>
            {paidSome && (
              <div className="mt-1 text-[12px] font-semibold text-amber-700">
                Paid Rs.{Number(order.amountPaid || 0).toLocaleString()} · Due Rs.{balanceDue(order).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center gap-2">
          {p.canTakePayment && (
            <Button size="sm" onClick={() => p.onPay(order)} className="h-10 flex-1 bg-[hsl(var(--status-success))] text-[hsl(var(--status-success-foreground))] hover:bg-[hsl(var(--status-success)/0.9)]">
              <CreditCard className="h-4 w-4" /> Pay
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => p.onEdit(order)} className={cn('h-10', !p.canTakePayment && 'flex-1')}>
            <RotateCcw className="h-4 w-4" /> Edit
          </Button>
          {p.receivePayment}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label={`More actions for bill ${order.orderNumber}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => p.onView(order)}><Eye className="mr-2 h-4 w-4" /> View bill</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => p.onHistory(order)}><History className="mr-2 h-4 w-4" /> History</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => p.onKot(order)}><ChefHat className="mr-2 h-4 w-4" /> {order.kotPrinted ? 'Reprint KOT' : 'Send to kitchen'}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => p.onToken(order)}><Ticket className="mr-2 h-4 w-4" /> Print token</DropdownMenuItem>
              <DropdownMenuSeparator />
              {isRunning
                ? <DropdownMenuItem onSelect={() => p.onHold(order)}><Pause className="mr-2 h-4 w-4" /> Put on hold</DropdownMenuItem>
                : <DropdownMenuItem onSelect={() => p.onResume(order)}><Play className="mr-2 h-4 w-4" /> Resume</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => p.onCancel(order)} className="text-destructive focus:text-destructive"><Ban className="mr-2 h-4 w-4" /> Cancel bill</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      </div>
    </article>
  );
}
