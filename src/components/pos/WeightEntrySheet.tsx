// ============================================================
// WEIGHT ITEM PANEL — opens at the side when a weight item (sold per kg) is tapped.
//
// Two ways to sell it, like the counter asks for it:
//   • By weight (kg) — "1.5 kg"; the price is worked out at the item's rate;
//   • By amount (Rs.) — "Rs. 500 worth"; the weight is worked out instead.
// Preset buttons (Settings → POS → Weight items), a keypad, and a live
// Quantity / Price summary; Add to cart (or Enter) puts the line in the cart.
//
// The panel does not block the screen: tapping another weight item switches it
// to that item, and tapping any other item closes it (the POS does both). While
// it is open it owns the number keys, Enter, Esc, '+' and F9 (read the scale),
// so a stray Enter never opens Payment and '+' never pays the bill underneath.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Delete, Scale, X } from 'lucide-react';
import {
  formatKg, presetText, typeKey, weightLine,
  type PriceRounding, type WeightLine, type WeightMode, type WeightUnit,
} from '@/lib/weightEntry';

interface Props {
  item: { id: string; name: string };
  /** Price per kg. */
  rate: number;
  /** "Rs." — the shop's currency, as the POS shows it. */
  currency: string;
  rounding: PriceRounding;
  kgPresets: number[];
  amountPresets: number[];
  /** The latest reading from the scale for this item (filled in when it arrives). */
  scaleReading?: { kg: number; at: number } | null;
  /** Read the scale (button / F9). Absent = no scale button. */
  onReadScale?: () => void;
  scaleConnected?: boolean;
  onAdd: (line: WeightLine) => void;
  onClose: () => void;
}

const UNIT_LABEL: Record<WeightUnit, { short: string; enter: string }> = {
  kg: { short: 'kg', enter: 'Enter kg' },
  g: { short: 'g', enter: 'Enter grams' },
  pao: { short: 'pao', enter: 'Enter pao (¼ kg)' },
};

const money = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-PK') : n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function WeightEntrySheet({
  item, rate, currency, rounding, kgPresets, amountPresets, scaleReading, onReadScale, scaleConnected, onAdd, onClose,
}: Props) {
  const [mode, setMode] = useState<WeightMode>('weight');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [typed, setTyped] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  // Short windows (under 700 px tall) get a compact panel, so everything fits without scrolling.
  const [short, setShort] = useState(() => typeof window !== 'undefined' && window.innerHeight < 700);
  useEffect(() => {
    const onResize = () => setShort(window.innerHeight < 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A reading from the scale fills the weight in (kg), whatever was being typed.
  useEffect(() => {
    if (!scaleReading || !(scaleReading.kg > 0)) return;
    setMode('weight');
    setUnit('kg');
    setTyped(formatKg(scaleReading.kg));
  }, [scaleReading]);

  const line = useMemo(() => weightLine(mode, typed, unit, rate, rounding), [mode, typed, unit, rate, rounding]);
  const decimals = mode === 'weight' ? (unit === 'g' ? 0 : 3) : (rounding === 'decimal' ? 2 : 0);

  const press = useCallback((key: string) => setTyped(cur => typeKey(cur, key, decimals)), [decimals]);
  const switchMode = (m: WeightMode) => { if (m !== mode) { setMode(m); setTyped(''); } };
  const switchUnit = (u: WeightUnit) => { if (u !== unit) { setUnit(u); setTyped(''); } };
  const add = useCallback(() => { if (line) onAdd(line); }, [line, onAdd]);

  // The keyboard belongs to the panel while it is open (capture phase, before the POS shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inside = !!t && !!rootRef.current?.contains(t);
      const editable = !!t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
      if (editable && !inside) return; // typing in the search box: leave it alone
      const own = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'Escape') { own(); onClose(); return; }
      if (e.key === 'Enter') { own(); add(); return; }
      if (e.key === '+' || e.key === 'Add') { own(); return; } // never pay the bill underneath by accident
      if (e.key === 'F9') { own(); if (onReadScale) { setMode('weight'); onReadScale(); } return; }
      if (/^\d$/.test(e.key) || e.key === '.' || e.key === 'Backspace') { own(); press(e.key); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [add, onClose, onReadScale, press]);

  const presets = mode === 'weight' ? kgPresets : amountPresets;
  const unitInfo = UNIT_LABEL[unit];

  return (
    <div
      ref={rootRef}
      data-weight-sheet
      role="dialog"
      aria-modal="false"
      aria-label={`${item.name} — enter weight or amount`}
      data-short={short ? 'true' : undefined}
      className="dt-weight-sheet fixed inset-y-0 right-0 z-[45] flex w-full max-w-[400px] flex-col overflow-y-auto border-l bg-card text-card-foreground shadow-2xl"
    >
      {/* Header */}
      <div className={`flex shrink-0 items-start gap-3 px-5 ${short ? 'pb-2 pt-3' : 'pb-3 pt-5'}`}>
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-extrabold leading-tight">{item.name}</h2>
          <p className="text-xs text-muted-foreground">{currency} {money(rate)} per kg</p>
        </div>
        {onReadScale && (
          <button
            type="button"
            data-weight-scale
            onClick={() => { setMode('weight'); onReadScale(); }}
            title="Read the weight from the scale (F9)"
            className="shrink-0 rounded-lg border border-status-teal/50 bg-status-teal/10 px-2.5 py-1 text-xs font-bold text-status-teal hover:bg-status-teal/20"
          >⚖ {scaleConnected ? 'Scale' : 'Connect scale'} · F9</button>
        )}
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* By weight / By amount */}
      <div role="tablist" aria-label="Sell by" className="mx-5 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(['weight', 'amount'] as const).map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-weight-mode={m}
            onClick={() => switchMode(m)}
            className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {m === 'weight' ? 'By weight (kg)' : `By amount (${currency})`}
          </button>
        ))}
      </div>

      {/* Display */}
      <div className={`mx-5 shrink-0 rounded-2xl bg-primary/10 px-5 ${short ? 'mt-2 py-2' : 'mt-3 py-3'}`}>
        <div className="flex items-center justify-between gap-2">
          {mode === 'weight' ? (
            <div role="radiogroup" aria-label="Unit" className="flex gap-1">
              {(['kg', 'g', 'pao'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  data-weight-unit={u}
                  onClick={() => switchUnit(u)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors ${unit === u ? 'bg-primary text-primary-foreground' : 'bg-card/70 text-muted-foreground hover:text-foreground'}`}
                >{u === 'g' ? 'gram' : u}</button>
              ))}
            </div>
          ) : <span />}
          <span className="text-xs font-semibold text-muted-foreground">{mode === 'weight' ? unitInfo.enter : 'Enter amount'}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-end gap-2">
          <span data-weight-display className={`min-w-0 truncate font-black tabular-nums leading-tight text-primary ${short ? 'text-4xl' : 'text-5xl'}`}>{typed || '0'}</span>
          <span className="shrink-0 text-xl font-bold">{mode === 'weight' ? unitInfo.short : currency}</span>
        </div>
      </div>

      {/* Presets (and the scale) */}
      <div className={`mx-5 flex shrink-0 flex-wrap gap-2 ${short ? 'mt-2' : 'mt-3'}`}>
        {presets.map(p => (
          <button
            key={p}
            type="button"
            data-weight-preset={p}
            onClick={() => { if (mode === 'weight') setUnit('kg'); setTyped(presetText(p)); }}
            className="rounded-lg border bg-card px-3 py-1.5 text-sm font-bold transition-colors hover:border-primary/60 hover:text-primary"
          >{mode === 'weight' ? presetText(p) : money(p)}</button>
        ))}
      </div>

      {/* Keypad — takes the height that is left (keys between 38 and 62 px tall) */}
      <div
        className={`mx-5 grid min-h-[170px] flex-1 grid-cols-3 ${short ? 'mt-2 gap-2' : 'mt-4 gap-3'}`}
        style={{ gridTemplateRows: 'repeat(4, minmax(38px, 62px))', alignContent: 'start' }}
      >
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map(k => (
          <button
            key={k}
            type="button"
            data-weight-key={k}
            aria-label={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}
            disabled={k === '.' && decimals === 0}
            onClick={() => press(k)}
            className="flex items-center justify-center rounded-xl border bg-background text-2xl font-bold shadow-sm transition-transform hover:bg-accent active:scale-[0.97] disabled:opacity-40"
          >
            {k === '⌫' ? <Delete className="h-6 w-6 text-destructive" /> : k}
          </button>
        ))}
      </div>

      {/* Summary + Add */}
      <div className={`shrink-0 px-5 ${short ? 'space-y-2 pb-3 pt-2' : 'space-y-3 pb-5 pt-4'}`}>
        <div className={`rounded-xl border px-4 text-sm ${short ? 'py-2' : 'py-3'}`}>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Quantity</span>
            <b data-weight-qty className="tabular-nums">{formatKg(line?.kg || 0)} kg</b>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-muted-foreground">Price</span>
            <b data-weight-price className="text-xl tabular-nums text-primary">{currency} {money(line?.price || 0)}</b>
          </div>
        </div>
        <button
          type="button"
          data-weight-add
          disabled={!line}
          onClick={add}
          className={`flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-extrabold text-primary-foreground shadow-lg transition-opacity hover:opacity-95 disabled:opacity-50 ${short ? 'h-12' : 'h-14'}`}
        >
          Add to cart
          <kbd className="rounded border border-primary-foreground/40 px-1.5 py-0.5 text-[11px] font-bold opacity-80">Enter</kbd>
        </button>
      </div>
    </div>
  );
}
