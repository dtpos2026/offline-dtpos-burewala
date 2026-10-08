// ============================================================
// PIN SIGN-IN — tap your name, type your 4-digit PIN.
//
// The quick way in for a busy counter. The PIN is set per user in Users &
// Roles (optional); the username + password form is always one tap away and
// is what a user without a PIN gets. Five wrong PINs lock that user's PIN
// sign-in for a minute (store.authenticateUserByPin); the password still works.
//
// Typing on the keyboard works too: digits, Backspace, Esc to clear. Keys
// typed into a text box (e.g. the recovery dialog) are left alone.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Delete, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { authenticateUserByPin, pinLoginUsers, type PinLoginUser } from '@/lib/store';
import type { User } from '@/lib/types';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', order_taker: 'Order Taker', rider: 'Rider' };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const;
export const LAST_PIN_USER_KEY = 'pos-pin-last-user';

interface Props {
  onSuccess: (user: User) => void;
  /** Go to the username + password form, with a username filled in when known. */
  onUsePassword: (username?: string) => void;
  /** "Welcome back / Select your name and enter your PIN." above the cards. */
  heading?: boolean;
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function PinLoginPanel({ onSuccess, onUsePassword, heading = false }: Props) {
  const users = useMemo<PinLoginUser[]>(() => pinLoginUsers(), []);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      const last = localStorage.getItem(LAST_PIN_USER_KEY);
      return users.some(u => u.id === last && u.hasPin) ? last : null;
    } catch { return null; }
  });
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const selected = users.find(u => u.id === selectedId) || null;

  const choose = (u: PinLoginUser) => {
    setPin('');
    setMessage(null);
    if (!u.hasPin) {
      toast.info(`No PIN is set for ${u.name} yet — sign in with the password. An admin can add a PIN in Users & Roles.`);
      onUsePassword(u.username);
      return;
    }
    setSelectedId(u.id);
  };

  const submit = useCallback((entered: string) => {
    if (!selected) return;
    const r = authenticateUserByPin(selected.id, entered);
    setPin('');
    if (r.reason === 'ok' && r.user) {
      try { localStorage.setItem(LAST_PIN_USER_KEY, selected.id); } catch { /* storage blocked */ }
      setMessage(null);
      onSuccess(r.user);
      return;
    }
    if (r.reason === 'no_pin') { onUsePassword(selected.username); return; }
    setMessage(
      r.reason === 'bad_pin' ? `Wrong PIN — ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left` :
      r.reason === 'locked' ? `Too many wrong PINs. Try again in ${r.retryInSec} s, or use your password.` :
      r.reason === 'inactive' ? 'This user is inactive — contact the admin.' :
      r.reason === 'no_db' ? 'Database not loaded. Please restart the app or restore a backup.' :
                             'Sign-in failed. Use your username and password.',
    );
  }, [selected, onSuccess, onUsePassword]);

  const press = useCallback((key: string) => {
    if (!selected) return;
    if (key === 'C') { setPin(''); setMessage(null); return; }
    if (key === '⌫') { setPin(pin.slice(0, -1)); return; }
    if (!/^\d$/.test(key) || pin.length >= 4) return;
    const next = pin + key;
    if (next.length === 4) submit(next); // the fourth digit signs in (or clears with a message)
    else setPin(next);
  }, [selected, pin, submit]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || isEditable(e.target)) return;
      const key = e.key === 'Backspace' ? '⌫' : e.key === 'Escape' || e.key === 'Delete' ? 'C' : e.key;
      if (/^\d$/.test(key) || key === '⌫' || key === 'C') { e.preventDefault(); press(key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, press]);

  return (
    <div data-pin-login className="w-full">
      {heading && (
        <div className="mb-4">
          <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select your name and enter your PIN.</p>
        </div>
      )}

      <div role="radiogroup" aria-label="Who is signing in" className="grid max-h-[17rem] grid-cols-3 gap-3 overflow-y-auto p-0.5">
        {users.map(u => {
          const on = u.id === selectedId;
          return (
            <button
              key={u.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-pin-user={u.id}
              onClick={() => choose(u)}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-3.5 text-center transition-colors ${on ? 'border-2 border-primary bg-primary/5' : 'border-2 border-border bg-card hover:border-primary/40'}`}
            >
              <span data-pin-avatar className="mb-1 grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-base font-bold text-primary-foreground shadow-sm">
                {(u.name || '?').trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="w-full truncate text-sm font-semibold text-foreground">{u.name}</span>
              <span className="text-xs font-medium text-muted-foreground">{ROLE_LABEL[u.role] || u.role}{u.hasPin ? '' : ' · password'}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <>
          <div data-pin-dots={pin.length} role="status" aria-label={`${pin.length} of 4 digits entered`} className="mt-5 flex justify-center gap-3.5">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${i < pin.length ? 'border-primary bg-primary' : 'border-muted-foreground/40'}`} />
            ))}
          </div>
          {message && <p data-pin-message role="alert" className="mt-2 text-center text-xs font-semibold text-destructive">{message}</p>}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {KEYS.map(k => (
              <button
                key={k}
                type="button"
                data-pin-key={k}
                aria-label={k === '⌫' ? 'Delete last digit' : k === 'C' ? 'Clear' : k}
                onClick={() => press(k)}
                className="grid h-[52px] place-items-center rounded-xl border border-border bg-card text-xl font-semibold text-foreground shadow-sm transition-colors hover:bg-muted active:bg-muted/80"
              >
                {k === '⌫' ? <Delete className="h-5 w-5" /> : k}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        data-use-password
        onClick={() => onUsePassword(selected?.username)}
        className="mx-auto mt-5 flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
      >
        <KeyRound className="h-4 w-4" /> Use username &amp; password
      </button>
    </div>
  );
}
