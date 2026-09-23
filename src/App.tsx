import LicenseGate from '@/licensing/LicenseGate';
import { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { applyTheme, getActiveTheme } from '@/lib/themes';
import { enforcePremiumThemeGate } from '@/lib/premiumTheme';
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import OfflineBlocked from "@/components/OfflineBlocked";
import AdminOnly from "@/components/AdminOnly";
import SplashScreen from '@/components/SplashScreen';
import LoginPage from "@/pages/LoginPage";
import OwnerLoginPage from "@/pages/OwnerLoginPage";
import POSScreen from "@/pages/POSScreen";
// Heavy / rarely-used pages — code-split to keep initial bundle small
const TablesPage = lazy(() => import("@/pages/TablesPage"));
const RunningBillsPage = lazy(() => import("@/pages/RunningBillsPage"));
const DeliveryBoardPage = lazy(() => import("@/pages/DeliveryBoardPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const MenuManagerPage = lazy(() => import("@/pages/MenuManagerPage"));
const BackupRestorePage = lazy(() => import("@/pages/BackupRestorePage"));
const UsersRolesPage = lazy(() => import("@/pages/UsersRolesPage"));
const ReceivingPage = lazy(() => import("@/pages/ReceivingPage"));
const KitchenDisplayPage = lazy(() => import("@/pages/KitchenDisplayPage"));
const KdsTvPage = lazy(() => import("@/pages/KdsTvPage"));
const CustomerDisplayPage = lazy(() => import("@/pages/CustomerDisplayPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const SuperAdminPage = lazy(() => import("@/pages/SuperAdminPage"));
const HRPage = lazy(() => import("@/pages/HRPage"));
const AccountsPage = lazy(() => import("@/pages/AccountsPage"));
const PartyMasterPage = lazy(() => import("@/pages/PartyMasterPage"));
const WhatsAppPage = lazy(() => import("@/pages/WhatsAppPage"));
const DevicesPage = lazy(() => import("@/pages/DevicesPage"));
const MarketingPage = lazy(() => import("@/pages/MarketingPage"));
const RecipesPage = lazy(() => import("@/pages/RecipesPage"));
const RetrayPage = lazy(() => import("@/pages/RetrayPage"));
const DayClosePage = lazy(() => import("@/pages/DayClosePage"));
const PendingPaymentsPage = lazy(() => import("@/pages/PendingPaymentsPage"));
const CustomerMapPage = lazy(() => import("@/pages/CustomerMapPage"));
const WastagePage = lazy(() => import("@/pages/WastagePage"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const BranchesPage = lazy(() => import("@/pages/BranchesPage"));
const ProfitabilityPage = lazy(() => import("@/pages/ProfitabilityPage"));
const VariationsDealsPage = lazy(() => import("@/pages/VariationsDealsPage"));
const CrmInsightsPage = lazy(() => import("@/pages/CrmInsightsPage"));
const CostingReportsPage = lazy(() => import("@/pages/CostingReportsPage"));
const CreditsPage = lazy(() => import("@/pages/CreditsPage"));
const CreditCustomersPage = lazy(() => import("@/pages/CreditCustomersPage"));
const PromoCodesPage = lazy(() => import("@/pages/PromoCodesPage"));
const VoidBillsPage = lazy(() => import("@/pages/VoidBillsPage"));
const ReportsCenterPage = lazy(() => import("@/pages/ReportsCenterPage"));
const BranchesMapPage = lazy(() => import("@/pages/BranchesMapPage"));
const LiveMapPage = lazy(() => import("@/pages/LiveMapPage"));
const LiveRidersMapPage = lazy(() => import("@/pages/LiveRidersMapPage"));
const RiderAppPage = lazy(() => import("@/pages/RiderAppPage"));
const PickupOrdersPage = lazy(() => import("@/pages/PickupOrdersPage"));
const RidersListPage = lazy(() => import("@/pages/RidersListPage"));
const OnlineOrderPage = lazy(() => import("@/pages/OnlineOrderPage"));
const TrackOrderPage = lazy(() => import("@/pages/TrackOrderPage"));
const OnlinePortalPage = lazy(() => import("@/pages/OnlinePortalPage"));
const OrderTakerPortalPage = lazy(() => import("@/pages/OrderTakerPortalPage"));
const PrinterSettingsPage = lazy(() => import("@/pages/PrinterSettingsPage"));
const TokenModulePage = lazy(() => import("@/pages/TokenModulePage"));
const SalesReportPage = lazy(() => import("@/pages/SalesReportPage"));
const StaffManagementPage = lazy(() => import("@/pages/StaffManagementPage"));
const PrinterDiagnosticsPage = lazy(() => import("@/pages/PrinterDiagnosticsPage"));
const AdminSalesHistoryPage = lazy(() => import("@/pages/AdminSalesHistoryPage"));
const AuditHistoryPage = lazy(() => import("@/pages/AuditHistoryPage"));
const BillEditorPage = lazy(() => import("@/pages/BillEditorPage"));
const OnlineOrderApprovalPage = lazy(() => import("@/pages/OnlineOrderApprovalPage"));
const BlockedCustomersPage = lazy(() => import("@/pages/BlockedCustomersPage"));
const BlockedLocationsPage = lazy(() => import("@/pages/BlockedLocationsPage"));
const DailyWagesPage = lazy(() => import("@/pages/DailyWagesPage"));
const BillReprintPage = lazy(() => import("@/pages/BillReprintPage"));
const FoodpandaOrdersPage = lazy(() => import("@/pages/FoodpandaOrdersPage"));
const AdvancedReportsPage = lazy(() => import("@/pages/AdvancedReportsPage"));
const SuperAdminPortfolioPage = lazy(() => import("@/pages/SuperAdminPortfolioPage"));
const SuperAdminVersionsPage = lazy(() => import("@/pages/SuperAdminVersionsPage"));
const SuperAdminAIAssistantPage = lazy(() => import("@/pages/SuperAdminAIAssistantPage"));
const TenantVersionPage = lazy(() => import("@/pages/TenantVersionPage"));
const SuperAdminUpdateSafetyPage = lazy(() => import("@/pages/SuperAdminUpdateSafetyPage"));
const UpdateSafetyPage = lazy(() => import("@/pages/UpdateSafetyPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
import CloudPrintHost from '@/components/CloudPrintHost';
import LicenseBlockDialog from '@/components/LicenseBlockDialog';
import VersionUpdateBanner from '@/components/VersionUpdateBanner';
import { flushLocalStoreToDisk, initStore } from '@/lib/store';
import { isCloudConfigured, cloudAuth } from '@/lib/offlineNoCloud';
import { getTenantId, clearTenant } from '@/lib/tenant';
import { isPublicTenantRoute, applyPublicTenantFromUrl } from '@/lib/publicTenant';
import { verifyStartupAuth } from '@/lib/startupVerify';
import { installGlobalFaultHandlers } from '@/lib/faultLog';
import { forceLogoutAndWipe } from '@/lib/sessionIsolation';
import { onAuthStateChanged, signOut } from '@/lib/offlineNoCloud';

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
    <div className="animate-pulse">Loading…</div>
  </div>
);

const queryClient = new QueryClient();

const App = () => {
  const cloudMode = isCloudConfigured();
  // Public ordering / tracking / rider portal — bypass all auth gates, tenant comes from URL
  const isPublicOrderRoute = typeof window !== 'undefined' && isPublicTenantRoute();
  if (isPublicOrderRoute) applyPublicTenantFromUrl();

  // Stage 1 — tenant (owner) sign-in (disabled in the offline build)
  const [tenantReady, setTenantReady] = useState<boolean>(() => !cloudMode || !!getTenantId());
  const [superAdmin, setSuperAdmin] = useState<boolean>(false);
  // Stage 2 — staff sign-in (existing PIN/username flow)
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('pos-user-id'));
  const [userRole, setUserRole] = useState(() => localStorage.getItem('pos-user-role') || '');
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('pos-splash-seen'));
  const [hashTick, setHashTick] = useState(0);
  // Anything that escapes every catch in the app now leaves a line in the
  // rolling log instead of being a blank screen with no record of why.
  useEffect(() => { installGlobalFaultHandlers(); }, []);

  useEffect(() => {
    const onHash = () => setHashTick(t => t + 1);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    applyTheme(getActiveTheme());
    // Auto-revert premium theme if Super Admin revoked allotment
    setTimeout(() => enforcePremiumThemeGate(), 3000);
    // Startup auth verification — kicks invalid/deleted/disabled accounts out
    // before they ever see UI. Safe no-op if not signed in.
    if (cloudMode && !isPublicOrderRoute) {
      void verifyStartupAuth();
    }
  }, [cloudMode, isPublicOrderRoute]);

  // ===== KDS Auto-Launch =====
  // If this device is registered as a Kitchen Screen (set from Devices page),
  // jump straight to /kds-tv on every boot — perfect for Smart TVs / Android TVs
  // booting into the browser. Reads device doc once tenant is ready.
  useEffect(() => {
    if (!tenantReady || superAdmin || !ready || !loggedIn) return;
    const hash = window.location.hash || '';
    if (hash.startsWith('#/kds-tv')) return; // already there
    // Fast path: local flag (set when this device was assigned)
    const localFlag = localStorage.getItem('pos-kds-device') === '1';
    if (localFlag) {
      const k = localStorage.getItem('pos-kds-device-kitchen') || 'all';
      window.location.hash = `#/kds-tv?kitchen=${encodeURIComponent(k)}`;
      return;
    }
    // Slow path: check the cloud (handles devices assigned remotely from another machine)
    if (!cloudMode) return;
    (async () => {
      try {
        const { cloudDb } = await import('@/lib/offlineNoCloud');
        const { getDeviceId, getTenantId } = await import('@/lib/tenant');
        const { doc, getDoc } = await import('@/lib/offlineNoCloud');
        const tid = getTenantId();
        const did = getDeviceId();
        if (!tid || !did) return;
        const snap = await getDoc(doc(cloudDb(), 'tenants', tid, 'devices', did));
        const data: any = snap.exists() ? snap.data() : null;
        if (data?.isKdsDevice) {
          const k = data.kdsKitchenId || 'all';
          localStorage.setItem('pos-kds-device', '1');
          localStorage.setItem('pos-kds-device-kitchen', k);
          window.location.hash = `#/kds-tv?kitchen=${encodeURIComponent(k)}`;
        }
      } catch {}
    })();
  }, [tenantReady, superAdmin, ready, loggedIn, cloudMode]);

  // Listen for auth state changes (inert offline).
  // IMPORTANT: the auth layer can transiently emit `user=null` during token refresh
  // or offline reconnects. We must NOT force-logout in that case, otherwise
  // staff/order-taker/rider get kicked out repeatedly.
  // Only logout when:
  //   - the user intentionally signed out (flag set by logout button), OR
  //   - we never had a tenant in the first place.
  useEffect(() => {
    if (!cloudMode) return;
    const unsub = onAuthStateChanged(cloudAuth(), (user) => {
      if (user) return; // signed in — nothing to do
      const intentional = sessionStorage.getItem('pos-intentional-logout') === '1';
      const hasTenant = !!getTenantId();
      if (intentional || !hasTenant) {
        sessionStorage.removeItem('pos-intentional-logout');
        setTenantReady(false);
        setSuperAdmin(false);
        setLoggedIn(false);
        setReady(false);
      }
      // else: transient null — keep the session, auth re-reads from persistence
    });
    return () => unsub();
  }, [cloudMode]);

  // Re-init store whenever tenant becomes ready (skip for super admin — no tenant data)
  // Adds a 5s safety so a stalled init never shows "Loading data..." forever.
  const [initTimedOut, setInitTimedOut] = useState(false);
  useEffect(() => {
    if (!tenantReady || superAdmin) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setReady(false);
    setInitTimedOut(false);
    const safety = setTimeout(() => { if (!cancelled) setInitTimedOut(true); }, 20000);
    const attempt = () => {
      initStore()
        .then(() => {
          if (cancelled) return;
          setReady(true);
          setInitTimedOut(false);
        })
        .catch((e) => {
          if (cancelled) return;
          console.error('[initStore]', e);
          setInitTimedOut(true);
          retryTimer = setTimeout(attempt, 4000);
        });
    };
    attempt();
    return () => {
      cancelled = true;
      clearTimeout(safety);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [tenantReady, superAdmin]);

  // Auto-sync the installed Windows app version onto this device's record
  // so Super Admin's "Update Required" badge clears as soon as the new EXE
  // boots — no manual stamping needed.
  useEffect(() => {
    if (!cloudMode || !tenantReady || superAdmin || !ready) return;
    (async () => {
      try {
        const { getInstalledVersion } = await import('@/lib/version');
        const { getTenantId, getDeviceId, getDeviceMeta } = await import('@/lib/tenant');
        const { syncDeviceVersion } = await import('@/lib/versionAudit');
        const tid = getTenantId(); const did = getDeviceId();
        if (!tid || !did) return;
        const v = await getInstalledVersion();
        // ZERO DATA LOSS: backup BEFORE handing off to new code paths.
        try {
          const { runPreUpdateBackupIfNeeded } = await import('@/lib/updateSafety');
          await runPreUpdateBackupIfNeeded(v);
        } catch (e) { console.warn('[pre-update backup]', e); }
        const meta = getDeviceMeta();
        let restaurantName = '';
        let branchId = ''; let branchName = '';
        let updatedBy = '';
        try {
          const r = JSON.parse(localStorage.getItem('dt_pos_restaurant') || 'null');
          restaurantName = r?.name || r?.restaurantName || '';
          const u = JSON.parse(localStorage.getItem('dt_pos_current_user') || 'null');
          updatedBy = u?.name || u?.username || u?.email || '';
          const b = JSON.parse(localStorage.getItem('dt_pos_current_branch') || 'null');
          branchId = b?.id || ''; branchName = b?.name || '';
        } catch { /* ignore */ }
        await syncDeviceVersion({
          tenantId: tid,
          deviceId: did,
          installedVersion: v,
          restaurantName,
          branchId,
          branchName,
          deviceName: meta?.deviceName,
          updatedBy,
        });
      } catch (e) { console.warn('[version sync]', e); }
    })();
  }, [cloudMode, tenantReady, superAdmin, ready]);

  // Live-sync the tenant's plan from the cloud so Super Admin plan changes apply instantly.
  useEffect(() => {
    if (!cloudMode || !tenantReady || superAdmin) return;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const { cloudDb } = await import('@/lib/offlineNoCloud');
        const { getTenantId } = await import('@/lib/tenant');
        const { doc, onSnapshot } = await import('@/lib/offlineNoCloud');
        const { setCurrentTenantPlan, setCurrentTenantOverrides } = await import('@/lib/plans');
        const { setCurrentTenantExpiry, tsToDate, isExpired } = await import('@/lib/billing');
        const tid = getTenantId();
        if (!tid) return;
        unsub = onSnapshot(doc(cloudDb(), 'userIndex', tid), (snap) => {
          if (!snap.exists()) return;
          const d: any = snap.data();
          setCurrentTenantPlan(d.plan || 'trial');
          setCurrentTenantOverrides(d.featureOverrides || {});
          const expDate = tsToDate(d.planExpiryAt);
          setCurrentTenantExpiry(expDate ? expDate.getTime() : null);
          // Auto-logout when expiry hits
          if (d.planExpiryAt && isExpired(d.planExpiryAt)) {
            try { window.dispatchEvent(new CustomEvent('pos-plan-expired')); } catch {}
          }
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
  }, [cloudMode, tenantReady, superAdmin]);

  // ===== Hybrid link: device heartbeat =====
  // Runs whenever the licensed POS is open (also on the login screen), so the
  // Super Admin "online" indicator means "the POS is running and connected".
  // Never blocks the POS. With no internet the app simply stays in local mode.
  useEffect(() => {
    let stop: () => void = () => {};
    let cancelled = false;
    (async () => {
      try {
        const { startCloudLink } = await import('@/lib/cloudLink');
        const { loadLicense } = await import('@/licensing/licenseService');
        const { getInstalledVersion } = await import('@/lib/version');
        if (cancelled) return;
        stop = startCloudLink(async () => {
          const lic = await loadLicense();
          if (!lic) return null;
          let appVersion = lic.appVersion || '';
          try { appVersion = await getInstalledVersion(); } catch { /* keep stored */ }
          return {
            deviceId: lic.deviceId,
            licenseKey: lic.licenseKey,
            business: lic.businessName,
            owner: lic.ownerName,
            phone: lic.mobileNumber,
            plan: lic.plan,
            expiryDate: lic.expiryDate,
            appVersion,
            activatedAt: lic.activatedAt,
            lastActivationAt: lic.lastActivationAt || lic.activatedAt,
            installationId: lic.installationId,
            slot: lic.slot || 'legacy',
          };
        });
      } catch { /* offline build — ignore */ }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const handleSplashDone = () => {
    sessionStorage.setItem('pos-splash-seen', '1');
    setShowSplash(false);
    // Background warm-up: pre-cache product/category images so POS grid is instant.
    // Runs after splash so it doesn't delay first paint.
    (async () => {
      try {
        const { getMenuItems, getCategories } = await import('@/lib/store');
        const { preloadImages } = await import('@/lib/imageCache');
        const urls: string[] = [];
        getMenuItems().forEach((p: any) => { if (p?.image) urls.push(p.image); });
        getCategories().forEach((c: any) => { if (c?.image) urls.push(c.image); });
        preloadImages(urls);
      } catch {}
    })();
  };


  const handleOwnerLoginSuccess = (opts: { superAdmin: boolean }) => {
    if (opts.superAdmin) {
      setSuperAdmin(true);
      setTenantReady(true); // bypasses Stage-1 screen; SuperAdminPage shown below
    } else {
      setSuperAdmin(false);
      setTenantReady(true);
    }
  };

  const handleLogin = (userId: string, role: string) => {
    localStorage.setItem('pos-user-id', userId);
    localStorage.setItem('pos-user-role', role);
    setLoggedIn(true);
    setUserRole(role);
  };

  const handleLogout = async () => {
    // Mark this sign-out as intentional so the auth listener actually kicks
    // the user back to the login screen (transient nulls are ignored).
    try { sessionStorage.setItem('pos-intentional-logout', '1'); } catch {}
    setLoggedIn(false);
    setUserRole('');
    if (cloudMode) {
      setTenantReady(false);
      setSuperAdmin(false);
    }
    // Cloud mode needs hard tenant wipe. Offline Windows mode must NEVER wipe
    // restaurant data/printer settings on staff logout.
    try {
      if (cloudMode) await forceLogoutAndWipe();
      else {
        await flushLocalStoreToDisk();
        const { offlineStaffLogout } = await import('@/lib/sessionIsolation');
        await offlineStaffLogout();
      }
    } catch {}
  };

  if (showSplash && !isPublicOrderRoute) {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  // Public ordering portal — no auth required
  if (isPublicOrderRoute) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/order" element={<OnlineOrderPage />} />
                <Route path="/order/:tenantId" element={<OnlineOrderPage />} />
                <Route path="/track" element={<TrackOrderPage />} />
                <Route path="/track/:tenantId" element={<TrackOrderPage />} />
                <Route path="/rider-portal" element={<RiderAppPage />} />
                <Route path="/rider-portal/:tenantId" element={<RiderAppPage />} />
                <Route path="/order-taker" element={<OrderTakerPortalPage />} />
                <Route path="/order-taker/:tenantId/*" element={<OrderTakerPortalPage />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Stage 1: owner login (cloud mode only)
  if (cloudMode && !tenantReady) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <OwnerLoginPage onSuccess={handleOwnerLoginSuccess} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Super Admin console (no POS data, no staff login)
  if (cloudMode && superAdmin) {
    // Allow Super Admin to navigate to dedicated sub-pages via hash route
    const hash = (typeof window !== 'undefined' ? window.location.hash : '') || '';
    const superRoute = hash.replace(/^#/, '').split('?')[0];
    const isSubRoute = ['/super-portfolio','/super-versions','/super-ai','/super-update-safety'].includes(superRoute);
    const renderSuperRoute = () => {
      switch (superRoute) {
        case '/super-portfolio':     return <SuperAdminPortfolioPage />;
        case '/super-versions':      return <SuperAdminVersionsPage />;
        case '/super-ai':            return <SuperAdminAIAssistantPage />;
        case '/super-update-safety': return <SuperAdminUpdateSafetyPage />;
        default:                     return <SuperAdminPage onLogout={handleLogout} />;
      }
    };
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            {isSubRoute && (
              <div className="sticky top-0 z-50 flex items-center gap-2 px-4 py-2 bg-background border-b">
                <button
                  onClick={() => { window.location.hash = ''; }}
                  className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90"
                >
                  ← Back to Super Admin
                </button>
                <span className="text-xs text-muted-foreground">{superRoute}</span>
              </div>
            )}
            <Suspense fallback={<PageFallback />}>{renderSuperRoute()}</Suspense>
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }



  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3 max-w-sm px-6">
          {!initTimedOut ? (
            <>
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground">Loading data...</p>
            </>
          ) : (
            <>
              <div className="h-12 w-12 mx-auto rounded-full bg-amber-500/15 text-amber-600 flex items-center justify-center text-xl">⚠</div>
              <p className="text-sm font-bold">Cloud data sync is slow</p>
              <p className="text-xs text-muted-foreground">Safety lock is active — default/empty data will not open, no data has been deleted.</p>
              <div className="flex gap-2 justify-center pt-2">
                <button
                  onClick={() => window.location.reload()}
                  className="text-xs font-bold px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
                >Reload</button>
                <button
                  onClick={async () => { try { const { forceLogoutAndWipe } = await import('@/lib/sessionIsolation'); await forceLogoutAndWipe('Cache cleared. Please sign in again.'); window.location.reload(); } catch { window.location.reload(); } }}
                  className="text-xs font-bold px-3 py-1.5 rounded-md border"
                >Clear cache & Logout</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <LoginPage onLogin={handleLogin} />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Order Taker — dedicated portal only (no full POS software / sidebar)
  if (userRole === 'order_taker') {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HashRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="*" element={<OrderTakerPortalPage />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <VersionUpdateBanner />
        <Toaster />
        <Sonner />
        <CloudPrintHost />
        <LicenseBlockDialog />
        <HashRouter>

          <AppLayout userRole={userRole} onLogout={handleLogout}>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<POSScreen />} />
                <Route path="/tables" element={<TablesPage />} />
                <Route path="/bills" element={<RunningBillsPage />} />
                <Route path="/running-bills" element={<RunningBillsPage />} />
                <Route path="/delivery" element={<DeliveryBoardPage />} />
                <Route path="/pickup" element={<PickupOrdersPage />} />
                <Route path="/rider" element={<OfflineBlocked><RiderAppPage /></OfflineBlocked>} />
                <Route path="/kitchen" element={<KitchenDisplayPage />} />
                <Route path="/kds-tv" element={<KdsTvPage />} />
                <Route path="/customer-display" element={<CustomerDisplayPage />} />
                <Route path="/whatsapp" element={<WhatsAppPage />} />
                <Route path="/marketing" element={<MarketingPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/customer-map" element={<OfflineBlocked><CustomerMapPage /></OfflineBlocked>} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="/credit-customers" element={<CreditCustomersPage />} />
                <Route path="/promo-codes" element={<AdminOnly><PromoCodesPage /></AdminOnly>} />
                <Route path="/void-bills" element={<AdminOnly><VoidBillsPage /></AdminOnly>} />
                <Route path="/retray" element={<RetrayPage />} />
                <Route path="/day-close" element={<DayClosePage />} />
                <Route path="/pending-payments" element={<PendingPaymentsPage />} />
                <Route path="/bill-reprint" element={<BillReprintPage />} />
                <Route path="/foodpanda-orders" element={<FoodpandaOrdersPage />} />
                <Route path="/advanced-reports" element={<AdminOnly><AdvancedReportsPage /></AdminOnly>} />
                <Route path="/online-portal" element={<OfflineBlocked><OnlinePortalPage /></OfflineBlocked>} />

                <Route path="/online-approval" element={<OfflineBlocked><OnlineOrderApprovalPage /></OfflineBlocked>} />
                <Route path="/blocked-customers" element={<OfflineBlocked><BlockedCustomersPage /></OfflineBlocked>} />
                <Route path="/blocked-locations" element={<OfflineBlocked><BlockedLocationsPage /></OfflineBlocked>} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/profitability" element={<AdminOnly><ProfitabilityPage /></AdminOnly>} />
                <Route path="/variations" element={<VariationsDealsPage />} />
                <Route path="/crm" element={<CrmInsightsPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/costing" element={<AdminOnly><CostingReportsPage /></AdminOnly>} />
                <Route path="/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
                <Route path="/printer-settings" element={<PrinterSettingsPage />} />
                <Route path="/token-module" element={<TokenModulePage />} />
                <Route path="/sales-report" element={<SalesReportPage />} />
                <Route path="/staff" element={<AdminOnly><StaffManagementPage /></AdminOnly>} />
                <Route path="/printer-diagnostics" element={<PrinterDiagnosticsPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/recipes" element={<RecipesPage />} />
                <Route path="/wastage" element={<WastagePage />} />
                <Route path="/menu" element={<MenuManagerPage />} />
                <Route path="/backup" element={<AdminOnly><BackupRestorePage /></AdminOnly>} />
                <Route path="/receiving" element={<ReceivingPage />} />
                <Route path="/users" element={<AdminOnly><UsersRolesPage /></AdminOnly>} />
                <Route path="/hr" element={<AdminOnly><HRPage /></AdminOnly>} />
                <Route path="/accounts" element={<AdminOnly><AccountsPage /></AdminOnly>} />
                <Route path="/parties" element={<AdminOnly><PartyMasterPage /></AdminOnly>} />
                <Route path="/daily-wages" element={<AdminOnly><DailyWagesPage /></AdminOnly>} />
                <Route path="/devices" element={<OfflineBlocked><DevicesPage /></OfflineBlocked>} />
                <Route path="/branches" element={<OfflineBlocked><BranchesPage /></OfflineBlocked>} />
                <Route path="/branches-map" element={<OfflineBlocked><BranchesMapPage /></OfflineBlocked>} />
                <Route path="/live-map" element={<OfflineBlocked><LiveMapPage /></OfflineBlocked>} />
                <Route path="/live-riders" element={<OfflineBlocked><LiveRidersMapPage /></OfflineBlocked>} />
                <Route path="/riders" element={<OfflineBlocked><RidersListPage /></OfflineBlocked>} />
                <Route path="/reports-center" element={<ReportsCenterPage />} />
                <Route path="/admin-sales-history" element={<AdminOnly><AdminSalesHistoryPage /></AdminOnly>} />
                <Route path="/audit-history" element={<AdminOnly><AuditHistoryPage /></AdminOnly>} />
                <Route path="/bill-editor" element={<AdminOnly><BillEditorPage /></AdminOnly>} />
                <Route path="/super-portfolio" element={<OfflineBlocked><SuperAdminPortfolioPage /></OfflineBlocked>} />
                <Route path="/super-versions" element={<OfflineBlocked><SuperAdminVersionsPage /></OfflineBlocked>} />
                <Route path="/super-ai" element={<OfflineBlocked><SuperAdminAIAssistantPage /></OfflineBlocked>} />
                <Route path="/version" element={<OfflineBlocked><TenantVersionPage /></OfflineBlocked>} />
                <Route path="/super-update-safety" element={<OfflineBlocked><SuperAdminUpdateSafetyPage /></OfflineBlocked>} />
                <Route path="/update-safety" element={<OfflineBlocked><UpdateSafetyPage /></OfflineBlocked>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

import ErrorBoundary from '@/components/ErrorBoundary';
// LICENSE GATE — the entire app sits behind this. No screen is shown without activation.
const AppWithBoundary = () => (
  <ErrorBoundary>
    <LicenseGate>
      <App />
    </LicenseGate>
  </ErrorBoundary>
);
export default AppWithBoundary;
