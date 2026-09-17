// ============================================================
// Restaurant-level printer settings.
// Offline-first: persisted to localStorage (and the cloud when
// configured, for multi-device sync). This ensures added printers
// survive app restart even without cloud/tenant.
// ============================================================
import { doc, getDoc, setDoc, onSnapshot, Unsubscribe } from '@/lib/offlineNoCloud';
import { cloudDb, isCloudConfigured } from './offlineNoCloud';
import { getTenantId } from './tenant';
import type { CloudPrintRole } from './cloudPrintJobs';

type Unsub = Unsubscribe | (() => void);

const LOCAL_KEY = 'dtpos-printer-settings-v1';

export type PrinterConnection = 'system' | 'lan' | 'bluetooth';

export interface PrinterConfig {
  id: string;
  name: string;                 // friendly label
  connection: PrinterConnection; // system (Windows installed) | lan (network IP) | bluetooth
  printerName: string;          // exact Windows printer device name (for system)
  // LAN / network printer (ESC/POS over TCP — usually port 9100)
  lanHost?: string;             // e.g. 192.168.1.50
  lanPort?: number;             // default 9100
  role: CloudPrintRole;         // counter | kitchen | delivery | display
  paperSize: '58mm' | '80mm' | '110mm';
  /**
   * How this printer is driven.
   *  - 'auto'   : rendered template as one RAW ESC/POS job, falling back to
   *               the Windows driver. Keeps the chosen receipt design.
   *  - 'raw'    : text ESC/POS built straight from the order — the fastest
   *               path (no Chromium render at all), but it prints a plain
   *               text slip, not the designed template.
   *  - 'driver' : Windows driver render only; skips the raw attempt.
   */
  printMode?: 'auto' | 'raw' | 'driver';
  printWidthMm?: number;        // optional override
  leftMarginMm: number;
  rightMarginMm: number;
  topFeedMm: number;
  bottomFeedMm: number;
  autoCut: boolean;
  beep: boolean;
  copies: number;
  escposMode: boolean;          // ESC/POS raw mode (forced ON for LAN)
  browserBackup: boolean;       // allow browser fallback when EXE offline
  enabled: boolean;
  /** Fallback print mode when the primary path fails or driver is unknown.
   *  - html   : Electron webContents.print (HTML/CSS rendering via Windows driver)
   *  - escpos : Raw ESC/POS bytes (LAN 9100 or driver passthrough)
   *  - text   : Generic text-only mode (plain UTF-8, no ESC/POS init) — for
   *             stubborn "Generic / Text Only" drivers that swallow raw bytes. */
  fallbackMode?: 'html' | 'escpos' | 'text';
}

export interface PrinterSettingsDoc {
  printers: PrinterConfig[];
  // device assignment override: deviceId -> which printer to use for each role
  deviceAssignments?: Record<string, Partial<Record<CloudPrintRole, string>>>;
  updatedAt?: any;
}

const EMPTY: PrinterSettingsDoc = { printers: [], deviceAssignments: {} };

function ref() {
  const tid = getTenantId();
  if (!tid) throw new Error('No tenant');
  return doc(cloudDb(), 'tenants', tid, 'meta', 'printers');
}

function readLocal(): PrinterSettingsDoc {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return EMPTY;
    const data = JSON.parse(raw) as PrinterSettingsDoc;
    return {
      // Machines deployed before the equal-margin fix still hold the old
      // lopsided 3mm/10mm default on disk, so repairing only the factory
      // default would leave every existing client printing lopsided. The
      // repair is applied on read and persists on the next save.
      printers: repairLegacyMargins(Array.isArray(data.printers) ? data.printers : []),
      deviceAssignments: data.deviceAssignments || {},
    };
  } catch (e) {
    console.warn('[printerSettings] local read failed', e);
    return EMPTY;
  }
}

function writeLocal(data: PrinterSettingsDoc) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      printers: data.printers || [],
      deviceAssignments: data.deviceAssignments || {},
      updatedAt: new Date().toISOString(),
    }));
    // Notify same-tab subscribers (storage event only fires cross-tab)
    try { window.dispatchEvent(new CustomEvent('dtpos-printer-settings-changed')); } catch {}
  } catch (e) {
    throw new Error('Local save failed: ' + ((e as any)?.message || e));
  }
}

export async function loadPrinterSettings(): Promise<PrinterSettingsDoc> {
  // Prefer local (always available, works offline + in EXE).
  const local = readLocal();
  if (local.printers.length > 0) return local;

  // First run — try cloud once and cache locally.
  if (isCloudConfigured() && getTenantId()) {
    try {
      const snap = await getDoc(ref());
      if (snap.exists()) {
        const data = snap.data() as PrinterSettingsDoc;
        const merged = {
          printers: repairLegacyMargins(data.printers || []),
          deviceAssignments: data.deviceAssignments || {},
        };
        try { writeLocal(merged); } catch {}
        return merged;
      }
    } catch (e) {
      console.warn('[printerSettings] cloud load failed, using local', e);
    }
  }
  return local;
}

export async function savePrinterSettings(data: PrinterSettingsDoc) {
  // ALWAYS persist locally so it survives restart even offline.
  writeLocal(data);

  // Offline build: printer settings stay on this device.
  if (isCloudConfigured() && getTenantId()) {
    try {
      await setDoc(ref(), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('[printerSettings] cloud save failed (local saved OK)', e);
    }
  }
}

export function subscribePrinterSettings(
  handler: (data: PrinterSettingsDoc) => void,
): Unsub {
  // Emit initial local snapshot immediately.
  handler(readLocal());

  const onLocalChange = () => handler(readLocal());
  window.addEventListener('dtpos-printer-settings-changed', onLocalChange);
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_KEY) onLocalChange();
  });

  let cloudUnsub: Unsubscribe | null = null;
  if (isCloudConfigured() && getTenantId()) {
    try {
      cloudUnsub = onSnapshot(ref(), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as PrinterSettingsDoc;
        const merged = {
          printers: repairLegacyMargins(data.printers || []),
          deviceAssignments: data.deviceAssignments || {},
        };
        try { writeLocal(merged); } catch {}
        handler(merged);
      }, (err) => { console.warn('[printerSettings] snapshot error', err); });
    } catch (e) {
      console.warn('[printerSettings] subscribe failed', e);
    }
  }

  return () => {
    window.removeEventListener('dtpos-printer-settings-changed', onLocalChange);
    if (cloudUnsub) try { cloudUnsub(); } catch {}
  };
}

/**
 * Equal side margins, in mm, for a newly added printer.
 *
 * Zero, because the thermal head already cannot mark roughly 4mm of each
 * edge — that inset IS the visible blank band, on every 80mm slip. Adding
 * more only narrows the printable content, and it was what made the raw slip
 * come out narrower than the same bill printed through the Windows driver.
 */
export const DEFAULT_SIDE_MARGIN_MM = 0;

/**
 * One-time flag for the equal-margin repair.
 *
 * The first attempt at this repair only touched the EXACT 3mm/10mm pair the
 * old default shipped, on the reasoning that any other pair must be a
 * deliberate calibration. Real paper disproved that: deployed machines carried
 * all sorts of asymmetric pairs, inherited from older builds and from the
 * device-level margins, and every one of them printed lopsided on every slip.
 *
 * So the repair now equalises ANY asymmetric pair — but exactly once, behind
 * this flag. After it has run, a shop that deliberately calibrates its printer
 * to 4mm/1mm keeps those numbers for good, because the repair never looks
 * again. That is the difference between fixing a bad default and overriding
 * the user.
 */
const MARGIN_REPAIR_FLAG = 'dtpos-printer-margins-equalised-v1';

function repairAlreadyDone(): boolean {
  try { return localStorage.getItem(MARGIN_REPAIR_FLAG) === '1'; } catch { return false; }
}

function markRepairDone(): void {
  try { localStorage.setItem(MARGIN_REPAIR_FLAG, '1'); } catch { /* best effort */ }
}

/** How far apart the two side margins may be before it counts as lopsided. */
const MARGIN_TOLERANCE_MM = 0.05;

/**
 * Equalise printers carrying asymmetric side margins, once per machine.
 *
 * Runs on load so a client that never opens Printer Settings is still fixed
 * by simply installing the update.
 */
export function repairLegacyMargins(printers: PrinterConfig[]): PrinterConfig[] {
  if (!printers.length || repairAlreadyDone()) return printers;

  let changed = false;
  const out = printers.map((p) => {
    const left = Number(p.leftMarginMm) || 0;
    const right = Number(p.rightMarginMm) || 0;
    if (Math.abs(left - right) <= MARGIN_TOLERANCE_MM) return p;
    changed = true;
    // Take the SMALLER of the two: it is the one the shop actually wanted,
    // and the larger side is the inflated one that produced the wide band.
    // Never widen a slip's margins while repairing them.
    const side = Math.max(0, Math.min(left, right));
    return { ...p, leftMarginMm: side, rightMarginMm: side };
  });

  if (!changed) {
    // Nothing to write, but the pass is done: record it so an intentional
    // asymmetric calibration made later is never re-centred.
    markRepairDone();
    return printers;
  }

  // ===== PERSIST BEFORE MARKING DONE =====
  // This is the defect that let the wide right margin survive the fix and
  // reach the client's paper a second time. The repair ran on read, marked
  // itself done, and returned the corrected list IN MEMORY without ever
  // writing it back. The very next read saw the flag, skipped the repair and
  // handed out the original lopsided values again — so the fix held for one
  // read and then undid itself.
  //
  // The flag is only set once the corrected values are actually on disk. If
  // the write fails the flag stays clear and the repair is retried next time,
  // which is the safe direction to fail in.
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const existing = raw ? JSON.parse(raw) : {};
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      ...existing,
      printers: out,
      updatedAt: new Date().toISOString(),
    }));
    markRepairDone();
    try { window.dispatchEvent(new CustomEvent('dtpos-printer-settings-changed')); } catch { /* no window in tests */ }
  } catch (e) {
    console.warn('[printerSettings] margin repair could not be persisted; it will run again', e);
  }

  return out;
}

/** Force one printer's side margins equal, for the Printer Settings action. */
export function equalisePrinterMargins(p: PrinterConfig, mm = DEFAULT_SIDE_MARGIN_MM): PrinterConfig {
  const side = Math.max(0, Math.min(20, Math.round((Number(mm) || 0) * 10) / 10));
  return { ...p, leftMarginMm: side, rightMarginMm: side };
}

export function defaultPrinterConfig(): PrinterConfig {
  return {
    id: `prn_${Date.now().toString(36)}`,
    name: 'New Printer',
    connection: 'system',
    printerName: '',
    lanHost: '',
    lanPort: 9100,
    role: 'counter',
    paperSize: '80mm',
    printMode: 'auto',
    // ===== EQUAL BY DEFAULT =====
    // These shipped as left 3mm / right 10mm — a built-in 7mm asymmetry on
    // every printer anyone added. ReceiptPreview feeds them straight into the
    // print path as marginLeftMm/marginRightMm, so the slip printed tight to
    // the left with a wide blank band down the right: the reported fault,
    // configured rather than computed. A calibration the user sets by hand is
    // still honoured; only the default is equal now.
    leftMarginMm: DEFAULT_SIDE_MARGIN_MM,
    rightMarginMm: DEFAULT_SIDE_MARGIN_MM,
    topFeedMm: 0,
    bottomFeedMm: 0,
    autoCut: true,
    beep: false,
    copies: 1,
    escposMode: false,
    browserBackup: true,
    enabled: true,
    fallbackMode: 'html',
  };
}

/** Pick the best printer for a given role using device override -> first enabled match. */
export function resolvePrinterForRole(
  settings: PrinterSettingsDoc,
  role: CloudPrintRole,
  deviceId?: string,
): PrinterConfig | undefined {
  const printers = settings.printers.filter((p) => p.enabled);
  if (deviceId) {
    const override = settings.deviceAssignments?.[deviceId]?.[role];
    if (override) {
      const found = printers.find((p) => p.id === override);
      if (found) return found;
    }
  }
  return printers.find((p) => p.role === role) || printers.find((p) => p.role === 'counter');
}

// ===== Local "Print Server" toggle (device-level) =====
// Only the device(s) with this flag will claim & print cloud jobs.
const PRINT_SERVER_KEY = 'dtpos-print-server-enabled';
const PRINT_SERVER_DEFAULTED_KEY = 'dtpos-print-server-defaulted';

export function isPrintServerEnabled(): boolean {
  try {
    // Phase-1: default ON on Electron (recommended silent-print mode).
    // Only auto-enable the first time, so the user can toggle it explicitly afterwards.
    const isElectronEnv = typeof window !== 'undefined' && !!(window as any).electronAPI;
    if (isElectronEnv && !localStorage.getItem(PRINT_SERVER_DEFAULTED_KEY)) {
      localStorage.setItem(PRINT_SERVER_KEY, '1');
      localStorage.setItem(PRINT_SERVER_DEFAULTED_KEY, '1');
    }
    return localStorage.getItem(PRINT_SERVER_KEY) === '1';
  } catch { return false; }
}
export function setPrintServerEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(PRINT_SERVER_KEY, '1');
    else localStorage.removeItem(PRINT_SERVER_KEY);
    localStorage.setItem(PRINT_SERVER_DEFAULTED_KEY, '1');
    window.dispatchEvent(new CustomEvent('dtpos-print-server-changed'));
  } catch {}
}

/** Clear all locally-saved printer configuration (device-level).
 *  Use this when Windows drivers get re-installed or old duplicate
 *  printer entries need to be wiped. */
export function resetLocalPrinterConfig() {
  try {
    localStorage.removeItem(LOCAL_KEY);
    try { window.dispatchEvent(new CustomEvent('dtpos-printer-settings-changed')); } catch {}
  } catch {}
}
