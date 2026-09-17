// ============================================================
// System Readiness Check Card
// Ek-nazar overview: silent print on? kitchen/receipt printer
// assigned? last print times? pending print jobs? Plus quick
// print verification buttons (Kitchen / Receipt / Delivery).
// ============================================================
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Activity, Printer, ChefHat, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { isElectron, printReceiptNative } from '@/lib/electron';
import {
  isPrintServerEnabled,
  subscribePrinterSettings,
  resolvePrinterForRole,
  type PrinterSettingsDoc,
  type PrinterConfig,
} from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';
import {
  getPrintQueue,
  onPrintQueueChange,
} from '@/lib/printQueue';
import { beginThermalPrintDomSession, waitForThermalPrintLayout } from '@/lib/thermal-print';

function Row({ ok, label, value }: { ok: boolean; label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-amber-600" />
        )}
        <span>{label}</span>
      </div>
      <span className={`text-xs font-medium ${ok ? 'text-green-700' : 'text-amber-700'}`}>
        {value ?? (ok ? 'OK' : 'Not set')}
      </span>
    </div>
  );
}

export default function DemoHealthCheckCard() {
  const [settings, setSettings] = useState<PrinterSettingsDoc>({ printers: [], deviceAssignments: {} });
  const [, force] = useState(0);

  useEffect(() => {
    const unsub = subscribePrinterSettings(setSettings);
    return () => unsub();
  }, []);

  useEffect(() => {
    const refresh = () => force(x => x + 1);
    const a = onPrintQueueChange(refresh);
    const b = () => refresh();
    window.addEventListener('dtpos-print-server-changed', b);
    return () => { a(); window.removeEventListener('dtpos-print-server-changed', b); };
  }, []);

  const silentOn = isElectron() && isPrintServerEnabled();
  const deviceId = getDeviceId();
  const kitchen = resolvePrinterForRole(settings, 'kitchen', deviceId);
  const counter = resolvePrinterForRole(settings, 'counter', deviceId);
  const delivery = resolvePrinterForRole(settings, 'delivery', deviceId);

  const queue = getPrintQueue();
  const lastKot = queue.filter(j => j.printType === 'kot' && j.printedAt).slice(-1)[0];
  const lastReceipt = queue.filter(j => j.printType === 'receipt' && j.printedAt).slice(-1)[0];
  const pendingFailed = queue.filter(j => j.status === 'failed').length;

  function fmt(t?: string) {
    if (!t) return 'No print yet';
    try { return new Date(t).toLocaleString(); } catch { return t; }
  }

  async function testPrint(role: 'kitchen' | 'counter' | 'delivery', title: string) {
    const printer = role === 'kitchen' ? kitchen : role === 'counter' ? counter : delivery;
    if (!printer) {
      toast.error(`${title}: no printer assigned. Please set it in Printer Role Mapping first.`);
      return;
    }
    if (!isElectron()) {
      // Browser fallback — open native print dialog with a test slip
      const w = window.open('', '_blank', 'width=400,height=600');
      if (!w) return toast.error('Browser ne print window block ki');
      w.document.write(buildTestHtml(title, printer));
      w.document.close();
      setTimeout(() => { w.print(); }, 300);
      return;
    }
    // Electron silent print via the same receipt portal/CSS used by live bills.
    const portal = document.createElement('div');
    portal.className = 'receipt-print-portal';
    portal.setAttribute('data-active-print', 'true');
    // Off-screen — see PrinterSettingsPanel for why this must not sit at 0,0.
    portal.setAttribute('aria-hidden', 'true');
    portal.style.cssText = `position:fixed;left:-10000px;top:0;width:${printer.paperSize};background:#fff;visibility:hidden;`;
    portal.innerHTML = `<div class="print-receipt receipt-root" data-paper-size="${printer.paperSize}" style="font-family:'Courier New',monospace;font-size:13px;font-weight:700;color:#000;background:#fff;">${buildTestSlip(title, printer)}</div>`;
    document.body.appendChild(portal);
    const root = portal.querySelector('.print-receipt') as HTMLElement | null;
    if (root) {
      root.style.setProperty('--dt-print-padding-top', `${Math.max(0, printer.topFeedMm || 0)}mm`);
      root.style.setProperty('--dt-print-padding-right', `${Math.max(0, printer.rightMarginMm || 0)}mm`);
      root.style.setProperty('--dt-print-padding-bottom', `${Math.max(0, printer.bottomFeedMm || 0)}mm`);
      root.style.setProperty('--dt-print-padding-left', `${Math.max(0, printer.leftMarginMm || 0)}mm`);
      root.style.setProperty('--dt-print-offset-top', `${Math.min(0, printer.topFeedMm || 0)}mm`);
      root.style.setProperty('--dt-print-offset-left', `${Math.min(0, printer.leftMarginMm || 0)}mm`);
      root.style.setProperty('--dt-print-offset-right', `${Math.min(0, printer.rightMarginMm || 0)}mm`);
      root.style.setProperty('--dt-print-offset-bottom', `${Math.min(0, printer.bottomFeedMm || 0)}mm`);
      if (printer.printWidthMm) root.style.setProperty('--dt-print-content-width', `${printer.printWidthMm}mm`);
    }
    const cleanup = beginThermalPrintDomSession(root, printer.paperSize, undefined, undefined as any);
    await waitForThermalPrintLayout();
    try {
      const res = await printReceiptNative({
        printerName: printer.printerName,
        silent: true,
        usePrinterDefaultPageSize: true,
        autoCut: printer.autoCut,
        paperLabel: printer.paperSize,
        topFeedMm: printer.topFeedMm,
        bottomFeedMm: printer.bottomFeedMm,
        leftMarginMm: printer.leftMarginMm,
        rightMarginMm: printer.rightMarginMm,
      });
      if (res.success) toast.success(`${title}: test print sent ✓`);
      else toast.error(`${title}: ${res.error || 'failed'}`);
    } finally {
      cleanup();
      setTimeout(() => portal.remove(), 800);
    }
  }

  // Overall readiness status
  let statusLabel = 'Ready for Live Use';
  let statusCls = 'bg-green-100 text-green-800 border-green-300';
  if (!kitchen || !counter) {
    statusLabel = 'Printer Check Required';
    statusCls = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (!silentOn && isElectron()) {
    statusLabel = 'Setup Required';
    statusCls = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (!isElectron()) {
    statusLabel = 'Setup Required';
    statusCls = 'bg-amber-100 text-amber-800 border-amber-300';
  }

  return (
    <Card className="p-4 border-2 border-primary/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> System Readiness Check
        </h3>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusCls}`}>
          {statusLabel}
        </span>
      </div>

      <div className="text-xs font-medium mb-1 text-muted-foreground">Printer Setup Verification</div>
      <div className="space-y-0">
        <Row ok={silentOn} label="Silent Print Active" value={silentOn ? 'ON' : (isElectron() ? 'OFF' : 'Browser mode')} />
        <Row ok={!!kitchen} label="Kitchen Printer Selected" value={kitchen?.name} />
        <Row ok={!!counter} label="Receipt Printer Selected" value={counter?.name} />
        <Row ok={!!delivery} label="Delivery Printer Selected" value={delivery?.name} />
        <Row ok={!!lastKot} label="Last KOT Print" value={fmt(lastKot?.printedAt)} />
        <Row ok={!!lastReceipt} label="Last Receipt Print" value={fmt(lastReceipt?.printedAt)} />
        <Row ok={pendingFailed === 0} label="Pending Print Jobs" value={String(pendingFailed)} />
      </div>

      <div className="mt-4 pt-3 border-t">
        <div className="text-xs font-medium mb-2 text-muted-foreground">Print Verification</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button size="sm" variant="outline" onClick={() => testPrint('kitchen', 'Kitchen KOT')}>
            <ChefHat className="h-4 w-4 mr-1" /> Verify Kitchen KOT
          </Button>
          <Button size="sm" variant="outline" onClick={() => testPrint('counter', 'Customer Receipt')}>
            <Printer className="h-4 w-4 mr-1" /> Verify Receipt
          </Button>
          <Button size="sm" variant="outline" onClick={() => testPrint('delivery', 'Delivery Slip')}>
            <Truck className="h-4 w-4 mr-1" /> Verify Delivery
          </Button>
        </div>
      </div>
    </Card>
  );
}

function buildTestSlip(title: string, p: PrinterConfig): string {
  return `
    <div style="text-align:center;font-weight:bold;font-size:14px;">*** ${title.toUpperCase()} ***</div>
    <div style="text-align:center;">DT POS System Test</div>
    <div style="text-align:center;">Printer: ${p.name}</div>
    <div style="text-align:center;">${new Date().toLocaleString()}</div>
    <div style="border-top:1px dashed #000;margin:6px 0;"></div>
    <div>1x Test Item</div>
    <div>1x Sample Product</div>
    <div style="border-top:1px dashed #000;margin:6px 0;"></div>
    <div style="text-align:center;">Setup OK ✓</div>
    <div style="height:8mm;"></div>`;
}

function buildTestHtml(title: string, p: PrinterConfig): string {
  return `<!doctype html><html><head><meta charset="utf-8">
    <style>@page{size:${p.paperSize} auto;margin:0;}body{font-family:'Courier New',monospace;font-size:12px;padding:4mm;width:${p.paperSize};}</style>
    </head><body>${buildTestSlip(title, p)}</body></html>`;
}
