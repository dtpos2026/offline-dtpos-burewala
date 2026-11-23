// ============================================================
// Compatibility cut — the switch (and its card). Device-local.
// See src/printing/cutPrefs.ts for exactly what it changes.
// ============================================================
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { isCompatCut, setCompatCut } from '@/printing/cutPrefs';

export function CompatCutToggle() {
  const [on, setOn] = useState<boolean>(() => isCompatCut());
  useEffect(() => {
    const sync = () => setOn(isCompatCut());
    window.addEventListener('dtpos-compat-cut-changed', sync);
    return () => window.removeEventListener('dtpos-compat-cut-changed', sync);
  }, []);
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3" data-compat-cut>
      <div>
        <p className="text-sm font-medium">Compatibility cut for older printers (feed, then cut)</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Turn this on if the printer cuts through the last line (for example the footer or "Printed …") or prints it on top of the
          next slip. The slip is then padded with blank paper and plain line feeds before the cut, which any printer follows. It
          uses roughly 8–10&nbsp;mm more paper per slip. This computer only.
        </p>
      </div>
      <Switch
        checked={on}
        aria-label="Compatibility cut for older printers (feed, then cut)"
        onCheckedChange={(v) => {
          setOn(v);
          setCompatCut(v);
          toast.success(v ? 'Compatibility cut is ON for this computer' : 'Compatibility cut is OFF');
        }}
      />
    </div>
  );
}

export default function CompatCutCard() {
  return (
    <Card className="p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Paper cut</h3>
        <p className="text-sm text-muted-foreground">
          How far the paper is fed before the cutter fires. Print Quality and templates are not changed.
        </p>
      </div>
      <CompatCutToggle />
    </Card>
  );
}
