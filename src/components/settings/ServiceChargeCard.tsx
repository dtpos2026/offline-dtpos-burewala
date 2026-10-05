// ============================================================
// Service charge, in Settings: how much, and for which kinds of order.
//
// Percent or a flat PKR amount, with a separate switch for Dine-In, Takeaway and
// Delivery. Choosing the order type on the POS then adds it by itself. The card
// states, in one sentence, exactly what the current choice will do — including
// for a shop that was charging every order type before these switches existed.
// ============================================================
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import type { RestaurantSettings } from '@/lib/types';
import {
  describeServiceCharge, serviceChargeAppliesTo, type ServiceChargeMode, type ServiceChargeOrderType,
} from '@/lib/serviceCharge';

interface Props {
  settings: RestaurantSettings;
  onChange: (patch: Partial<RestaurantSettings>) => void;
}

const TYPES: { id: ServiceChargeOrderType; label: string; hint: string }[] = [
  { id: 'dining', label: 'Dine-In', hint: 'Added when a table is selected' },
  { id: 'takeaway', label: 'Takeaway', hint: 'Counter and pick-up orders' },
  { id: 'delivery', label: 'Delivery', hint: 'Orders sent out with a rider' },
];

export default function ServiceChargeCard({ settings, onChange }: Props) {
  const mode: ServiceChargeMode = settings.serviceChargeMode === 'pkr' ? 'pkr' : 'percent';
  const value = mode === 'percent' ? settings.serviceChargePercent : settings.serviceChargeAmount;

  const setType = (id: ServiceChargeOrderType, on: boolean) => {
    // Write all three so the saved choice is explicit; a missing key would mean "on" for an older shop.
    const next = {
      dining: serviceChargeAppliesTo(settings, 'dining'),
      takeaway: serviceChargeAppliesTo(settings, 'takeaway'),
      delivery: serviceChargeAppliesTo(settings, 'delivery'),
      [id]: on,
    };
    onChange({ serviceChargeOrderTypes: next });
  };

  return (
    <div data-testid="service-charge-card" className="col-span-2 space-y-3 rounded-xl border bg-muted/20 p-3">
      <div>
        <div className="text-sm font-bold">Service charge</div>
        <p className="text-[11px] text-muted-foreground">
          Added to the bill automatically for the order types you switch on. A manager can still add, change or remove it on a single bill.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Charge as</label>
          <div className="mt-1 inline-flex overflow-hidden rounded-md border" role="group" aria-label="Service charge type">
            {(['percent', 'pkr'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ serviceChargeMode: m })}
                className={`px-3 py-1.5 text-xs font-bold ${mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                aria-pressed={mode === m}
              >
                {m === 'percent' ? 'Percentage (%)' : 'Fixed amount (PKR)'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {mode === 'percent' ? 'Service charge (%)' : 'Service charge per bill (PKR)'}
          </label>
          <Input
            type="number"
            min={0}
            max={mode === 'percent' ? 100 : undefined}
            value={value ?? 0}
            onChange={e => {
              const n = Math.max(0, Number(e.target.value) || 0);
              onChange(mode === 'percent' ? { serviceChargePercent: Math.min(100, n) } : { serviceChargeAmount: n });
            }}
            aria-label="Service charge value"
          />
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Apply to</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map(t => {
            const on = serviceChargeAppliesTo(settings, t.id);
            return (
              <label key={t.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
                </span>
                <Switch checked={on} onCheckedChange={v => setType(t.id, v)} aria-label={`Service charge on ${t.label}`} />
              </label>
            );
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Allow adding or editing it on a bill</span>
          <span className="block text-[11px] text-muted-foreground">
            Shows a small edit button next to the service charge in the POS. Cashiers can use it unless discounts need approval.
          </span>
        </span>
        <Switch
          checked={settings.serviceChargeEditable !== false}
          onCheckedChange={v => onChange({ serviceChargeEditable: v })}
          aria-label="Allow editing the service charge on a bill"
        />
      </label>

      <p className="text-xs font-medium text-foreground" data-testid="service-charge-summary">{describeServiceCharge(settings)}</p>
      <p className="text-[11px] text-muted-foreground">
        Example: Subtotal PKR 2,000 with 10% on Dine-In → Service Charge PKR 200 → Total PKR 2,200. The charge is worked out after any discount,
        and the receipt shows it on its own line only when there is one.
      </p>
    </div>
  );
}
