// Digital Target brand tokens for the Super Admin panel.
// Light, professional purple theme — matches the POS licence screen branding.
export const BRAND = '#3C096C';
export const BRAND_SOFT = '#5A189A';
export const ACCENT = '#7B2CBF';
export const ACCENT_SOFT = '#E0AAFF';
export const INK = '#F7F3FC';       // page background
export const INK_2 = '#FFFFFF';     // surfaces
export const TEXT = '#1B0B2E';
export const STRONG = '#3C096C';    // emphasised text
export const MUTED = 'rgba(27,11,46,0.62)';
export const LINE = 'rgba(60,9,108,0.14)';
export const TINT = 'rgba(60,9,108,0.045)';
export const TINT_2 = 'rgba(60,9,108,0.075)';

export const STATUS = {
  active:    { fg: '#047857', bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.35)' },
  expired:   { fg: '#B91C1C', bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.32)'  },
  suspended: { fg: '#B45309', bg: 'rgba(245,158,11,0.14)', bd: 'rgba(245,158,11,0.38)' },
} as const;

export const card: React.CSSProperties = {
  background: INK_2,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
  boxShadow: '0 18px 40px -28px rgba(60,9,108,0.45)',
};

export const input: React.CSSProperties = {
  width: '100%', padding: '10px 12px', marginTop: 6, boxSizing: 'border-box',
  background: '#fff', color: TEXT,
  border: `1px solid ${LINE}`, borderRadius: 10,
  fontSize: 14, outline: 'none',
};

export const label: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1,
  textTransform: 'uppercase', color: ACCENT,
};

export const primaryBtn: React.CSSProperties = {
  padding: '12px 16px', border: 'none', borderRadius: 11,
  background: `linear-gradient(135deg, ${BRAND_SOFT}, ${BRAND})`,
  color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
  boxShadow: '0 10px 26px -12px rgba(90,24,154,0.6)',
};

export const ghostBtn: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 10, background: TINT,
  color: BRAND, border: `1px solid ${LINE}`,
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
};
