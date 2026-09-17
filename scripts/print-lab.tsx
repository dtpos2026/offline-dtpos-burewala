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
import PremiumReceipt from '@/components/PremiumReceipt';
import { PREMIUM_TEMPLATES, loadCustomization } from '@/lib/premiumReceiptTemplates';
import { buildSampleOrder } from '@/lib/sampleOrder';
import { buildWorkerDocument } from '@/printing/fastPrint';
import { tokenSlipInnerHtml, TOKEN_TEMPLATES } from '@/lib/tokenSlip';
import { resolvePrintGeometry } from '@/printing/printGeometry';

const order = buildSampleOrder();

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

interface Slip { id: string; label: string; kind: 'receipt' | 'token' }

const SLIPS: Slip[] = [
  ...PREMIUM_TEMPLATES.map(t => ({ id: t.id, label: t.name, kind: 'receipt' as const })),
  ...TOKEN_TEMPLATES.map(t => ({ id: `token-${t.id}`, label: `Token · ${t.name}`, kind: 'token' as const })),
];

const geom = resolvePrintGeometry({ paper: '80mm', leftMm: MARGIN_LEFT, rightMm: MARGIN_RIGHT });

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
      {SLIPS.map(slip => createPortal(
        <div
          className="receipt-print-portal"
          data-slip={slip.id}
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, visibility: 'hidden' }}
        >
          <div
            className="print-receipt bg-white text-black"
            data-paper-size="80mm"
            style={{ width: `${geom.contentMm}mm`, background: '#fff', color: '#000' }}
          >
            {slip.kind === 'receipt' ? (
              <PremiumReceipt
                order={order}
                settings={settings}
                templateId={slip.id as any}
                customization={loadCustomization(slip.id as any)}
              />
            ) : (
              <div
                style={{ fontFamily: "'Lucida Console','Consolas','Courier New',monospace", fontWeight: 700 }}
                dangerouslySetInnerHTML={{
                  __html: tokenSlipInnerHtml(
                    {
                      orderNumber: 6,
                      billNumber: 1107,
                      items: [{ name: '1.5 Liter Drink', qty: 1 }, { name: 'Chicken Biryani', qty: 2 }],
                      restaurantName: settings.name,
                      tableName: '5',
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

(window as any).__printLabBuild = (id: string) => {
  const portal = document.querySelector(`[data-slip="${id}"]`) as HTMLElement | null;
  if (!portal) throw new Error(`no slip ${id}`);
  const { html, geometry } = buildWorkerDocument({
    html: portal.outerHTML,
    paperWidth: '80mm',
    compact: COMPACT,
    marginLeftMm: MARGIN_LEFT,
    marginRightMm: MARGIN_RIGHT,
  }, 'raster');
  return {
    html,
    paperLabel: '80mm',
    marginLeftMm: geometry.leftMm,
    marginRightMm: geometry.rightMm,
    // The worker lays the document out at exactly this CSS width.
    cssWidthPx: Math.round(geometry.contentMm * 3.7795275591),
    darkness: 6,
    bold: false,
  };
};

createRoot(document.getElementById('root')!).render(<Slips />);
