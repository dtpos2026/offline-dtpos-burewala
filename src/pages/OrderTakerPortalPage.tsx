// Dedicated Order Taker portal — public URL: #/order-taker/:tenantId
// Mobile/tablet-app style UI (purple theme). Opens on web but looks like an app.
import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { initStore, getUsers, setCurrentBranchId, getSettings } from '@/lib/store';
import { getTenantId, getTenantName } from '@/lib/tenant';
import { User } from '@/lib/types';
const posLoader = () => import('@/pages/POSScreen');
const tablesLoader = () => import('@/pages/TablesPage');
const billsLoader = () => import('@/pages/RunningBillsPage');
const POSScreen = lazy(posLoader);
const TablesPage = lazy(tablesLoader);
const RunningBillsPage = lazy(billsLoader);
import AutoKotPrinter from '@/components/AutoKotPrinter';
import AutoReadyTimer from '@/components/AutoReadyTimer';
import ReadyNotificationBus from '@/components/ReadyNotificationBus';
import ReadyOrderPoller from '@/components/ReadyOrderPoller';
import ServiceCallNotifier from '@/components/ServiceCallNotifier';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { LogOut, ShoppingCart, LayoutGrid, FileText, ClipboardList, Loader2 } from 'lucide-react';

const SESSION_KEY = 'pos-order-taker-session';

export default function OrderTakerPortalPage() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const settings = ready ? getSettings() : null;
  const logo = settings?.orderTakerLogo || settings?.logo;

  // Preload all route chunks on mount so tab switches are instant (no loading spinner).
  useEffect(() => {
    posLoader(); tablesLoader(); billsLoader();
  }, []);

  useEffect(() => {
    initStore().then(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          const found = getUsers().find(x => x.id === u.id && x.role === 'order_taker' && x.isActive);
          if (found) {
            setUser(found);
            localStorage.setItem('pos-user-id', found.id);
            localStorage.setItem('pos-user-role', 'order_taker');
            try { localStorage.setItem('dt_pos_current_user', JSON.stringify({ id: found.id, name: found.name, username: found.username, role: found.role })); } catch {}
            if (found.branchId) setCurrentBranchId(found.branchId);
          }
        }
      } catch {}
      setReady(true);
    });
  }, []);

  const handleLogin = async () => {
    if (!phone || !pin) { toast.error('Phone and PIN are required'); return; }
    setLoading(true);
    try {
      await initStore();
      const digits = phone.replace(/\D/g, '');
      const u = getUsers().find(x => {
        if (x.role !== 'order_taker' || !x.isActive) return false;
        const userPhone = (x.phone || x.username || '').replace(/\D/g, '');
        const userPin = x.pin || x.password || '';
        // Phone matches last 10 digits OR full username equality
        const phoneOk = userPhone.length >= 10
          ? userPhone.slice(-10) === digits.slice(-10)
          : (x.username || '').toLowerCase() === phone.trim().toLowerCase();
        return phoneOk && userPin === pin;
      });
      if (!u) {
        toast.error('Incorrect phone or PIN — or account is not active');
        setLoading(false);
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: u.id }));
      localStorage.setItem('pos-user-id', u.id);
      localStorage.setItem('pos-user-role', 'order_taker');
      try { localStorage.setItem('dt_pos_current_user', JSON.stringify({ id: u.id, name: u.name, username: u.username, role: u.role })); } catch {}
      if (u.branchId) setCurrentBranchId(u.branchId);
      setUser(u);
      toast.success(`Welcome ${u.name}`);
    } finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('pos-user-id');
    localStorage.removeItem('pos-user-role');
    setUser(null);
    setPhone(''); setPin('');
  };




  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-violet-900 via-purple-800 to-fuchsia-900">
        <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  // ============ LOGIN SCREEN — mobile app style ============
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-900 via-purple-800 to-fuchsia-900 p-4">
        <div className="w-full max-w-[400px] bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto h-20 w-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-2xl ring-4 ring-white/20 overflow-hidden">
              {logo
                ? <img src={logo} alt="" className="h-full w-full object-cover" />
                : <ClipboardList className="h-10 w-10 text-white" />}
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Order Taker</h1>
            <p className="text-xs text-white/70">{getTenantName() || 'Restaurant'}</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Phone Number</label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="03xx-xxxxxxx"
                inputMode="tel"
                autoFocus
                className="h-12 mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl text-base"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-white/80 uppercase tracking-wider">4-Digit PIN</label>
              <Input
                type="password" inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
                className="h-12 mt-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl text-lg tracking-widest text-center"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700 text-white font-extrabold text-base shadow-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <p className="text-[10px] text-white/60 text-center pt-1">
              Set the phone and PIN with "Order Taker" role in Admin → Users.
            </p>
          </div>
          <p className="text-[10px] text-white/50 text-center pt-3 border-t border-white/10">
            Tenant: <code className="font-mono">{getTenantId()?.slice(0, 8) || 'none'}</code>
          </p>
        </div>
      </div>
    );
  }

  // ============ APP SHELL — mobile/tablet app style ============
  // Constrain to ~tablet width even on desktop browsers so it always feels like an app.
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-purple-900 to-fuchsia-950 flex justify-center">
      <div className="w-full max-w-[820px] flex flex-col h-screen bg-background shadow-2xl">
        <OrderTakerNav user={user} logo={logo} onLogout={handleLogout} />
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<div className="h-full" />}>
            <Routes>
              <Route path="/" element={<POSScreen />} />
              <Route path="/pos" element={<POSScreen />} />
              <Route path="/tables" element={<TablesPage />} />
              <Route path="/bills" element={<RunningBillsPage />} />
              <Route path="*" element={<POSScreen />} />
            </Routes>
          </Suspense>
        </div>
        <AutoKotPrinter />
        <AutoReadyTimer />
        <ReadyNotificationBus />
        <ReadyOrderPoller types={['dine-in']} />
        <ServiceCallNotifier />
      </div>
    </div>
  );
}

function OrderTakerNav({ user, logo, onLogout }: { user: User; logo?: string; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const tid = getTenantId() || '';
  const base = `/order-taker/${tid}`;
  const tabs = [
    { key: 'pos', label: 'POS', icon: ShoppingCart, path: `${base}` },
    { key: 'tables', label: 'Tables', icon: LayoutGrid, path: `${base}/tables` },
    { key: 'bills', label: 'Bills', icon: FileText, path: `${base}/bills` },
  ];
  const activeKey = location.pathname.endsWith('/tables') ? 'tables'
    : location.pathname.endsWith('/bills') ? 'bills' : 'pos';

  return (
    <>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg">
        {logo
          ? <img src={logo} alt="" className="h-8 w-8 rounded-lg object-cover ring-2 ring-white/30" />
          : <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center"><ClipboardList className="h-4 w-4" /></div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold leading-tight truncate">Order Taker</div>
          <div className="text-[10px] opacity-80 truncate">{user.name} · {getTenantName() || 'Restaurant'}</div>
        </div>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-white/20" onClick={onLogout} title="Exit">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Bottom tab bar (mobile app pattern) */}
      <div className="grid grid-cols-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-b border-white/10">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => navigate(t.path)}
            className={`flex flex-col items-center justify-center py-2 gap-0.5 transition-all ${
              activeKey === t.key
                ? 'bg-white text-violet-700 font-extrabold'
                : 'text-white/90 hover:bg-white/10'
            }`}
          >
            <t.icon className="h-4 w-4" />
            <span className="text-[10px] font-bold">{t.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
