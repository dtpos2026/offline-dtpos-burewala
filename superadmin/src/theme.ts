// Super Admin look — the SAME design tokens as the POS (src/styles/ui-tokens.css).
//
// Every colour, radius and shadow below is a CSS variable from that file, so a
// change to the design system reaches the POS and this panel together. The
// names of the exports are kept so every screen keeps working unchanged.
//
// CSS variables do not resolve inside SVG presentation attributes (Leaflet map
// markers), so ACCENT_HEX exists for those few places only.

export const BRAND = 'var(--ui-text)';            // headings / dark surfaces
export const BRAND_SOFT = 'var(--ui-text)';
export const ACCENT = 'var(--ui-accent)';
export const ACCENT_TEXT = 'var(--ui-accent-text)';   // the accent as text on a light surface (deeper for a yellow theme)
export const ACCENT_HEX = '#d3420d';              // = the default accent, for SVG attributes
export const ACCENT_SOFT = 'var(--ui-accent-soft)';
export const INK = 'var(--ui-bg)';                // page background
export const INK_2 = 'var(--ui-surface)';         // surfaces
export const TEXT = 'var(--ui-text)';
export const STRONG = 'var(--ui-text)';           // emphasised text
export const MUTED = 'var(--ui-text-muted)';
export const LINE = 'var(--ui-border)';
export const LINE_STRONG = 'var(--ui-border-strong)';
export const TINT = 'var(--ui-surface-2)';
export const TINT_2 = 'hsl(var(--accent))';
export const OVERLAY = 'var(--ui-overlay)';

/** The dark admin rail — the "higher level" signal — is the ink colour itself. */
export const RAIL = 'var(--ui-text)';
export const RAIL_TEXT = 'hsl(30 12% 78%)';
export const RAIL_MUTED = 'hsl(30 8% 58%)';
export const RAIL_LINE = 'hsl(0 0% 100% / 0.10)';

export const STATUS = {
  active:    { fg: 'var(--ui-success-text)', bg: 'var(--ui-success-soft)', bd: 'var(--ui-success-border)' },
  expired:   { fg: 'var(--ui-danger-text)',  bg: 'var(--ui-danger-soft)',  bd: 'var(--ui-danger-border)'  },
  suspended: { fg: 'var(--ui-warning-text)', bg: 'var(--ui-warning-soft)', bd: 'var(--ui-warning-border)' },
} as const;

export const card: React.CSSProperties = {
  background: INK_2,
  border: `1px solid ${LINE}`,
  borderRadius: 'var(--ui-radius-card)',
  boxShadow: 'var(--ui-shadow-sm)',
};

export const input: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '9px 12px', marginTop: 6, boxSizing: 'border-box',
  background: INK_2, color: TEXT, fontFamily: 'inherit', lineHeight: 1.35,
  border: `1px solid ${LINE_STRONG}`, borderRadius: 'var(--ui-radius-control)',
  fontSize: 14, outline: 'none', boxShadow: 'var(--ui-shadow-xs)',
};

export const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: MUTED,
};

export const primaryBtn: React.CSSProperties = {
  minHeight: 40, padding: '9px 18px', border: 'none', borderRadius: 'var(--ui-radius-control)',
  background: ACCENT, color: 'var(--ui-accent-fg)', fontFamily: 'inherit',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 1px 2px hsl(var(--primary) / 0.28)',
};

export const ghostBtn: React.CSSProperties = {
  minHeight: 34, padding: '7px 14px', borderRadius: 'var(--ui-radius-control)',
  background: INK_2, color: TEXT, border: `1px solid ${LINE_STRONG}`, fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: 'var(--ui-shadow-xs)',
};

/** A small status / tag pill. */
export const pill = (tone: { fg: string; bg: string; bd: string }): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 'var(--ui-radius-pill)',
  fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
  color: tone.fg, background: tone.bg, border: `1px solid ${tone.bd}`,
});
