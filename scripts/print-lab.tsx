// ============================================================
// PRINT LAB — the page the printer simulator drives.
//
// It renders each slip through the SAME components the POS uses, snapshots
// the portal exactly as the print path does, and hands the resulting worker
// document to the simulator. Nothing here reimplements the print pipeline;
// it only feeds it, so what the simulator rasterises is what the printer
// would receive.
//
// Not part of the shipped app — scripts/ is excluded from the build.
// ============================================================
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
// The app's stylesheet: the print worker copies it into every slip document
// (collectAppCss), so utility classes in the templates must resolve here too.
import '@/index.css';
import PremiumReceipt from '@/components/PremiumReceipt';
import ReceiptPreview from '@/components/ReceiptPreview';
import KitchenReceipt from '@/components/KitchenReceipt';
import { ReceiptCodesProvider, ReceiptCodesSlot } from '@/components/ReceiptCodes';
import { ALL_PREMIUM_TEMPLATES as PREMIUM_TEMPLATES, ALL_PREMIUM_TEMPLATES, loadCustomization } from '@/lib/premiumReceiptTemplates';
import { buildSampleOrder } from '@/lib/sampleOrder';
import { buildWorkerDocument } from '@/printing/fastPrint';
import { tokenSlipInnerHtml, TOKEN_TEMPLATES } from '@/lib/tokenSlip';
import { resolvePrintGeometry } from '@/printing/printGeometry';
import { thermalReportHtml, reportMoney, type ThermalReportDoc } from '@/printing/thermalReport';
import { shiftReportDoc } from '@/components/ShiftReport';

const order = buildSampleOrder();
const PDF_MODE = new URLSearchParams(location.search).get('pdf') === '1';
// ?unpaid=1 — a running bill: status boxes print their UNPAID (reversed) form.
if (new URLSearchParams(location.search).get('unpaid') === '1') {
  Object.assign(order, { status: 'running', paidAt: undefined, amountPaid: 0, cashReceived: 0, changeReturned: 0 });
}

// A realistic shop, matching the scale of names/addresses a real bill carries.
const settings: any = {
  name: "LOTUS CAFE' & RESTAURANT",
  address: 'Green Belt 73 Block B Satellite Town, Jhang',
  phone1: '03007623533',
  phone2: '0477623533',
  currencySymbol: 'Rs ',
  paperSize: '80mm',
  thankYouText: 'Thank You!',
  receiptFooter: '',
};

// ?pdf=1 — the sample bill and shop of the DT Retail design guide, so a slip can
// be laid next to the guide's own picture of it.
if (new URLSearchParams(location.search).get('pdf') === '1') {
  Object.assign(settings, {
    name: 'Sample Restaurant', address: 'Main Boulevard, Gulberg III, Lahore',
    phone1: '0300-1234567', phone2: '', currencySymbol: 'Rs.', receiptHideDecimals: true,
    thankYouText: 'Thank you for your visit! Please come again.', receiptFooter: '',
  });
  Object.assign(order, {
    orderNumber: 27, orderType: 'dining', tableName: '4', cashierName: 'Cashier', waiterName: undefined,
    customer: { id: 'c1', name: 'Ahmed Khan', phone: '03001234567', address: '' },
    items: [
      { id: 'i1', menuItemId: 'm1', name: 'Zinger Burger', pricingType: 'fixed', price: 450, quantity: 2, lineTotal: 900, note: 'Extra mayo' },
      { id: 'i2', menuItemId: 'm2', name: '\u0686\u06A9\u0646 \u0628\u0631\u06CC\u0627\u0646\u06CC (Special)', pricingType: 'fixed', price: 480, quantity: 1, lineTotal: 450, note: '' },
      { id: 'i3', menuItemId: 'm3', name: 'French Fries', pricingType: 'fixed', price: 250, quantity: 1, lineTotal: 250, note: '' },
      { id: 'i4', menuItemId: 'm4', name: 'Cold Drink 500ml', pricingType: 'fixed', price: 120, quantity: 3, lineTotal: 360, note: '' },
    ],
    subtotal: 1990, discount: 90, discountTitle: 'Discount', tax: 0, serviceCharge: 0, grandTotal: 1900,
    paymentMethod: 'cash', cashReceived: 2000, changeReturned: 100,
  });
  // Every DT Retail design starts with the guide's header line and credit.
  // Written straight to the store (not through saveCustomization, which would
  // pin every default and hide each template's own type size and weight).
  const store: Record<string, unknown> = {};
  for (const t of ALL_PREMIUM_TEMPLATES) {
    if (t.id.startsWith('dtr-')) {
      store[t.id] = {
        headerNote: t.id === 'dtr-tax-invoice' ? '1234567-8' : (t.id === 'dtr-luxury' || t.id === 'dtr-modern' || t.id === 'dtr-compact' ? 'NTN 1234567-8' : 'NTN: 1234567-8'),
        showPoweredBy: true,
      };
    }
  }
  try { localStorage.setItem('dtpos-premium-template-customizations', JSON.stringify(store)); } catch { /* lab only */ }
  // The guide's tokens print prices and the customer's name.
  try { localStorage.setItem('dtpos-token-slip-options', JSON.stringify({ showPrices: true, showCustomer: true, showTable: false })); } catch { /* lab only */ }
}

// The classic designs and KOTs read more of the shop's settings; these are
// the values a new shop starts with, plus a footer so every block renders.
const legacySettings: any = {
  ...settings,
  visitAgainText: 'Please Visit Again',
  receiptFooter: 'Goods once sold will not be taken back.',
  marketingFooter: 'DIGITAL TARGET SOFTWARE SOLUTIONS\nDeveloped By: Taimoor Younas\n0345-1873354',
  qrMode: 'auto',
  customQrImage: '',
  bankName: '',
  receiptStyles: {},
  silentPrint: false,
};
// ?qr=auto|text|multi|single&bar=code128|code39&pos=above|footer|below
// &qrsize=32&barsize=small|medium|large — Settings → Receipt → QR & Barcode.
{
  const q = new URLSearchParams(location.search);
  const qr = q.get('qr');
  const bar = q.get('bar');
  if (qr || bar) {
    const pos = q.get('pos') || 'footer';
    const codes = {
      qr: {
        enabled: !!qr,
        mode: qr === 'text' ? 'auto' : (qr || 'auto'),
        autoView: qr === 'text' ? 'text' : 'page',
        links: [
          { id: 'g', type: 'google', label: '', url: 'https://g.page/r/CaBcDeFgHiJkEBM/review' },
          { id: 'f', type: 'facebook', label: '', url: 'facebook.com/lotuscafejhang' },
          { id: 'w', type: 'whatsapp', label: 'Order on WhatsApp', url: '0300 7623533' },
          { id: 'i', type: 'instagram', label: '', url: 'https://instagram.com/lotuscafe' },
        ],
        singleUrl: 'https://g.page/r/CaBcDeFgHiJkEBM/review',
        position: pos,
        sizeMm: Number(q.get('qrsize') || 32),
      },
      barcode: { enabled: !!bar, format: bar || 'code128', position: pos, size: q.get('barsize') || 'medium', prefix: q.get('prefix') || '' },
    };
    settings.receiptCodes = codes;
    legacySettings.receiptCodes = codes;
  }
}
// ?line=1.5&word=2&letter=0.5 — Settings → Text spacing, on bills and KOTs.
{
  const q = new URLSearchParams(location.search);
  for (const [param, bill, kot] of [['line', 'receiptLineSpacing', 'kotLineSpacing'], ['word', 'receiptWordSpacing', 'kotWordSpacing'], ['letter', 'receiptLetterSpacing', 'kotLetterSpacing']]) {
    if (q.get(param) != null) { legacySettings[bill] = Number(q.get(param)); legacySettings[kot] = Number(q.get(param)); }
  }
}

/** Every receipt design the POS offers besides the premium ones. */
const LEGACY_DESIGNS = [
  'standard', 'compact-thermal', 'classic', 'modern', 'compact', 'luxury', 'executive', 'royal',
  'bistro', 'heritage', 'metro', 'shahenshah', 'taste-bistro', 'food-palace', 'spice-house',
  'taimoor', 'design1-table', 'design2-box', 'design3-modern', 'design4-compact',
  'design5-delivery', 'sero', 'bero', 'kot-style', 'kot-classic',
];
/** Every kitchen ticket design. */
const KOT_DESIGNS = ['classic', 'bold', 'minimal', 'elegant', 'vip-chef', 'station', 'taimoor1', 'taimoor2', 'dtr-kitchen'];

const MARGIN_LEFT = Number(new URLSearchParams(location.search).get('left') ?? 2);
const MARGIN_RIGHT = Number(new URLSearchParams(location.search).get('right') ?? 2);
const COMPACT = new URLSearchParams(location.search).get('compact') === '1';
const DEPT = new URLSearchParams(location.search).get('dept') === '1';
const REPRINT = new URLSearchParams(location.search).get('reprint') === '1';
const STUB_MODE = new URLSearchParams(location.search).get('stub') || 'piece';

// Stubs in the shape each split mode would really print.
const LAB_STUBS =
  STUB_MODE === 'department'
    ? [
        { departmentName: 'Sajji', qty: 6 },
        { departmentName: 'Tandoor', qty: 4 },
      ]
    : STUB_MODE === 'item'
      ? [
          { departmentName: 'Sajji', itemName: 'Sajji Full', qty: 6 },
          { departmentName: 'Tandoor', itemName: 'Plain Naan', qty: 4 },
        ]
      : [
          ...[1, 2, 3, 4, 5, 6].map(i => ({
            departmentName: 'Sajji', itemName: 'Sajji Full', qty: 1, index: i, ofTotal: 6,
          })),
          ...[1, 2].map(i => ({
            departmentName: 'Tandoor', itemName: 'Plain Naan', qty: 1, index: i, ofTotal: 2,
          })),
        ];

interface Slip { id: string; label: string; kind: 'receipt' | 'token' | 'report' | 'design' | 'kot' }

// ---- report slips: realistic numbers plus the worst cases a shop produces
const rm = (n: number) => reportMoney(n, 'Rs');
const LONG = 'Chicken Tikka Boneless Handi Special Family Size with Extra Cheese';
const shiftData: any = {
  settings: { ...settings, currencySymbol: 'Rs', countryTaxLabel: 'GST' },
  range: { from: new Date('2026-09-23T09:00:00'), to: new Date('2026-09-23T23:45:00'), label: '14h 45m', staffName: 'Muhammad Abdullah Khan (Cashier)' },
  summary: { productAmount: 1234567.5, discount: 12500, serviceCharge: 4500, temporaryCharge: 0, rounding: -0.5, subTotal: 1226567, refundAmount: 3200, actualSales: 1223367 },
  tax: { taxable: 1100000, taxPct: 16, taxAmount: 176000 },
  transactions: { checkedOut: 412, avgIncome: 2969.34, soldProducts: 1893, refunded: 2, refundedProducts: 5 },
  drawer: { startingCash: 20000, orderIncome: 845210, payIn: 0, refund: 3200, payOut: 0, expectedCash: 865210, actualEndingCash: 865000 },
  payments: [
    { method: 'cash', amount: 845210, percent: 69.09 },
    { method: 'jazzcash', amount: 210000, percent: 17.17 },
    { method: 'bank transfer (meezan)', amount: 168157, percent: 13.74 },
  ],
  payTotal: 1223367,
  types: [{ type: 'dining', orders: 201, amount: 700000 }, { type: 'takeaway', orders: 150, amount: 400000 }, { type: 'delivery', orders: 61, amount: 123367 }],
  categories: [{ name: 'BBQ & Grill Specials (Charcoal)', qty: 512, amount: 612000 }, { name: 'Drinks', qty: 800, amount: 96000 }],
  products: [{ name: LONG, qty: 48, amount: 1234560 }, { name: 'Plain Naan', qty: 900, amount: 45000 }],
  totals: { catQty: 1312, catAmt: 708000 },
};
const REPORTS: Record<string, ThermalReportDoc> = {
  'report-pos-summary': {
    title: 'Sales Summary',
    meta: [['From', '23 Sep 2026, 09:00'], ['To', '23 Sep 2026, 23:59'], ['Branch', 'Satellite Town Main Branch (Jhang)'], ['Cashier', 'All cashiers']],
    blocks: [
      { kind: 'section', title: 'Sales' },
      { kind: 'table', head: ['Order type', 'Orders', 'Amount'], rows: [['Dine-In', '201', rm(700000)], ['Takeaway', '150', rm(400000)], ['Delivery', '61', rm(123367.5)]], foot: ['Total', '412', rm(1223367.5)] },
      { kind: 'section', title: 'Payments' },
      { kind: 'table', head: ['Method', 'Amount'], rows: [['CASH', rm(845210)], ['JAZZCASH', rm(210000)], ['BANK TRANSFER (MEEZAN BANK SATELLITE TOWN)', rm(168157.5)]] },
      { kind: 'total', label: 'TOTAL SALES', value: rm(12233670.5) },
      { kind: 'section', title: 'Other bills' },
      { kind: 'table', head: ['Status', 'Bills', 'Amount'], rows: [['Unpaid (running)', '3', rm(4500)], ['Void', '1', rm(1200)]] },
    ],
    footer: 'Follow us on Facebook: /lotuscafe',
  },
  'report-pos-detailed': {
    title: 'Sales Report (Detailed)',
    meta: [['From', '23 Sep 2026, 09:00'], ['To', '23 Sep 2026, 23:59']],
    blocks: [
      { kind: 'total', label: 'TOTAL SALES', value: rm(5400) },
      { kind: 'section', title: 'Paid orders (2)' },
      { kind: 'entry', title: '#1107 DINING', value: rm(3200), lines: ['Walk-in', 'Payment: CASH · Cash drawer', '23 Sep 2026, 13:05'] },
      { kind: 'entry', title: '#1108 DELIVERY', value: rm(2200), lines: ['Muhammad Abdullah Khan · 0300-7623533', 'Payment: BANK TRANSFER · Meezan Bank Satellite Town Branch Account', '23 Sep 2026, 13:40'] },
    ],
  },
  'report-shift': shiftReportDoc(shiftData),
  'report-grn': {
    title: 'Goods Receiving Note',
    meta: [['GRN No.', 'MFDE8K2A9X1'], ['Date', '23 Sep 2026, 10:15'], ['Supplier', 'Al-Madina Poultry & Meat Suppliers (Wholesale)']],
    blocks: [
      { kind: 'section', title: 'Item received' },
      { kind: 'row', label: 'Item', value: 'Chicken Boneless Breast Fillet', bold: true },
      { kind: 'row', label: 'Quantity', value: '25 kg' },
      { kind: 'row', label: 'Rate', value: `${rm(1250)} / kg` },
      { kind: 'row', label: 'Subtotal', value: rm(31250) },
      { kind: 'row', label: 'Surcharge', value: rm(500) },
      { kind: 'total', label: 'TOTAL', value: rm(31750) },
      { kind: 'rule' },
      { kind: 'row', label: 'Received by', value: 'Store Keeper' },
      { kind: 'row', label: 'Signature', value: '________________' },
    ],
  },
  'report-statement': {
    title: 'Supplier Statement',
    meta: [['Name', 'Al-Madina Poultry & Meat Suppliers'], ['Phone', '0300-1234567'], ['Address', 'Shop 12, Grain Market, Jhang Saddar']],
    blocks: [
      { kind: 'row', label: 'Opening balance', value: rm(0) },
      { kind: 'section', title: 'Ledger (2)' },
      { kind: 'table', head: ['Date / detail', 'Debit', 'Credit'], rows: [['01 Sep 26 Payment by cheque no. 00451278 (Meezan)', reportMoney(150000, ''), ''], ['05 Sep 26 Purchase', '', '1,234,567.50']], foot: ['Total', '150,000', '1,234,567.50'] },
      { kind: 'total', label: 'BALANCE (WE OWE)', value: rm(1084567.5) },
    ],
  },
};

const SLIPS: Slip[] = [
  ...PREMIUM_TEMPLATES.map(t => ({ id: t.id, label: t.name, kind: 'receipt' as const })),
  ...LEGACY_DESIGNS.map(d => ({ id: `design-${d}`, label: `Receipt · ${d}`, kind: 'design' as const })),
  ...KOT_DESIGNS.map(d => ({ id: `kot-${d}`, label: `KOT · ${d}`, kind: 'kot' as const })),
  ...TOKEN_TEMPLATES.map(t => ({ id: `token-${t.id}`, label: `Token · ${t.name}`, kind: 'token' as const })),
  ...Object.keys(REPORTS).map(id => ({ id, label: `Report · ${REPORTS[id].title}`, kind: 'report' as const })),
];

const PAPER = (new URLSearchParams(location.search).get('paper') === '58mm' ? '58mm' : '80mm') as '58mm' | '80mm';
const geom = resolvePrintGeometry({ paper: PAPER, leftMm: MARGIN_LEFT, rightMm: MARGIN_RIGHT });
settings.paperSize = PAPER;
legacySettings.paperSize = PAPER;

function Slips() {
  const ready = useRef(false);
  useEffect(() => {
    if (ready.current) return;
    ready.current = true;
    // Give React a frame to commit every portal before the simulator reads them.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      (window as any).__printLabReady = true;
    }));
  }, []);

  return (
    <>
      {/* The classic designs and KOTs print from the portal their own
          component creates — exactly the node the POS hands to fastPrint. */}
      <div style={{ display: 'none' }}>
        {LEGACY_DESIGNS.map(d => (
          <ReceiptPreview key={`r-${d}`} order={order} settings={{ ...legacySettings, receiptDesign: d }} showPrintButton={false} />
        ))}
        {KOT_DESIGNS.map(d => (
          <KitchenReceipt key={`k-${d}`} order={order} settings={{ ...legacySettings, kotDesign: d }} showPrintButton={false} />
        ))}
      </div>
      {SLIPS.filter(slip => slip.kind !== 'design' && slip.kind !== 'kot').map(slip => createPortal(
        <div
          className="receipt-print-portal"
          data-slip={slip.id}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, visibility: 'hidden' }}
        >
          <div
            className="print-receipt bg-white text-black"
            data-paper-size={PAPER}
            style={{ width: `${geom.contentMm}mm`, background: '#fff', color: '#000' }}
          >
            {slip.kind === 'report' ? (
              <div dangerouslySetInnerHTML={{ __html: thermalReportHtml(REPORTS[slip.id], settings) }} />
            ) : slip.kind === 'receipt' ? (
              // As ReceiptPreview wraps every design (QR & barcode slots).
              <ReceiptCodesProvider order={order} settings={settings}>
                <ReceiptCodesSlot position="above" />
                <PremiumReceipt
                  order={order}
                  settings={settings}
                  templateId={slip.id as any}
                  customization={loadCustomization(slip.id as any)}
                />
                <ReceiptCodesSlot position="below" />
              </ReceiptCodesProvider>
            ) : (
              <div
                style={{ fontFamily: "'Lucida Console','Consolas','Courier New',monospace", fontWeight: 700 }}
                dangerouslySetInnerHTML={{
                  __html: tokenSlipInnerHtml(
                    {
                      orderNumber: PDF_MODE ? 27 : 6,
                      billNumber: PDF_MODE ? 27 : 1107,
                      orderType: PDF_MODE ? 'takeaway' : undefined,
                      customerName: PDF_MODE ? 'Ahmed Khan' : undefined,
                      items: PDF_MODE
                        ? [
                            { name: 'Zinger Burger', qty: 2, amount: 900, note: 'Extra mayo' },
                            { name: '\u0686\u06A9\u0646 \u0628\u0631\u06CC\u0627\u0646\u06CC (Special)', qty: 1, amount: 450 },
                            { name: 'French Fries', qty: 1, amount: 250 },
                            { name: 'Cold Drink 500ml', qty: 3, amount: 360 },
                          ]
                        : [{ name: '1.5 Liter Drink', qty: 1 }, { name: 'Chicken Biryani', qty: 2 }],
                      restaurantName: settings.name,
                      tableName: PDF_MODE ? undefined : '5',
                      when: new Date(),
                      reprint: REPRINT,
                      departments: DEPT ? LAB_STUBS : undefined,
                    },
                    slip.id.replace(/^token-/, '') as any,
                    true,
                  ),
                }}
              />
            )}
          </div>
        </div>,
        document.body,
        slip.id,
      ))}
    </>
  );
}

// ---- simulator API -----------------------------------------------------
(window as any).__printLabSlips = () => SLIPS.map(s => ({ id: s.id, label: s.label }));

/** The HTML the POS would hand to fastPrint for this slip. */
function slipHtml(id: string): string {
  const selector = id.startsWith('design-')
    ? `.receipt-print-portal .print-receipt[data-design="${id.slice('design-'.length)}"]`
    : id.startsWith('kot-')
      ? `.receipt-print-portal .print-receipt[data-kot-design="${id.slice('kot-'.length)}"]`
      : `[data-slip="${id}"]`;
  const node = document.querySelector(selector) as HTMLElement | null;
  if (!node) throw new Error(`no slip ${id}`);
  return node.outerHTML;
}

(window as any).__printLabBuild = (id: string) => {
  const { html, geometry } = buildWorkerDocument({
    html: slipHtml(id),
    paperWidth: PAPER,
    compact: COMPACT,
    marginLeftMm: MARGIN_LEFT,
    marginRightMm: MARGIN_RIGHT,
  }, 'raster');
  return {
    html,
    paperLabel: PAPER,
    marginLeftMm: geometry.leftMm,
    marginRightMm: geometry.rightMm,
    // The worker lays the document out at exactly this CSS width.
    cssWidthPx: Math.round(geometry.contentMm * 3.7795275591),
    darkness: 6,
    bold: false,
  };
};

// Mode-aware build — lets the simulator exercise the driver/HTML fallback
// path as well as the raster path. Both must satisfy the equal-margin rule.
(window as any).__printLabBuildMode = (id: string, mode: 'raster' | 'html') => {
  const { html, geometry } = buildWorkerDocument({
    html: slipHtml(id),
    paperWidth: PAPER,
    compact: COMPACT,
    marginLeftMm: MARGIN_LEFT,
    marginRightMm: MARGIN_RIGHT,
  }, mode);
  return { html, paperLabel: PAPER, marginLeftMm: geometry.leftMm, marginRightMm: geometry.rightMm };
};

createRoot(document.getElementById('root')!).render(<Slips />);
