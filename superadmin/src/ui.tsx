// Building blocks shared by every Super Admin screen. Same tokens as the POS
// (see theme.ts); no business logic lives here.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Copy, Inbox, Info, MoreHorizontal, TriangleAlert, X } from 'lucide-react';
import {
  ACCENT, ACCENT_TEXT, card, ghostBtn, INK_2, LINE, LINE_STRONG, MUTED, OVERLAY, primaryBtn, STATUS, TEXT, TINT,
} from './theme';

// ---------------------------------------------------------------- Empty state
/** A quiet centred message for lists that have nothing to show yet. */
export function Empty({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
      padding: '28px 16px', color: MUTED, fontSize: 13,
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 12, background: TINT, display: 'grid', placeItems: 'center',
      }}><Icon size={20} strokeWidth={1.75} aria-hidden /></span>
      <div style={{ maxWidth: 420, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// -------------------------------------------------------------------- Section
/** A card with a title row: the one container every section uses. */
export function Section({
  title, hint, right, children, style,
}: { title?: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ ...card, padding: 20, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: hint ? 4 : 14 }}>
          {title && <h2 style={{ fontSize: 'var(--ui-text-card-title)', fontWeight: 700, margin: 0, color: TEXT }}>{title}</h2>}
          {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{right}</div>}
        </div>
      )}
      {hint && <p style={{ fontSize: 13, color: MUTED, margin: '0 0 14px', lineHeight: 1.6 }}>{hint}</p>}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------- Modal
// Only the top-most dialog answers Escape, so a confirmation opened over an
// edit dialog closes on its own first.
const modalStack: number[] = [];
let modalSeq = 0;

/** A dialog: scrim + card. Clicking the scrim or pressing Escape closes it. */
export function Modal({
  onClose, children, width = 560, top = false, z = 70, label,
}: { onClose: () => void; children: ReactNode; width?: number; top?: boolean; z?: number; label?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = ++modalSeq;
    modalStack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    boxRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      role="presentation" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: OVERLAY, display: 'flex',
        alignItems: top ? 'flex-start' : 'center', justifyContent: 'center', padding: 16, zIndex: z, overflowY: 'auto',
      }}
    >
      <div
        ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        onClick={e => e.stopPropagation()}
        style={{
          ...card, background: INK_2, border: `1px solid ${LINE}`, boxShadow: 'var(--ui-shadow-pop)',
          borderRadius: 'var(--ui-radius-dialog)', padding: 22, width: `min(${width}px, 100%)`, maxHeight: '90vh',
          overflowY: 'auto', outline: 'none', marginTop: top ? 24 : undefined,
        }}
      >{children}</div>
    </div>
  );
}

/** Title row of a dialog, with a close button. */
export function ModalHeader({ title, sub, onClose }: { title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--ui-text-section)', fontWeight: 700, lineHeight: 1.3 }}>{title}</h3>
        {sub && <div style={{ marginTop: 3, fontSize: 12, color: MUTED }}>{sub}</div>}
      </div>
      <button
        type="button" onClick={onClose} aria-label="Close"
        style={{
          marginLeft: 'auto', flex: 'none', width: 32, height: 32, display: 'grid', placeItems: 'center',
          borderRadius: 'var(--ui-radius-control)', border: '1px solid transparent', background: 'transparent',
          color: MUTED, cursor: 'pointer',
        }}
      ><X size={18} strokeWidth={1.75} aria-hidden /></button>
    </div>
  );
}

// ------------------------------------------------ Confirmations and messages
// Replaces the browser's confirm() / alert() with dialogs and toasts that match
// the rest of the panel. Without a provider (a screen rendered on its own) the
// old browser dialog is used, so behaviour never silently changes.
export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ToastTone = 'success' | 'error' | 'info';
interface Feedback {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, tone?: ToastTone) => void;
}

const browserFallback: Feedback = {
  confirm: o => Promise.resolve(
    typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(o.title + (typeof o.body === 'string' ? `\n\n${o.body}` : ''))
      : false,
  ),
  toast: message => { if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message); },
};
const FeedbackContext = createContext<Feedback>(browserFallback);

export const useConfirm = () => useContext(FeedbackContext).confirm;
export const useToast = () => useContext(FeedbackContext).toast;

const TOAST_TONE: Record<ToastTone, { fg: string; bg: string; bd: string; Icon: LucideIcon }> = {
  success: { ...STATUS.active, Icon: CheckCircle2 },
  error: { ...STATUS.expired, Icon: TriangleAlert },
  info: { fg: 'var(--ui-info-text)', bg: 'var(--ui-info-soft)', bd: 'var(--ui-info-border)', Icon: Info },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [asking, setAsking] = useState<{ o: ConfirmOptions; done: (v: boolean) => void } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  const seq = useRef(0);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>(done => setAsking({ o, done })),
    [],
  );
  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++seq.current;
    setToasts(list => [...list.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);

  const answer = (v: boolean) => { asking?.done(v); setAsking(null); };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {asking && (
        <Modal onClose={() => answer(false)} width={440} z={90} label={asking.o.title}>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{
              flex: 'none', width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
              background: asking.o.danger ? STATUS.expired.bg : 'var(--ui-accent-soft)',
              color: asking.o.danger ? STATUS.expired.fg : ACCENT,
            }}>
              {asking.o.danger ? <TriangleAlert size={20} strokeWidth={1.75} aria-hidden /> : <Info size={20} strokeWidth={1.75} aria-hidden />}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 'var(--ui-text-section)', fontWeight: 700, lineHeight: 1.35 }}>{asking.o.title}</h3>
              {asking.o.body && (
                <div style={{ marginTop: 6, fontSize: 13, color: MUTED, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{asking.o.body}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button type="button" style={{ ...ghostBtn, minHeight: 40 }} onClick={() => answer(false)}>
              {asking.o.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button" autoFocus
              style={{
                ...primaryBtn,
                ...(asking.o.danger ? { background: STATUS.expired.fg, boxShadow: 'none' } : null),
              }}
              onClick={() => answer(true)}
            >{asking.o.confirmLabel || 'Confirm'}</button>
          </div>
        </Modal>
      )}
      <div
        role="status" aria-live="polite"
        style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 100, display: 'grid', gap: 8, maxWidth: 'min(420px, calc(100vw - 32px))' }}
      >
        {toasts.map(t => {
          const tone = TOAST_TONE[t.tone];
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', fontSize: 13, lineHeight: 1.5,
              background: INK_2, color: TEXT, border: `1px solid ${tone.bd}`, borderLeft: `4px solid ${tone.fg}`,
              borderRadius: 'var(--ui-radius-control)', boxShadow: 'var(--ui-shadow-pop)',
            }}>
              <tone.Icon size={18} strokeWidth={1.75} aria-hidden style={{ flex: 'none', color: tone.fg, marginTop: 1 }} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

// ------------------------------------------------------------------ Row menu
export type MenuEntry =
  | { label: string; onSelect: () => void; danger?: boolean; checked?: boolean; disabled?: boolean; swatch?: string }
  | { heading: string }
  | 'separator';

/** A "⋯" button that opens a small menu. It is positioned against the window, so a
 *  table that scrolls sideways cannot clip it. */
export function RowMenu({
  label, items, disabled, trigger, triggerStyle, anchor = 'right', minWidth = 200,
}: {
  label: string; items: MenuEntry[]; disabled?: boolean;
  /** Replaces the "⋯" button's content (and, with triggerStyle, its look). */
  trigger?: ReactNode; triggerStyle?: CSSProperties;
  /** Which edge of the button the menu lines up with. */
  anchor?: 'left' | 'right'; minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right?: number; left?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const estimate = items.reduce((h, it) => h + (it === 'separator' ? 9 : 'heading' in it ? 28 : 36), 12);
      const below = r.bottom + 6;
      const top = below + estimate > window.innerHeight && r.top - estimate - 6 > 0 ? r.top - estimate - 6 : below;
      setPos(anchor === 'left'
        ? { top, left: Math.max(8, Math.min(r.left, window.innerWidth - minWidth - 8)) }
        : { top, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggle} disabled={disabled}
        aria-label={label} aria-haspopup="menu" aria-expanded={open} title={label}
        style={trigger ? triggerStyle : {
          ...ghostBtn, minHeight: 32, width: 32, padding: 0, display: 'inline-grid', placeItems: 'center',
          background: open ? TINT : INK_2,
        }}
      >{trigger || <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />}</button>
      {open && pos && (
        <div
          ref={menuRef} role="menu" aria-label={label}
          style={{
            position: 'fixed', top: pos.top, right: pos.right, left: pos.left, zIndex: 80, minWidth, padding: 6,
            background: INK_2, border: `1px solid ${LINE}`, borderRadius: 'var(--ui-radius-control)',
            boxShadow: 'var(--ui-shadow-pop)',
          }}
        >
          {items.map((it, i) => {
            if (it === 'separator') return <div key={i} role="separator" style={{ height: 1, background: LINE, margin: '5px 2px' }} />;
            if ('heading' in it) {
              return <div key={i} style={{ padding: '6px 10px 2px', fontSize: 11.5, fontWeight: 600, color: MUTED }}>{it.heading}</div>;
            }
            return (
              <button
                key={i} type="button" role="menuitem" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 34, padding: '6px 10px',
                  border: 'none', borderRadius: 8, background: 'transparent', textAlign: 'left', cursor: 'pointer',
                  fontSize: 13, fontWeight: it.checked ? 600 : 500, color: it.danger ? STATUS.expired.fg : TEXT,
                }}
                className="sa-menu-item"
              >
                {it.swatch ? (
                  <span aria-hidden style={{ width: 14, height: 14, flex: 'none', borderRadius: '50%', background: it.swatch, boxShadow: 'inset 0 0 0 1px hsl(0 0% 0% / 0.12)' }} />
                ) : (
                  <span style={{ width: 16, flex: 'none', color: ACCENT_TEXT, display: 'inline-grid', placeItems: 'center' }}>
                    {it.checked ? <CheckCircle2 size={15} strokeWidth={2} aria-hidden /> : null}
                  </span>
                )}
                {it.label}
                {it.swatch && it.checked && (
                  <span style={{ marginLeft: 'auto', color: ACCENT_TEXT, display: 'inline-grid' }}><CheckCircle2 size={15} strokeWidth={2} aria-hidden /></span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------- Small pieces
const AVATAR_TONES = [
  { bg: 'var(--ui-accent-soft)', fg: ACCENT_TEXT },
  { bg: 'var(--ui-info-soft)', fg: 'var(--ui-info-text)' },
  { bg: 'var(--ui-success-soft)', fg: 'var(--ui-success-text)' },
  { bg: 'var(--ui-warning-soft)', fg: 'var(--ui-warning-text)' },
];

/** Initials in a soft tile; the colour is stable for a given name. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const words = (name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] || '?') + (words.length > 1 ? words[1][0] : '')).toUpperCase();
  let h = 0;
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[h % AVATAR_TONES.length];
  return (
    <span aria-hidden style={{
      flex: 'none', width: size, height: size, borderRadius: Math.round(size * 0.3), display: 'inline-grid',
      placeItems: 'center', background: tone.bg, color: tone.fg, fontSize: Math.round(size * 0.36), fontWeight: 700,
    }}>{initials}</span>
  );
}

/** A thin progress bar. */
export function MiniBar({ value, max, color = ACCENT, height = 6 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span aria-hidden style={{ display: 'block', height, borderRadius: 999, background: TINT, overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 999, background: color }} />
    </span>
  );
}

/** Filter chips with an optional count on each. */
export function Chips<T extends string>({
  options, value, onChange, label,
}: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button
            key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={on}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '4px 12px',
              borderRadius: 'var(--ui-radius-pill)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
              border: `1px solid ${on ? ACCENT : LINE_STRONG}`,
              background: on ? ACCENT : INK_2, color: on ? 'var(--ui-accent-fg)' : TEXT,
            }}
          >
            {o.label}
            {o.count !== undefined && (
              <span style={{
                minWidth: 20, padding: '0 6px', borderRadius: 999, fontSize: 11.5, lineHeight: '18px', textAlign: 'center',
                background: on ? 'hsl(0 0% 100% / 0.22)' : TINT, color: on ? 'inherit' : MUTED,
              }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Copies text and says so. */
export function CopyButton({ text, label = 'Copy', compact = false }: { text: string; label?: string; compact?: boolean }) {
  const toast = useToast();
  return (
    <button
      type="button" aria-label={`${label}: ${text}`} title={label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); toast('Copied to the clipboard.', 'success'); }
        catch { toast('Could not copy. Select the text and press Ctrl+C.', 'error'); }
      }}
      style={{
        ...ghostBtn, minHeight: compact ? 28 : 34, padding: compact ? '0 8px' : '7px 14px',
        display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
      }}
    >
      <Copy size={compact ? 13 : 14} strokeWidth={1.75} aria-hidden />
      {!compact && label}
    </button>
  );
}

/** "3 days ago", "in 5 days", "today". */
export function relativeDays(ms: number, now = Date.now()): string {
  const d = Math.round((ms - now) / 86400000);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}
