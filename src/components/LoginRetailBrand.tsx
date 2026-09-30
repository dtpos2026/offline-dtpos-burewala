// The brand panel of the DT Retail login: the theme's gradient, slowly floating
// translucent shapes, a headline, six feature chips and the Digital Target
// lockup. Purely decorative — the sign-in form beside it is unchanged.
import { BarChart3, Printer, ShieldCheck, Ticket, WifiOff, Zap } from 'lucide-react';
import DtMark from '@/components/DtMark';
import { APP_NAME, APP_VERSION } from '@/lib/version';

const CHIPS = [
  { icon: Zap, text: 'Bill in seconds' },
  { icon: WifiOff, text: 'Works 100% offline' },
  { icon: Printer, text: '58mm & 80mm printing' },
  { icon: Ticket, text: 'Tokens & tables' },
  { icon: BarChart3, text: 'Daily reports' },
  { icon: ShieldCheck, text: 'Safe backups' },
];

export default function LoginRetailBrand({ shop }: { shop?: string }) {
  return (
    <div data-dtr="login-brand" className="relative z-10 flex h-full flex-col justify-between text-white">
      <span className="dtr-shape" style={{ top: '8%', right: '-4%', width: 210, height: 210, animationDuration: '13s' }} aria-hidden />
      <span className="dtr-shape" style={{ top: '46%', left: '-6%', width: 150, height: 150, animationDuration: '11s', animationDelay: '-4s' }} aria-hidden />
      <span className="dtr-shape" style={{ bottom: '12%', right: '10%', width: 120, height: 120, animationDuration: '14s', animationDelay: '-7s' }} aria-hidden />

      <div className="dtr-logo flex items-center gap-3">
        <span className="dtr-logo-tile grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
          <DtMark size={24} />
        </span>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight">{APP_NAME}</div>
          <div className="text-[11px] text-white/70">Version {APP_VERSION}</div>
        </div>
      </div>

      <div>
        {shop && <div className="dtr-rise mb-3 text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">Welcome to {shop}</div>}
        <h1 className="dtr-rise text-4xl font-extrabold leading-[1.05] tracking-tight xl:text-5xl">
          Billing made<br />simple &amp; fast.
        </h1>
        <p className="dtr-rise mt-3 text-sm text-white/80" style={{ animationDelay: '0.25s' }}>Offline-first POS for restaurants, cafés and shops.</p>
        <div className="mt-7 grid max-w-md grid-cols-2 gap-2.5">
          {CHIPS.map((c, i) => (
            <div
              key={c.text}
              className="dtr-rise flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[12.5px] font-semibold backdrop-blur-sm"
              style={{ animationDelay: `${0.35 + i * 0.07}s` }}
            >
              <c.icon className="h-4 w-4 shrink-0 text-white/90" />
              {c.text}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <DtMark size={26} />
        <div className="text-[10px] font-black uppercase leading-[1.05] tracking-[0.14em]">Digital<br />Target</div>
        <div className="ml-2 border-l border-white/20 pl-3 text-[11px] leading-tight text-white/70">
          Developed by<br /><span className="font-bold text-white">Digital Target</span> · v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}
