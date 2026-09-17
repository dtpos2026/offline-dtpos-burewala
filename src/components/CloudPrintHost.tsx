// ============================================================
// CloudPrintHost — invisible background service.
// Runs on the Electron Windows EXE that the restaurant marks as
// "Print Server". Listens to pending cloud printJobs, claims one
// at a time, silently prints to the printer assigned for the job's
// role, and marks printed/failed.
//
// Safety rules:
//  - Only one device per tenant should be enabled as print server
//    (the UI warns; claimJob() is atomic so duplicates still cannot
//     happen even if accidentally enabled on two devices).
//  - Web browser tabs that are NOT print servers do nothing here.
//  - If printer is offline -> markFailed -> reprint button in UI.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  subscribePendingJobs,
  claimJob,
  markCloudJobPrinted,
  markCloudJobFailed,
  isCloudPrintAvailable,
  type CloudPrintJob,
} from '@/lib/cloudPrintJobs';
import {
  subscribePrinterSettings,
  resolvePrinterForRole,
  isPrintServerEnabled,
  type PrinterSettingsDoc,
} from '@/lib/printerSettings';
import { isElectron } from '@/lib/electron';
import { getDeviceId } from '@/lib/tenant';
import { electronPrintReceipt } from '@/printing/electronPrint';

function mm(n: number | undefined) {
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;
  return value;
}

function portalOffsetStyle(printer: any) {
  const top = mm(printer?.topFeedMm);
  const right = mm(printer?.rightMarginMm);
  const bottom = mm(printer?.bottomFeedMm);
  const left = mm(printer?.leftMarginMm);
  return {
    padding: `${Math.max(0, top)}mm ${Math.max(0, right)}mm ${Math.max(0, bottom)}mm ${Math.max(0, left)}mm`,
    topOffset: `${Math.min(0, top)}mm`,
    leftOffset: `${Math.min(0, left) - Math.min(0, right)}mm`,
  };
}

export default function CloudPrintHost() {
  const [enabled, setEnabled] = useState(false);
  const settingsRef = useRef<PrinterSettingsDoc>({ printers: [], deviceAssignments: {} });
  const busyRef = useRef(false);

  // Watch toggle + electron availability
  useEffect(() => {
    const update = () => setEnabled(isElectron() && isPrintServerEnabled() && isCloudPrintAvailable());
    update();
    window.addEventListener('dtpos-print-server-changed', update);
    return () => window.removeEventListener('dtpos-print-server-changed', update);
  }, []);

  // Live printer settings
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribePrinterSettings((s) => { settingsRef.current = s; });
    return () => unsub();
  }, [enabled]);

  // Listen to pending jobs
  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribePendingJobs(async (jobs) => {
      if (busyRef.current) return;
      const next = jobs.find((j) => j.status === 'pending' || j.status === 'failed');
      if (!next) return;
      busyRef.current = true;
      try {
        await processJob(next, settingsRef.current);
      } finally {
        busyRef.current = false;
      }
    });
    return () => unsub();
  }, [enabled]);

  return null;
}

async function processJob(job: CloudPrintJob, settings: PrinterSettingsDoc) {
  const claimed = await claimJob(job.id);
  if (!claimed) return; // someone else got it

  const printer = resolvePrinterForRole(settings, job.role, getDeviceId());
  const printerName = printer?.printerName || undefined;
  const copies = Math.max(1, job.copies || printer?.copies || 1);
  const paperWidth = (printer?.paperSize || job.paperSize || '80mm') as '58mm' | '80mm';

  // ===== LAN / Network printer (ESC/POS over TCP) =====
  if (printer?.connection === 'lan' && printer.lanHost) {
    try {
      const api = (window as any).electronAPI;
      if (!api?.printLanEscpos) throw new Error('LAN print not available (Electron required)');
      const { buildEscposFromHtml } = await import('@/printing/escpos');
      const bytes = buildEscposFromHtml(job.html, {
        paperWidth,
        autoCut: printer.autoCut !== false,
        beep: printer.beep === true,
        topFeedLines: Math.max(0, Math.round(Math.max(0, printer.topFeedMm || 0) / 3)),
        bottomFeedLines: Math.max(3, Math.round(Math.max(0, printer.bottomFeedMm || 0) / 3) + 3),
      });
      for (let i = 0; i < copies; i++) {
        const res = await api.printLanEscpos({
          host: printer.lanHost,
          port: printer.lanPort || 9100,
          data: bytes,
        });
        if (!res.success) throw new Error(res.error || 'LAN print failed');
      }
      await markCloudJobPrinted(job.id);
      return;
    } catch (err: any) {
      await markCloudJobFailed(job.id, err?.message || String(err));
      return;
    }
  }

  // Render HTML into a hidden iframe for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = `${paperWidth === '58mm' ? 58 : 80}mm`;
  iframe.style.height = 'auto';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    const po = portalOffsetStyle(printer);
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8">
      <style>
        @page { size: ${paperWidth} auto; margin: 0; }
        html,body { margin:0; padding:0; width:${paperWidth}; font-family: 'Courier New', monospace; font-size: 12px; }
        body { position:relative; top:${po.topOffset}; left:${po.leftOffset}; padding:${po.padding}; }
      </style></head><body>${job.html}</body></html>`);
    doc.close();

    // Wait for layout / fonts
    await new Promise((r) => setTimeout(r, 500));

    // Print via Electron silent path
    const api = (window as any).electronAPI;
    if (api?.printReceipt && iframe.contentWindow) {
      // We need to print the iframe content, not the main window.
      // Electron's webContents.print on main window prints the whole page,
      // so we use a different approach: copy HTML into a print portal
      // and reuse electronPrintReceipt against main window with portal active.
      // For simplicity here, embed inline into main document as a portal.
      iframe.remove();
      const portal = document.createElement('div');
      portal.className = 'cloud-print-portal';
      portal.setAttribute('data-active-print', 'true');
      portal.style.position = 'fixed';
      portal.style.inset = '0';
      portal.style.background = '#fff';
      portal.style.zIndex = '99999';
      portal.innerHTML = `<style>
        @media print {
          @page { size: ${paperWidth} auto; margin: 0; }
          body * { visibility: hidden !important; }
          .cloud-print-portal, .cloud-print-portal * { visibility: visible !important; }
          .cloud-print-portal { position: fixed !important; left:0; top:0; width:${paperWidth}; }
        }
        .cloud-print-portal { font-family: 'Courier New', monospace; font-size: 12px; width:${paperWidth}; position:relative; top:${po.topOffset}; left:${po.leftOffset}; padding:${po.padding}; }
      </style>${job.html}`;
      document.body.appendChild(portal);
      await new Promise((r) => setTimeout(r, 400));
      const result = await electronPrintReceipt({
        printerName,
        paperWidth,
        copies,
      });
      portal.remove();
      if (!result.success) throw new Error(result.error || 'Print failed');
    } else {
      throw new Error('Electron print API not available');
    }

    await markCloudJobPrinted(job.id);
  } catch (err: any) {
    try { iframe.remove(); } catch {}
    await markCloudJobFailed(job.id, err?.message || String(err));
  }
}
