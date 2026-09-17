// ============================================================
// PRINT ALIGNMENT TEST — the calibration slip, printed both ways.
//
// Acceptance test for the equal-margin work. Code and simulators cannot
// settle whether the margins are equal on a given machine; only paper can.
// This prints a slip designed to be measured with a ruler, through whichever
// path the user picks, and records the active profile and strategy ON the
// slip so a photograph of it is self-describing.
//
// Pass condition: the left and right gaps match within about 1mm, and the
// '=' ruler reaches both edges on ONE line. If the ruler wraps, the
// characters-per-line constant for that paper profile is wrong — fix it in
// src/printing/paperProfile.ts, never by shrinking the font.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Ruler } from 'lucide-react';
import { printNode } from '@/printing';
import {
  alignmentTestLines,
  buildAlignmentTestBytes,
  alignmentFontPx,
} from '@/printing/alignmentTest';
import { resolveReceiptLayout, expectedMargins } from '@/printing/receiptLayout';
import { PAPER_PROFILE_LIST, type PaperProfileId } from '@/printing/paperProfile';
import { loadPrintMargins } from '@/lib/printMargins';
import { loadPrinterSettings, resolvePrinterForRole, type PrinterConfig } from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';

type Mode = 'raw' | 'driver';

export default function PrintAlignmentTestCard() {
  const portalRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState<PaperProfileId>('80mm');
  const [counter, setCounter] = useState<PrinterConfig | undefined>();

  // The counter printer decides the paper profile and margins, so the test
  // slip is printed with exactly the geometry a real bill would use.
  useEffect(() => {
    let alive = true;
    loadPrinterSettings()
      .then((s) => {
        if (!alive) return;
        const cfg = resolvePrinterForRole(s, 'counter', getDeviceId());
        setCounter(cfg);
        if (cfg?.paperSize) setPaper(cfg.paperSize as PaperProfileId);
      })
      .catch(() => { /* fall back to the device defaults below */ });
    return () => { alive = false; };
  }, []);

  const device = loadPrintMargins();
  const leftMm = counter?.leftMarginMm ?? device.left;
  const rightMm = counter?.rightMarginMm ?? device.right;
  const contentWidthMm = counter?.printWidthMm || device.contentWidthMm || undefined;

  const layout = useMemo(
    () => resolveReceiptLayout({ paper, leftMm, rightMm, contentWidthMm }),
    [paper, leftMm, rightMm, contentWidthMm],
  );
  const gaps = expectedMargins(layout, 'html');

  const rawAvailable = !!(window as any).electronAPI?.printRaw;

  const run = async (mode: Mode) => {
    if (busy) return;
    setBusy(true);
    try {
      const printerName =
        (counter && (counter.connection || 'system') === 'system' && counter.printerName) ||
        localStorage.getItem('pos-default-printer') ||
        undefined;

      // ---- Raw ESC/POS: bytes straight to the spooler, no render step ----
      if (mode === 'raw') {
        const api: any = (window as any).electronAPI;
        if (!api?.printRaw) {
          toast.error('Raw ESC/POS printing is available in the desktop app on Windows only.');
          return;
        }
        const bytes = buildAlignmentTestBytes({
          paper, leftMm, rightMm, contentWidthMm,
          strategy: 'raw-escpos', printerName,
        });
        const res = await api.printRaw({ printerName, data: bytes, copies: 1 });
        if (res?.success) {
          toast.success(`Alignment slip sent${printerName ? ` to ${printerName}` : ''}. Measure both edges.`);
        } else {
          toast.error(`Raw alignment print failed: ${res?.error || 'unknown error'}`);
        }
        return;
      }

      // ---- Windows driver: the same slip through the HTML path ----
      const el = portalRef.current;
      if (!el) return;
      const res = await printNode(el, {
        paperWidth: paper,
        printerName,
        silent: true,
        copies: 1,
        marginLeftMm: leftMm,
        marginRightMm: rightMm,
        contentWidthMm,
        logType: 'test',
      });
      if (res.success) {
        toast.success(`Alignment slip sent${printerName ? ` to ${printerName}` : ''}. Measure both edges.`);
      } else {
        toast.error(`Alignment print failed: ${res.error || 'unknown error'}`);
      }
    } catch (e: any) {
      toast.error(`Alignment print error: ${e?.message || String(e)}`);
    } finally {
      setTimeout(() => setBusy(false), 600);
    }
  };

  const lines = alignmentTestLines({ paper, leftMm, rightMm, contentWidthMm, strategy: 'windows-driver' });

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Ruler className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold">Print Alignment Test</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Prints a calibration slip. The left and right blank edges must match
            within about 1&nbsp;mm, and the <code>=</code> ruler must reach both
            edges on a single line.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Paper profile</Label>
        <div className="flex flex-wrap gap-2">
          {PAPER_PROFILE_LIST.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={paper === p.id ? 'default' : 'outline'}
              onClick={() => setPaper(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Printable width</span><span className="text-right font-mono">{layout.printableMm} mm · {layout.printableDots} dots</span>
        <span>Content width</span><span className="text-right font-mono">{layout.contentMm} mm · {layout.contentDots} dots</span>
        <span>Characters per line</span><span className="text-right font-mono">{layout.columnsFontA}</span>
        <span>Margins (L / R)</span><span className="text-right font-mono">{layout.leftMm} / {layout.rightMm} mm</span>
        <span>Expected paper gap</span><span className="text-right font-mono">{gaps.leftGapMm} / {gaps.rightGapMm} mm</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('raw')} disabled={busy || !rawAvailable}>
          Print via Raw ESC/POS
        </Button>
        <Button variant="outline" onClick={() => run('driver')} disabled={busy}>
          Print via Windows driver
        </Button>
      </div>
      {!rawAvailable && (
        <p className="text-xs text-muted-foreground">
          Raw ESC/POS printing is available in the desktop app on Windows.
        </p>
      )}

      {/* Hidden portal — the driver path prints this node. */}
      {createPortal(
        <div className="receipt-print-portal" aria-hidden="true" ref={portalRef}>
          <div
            className="print-receipt"
            data-paper-size={paper}
            style={{
              fontFamily: "'Lucida Console','Consolas','Courier New',monospace",
              fontWeight: 700,
              color: '#000',
              background: '#fff',
              whiteSpace: 'pre',
              fontSize: `${alignmentFontPx({ paper, leftMm, rightMm, contentWidthMm })}px`,
              lineHeight: 1.25,
            }}
          >
            {lines.join('\n')}
          </div>
        </div>,
        document.body,
      )}
    </Card>
  );
}
