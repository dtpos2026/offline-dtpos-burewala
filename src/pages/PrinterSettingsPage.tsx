// ============================================================
// PRINTER CENTER
//
// This page was thirteen cards in one column. Changing a margin meant
// scrolling past the template gallery; checking the role mapping meant
// scrolling past everything. The shop's words for it were that they were
// tired of scrolling, and they were right — a settings screen that has to be
// hunted through is a settings screen that gets set wrong.
//
// So the cards are grouped into modules and one module is shown at a time,
// picked from a list beside them. Nothing was removed and nothing was
// rewritten: every card here is the same component it was, in the same order
// within its group. Only the way they are reached changed.
//
// On a phone the list becomes a horizontal strip of chips above the content,
// because a sidebar at 360px wide is not a sidebar.
// ============================================================
import { useEffect, useState } from 'react';
import {
  Activity, Printer, Route, Zap, LayoutTemplate, Ruler, Crosshair,
  Sliders, SlidersHorizontal, FileText, Ticket,
} from 'lucide-react';

import PrinterSettingsPanel from '@/components/PrinterSettingsPanel';
import PrintMarginsCard from '@/components/PrintMarginsCard';
import PrintAlignmentTestCard from '@/components/PrintAlignmentTestCard';
import SlipMarginsCard from '@/components/SlipMarginsCard';
import FastBillingModeCard from '@/components/FastBillingModeCard';
import PrintQualityCard from '@/components/PrintQualityCard';
import TestPrintCard from '@/components/TestPrintCard';
import TokenSettingsCard from '@/components/TokenSettingsCard';
import TokenRulesCard from '@/components/TokenRulesCard';
import PrinterCalibrationPanel from '@/components/PrinterCalibrationPanel';
import PrinterHealthCard from '@/components/PrinterHealthCard';
import PrinterRoleMappingCard from '@/components/PrinterRoleMappingCard';
import ReceiptTemplateCard from '@/components/ReceiptTemplateCard';
import PremiumTemplateGallery from '@/components/PremiumTemplateGallery';

interface Module {
  id: string;
  label: string;
  /** One line, shown under the heading so the module explains itself. */
  blurb: string;
  icon: typeof Printer;
  render: () => JSX.Element;
}

const MODULES: Module[] = [
  {
    id: 'status',
    label: 'Status',
    blurb: 'Is the printer reachable, and what has it printed lately.',
    icon: Activity,
    render: () => <PrinterHealthCard />,
  },
  {
    id: 'printers',
    label: 'Printers',
    blurb: 'The devices themselves: name, paper, connection and driver mode.',
    icon: Printer,
    render: () => <PrinterSettingsPanel />,
  },
  {
    id: 'roles',
    label: 'Role mapping',
    blurb: 'Which printer each slip goes to. The print queue reads this.',
    icon: Route,
    render: () => <PrinterRoleMappingCard />,
  },
  {
    id: 'speed',
    label: 'Print mode & speed',
    blurb: 'Rendered template, raw ESC/POS, or the Windows driver only.',
    icon: Zap,
    render: () => <FastBillingModeCard />,
  },
  {
    id: 'templates',
    label: 'Receipt design',
    blurb: 'The layout of the bill, and the premium template gallery.',
    icon: LayoutTemplate,
    render: () => (
      <>
        <ReceiptTemplateCard />
        <PremiumTemplateGallery />
      </>
    ),
  },
  {
    id: 'margins',
    label: 'Margins',
    blurb: 'Where the slip sits on the paper — this device, and per slip type.',
    icon: Ruler,
    render: () => (
      <>
        <PrintMarginsCard />
        <SlipMarginsCard />
      </>
    ),
  },
  {
    id: 'alignment',
    label: 'Alignment test',
    blurb: 'Print a ruled slip and measure both edges against it.',
    icon: Crosshair,
    render: () => <PrintAlignmentTestCard />,
  },
  {
    id: 'quality',
    label: 'Print quality',
    blurb: 'Darkness, boldness and how much paper each slip uses.',
    icon: Sliders,
    render: () => <PrintQualityCard />,
  },
  {
    id: 'calibration',
    label: 'Calibration',
    blurb: 'Fine adjustment for a printer that needs its own numbers.',
    icon: SlidersHorizontal,
    render: () => <PrinterCalibrationPanel />,
  },
  {
    id: 'test',
    label: 'Test print',
    blurb: 'Send a sample slip and see exactly what comes out.',
    icon: FileText,
    render: () => <TestPrintCard />,
  },
  {
    id: 'tokens',
    label: 'Tokens',
    blurb: 'The numbered stub: what it shows and when it is issued.',
    icon: Ticket,
    render: () => (
      <>
        <TokenSettingsCard />
        <TokenRulesCard />
      </>
    ),
  },
];

/** Remembered per device so a shop mid-calibration reopens where it was. */
const LAST_MODULE_KEY = 'dtpos-printer-center-module';

export default function PrinterSettingsPage() {
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LAST_MODULE_KEY);
      if (saved && MODULES.some(m => m.id === saved)) return saved;
    } catch { /* private mode, or storage disabled */ }
    return MODULES[0].id;
  });

  useEffect(() => {
    try { localStorage.setItem(LAST_MODULE_KEY, activeId); } catch { /* not important enough to fail on */ }
  }, [activeId]);

  const active = MODULES.find(m => m.id === activeId) || MODULES[0];

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold mb-1">Printer Center</h1>
        <p className="text-sm text-muted-foreground">
          Counter, kitchen and token printers — devices, routing, layout and
          calibration, one module at a time.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* Module list. A scrolling strip on a phone, a sidebar above that. */}
        <nav
          aria-label="Printer Center modules"
          className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0
                     md:sticky md:top-4 md:self-start"
        >
          {MODULES.map(m => {
            const Icon = m.icon;
            const on = m.id === active.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveId(m.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap
                            md:whitespace-normal text-left transition-colors shrink-0 md:shrink ${
                  on
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0">{m.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="space-y-5 min-w-0">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <active.icon className="h-5 w-5" /> {active.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{active.blurb}</p>
          </div>
          {/* Keyed so switching modules remounts rather than reusing the last
              module's state in a differently-shaped card. */}
          <div key={active.id} className="space-y-5">{active.render()}</div>
        </section>
      </div>
    </div>
  );
}
