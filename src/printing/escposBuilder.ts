// ============================================================
// ESC/POS BUILDER — receipts, KOT and tokens are composed as raw
// printer bytes straight from the order data. No HTML, no browser
// layout, no page size: the printer gets exactly these bytes and
// starts immediately, then cuts. One builder for every slip type.
// ============================================================
import type { Order, RestaurantSettings } from '@/lib/types';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Paper = '58mm' | '80mm' | '110mm';

/** Characters per line in font A. */
export function columnsFor(paper: Paper): number {
  if (paper === '58mm') return 32;
  if (paper === '110mm') return 64;
  return 48;
}

const encoder = new TextEncoder();

/** Fold characters the thermal codepage cannot show into safe ASCII. */
function asciify(s: string): string {
  return String(s ?? '')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ');
}

export class EscposDoc {
  private buf: number[] = [];
  readonly cols: number;

  constructor(readonly paper: Paper = '80mm') {
    this.cols = columnsFor(paper);
    this.raw(ESC, 0x40);        // initialize
    this.raw(ESC, 0x74, 0x00);  // codepage CP437
    this.left();
  }

  raw(...b: number[]) { this.buf.push(...b); return this; }
  left() { return this.raw(ESC, 0x61, 0x00); }
  center() { return this.raw(ESC, 0x61, 0x01); }
  right() { return this.raw(ESC, 0x61, 0x02); }
  bold(on: boolean) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  /** width/height multipliers 1..4 */
  size(w = 1, h = 1) {
    const n = ((Math.min(4, Math.max(1, w)) - 1) << 4) | (Math.min(4, Math.max(1, h)) - 1);
    return this.raw(GS, 0x21, n);
  }
  underline(on: boolean) { return this.raw(ESC, 0x2d, on ? 1 : 0); }

  text(s: string) {
    const bytes = encoder.encode(asciify(s));
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    return this;
  }

  line(s = '') { return this.text(s).raw(LF); }

  /** Word-wrapped paragraph at the current column width. */
  wrap(s: string, width = this.cols) {
    const words = asciify(s).split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      if (!cur.length) cur = w;
      else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
      else { this.line(cur); cur = w; }
    }
    if (cur.length) this.line(cur);
    return this;
  }

  /** Left text + right text on one line. */
  lr(left: string, right: string, width = this.cols) {
    const l = asciify(left);
    const r = asciify(right);
    const space = Math.max(1, width - l.length - r.length);
    if (l.length + r.length + 1 > width) {
      // long name: wrap the left part, keep the amount on the last line
      const head = l.slice(0, width - r.length - 1);
      return this.line(head + ' '.repeat(Math.max(1, width - head.length - r.length)) + r);
    }
    return this.line(l + ' '.repeat(space) + r);
  }

  rule(ch = '-') { return this.line(ch.repeat(this.cols)); }

  feed(n = 1) { for (let i = 0; i < n; i++) this.buf.push(LF); return this; }

  /** Feed clear of the cutter, then full cut. */
  cut(feedLines = 4) {
    this.left().size(1, 1).bold(false);
    this.feed(feedLines);
    return this.raw(GS, 0x56, 0x00);
  }

  beep() { return this.raw(ESC, 0x42, 0x02, 0x02); }

  bytes(): number[] { return this.buf.slice(); }
}

function money(n: number, sym: string): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return `${sym}${s}`;
}

function when(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function paperOf(settings: any): Paper {
  const p = settings?.paperSize;
  return p === '58mm' || p === '110mm' ? p : '80mm';
}

// ------------------------------------------------------------
// CUSTOMER RECEIPT
// ------------------------------------------------------------
export function buildReceiptBytes(order: Order, settings: RestaurantSettings): number[] {
  const s: any = settings || {};
  const compact = !!s.receiptCompactMode;
  const sym = s.currencySymbol || 'Rs ';
  const d = new EscposDoc(paperOf(s));

  d.center();
  if (s.name) { d.size(2, 2).bold(true).line(s.name).size(1, 1).bold(false); }
  if (!compact && s.address) d.wrap(s.address);
  const phones = [s.phone1, s.phone2].filter(Boolean).join(' / ');
  if (phones) d.line(phones);
  d.left().rule();

  const typeLabel = String(order.orderType || '').replace(/_/g, ' ').toUpperCase();
  d.bold(true).lr(`BILL #${order.orderNumber ?? ''}`, typeLabel).bold(false);
  d.line(when(order.paidAt || order.createdAt));
  if (order.tableName || order.tableLabel) d.line(`Table: ${order.tableName || order.tableLabel}`);
  if (order.cashierName) d.line(`Cashier: ${order.cashierName}`);
  const cust = order.customer as any;
  if (cust?.name) d.line(`Customer: ${cust.name}`);
  if (cust?.phone) d.line(`Phone: ${cust.phone}`);
  if (order.orderType === 'delivery' && cust?.address) d.wrap(`Address: ${cust.address}`);
  if (order.riderName) d.line(`Rider: ${order.riderName}`);
  d.rule();

  // Items — name (qty x price) ......... amount
  const amountW = 10;
  const nameW = d.cols - amountW;
  for (const it of order.items || []) {
    const qty = it.quantity || 0;
    const label = `${qty} x ${it.name}${(it as any).variantName ? ` (${(it as any).variantName})` : ''}`;
    d.lr(label.slice(0, nameW - 1), money(it.lineTotal ?? qty * (it.price || 0), sym));
    if (!compact && it.note) d.line(`   * ${it.note}`);
  }
  d.rule();

  d.lr('Subtotal', money(order.subtotal || 0, sym));
  if (order.discount) d.lr(order.discountTitle || 'Discount', '-' + money(order.discount, sym));
  if (order.tax) d.lr('Tax', money(order.tax, sym));
  if (order.serviceCharge) d.lr('Service Charge', money(order.serviceCharge, sym));
  if ((order as any).deliveryChargeAmount) d.lr('Delivery', money((order as any).deliveryChargeAmount, sym));
  if ((order as any).roundingAdjust) d.lr('Rounding', money((order as any).roundingAdjust, sym));
  d.rule('=');
  d.bold(true).size(1, 2).lr('TOTAL', money(order.grandTotal || 0, sym), d.cols).size(1, 1).bold(false);
  if (order.paymentMethod) d.lr('Paid by', String(order.paymentMethod).toUpperCase());
  if (order.cashReceived) d.lr('Cash', money(order.cashReceived, sym));
  if (order.changeReturned) d.lr('Change', money(order.changeReturned, sym));
  d.rule();

  d.center();
  if (s.thankYouText !== '') d.line(s.thankYouText || 'Thank You!');
  if (!compact && (s.visitAgainText || '') !== '') d.line(s.visitAgainText || 'Please Visit Again');
  if (!compact && s.receiptFooter) d.wrap(s.receiptFooter);
  if (!compact && s.marketingFooter) d.wrap(s.marketingFooter);
  d.cut(compact ? 3 : 4);
  return d.bytes();
}

// ------------------------------------------------------------
// KITCHEN ORDER TICKET
// ------------------------------------------------------------
export interface KotOpts {
  updateMode?: boolean;
  diffDeltas?: Record<string, number>;
  cancelDeltas?: Record<string, number>;
  cancelNames?: Record<string, string>;
  kotNo?: number;
  station?: string;
}

export function buildKotBytes(order: Order, settings: RestaurantSettings, opts: KotOpts = {}): number[] {
  const s: any = settings || {};
  const d = new EscposDoc(paperOf(s));

  d.center().bold(true).size(2, 2);
  d.line(opts.updateMode ? 'KOT UPDATE' : 'KITCHEN ORDER');
  d.size(1, 1);
  if (opts.station) d.line(opts.station.toUpperCase());
  d.size(2, 2).line(`#${order.orderNumber ?? ''}`).size(1, 1).bold(false);
  d.left().line(when(order.createdAt));
  const typeLabel = String(order.orderType || '').replace(/_/g, ' ').toUpperCase();
  d.lr(typeLabel, order.tableName || order.tableLabel || '');
  if (opts.kotNo) d.line(`KOT #${opts.kotNo}`);
  d.rule('=');

  const lines: Array<{ qty: number; name: string; note?: string; cancelled?: boolean }> = [];
  for (const it of order.items || []) {
    const qty = opts.updateMode ? (opts.diffDeltas?.[it.id] || 0) : (it.quantity || 0);
    if (qty > 0) lines.push({ qty, name: it.name, note: it.note });
  }
  for (const [id, qty] of Object.entries(opts.cancelDeltas || {})) {
    if (qty > 0) lines.push({ qty, name: opts.cancelNames?.[id] || id, cancelled: true });
  }

  d.size(1, 2).bold(true);
  for (const l of lines) {
    d.line(`${l.cancelled ? 'CANCEL ' : ''}${l.qty} x ${l.name}`.slice(0, d.cols));
    if (l.note) { d.size(1, 1).line(`    >> ${l.note}`).size(1, 2); }
  }
  d.size(1, 1).bold(false);

  if (order.notes) { d.rule(); d.wrap(`Note: ${order.notes}`); }
  d.rule();
  d.center();
  if (s.kotFooterNote !== '') d.line(s.kotFooterNote || 'Please check the order before preparing');
  if (s.kotThankYouText !== '') d.line(s.kotThankYouText || '- Thank You -');
  d.cut(4);
  return d.bytes();
}

// ------------------------------------------------------------
// TANDOOR / COUNTER TOKEN
// ------------------------------------------------------------
export interface TokenData {
  orderNumber: number | string;
  items: { name: string; qty: number }[];
  restaurantName?: string;
  when?: Date;
}

export function buildTokenBytes(data: TokenData, settings: RestaurantSettings): number[] {
  const s: any = settings || {};
  const d = new EscposDoc(paperOf(s));
  const total = (data.items || []).reduce((a, i) => a + (i.qty || 0), 0);

  d.center();
  const rname = data.restaurantName || s.name;
  if (rname) d.bold(true).line(rname).bold(false);
  d.bold(true).line('*** TANDOOR TOKEN ***').bold(false);
  d.line(`Order #${data.orderNumber} · ${(data.when || new Date()).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
  d.left().rule();

  d.size(1, 2).bold(true);
  for (const it of data.items || []) d.lr(String(it.name).slice(0, d.cols - 6), String(it.qty));
  d.size(1, 1).bold(false);
  d.rule();
  if (s.tokenShowTotal !== false) d.bold(true).lr('Total pieces', String(total)).bold(false);

  d.center().feed(1);
  d.size(3, 3).bold(true).line(String(data.orderNumber)).size(1, 1).bold(false);
  d.line('TOKEN NUMBER');
  d.line('Hand over to the tandoor counter');
  d.cut(4);
  return d.bytes();
}
