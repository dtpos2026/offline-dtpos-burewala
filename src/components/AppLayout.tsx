import { t as tr, useLang as useAppLang } from '@/lib/i18n';
import { ReactNode, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, LayoutGrid, FileText, Truck, BarChart3,
  Settings, UtensilsCrossed, Database, Users, ChefHat, Menu, X,
  ZoomIn, ZoomOut, Package, LogOut, Wallet, UserCog, MessageCircle, Megaphone,
  Smartphone, ChevronDown, BookOpen, Trash2, Contact, Building2, TrendingUp,
  Percent, Layers, MapPin, Bell, Receipt, RotateCcw, Globe, Lock, Bike, Edit3, UserX, HandCoins, RefreshCw,
} from 'lucide-react';
import { getSettings, getUsers, getBranches, getCurrentBranchId, setCurrentBranchId, canSwitchBranch } from '@/lib/store';
import { isPremiumThemeActive, PREMIUM_BRAND_NAME } from '@/lib/premiumTheme';
import { cn } from '@/lib/utils';
import { PAGES, visiblePagesForUser, GROUP_ORDER, type PageGroup } from '@/lib/permissions';
import PersistentWhatsApp from '@/components/PersistentWhatsApp';
import PoweredByBrand from '@/components/PoweredByBrand';
import dtMark from '@/assets/dt-mark.png';
import NewOrderNotifier from '@/components/NewOrderNotifier';
import ServiceCallNotifier from '@/components/ServiceCallNotifier';
import AutoKotPrinter from '@/components/AutoKotPrinter';
import AutoReadyTimer from '@/components/AutoReadyTimer';
import ReadyNotificationBus from '@/components/ReadyNotificationBus';
import DTMessagesWidget from '@/components/DTMessagesWidget';
import SyncStatusBadge from '@/components/SyncStatusBadge';
import HeaderNotificationBar from '@/components/HeaderNotificationBar';
import BillingStatusBar from '@/components/BillingStatusBar';
import UpdateAvailableBanner from '@/components/UpdateAvailableBanner';
import { toast } from 'sonner';
import { prefetchHeavyRoutes } from '@/lib/routePrefetch';

const NAV_I18N: Record<string, string> = {
  'reports': 'reports', 'reports-center': 'reports', 'settings': 'settings',
  'token-module': 'tokenModule', 'printer-settings': 'printingCenter', 'tables': 'tables',
  'running-bills': 'runningBills', 'retray': 'retrieve', 'menu-manager': 'menu',
};
function navTitle(key: string, fallback: string): string {
  const k = NAV_I18N[key];
  if (!k) return fallback;
  const v = tr(k);
  return v === k ? fallback : v;
}



const ICON_MAP = {
  ShoppingCart, LayoutGrid, FileText, Truck, BarChart3, Settings,
  UtensilsCrossed, Database, Users, ChefHat, Package, Wallet, UserCog,
} as const;

const ICON_BY_KEY: Record<string, any> = {
  pos: ShoppingCart, tables: LayoutGrid,
  bills: FileText, delivery: Truck, pickup: Package, kitchen: ChefHat,
  credits: Receipt,
  'void-bills': X,
  retray: RotateCcw,
  'pending-payments': Receipt,
  'bill-reprint': Receipt,
  'foodpanda-orders': Bike,
  'advanced-reports': BarChart3,
  'token-module': FileText,
  'sales-report': BarChart3,
  staff: Users,
  'online-portal': Globe,
  
  'online-approval': Bell,
  'blocked-customers': UserX,
  'blocked-locations': MapPin,
  whatsapp: MessageCircle,
  customers: Contact,
  'customer-map': MapPin,
  crm: Users, wallet: Wallet, campaigns: Bell, zones: MapPin, promotions: Percent, variations: Layers,
  marketing: Megaphone,
  'promo-codes': Percent,
  inventory: Package, dashboard: BarChart3, reports: FileText,
  'reports-center': BarChart3, 'audit-history': FileText, 'admin-sales-history': FileText, 'bill-editor': Edit3,
  profitability: TrendingUp, costing: TrendingUp,
  menu: UtensilsCrossed, receiving: Package,
  recipes: BookOpen, wastage: Trash2,
  hr: UserCog, accounts: Wallet, parties: Users, 'daily-wages': HandCoins, settings: Settings,
  backup: Database, users: Users, devices: Smartphone, branches: Building2, version: RefreshCw,
  'branches-map': MapPin,
  'live-map': MapPin,
  'live-riders': MapPin,
  riders: Bike,
};

interface Props {
  children: ReactNode;
  userRole: string;
  onLogout: () => void;
}

function Sidebar({
  userRole, onLogout, mobileOpen, setMobileOpen, collapsed,
}: { userRole: string; onLogout: () => void; mobileOpen: boolean; setMobileOpen: (v: boolean) => void; collapsed: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = getSettings();
  const currentUserId = localStorage.getItem('pos-user-id') || '';
  const user = getUsers().find(u => u.id === currentUserId);
  const [, setPlanTick] = useState(0);
  useEffect(() => {
    const h = () => setPlanTick(t => t + 1);
    window.addEventListener('pos-plan-changed', h);
    return () => window.removeEventListener('pos-plan-changed', h);
  }, []);

  // Warm the heavy lazy chunks while the machine is idle. Recharts alone is
  // ~375 KB, and parsing it on first navigation is what froze the screen for
  // two to three seconds when moving between WhatsApp, Customers and CRM.
  // See src/lib/routePrefetch.ts — it changes no UI, data or behaviour.
  useEffect(() => { prefetchHeavyRoutes(); }, []);

  const visiblePages = visiblePagesForUser(user, !!settings.costTrackingEnabled);

  // Group pages by their group
  const grouped: Record<PageGroup, typeof visiblePages> = {
    Operations: [], Marketing: [], Inventory: [], Accounts: [], Staff: [], Reports: [], Admin: [],
  };
  visiblePages.forEach(p => {
    if (grouped[p.group]) grouped[p.group].push(p);
  });

  // Track which group is open. Default: all groups containing the active route are open.
  const activeGroup = visiblePages.find(p => p.path === location.pathname)?.group;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Default: ALL groups expanded so user sees every module up-front.
    const allOpen: Record<string, boolean> = {};
    GROUP_ORDER.forEach(g => { allOpen[g] = true; });
    try {
      const saved = localStorage.getItem('pos-sidebar-groups-v2');
      if (saved) return { ...allOpen, ...JSON.parse(saved) };
    } catch {}
    return allOpen;
  });

  // Ensure active route's group is open
  useEffect(() => {
    if (activeGroup && !openGroups[activeGroup]) {
      setOpenGroups(g => ({ ...g, [activeGroup]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  useEffect(() => {
    localStorage.setItem('pos-sidebar-groups-v2', JSON.stringify(openGroups));
  }, [openGroups]);

  const toggleGroup = (g: string) =>
    setOpenGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const handleNav = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 bg-gradient-sidebar flex flex-col transition-all duration-200",
      "lg:relative lg:translate-x-0 shadow-elegant",
      collapsed ? "lg:w-[64px]" : "lg:w-[230px]",
      "w-[230px]",
      mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
    )}>
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-2.5 h-14 border-b border-sidebar-border bg-black/20 backdrop-blur-sm",
        collapsed ? "px-2 justify-center" : "px-4"
      )}>
        {(settings.appLogo || settings.logo) ? (
          <img src={settings.appLogo || settings.logo} alt="Logo" className="h-9 w-9 object-contain rounded ring-1 ring-gold/40 shrink-0" />
        ) : (
          // No restaurant logo uploaded yet — fall back to the Digital Target mark.
          <div className="h-9 w-9 rounded bg-white/10 ring-1 ring-gold/40 flex items-center justify-center shrink-0 p-1">
            <img src={dtMark} alt="Digital Target" className="h-full w-full object-contain" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-sidebar-foreground truncate leading-tight tracking-tight">
              {isPremiumThemeActive() ? PREMIUM_BRAND_NAME : (settings.name || 'DT POS')}
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-gold/80 font-semibold">
              {isPremiumThemeActive() ? 'Premium Edition' : 'Restaurant System'}
            </div>
          </div>
        )}
        <button className="ml-auto lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto pos-scrollbar px-2 space-y-1">
        {GROUP_ORDER.map(groupName => {
          const items = grouped[groupName];
          if (!items || items.length === 0) return null;
          const isOpen = collapsed ? true : (openGroups[groupName] ?? false);

          return (
            <div key={groupName} className="space-y-0.5">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-[0.12em] font-bold text-gold/60 hover:text-gold/90 transition-smooth"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")} />
                  <span>{groupName}</span>
                </button>
              )}
              {isOpen && (
                <div className="space-y-0.5">
                  {items.map(item => {
                    const Icon = ICON_BY_KEY[item.key] || ShoppingCart;
                    const active = location.pathname === item.path;
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNav(item.path)}
                        title={collapsed ? item.title : undefined}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-smooth group relative",
                          collapsed && "justify-center px-2",
                          active
                            ? "bg-sidebar-accent text-gold shadow-sm"
                            : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                        )}
                      >
                        {active && <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-gold rounded-r-full" />}
                        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-gold" : "")} />
                        {!collapsed && <span className="truncate">{navTitle(item.key, item.title)}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>


      {/* Footer */}
      <div className="px-3 py-3 border-t border-sidebar-border bg-black/20 space-y-2">
        <PoweredByBrand collapsed={collapsed} />
        <div className={cn("flex items-center gap-2 px-1", collapsed && "justify-center")}>
          <div className="h-7 w-7 rounded-full bg-gradient-gold flex items-center justify-center text-[11px] font-bold text-primary uppercase shrink-0">
            {userRole.slice(0, 1)}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-sidebar-foreground capitalize truncate">{userRole}</div>
                <div className="text-[9px] text-gold/70 uppercase tracking-wider">Signed in</div>
              </div>
              <button
                onClick={onLogout}
                className="h-7 w-7 rounded-md text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-smooth"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {collapsed && (
          <button
            onClick={onLogout}
            className="w-full h-7 rounded-md text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-smooth"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
}

function BranchSelector() {
  const branches = getBranches().filter(b => b.isActive);
  const [current, setCurrent] = useState<string>(getCurrentBranchId() || '');
  if (branches.length === 0) return null;
  const hasActive = !!current;
  const canSwitch = canSwitchBranch();

  // Locked branch chip for non-admin/manager users (waiter / cashier / order taker)
  if (!canSwitch) {
    const branch = branches.find(b => b.id === current);
    return (
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 border bg-primary/10 border-primary/40" title="Your assigned branch (an admin can change it)">
        <Building2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold">{branch?.name || 'No branch assigned'}</span>
        <Lock className="h-3 w-3 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-md px-2 py-1 border",
      hasActive ? "bg-primary/10 border-primary/40" : "bg-destructive/10 border-destructive/40"
    )} title="Active branch — naye bills isi branch me save honge">
      <Building2 className={cn("h-3.5 w-3.5", hasActive ? "text-primary" : "text-destructive")} />
      <select
        value={current}
        onChange={e => { const v = e.target.value; setCurrentBranchId(v || null); setCurrent(v); window.location.reload(); }}
        className="h-6 text-[11px] bg-transparent border-0 outline-none font-semibold cursor-pointer"
      >
        <option value="">⚠ Select Branch</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}


/**
 * Routes that are a SCREEN rather than a workstation.
 *
 * These open full-screen on a second monitor and are read-only by design, so
 * nothing that acts on the shop's behalf may run inside them.
 */
const DISPLAY_SURFACES = ['/customer-display', '/kds-tv'];

export default function AppLayout({ children, userRole, onLogout }: Props) {
  useAppLang(); // language switch par sidebar refresh
  const location = useLocation();
  const isDisplaySurface = DISPLAY_SURFACES.some(r => location.pathname.startsWith(r));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pos-sidebar-collapsed') === '1');
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('desi-pos-zoom');
    return saved ? Number(saved) : 100;
  });

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom}%`;
    localStorage.setItem('desi-pos-zoom', String(zoom));
  }, [zoom]);

  // Live date/time ticker for the header clock pill
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem('pos-sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

  // ============ Location permission flow ============
  // Only ask once per device unless settings re-enable. Master toggle in Settings → Location & Privacy.
  useEffect(() => {
    const settings = getSettings();
    if (settings.locationTrackingEnabled === false) return;
    if (settings.trackDeviceLocation === false) return;
    const decided = localStorage.getItem('pos-location-decided');
    if (decided) return;
    if (!('geolocation' in navigator)) return;
    // Check current permission state if supported
    const askIfNeeded = () => setShowLocationPrompt(true);
    if ((navigator as any).permissions?.query) {
      (navigator as any).permissions.query({ name: 'geolocation' })
        .then((res: any) => {
          if (res.state === 'granted') {
            localStorage.setItem('pos-location-decided', 'granted');
            captureDeviceLocation();
          } else if (res.state === 'denied') {
            localStorage.setItem('pos-location-decided', 'denied');
          } else {
            askIfNeeded();
          }
        })
        .catch(() => askIfNeeded());
    } else {
      askIfNeeded();
    }
  }, []);

  const captureDeviceLocation = async () => {
    try {
      const { isCloudConfigured, cloudDb } = await import('@/lib/offlineNoCloud');
      const { getTenantId, getDeviceId } = await import('@/lib/tenant');
      const { doc, setDoc, serverTimestamp } = await import('@/lib/offlineNoCloud');
      navigator.geolocation.getCurrentPosition(
        async pos => {
          try {
            const { cacheDeviceLocation } = await import('@/lib/cloudLink');
            cacheDeviceLocation(pos);
          } catch {}
          if (!isCloudConfigured()) return;
          const tid = getTenantId(); if (!tid) return;
          const did = getDeviceId();
          await setDoc(doc(cloudDb(), 'tenants', tid, 'devices', did), {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            locationCapturedAt: serverTimestamp(),
            lastActiveMs: Date.now(),
          }, { merge: true });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000 }
      );
    } catch {}
  };

  const handleLocationAllow = () => {
    setShowLocationPrompt(false);
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem('pos-location-decided', 'granted');
        toast.success('Location enabled — restaurant and device are being tracked');
        captureDeviceLocation();
      },
      err => {
        localStorage.setItem('pos-location-decided', 'denied');
        toast.warning('Location denied — the system will still work but map features will stay off');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleLocationSkip = () => {
    setShowLocationPrompt(false);
    localStorage.setItem('pos-location-decided', 'skipped');
    toast('Location skipped — you can enable it later from Settings → Location', { icon: '⏭️' });
  };

  // Device heartbeat — update lastActiveAt every 60s for live online status
  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      try {
        const { isCloudConfigured, cloudDb } = await import('@/lib/offlineNoCloud');
        const { getTenantId, getDeviceId } = await import('@/lib/tenant');
        const { doc, setDoc, serverTimestamp } = await import('@/lib/offlineNoCloud');
        if (!isCloudConfigured()) return;
        const tid = getTenantId(); if (!tid) return;
        const did = getDeviceId();
        await setDoc(doc(cloudDb(), 'tenants', tid, 'devices', did),
          { lastActiveAt: serverTimestamp(), lastActiveMs: Date.now() }, { merge: true });
      } catch {}
    };
    beat();
    const t = setInterval(() => { if (!cancelled) beat(); }, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const currentTitle = PAGES.find(n => n.path === location.pathname)?.title || 'DT POS';
  const settings = getSettings();


  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar userRole={userRole} onLogout={onLogout} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} collapsed={collapsed} />

      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <UpdateAvailableBanner />
        {/* Top header */}
        <header className="h-12 flex items-center gap-3 px-4 border-b-2 border-sidebar-border bg-gradient-sidebar backdrop-blur-md shrink-0 shadow-md text-sidebar-foreground">
          <button className="lg:hidden text-sidebar-foreground" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <button
            className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-foreground/15 transition-smooth"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-gradient-gold shadow-[0_0_8px_rgba(255,215,0,0.6)]" />
            <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight">
              {isPremiumThemeActive() ? PREMIUM_BRAND_NAME : (settings.name || 'DT POS')} <span className="text-sidebar-foreground/70 font-medium">— {currentTitle}</span>
            </h1>
            <div className="ml-1 flex items-center gap-2">
              <HeaderNotificationBar />
              <BillingStatusBar />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <BranchSelector />

            {/* Live clock pill — sits left of zoom controls */}
            <div className="hidden md:flex items-center gap-2 bg-sidebar-foreground/10 border border-sidebar-foreground/20 rounded-md px-2.5 py-1 shadow-inner">
              <span className="text-[11px] font-bold font-mono text-sidebar-foreground tabular-nums tracking-wider">
                {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="h-3 w-px bg-sidebar-foreground/30" />
              <span className="text-[10px] font-semibold text-sidebar-foreground/85 tracking-wide">
                {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-sidebar-foreground/10 border border-sidebar-foreground/20 rounded-md px-1 py-0.5">
              <button onClick={() => setZoom(z => Math.max(70, z - 5))} className="p-1 rounded hover:bg-sidebar-foreground/20 transition-smooth" title="Zoom Out">
                <ZoomOut className="h-3.5 w-3.5 text-sidebar-foreground/85" />
              </button>
              <span className="text-[10px] font-mono text-sidebar-foreground w-9 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(130, z + 5))} className="p-1 rounded hover:bg-sidebar-foreground/20 transition-smooth" title="Zoom In">
                <ZoomIn className="h-3.5 w-3.5 text-sidebar-foreground/85" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-background relative">
          {children}
          {/* ===== BACKGROUND WORKERS RUN IN THE TILL WINDOW ONLY =====
              The Kitchen Display and the Customer Display are separate
              Electron windows running this same app, so every one of these
              was starting a SECOND copy of itself on the shop's TV.
              AutoKotPrinter is the one that hurt: it is the print-queue host,
              and its "only one host" guard is a module-level variable, which
              guards one JS context and not two windows. The cross-window lock
              behind it expires after 8 seconds, so the TV would take a job,
              mark it `printing`, render the receipt into its own hidden DOM —
              and print nothing, because the spooler call targets the till's
              window. The till then sat waiting on a job somebody else had
              claimed until the 20-second safety timeout fired, which is the
              "print late aata hai / stuck ho jaata hai" on the counter.
              (Before the second screen was made live it was worse but
              invisible: the TV's frozen order cache made it drop the job as
              an unknown order instead.)
              A display is a display. It shows what the till decides. */}
          {!isDisplaySurface && <PersistentWhatsApp />}
          {!isDisplaySurface && <NewOrderNotifier />}
          {!isDisplaySurface && <ServiceCallNotifier />}
          {!isDisplaySurface && <AutoKotPrinter />}
          {!isDisplaySurface && <AutoReadyTimer />}
          {!isDisplaySurface && <ReadyNotificationBus />}
          {/* Support chat widget — Dashboard aur Reports par hi, taake billing
              aur baqi screens par kaam me rukawat na ho. */}
          {/* Messages sirf Reports ke Dashboard par — POS/billing screens par
              yeh kabhi nazar nahi aata (cashier ka dhyan na bate). */}
          {location.pathname === '/reports' && <DTMessagesWidget />}

          {/* Hidden maintenance control — halka sa kona, sirf zarurat par.
              Sirf temporary cache saaf karta hai; bills/menu/data ko haath nahi lagata. */}
          <button
            title="Clear temporary cache (data safe)"
            aria-label="Clear cache"
            onClick={async () => {
              if (!window.confirm('Clear temporary cache and reload? Your bills and settings stay safe.')) return;
              try {
                if ('caches' in window) {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
              } catch {}
              try {
                const regs = await navigator.serviceWorker?.getRegistrations?.();
                await Promise.all((regs || []).map(r => r.unregister()));
              } catch {}
              try { sessionStorage.clear(); } catch {}
              window.location.reload();
            }}
            className="fixed bottom-1 left-1 z-40 h-5 w-5 rounded-full border border-border/40 bg-background/60 text-[9px] text-muted-foreground opacity-15 hover:opacity-100 transition-opacity"
          >
            ⟳
          </button>
        </main>
      </div>

      {/* Location permission modal — friendly explain before native prompt */}
      {showLocationPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border-2 border-primary/40 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg text-primary-foreground">
                <MapPin className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-extrabold">📍 Allow Location</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                So the restaurant and this device's location can be tracked, letting the Super Admin see branches on the map,
                and so live customer/rider tracking works.
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-[11px] space-y-1">
              <div className="flex items-center gap-2">✓ <span>Restaurant location</span></div>
              <div className="flex items-center gap-2">✓ <span>Device location (which branch it's running from)</span></div>
              <div className="flex items-center gap-2">✓ <span>Rider live tracking</span></div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLocationSkip}
                className="flex-1 h-11 rounded-lg border-2 border-border text-xs font-bold hover:bg-muted transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleLocationAllow}
                className="flex-1 h-11 rounded-lg bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-extrabold shadow-md hover:opacity-90"
              >
                ✓ Allow Location
              </button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              You can turn this ON/OFF anytime from Settings → 🔒 Location & Privacy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
