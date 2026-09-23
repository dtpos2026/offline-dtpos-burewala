// ============================================================
// INVOICE RENDERER — one drawing for preview, print, PNG and JPG.
//
// layoutInvoice() is pure: it returns drawing operations in "layout units"
// (CSS pixels at 96 dpi: A4 = 794 × 1123, 80 mm = 302 wide). paintInvoice()
// draws those operations on a canvas at any scale, so an export is a fresh
// high-resolution drawing of the template — never a blurry screenshot.
// ============================================================
import { invoiceTotal, maskLicenseKey, money, type BillingProfile, type OfflineInvoice } from './billingModel';

export type InvoiceFormat = 'a4' | '80mm';

export type DrawOp =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; r?: number; lw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; w?: number; dash?: boolean }
  | { t: 'text'; x: number; y: number; text: string; size: number; weight?: number; color?: string; align?: 'left' | 'center' | 'right'; font?: 'sans' | 'mono' }
  | { t: 'image'; key: 'logo' | 'signature' | 'qr'; x: number; y: number; w: number; h: number };

export interface InvoiceLayout { width: number; height: number; ops: DrawOp[] }

/** Width of a string at a size/weight, in layout units. Injected so the layout is testable. */
export type Measure = (text: string, size: number, weight?: number, font?: 'sans' | 'mono') => number;

export const approxMeasure: Measure = (text, size, weight = 400, font = 'sans') =>
  text.length * size * (font === 'mono' ? 0.6 : weight >= 700 ? 0.58 : 0.52);

const INK = '#1B0B2E';
const MUTED = '#5b4a6e';
const BRAND = '#3C096C';
const LINE = '#ddd3ea';
const PAID = '#047857';
const UNPAID = '#B45309';

function wrap(text: string, maxW: number, size: number, measure: Measure, weight = 400): string[] {
  const out: string[] = [];
  for (const para of String(text || '').split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (measure(next, size, weight) <= maxW || !line) line = next;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

export function layoutInvoice(inv: OfflineInvoice, p: BillingProfile, format: InvoiceFormat, measure: Measure = approxMeasure, hasSignature = !!p.signature): InvoiceLayout {
  return format === 'a4' ? layoutA4(inv, p, measure, hasSignature) : layoutReceipt(inv, p, measure, hasSignature);
}

// ---------------- A4 ----------------
function layoutA4(inv: OfflineInvoice, p: BillingProfile, m: Measure, hasSig: boolean): InvoiceLayout {
  const W = 794, H = 1123, L = 48, R = W - 48;
  const ops: DrawOp[] = [{ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#ffffff' }];
  const c = inv.customer;
  const cur = p.currency;

  // Header band
  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: 8, fill: BRAND });
  // The Digital Target mark is white on transparent: it needs its brand tile.
  if (!p.logo) ops.push({ t: 'rect', x: L, y: 36, w: 64, h: 64, r: 14, fill: BRAND });
  ops.push({ t: 'image', key: 'logo', x: !p.logo ? L + 8 : L, y: !p.logo ? 44 : 36, w: !p.logo ? 48 : 64, h: !p.logo ? 48 : 64 });
  ops.push({ t: 'text', x: L + 80, y: 62, text: p.businessName, size: 26, weight: 800, color: BRAND });
  if (p.tagline) ops.push({ t: 'text', x: L + 80, y: 82, text: p.tagline, size: 12, color: MUTED });
  const contact = [p.phone && `Phone ${p.phone}`, p.whatsapp && `WhatsApp ${p.whatsapp}`].filter(Boolean).join('   ·   ');
  if (contact) ops.push({ t: 'text', x: L + 80, y: 100, text: contact, size: 11, color: MUTED });
  const contact2 = [p.email, p.website].filter(Boolean).join('   ·   ');
  if (contact2) ops.push({ t: 'text', x: L + 80, y: 116, text: contact2, size: 11, color: MUTED });
  if (p.address) ops.push({ t: 'text', x: L + 80, y: 132, text: p.address, size: 11, color: MUTED });

  ops.push({ t: 'text', x: R, y: 62, text: 'INVOICE', size: 30, weight: 800, color: INK, align: 'right' });
  ops.push({ t: 'text', x: R, y: 86, text: inv.invoiceNo, size: 13, weight: 700, color: INK, align: 'right', font: 'mono' });
  ops.push({ t: 'text', x: R, y: 104, text: `Date: ${inv.date}`, size: 12, color: MUTED, align: 'right' });
  const badge = inv.paid ? 'PAID' : 'UNPAID';
  const bw = m(badge, 12, 800) + 24;
  ops.push({ t: 'rect', x: R - bw, y: 114, w: bw, h: 24, r: 12, fill: inv.paid ? '#e6f6ef' : '#fdf1e2', stroke: inv.paid ? PAID : UNPAID });
  ops.push({ t: 'text', x: R - bw / 2, y: 131, text: badge, size: 12, weight: 800, color: inv.paid ? PAID : UNPAID, align: 'center' });

  ops.push({ t: 'line', x1: L, y1: 160, x2: R, y2: 160, color: LINE, w: 1 });

  // Bill to + licence
  const colW = (R - L - 24) / 2;
  let y = 188;
  ops.push({ t: 'text', x: L, y, text: 'BILL TO', size: 11, weight: 800, color: BRAND });
  ops.push({ t: 'text', x: L + colW + 24, y, text: 'LICENSE', size: 11, weight: 800, color: BRAND });
  y += 22;
  const left: [string, number, number][] = [[c.restaurant || '—', 16, 800], [c.owner, 12, 600]];
  for (const line of wrap(c.address, colW, 12, m)) left.push([line, 12, 400]);
  if (c.phone) left.push([`Phone: ${c.phone}`, 12, 400]);
  if (c.whatsapp) left.push([`WhatsApp: ${c.whatsapp}`, 12, 400]);
  let ly = y;
  for (const [text, size, weight] of left) {
    if (!text) continue;
    ops.push({ t: 'text', x: L, y: ly, text, size, weight, color: INK });
    ly += size + 8;
  }
  let ry = y;
  ops.push({ t: 'text', x: L + colW + 24, y: ry, text: c.licenseKey || '—', size: 13, weight: 700, color: INK, font: 'mono' });
  ry += 22;
  for (const line of wrap(c.licenseRef ? `Reference: ${c.licenseRef}` : '', colW, 12, m)) {
    ops.push({ t: 'text', x: L + colW + 24, y: ry, text: line, size: 12, color: MUTED });
    ry += 18;
  }
  y = Math.max(ly, ry) + 18;

  // Items table
  ops.push({ t: 'rect', x: L, y, w: R - L, h: 30, fill: '#f3edf9' });
  ops.push({ t: 'text', x: L + 12, y: y + 20, text: 'DESCRIPTION', size: 11, weight: 800, color: BRAND });
  ops.push({ t: 'text', x: R - 12, y: y + 20, text: `AMOUNT (${cur})`, size: 11, weight: 800, color: BRAND, align: 'right' });
  y += 30;
  const rows: { title: string; sub: string; amount: number }[] = [{ title: inv.pkg || 'DT POS Enterprise', sub: inv.description, amount: inv.amount }];
  for (const e of inv.extras || []) if (e.label || e.amount) rows.push({ title: e.label || 'Additional charge', sub: '', amount: e.amount });
  for (const row of rows) {
    const subLines = wrap(row.sub, R - L - 180, 11, m);
    const h = 26 + subLines.length * 16 + 10;
    ops.push({ t: 'text', x: L + 12, y: y + 22, text: row.title, size: 13, weight: 700, color: INK });
    subLines.forEach((s, i) => ops.push({ t: 'text', x: L + 12, y: y + 40 + i * 16, text: s, size: 11, color: MUTED }));
    ops.push({ t: 'text', x: R - 12, y: y + 22, text: money(row.amount, '').trim(), size: 13, weight: 700, color: INK, align: 'right' });
    y += h;
    ops.push({ t: 'line', x1: L, y1: y, x2: R, y2: y, color: LINE, w: 1 });
  }
  if (inv.discount) {
    y += 22;
    ops.push({ t: 'text', x: R - 180, y, text: 'Discount', size: 12, color: MUTED, align: 'right' });
    ops.push({ t: 'text', x: R - 12, y, text: `- ${money(inv.discount, '').trim()}`, size: 12, color: INK, align: 'right' });
  }
  y += 34;
  ops.push({ t: 'rect', x: R - 300, y: y - 22, w: 300, h: 36, r: 8, fill: BRAND });
  ops.push({ t: 'text', x: R - 288, y: y + 2, text: 'TOTAL', size: 13, weight: 800, color: '#ffffff' });
  ops.push({ t: 'text', x: R - 12, y: y + 2, text: money(invoiceTotal(inv), cur), size: 16, weight: 800, color: '#ffffff', align: 'right' });
  y += 44;

  // Payment
  ops.push({ t: 'text', x: L, y, text: 'PAYMENT', size: 11, weight: 800, color: BRAND });
  y += 20;
  const payLines = [
    `Status: ${inv.paid ? 'Paid' : 'Unpaid'}`,
    inv.paid && inv.paymentDate ? `Payment date: ${inv.paymentDate}` : '',
    inv.paymentMethod ? `Method: ${inv.paymentMethod}` : '',
  ].filter(Boolean);
  for (const t of payLines) { ops.push({ t: 'text', x: L, y, text: t, size: 12, color: INK }); y += 18; }
  if (inv.notes) {
    y += 6;
    ops.push({ t: 'text', x: L, y, text: 'NOTES', size: 11, weight: 800, color: BRAND });
    y += 18;
    for (const line of wrap(inv.notes, R - L, 12, m)) { ops.push({ t: 'text', x: L, y, text: line, size: 12, color: MUTED }); y += 17; }
  }

  // QR + signature pinned above the footer
  const blockY = Math.max(y + 24, H - 250);
  ops.push({ t: 'image', key: 'qr', x: L, y: blockY, w: 120, h: 120 });
  ops.push({ t: 'text', x: L + 134, y: blockY + 40, text: 'Scan to verify', size: 12, weight: 700, color: INK });
  ops.push({ t: 'text', x: L + 134, y: blockY + 58, text: 'this invoice and its license', size: 11, color: MUTED });
  ops.push({ t: 'text', x: L + 134, y: blockY + 80, text: `Ref ${inv.verifyCode}`, size: 11, color: MUTED, font: 'mono' });
  ops.push({ t: 'text', x: L + 134, y: blockY + 96, text: `License ${maskLicenseKey(c.licenseKey)}`, size: 10, color: MUTED, font: 'mono' });
  if (hasSig) ops.push({ t: 'image', key: 'signature', x: R - 220, y: blockY + 10, w: 220, h: 80 });
  ops.push({ t: 'line', x1: R - 220, y1: blockY + 96, x2: R, y2: blockY + 96, color: INK, w: 1 });
  ops.push({ t: 'text', x: R, y: blockY + 114, text: p.personName || p.businessName, size: 12, weight: 700, color: INK, align: 'right' });
  if (p.personTitle) ops.push({ t: 'text', x: R, y: blockY + 130, text: p.personTitle, size: 11, color: MUTED, align: 'right' });

  // Footer
  ops.push({ t: 'line', x1: L, y1: H - 70, x2: R, y2: H - 70, color: LINE, w: 1 });
  if (p.footerNote) ops.push({ t: 'text', x: W / 2, y: H - 48, text: p.footerNote, size: 11, color: MUTED, align: 'center' });
  ops.push({ t: 'text', x: W / 2, y: H - 30, text: `${p.businessName}${p.tagline ? ' — ' + p.tagline : ''}`, size: 10, color: MUTED, align: 'center' });
  ops.push({ t: 'rect', x: 0, y: H - 8, w: W, h: 8, fill: BRAND });
  return { width: W, height: H, ops };
}

// ---------------- 80 mm thermal ----------------
function layoutReceipt(inv: OfflineInvoice, p: BillingProfile, m: Measure, hasSig: boolean): InvoiceLayout {
  const W = 302, L = 12, R = W - 12, C = W / 2, inner = R - L;
  const ops: DrawOp[] = [];
  const c = inv.customer;
  let y = 12;
  const center = (text: string, size: number, weight = 400, color = INK, font: 'sans' | 'mono' = 'sans') => {
    for (const line of wrap(text, inner, size, m, weight)) {
      y += size + 4;
      ops.push({ t: 'text', x: C, y, text: line, size, weight, color, align: 'center', font });
    }
  };
  const row = (a: string, b: string, size = 11, weight = 400) => {
    y += size + 5;
    ops.push({ t: 'text', x: L, y, text: a, size, weight, color: INK });
    ops.push({ t: 'text', x: R, y, text: b, size, weight, color: INK, align: 'right' });
  };
  const rule = (dash = true) => { y += 8; ops.push({ t: 'line', x1: L, y1: y, x2: R, y2: y, color: '#000000', w: 1, dash }); y += 2; };
  const left = (text: string, size = 11, weight = 400, font: 'sans' | 'mono' = 'sans') => {
    for (const line of wrap(text, inner, size, m, weight)) {
      y += size + 4;
      ops.push({ t: 'text', x: L, y, text: line, size, weight, color: INK, font });
    }
  };

  // White mark on a black tile, so it prints on a thermal head.
  if (!p.logo) ops.push({ t: 'rect', x: C - 24, y, w: 48, h: 48, r: 10, fill: '#000000' });
  ops.push({ t: 'image', key: 'logo', x: !p.logo ? C - 18 : C - 24, y: !p.logo ? y + 6 : y, w: !p.logo ? 36 : 48, h: !p.logo ? 36 : 48 });
  y += 48;
  center(p.businessName, 16, 800);
  if (p.tagline) center(p.tagline, 10);
  if (p.phone) center(`Phone ${p.phone}`, 10);
  if (p.whatsapp) center(`WhatsApp ${p.whatsapp}`, 10);
  rule(false);
  center('INVOICE', 14, 800);
  center(inv.invoiceNo, 11, 700, INK, 'mono');
  center(`Date ${inv.date}`, 10);
  center(inv.paid ? 'PAID' : 'UNPAID', 13, 800);
  rule();
  left(c.restaurant || '—', 12, 800);
  if (c.owner) left(c.owner, 11);
  if (c.address) left(c.address, 10);
  if (c.phone) left(`Phone: ${c.phone}`, 10);
  if (c.whatsapp) left(`WhatsApp: ${c.whatsapp}`, 10);
  rule();
  left('License', 10, 700);
  left(c.licenseKey || '—', 11, 700, 'mono');
  if (c.licenseRef) left(`Ref: ${c.licenseRef}`, 10);
  rule();
  const title = inv.pkg || 'DT POS Enterprise';
  left(title, 11, 700);
  if (inv.description) left(inv.description, 10);
  row('Amount', money(inv.amount, p.currency));
  for (const e of inv.extras || []) if (e.label || e.amount) row(e.label || 'Additional', money(e.amount, p.currency));
  if (inv.discount) row('Discount', `- ${money(inv.discount, p.currency)}`);
  rule(false);
  row('TOTAL', money(invoiceTotal(inv), p.currency), 14, 800);
  rule(false);
  row('Status', inv.paid ? 'Paid' : 'Unpaid');
  if (inv.paid && inv.paymentDate) row('Paid on', inv.paymentDate);
  if (inv.paymentMethod) row('Method', inv.paymentMethod);
  if (inv.notes) { y += 4; left(inv.notes, 10); }
  rule();
  y += 6;
  ops.push({ t: 'image', key: 'qr', x: C - 60, y, w: 120, h: 120 });
  y += 120;
  center('Scan to verify', 10, 700);
  center(`Ref ${inv.verifyCode}`, 9, 400, INK, 'mono');
  if (hasSig) {
    y += 8;
    ops.push({ t: 'image', key: 'signature', x: C - 80, y, w: 160, h: 56 });
    y += 56;
  }
  y += 6;
  ops.push({ t: 'line', x1: C - 80, y1: y, x2: C + 80, y2: y, color: '#000000', w: 1 });
  center(p.personName || p.businessName, 10, 700);
  if (p.footerNote) { y += 4; center(p.footerNote, 9); }
  y += 16;
  return { width: W, height: Math.ceil(y), ops: [{ t: 'rect', x: 0, y: 0, w: W, h: Math.ceil(y), fill: '#ffffff' }, ...ops] };
}

// ---------------- painting ----------------
export type Images = Partial<Record<'logo' | 'signature' | 'qr', CanvasImageSource>>;

const FONT = { sans: '"Manrope", "Segoe UI", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace' };

/** Draw a layout at `scale` × layout units (e.g. 2.5 ≈ 240 dpi for A4). */
export function paintInvoice(canvas: HTMLCanvasElement, layout: InvoiceLayout, images: Images, scale: number): void {
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';
  for (const op of layout.ops) {
    if (op.t === 'rect') {
      ctx.beginPath();
      if (op.r && 'roundRect' in ctx) (ctx as CanvasRenderingContext2D & { roundRect: Function }).roundRect(op.x, op.y, op.w, op.h, op.r);
      else ctx.rect(op.x, op.y, op.w, op.h);
      if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.lw || 1; ctx.stroke(); }
    } else if (op.t === 'line') {
      ctx.beginPath();
      ctx.setLineDash(op.dash ? [4, 3] : []);
      ctx.strokeStyle = op.color; ctx.lineWidth = op.w || 1;
      ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (op.t === 'text') {
      ctx.font = `${op.weight || 400} ${op.size}px ${FONT[op.font || 'sans']}`;
      ctx.fillStyle = op.color || INK;
      ctx.textAlign = op.align || 'left';
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.t === 'image') {
      const img = images[op.key];
      if (!img) continue;
      // QR codes must stay pixel-sharp; photos (logo, signature) are smoothed.
      ctx.imageSmoothingEnabled = op.key !== 'qr';
      if (op.key === 'qr') {
        ctx.drawImage(img, op.x, op.y, op.w, op.h);
      } else {
        // Fit inside the box, keeping the aspect ratio.
        const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width || op.w;
        const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height || op.h;
        const k = Math.min(op.w / iw, op.h / ih);
        const w = iw * k, h = ih * k;
        ctx.drawImage(img, op.x + (op.w - w) / 2, op.y + (op.h - h) / 2, w, h);
      }
      ctx.imageSmoothingEnabled = true;
    }
  }
}

/** Canvas measure for the real layout (the preview and exports use it). */
export function canvasMeasure(): Measure {
  const ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!ctx) return approxMeasure;
  return (text, size, weight = 400, font = 'sans') => {
    ctx.font = `${weight} ${size}px ${FONT[font]}`;
    return ctx.measureText(text).width;
  };
}
