// ============================================================
// SETTINGS → THEME → INTERFACE STYLE
//
// Modern (the new look) or Classic (the previous look), plus the restaurant's
// accent colour. Both are device-local presentation choices (src/lib/uiStyle).
// Nothing here can touch data, the licence, users, permissions, orders,
// inventory, reports or printer configuration, and the card says so.
// ============================================================
import { useState } from 'react';
import { Check, Palette, RotateCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ACCENT_PRESETS, contrastWithWhite, hexToHsl, hslToHex, resolveAccent,
  setAccent, setUiStyle, useAccentChoice, useUiStyle, MIN_ACCENT_CONTRAST, type UiStyle,
} from '@/lib/uiStyle';
import { canRestartApp, restartApp } from '@/lib/appRestart';

const STYLES: { id: UiStyle; name: string; blurb: string }[] = [
  { id: 'modern', name: 'Modern', blurb: 'Light, calm and quick to scan. Short menu with a “More” launcher. Recommended.' },
  { id: 'classic', name: 'Classic', blurb: 'The look and full menu of earlier versions, with your colour theme below.' },
];

/** A few lines of fake UI drawn in the style's own colours — a preview, not a screenshot. */
function StylePreview({ style, accentHex }: { style: UiStyle; accentHex: string }) {
  if (style === 'classic') {
    return (
      <div className="flex h-24 overflow-hidden rounded-lg border" aria-hidden>
        <div className="w-10 shrink-0 space-y-1.5 bg-[#3c096c] p-2">
          {[0, 1, 2, 3].map(i => <div key={i} className={cn('h-1.5 rounded-full', i === 0 ? 'bg-[#e0aaff]' : 'bg-white/35')} />)}
        </div>
        <div className="flex-1 space-y-2 bg-[#f7f3fc] p-2.5">
          <div className="h-2 w-1/2 rounded-full bg-[#3c096c]/70" />
          <div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map(i => <div key={i} className="h-8 rounded bg-white ring-1 ring-[#3c096c]/15" />)}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-24 overflow-hidden rounded-lg border" aria-hidden>
      <div className="w-10 shrink-0 space-y-1.5 border-r bg-white p-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-1.5 rounded-full" style={{ background: i === 0 ? accentHex : '#d9d4cc' }} />)}
      </div>
      <div className="flex-1 space-y-2 bg-[#f6f5f2] p-2.5">
        <div className="h-2 w-1/2 rounded-full bg-[#2b241f]/70" />
        <div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-white shadow-sm ring-1 ring-black/5" />)}</div>
      </div>
    </div>
  );
}

export default function InterfaceStyleCard() {
  const style = useUiStyle();
  const accent = useAccentChoice();
  const [custom, setCustom] = useState(() => (accent.startsWith('#') ? accent : ''));
  const resolved = resolveAccent(accent);
  const accentHex = hslToHex(resolved);
  const customHsl = hexToHsl(custom);
  const customContrast = customHsl ? contrastWithWhite(customHsl) : null;

  const pickStyle = (next: UiStyle) => {
    if (next === style) return;
    setUiStyle(next);
    toast.success(next === 'modern' ? 'Modern look is on' : 'Classic look is back — nothing else changed');
  };

  const applyCustom = () => {
    if (!customHsl) { toast.error('Enter a colour like #d9480f'); return; }
    setAccent(custom.startsWith('#') ? custom.toLowerCase() : `#${custom.toLowerCase()}`);
    if (customContrast != null && customContrast < MIN_ACCENT_CONTRAST) toast.info('Made a little darker so white text on it stays readable');
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5" data-testid="interface-style-card">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"><Palette className="h-5 w-5" /></span>
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">Interface style</h3>
          <p className="text-[12.5px] text-muted-foreground">How the software looks. This changes appearance only, on this computer.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Interface style">
        {STYLES.map(s => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            onClick={() => pickStyle(s.id)}
            className={cn(
              'space-y-3 rounded-xl border p-3 text-left transition-colors',
              style === s.id ? 'border-primary bg-primary/5 ring-2 ring-primary/25' : 'hover:border-primary/40',
            )}
          >
            <StylePreview style={s.id} accentHex={accentHex} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold">{s.name}</span>
              {style === s.id && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground"><Check className="h-3 w-3" /> In use</span>}
            </div>
            <p className="text-[12.5px] text-muted-foreground">{s.blurb}</p>
          </button>
        ))}
      </div>

      {style === 'modern' && (
        <div className="space-y-3 border-t pt-4">
          <div>
            <div className="text-[13px] font-bold">Accent colour</div>
            <p className="text-[12.5px] text-muted-foreground">Buttons, highlights and the selected menu item. Pick your restaurant’s colour.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
            {ACCENT_PRESETS.map(p => {
              const hex = hslToHex(resolveAccent(p.id));
              const on = accent === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={p.name}
                  onClick={() => { setAccent(p.id); setCustom(''); }}
                  className={cn('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-semibold transition-colors', on ? 'border-primary bg-primary/5' : 'hover:bg-accent')}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{ background: hex }}>{on && <Check className="h-3.5 w-3.5" />}</span>
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[12.5px] font-semibold text-muted-foreground" htmlFor="accent-hex">Or a custom colour</label>
            <input
              id="accent-hex"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="#d9480f"
              maxLength={7}
              className="h-9 w-28 rounded-[10px] border border-input bg-background px-3 font-mono text-[13px] outline-none focus:border-primary/60"
              onKeyDown={e => { if (e.key === 'Enter') applyCustom(); }}
            />
            <Button type="button" size="sm" variant="outline" onClick={applyCustom} disabled={!customHsl}>Use this colour</Button>
            {accent.startsWith('#') && <span className="text-[12px] text-muted-foreground">In use: <span className="font-mono font-bold">{accentHex}</span></span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
        <div className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-success))]" />
          <span>Changes apply immediately and can be reversed any time. Your data, licence, users, permissions, orders, inventory, reports and printer settings are never touched.</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            toast.message('Restarting… everything is saved first');
            await restartApp();
          }}
          title={canRestartApp() ? 'Restart the application' : 'Reload the screen'}
        >
          <RotateCw className="h-4 w-4" /> {canRestartApp() ? 'Restart application' : 'Reload screen'}
        </Button>
      </div>
    </div>
  );
}

