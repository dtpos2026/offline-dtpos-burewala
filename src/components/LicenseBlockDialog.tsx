// ============================================================
// Global licence block popup.
// Jab bhi print guard mana kare (doosri machine ka licence, expiry,
// clock tamper) — poori screen par saaf warning aati hai aur bill print
// nahi hota. Kahin bhi ho, yeh dialog upar aa jata hai.
// ============================================================
import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { onPrintBlocked, type PrintGuardResult } from '@/licensing/printGuard';
import { getHardwareId } from '@/licensing/licenseService';

const TITLES: Record<string, string> = {
  'device-mismatch': 'Yeh licence doosray computer ka hai',
  'clock-tamper': 'System ki date/time badli hui hai',
  expired: 'Licence expire ho chuka hai',
  suspended: 'Licence suspend hai',
  revoked: 'Licence revoke ho chuka hai',
  disabled: 'Licence band kar diya gaya hai',
  'not-found': 'Licence key valid nahi hai',
};

export default function LicenseBlockDialog() {
  const [blocked, setBlocked] = useState<PrintGuardResult | null>(null);
  const [device, setDevice] = useState('');

  useEffect(() => onPrintBlocked((r) => {
    setBlocked(r);
    getHardwareId().then(setDevice).catch(() => {});
  }), []);

  if (!blocked) return null;
  const reason = blocked.reason || 'invalid';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) setBlocked(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Printing rok di gayi
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm font-bold text-destructive">{TITLES[reason] || 'Licence verify nahi hua'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{blocked.message}</p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Is computer par bill print nahi hoga jab tak licence dobara verify na ho.
              Digital Target ko yeh Device ID bhejein — Super Admin panel se extra computer
              approve ya licence move kiya ja sakta hai.
            </span>
          </div>

          {device && (
            <button
              onClick={() => { navigator.clipboard?.writeText(device); toast.success('Device ID copy ho gayi'); }}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-mono hover:bg-accent"
            >
              <span className="truncate">{device}</span>
              <Copy className="ml-2 h-3.5 w-3.5 shrink-0" />
            </button>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBlocked(null)}>Band karein</Button>
            <Button className="flex-1" onClick={() => window.location.reload()}>Dobara check karein</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
