// ============================================================
// PREMIUM RECEIPT TEMPLATES
//
// Thirteen professional 80mm layouts, each drawn from a real restaurant
// receipt supplied as a reference. What is reused is layout only —
// typographic hierarchy, column structure, how the totals block is framed,
// where the hero number sits. No shop name, logo, phone number, tax id or
// any other identity from those receipts appears anywhere in this file.
//
// A template is CONFIGURATION, never content
// ------------------------------------------
// Everything here describes presentation: which header shape, how the item
// table is ruled, whether the grand total sits in a bar or a panel. The
// words and numbers on the paper come from the live order and the shop's
// own settings at print time (see PremiumReceipt.tsx), so one template
// works for every restaurant and branch without editing.
//
// Each template is a starting point. `PremiumCustomization` carries the
// shop's own adjustments on top, and a saved customization is what actually
// prints.
// ============================================================

export type PremiumTemplateId =
  | 'premium-paid-banner'
  | 'premium-tax-invoice'
  | 'premium-panel'
  | 'premium-fine-dining'
  | 'premium-grid-invoice'
  | 'premium-hall-detail'
  | 'premium-quick-bill'
  | 'premium-two-column'
  | 'premium-retail'
  | 'premium-grouped'
  | 'premium-token-hero'
  | 'premium-boxed-ledger'
  | 'premium-rounded-panel';

/** Header shape. */
export type HeaderStyle =
  | 'centered'      // logo above a centred name block
  | 'logo-left'     // logo left, shop details right
  | 'banner'        // name reversed out of a solid bar
  | 'stacked'       // name, then address/contact lines, tightly stacked
  | 'decorated';    // rule-and-ornament framed header

/** How the order/meta block is laid out. */
export type MetaStyle =
  | 'rows'          // label: value, one per line
  | 'two-column'    // two label/value pairs per line
  | 'boxed'         // framed panel of rows
  | 'split';        // left group / right group on the same lines

/** How item rows are separated. */
export type ItemStyle =
  | 'grid'          // every cell fully bordered
  | 'ruled'         // horizontal rules above/below the block only
  | 'dotted'        // dotted leader between rows
  | 'plain'         // no rules at all
  | 'grouped';      // category sub-headings with indented items

/** How the totals block is framed. */
export type TotalsStyle =
  | 'right'         // right-aligned label/value pairs
  | 'grid'          // bordered rows continuing the item table
  | 'panel'         // framed block
  | 'rounded';      // framed block with soft corners

/** How the grand total is emphasised. */
export type GrandTotalStyle =
  | 'bar'           // reversed solid bar
  | 'box'           // heavy border
  | 'large'         // oversized type, no frame
  | 'plain';        // bold, same size

/** One optional oversized number near the top of the slip. */
export type HeroStyle = 'none' | 'token' | 'order' | 'table';

export interface PremiumLayout {
  header: HeaderStyle;
  meta: MetaStyle;
  items: ItemStyle;
  totals: TotalsStyle;
  grandTotal: GrandTotalStyle;
  hero: HeroStyle;
  /** Static caption above the meta block, e.g. "INVOICE". Never a shop name. */
  title?: string;
  /** Show a status line ("PAID" / "UNPAID") driven by the live order. */
  statusLine?: boolean;
  /** Spell the grand total out in words. */
  amountInWords?: boolean;
  /** Reserve a QR block in the footer when the shop has QR turned on. */
  qr?: boolean;
  /** Serif body type — used by the fine-dining and heritage layouts. */
  serif?: boolean;
  /** The typeface this design is drawn with, before any customization. */
  font: PremiumCustomization['fontFamily'];
  /** Body size in px at 80mm, before any customization. */
  fontSize: number;
  /** Soft corners on framed blocks. */
  rounded?: boolean;
  /** Columns shown in the item table, in order. */
  columns: ItemColumn[];
}

export type ItemColumn = 'sr' | 'name' | 'variant' | 'qty' | 'rate' | 'amount';

export interface PremiumTemplate {
  id: PremiumTemplateId;
  name: string;
  hint: string;
  layout: PremiumLayout;
}

// ------------------------------------------------------------
// The thirteen layouts
// ------------------------------------------------------------
export const PREMIUM_TEMPLATES: PremiumTemplate[] = [
  {
    id: 'premium-paid-banner',
    name: 'Paid Banner',
    hint: 'Centred header, bold PAID/UNPAID banner, full meta block, bordered item grid.',
    layout: {
      header: 'centered', meta: 'rows', items: 'grid', totals: 'right',
      grandTotal: 'plain', hero: 'order', statusLine: true,
      font: 'sans', fontSize: 13,
      columns: ['sr', 'name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-tax-invoice',
    name: 'Tax Invoice',
    hint: 'Large shop name, tax-number row, boxed date bar, full grid and a QR block.',
    layout: {
      header: 'stacked', meta: 'split', items: 'grid', totals: 'right',
      grandTotal: 'large', hero: 'none', qr: true,
      font: 'sans', fontSize: 13,
      columns: ['qty', 'name', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-panel',
    name: 'Panelled Bill',
    hint: 'Framed address panel, bold title bar, big boxed order number, panelled totals.',
    layout: {
      header: 'centered', meta: 'boxed', items: 'grid', totals: 'panel',
      grandTotal: 'box', hero: 'order', title: 'BILL',
      font: 'sans', fontSize: 13,
      columns: ['qty', 'name', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-fine-dining',
    name: 'Fine Dining',
    hint: 'Serif type, generous spacing, rules instead of boxes, large table number.',
    layout: {
      header: 'centered', meta: 'rows', items: 'ruled', totals: 'right',
      grandTotal: 'plain', hero: 'table', serif: true,
      font: 'serif', fontSize: 14,
      columns: ['name', 'rate', 'qty', 'amount'],
    },
  },
  {
    id: 'premium-grid-invoice',
    name: 'Grid Invoice',
    hint: 'Classic invoice: two-column meta grid and a fully ruled table with a variant column.',
    layout: {
      header: 'centered', meta: 'two-column', items: 'grid', totals: 'grid',
      grandTotal: 'plain', hero: 'none', title: 'INVOICE',
      font: 'serif', fontSize: 13,
      columns: ['name', 'variant', 'rate', 'qty', 'amount'],
    },
  },
  {
    id: 'premium-hall-detail',
    name: 'Hall Detail',
    hint: 'Every charge itemised — service, tax, discount, delivery — plus amount in words.',
    layout: {
      header: 'centered', meta: 'split', items: 'grid', totals: 'right',
      grandTotal: 'box', hero: 'token', statusLine: true, amountInWords: true,
      font: 'grotesk', fontSize: 13,
      columns: ['name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-quick-bill',
    name: 'Quick Bill',
    hint: 'Counter service: dashed rules, big bill number, oversized grand total, QR to pay.',
    layout: {
      header: 'stacked', meta: 'rows', items: 'dotted', totals: 'right',
      grandTotal: 'large', hero: 'order', qr: true,
      font: 'sans', fontSize: 14,
      columns: ['sr', 'name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-two-column',
    name: 'Two Column',
    hint: 'Logo left with shop details right, paired meta columns, heavy net-amount line.',
    layout: {
      header: 'logo-left', meta: 'two-column', items: 'grid', totals: 'right',
      grandTotal: 'large', hero: 'none',
      font: 'sans', fontSize: 13,
      columns: ['name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-retail',
    name: 'Retail Counter',
    hint: 'Shop-counter layout with a discount column, policy footer and contact block.',
    layout: {
      header: 'logo-left', meta: 'two-column', items: 'ruled', totals: 'right',
      grandTotal: 'plain', hero: 'none',
      font: 'grotesk', fontSize: 13,
      columns: ['name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-grouped',
    name: 'Grouped Menu',
    hint: 'Items gathered under their menu category, with a boxed payable block and QR.',
    layout: {
      header: 'centered', meta: 'rows', items: 'grouped', totals: 'panel',
      grandTotal: 'box', hero: 'none', qr: true,
      font: 'grotesk', fontSize: 12,
      columns: ['name', 'rate', 'qty', 'amount'],
    },
  },
  {
    id: 'premium-token-hero',
    name: 'Token Hero',
    hint: 'Very large token number under a decorated header, compact ruled item list.',
    layout: {
      header: 'decorated', meta: 'split', items: 'dotted', totals: 'right',
      grandTotal: 'bar', hero: 'token',
      font: 'slab', fontSize: 13,
      columns: ['name', 'qty', 'rate', 'amount'],
    },
  },
  {
    id: 'premium-boxed-ledger',
    name: 'Boxed Ledger',
    hint: 'Bold two-line name, stacked framed meta panels, totals inside the item frame.',
    layout: {
      header: 'centered', meta: 'boxed', items: 'grid', totals: 'grid',
      grandTotal: 'box', hero: 'none', amountInWords: true,
      font: 'sans', fontSize: 13,
      columns: ['name', 'rate', 'qty', 'amount'],
    },
  },
  {
    id: 'premium-rounded-panel',
    name: 'Rounded Panel',
    hint: 'Logo beside the shop block, soft-cornered item table and totals panel.',
    layout: {
      header: 'logo-left', meta: 'rows', items: 'grid', totals: 'rounded',
      grandTotal: 'plain', hero: 'none', rounded: true,
      font: 'sans', fontSize: 13,
      columns: ['name', 'qty', 'rate', 'amount'],
    },
  },
];

export const PREMIUM_TEMPLATE_IDS = PREMIUM_TEMPLATES.map(t => t.id);

export function isPremiumTemplateId(id: unknown): id is PremiumTemplateId {
  return typeof id === 'string' && PREMIUM_TEMPLATE_IDS.includes(id as PremiumTemplateId);
}

export function getPremiumTemplate(id: string | undefined): PremiumTemplate | undefined {
  return PREMIUM_TEMPLATES.find(t => t.id === id);
}

// ============================================================
// CUSTOMIZATION
// Saved per template. Only presentation is adjustable — there is nothing
// here that could pin a shop's own details into a template, because the
// content is always read from the live order at print time.
// ============================================================
export interface PremiumCustomization {
  /**
   * What the shop calls this template in the picker.
   *
   * Blank uses the template's built-in descriptive name. A shop running
   * several designs (a dine-in bill, a delivery bill, a bar tab) can name
   * each one for what it is rather than remembering which layout is which.
   */
  displayName: string;
  // ----- Header -----
  showLogo: boolean;
  logoWidthPx: number;
  showName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  /** Free header line, e.g. a tagline or a tax registration number. */
  headerNote: string;

  // ----- Order block -----
  showOrderNumber: boolean;
  showDateTime: boolean;
  showTable: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showDelivery: boolean;
  showOrderType: boolean;

  // ----- Items -----
  showItemNotes: boolean;
  showVariants: boolean;
  showSerial: boolean;

  // ----- Money -----
  showSubtotal: boolean;
  showDiscount: boolean;
  showTax: boolean;
  showServiceCharge: boolean;
  showPaymentMethod: boolean;
  showChange: boolean;

  // ----- Footer -----
  footerText: string;
  thankYouText: string;
  showQr: boolean;
  showPoweredBy: boolean;

  // ----- Layout -----
  /** Body font size in px at 80mm. */
  fontSize: number;
  /** Extra vertical space between item rows, in px. */
  itemSpacing: number;
  /** Extra vertical space between sections, in px. */
  sectionSpacing: number;
  /** Blank lines above the first printed line. */
  topSpacing: number;
  /** Blank lines below the last printed line, before the cut. */
  bottomSpacing: number;
  /**
   * Typeface family for the slip.
   *
   * Every option resolves to faces that ship with Windows, so the print
   * worker renders EXACTLY what the preview shows — a webfont that fails to
   * load in the worker is silently replaced by a fallback, and that is what
   * made printed receipts come out in a different face from the screen.
   *
   *   sans      — Segoe UI / Arial. The everyday receipt face.
   *   grotesk   — Arial Narrow / Tahoma. Condensed: fits more per line.
   *   serif     — Georgia / Times. Formal, for fine-dining layouts.
   *   slab      — Cambria / Georgia. Heavier serif for strong headers.
   *   mono      — Consolas / Courier New. Columns line up exactly.
   */
  fontFamily: 'sans' | 'grotesk' | 'serif' | 'slab' | 'mono';
  /** Darker body weight for worn print heads. */
  boldBody: boolean;
}

export const DEFAULT_CUSTOMIZATION: PremiumCustomization = {
  displayName: '',
  showLogo: true,
  logoWidthPx: 120,
  showName: true,
  showAddress: true,
  showPhone: true,
  headerNote: '',

  showOrderNumber: true,
  showDateTime: true,
  showTable: true,
  showCashier: true,
  showCustomer: true,
  showDelivery: true,
  showOrderType: true,

  showItemNotes: true,
  showVariants: true,
  showSerial: true,

  showSubtotal: true,
  showDiscount: true,
  showTax: true,
  showServiceCharge: true,
  showPaymentMethod: true,
  showChange: true,

  footerText: '',
  thankYouText: '',
  showQr: true,
  showPoweredBy: false,

  // 13px at 80mm is about 8pt — comfortably readable on a 203 DPI head and
  // a clear step up from the 11px the old compact default printed at.
  fontSize: 13,
  itemSpacing: 2,
  sectionSpacing: 6,
  topSpacing: 0,
  bottomSpacing: 2,
  fontFamily: 'sans',
  boldBody: true,
};

const STORE_KEY = 'dtpos-premium-template-customizations';
const SELECTED_KEY = 'dtpos-premium-template-selected';

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Coerce stored/partial data into a complete, safe customization. */
export function normalizeCustomization(raw: Partial<PremiumCustomization> | null | undefined): PremiumCustomization {
  const c = { ...DEFAULT_CUSTOMIZATION, ...(raw || {}) };
  return {
    ...c,
    // Floors and ceilings matter here: a font size of 6px prints as grey
    // mush on a thermal head, and 30px wraps every item name.
    fontSize: clampNumber(c.fontSize, 9, 20, DEFAULT_CUSTOMIZATION.fontSize),
    logoWidthPx: clampNumber(c.logoWidthPx, 24, 260, DEFAULT_CUSTOMIZATION.logoWidthPx),
    itemSpacing: clampNumber(c.itemSpacing, 0, 12, DEFAULT_CUSTOMIZATION.itemSpacing),
    sectionSpacing: clampNumber(c.sectionSpacing, 0, 24, DEFAULT_CUSTOMIZATION.sectionSpacing),
    topSpacing: clampNumber(c.topSpacing, 0, 40, DEFAULT_CUSTOMIZATION.topSpacing),
    bottomSpacing: clampNumber(c.bottomSpacing, 0, 40, DEFAULT_CUSTOMIZATION.bottomSpacing),
    fontFamily: (['sans', 'grotesk', 'serif', 'slab', 'mono'] as const).includes(c.fontFamily as never)
      ? c.fontFamily
      : DEFAULT_CUSTOMIZATION.fontFamily,
    displayName: String(c.displayName ?? '').slice(0, 60),
    headerNote: String(c.headerNote ?? '').slice(0, 200),
    footerText: String(c.footerText ?? '').slice(0, 300),
    thankYouText: String(c.thankYouText ?? '').slice(0, 200),
  };
}

type CustomizationStore = Partial<Record<PremiumTemplateId, Partial<PremiumCustomization>>>;

function readStore(): CustomizationStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The saved customization for a template, or the template's defaults when
 * the shop has not adjusted it. Never throws — a corrupt entry falls back
 * to defaults so a bill can always be printed.
 */
export function loadCustomization(id: PremiumTemplateId): PremiumCustomization {
  const tpl = getPremiumTemplate(id);
  // A template's own typography is its starting point — that is what makes
  // the thirteen designs distinct rather than one layout in thirteen shapes.
  const base: PremiumCustomization = tpl
    ? { ...DEFAULT_CUSTOMIZATION, fontFamily: tpl.layout.font, fontSize: tpl.layout.fontSize }
    : DEFAULT_CUSTOMIZATION;
  const saved = readStore()[id];
  return normalizeCustomization({ ...base, ...(saved || {}) });
}

export function saveCustomization(id: PremiumTemplateId, value: Partial<PremiumCustomization>) {
  try {
    const store = readStore();
    store[id] = normalizeCustomization({ ...(store[id] || {}), ...value });
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('dtpos-premium-template-changed', { detail: { id } }));
  } catch { /* storage unavailable — the template still prints at defaults */ }
}

export function resetCustomization(id: PremiumTemplateId) {
  try {
    const store = readStore();
    delete store[id];
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent('dtpos-premium-template-changed', { detail: { id } }));
  } catch { /* storage unavailable */ }
}

/** Templates the shop has customized and saved. */
export function customizedTemplateIds(): PremiumTemplateId[] {
  return Object.keys(readStore()).filter(isPremiumTemplateId);
}

/** The template last chosen in the gallery (device-local). */
export function getSelectedPremiumTemplate(): PremiumTemplateId | undefined {
  try {
    const v = localStorage.getItem(SELECTED_KEY);
    return isPremiumTemplateId(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function setSelectedPremiumTemplate(id: PremiumTemplateId) {
  try { localStorage.setItem(SELECTED_KEY, id); } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------
// Amount in words — used by the layouts that print it. Kept here so the
// renderer stays presentational.
// ------------------------------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
  return (ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + underThousand(n % 100) : '')).trim();
}

/**
 * Spell a money amount using the South-Asian crore/lakh scale, which is what
 * the reference receipts and the shops running this POS use.
 */
export function amountInWords(value: number): string {
  const whole = Math.floor(Math.abs(Number(value) || 0));
  if (whole === 0) return 'Zero Only';
  const parts: string[] = [];
  const scales: [number, string][] = [
    [10000000, 'Crore'],
    [100000, 'Lakh'],
    [1000, 'Thousand'],
  ];
  let rest = whole;
  for (const [size, label] of scales) {
    const count = Math.floor(rest / size);
    if (count > 0) {
      parts.push(`${underThousand(count)} ${label}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));
  return `${parts.join(' ')} Only`;
}

/** The name to show for a template — the shop's own, or the built-in one. */
export function templateDisplayName(id: PremiumTemplateId): string {
  const tpl = getPremiumTemplate(id);
  const saved = readStore()[id]?.displayName;
  return (typeof saved === 'string' && saved.trim()) ? saved.trim() : (tpl?.name || id);
}
