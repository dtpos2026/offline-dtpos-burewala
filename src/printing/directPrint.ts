// ============================================================
// DIRECT PRINT SERVICE (v1.1.2)
// ------------------------------------------------------------
// One layer for EVERY slip: receipt, KOT, token (and anything added
// later). The slip is built as ESC/POS bytes and handed straight to
// the printer:
//
//     POS -> ESC/POS bytes -> printer -> cut
//
// (no HTML, no hidden window, no page-size negotiation, no dialog)
//
// Transports:
//   raw-usb : Windows spooler RAW datatype (installed USB/driver printer)
//   lan     : raw TCP 9100 to a network thermal printer
//
// When neither is available (web browser, non-Windows, or the printer
// is set to a non-ESC/POS device) the caller falls back to the old
// HTML path, so nothing that worked before can break.
// ============================================================
import type { Order, RestaurantSettings } from '@/lib/types';
import { buildReceiptBytes, buildKotBytes, buildTokenBytes, type KotOpts, type TokenData } from './escposBuilder';
import { loadPrinterSettings, resolvePrinterForRole, type PrinterSettingsDoc } from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';
import { ensurePrintAllowedFast } from '@/licensing/printGuard';
import { appendPrintLog } from '@/lib/printLog';

export type DirectSlip = 'receipt' | 'kot' | 'token';

export interface DirectPrintResult {
  success: boolean;
  error?: string;
  transport?: 'raw-usb' | 'lan';
  durationMs?: number;
  printerName?: string;
}

function api(): any {
  return (window as any).electronAPI;
}

// ESC/POS text mode cannot shape Arabic/Urdu glyphs reliably. Let callers use
// the silent HTML worker for these slips, where bundled Nastaleeq fonts render.
const RTL_TEXT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RTL_FONT_RE = /(aseer|sameer|jameel|nastaleeq|urdu)/i;
function containsRtlText(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'string') return RTL_TEXT_RE.test(value);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some(item => containsRtlText(item, seen));
}
function usesRtlFont(settings: Record<string, unknown>): boolean {
  return Object.entries(settings).some(([key, value]) =>
    /font/i.test(key) && typeof value === 'string' && RTL_FONT_RE.test(value),
  );
}

/** Direct (dialog-free, HTML-free) printing possible on this machine? */
export function isDirectPrintAvailable(): boolean {
  return !!api()?.printRaw || !!api()?.printLanEscpos;
}

// ---- printer settings cache (cloud read is done once, kept warm) ----
let psCache: PrinterSettingsDoc | null = null;
let psLoading: Promise<PrinterSettingsDoc | null> | null = null;

export function prewarmDirectPrint() {
  if (psCache || psLoading) return;
  psLoading = loadPrinterSettings()
    .then(d => { psCache = d; return d; })
    .catch(() => null)
    .finally(() => { psLoading = null; });
}

function roleFor(slip: DirectSlip): 'counter' | 'kitchen' {
  return slip === 'receipt' ? 'counter' : 'kitchen';
}

export interface DirectTarget {
  printerName?: string;
  lanHost?: string;
  lanPort?: number;
  copies?: number;
  autoCut?: boolean;
  beep?: boolean;
}

/** Work out where a slip should go, using the same rules as before. */
export function resolveTarget(slip: DirectSlip, settings: any, override?: string): DirectTarget {
  if (override) return { printerName: override };
  const dev = (() => { try { return getDeviceId(); } catch { return undefined; } })();
  if (psCache) {
    const role: any = slip === 'token' ? 'token' : roleFor(slip);
    const cfg: any = resolvePrinterForRole(psCache, role, dev)
      || (slip !== 'receipt' ? resolvePrinterForRole(psCache, 'kitchen', dev) : undefined)
      || resolvePrinterForRole(psCache, 'counter', dev);
    if (cfg) {
      if ((cfg.connection || 'system') === 'lan' && cfg.lanHost) {
        return { lanHost: cfg.lanHost, lanPort: cfg.lanPort || 9100, copies: cfg.copies || 1, autoCut: cfg.autoCut !== false, beep: !!cfg.beep };
      }
      if (cfg.printerName) return { printerName: cfg.printerName, copies: cfg.copies || 1 };
    }
  }
  // legacy settings fallback
  if (slip === 'receipt') return { printerName: settings?.defaultPrinter || settings?.backupPrinter };
  if (slip === 'token') return { printerName: settings?.tokenPrinter || settings?.kotPrinter || settings?.defaultPrinter };
  return { printerName: settings?.kotPrinter || settings?.defaultPrinter };
}

async function send(bytes: number[], target: DirectTarget, copies: number): Promise<DirectPrintResult> {
  const started = Date.now();
  const bridge = api();
  if (target.lanHost && bridge?.printLanEscpos) {
    let last: any = null;
    for (let i = 0; i < copies; i++) {
      last = await bridge.printLanEscpos({ host: target.lanHost, port: target.lanPort || 9100, data: bytes });
      if (!last?.success) break;
    }
    return last?.success
      ? { success: true, transport: 'lan', durationMs: Date.now() - started, printerName: `${target.lanHost}:${target.lanPort || 9100}` }
      : { success: false, error: last?.error || 'network printer did not respond', transport: 'lan', durationMs: Date.now() - started };
  }
  if (bridge?.printRaw) {
    const res = await bridge.printRaw({ printerName: target.printerName, data: bytes, copies });
    return res?.success
      ? { success: true, transport: 'raw-usb', durationMs: Date.now() - started, printerName: target.printerName }
      : { success: false, error: res?.error || 'printer did not accept the job', transport: 'raw-usb', durationMs: Date.now() - started };
  }
  return { success: false, error: 'direct printing unavailable on this device' };
}

export interface DirectPrintArgs {
  slip: DirectSlip;
  order?: Order;
  settings: RestaurantSettings;
  kot?: KotOpts;
  token?: TokenData;
  copies?: number;
  printerOverride?: string;
  billNumber?: string;
}

/**
 * Build + send one slip directly to the printer. Returns as soon as the
 * spooler/socket has taken the bytes, so the cashier can carry on.
 */
export async function printDirect(args: DirectPrintArgs): Promise<DirectPrintResult> {
  const started = Date.now();
  const settings: any = args.settings || {};
  if (settings.directPrintDisabled) return { success: false, error: 'direct printing turned off in settings' };
  if (!isDirectPrintAvailable()) return { success: false, error: 'direct printing unavailable on this device' };
  if (usesRtlFont(settings) || containsRtlText(args.order) || containsRtlText(args.kot) || containsRtlText(args.token)) {
    return { success: false, error: 'rtl-text-requires-rendered-print' };
  }

  const guard = await ensurePrintAllowedFast();
  if (!guard.allowed) return { success: false, error: guard.message || 'Printing is blocked on this device.' };

  let bytes: number[];
  try {
    if (args.slip === 'receipt') {
      if (!args.order) return { success: false, error: 'no order' };
      bytes = buildReceiptBytes(args.order, settings);
    } else if (args.slip === 'kot') {
      if (!args.order) return { success: false, error: 'no order' };
      bytes = buildKotBytes(args.order, settings, args.kot || {});
    } else {
      if (!args.token || !args.token.items?.length) return { success: false, error: 'no token items' };
      bytes = buildTokenBytes(args.token, settings);
    }
  } catch (e: any) {
    return { success: false, error: e?.message || 'could not build the slip' };
  }
  if (bytes.length < 40) return { success: false, error: 'slip is empty — nothing sent to the printer' };

  const target = resolveTarget(args.slip, settings, args.printerOverride);
  const copies = Math.max(1, args.copies || target.copies || 1);
  const res = await send(bytes, target, copies);

  try {
    appendPrintLog({
      billNumber: args.billNumber,
      printerName: res.printerName || target.printerName,
      printType: args.slip === 'kot' ? 'kitchen' : args.slip === 'receipt' ? 'receipt' : 'other',
      status: res.success ? 'success' : 'failed',
      error: res.success ? undefined : res.error,
      ms: Date.now() - started,
    });
  } catch { /* logging is best effort */ }

  return { ...res, durationMs: Date.now() - started };
}

/** Small self-test slip sent through the direct (ESC/POS) path. */
export async function directTestPrint(settings: RestaurantSettings, slip: DirectSlip = 'receipt'): Promise<DirectPrintResult> {
  if (!isDirectPrintAvailable()) return { success: false, error: 'direct printing unavailable on this device' };
  const { EscposDoc } = await import('./escposBuilder');
  const paper: any = (settings as any)?.paperSize === '58mm' ? '58mm' : '80mm';
  const d = new EscposDoc(paper);
  d.center().bold(true).size(2, 2).line('DT POS').size(1, 1);
  d.line('*** DIRECT PRINT TEST ***').bold(false);
  d.line(new Date().toLocaleString());
  d.left().rule();
  d.lr('Sample Item A', '250');
  d.lr('Sample Item B x2', '400');
  d.rule('=');
  d.bold(true).lr('TOTAL', '650').bold(false);
  d.rule();
  d.center().line('If this slip printed and cut,');
  d.line('direct printing is working.');
  d.cut();
  const target = resolveTarget(slip, settings as any);
  return send(d.bytes(), target, 1);
}
