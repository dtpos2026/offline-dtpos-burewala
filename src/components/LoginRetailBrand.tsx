// The brand panel of the DT Retail login: the theme's gradient, slowly floating
// translucent shapes, a headline, six feature chips and the Digital Target
// lockup. Purely decorative — the sign-in form beside it is unchanged.
// The Espresso Orange theme has its own panel (the DT Retail POS v1.8 one):
// espresso brown with orange glows, "Welcome to <shop>", the licence holder.
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

// Faint Digital Target marks scattered over the Espresso panel.
const MARKS = [
  { top: '7%', right: '22%', size: 64, rotate: 12 },
  { top: '17%', left: '4%', size: 92, rotate: -8 },
  { top: '40%', left: '50%', size: 46, rotate: 18 },
  { top: '66%', left: '22%', size: 72, rotate: -14 },
  { top: '59%', right: '2%', size: 128, rotate: 8 },
];

interface Props {
  shop?: string;
  /** 'espresso': the DT Retail POS v1.8 sign-in panel (Espresso Orange theme). */
  variant?: 'default' | 'espresso';
  /** The licence holder, shown under "Developed by" on the Espresso panel. */
  licensedTo?: string;
}

function EspressoBrand({ shop, licensedTo }: Props) {
  return (
    <div data-dtr="login-brand" data-variant="espresso" className="relative z-10 flex h-full flex-col justify-between text-white">
      {MARKS.map((m, i) => (
        <span key={i} className="dtr-esp-mark" style={{ top: m.top, left: m.left, right: m.right, transform: `rotate(${m.rotate}deg)` }} aria-hidden>
          <DtMark size={m.size} />
        </span>
      ))}

      <div className="relative flex items-center gap-3.5">
        <span className="dtr-logo-tile dtr-esp-logo grid h-14 w-14 place-items-center rounded-2xl text-white">
          <DtMark size={30} />
        </span>
        <div className="leading-tight">
          <div className="text-xl font-extrabold tracking-tight">{APP_NAME}</div>
          <div className="text-[13px] text-white/75">Version {APP_VERSION}</div>
        </div>
      </div>

      <div className="relative">
        <h1 className="dtr-rise text-[2.6rem] font-extrabold leading-[1.15] tracking-tight xl:text-5xl xl:leading-[1.12]">
          Welcome to<br /><span className="break-words">{shop || APP_NAME}</span>
        </h1>
        <p className="dtr-rise mt-3 text-lg font-medium text-white/90" style={{ animationDelay: '0.2s' }}>Simple Offline POS for Small Businesses</p>
        <div className="mt-9 grid max-w-[560px] grid-cols-2 gap-3.5">
          {CHIPS.map((c, i) => (
            <div
              key={c.text}
              className="dtr-rise flex h-[50px] items-center gap-3 rounded-xl border border-white/20 bg-white/[0.06] px-4 text-[14px] font-semibold backdrop-blur-sm"
              style={{ animationDelay: `${0.3 + i * 0.07}s` }}
            >
              <c.icon className="h-[18px] w-[18px] shrink-0 text-white/90" />
              {c.text}
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center gap-3">
        <DtMark size={30} />
        <div className="text-[12px] font-black uppercase leading-[1.05] tracking-[0.08em]">Digital<br />Target</div>
        <div className="ml-1 text-[13px] leading-snug">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Developed by</div>
          <div className="font-bold">Digital Target · v{APP_VERSION}</div>
          {licensedTo && <div data-licensed-to className="text-white/70">Licensed to {licensedTo}</div>}
        </div>
      </div>
    </div>
  );
}

export default function LoginRetailBrand({ shop, variant = 'default', licensedTo }: Props) {
  if (variant === 'espresso') return <EspressoBrand shop={shop} licensedTo={licensedTo} />;
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
