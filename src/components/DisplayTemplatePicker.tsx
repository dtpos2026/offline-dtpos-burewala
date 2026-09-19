// ============================================================
// DISPLAY TEMPLATE PICKER — preview, then select, then apply.
//
// Three steps on purpose. These templates change a screen that customers or a
// whole kitchen are looking at, often a screen in another room that the person
// choosing cannot see from where they are standing. Applying on the first
// click would mean the shop discovers what they picked by walking next door.
//
// So: clicking a card previews it here, and nothing changes until Apply. The
// preview is rendered from the SAME CSS custom properties the real screen
// uses, so what it shows is what will appear — a preview built from separate
// hand-written colours would eventually drift and start lying.
// ============================================================
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Eye } from 'lucide-react';
import {
  templatesFor, templateById, templateVars,
  type DisplaySurface, type DisplayTemplate,
} from '@/lib/displayTemplates';

interface Props {
  surface: DisplaySurface;
  /** The template currently in force. */
  value: string;
  onApply: (id: string) => void;
  /** Shown instead of the restaurant name in the preview. */
  shopName?: string;
}

export default function DisplayTemplatePicker({ surface, value, onApply, shopName }: Props) {
  const list = templatesFor(surface);
  const [previewId, setPreviewId] = useState<string>(value);
  const preview = templateById(surface, previewId);
  const applied = previewId === value;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(t => {
          const active = t.id === value;
          const showing = t.id === previewId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPreviewId(t.id)}
              className={`text-left rounded-lg border p-2.5 transition-all ${
                showing ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <SwatchRow template={t} />
                <span className="font-medium text-sm truncate">{t.name}</span>
                {active && (
                  <Badge className="ml-auto text-[10px] bg-status-success/20 text-status-success border-status-success/30 shrink-0">
                    <Check className="h-3 w-3 mr-0.5" /> In use
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">{t.description}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Preview — {preview.name}</span>
          <Button
            size="sm"
            className="ml-auto"
            disabled={applied}
            onClick={() => onApply(preview.id)}
          >
            {applied ? 'Applied' : `Apply ${preview.name}`}
          </Button>
        </div>
        {surface === 'customer'
          ? <CustomerPreview template={preview} shopName={shopName} />
          : <KitchenPreview template={preview} shopName={shopName} />}
      </div>
    </div>
  );
}

/** The template's colours as four dots, so a card is identifiable at a glance. */
function SwatchRow({ template }: { template: DisplayTemplate }) {
  const dots = [template.theme.bg, template.theme.accent, template.theme.preparing, template.theme.ready];
  return (
    <span className="flex gap-0.5 shrink-0">
      {dots.map((c, i) => (
        <span key={i} className="h-4 w-2.5 rounded-sm border border-black/10" style={{ background: c }} />
      ))}
    </span>
  );
}

function CustomerPreview({ template, shopName }: { template: DisplayTemplate; shopName?: string }) {
  const ratio = template.orderRatio;
  const showMedia = ratio < 100;
  return (
    <div
      className="rounded-md overflow-hidden border text-[7px] leading-none select-none"
      style={{ ...templateVars(template), background: 'var(--dt-bg)', color: 'var(--dt-text)', borderColor: 'var(--dt-border)' }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5"
           style={{ background: 'var(--dt-accent)', color: 'var(--dt-on-accent)' }}>
        <span className="h-4 w-4 rounded-sm shrink-0" style={{ background: 'rgba(255,255,255,0.28)' }} />
        <span className="font-black uppercase tracking-wide text-[9px] truncate">
          {shopName || 'YOUR RESTAURANT'}
        </span>
        <span className="ml-auto font-black text-[9px] tabular-nums">12:45</span>
      </div>
      <div className="grid gap-1.5 p-1.5" style={showMedia ? { gridTemplateColumns: `${ratio}fr ${100 - ratio}fr` } : undefined}>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'PREPARING', colour: 'var(--dt-preparing)', nums: ['12', '13'] },
            { label: 'READY', colour: 'var(--dt-ready)', nums: ['09', '10'] },
          ].map(col => (
            <div key={col.label}>
              <div className="font-black tracking-widest mb-1" style={{ color: col.colour }}>{col.label}</div>
              <div className="grid grid-cols-2 gap-1">
                {col.nums.map(n => (
                  <div
                    key={n}
                    className="text-center py-1.5 border"
                    style={{
                      borderRadius: `calc(var(--dt-radius) / 2)`,
                      background: 'var(--dt-surface)',
                      borderColor: col.colour,
                      color: col.colour,
                      fontSize: `${Math.round(11 * template.numberScale)}px`,
                      fontWeight: 900,
                    }}
                  >
                    #{n}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {showMedia && (
          <div className="flex items-center justify-center border"
               style={{ borderRadius: `calc(var(--dt-radius) / 2)`, background: '#000', borderColor: 'var(--dt-border)', minHeight: 46 }}>
            <span className="opacity-40 text-[7px]">YOUR BANNER</span>
          </div>
        )}
      </div>
    </div>
  );
}

function KitchenPreview({ template, shopName }: { template: DisplayTemplate; shopName?: string }) {
  const cols = template.density === 'compact' ? 4 : 3;
  return (
    <div
      className="rounded-md overflow-hidden border text-[7px] leading-none select-none"
      style={{ ...templateVars(template), background: 'var(--dt-bg)', color: 'var(--dt-text)', borderColor: 'var(--dt-border)' }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5"
           style={{ background: 'var(--dt-accent)', color: 'var(--dt-on-accent)' }}>
        <span className="h-4 w-4 rounded-sm shrink-0" style={{ background: 'rgba(127,127,127,0.35)' }} />
        <span className="font-black uppercase tracking-wide text-[9px] truncate">
          {shopName || 'YOUR RESTAURANT'}
        </span>
        <span className="ml-auto px-1.5 py-0.5 rounded border font-black"
              style={{ borderColor: 'var(--dt-preparing)', color: 'var(--dt-preparing)' }}>
          KITCHEN
        </span>
      </div>
      <div className="grid gap-1 p-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {[
          { n: '12', status: 'var(--dt-preparing)', label: 'TAP TO ACCEPT' },
          { n: '13', status: 'var(--dt-ready)', label: 'TAP WHEN READY' },
          { n: '14', status: 'var(--dt-alert)', label: 'LATE' },
          { n: '15', status: 'var(--dt-border)', label: 'TAP TO START' },
        ].slice(0, cols).map(card => (
          <div key={card.n} className="border p-1"
               style={{ borderRadius: `calc(var(--dt-radius) / 2)`, background: 'var(--dt-surface)', borderColor: card.status }}>
            <div className="font-black" style={{ fontSize: `${Math.round(10 * template.numberScale)}px` }}>#{card.n}</div>
            <div className="mt-1 rounded px-1 py-0.5 flex justify-between"
                 style={{ background: 'rgba(127,127,127,0.16)', fontSize: `${Math.round(7 * template.typeScale)}px` }}>
              <span className="truncate">Zinger Burger</span>
              <span className="font-black shrink-0" style={{ color: 'var(--dt-preparing)' }}>×2</span>
            </div>
            <div className="mt-1 text-center font-black py-0.5"
                 style={{ borderRadius: `calc(var(--dt-radius) / 2)`, background: card.status, color: 'var(--dt-bg)' }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
