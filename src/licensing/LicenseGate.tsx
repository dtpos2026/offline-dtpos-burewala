import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  ChefHat,
  CircleHelp,
  CloudOff,
  Copy,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  Store,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  evaluateGate,
  activate,
  clearLicense,
  getHardwareId,
  buildActivationReceipt,
  type GateState,
  type StoredLicense,
} from '@/licensing/licenseService';
import { PLAN_LABEL, verifyLicenseKey } from '@/licensing/licenseKey';
import { APP_VERSION } from '@/lib/version';
import { Button } from '@/components/ui/button';
import dtLogo from '@/assets/dt-mark.png';

const SUPPORT_EMAIL = 'digitaltarget.digital@gmail.com';
const SUPPORT_WHATSAPP = '923451873354';

const BENEFITS = [
  { icon: Zap, label: 'Fast & Reliable POS' },
  { icon: WifiOff, label: 'Works Fully Offline' },
  { icon: ShieldCheck, label: 'Secure & Encrypted' },
  { icon: Building2, label: 'Multi-Branch Support' },
  { icon: BarChart3, label: 'Real-time Reporting' },
];

function BrandPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-primary px-10 py-9 text-primary-foreground lg:flex lg:w-[35%] lg:flex-col lg:justify-between xl:px-14 xl:py-11">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-primary-glow/80 to-transparent" />
      <div className="pointer-events-none absolute -bottom-32 -right-28 h-80 w-80 rotate-12 rounded-[4rem] border border-primary-foreground/10 bg-primary-foreground/5" />

      <div className="relative">
        <div className="flex items-center gap-4">
          <img src={dtLogo} alt="Digital Target" className="h-16 w-16 rounded-lg object-contain" />
          <div className="leading-none">
            <p className="text-2xl font-bold">DIGITAL</p>
            <p className="mt-1 text-2xl font-bold">TARGET</p>
          </div>
        </div>

        <div className="mt-7 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary-foreground/70">
          <span className="h-px flex-1 bg-primary-foreground/25" />
          Smart POS Solutions
          <span className="h-px flex-1 bg-primary-foreground/25" />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-2 text-xs">
          <span className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2"><Store className="h-4 w-4" /> Restaurant</span>
          <span className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2"><Building2 className="h-4 w-4" /> Multi-Branch</span>
          <span className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2"><ChefHat className="h-4 w-4" /> Kitchen</span>
          <span className="flex items-center gap-2 rounded-md bg-primary-foreground/10 px-3 py-2"><BarChart3 className="h-4 w-4" /> Reports</span>
        </div>

        <div className="mt-9 space-y-4">
          {BENEFITS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm font-medium">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary-foreground/10">
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="relative border-t border-primary-foreground/15 pt-5">
        <p className="text-lg font-semibold italic">Smarter Business with Digital Target</p>
        <p className="mt-2 text-xs text-primary-foreground/65">Professional restaurant management, built for speed.</p>
      </div>
    </aside>
  );
}

function ProductHeader() {
  return (
    <header className="flex items-center gap-4">
      <img src={dtLogo} alt="DT POS Enterprise" className="h-16 w-16 rounded-xl bg-primary object-contain p-1 shadow-elegant sm:h-20 sm:w-20" />
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
          DT POS <span className="text-primary-glow">Enterprise</span>
        </h1>
        <p className="mt-1 text-sm font-medium text-muted-foreground sm:text-base">Powered by Digital Target</p>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground lg:flex">
      <BrandPanel />
      <section className="flex min-h-screen flex-1 flex-col px-5 py-5 sm:px-8 lg:px-10 lg:py-8 xl:px-14">
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <ProductHeader />
          {children}
        </div>
      </section>
    </main>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex items-center gap-3 rounded-md border border-primary/15 bg-secondary px-4 py-3 text-sm font-medium text-secondary-foreground">
      <CloudOff className="h-5 w-5 shrink-0 text-primary" />
      {children}
    </div>
  );
}

const fieldClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/20';

function FooterStrip() {
  return (
    <footer className="mt-5 grid gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:grid-cols-3">
      <div className="flex items-center gap-2"><img src={dtLogo} alt="Digital Target" className="h-8 w-8 object-contain" /><span><strong className="block text-foreground">DT POS Enterprise v{APP_VERSION}</strong>Offline Mode</span></div>
      <div className="space-y-1"><span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary" /> +92 345 1873354</span><span className="flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5 text-primary" /> +92 332 2373354</span></div>
      <div className="space-y-1"><span className="flex items-center gap-2 break-all"><Mail className="h-3.5 w-3.5 shrink-0 text-primary" /> {SUPPORT_EMAIL}</span><span className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-primary" /> Digital Target Support</span></div>
    </footer>
  );
}

function ActivationScreen({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ businessName: '', ownerName: '', mobileNumber: '', licenseKey: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  // Live read of the typed key: plan, allowed computers and expiry, all offline.
  const [preview, setPreview] = useState<{ plan: string; maxDevices: number; expiry: string } | null>(null);

  useEffect(() => { void getHardwareId().then(setHardwareId); }, []);

  useEffect(() => {
    const key = form.licenseKey.trim();
    if (key.length < 12) { setPreview(null); return; }
    let live = true;
    const timer = setTimeout(async () => {
      const r = await verifyLicenseKey(key);
      if (!live) return;
      setPreview(r.ok && r.payload
        ? {
            plan: PLAN_LABEL[r.payload.plan] || r.payload.plan,
            maxDevices: r.payload.maxDevices,
            expiry: r.payload.expiryDate ? new Date(r.payload.expiryDate).toLocaleDateString() : 'Lifetime',
          }
        : null);
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [form.licenseKey]);

  const submit = async () => {
    setError('');
    if (!form.businessName.trim() || !form.ownerName.trim() || !form.mobileNumber.trim() || !form.licenseKey.trim()) {
      setError('Please complete all fields.');
      return;
    }
    setBusy(true);
    const result = await activate({ ...form, licenseKey: form.licenseKey.trim().toUpperCase() }, APP_VERSION);
    if (result.ok) {
      try { setReceipt(await buildActivationReceipt()); } catch { onDone(); }
      setBusy(false);
      return;
    }
    setBusy(false);
    setError(result.message || 'Activation failed');
  };

  if (receipt) {
    const waText = encodeURIComponent(`DT POS activated ✅\n${form.businessName.trim()}\n\nActivation code:\n${receipt}`);
    return (
      <AppShell>
        <InfoBanner>License activated successfully. Your POS is ready to use offline.</InfoBanner>
        <div className="mt-4 rounded-md border border-border bg-card p-5 shadow-card sm:p-7">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-status-success text-status-success-foreground"><Check className="h-5 w-5" /></span><div><h2 className="text-xl font-bold">Activation complete</h2><p className="text-sm text-muted-foreground">Send this code once to register your shop for support.</p></div></div>
          <textarea readOnly value={receipt} rows={4} onFocus={event => event.currentTarget.select()} className="mt-5 w-full resize-none rounded-md border border-input bg-muted p-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(receipt); }}><Copy /> Copy code</Button>
            <Button variant="outline" onClick={() => { const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${waText}`; window.open(url, '_blank', 'noopener'); }}><MessageCircle /> Send on WhatsApp</Button>
          </div>
          <div className="mt-4 rounded-md border border-primary/20 bg-secondary p-4 text-sm">
            <p className="font-semibold text-foreground">Sign in to DT POS</p>
            <p className="mt-1 text-muted-foreground">Username <strong className="text-foreground">admin</strong> · Password <strong className="text-foreground">admin123</strong> — change it later in Users &amp; Roles.</p>
            <p className="mt-2 text-xs text-muted-foreground">This computer is now remembered. The license is never asked for again on this machine.</p>
          </div>
          <Button size="lg" className="mt-3 w-full bg-gradient-primary shadow-elegant" onClick={onDone}>Open DT POS</Button>
        </div>
        <FooterStrip />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <InfoBanner>Activation is required to run the software · works fully offline.</InfoBanner>
      <section className="mt-4 rounded-md border border-border bg-card p-5 shadow-card sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground"><LockKeyhole className="h-5 w-5" /></span>
          <div><h2 className="text-xl font-bold sm:text-2xl">Activate License</h2><p className="text-xs text-muted-foreground">Enter your business details and license key</p></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">Business Name</span><input className={fieldClass} autoFocus placeholder="Your restaurant or business name" value={form.businessName} onChange={event => setForm({ ...form, businessName: event.target.value })} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">Owner Name</span><input className={fieldClass} placeholder="Owner's full name" value={form.ownerName} onChange={event => setForm({ ...form, ownerName: event.target.value })} /></label>
          <label><span className="mb-1.5 block text-xs font-semibold">Mobile Number</span><input className={fieldClass} inputMode="tel" placeholder="03XX XXXXXXX" value={form.mobileNumber} onChange={event => setForm({ ...form, mobileNumber: event.target.value })} /></label>
          
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold">License Key</span><div className="relative"><KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-primary" /><input className={`${fieldClass} pl-10 font-mono uppercase`} placeholder="DTPOS-XXXX-XXXX-XXXX-XXXX" value={form.licenseKey} onChange={event => setForm({ ...form, licenseKey: event.target.value.toUpperCase() })} onKeyDown={event => { if (event.key === 'Enter') void submit(); }} /></div></label>
        </div>

        {preview && (
          <div className="mt-4 rounded-md border border-primary/20 bg-secondary p-4 text-sm">
            <p className="font-semibold text-foreground">Key verified · {preview.plan}</p>
            <p className="mt-1 text-muted-foreground">
              Allowed computers: <strong className="text-foreground">{preview.maxDevices}</strong> · Expiry: <strong className="text-foreground">{preview.expiry}</strong>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {preview.maxDevices === 1
                ? 'This key belongs to one computer. If it is already running on another PC, Digital Target must approve this machine before you use it here.'
                : `This key can run on ${preview.maxDevices} computers. Send your activation code so Digital Target can register this machine.`}
            </p>
          </div>
        )}

        {error && <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</div>}

        <Button size="lg" className="mt-5 w-full bg-gradient-primary text-base shadow-elegant" disabled={busy} onClick={() => { void submit(); }}>
          {busy ? <><RefreshCw className="animate-spin" /> Verifying…</> : <><ShieldCheck /> Activate License</>}
        </Button>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-primary" /> Need help? Contact Digital Target Support</span>
          <button type="button" className="flex items-center gap-1.5 font-mono text-[11px] hover:text-foreground" title="Copy device ID" onClick={() => { if (hardwareId) void navigator.clipboard?.writeText(hardwareId); }}>
            <Copy className="h-3.5 w-3.5" /> {hardwareId || 'Generating…'}
          </button>
        </div>
      </section>
      <FooterStrip />
    </AppShell>
  );
}

function BlockedScreen({ reason, message, license, onRetry }: { reason: string; message: string; license?: StoredLicense; onRetry: () => void }) {
  const [hardwareId, setHardwareId] = useState('');
  useEffect(() => { void getHardwareId().then(setHardwareId); }, []);
  return (
    <AppShell>
      <InfoBanner>This license needs attention before DT POS can open.</InfoBanner>
      <section className="mt-4 rounded-md border border-border bg-card p-6 shadow-card">
        <div className="text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-destructive text-destructive-foreground"><LockKeyhole className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-bold">License Blocked</h2><p className="mt-2 text-sm text-muted-foreground">{message}</p><p className="mt-1 text-xs font-semibold uppercase text-destructive">{reason}</p></div>
        {license && <div className="mt-5 space-y-2 rounded-md bg-muted p-4 text-sm"><Row label="Business" value={license.businessName} /><Row label="License" value={license.licenseKey} mono /><Row label="Plan" value={PLAN_LABEL[license.plan] || license.plan} />{license.expiryDate && <Row label="Expiry" value={new Date(license.expiryDate).toLocaleDateString()} />}</div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button onClick={onRetry}><RefreshCw /> Retry</Button><Button variant="outline" onClick={() => { void clearLicense().then(() => location.reload()); }}><KeyRound /> Enter New Key</Button></div>
        <p className="mt-4 text-center font-mono text-xs text-muted-foreground">Device: {hardwareId || '…'}</p>
      </section>
      <FooterStrip />
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className={mono ? 'font-mono text-xs' : 'font-semibold'}>{value}</span></div>;
}

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<GateState>({ state: 'checking' });
  const check = async () => {
    setGate({ state: 'checking' });
    try { setGate(await evaluateGate(APP_VERSION)); } catch { setGate({ state: 'unactivated' }); }
  };

  // Silent re-check — no "Verifying…" screen, so it can run often.
  // Super Admin ke Suspend / Revoke ka asar ab ~1 minute me aa jata hai
  // (pehle 6 ghante lagte the).
  const lastSilent = useRef(0);
  const silentCheck = async () => {
    // Throttle: window focus/online/verdict events can fire in bursts. Without
    // this the gate re-verified constantly (client: "keeps asking again").
    const now = Date.now();
    if (now - lastSilent.current < 30_000) return;
    lastSilent.current = now;
    try {
      const next = await evaluateGate(APP_VERSION);
      setGate(prev => (prev.state === next.state && (prev as any).reason === (next as any).reason ? prev : next));
    } catch { /* offline — keep current state */ }
  };

  useEffect(() => {
    void check();
    const timer = setInterval(() => { void silentCheck(); }, 60_000);
    const onFocus = () => { void silentCheck(); };
    const onVerdict = () => { void silentCheck(); };
    window.addEventListener('online', onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('dtpos-license-verdict', onVerdict);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('dtpos-license-verdict', onVerdict);
    };
  }, []);

  if (gate.state === 'checking') {
    return <AppShell><div className="flex flex-1 flex-col items-center justify-center py-16"><RefreshCw className="h-8 w-8 animate-spin text-primary" /><p className="mt-4 text-sm font-medium text-muted-foreground">Verifying license…</p></div><FooterStrip /></AppShell>;
  }
  if (gate.state === 'unactivated') return <ActivationScreen onDone={check} />;
  if (gate.state === 'blocked') return <BlockedScreen reason={gate.reason} message={gate.message} license={gate.license} onRetry={check} />;

  const daysLeft = gate.daysLeft;
  const warn = daysLeft !== null && daysLeft <= 7;
  return (
    <>
      {warn && <div className={`px-3 py-1.5 text-center text-xs font-bold text-status-warning-foreground ${daysLeft <= 3 ? 'bg-destructive text-destructive-foreground' : 'bg-status-warning'}`}>License {daysLeft === 0 ? 'expires today' : `expires in ${daysLeft} days`} — contact us to renew{gate.offline ? ' · (offline mode)' : ''}</div>}
      {children}
    </>
  );
}