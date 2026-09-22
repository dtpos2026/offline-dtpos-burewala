// ============================================================
// SETTINGS → SCREEN & LAYOUT
//
// Shows what DT POS detects about the screen it is running on, previews the
// POS layout the engine produces (for this screen or a common size), and
// saves adjustments for THIS screen on THIS computer. Every option starts on
// Automatic; nothing has to be configured by hand.
// ============================================================
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Monitor, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScreenConfig } from '@/hooks/usePosLayout';
import {
  AUTO_CONFIG, saveScreenConfig, resetScreenConfig, aspectLabel, computePosLayout, containerFor,
  type PosLayout, type ScreenLayoutConfig,
} from '@/lib/posLayout';
import { getMenuItems, getCategories } from '@/lib/store';
import type { RestaurantSettings } from '@/lib/types';
import PosLayoutPreview, { type PreviewItem } from './PosLayoutPreview';

const PRESETS: { id: string; label: string; w: number; h: number; touch?: boolean }[] = [
  { id: 'this', label: 'This screen', w: 0, h: 0 },
  { id: '1920', label: '1920 × 1080 (wide)', w: 1920, h: 1080 },
  { id: '1366', label: '1366 × 768 (laptop)', w: 1366, h: 768 },
  { id: '1280', label: '1280 × 720', w: 1280, h: 720 },
  { id: '1024', label: '1024 × 768 (square touch)', w: 1024, h: 768, touch: true },
  { id: '1280s', label: '1280 × 1024 (5:4)', w: 1280, h: 1024 },
  { id: '800', label: '800 × 600 (narrow)', w: 800, h: 600 },
  { id: 'portrait', label: '1080 × 1920 (portrait)', w: 1080, h: 1920, touch: true },
];

const MODE_LABEL: Record<string, string> = {
  wide: 'Wide', standard: 'Standard', narrow: 'Narrow', square: 'Square / touch', portrait: 'Portrait',
};

export default function ScreenLayoutTab({ settings }: { settings: RestaurantSettings }) {
  const { facts, config } = useScreenConfig();
  const [draft, setDraft] = useState<ScreenLayoutConfig>(config);
  const [presetId, setPresetId] = useState('this');
  const [shown, setShown] = useState<PosLayout | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const preset = PRESETS.find(p => p.id === presetId) || PRESETS[0];
  const previewW = preset.id === 'this' ? facts.windowW : preset.w;
  const previewH = preset.id === 'this' ? facts.windowH : preset.h;
  const previewTouch = preset.id === 'this' ? facts.touch : !!preset.touch;

  const items: PreviewItem[] = useMemo(() => {
    try {
      return getMenuItems().filter(i => i && i.name).slice(0, 24).map(i => ({ name: i.name, price: Number(i.price) || 0, image: i.image || undefined }));
    } catch { return []; }
  }, []);
  const categories = useMemo(() => {
    try { return ['All', ...getCategories().map(c => c.name).filter(Boolean)]; } catch { return []; }
  }, []);

  // What the POS is drawing right now: this screen with the SAVED choices.
  const inUse = useMemo(() => {
    const c = containerFor(facts.windowW, facts.windowH, config);
    return computePosLayout({
      width: c.width, height: c.height, touch: facts.touch,
      categoryLayoutSetting: settings.categoryLayout === 'side' ? 'side' : 'top',
      preferredColumns: settings.menuGridColumns || 6, config,
    });
  }, [facts, config, settings.categoryLayout, settings.menuGridColumns]);

  const set = <K extends keyof ScreenLayoutConfig>(k: K, v: ScreenLayoutConfig[K]) => setDraft(d => ({ ...d, [k]: v }));
  const onLayout = useCallback((l: PosLayout) => setShown(l), []);

  const save = () => {
    saveScreenConfig(facts.signature, draft);
    toast.success(`Saved for this screen (${facts.screenW} × ${facts.screenH}, ${Math.round(facts.scale * 100)}% scaling)`);
  };
  const reset = () => {
    resetScreenConfig(facts.signature);
    setDraft({ ...AUTO_CONFIG });
    toast.success('This screen is back on the automatic layout');
  };

  const numOrAuto = (v: string): number | 'auto' => (v === 'auto' ? 'auto' : Number(v));
  const field = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
  const lbl = 'text-[11px] font-bold text-muted-foreground mb-1 block';

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-bold flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /> This screen</h3>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Fact k="Resolution" v={`${facts.screenW} × ${facts.screenH}`} />
          <Fact k="Aspect ratio" v={facts.aspect} />
          <Fact k="Display mode" v={facts.orientation === 'landscape' ? 'Landscape' : 'Portrait'} />
          <Fact k="Windows scaling" v={`${Math.round(facts.scale * 100)}%`} />
          <Fact k="DT POS window" v={`${facts.windowW} × ${facts.windowH} (${aspectLabel(facts.windowW, facts.windowH)})`} />
          <Fact k="Touchscreen" v={facts.touch ? 'Detected' : 'Not detected'} />
          <Fact k="Layout in use" v={`${MODE_LABEL[inUse.mode]} · ${inUse.productColumns} columns`} />
          <Fact k="Saved profile" v={JSON.stringify(config) === JSON.stringify(AUTO_CONFIG) ? 'Automatic' : 'Adjusted for this screen'} />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Changes are saved for this screen size on this computer only. Another till, or this till on a different monitor, keeps its own layout.
        </p>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">Layout</h3>
          <span className="text-[11px] text-muted-foreground">Every option starts on Automatic.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label><span className={lbl}>Layout mode</span>
            <select className={field} value={draft.mode} onChange={e => set('mode', e.target.value as ScreenLayoutConfig['mode'])}>
              <option value="auto">Automatic (from screen size)</option>
              <option value="wide">Wide — more columns, balanced panels</option>
              <option value="standard">Standard desktop</option>
              <option value="narrow">Narrow — slimmer side panels</option>
              <option value="square">Square / touch — categories on top</option>
              <option value="portrait">Portrait — cart at the bottom</option>
            </select>
          </label>
          <label><span className={lbl}>Product columns</span>
            <select className={field} value={String(draft.productColumns)} onChange={e => set('productColumns', numOrAuto(e.target.value))}>
              <option value="auto">Automatic (up to {settings.menuGridColumns || 6})</option>
              {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} columns</option>)}
            </select>
          </label>
          <label><span className={lbl}>Product card size</span>
            <select className={field} value={draft.cardSize} onChange={e => set('cardSize', e.target.value as ScreenLayoutConfig['cardSize'])}>
              <option value="auto">Automatic</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large (touch)</option>
            </select>
          </label>
          <label><span className={lbl}>Cart width {typeof draft.cartWidth === 'number' ? `— ${draft.cartWidth} px` : ''}</span>
            <div className="flex items-center gap-2">
              <select className={field} value={draft.cartWidth === 'auto' ? 'auto' : 'fixed'} onChange={e => set('cartWidth', e.target.value === 'auto' ? 'auto' : (shown?.cartWidth || 360))}>
                <option value="auto">Automatic</option>
                <option value="fixed">Fixed</option>
              </select>
              {typeof draft.cartWidth === 'number' && (
                <input type="range" min={260} max={600} step={10} value={draft.cartWidth} onChange={e => set('cartWidth', Number(e.target.value))} className="w-full" aria-label="Cart width" />
              )}
            </div>
          </label>
          <label><span className={lbl}>Categories</span>
            <select className={field} value={draft.categoryPlacement} onChange={e => set('categoryPlacement', e.target.value as ScreenLayoutConfig['categoryPlacement'])}>
              <option value="auto">Automatic ({settings.categoryLayout === 'side' ? 'side panel' : 'top ribbon'}; top on square screens)</option>
              <option value="top">Top ribbon</option>
              <option value="side">Side panel</option>
            </select>
          </label>
          <label><span className={lbl}>Category panel width {typeof draft.categoryWidth === 'number' ? `— ${draft.categoryWidth} px` : ''}</span>
            <div className="flex items-center gap-2">
              <select className={field} value={draft.categoryWidth === 'auto' ? 'auto' : 'fixed'} onChange={e => set('categoryWidth', e.target.value === 'auto' ? 'auto' : (shown?.categoryWidth || 150))}>
                <option value="auto">Automatic</option>
                <option value="fixed">Fixed</option>
              </select>
              {typeof draft.categoryWidth === 'number' && (
                <input type="range" min={104} max={240} step={4} value={draft.categoryWidth} onChange={e => set('categoryWidth', Number(e.target.value))} className="w-full" aria-label="Category panel width" />
              )}
            </div>
          </label>
          <label><span className={lbl}>Spacing</span>
            <select className={field} value={draft.density} onChange={e => set('density', e.target.value as ScreenLayoutConfig['density'])}>
              <option value="auto">Automatic</option>
              <option value="comfortable">Normal</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label><span className={lbl}>Main menu on the POS screen</span>
            <select className={field} value={draft.menuCollapse} onChange={e => set('menuCollapse', e.target.value as ScreenLayoutConfig['menuCollapse'])}>
              <option value="auto">Automatic (icons only when space is tight)</option>
              <option value="collapsed">Icons only</option>
              <option value="expanded">Always expanded</option>
            </select>
          </label>
          <label><span className={lbl}>Calculator keypad in the cart</span>
            <select className={field} value={draft.keypad} onChange={e => set('keypad', e.target.value as ScreenLayoutConfig['keypad'])}>
              <option value="auto">Cashier decides (show / minimise)</option>
              <option value="show">Always shown</option>
              <option value="hide">Hidden (opens for price / weight entry)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty}><Save className="h-4 w-4 mr-1" /> Save for this screen</Button>
          <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" /> Reset to automatic</Button>
          {dirty && <span className="text-[11px] font-semibold text-status-warning">Not saved yet — the POS still uses the previous layout.</span>}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold">Preview</h3>
          <select className="h-8 rounded-md border bg-background px-2 text-xs" value={presetId} onChange={e => setPresetId(e.target.value)} aria-label="Preview size">
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.id === 'this' ? `This screen (${facts.windowW} × ${facts.windowH})` : p.label}</option>)}
          </select>
          {shown && (
            <span className="text-[11px] text-muted-foreground">
              {MODE_LABEL[shown.mode]} · {shown.productColumns} product columns ({shown.cardWidth} px cards)
              {' · '}Cart {shown.cartPlacement === 'side' ? `${shown.cartWidth} px` : shown.cartPlacement === 'bottom' ? 'at the bottom' : 'as a pop-up panel'}
              {' · '}Categories {shown.categoryPlacement === 'side' ? `side ${shown.categoryWidth} px` : 'on top'}
              {shown.columnsLimited ? ' · fewer columns than chosen fit on this screen' : ''}
            </span>
          )}
        </div>
        <PosLayoutPreview
          windowW={previewW}
          windowH={previewH}
          touch={previewTouch}
          config={draft}
          categoryLayoutSetting={settings.categoryLayout === 'side' ? 'side' : 'top'}
          preferredColumns={settings.menuGridColumns || 6}
          items={items}
          categories={categories}
          onLayout={onLayout}
        />
        <p className="text-[11px] text-muted-foreground">
          The preview is drawn at the real size of the chosen screen with the same layout rules the POS uses, then shrunk to fit here.
        </p>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
