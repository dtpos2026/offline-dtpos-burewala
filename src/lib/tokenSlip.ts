// ============================================================
// TOKEN SLIP — shared builder + DIRECT instant print.
// The POS Token button prints instantly through this (no waiting for
// the queue), and the queued TokenReceipt also uses these same templates.
// Templates: standard | professional | vip (professional set),
//            classic | bold | boxed | minimal (kept from before).
// Layout only — the token number, items and order details are passed in
// from the live order at print time.
// ============================================================
import { printNode } from '@/printing';
import { loadPrinterSettings, resolvePrinterForRole } from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';
import { appendTokenEntry, getTokenSummary, todayKey } from '@/lib/tokenLedger';

export type TokenTemplate =
  // Existing designs — kept so a shop that already picked one is unaffected.
  | 'classic' | 'bold' | 'boxed' | 'minimal'
  // Professional designs built for thermal token printing.
  | 'standard' | 'professional' | 'vip';

export const TOKEN_TEMPLATES: { id: TokenTemplate; name: string; hint: string }[] = [
  { id: 'standard',     name: 'Standard',      hint: 'Clean and compact — name, token number, items. The everyday slip.' },
  { id: 'professional', name: 'Professional',  hint: 'Framed header, ruled item table, token number in a heavy panel.' },
  { id: 'vip',          name: 'Bold / VIP',    hint: 'Very large token number, reversed banner, strong spacing — readable across a counter.' },
  { id: 'classic',      name: 'Classic',       hint: 'Original design — boxed token number under a dashed item list.' },
  { id: 'bold',         name: 'Bold',          hint: 'Original design — large type with rules above and below the number.' },
  { id: 'boxed',        name: 'Boxed',         hint: 'Original design — fully bordered item table.' },
  { id: 'minimal',      name: 'Minimal',       hint: 'Original design — token number first, shortest slip.' },
];

/** Options a shop can adjust on a token template. */
export interface TokenSlipOptions {
  /** Base font size in px. */
  fontSize?: number;
  /** Token number size in px — the one number read from a distance. */
  tokenSize?: number;
  /** Alignment of the header block. */
  align?: 'left' | 'center' | 'right';
  /** Vertical space between blocks, in px. */
  spacing?: number;
  /** Extra line above the token number. */
  headerText?: string;
  /** Replaces the default counter instruction. */
  footerText?: string;
  showLogo?: boolean;
  showOrderNumber?: boolean;
  showDateTime?: boolean;
  showTable?: boolean;
  showCustomer?: boolean;
}

const TOKEN_DEFAULTS: Required<Omit<TokenSlipOptions, 'headerText' | 'footerText'>> & { headerText: string; footerText: string } = {
  fontSize: 14,
  tokenSize: 44,
  align: 'center',
  spacing: 4,
  headerText: '',
  footerText: '',
  showLogo: true,
  showOrderNumber: true,
  showDateTime: true,
  showTable: true,
  showCustomer: false,
};

const TOKEN_OPTS_KEY = 'dtpos-token-slip-options';

/** Saved token-template options, clamped to values a thermal head can print. */
export function loadTokenOptions(): typeof TOKEN_DEFAULTS {
  let saved: any = {};
  try { saved = JSON.parse(localStorage.getItem(TOKEN_OPTS_KEY) || '{}') || {}; } catch { saved = {}; }
  const merged = { ...TOKEN_DEFAULTS, ...saved };
  const clamp = (v: any, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  return {
    ...merged,
    // 10px is the floor at which a 203 DPI head still prints crisp text.
    fontSize: clamp(merged.fontSize, 10, 22, TOKEN_DEFAULTS.fontSize),
    tokenSize: clamp(merged.tokenSize, 18, 96, TOKEN_DEFAULTS.tokenSize),
    spacing: clamp(merged.spacing, 0, 16, TOKEN_DEFAULTS.spacing),
    align: ['left', 'center', 'right'].includes(merged.align) ? merged.align : 'center',
    headerText: String(merged.headerText ?? '').slice(0, 120),
    footerText: String(merged.footerText ?? '').slice(0, 160),
  };
}

export function saveTokenOptions(patch: TokenSlipOptions) {
  try {
    const next = { ...loadTokenOptions(), ...patch };
    localStorage.setItem(TOKEN_OPTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('dtpos-token-options-changed'));
  } catch { /* storage unavailable — defaults still print */ }
}

export function resetTokenOptions() {
  try { localStorage.removeItem(TOKEN_OPTS_KEY); } catch { /* storage unavailable */ }
}

/** Extra context printTokenDirect needs to record the token properly. */
export interface TokenPrintContext {
  /** The order this token belongs to, when there is one. */
  order?: import('./types').Order;
  cashierId?: string;
  cashierName?: string;
}

export interface TokenSlipData {
  orderNumber: number | string;
  items: { name: string; qty: number }[];
  restaurantName?: string;
  logo?: string;
  when?: Date;
  /** The bill this token belongs to, when it differs from the token number. */
  billNumber?: number | string;
  tableName?: string;
  customerName?: string;
  /** Marks the slip as a second print of a token that already exists. */
  reprint?: boolean;
  /**
   * Detachable department stubs. When present the slip prints one tear-off
   * portion per department after the main token, each carrying enough
   * identity to be traced back to this order.
   */
  departments?: {
    departmentName: string;
    qty: number;
    /** Item name on item/piece stubs; absent on a department summary stub. */
    itemName?: string;
    /** "3 of 6" on a per-piece stub. */
    index?: number;
    ofTotal?: number;
    items?: { name: string; qty: number }[];
  }[];
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/**
 * A tear-off stub.
 *
 * Deliberately small — around 15mm of paper — because a stub per piece on a
 * busy order would otherwise turn one token into a long receipt. It carries
 * only what a physical count needs: which order, which token, which
 * department and item, and how many.
 *
 * The cut line sits ABOVE each stub, so tearing along it leaves the stub
 * whole and the piece above it whole too.
 */
function departmentStubHtml(
  d: TokenSlipData,
  stub: NonNullable<TokenSlipData['departments']>[number],
  fs: number,
): string {
  const cut = `<div style="border-top:2px dashed #000;margin:3px 0;text-align:center;font-size:${fs - 4}px;letter-spacing:2px">\u2702 CUT HERE</div>`;
  // Per-piece stubs carry "3 of 6" so a counter can see at a glance that
  // none of the set is missing.
  const counter = stub.index && stub.ofTotal && stub.ofTotal > 1
    ? `<span style="font-size:${fs - 3}px;font-weight:700">${stub.index} of ${stub.ofTotal}</span>`
    : '';
  // Department summary stubs have no item name; item and piece stubs lead
  // with the item and keep the department as the smaller line.
  const headline = stub.itemName || stub.departmentName;
  const sub = stub.itemName ? stub.departmentName : '';

  return `${cut}
    <div style="padding:1px 0 3px">
      <div style="display:flex;justify-content:space-between;font-size:${fs - 3}px;font-weight:700">
        <span>Order #${esc(d.billNumber ?? d.orderNumber)}</span><span>Token #${esc(d.orderNumber)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:1px">
        <span style="font-size:${fs + 2}px;font-weight:900;letter-spacing:0.5px;line-height:1.1">${esc(headline).toUpperCase()}</span>
        <span style="font-size:${fs + 5}px;font-weight:900;white-space:nowrap">QTY ${stub.qty}</span>
      </div>
      ${sub || counter ? `<div style="display:flex;justify-content:space-between;font-size:${fs - 3}px">
        <span>${esc(sub)}</span>${counter}
      </div>` : ''}
    </div>`;
}

export function tokenSlipInnerHtml(d: TokenSlipData, template: TokenTemplate = 'classic', showTotal: boolean = true): string {
  const total = d.items.reduce((s, i) => s + (i.qty || 0), 0);
  const when = (d.when || new Date()).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const logo = d.logo ? `<div style="text-align:center;margin-bottom:2px"><img src="${esc(d.logo)}" alt="" style="max-width:60%;max-height:60px;object-fit:contain;filter:grayscale(1) contrast(1.4)"/></div>` : '';
  const name = d.restaurantName ? `<div style="text-align:center;font-size:15px;font-weight:800">${esc(d.restaurantName)}</div>` : '';
  const dash = `<div style="border-top:1px dashed #000;margin:4px 0"></div>`;
  const rows = (bold = 700, fs = 14) => d.items.map(it =>
    `<div style="display:flex;justify-content:space-between;font-size:${fs}px;font-weight:${bold}"><span>${esc(it.name)}</span><span style="font-weight:900">${it.qty}</span></div>`).join('');
  // FIX (client): total line is optional — when OFF, show only item and qty (e.g. "Naan 8")
  const totalRow = showTotal
    ? `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px"><span>Total pieces</span><span>${total}</span></div>`
    : '';
  const meta = `<div style="text-align:center;font-size:11px">Order #${esc(d.orderNumber)} · ${when}</div>`;
  const foot = `<div style="text-align:center;font-size:10px;margin-top:2px">Please hand over to the tandoor counter</div>`;

  // ---- Professional set -------------------------------------------------
  // Options are read here rather than passed down so every caller (queue,
  // POS button, preview) picks up a saved change with no extra wiring.
  const o = loadTokenOptions();
  const fs = o.fontSize;
  const gap = o.spacing;
  const optLogo = o.showLogo ? logo : '';
  const optName = d.restaurantName
    ? `<div style="text-align:${o.align};font-size:${fs + 3}px;font-weight:900;line-height:1.15">${esc(d.restaurantName)}</div>`
    : '';
  const headerNote = o.headerText
    ? `<div style="text-align:${o.align};font-size:${fs - 2}px">${esc(o.headerText)}</div>`
    : '';
  const footNote = `<div style="text-align:center;font-size:${fs - 3}px;margin-top:${gap}px">${esc(o.footerText || 'Please hand this slip to the counter')}</div>`;

  // Only the details the shop turned on, and only those the order carries.
  const detailBits: string[] = [];
  if (o.showOrderNumber) detailBits.push(`Order #${esc(d.billNumber ?? d.orderNumber)}`);
  if (o.showDateTime) detailBits.push(when);
  if (o.showTable && d.tableName) detailBits.push(`Table ${esc(d.tableName)}`);
  if (o.showCustomer && d.customerName) detailBits.push(esc(d.customerName));
  const detailLine = detailBits.length
    ? `<div style="text-align:center;font-size:${fs - 3}px">${detailBits.join(' · ')}</div>`
    : '';

  const optRows = (size = fs) => d.items.map(it =>
    `<div style="display:flex;justify-content:space-between;gap:8px;font-size:${size}px;font-weight:700;padding:${Math.max(0, gap - 2)}px 0"><span>${esc(it.name)}</span><span style="font-weight:900">${it.qty}</span></div>`).join('');
  const optTotal = showTotal
    ? `<div style="display:flex;justify-content:space-between;font-weight:900;font-size:${fs}px;border-top:1px solid #000;padding-top:${gap}px;margin-top:${gap}px"><span>Total pieces</span><span>${total}</span></div>`
    : '';

  // A reprint must be obvious on the paper so a counted stub is never
  // mistaken for a second sale.
  const reprintBanner = d.reprint
    ? `<div style="text-align:center;font-weight:900;font-size:${fs}px;letter-spacing:2px;border:2px solid #000;padding:1px 0;margin-bottom:${gap}px">*** REPRINT ***</div>`
    : '';
  const stubs = (d.departments || []).length
    ? (d.departments || []).map(dept => departmentStubHtml(d, dept, fs)).join('')
    : '';
  const wrap = (body: string) => `${reprintBanner}${body}${stubs}`;

  switch (template) {
    case 'standard':
      return wrap(`${optLogo}${optName}${headerNote}
        <div style="text-align:center;font-weight:800;font-size:${fs}px;letter-spacing:1px;margin-top:${gap}px">TOKEN</div>
        <div style="text-align:center;font-size:${o.tokenSize}px;font-weight:900;line-height:1.05">${esc(d.orderNumber)}</div>
        ${detailLine}
        <div style="border-top:1px dashed #000;margin:${gap}px 0"></div>
        ${optRows()}${optTotal}${footNote}`);

    case 'professional':
      return wrap(`<div style="border:2px solid #000;padding:${gap}px 4px">${optLogo}${optName}${headerNote}</div>
        ${detailLine}
        <div style="text-align:center;border:3px solid #000;margin-top:${gap}px;padding:${gap}px 0">
          <div style="font-size:${fs - 2}px;font-weight:800;letter-spacing:2px">TOKEN NUMBER</div>
          <div style="font-size:${o.tokenSize}px;font-weight:900;line-height:1.05">${esc(d.orderNumber)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:${fs}px;font-weight:700;margin-top:${gap}px">
          <tr><th style="border-bottom:2px solid #000;padding:${gap}px 2px;text-align:left">Item</th><th style="border-bottom:2px solid #000;padding:${gap}px 2px;text-align:right;white-space:nowrap">Qty</th></tr>
          ${d.items.map(it => `<tr><td style="border-bottom:1px solid #000;padding:${gap}px 2px">${esc(it.name)}</td><td style="border-bottom:1px solid #000;padding:${gap}px 2px;text-align:right;font-weight:900;white-space:nowrap">${it.qty}</td></tr>`).join('')}
          ${showTotal ? `<tr><td style="padding:${gap}px 2px;font-weight:900">Total pieces</td><td style="padding:${gap}px 2px;text-align:right;font-weight:900">${total}</td></tr>` : ''}
        </table>${footNote}`);

    case 'vip':
      // The token number is the whole point of this slip: it is sized to be
      // read from across a counter, with everything else kept out of its way.
      return wrap(`${optLogo}${optName}${headerNote}
        <div class="dt-reverse" style="background:#000;color:#fff;text-align:center;font-weight:900;font-size:${fs + 2}px;letter-spacing:3px;padding:${gap}px 0;margin-top:${gap}px;-webkit-print-color-adjust:exact;print-color-adjust:exact">TOKEN</div>
        <div style="text-align:center;font-size:${Math.round(o.tokenSize * 1.4)}px;font-weight:900;line-height:1;letter-spacing:2px;padding:${gap * 2}px 0;border-bottom:4px solid #000">${esc(d.orderNumber)}</div>
        ${detailLine}
        <div style="margin-top:${gap}px">${optRows(fs + 2)}</div>${optTotal}${footNote}`);

    case 'bold':
      return wrap(`${logo}${name}
        <div style="text-align:center;font-weight:900;font-size:20px;letter-spacing:1px">TANDOOR TOKEN</div>${meta}${dash}
        ${rows(800, 17)}${dash}${totalRow}
        <div style="text-align:center;font-size:36px;font-weight:900;letter-spacing:4px;margin-top:6px;border-top:3px solid #000;border-bottom:3px solid #000;padding:4px 0">${esc(d.orderNumber)}</div>
        <div style="text-align:center;font-size:12px;font-weight:800">TOKEN NUMBER</div>${foot}`);
    case 'boxed':
      return wrap(`${logo}${name}
        <div style="text-align:center;font-weight:800;font-size:16px;border:2px solid #000;border-radius:6px;padding:2px 0;margin:2px 0">*** TANDOOR TOKEN ***</div>${meta}
        <table style="width:100%;border-collapse:collapse;font-size:14px;font-weight:700;margin-top:4px">
          <tr><th style="border:1.5px solid #000;padding:3px 6px;text-align:left">Item</th><th style="border:1.5px solid #000;padding:3px 6px;width:52px;text-align:center">Qty</th></tr>
          ${d.items.map(it => `<tr><td style="border:1.5px solid #000;padding:3px 6px">${esc(it.name)}</td><td style="border:1.5px solid #000;padding:3px 6px;text-align:center;font-weight:900">${it.qty}</td></tr>`).join('')}
          ${showTotal ? `<tr><td style="border:1.5px solid #000;padding:3px 6px;font-weight:900">Total pieces</td><td style="border:1.5px solid #000;padding:3px 6px;text-align:center;font-weight:900">${total}</td></tr>` : ''}
        </table>
        <div style="text-align:center;font-size:26px;font-weight:900;letter-spacing:3px;margin-top:6px;border:2px solid #000;border-radius:6px;padding:2px 0">TOKEN ${esc(d.orderNumber)}</div>${foot}`);
    case 'minimal':
      return wrap(`<div style="text-align:center;font-weight:900;font-size:15px">TOKEN</div>
        <div style="text-align:center;font-size:30px;font-weight:900;letter-spacing:3px">${esc(d.orderNumber)}</div>${dash}
        ${rows(700, 13)}${dash}${totalRow}
        <div style="text-align:center;font-size:10px">${when}</div>`);
    case 'classic':
    default:
      return wrap(`${logo}${name}
        <div style="text-align:center;font-weight:800;font-size:16px;letter-spacing:1px">*** TANDOOR TOKEN ***</div>${meta}${dash}
        ${rows()}${dash}${totalRow}
        <div style="text-align:center;font-size:28px;font-weight:900;letter-spacing:3px;margin-top:6px;border:2px solid #000;border-radius:6px;padding:2px 0">TOKEN ${esc(d.orderNumber)}</div>${foot}`);
  }
}

/** Next token serial (today's tokens + 1) — used when there is no order number. */
export function nextTokenSerial(): number {
  try { return getTokenSummary(todayKey()).tokenCount + 1; } catch { return 1; }
}

/** INSTANT token print — without the queue (for the POS button).
 *  Prints the slip + records the count in the register. */
export async function printTokenDirect(
  d: TokenSlipData,
  settingsAny: any,
  ctx: TokenPrintContext = {},
): Promise<{ success: boolean; error?: string; tokenNumber?: number | string; isReprint?: boolean }> {
  if (!d.items.length) return { success: false, error: 'No token-category items in the cart' };

  const template: TokenTemplate = (settingsAny?.tokenTemplate as TokenTemplate) || 'standard';
  const paperWidth = (settingsAny?.paperSize as '58mm' | '80mm') || '80mm';

  // Printer resolve: role token → kitchen → legacy
  let printerName: string | undefined;
  let tokenCfg: any = undefined;
  try {
    const pset = await loadPrinterSettings();
    const dev = getDeviceId();
    const tok: any = resolvePrinterForRole(pset, 'token' as any, dev);
    const kit: any = resolvePrinterForRole(pset, 'kitchen', dev);
    tokenCfg = tok || kit;
    if (tokenCfg && (tokenCfg.connection || 'system') === 'system' && tokenCfg.printerName) printerName = tokenCfg.printerName;
  } catch {}
  if (!printerName) printerName = settingsAny?.tokenPrinter || settingsAny?.kotPrinter || settingsAny?.defaultPrinter || undefined;

  // Offscreen portal (attached to body — print CSS targets this)
  const portal = document.createElement('div');
  portal.className = 'receipt-print-portal';
  portal.setAttribute('aria-hidden', 'true');
  portal.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;';
  const inner = document.createElement('div');
  inner.className = 'print-receipt bg-white text-black';
  inner.setAttribute('data-paper-size', paperWidth);
  inner.style.cssText = `width:${paperWidth};font-family:monospace;font-size:14px;font-weight:700;color:#000;background:#fff;`;
  const { buildDepartmentStubs } = await import('./tokenDepartments');
  inner.innerHTML = tokenSlipInnerHtml({
    ...d,
    restaurantName: d.restaurantName ?? settingsAny?.name ?? settingsAny?.restaurantName,
    logo: d.logo ?? settingsAny?.logo,
    departments: d.departments ?? buildDepartmentStubs(ctx.order, settingsAny),
  }, template, settingsAny?.tokenShowTotal !== false);
  portal.appendChild(inner);
  document.body.appendChild(portal);
  try {
    // Compact Print Mode is GLOBAL — token slips follow it too.
    const res = await printNode(portal, {
      paperWidth, printerName, silent: true, copies: 1,
      // The token printer's own mode and geometry, so this slip is positioned
      // by the same numbers as every other one.
      printMode: tokenCfg?.printMode,
      compact: !!settingsAny?.receiptCompactMode,
      compactFontSize: settingsAny?.receiptCompactFontSize,
      compactLineHeight: settingsAny?.receiptCompactLineHeight,
      marginLeftMm: tokenCfg?.leftMarginMm,
      marginRightMm: tokenCfg?.rightMarginMm,
      contentWidthMm: tokenCfg?.printWidthMm,
      logType: 'other',
    });
    if (res.success) {
      // The business record. When this order already has a token the issuer
      // returns THAT record with its reprint count bumped, so a second print
      // from Retrieve never becomes a second token sale.
      try {
        const { issueToken } = await import('./tokenRecords');
        const issued = issueToken({
          order: ctx.order,
          lines: ctx.order ? undefined : d.items.map(i => ({
            menuItemId: undefined, name: i.name, quantity: i.qty, lineTotal: 0,
          })),
          settings: settingsAny,
          source: 'manual',
          cashierId: ctx.cashierId,
          cashierName: ctx.cashierName,
          tokenNumber: typeof d.orderNumber === 'number' ? d.orderNumber : undefined,
        });
        if (issued) {
          // Legacy day-register, kept so existing reports keep working.
          try { appendTokenEntry({ orderNumber: d.orderNumber, items: d.items, source: 'manual' }); } catch {}
          return { ...res, tokenNumber: issued.record.tokenNumber, isReprint: issued.isReprint };
        }
      } catch (e) { console.warn('[token] record failed', e); }
      try { appendTokenEntry({ orderNumber: d.orderNumber, items: d.items, source: 'manual' }); } catch {}
    }
    return res;
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  } finally {
    setTimeout(() => { try { portal.remove(); } catch {} }, 400);
  }
}
