// ============================================================
// Global licence block popup.
// Whenever the print guard refuses (licence from another computer, expiry,
// clock tamper, a server block) a clear warning appears wherever the user
// is, and the bill is not printed.
// ============================================================
import { useEffect, useState } from 'react';
import { AlertTriangle, Copy, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { onPrintBlocked, type PrintGuardResult } from '@/licensing/printGuard';
import { getHardwareId } from '@/licensing/licenseService';

const TITLES: Record<string, string> = {
  'device-mismatch': 'This license belongs to another computer',
  'clock-tamper': 'The system date or time has been changed',
  expired: 'The license has expired',
  suspended: 'The license is suspended',
  revoked: 'The license has been revoked',
  pending: 'The license is pending',
  deleted: 'This computer was removed from the license',
  'device-limit': 'Device limit reached',
  disabled: 'The license has been disabled',
  'not-found': 'The license key is not valid',
  'identity-unavailable': "This computer's identity could not be read",
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
            Printing blocked
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-sm font-bold text-destructive">{TITLES[reason] || 'The license could not be verified'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{blocked.message}</p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Bills will not print on this computer until the license is verified again.
              Send this Device ID to Digital Target support so the license can be checked.
            </span>
          </div>

          {device && (
            <button
              onClick={() => { navigator.clipboard?.writeText(device); toast.success('Device ID copied'); }}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-mono hover:bg-accent"
            >
              <span className="truncate">{device}</span>
              <Copy className="ml-2 h-3.5 w-3.5 shrink-0" />
            </button>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBlocked(null)}>Close</Button>
            <Button className="flex-1" onClick={() => window.location.reload()}>Check again</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
