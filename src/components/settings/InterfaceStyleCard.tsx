// ============================================================
// SETTINGS → THEME → INTERFACE STYLE
//
// Modern (the new look, with twelve themes) or Classic (the previous look, with
// its own colour themes below). All of it is a device-local presentation
// choice (src/lib/uiStyle, src/lib/uiThemes). Nothing here can touch data,
// the licence, users, permissions, orders, inventory, reports or printer
// configuration, and the card says so.
// ============================================================
import { useState } from 'react';
import { Check, History, Palette, RotateCcw, RotateCw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  ACCENT_PRESETS, MIN_ACCENT_CONTRAST, RETAIL_THEMES, UI_THEMES, clearAccent, contrastWithWhite, hexToHsl, hslToHex, resolveAccent,
  resolveLook, restorePreviousLook, setAccent, setAnimations, setTheme, setUiStyle, useAccentOverride, useAnimations, usePreviousLook,
  useThemeId, useUiLook, useUiStyle, type UiStyle,
} from '@/lib/uiStyle';
import type { UiTheme } from '@/lib/uiThemes';
import { INK_ON_ACCENT } from '@/lib/uiThemes';
import { canRestartApp, restartApp } from '@/lib/appRestart';

const STYLES: { id: UiStyle; name: string; blurb: string }[] = [
  { id: 'modern', name: 'Modern', blurb: 'Light, calm and quick to scan. Short menu with a “More” launcher. Thirteen themes, plus the seven DT Retail looks. Recommended.' },
  { id: 'classic', name: 'Classic', blurb: 'The look and full menu of earlier versions, with your colour theme below.' },
];

const hsl = (t: string) => `hsl(${t})`;

/** A few lines of fake UI drawn in the style's own colours — a preview, not a screenshot. */
function ClassicPreview() {
  return (
    <div className="flex h-[88px] overflow-hidden rounded-lg border" aria-hidden>
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

/** The whole POS in miniature, in one theme's colours: sidebar, page, tiles, and an accent button. */
export function ThemePreview({ theme, accent, onAccent }: { theme: UiTheme; accent?: string; onAccent?: string }) {
  const s = theme.surface;
  const a = accent || `hsl(${theme.accent.h} ${theme.accent.s}% ${theme.accent.l}%)`;
  const on = onAccent || (theme.onAccent === 'dark' ? hsl(INK_ON_ACCENT) : '#fff');
  const dark = theme.sidebar === 'dark';
  const sb = dark ? hsl(theme.sidebarColor || '24 15% 11%') : '#fff';
  const retail = theme.family === 'retail';
  const panel = s.card ? hsl(s.card) : '#fff';
  const sbBg = retail && theme.sidebarGradient ? `linear-gradient(180deg, ${hsl(theme.sidebarGradient[0])}, ${hsl(theme.sidebarGradient[1])})` : sb;
  return (
    <div className="flex h-[88px] overflow-hidden rounded-lg border" style={{ borderColor: hsl(s.border) }} aria-hidden>
      <div className="flex w-9 shrink-0 flex-col gap-1.5 p-1.5" style={{ background: sbBg, borderRight: `1px solid ${dark ? 'transparent' : hsl(s.border)}` }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-1.5 rounded-full" style={{ background: i === 0 ? a : dark ? 'rgba(255,255,255,.28)' : hsl(s.border) }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2" style={{ background: hsl(s.background) }}>
        {retail && theme.hero && (
          <div className="h-3 rounded-md" style={{ background: `linear-gradient(100deg, ${hsl(theme.hero[0])}, ${hsl(theme.hero[1])})` }} />
        )}
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1/3 rounded-full" style={{ background: hsl(s.foreground), opacity: 0.7 }} />
          <div className="ml-auto grid h-3 w-8 place-items-center rounded-full text-[6px] font-bold" style={{ background: a, color: on }}>PAY</div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex flex-col justify-end gap-0.5 rounded-md p-1 shadow-sm" style={{ background: panel, border: `1px solid ${hsl(s.border)}` }}>
              <div className="h-1 rounded-full" style={{ background: hsl(s.mutedForeground), opacity: 0.5 }} />
              <div className="h-1 w-1/2 rounded-full" style={{ background: a }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeGrid({ themes, label, themeId, onPick }: {
  themes: UiTheme[]; label: string; themeId: string; override?: string | null; onPick: (t: UiTheme) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={label}>
      {themes.map(t => {
        const on = t.id === themeId;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${t.name}. ${t.tagline}`}
            data-theme-id={t.id}
            onClick={() => onPick(t)}
            className={cn(
              'flex h-full flex-col gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
              on ? 'border-primary bg-primary/5 ring-2 ring-primary/25' : 'hover:border-primary/40',
            )}
          >
            <ThemePreview theme={t} />
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="flex items-center gap-2 text-[13.5px] font-bold">
                {t.swatches ? (
                  <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" aria-hidden>
                    {t.swatches.map((c, i) => <span key={i} className="h-3.5 w-3" style={{ background: c }} />)}
                  </span>
                ) : (
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ background: `hsl(${t.accent.h} ${t.accent.s}% ${t.accent.l}%)` }}
                    aria-hidden
                  />
                )}
                {t.name}
              </span>
              {on && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground"><Check className="h-3 w-3" /> In use</span>}
            </div>
            <p className="px-0.5 text-[12px] leading-snug text-muted-foreground">{t.tagline}</p>
          </button>
        );
      })}
    </div>
  );
}

export default function InterfaceStyleCard() {
  const style = useUiStyle();
  const themeId = useThemeId();
  const override = useAccentOverride();
  const uiLook = useUiLook();
  const animations = useAnimations();
  const previous = usePreviousLook();
  const look = resolveLook(themeId, override);
  const [custom, setCustom] = useState(() => (override && override.startsWith('#') ? override : ''));
  const customHsl = hexToHsl(custom);
  const customContrast = customHsl ? contrastWithWhite(customHsl) : null;

  const pickStyle = (next: UiStyle) => {
    if (next === style) return;
    setUiStyle(next);
    toast.success(next === 'modern' ? 'Modern look is on' : 'Classic look is back — nothing else changed');
  };

  const pickTheme = (t: UiTheme) => {
    if (t.id === themeId && !override) return;
    setTheme(t.id);
    setCustom('');
    toast.success(`${t.name} theme is on`);
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
            {s.id === 'classic' ? <ClassicPreview /> : <ThemePreview theme={look.theme} accent={hslToHex(look.accent)} onAccent={look.darkOnAccent ? hsl(INK_ON_ACCENT) : '#fff'} />}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold">{s.name}</span>
              {style === s.id && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground"><Check className="h-3 w-3" /> In use</span>}
            </div>
            <p className="text-[12.5px] text-muted-foreground">{s.blurb}</p>
          </button>
        ))}
      </div>

      {style === 'modern' && (
        <div className="space-y-5 border-t pt-4">
          <div className="space-y-3">
            <div>
              <div className="text-[13px] font-bold">Theme</div>
              <p className="text-[12.5px] text-muted-foreground">
                Pick the look that suits your restaurant — red, orange, green, yellow, white, coffee brown and more. A theme sets the colours of the whole screen.
              </p>
            </div>
            <ThemeGrid themes={UI_THEMES} label="Theme" themeId={themeId} override={override} onPick={pickTheme} />
          </div>

          <div className="space-y-3 border-t pt-4" data-testid="dt-retail-section">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 text-[13px] font-bold"><Sparkles className="h-4 w-4 text-primary" /> DT Retail themes</div>
                <p className="text-[12.5px] text-muted-foreground">
                  The look of the DT Retail design guide: a gradient sidebar, a greeting banner on the dashboard, colour tiles on the sale screen and smooth motion.
                  Two of them (Black &amp; Gold, Night) are dark.
                </p>
              </div>
              {uiLook === 'retail' && previous && (
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => { if (restorePreviousLook()) toast.success('Your previous look is back'); }}
                >
                  <History className="h-4 w-4" /> Back to my previous look
                </Button>
              )}
            </div>
            <ThemeGrid themes={RETAIL_THEMES} label="DT Retail theme" themeId={themeId} override={override} onPick={pickTheme} />
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <span>
                <span className="block text-[13px] font-bold">Smooth animations</span>
                <span className="block text-[12px] text-muted-foreground">Page and dialog transitions, the welcome screen and the login. Turn off on slow computers.</span>
              </span>
              <Switch checked={animations} onCheckedChange={v => setAnimations(!!v)} aria-label="Smooth animations" />
            </label>
          </div>

          <details className="group rounded-lg border bg-muted/30 p-3" open={!!override}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-bold">
              <span>Use my own accent colour <span className="font-medium text-muted-foreground">(optional)</span></span>
              {override && <span className="text-[12px] font-medium text-muted-foreground">In use: <span className="font-mono font-bold">{hslToHex(look.accent)}</span></span>}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-[12.5px] text-muted-foreground">Keeps the theme’s surfaces and changes only the buttons and highlights.</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
                {ACCENT_PRESETS.map(p => {
                  const hex = hslToHex(resolveAccent(p.id));
                  const on = override === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={p.name}
                      onClick={() => { setAccent(p.id); setCustom(''); }}
                      className={cn('flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-[12.5px] font-semibold transition-colors', on ? 'border-primary bg-primary/5' : 'hover:bg-accent')}
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
                {override && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => { clearAccent(); setCustom(''); toast.success('Back to the theme’s own colour'); }}>
                    <RotateCcw className="h-4 w-4" /> Use the theme’s colour
                  </Button>
                )}
              </div>
            </div>
          </details>
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
