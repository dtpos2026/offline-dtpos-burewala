import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Lock, Store, Shield, LogIn, Loader2, MonitorSmartphone } from 'lucide-react';
import dtLogo from '@/assets/dt-mark.png';
import { toast } from 'sonner';
import { cloudAuth, cloudDb, isCloudConfigured } from '@/lib/offlineNoCloud';
import { fetchSuperAdminRole, recordLogin, logActivity, isHardcodedOwner, type SuperAdminRole } from '@/lib/superAdminTeam';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from '@/lib/offlineNoCloud';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, onSnapshot } from '@/lib/offlineNoCloud';
import { setTenant, getDeviceMeta, enrichDeviceMeta, fetchDeviceNetworkInfo } from '@/lib/tenant';
import { effectiveDeviceLimit, setCurrentTenantPlan, setCurrentTenantOverrides } from '@/lib/plans';
import { setCurrentTenantExpiry, tsToDate, isExpired } from '@/lib/billing';
import LoginMarketingPanel, { LoginVersionBadge } from '@/components/LoginMarketingPanel';
import ContactDigitalTargetDialog from '@/components/ContactDigitalTargetDialog';

interface Props {
  onSuccess: (opts: { superAdmin: boolean }) => void;
}

const OWNER_REMEMBER_KEY = 'pos-owner-remember-email';
const OWNER_SAVED_EMAIL_KEY = 'pos-owner-saved-email';
const LOGIN_TIMEOUT_MS = 12000;
const ACCOUNT_CHECK_TIMEOUT_MS = 7000;
const DEVICE_CHECK_TIMEOUT_MS = 5000;
const DEVICE_APPROVED_KEY_PREFIX = 'pos-owner-device-approved:';

function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Request timed out'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { window.clearTimeout(t); resolve(value); },
      (error) => { window.clearTimeout(t); reject(error); },
    );
  });
}

function runInBackground(task: () => Promise<void>) {
  void task().catch((e) => console.warn('[login background]', e));
}

function approvedDeviceKey(uid: string, deviceId: string) {
  return `${DEVICE_APPROVED_KEY_PREFIX}${uid}:${deviceId}`;
}

function rememberApprovedDevice(uid: string, deviceId: string) {
  try { localStorage.setItem(approvedDeviceKey(uid, deviceId), String(Date.now())); } catch {}
}

function forgetApprovedDevice(uid: string, deviceId: string) {
  try { localStorage.removeItem(approvedDeviceKey(uid, deviceId)); } catch {}
}

function hasRecentApprovedDevice(uid: string, deviceId: string) {
  try {
    const value = Number(localStorage.getItem(approvedDeviceKey(uid, deviceId)) || 0);
    return value > 0 && Date.now() - value < 1000 * 60 * 60 * 24 * 14;
  } catch { return false; }
}

export default function OwnerLoginPage({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  // Remember Me defaults to ON — the owner's email stays saved on both Windows and Web
  // until the owner presses "Switch Account" to clear it.
  const rememberPref = typeof localStorage !== 'undefined' ? localStorage.getItem(OWNER_REMEMBER_KEY) : null;
  const initialRemember = rememberPref !== '0'; // default true
  const initialEmail = (typeof localStorage !== 'undefined' && localStorage.getItem(OWNER_SAVED_EMAIL_KEY)) || '';
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(initialRemember);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  // Pending-device wait state: keeps user signed in and listens for approval
  // so admin's approval auto-proceeds the login without re-entering credentials.
  const [pendingDevice, setPendingDevice] = useState<{ tid: string; deviceId: string; deviceName: string } | null>(null);
  const pendingUnsubRef = useRef<null | (() => void)>(null);
  useEffect(() => () => { pendingUnsubRef.current?.(); }, []);

  // Hard timeout safety net so loader never spins forever.
  useEffect(() => {
    if (!loading) { setTimedOut(false); return; }
    const t = setTimeout(() => { setTimedOut(true); setLoading(false); }, LOGIN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loading]);

  // "← Switch Account" back button — only meaningful when an email is already
  // prefilled OR a tenant was previously cached on this device. Wipes session
  // and remembered email so user can switch to a different restaurant cleanly.
  const handleSwitchAccount = async () => {
    if (loading || pendingDevice) return;
    try {
      const { forceLogoutAndWipe } = await import('@/lib/sessionIsolation');
      await forceLogoutAndWipe();
    } catch {}
    try {
      localStorage.removeItem(OWNER_REMEMBER_KEY);
      localStorage.removeItem(OWNER_SAVED_EMAIL_KEY);
    } catch {}
    setEmail(''); setPassword(''); setRemember(false);
    setInfo(null); setTimedOut(false);
    toast.info('Switched. Please sign in with another account.');
  };

  // Persist (or clear) remembered email — called after a successful login.
  const persistRememberMe = () => {
    try {
      if (remember && email) {
        localStorage.setItem(OWNER_REMEMBER_KEY, '1');
        localStorage.setItem(OWNER_SAVED_EMAIL_KEY, email);
      } else {
        // Explicitly opted-out — record '0' so we don't auto-restore next time.
        localStorage.setItem(OWNER_REMEMBER_KEY, '0');
        localStorage.removeItem(OWNER_SAVED_EMAIL_KEY);
      }
    } catch {}
  };


  const handleSubmit = async () => {
    if (!isCloudConfigured()) {
      toast.error('Owner login is disabled in the offline build.');
      return;
    }
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    if (mode === 'signup' && !restaurantName.trim()) {
      toast.error('Please enter the restaurant name');
      return;
    }
    setLoading(true);
    setInfo(null);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(cloudAuth(), email, password);
        await setDoc(doc(cloudDb(), 'userIndex', cred.user.uid), {
          tenantId: cred.user.uid,
          restaurantName: restaurantName.trim(),
          email: email.toLowerCase(),
          approved: false,
          plan: 'trial',
          createdAt: serverTimestamp(),
        });
        await signOut(cloudAuth());
        setInfo('Account created. Please wait for Super Admin restaurant approval. Log in with the same email/password after approval.');
        setLoading(false);
        return;
      }

      // LOGIN
      const devicePromise = withTimeout(enrichDeviceMeta(getDeviceMeta()), 1500, 'Device check slow').catch(() => getDeviceMeta());
      const cred = await withTimeout(
        signInWithEmailAndPassword(cloudAuth(), email.trim(), password),
        LOGIN_TIMEOUT_MS,
        'Login network slow. Check your internet and press Retry.',
      );
      const userEmail = (cred as any).user.email || email;
      const uid = (cred as any).user.uid;
      const idxRef = doc(cloudDb(), 'userIndex', uid);
      const hardcodedSuperAdmin = isHardcodedOwner(userEmail);
      const rolePromise: Promise<SuperAdminRole | null> = hardcodedSuperAdmin
        ? Promise.resolve('owner')
        : withTimeout(fetchSuperAdminRole(userEmail), 1200).catch(() => null);
      const idxPromise = hardcodedSuperAdmin
        ? Promise.resolve(null as any)
        : withTimeout(getDoc(idxRef), ACCOUNT_CHECK_TIMEOUT_MS, 'Account check slow. Retry.');
      const finishSuperAdminLogin = (adminRole: SuperAdminRole) => {
        void idxPromise.catch(() => undefined);
        runInBackground(async () => {
          await recordLogin(userEmail);
          await logActivity({ actorEmail: userEmail.toLowerCase(), actorRole: adminRole, action: 'login' });
        });
        toast.success(`Signed in as ${adminRole === 'owner' ? 'Super Admin' : adminRole + ' admin'}`);
        persistRememberMe();
        onSuccess({ superAdmin: true });
      };

      // Hardcoded Super Admin opens immediately. Team-admin lookup stays in
      // parallel and is only used if no restaurant account exists, so normal
      // restaurant login never waits on the extra admin-role read.
      const role = hardcodedSuperAdmin ? await rolePromise : null;
      if (role) {
        finishSuperAdminLogin(role);
        return;
      }

      let idxSnap: any;
      try {
        idxSnap = await idxPromise;
      } catch (e) {
        const teamRole = await rolePromise;
        if (teamRole) { finishSuperAdminLogin(teamRole); return; }
        throw e;
      }
      if (!idxSnap?.exists()) {
        const teamRole = await rolePromise;
        if (teamRole) { finishSuperAdminLogin(teamRole); return; }
      }
      const device = await devicePromise;
      // Stamp current app version on the device record so admin sees who's on which build.
      try { const { APP_VERSION } = await import('@/lib/version'); (device as any).appVersion = APP_VERSION; } catch {}

      if (!idxSnap.exists()) {
        const { forceLogoutAndWipe } = await import('@/lib/sessionIsolation');
        await forceLogoutAndWipe('Your account record was not found. Please sign up first.');
        setLoading(false);
        return;
      }

      const data = idxSnap.data() as any;

      // 1) Restaurant approval check
      if (data.approved !== true && data.restaurantApproved !== true) {
        await signOut(cloudAuth());
        setInfo('Your restaurant account is pending approval.');
        setLoading(false);
        return;
      }

      // 1b) Plan expiry check
      if (data.planExpiryAt && isExpired(data.planExpiryAt)) {
        await signOut(cloudAuth());
        const expD = tsToDate(data.planExpiryAt);
        setInfo(`Your subscription expired on ${expD ? expD.toLocaleDateString() : ''}. To renew, contact Digital Target: 0345-1873354`);
        setLoading(false);
        return;
      }

      // 2) Device check + auto-approve based on plan device limit
      const deviceRef = doc(cloudDb(), 'tenants', uid, 'devices', device.deviceId);
      const localDeviceApproved = hasRecentApprovedDevice(uid, device.deviceId);
      const deviceSnapPromise = localDeviceApproved
        ? Promise.resolve(null as any)
        : withTimeout(getDoc(deviceRef), DEVICE_CHECK_TIMEOUT_MS, 'Device check slow. Retry.');
      const deviceSnap = await deviceSnapPromise;
      const legacyId: string | undefined = data.deviceId;
      const planId: string = data.plan || 'trial';
      const customLimit: number | undefined = data.customDeviceLimit;
      const limit = effectiveDeviceLimit(planId, customLimit);

      // Steps after device is approved — moved into a helper so we can call it
      // immediately OR after a real-time approval comes through (no signOut loop).
      const finalizeAfterDeviceApproved = async () => {
        const tenantRef = doc(cloudDb(), 'tenants', uid);
        const metaRef = doc(cloudDb(), 'tenants', uid, 'meta', 'profile');
        setTenant(uid, data.restaurantName || userEmail);
        rememberApprovedDevice(uid, device.deviceId);
        setCurrentTenantPlan(data.plan || 'trial');
        setCurrentTenantOverrides(data.featureOverrides || {});
        const expD2 = tsToDate(data.planExpiryAt);
        setCurrentTenantExpiry(expD2 ? expD2.getTime() : null);

        persistRememberMe();
        setLoading(false);
        toast.success(`Welcome, ${data.restaurantName || userEmail}`);
        onSuccess({ superAdmin: false });

        runInBackground(async () => {
          const [tenantSnap, metaSnap] = await Promise.all([getDoc(tenantRef), getDoc(metaRef)]);
          if (!tenantSnap.exists()) {
            await setDoc(tenantRef, {
              name: data.restaurantName || userEmail,
              ownerUid: uid,
              ownerEmail: userEmail,
              restaurantApproved: true,
              plan: data.plan || 'basic',
              status: 'active',
              createdAt: serverTimestamp(),
            });
          }
          if (!metaSnap.exists()) {
            await setDoc(metaRef, {
              restaurantName: data.restaurantName || userEmail,
              ownerEmail: userEmail,
              plan: data.plan || 'basic',
              status: 'active',
              createdAt: serverTimestamp(),
            });
          }
          // Keep enriched fields fresh on every login (browser version, app version, etc.)
          await setDoc(deviceRef, {
            loginAt: serverTimestamp(), lastActiveAt: serverTimestamp(), lastActiveMs: Date.now(),
            browser: device.browser,
            browserVersion: device.browserVersion || null,
            os: device.os,
            deviceType: device.deviceType || null,
            platform: device.platform || null,
            appVersion: (device as any).appVersion || null,
            cpuCores: device.cpuCores || null,
            memoryGb: device.memoryGb || null,
            connectionType: device.connectionType || null,
            screen: device.screen || null,
            userAgent: navigator.userAgent,
          }, { merge: true });
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
              try {
                await setDoc(deviceRef, {
                  lat: pos.coords.latitude, lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy, geoUpdatedAt: serverTimestamp(),
                }, { merge: true });
              } catch {}
            }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
          }
        });
      };

      if (localDeviceApproved) {
        runInBackground(async () => {
          const snap = await getDoc(deviceRef);
          const dd = snap.exists() ? (snap.data() as any) : null;
          if (dd?.blocked === true || dd?.approved === false) {
            forgetApprovedDevice(uid, device.deviceId);
            const { forceLogoutAndWipe } = await import('@/lib/sessionIsolation');
            await forceLogoutAndWipe('This device needs Super Admin approval again.');
          }
        });
        await finalizeAfterDeviceApproved();
        return;
      }

      // Start a real-time listener on the pending device. As soon as Super Admin
      // approves it (or a slot opens and another tab auto-approves), proceed.
      const startPendingWait = () => {
        pendingUnsubRef.current?.();
        setPendingDevice({ tid: uid, deviceId: device.deviceId, deviceName: device.deviceName });
        setLoading(false);
        pendingUnsubRef.current = onSnapshot(deviceRef, async (snap) => {
          const dd = snap.data() as any;
          if (!dd) return;
          if (dd.blocked === true) {
            pendingUnsubRef.current?.(); pendingUnsubRef.current = null;
            setPendingDevice(null);
            await signOut(cloudAuth());
            setInfo('This device has been blocked by Super Admin. Contact Digital Target support to unblock.');
            return;
          }
          if (dd.approved === true) {
            pendingUnsubRef.current?.(); pendingUnsubRef.current = null;
            setPendingDevice(null);
            rememberApprovedDevice(uid, device.deviceId);
            try { await finalizeAfterDeviceApproved(); }
            catch (e: any) { console.error(e); toast.error(e?.message || 'Login finalize failed'); }
          }
        }, (err) => { console.warn('[device wait]', err); });
      };

      // If device exists — handle blocked, then approved/pending states
      if (deviceSnap.exists()) {
        const dd = deviceSnap.data() as any;
        if (dd.blocked === true) {
          forgetApprovedDevice(uid, device.deviceId);
          await signOut(cloudAuth());
          setInfo('This device has been blocked by Super Admin. Contact Digital Target support to unblock.');
          setLoading(false);
          return;
        }
        if (dd.approved !== true) {
          // Re-check if a slot has opened up so the pending device can auto-approve on next login
          const allDevSnap = await withTimeout(getDocs(collection(cloudDb(), 'tenants', uid, 'devices')), 2500, 'Device limit check slow. Retry.');
          const activeCount = (allDevSnap as any).docs.filter((d: any) => {
            const x = d.data() as any;
            return x.approved === true && x.blocked !== true;
          }).length;
          if (activeCount < limit) {
            await setDoc(deviceRef, { approved: true, approvedAt: serverTimestamp(), autoApproved: true }, { merge: true });
            rememberApprovedDevice(uid, device.deviceId);
          } else {
            // Stay signed-in and wait for Super Admin approval in real-time
            startPendingWait();
            return;
          }
        }
      } else if (legacyId && legacyId === device.deviceId) {
        // Legacy migration: auto-approve once
        await setDoc(deviceRef, {
          userId: uid,
          deviceName: device.deviceName,
          browser: device.browser,
          os: device.os,
          approved: true,
          createdAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          migratedFromLegacy: true,
        });
        rememberApprovedDevice(uid, device.deviceId);
      } else {
        // Brand-new device — count active devices, auto-approve if under limit
        const allDevSnap = await withTimeout(getDocs(collection(cloudDb(), 'tenants', uid, 'devices')), 2500, 'Device limit check slow. Retry.');
        const activeCount = (allDevSnap as any).docs.filter((d: any) => {
          const x = d.data() as any;
          return x.approved === true && x.blocked !== true;
        }).length;

        const underLimit = activeCount < limit;

        await setDoc(deviceRef, {
          userId: uid,
          deviceName: device.deviceName,
          browser: device.browser,
          browserVersion: device.browserVersion || null,
          os: device.os,
          deviceType: device.deviceType || null,
          platform: device.platform || null,
          appVersion: (device as any).appVersion || null,
          cpuCores: device.cpuCores || null,
          memoryGb: device.memoryGb || null,
          connectionType: device.connectionType || null,
          touchSupport: device.touchSupport ?? null,
          screen: device.screen || null,
          language: device.language || null,
          timezone: device.timezone || null,
          hostname: device.hostname || null,
          userAgent: navigator.userAgent,
          approved: underLimit,
          autoApproved: underLimit,
          createdAt: serverTimestamp(),
          ...(underLimit ? { approvedAt: serverTimestamp() } : {}),
        });

        if (underLimit) rememberApprovedDevice(uid, device.deviceId);

        runInBackground(async () => {
          const net = await fetchDeviceNetworkInfo();
          await setDoc(deviceRef, {
            ip: net.ip || null,
            city: net.city || null,
            region: net.region || null,
            country: net.country || null,
            isp: net.isp || null,
          }, { merge: true });
        });

        if (!underLimit) {
          // Stay signed-in and wait for Super Admin approval in real-time
          startPendingWait();
          return;
        }
      }

      await finalizeAfterDeviceApproved();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed');
      setTimedOut(true);
      setLoading(false);
    }
  };

  // Cancel pending-wait and fully sign out
  const cancelPendingWait = async () => {
    pendingUnsubRef.current?.(); pendingUnsubRef.current = null;
    setPendingDevice(null);
    try { await signOut(cloudAuth()); } catch {}
    setInfo(null);
  };


  
  return (
    <div
      className="min-h-screen relative overflow-hidden text-white"
      style={{ background: 'linear-gradient(135deg, #10002b 0%, #240046 45%, #3c096c 100%)' }}
    >
      {/* Decorative glows */}
      <div className="absolute top-0 -left-32 h-[28rem] w-[28rem] rounded-full bg-purple-500/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/3 h-[24rem] w-[24rem] rounded-full bg-fuchsia-600/15 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: 'radial-gradient(circle, #c9a84c 1px, transparent 1px)',
        backgroundSize: '38px 38px',
      }} />

      <LoginVersionBadge />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-2">
        <LoginMarketingPanel />

        <div className="flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-md">
            {pendingDevice ? (
              <div className="rounded-3xl border border-gold/25 bg-white/[0.04] backdrop-blur-xl p-8 shadow-elegant text-center space-y-4">
                <div className="h-16 w-16 mx-auto rounded-2xl ring-1 ring-gold/40 bg-white/5 flex items-center justify-center">
                  <MonitorSmartphone className="h-8 w-8 text-gold" />
                </div>
                <h2 className="text-2xl font-extrabold">Waiting for Device Approval</h2>
                <p className="text-sm text-white/80">
                  Your device <b>{pendingDevice.deviceName}</b> is waiting for Super Admin approval.
                  As soon as it's approved, this screen will <b>automatically proceed</b> — no need to log in again.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-white/70">
                  <Loader2 className="h-4 w-4 animate-spin" /> Live listening for approval…
                </div>
                <div className="text-[11px] text-white/50">
                  If the device limit is exceeded, contact the admin: <b>0345-1873354</b>
                </div>
                <Button variant="outline" className="w-full text-white border-white/30 hover:bg-white/10" onClick={cancelPendingWait}>
                  Cancel & Logout
                </Button>
              </div>
            ) : (
            <div className="rounded-3xl border border-gold/25 bg-white/[0.04] backdrop-blur-xl p-8 shadow-elegant">
              {(initialEmail || initialRemember) && (
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  disabled={loading || !!pendingDevice}
                  className="mb-3 inline-flex items-center gap-1 text-xs text-white/80 hover:text-white disabled:opacity-50"
                >
                  ← Switch Account
                </button>
              )}
              <div className="flex flex-col items-center text-center mb-6">
                <div className="h-16 w-16 rounded-2xl ring-1 ring-gold/40 bg-white/5 p-2 flex items-center justify-center">
                  <img src={dtLogo} alt="Digital Target" className="h-full w-full object-contain" />
                </div>
                <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
                  {mode === 'signup' ? 'Create Account' : 'Welcome Back!'}
                </h2>
                <p className="mt-1 text-sm text-white/70">
                  {mode === 'signup' ? 'Register your new restaurant' : 'Sign in to your restaurant account'}
                </p>
                <div className="mt-3 h-[1px] w-24 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              </div>

              <div className="space-y-5">
                {mode === 'signup' && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-white/70 font-bold mb-1.5 block">Restaurant Name</label>
                    <div className="relative">
                      <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                      <Input
                        type="text"
                        placeholder="My Restaurant"
                        value={restaurantName}
                        onChange={e => setRestaurantName(e.target.value)}
                        className="pl-9 h-12 bg-white/5 border-white/15 text-white placeholder:text-white/40 focus:border-gold focus:ring-gold/20"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/70 font-bold mb-1.5 block">Email / Username</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                    <Input
                      type="email"
                      placeholder="owner@restaurant.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9 h-12 bg-white/5 border-white/15 text-white placeholder:text-white/40 focus:border-gold focus:ring-gold/20"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/70 font-bold mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-9 h-12 bg-white/5 border-white/15 text-white placeholder:text-white/40 focus:border-gold focus:ring-gold/20"
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    />
                  </div>
                </div>

                {mode === 'login' && (
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={e => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-white/30 bg-white/10 accent-gold"
                    />
                    Remember my email on this device
                  </label>
                )}

                {timedOut && (
                  <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
                    <p className="font-bold mb-1">Login failed</p>
                    <p>The server is responding slowly. If your internet is stable, press Retry.</p>
                    <button
                      type="button"
                      onClick={() => { setTimedOut(false); handleSubmit(); }}
                      className="mt-2 text-xs font-bold underline"
                    >Retry</button>
                  </div>
                )}


                <Button
                  className="w-full h-12 text-sm font-bold tracking-wider text-white hover:opacity-95 shadow-lg uppercase"
                  style={{ background: 'linear-gradient(90deg, #7b2cbf 0%, #9d4edd 50%, #c77dff 100%)' }}
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  {loading ? 'Please wait…' : mode === 'signup' ? 'Request Account' : 'Sign In'}
                </Button>

                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setInfo(null); }}
                  className="w-full text-xs text-white/70 hover:text-gold transition pt-1"
                >
                  {mode === 'login' ? "New restaurant? Create an account →" : "← Already have an account? Sign in"}
                </button>

                {info && (
                  <div className="mt-2 rounded-lg border border-gold/30 bg-gold/10 p-3 text-xs text-white flex gap-2">
                    <Shield className="h-4 w-4 shrink-0 text-gold mt-0.5" />
                    <span>{info}</span>
                  </div>
                )}

                {!isCloudConfigured() && (
                  <p className="text-[10px] text-red-300 text-center pt-2">
                    ⚠ Owner login is disabled in the offline build.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setShowContact(true)}
                  className="block w-full text-center text-xs text-white/70 hover:text-white pt-2 transition"
                >
                  Need an account?{' '}
                  <span className="text-gold font-semibold underline underline-offset-2">
                    Contact Digital Target
                  </span>
                </button>

              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      <ContactDigitalTargetDialog open={showContact} onClose={() => setShowContact(false)} />

      <div className="relative z-10 text-center text-[10px] tracking-[0.3em] uppercase text-white/50 pb-4">

        © {new Date().getFullYear()} Digital Target — All Rights Reserved
      </div>
    </div>
  );
}
