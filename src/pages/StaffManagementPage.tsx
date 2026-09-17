// ============================================================
// STAFF MANAGEMENT — Waiters + Riders ka mukammal module.
// Add / Edit / Delete / Active-Inactive, phone, bike number, PIN.
// When a rider is assigned, their name+phone print on the receipt.
// (Previously the Riders tab only showed in online mode —
//  now it works fully offline too.)
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Trash2, Phone, Bike, User, Search, Power } from 'lucide-react';
import {
  getWaiters, saveWaiter, deleteWaiter,
  getRiders, saveRider, deleteRider,
  getOrders, genId,
} from '@/lib/store';
import type { Waiter, Rider, Order } from '@/lib/types';

type Tab = 'waiters' | 'riders';

export default function StaffManagementPage() {
  const [tab, setTab] = useState<Tab>('waiters');
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);

  const refresh = () => {
    setWaiters(getWaiters().slice());
    setRiders(getRiders().slice());
    try { setOrders(getOrders()); } catch {}
  };
  useEffect(() => { refresh(); }, []);

  // Lifetime stats (orders se live)
  const stats = useMemo(() => {
    const w = new Map<string, number>();
    const r = new Map<string, { count: number; amount: number }>();
    for (const o of orders) {
      const wid = (o as any).waiterId;
      if (wid) w.set(wid, (w.get(wid) || 0) + 1);
      const rid = (o as any).riderId;
      if (rid) {
        const row = r.get(rid) || { count: 0, amount: 0 };
        row.count++; row.amount += Number((o as any).grandTotal || 0);
        r.set(rid, row);
      }
    }
    return { waiterOrders: w, riderOrders: r };
  }, [orders]);

  // ===== Waiters =====
  const addWaiter = () => {
    const w: Waiter = { id: genId(), name: 'New Waiter', phone: '', isActive: true };
    saveWaiter(w); refresh();
    toast.success('Waiter added — enter name and phone');
  };
  const patchWaiter = (w: Waiter, patch: Partial<Waiter>) => {
    const next = { ...w, ...patch };
    setWaiters(prev => prev.map(x => x.id === w.id ? next : x));
    saveWaiter(next);
  };

  // ===== Riders =====
  const addRider = () => {
    const r: Rider = { id: genId(), name: 'New Rider', phone: '', isActive: true, pin: '0000' } as Rider;
    saveRider(r); refresh();
    toast.success('Rider added — enter name, phone and bike number');
  };
  const patchRider = (r: Rider, patch: Partial<Rider>) => {
    const next = { ...r, ...patch } as Rider;
    setRiders(prev => prev.map(x => x.id === r.id ? next : x));
    saveRider(next);
  };

  const fWaiters = waiters.filter(w => !q || (w.name + ' ' + (w.phone || '')).toLowerCase().includes(q.toLowerCase()));
  const fRiders = riders.filter(r => !q || (r.name + ' ' + (r.phone || '') + ' ' + ((r as any).bikeNumber || '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">👥 Staff Management</h1>
          <p className="text-xs text-muted-foreground">Waiters and Riders — add, edit, active/inactive</p>
        </div>
        <Button size="sm" onClick={tab === 'waiters' ? addWaiter : addRider}>
          <Plus className="h-4 w-4 mr-1" /> {tab === 'waiters' ? 'Add Waiter' : 'Add Rider'}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <button onClick={() => setTab('waiters')}
            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${tab === 'waiters' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-transparent'}`}>
            <User className="h-4 w-4 inline mr-1" /> Waiters ({waiters.length})
          </button>
          <button onClick={() => setTab('riders')}
            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${tab === 'riders' ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 border-transparent'}`}>
            <Bike className="h-4 w-4 inline mr-1" /> Riders ({riders.length})
          </button>
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Search by name or phone…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {/* ===== WAITERS ===== */}
      {tab === 'waiters' && (
        <div className="space-y-2">
          {fWaiters.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No waiters — click "Add Waiter" above.
            </Card>
          )}
          {fWaiters.map(w => (
            <Card key={w.id} className={`p-3 ${w.isActive === false ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Input className="h-9 flex-1 min-w-[140px] font-semibold" value={w.name}
                  onChange={e => patchWaiter(w, { name: e.target.value })} placeholder="Waiter ka naam" />
                <div className="relative w-40">
                  <Phone className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-9 pl-7" value={w.phone || ''} placeholder="Phone"
                    onChange={e => patchWaiter(w, { phone: e.target.value })} />
                </div>
                <span className="text-[11px] px-2 py-1 rounded bg-muted font-mono">
                  {stats.waiterOrders.get(w.id) || 0} orders
                </span>
                <Button size="sm" variant={w.isActive === false ? 'outline' : 'secondary'}
                  onClick={() => patchWaiter(w, { isActive: !(w.isActive !== false) })}>
                  <Power className="h-3.5 w-3.5 mr-1" /> {w.isActive === false ? 'Inactive' : 'Active'}
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={() => { if (window.confirm(`Delete "${w.name}"?`)) { deleteWaiter(w.id); refresh(); toast.success('Waiter deleted'); } }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ===== RIDERS ===== */}
      {tab === 'riders' && (
        <div className="space-y-2">
          <Card className="p-3 bg-muted/30">
            <p className="text-[11px] text-muted-foreground">
              💡 Assign a rider to a delivery order (from the Delivery Board) — their <b>name and phone number</b> will print on the customer's receipt
              will be printed automatically in "Delivery Information".
            </p>
          </Card>
          {fRiders.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No riders — click "Add Rider" above.
            </Card>
          )}
          {fRiders.map(r => {
            const st = stats.riderOrders.get(r.id) || { count: 0, amount: 0 };
            return (
              <Card key={r.id} className={`p-3 space-y-2 ${r.isActive === false ? 'opacity-60' : ''}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input className="h-9 flex-1 min-w-[140px] font-semibold" value={r.name}
                    onChange={e => patchRider(r, { name: e.target.value })} placeholder="Rider ka naam" />
                  <div className="relative w-40">
                    <Phone className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-9 pl-7" value={r.phone || ''} placeholder="Phone"
                      onChange={e => patchRider(r, { phone: e.target.value })} />
                  </div>
                  <Button size="sm" variant={r.isActive === false ? 'outline' : 'secondary'}
                    onClick={() => patchRider(r, { isActive: !(r.isActive !== false) })}>
                    <Power className="h-3.5 w-3.5 mr-1" /> {r.isActive === false ? 'Inactive' : 'Active'}
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { if (window.confirm(`Delete "${r.name}"?`)) { deleteRider(r.id); refresh(); toast.success('Rider deleted'); } }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative w-40">
                    <Bike className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-8 pl-7 text-xs" value={(r as any).bikeNumber || ''} placeholder="Bike number"
                      onChange={e => patchRider(r, { bikeNumber: e.target.value } as any)} />
                  </div>
                  <Input className="h-8 w-24 text-xs" value={(r as any).pin || '0000'} placeholder="PIN" maxLength={4}
                    onChange={e => patchRider(r, { pin: e.target.value.replace(/\D/g, '').slice(0, 4) } as any)} />
                  <span className="text-[11px] px-2 py-1 rounded bg-muted font-mono">
                    {st.count} deliveries · {st.amount.toLocaleString()}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
