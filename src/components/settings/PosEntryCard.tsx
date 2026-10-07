// ============================================================
// Weight items and the payment screen, in Settings.
//
//   • Weight items (kg): open the side panel (By weight / By amount, presets,
//     keypad) — or the cart keypad, as before. The preset buttons are the
//     shop's own: "0.25, 0.5, 1" kg and "100, 200, 500" rupees.
//   • Payment screen: the Premium layout (big total, method tiles, change and
//     due side by side) or the Classic compact popup.
// Both are on/off choices; nothing about the bill or its totals changes.
// ============================================================
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { RestaurantSettings } from '@/lib/types';
import { DEFAULT_AMOUNT_PRESETS, DEFAULT_KG_PRESETS, parsePresetText, presetsFrom } from '@/lib/weightEntry';

interface Props {
  settings: RestaurantSettings;
  onChange: (patch: Partial<RestaurantSettings>) => void;
}

export default function PosEntryCard({ settings, onChange }: Props) {
  const panelOn = settings.weightEntryPanel !== false;
  const premium = settings.paymentDialogStyle !== 'classic';
  const [kgText, setKgText] = useState(() => presetsFrom(settings.weightPresetsKg, DEFAULT_KG_PRESETS).join(', '));
  const [amtText, setAmtText] = useState(() => presetsFrom(settings.weightPresetsAmount, DEFAULT_AMOUNT_PRESETS).join(', '));

  const commit = (which: 'kg' | 'amount') => {
    const text = which === 'kg' ? kgText : amtText;
    const fallback = which === 'kg' ? DEFAULT_KG_PRESETS : DEFAULT_AMOUNT_PRESETS;
    const nums = presetsFrom(parsePresetText(text), fallback);
    onChange(which === 'kg' ? { weightPresetsKg: nums } : { weightPresetsAmount: nums });
    (which === 'kg' ? setKgText : setAmtText)(nums.join(', '));
  };

  return (
    <div data-testid="pos-entry-card" className="col-span-2 space-y-4 rounded-xl border bg-muted/20 p-3">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold">Weight items (kg)</div>
            <p className="text-[11px] text-muted-foreground">
              Tapping an item sold per kg opens a panel at the side: sell it <b>by weight</b> (e.g. 1.5 kg) or <b>by amount</b> (e.g. Rs. 500 worth),
              with preset buttons and a keypad. Off: the cart keypad opens, as before.
            </p>
          </div>
          <Switch
            checked={panelOn}
            onCheckedChange={v => onChange({ weightEntryPanel: v })}
            aria-label="Open the side panel for weight items"
          />
        </div>
        {panelOn && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="weight-presets-kg">Weight buttons (kg)</label>
              <Input id="weight-presets-kg" value={kgText} onChange={e => setKgText(e.target.value)} onBlur={() => commit('kg')} placeholder="0.25, 0.5, 1, 1.5, 2, 5" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="weight-presets-amount">Amount buttons (Rs.)</label>
              <Input id="weight-presets-amount" value={amtText} onChange={e => setAmtText(e.target.value)} onBlur={() => commit('amount')} placeholder="100, 200, 500, 1000, 2000" />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">Separate with commas, up to 8 each. Leave empty for the defaults.</p>
          </div>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="text-sm font-bold">Payment screen</div>
        <p className="text-[11px] text-muted-foreground">The popup that opens on Pay. Same payments, change and credit either way — only the layout differs.</p>
        <div className="mt-2 inline-flex overflow-hidden rounded-md border" role="group" aria-label="Payment screen design">
          {([['premium', 'Premium'], ['classic', 'Classic']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-payment-style={id}
              aria-pressed={(id === 'premium') === premium}
              onClick={() => onChange({ paymentDialogStyle: id })}
              className={`px-3 py-1.5 text-xs font-bold ${(id === 'premium') === premium ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
            >{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
