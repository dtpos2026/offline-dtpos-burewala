// Small building blocks shared by every Super Admin screen. Same tokens as the
// POS (see theme.ts); no business logic lives here.
import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { card, INK_2, LINE, MUTED, OVERLAY, TEXT, TINT } from './theme';

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

/** A dialog: scrim + card. Clicking the scrim closes it. */
export function Modal({
  onClose, children, width = 560, top = false, z = 70,
}: { onClose: () => void; children: ReactNode; width?: number; top?: boolean; z?: number }) {
  return (
    <div
      role="presentation" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: OVERLAY, display: 'flex',
        alignItems: top ? 'flex-start' : 'center', justifyContent: 'center', padding: 16, zIndex: z, overflowY: 'auto',
      }}
    >
      <div
        role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{
          ...card, background: INK_2, border: `1px solid ${LINE}`, boxShadow: 'var(--ui-shadow-pop)',
          borderRadius: 'var(--ui-radius-dialog)', padding: 22, width: `min(${width}px, 100%)`, maxHeight: '90vh', overflowY: 'auto',
        }}
      >{children}</div>
    </div>
  );
}
