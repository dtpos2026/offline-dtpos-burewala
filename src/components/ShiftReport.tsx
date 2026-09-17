// ============================================================
// SHIFT REPORT — client ke sample receipt ka exact format.
// Sections: Summary · Tax · Transactions · Cash drawer report ·
// Payment Report (with %) · Sold categories · Sold products.
// Prints on 80mm thermal (proven printNode pipeline).
// ============================================================
import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getOrders, getMenuItems, getCategories, getSettings } from '@/lib/store';
import { getAllHistoricalOrders } from '@/lib/orderArchive';
import { isPaidSale, isPartialSale, isVoidish, paidRevenue } from '@/lib/sales';
import type { Order } from '@/lib/types';
import { printNode } from '@/printing';
import { loadPrinterSettings, resolvePrinterForRole } from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';

export interface ShiftReportRange {
  from: Date;
  to: Date;
  label: string;
  /** Cash drawer opening float (settings/day-close se aata hai) */
  startingCash?: number;
  /** Counted cash at close (agar user ne dala ho) */
  actualEndingCash?: number;
  staffName?: string;
}

export function buildShiftReportData(range: ShiftReportRange) {
  const settings: any = getSettings();
  const menu = getMenuItems();
  const cats = getCategories();
  const catName = new Map(cats.map((c: any) => [c.id, c.name]));
  const itemCat = new Map(menu.map((m: any) => [m.id, m.categoryId]));

  // FIX: live orders become empty after Day Close — include archive too,
  // otherwise Shift Report showed '0 orders' and older dates weren't found.
  const all = getAllHistoricalOrders(getOrders());
  const inRange = (o: Order) => {
    const t = new Date((o as any).paidAt || (o as any).updatedAt || o.createdAt || 0).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  };

  const sales = all.filter(o => inRange(o) && !isVoidish(o) && (isPaidSale(o) || isPartialSale(o)));
  const refunds = all.filter(o => inRange(o) && isVoidish(o));

  let productAmount = 0, discount = 0, serviceCharge = 0, taxTotal = 0, net = 0, soldQty = 0;
  const byCat = new Map<string, { qty: number; amount: number }>();
  const byProd = new Map<string, { qty: number; amount: number }>();
  const byPay = new Map<string, number>();
  const byType = new Map<string, { orders: number; amount: number }>();

  for (const o of sales) {
    const rev = paidRevenue(o);
    net += rev;
    productAmount += Number((o as any).subtotal || 0);
    discount += Number((o as any).discount ?? (o as any).discountAmount ?? 0);
    serviceCharge += Number((o as any).serviceCharge || 0);
    taxTotal += Number((o as any).tax || 0);

    const pm = String((o as any).paymentMethod || 'cash');
    byPay.set(pm, (byPay.get(pm) || 0) + rev);

    const ot = String(o.orderType || 'dining');
    const tRow = byType.get(ot) || { orders: 0, amount: 0 };
    tRow.orders++; tRow.amount += rev; byType.set(ot, tRow);

    for (const it of ((o.items || []) as any[])) {
      const q = Number(it.quantity || 0);
      const amt = Number(it.lineTotal || 0);
      soldQty += q;
      const cname = catName.get(itemCat.get(it.menuItemId) || '') || 'Uncategorized';
      const c = byCat.get(cname) || { qty: 0, amount: 0 };
      c.qty += q; c.amount += amt; byCat.set(cname, c);
      const p = byProd.get(it.name) || { qty: 0, amount: 0 };
      p.qty += q; p.amount += amt; byProd.set(it.name, p);
    }
  }

  let refundAmount = 0, refundedProducts = 0;
  for (const o of refunds) {
    refundAmount += Number((o as any).grandTotal || 0);
    for (const it of ((o.items || []) as any[])) refundedProducts += Number(it.quantity || 0);
  }

  const subTotal = productAmount - discount + serviceCharge + taxTotal;
  const rounding = Math.round((net - subTotal) * 100) / 100;
  const checkedOut = sales.length;
  const avgIncome = checkedOut ? net / checkedOut : 0;

  const cashIncome = byPay.get('cash') || 0;
  const startingCash = Number(range.startingCash || 0);
  const expectedCash = startingCash + cashIncome;
  const payTotal = Array.from(byPay.values()).reduce((a, b) => a + b, 0);

  const taxPct = Number(settings.taxPercent) || 0;
  const taxable = taxPct > 0 ? Math.round((taxTotal / (taxPct / 100)) * 100) / 100 : 0;

  return {
    settings,
    range,
    summary: { productAmount, discount, serviceCharge, temporaryCharge: 0, rounding, subTotal, refundAmount, actualSales: net },
    tax: { taxable, taxPct, taxAmount: taxTotal },
    transactions: { checkedOut, avgIncome, soldProducts: soldQty, refunded: refunds.length, refundedProducts },
    drawer: { startingCash, orderIncome: cashIncome, payIn: 0, refund: refundAmount, payOut: 0, expectedCash, actualEndingCash: Number(range.actualEndingCash ?? expectedCash) },
    payments: Array.from(byPay.entries()).map(([m, amt]) => ({ method: m, amount: amt, percent: payTotal ? (amt / payTotal) * 100 : 0 })).sort((a, b) => b.amount - a.amount),
    payTotal,
    types: Array.from(byType.entries()).map(([k, v]) => ({ type: k, ...v })).sort((a, b) => b.amount - a.amount),
    categories: Array.from(byCat.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount),
    products: Array.from(byProd.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount),
    totals: { catQty: Array.from(byCat.values()).reduce((a, b) => a + b.qty, 0), catAmt: Array.from(byCat.values()).reduce((a, b) => a + b.amount, 0) },
  };
}

const TYPE_LABEL: Record<string, string> = { dining: 'Dine-In', takeaway: 'Takeaway', delivery: 'Delivery', foodpanda: 'Online / Drive' };

/** Shift Report ka HTML (sample layout ke mutabiq) — thermal 80mm. */
export function shiftReportHtml(d: ReturnType<typeof buildShiftReportData>): string {
  const s: any = d.settings;
  const sym = s.currencySymbol || 'Rs.';
  const m = (n: number) => `${sym}${Number(n || 0).toFixed(2)}`;
  const row = (label: string, value: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;${bold ? 'font-weight:900;' : ''}"><span>${label}</span><span>${value}</span></div>`;
  const head = (title: string) =>
    `<div style="font-weight:900;font-size:14px;margin-top:8px;border-bottom:2px solid #000;padding-bottom:1px;color:#000">${title}</div>`;
  const dash = `<div style="border-top:1px dashed #000;margin:5px 0"></div>`;
  const col3 = (a: string, b: string, c: string, bold = false) =>
    `<div style="display:flex;${bold ? 'font-weight:900;' : ''}"><span style="flex:1;overflow:hidden">${a}</span><span style="width:34px;text-align:right">${b}</span><span style="width:74px;text-align:right">${c}</span></div>`;

  return `
  <div style="text-align:center;font-weight:900;font-size:17px">Shift Report</div>
  <div style="text-align:center;font-size:11px">${s.restaurantName || ''}</div>
  ${dash}
  ${row('Staff', String(d.range.staffName || s.email || '-'))}
  ${row('Start', d.range.from.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}
  ${row('End', d.range.to.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}
  ${row('Shift duration', d.range.label)}
  ${dash}

  ${head('Summary')}
  ${row('Product amount(exc tax)', m(d.summary.productAmount))}
  ${row('Discount', `-${m(d.summary.discount)}`)}
  ${row('Service charge', m(d.summary.serviceCharge))}
  ${row('Temporary Charge', m(d.summary.temporaryCharge))}
  ${row('Rounding', m(d.summary.rounding))}
  ${row('Sub-Total', m(d.summary.subTotal))}
  ${row('Refund amount(exc tax)', `-${m(d.summary.refundAmount)}`)}
  ${row('Actual sales', m(d.summary.actualSales), true)}

  ${head('Tax')}
  ${row(`Taxable(${s.countryTaxLabel || 'GST'})`, m(d.tax.taxable))}
  ${row(`${s.countryTaxLabel || 'GST'}(${d.tax.taxPct}%)`, m(d.tax.taxAmount))}
  ${row('Actual tax', m(d.tax.taxAmount), true)}

  ${head('Transactions')}
  ${row('Checked out', String(d.transactions.checkedOut))}
  ${row('Average income value', m(d.transactions.avgIncome))}
  ${row('Sold products', String(d.transactions.soldProducts))}
  ${row('Refunded', String(d.transactions.refunded))}
  ${row('Refunded products', String(d.transactions.refundedProducts))}

  ${head('Cash drawer report')}
  ${row('Starting cash', m(d.drawer.startingCash))}
  ${row('Order income', m(d.drawer.orderIncome))}
  ${row('Pay in', m(d.drawer.payIn))}
  ${row('Refund', `-${m(d.drawer.refund)}`)}
  ${row('Pay out', m(d.drawer.payOut))}
  ${row('Expected cash', m(d.drawer.expectedCash), true)}
  ${row('Actual ending cash', m(d.drawer.actualEndingCash), true)}

  ${head('Payment Report')}
  ${col3('Method', 'Amount', 'Percent', true)}
  <div style="border-top:1px dashed #000;margin:2px 0"></div>
  ${d.payments.map(p => col3(p.method.toUpperCase(), '', `${m(p.amount)}  ${p.percent.toFixed(2)}%`)).join('')}
  <div style="border-top:1px solid #000;margin:2px 0"></div>
  ${row('Total', m(d.payTotal), true)}

  ${head('Order Types')}
  ${d.types.map(t => row(TYPE_LABEL[t.type] || t.type, `${t.orders}  ${m(t.amount)}`)).join('') || '<div>-</div>'}

  ${head('Sold categories')}
  ${col3('Products', 'Qty', 'Amount', true)}
  <div style="border-top:1px dashed #000;margin:2px 0"></div>
  ${d.categories.map(c => col3(c.name, String(c.qty), m(c.amount))).join('') || '<div>-</div>'}
  <div style="border-top:1px solid #000;margin:2px 0"></div>
  ${col3('Total', String(d.totals.catQty), m(d.totals.catAmt), true)}

  ${head('Sold products')}
  ${col3('Products', 'Qty', 'Amount', true)}
  <div style="border-top:1px dashed #000;margin:2px 0"></div>
  ${d.products.map(p => col3(p.name, String(p.qty), m(p.amount))).join('') || '<div>-</div>'}
  <div style="border-top:1px solid #000;margin:2px 0"></div>
  ${col3('Total', String(d.totals.catQty), m(d.totals.catAmt), true)}

  ${dash}
  <div style="display:flex;justify-content:space-between;font-size:11px"><span>Print Time</span><span>${new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>
  `;
}

/** Print the shift report on the counter printer INSTANTLY (without the queue). */
export async function printShiftReport(range: ShiftReportRange): Promise<{ success: boolean; error?: string }> {
  const data = buildShiftReportData(range);
  const settings: any = data.settings;
  const paperWidth = (settings.paperSize as '58mm' | '80mm') || '80mm';

  let printerName: string | undefined;
  let printMode: string | undefined;
  let marginLeftMm: number | undefined;
  let marginRightMm: number | undefined;
  let contentWidthMm: number | undefined;
  try {
    const pset = await loadPrinterSettings();
    const cfg: any = resolvePrinterForRole(pset, 'counter', getDeviceId());
    if (cfg && (cfg.connection || 'system') === 'system' && cfg.printerName) printerName = cfg.printerName;
    printMode = cfg?.printMode;
    marginLeftMm = cfg?.leftMarginMm;
    marginRightMm = cfg?.rightMarginMm;
    contentWidthMm = cfg?.printWidthMm;
  } catch {}
  if (!printerName) printerName = settings.defaultPrinter || undefined;

  const portal = document.createElement('div');
  portal.className = 'receipt-print-portal';
  portal.setAttribute('aria-hidden', 'true');
  portal.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;';
  const inner = document.createElement('div');
  inner.className = 'print-receipt bg-white text-black';
  inner.setAttribute('data-paper-size', paperWidth);
  // FIX (client: reports very faint): thermal print used to come out light —
  // ab pura black + bold + darker rendering.
  inner.style.cssText = `width:${paperWidth};font-family:Arial,Roboto,monospace;font-size:13px;font-weight:800;line-height:1.3;color:#000;background:#fff;-webkit-font-smoothing:none;text-rendering:geometricPrecision;`;
  inner.innerHTML = shiftReportHtml(data);
  portal.appendChild(inner);
  document.body.appendChild(portal);
  try {
    // The shift report is a slip like any other: Paper Save and the printer's
    // own geometry apply to it too. It used to pass neither, so a shop with
    // Paper Save on got a compact receipt, a compact KOT, a compact token —
    // and a full-length shift report.
    return await printNode(portal, {
      paperWidth, printerName, silent: true, copies: 1,
      printMode: printMode as any,
      compact: !!settings.receiptCompactMode,
      compactFontSize: settings.receiptCompactFontSize,
      compactLineHeight: settings.receiptCompactLineHeight,
      marginLeftMm, marginRightMm, contentWidthMm,
      logType: 'other',
    });
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  } finally {
    setTimeout(() => { try { portal.remove(); } catch {} }, 500);
  }
}

/** On-screen preview (same layout). */
export default function ShiftReportPreview({ range }: { range: ShiftReportRange }) {
  const data = useMemo(() => buildShiftReportData(range), [range.from.getTime(), range.to.getTime(), range.startingCash, range.actualEndingCash]);
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={ref}
      className="bg-white text-black mx-auto"
      style={{ width: 320, fontFamily: 'monospace', fontSize: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}
      dangerouslySetInnerHTML={{ __html: shiftReportHtml(data) }}
    />
  );
}
