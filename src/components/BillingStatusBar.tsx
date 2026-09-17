// ============================================================
// Billing Status Bar — Phase-3
// Thin floating pill (top-right of POS screen) showing:
//   Cloud sync · Print Mode · Printer Status
// Plus a one-time warning for Browser Print Mode.
// ============================================================
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, Printer, Server, Globe, AlertTriangle, X } from 'lucide-react';
import { onSyncStatus } from '@/lib/store';
import { isElectron } from '@/lib/electron';
import { APP_NAME, APP_VERSION, getInstalledVersion } from '@/lib/version';
import {
  isPrintServerEnabled,
  subscribePrinterSettings,
  resolvePrinterForRole,
  type PrinterSettingsDoc,
} from '@/lib/printerSettings';
import { getDeviceId } from '@/lib/tenant';
import PrintFailureBadge from '@/components/PrintFailureBadge';
import CloudStatusPill from '@/components/CloudStatusPill';

const WARNING_DISMISSED_KEY = 'dtpos-browser-warning-dismissed';

export default function BillingStatusBar() {
  const [sync, setSync] = useState<{ online: boolean; pending: number; lastError?: string }>({ online: true, pending: 0 });
  const [settings, setSettings] = useState<PrinterSettingsDoc>({ printers: [], deviceAssignments: {} });
  const [, force] = useState(0);
  const [appVer, setAppVer] = useState(APP_VERSION);
  useEffect(() => { getInstalledVersion().then(setAppVer).catch(() => {}); }, []);
  const [warningDismissed, setWarningDismissed] = useState<boolean>(
    () => { try { return localStorage.getItem(WARNING_DISMISSED_KEY) === '1'; } catch { return false; } }
  );

  useEffect(() => onSyncStatus(setSync), []);
  useEffect(() => subscribePrinterSettings(setSettings), []);
  useEffect(() => {
    const h = () => force(x => x + 1);
    window.addEventListener('dtpos-print-server-changed', h);
    return () => window.removeEventListener('dtpos-print-server-changed', h);
  }, []);

  const electron = isElectron();
  const silent = electron && isPrintServerEnabled();
  const counter = resolvePrinterForRole(settings, 'counter', getDeviceId());
  const kitchen = resolvePrinterForRole(settings, 'kitchen', getDeviceId());
  const printerReady = !!(counter && counter.printerName) && !!kitchen;

  // Sync pill
  let syncPill: { Icon: any; label: string; cls: string };
  if (!sync.online) syncPill = { Icon: CloudOff, label: 'Offline', cls: 'text-amber-700 bg-amber-50 border-amber-200' };
  else if (sync.pending > 0) syncPill = { Icon: Loader2, label: `Syncing (${sync.pending})`, cls: 'text-blue-700 bg-blue-50 border-blue-200' };
  else syncPill = { Icon: Cloud, label: 'Online', cls: 'text-green-700 bg-green-50 border-green-200' };

  // Print mode pill
  const modePill = silent
    ? { Icon: Server, label: 'Silent', cls: 'text-green-700 bg-green-50 border-green-200' }
    : electron
      ? { Icon: Printer, label: 'Manual', cls: 'text-blue-700 bg-blue-50 border-blue-200' }
      : { Icon: Globe, label: 'Browser', cls: 'text-amber-700 bg-amber-50 border-amber-200' };

  // Printer status pill
  const printerPill = printerReady
    ? { Icon: Printer, label: 'Ready', cls: 'text-green-700 bg-green-50 border-green-200' }
    : { Icon: Printer, label: 'Check Setup', cls: 'text-amber-700 bg-amber-50 border-amber-200' };

  function dismissWarning() {
    try { localStorage.setItem(WARNING_DISMISSED_KEY, '1'); } catch {}
    setWarningDismissed(true);
  }

  const showWarning = !electron && !warningDismissed;

  return (
    <>
      {/* Status pill row — inline next to header bell, no longer hidden behind cart */}
      <div className="flex items-center gap-1.5">
        {/* Shows only when slips are stuck — bills are already saved. */}
        <PrintFailureBadge />
        <CloudStatusPill />
        <Pill {...printerPill} title="Printer Status" />
        <span
          title="App version"
          className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold text-slate-700 bg-slate-50 border-slate-200"
        >
          {APP_NAME} v{appVer}
        </span>
      </div>

    </>
  );
}

function Pill({ Icon, label, cls, title }: { Icon: any; label: string; cls: string; title: string }) {
  const spin = label.startsWith('Syncing');
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}
      style={{ pointerEvents: 'auto' }}
    >
      <Icon className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}
