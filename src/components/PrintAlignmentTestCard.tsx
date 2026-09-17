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
import { loadPrintMargins, equaliseSideMargins } from '@/lib/printMargins';
import { loadPrinterSettings, savePrinterSettings, resolvePrinterForRole, equalisePrinterMargins, type PrinterConfig } from '@/lib/printerSettings';
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

  const [marginTick, setMarginTick] = useState(0);
  // Re-read after an equalise so the panel and the slip agree immediately.
  const device = useMemo(() => { void marginTick; return loadPrintMargins(); }, [marginTick]);
  const leftMm = counter?.leftMarginMm ?? device.left;
  const rightMm = counter?.rightMarginMm ?? device.right;
  // Which of the two stores is actually in force, printed on the slip.
  const marginSource = counter?.leftMarginMm != null ? `printer: ${counter.name || counter.printerName || 'counter'}` : 'device settings';
  const unequal = Math.abs(leftMm - rightMm) > 0.05;
  const contentWidthMm = counter?.printWidthMm || device.contentWidthMm || undefined;

  const layout = useMemo(
    () => resolveReceiptLayout({ paper, leftMm, rightMm, contentWidthMm }),
    [paper, leftMm, rightMm, contentWidthMm],
  );
  const gaps = expectedMargins(layout, 'html');

  const rawAvailable = !!(window as any).electronAPI?.printRaw;

  /**
   * Force both stores equal. A machine can hold an asymmetric pair in the
   * printer's own configuration OR in this device's settings, and the shop
   * should not have to work out which one is in force — so both are set.
   */
  const equaliseNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const side = Math.max(0, Math.min(leftMm, rightMm));
      equaliseSideMargins(side);
      if (counter) {
        const all = await loadPrinterSettings();
        const next = {
          ...all,
          printers: all.printers.map(p => (p.id === counter.id ? equalisePrinterMargins(p, side) : p)),
        };
        await savePrinterSettings(next);
        setCounter(equalisePrinterMargins(counter, side));
      }
      setMarginTick(t => t + 1);
      toast.success(`Margins set to ${side} mm on both sides. Print the alignment slip again to confirm.`);
    } catch (e: any) {
      toast.error(`Could not update the margins: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Nudge both side margins together, in 0.5mm steps.
   *
   * Together, not separately: a shop tuning this is deciding how much blank
   * paper it wants on each edge, and letting the two drift apart is what
   * produced the lopsided slips in the first place. A genuine per-machine
   * head offset is a different setting, on the calibration screen.
   */
  const nudge = async (delta: number) => {
    if (busy) return;
    const next = Math.max(0, Math.min(20, Math.round((Math.min(leftMm, rightMm) + delta) * 10) / 10));
    setBusy(true);
    try {
      equaliseSideMargins(next);
      if (counter) {
        const all = await loadPrinterSettings();
        await savePrinterSettings({
          ...all,
          printers: all.printers.map(p => (p.id === counter.id ? equalisePrinterMargins(p, next) : p)),
        });
        setCounter(equalisePrinterMargins(counter, next));
      }
      setMarginTick(t => t + 1);
    } catch (e: any) {
      toast.error(`Could not update the margins: ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  };

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
          strategy: 'raw-escpos', printerName, marginSource,
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

  const lines = alignmentTestLines({ paper, leftMm, rightMm, contentWidthMm, strategy: 'windows-driver', marginSource });

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

      {unequal && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs">
            This printer's margins are <b>not equal</b> ({leftMm} mm left vs {rightMm} mm right),
            so the slip will print off-centre. The values are coming from{' '}
            <b>{marginSource}</b>.
          </p>
          <Button size="sm" onClick={equaliseNow} disabled={busy}>
            Make margins equal
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Side margins (both edges)</Label>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => nudge(-0.5)}>-0.5 mm</Button>
          <span className="font-mono text-sm w-20 text-center">{Math.min(leftMm, rightMm)} mm</span>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => nudge(0.5)}>+0.5 mm</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => nudge(-99)}>Full width</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          0&nbsp;mm uses everything the head can mark — the paper's own unprintable
          edge (about {((layout.paperMm - layout.printableMm) / 2).toFixed(1)}&nbsp;mm a side on
          this profile) is already the visible margin. Print the slip after each change.
        </p>
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
