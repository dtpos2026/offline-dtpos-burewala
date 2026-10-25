import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, RefreshCw } from 'lucide-react';
import { applyResetToken, describeReset, syncAdminReset, type ResetResult } from '@/licensing/adminResetSync';
import { loadLicense } from '@/licensing/licenseService';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after an administrator password was reset, so the sign-in form can fill in the username. */
  onApplied?: (username: string) => void;
}

type Note = { ok: boolean; text: string } | null;

/**
 * Forgot the administrator password? Digital Target resets it from the Super
 * Admin panel and this computer applies it by itself when it is online. "Check
 * now" does not wait for the next automatic check, and a reset code covers a
 * computer that never goes online.
 */
export default function ForgotPasswordDialog({ open, onClose, onApplied }: Props) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState<Note>(null);

  const finish = (r: ResetResult) => {
    setNote(describeReset(r));
    if (r.status === 'applied') { setCode(''); onApplied?.(r.username); }
  };

  const checkNow = async () => {
    setBusy(true); setNote(null);
    try {
      finish(await syncAdminReset({ force: true }));
    } catch { setNote({ ok: false, text: 'Could not check right now. Please try again.' }); }
    finally { setBusy(false); }
  };

  const applyCode = async () => {
    setBusy(true); setNote(null);
    try {
      const lic = await loadLicense();
      finish(lic?.licenseKey ? await applyResetToken(code, lic.licenseKey) : { status: 'invalid', reason: 'no-licence' });
    } catch { setNote({ ok: false, text: 'That code could not be used. Please try again.' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-forgot-password-dialog>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-primary" /> Forgot the administrator password?</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Ask Digital Target to reset it from the Super Admin panel. The new password is applied to this computer
            automatically as soon as it is online — then sign in as the administrator with it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button type="button" variant="outline" className="w-full" onClick={checkNow} disabled={busy}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Check for a reset now
          </Button>

          <div className="rounded-lg border border-border bg-secondary/50 p-3">
            <p className="text-xs font-semibold text-foreground">This computer has no internet?</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Digital Target can give you a reset code. Paste it here.</p>
            <Input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="DTP1.…"
              aria-label="Reset code"
              className="mt-2 h-9 font-mono text-xs"
              onKeyDown={e => e.key === 'Enter' && code.trim() && void applyCode()}
            />
            <Button type="button" className="mt-2 w-full" onClick={applyCode} disabled={busy || !code.trim()}>Apply reset code</Button>
          </div>

          {note && (
            <p
              role="status"
              className={`rounded-md border px-3 py-2 text-xs ${note.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
            >{note.text}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
