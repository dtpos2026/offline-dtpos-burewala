import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticateUser, getSettings, setCurrentBranchId, repairUsers, isSystemInitialized } from '@/lib/store';
import { dbLog } from '@/lib/electron';
import { recordLogin } from '@/lib/cloudLink';
import { Lock, User as UserIcon, LogIn, Eye, EyeOff, WifiOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import dtLogo from '@/assets/dt-mark.png';
import LoginMarketingPanel, { LoginVersionBadge } from '@/components/LoginMarketingPanel';
import ContactDigitalTargetDialog from '@/components/ContactDigitalTargetDialog';
import { APP_VERSION } from '@/lib/version';

interface Props {
  onLogin: (userId: string, role: string) => void;
}

const REMEMBER_KEY = 'pos-remember-username';
const SAVED_USERNAME_KEY = 'pos-saved-username';

export default function LoginPage({ onLogin }: Props) {
  // Remember Me defaults ON — staff username is remembered on both Windows and Web.
  const rememberPref = typeof localStorage !== 'undefined' ? localStorage.getItem(REMEMBER_KEY) : null;
  const initialRemember = rememberPref !== '0';
  const initialUsername = (typeof localStorage !== 'undefined' && localStorage.getItem(SAVED_USERNAME_KEY)) || '';
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(initialRemember);
  const [showContact, setShowContact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [initialized, setInitialized] = useState(() => { try { return isSystemInitialized(); } catch { return true; } });
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const settings = getSettings();

  // Hidden maintenance shortcut for administrators (Ctrl+Alt+Shift+R).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        setRecoveryOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogin = () => {
    setTimedOut(false);
    setLoading(true);
    const timer = setTimeout(() => { setLoading(false); setTimedOut(true); }, 25000);
    try {
      const { user, reason } = authenticateUser(username, password);
      clearTimeout(timer);
      setLoading(false);
      if (reason === 'ok' && user) {
        try { localStorage.setItem('dt_pos_current_user', JSON.stringify({ id: user.id, name: user.name, username: user.username, role: user.role })); } catch {}
        try {
          if (remember) {
            localStorage.setItem(REMEMBER_KEY, '1');
            localStorage.setItem(SAVED_USERNAME_KEY, username);
          } else {
            localStorage.setItem(REMEMBER_KEY, '0');
            localStorage.removeItem(SAVED_USERNAME_KEY);
          }
        } catch {}
        if (user.branchId && user.role !== 'admin' && user.role !== 'manager') {
          setCurrentBranchId(user.branchId);
        }
        try { recordLogin(); } catch { /* activity stats are best effort */ }
        // Login par licence ki taazgi — background me, screen rukti nahi.
        void (async () => {
          try {
            const { loadLicense } = await import('@/licensing/licenseService');
            const { verifyLicenseOnline } = await import('@/lib/cloudLink');
            const { resetPrintGuardCache, prewarmPrintGuard } = await import('@/licensing/printGuard');
            const lic = await loadLicense();
            if (lic?.licenseKey && navigator.onLine) await verifyLicenseOnline(lic.licenseKey);
            resetPrintGuardCache();
            prewarmPrintGuard();
          } catch { /* offline login must never fail here */ }
        })();
        void dbLog('INFO', 'login-success', `${user.username} (${user.role})`);
        onLogin(user.id, user.role);
        toast.success(`Welcome, ${user.name}`);
        return;
      }
      const msg =
        reason === 'not_found'    ? 'User not found' :
        reason === 'inactive'     ? 'User inactive — contact admin' :
        reason === 'bad_password' ? 'Incorrect password' :
        reason === 'no_db'        ? 'Database not loaded. Please restart the app or restore a backup.' :
                                    'Login failed';
      void dbLog('WARN', 'login-fail', `${username} — ${reason}`);
      toast.error(msg);
    } catch (e) {
      clearTimeout(timer);
      setLoading(false);
      void dbLog('ERROR', 'login-exception', String((e as any)?.message || e));
      toast.error('Login failed. Please try again.');
    }
  };

  // Recovery is hidden once a real administrator exists. It can still be
  // reached with Ctrl+Alt+Shift+R, but the store itself demands an admin
  // password before it will recreate anything.
  const runRepair = (adminPassword?: string) => {
    try {
      const r = repairUsers(adminPassword ? { adminPassword } : undefined);
      if (r.blocked) { toast.error(r.blocked); return false; }
      setInitialized(isSystemInitialized());
      toast.success(`Recovery complete — admin: ${r.admin}, cashier: ${r.cashier}`);
      return true;
    } catch {
      toast.error('Recovery failed');
      return false;
    }
  };

  const brandLogo = settings.appLogo || settings.logo || dtLogo;

  return (
    <div className="min-h-screen bg-background lg:flex">
      <LoginVersionBadge />

      {/* Left brand panel — matches LicenseGate purple theme */}
      <div className="relative hidden min-h-screen overflow-hidden bg-primary px-10 py-9 text-primary-foreground lg:flex lg:w-[42%] lg:flex-col lg:justify-between xl:px-14 xl:py-11">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-primary-glow/80 to-transparent" />
        <div className="pointer-events-none absolute -bottom-32 -right-28 h-80 w-80 rotate-12 rounded-[4rem] border border-primary-foreground/10 bg-primary-foreground/5" />
        <LoginMarketingPanel />
      </div>

      {/* Right activation-style form */}
      <section className="flex min-h-screen flex-1 flex-col px-5 py-5 sm:px-8 lg:px-10 lg:py-8 xl:px-14">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-xl bg-primary p-2 ring-1 ring-primary/20 shadow-elegant">
                <img src={brandLogo} alt="Logo" className="h-full w-full object-contain" />
              </div>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Welcome Back</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sign in to your restaurant account</p>
              <div className="mt-3 h-[1px] w-20 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Username</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Enter your username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="h-11 border-input bg-background pl-9 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring/20"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-11 border-input bg-background pl-9 pr-10 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-ring/20"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="accent-primary h-4 w-4 rounded border-input"
                  />
                  <span className="text-muted-foreground">Remember me</span>
                </label>
                <button type="button" onClick={() => setShowContact(true)} className="font-semibold text-primary hover:underline">
                  Contact Admin
                </button>
              </div>

              <Button
                className="h-11 w-full bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
                onClick={handleLogin}
                disabled={loading}
              >
                <LogIn className="mr-2 h-4 w-4" /> {loading ? 'Signing in…' : 'Sign In'}
              </Button>

              {timedOut && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="mb-1 font-bold">Login failed</p>
                  <p>Login is slow. Check your internet/cache or press Retry.</p>
                  <button
                    type="button"
                    onClick={() => { setTimedOut(false); handleLogin(); }}
                    className="mt-2 text-xs font-bold underline"
                  >Retry</button>
                </div>
              )}

              <div className="rounded-md border border-primary/15 bg-secondary p-3 text-xs text-secondary-foreground">
                <div className="mb-1 flex items-center gap-2 font-semibold text-primary">
                  <WifiOff className="h-3.5 w-3.5" /> Offline Login
                </div>
                <p className="text-muted-foreground">This POS works without internet. Users are stored locally on this computer.</p>
                {!initialized && (
                  <p className="mt-1.5 text-muted-foreground">
                    No account exists yet — use the first-time setup link below to create the administrator.
                  </p>
                )}
              </div>

              {/* First install only — once a real admin exists this disappears. */}
              {!initialized && (
                <button
                  type="button"
                  onClick={() => runRepair()}
                  className="block w-full pt-1 text-center text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Create default administrator (first-time setup)
                </button>
              )}
            </div>
          </div>

          <footer className="mt-5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>© {new Date().getFullYear()} Digital Target — All Rights Reserved</span>
            <span className="rounded-full border px-2 py-0.5 font-semibold text-primary">v{APP_VERSION}</span>
          </footer>
        </div>
      </section>

      <ContactDigitalTargetDialog open={showContact} onClose={() => setShowContact(false)} />

      {/* Administrator recovery — reachable only via Ctrl+Alt+Shift+R */}
      {recoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-elegant">
            <h3 className="text-base font-bold text-foreground">Administrator Recovery</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter an administrator password to repair or recreate the default admin / cashier accounts.
            </p>
            <Input
              type="password"
              autoFocus
              placeholder="Administrator password"
              value={recoveryPassword}
              onChange={e => setRecoveryPassword(e.target.value)}
              className="mt-3 h-10"
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                if (runRepair(recoveryPassword)) { setRecoveryPassword(''); setRecoveryOpen(false); }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setRecoveryPassword(''); setRecoveryOpen(false); }}>Cancel</Button>
              <Button
                onClick={() => { if (runRepair(recoveryPassword)) { setRecoveryPassword(''); setRecoveryOpen(false); } }}
              >Run Recovery</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
