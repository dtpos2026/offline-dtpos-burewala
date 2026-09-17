// ============================================================
// WEIGHING SCALE SETTINGS — COM port, serial parameters and live test.
//
// Client request (v1.0.38):
//   "We also must indicate which Com port the scale is connected to,
//    for example com3 or com4 port so that the software can communicate
//    by this com port to the scale."
//
// The COM port chosen here is passed to the main process select-serial-port
// handler. The live monitor is provided so that during testing you can see
// exactly what the scale is sending (garbage = baud mismatch).
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Scale, RefreshCw, Link2, Link2Off, RotateCcw, Terminal } from 'lucide-react';
import {
  weightScale,
  loadScaleConfig,
  saveScaleConfig,
  listSerialPorts,
  applyPreferredPort,
  isWebSerialAvailable,
  type ScaleConfig,
  type ScaleReading,
  type ScaleStatus,
  type SerialPortInfo,
} from '@/lib/weightScale';

const isElectronApp = () =>
  typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

export default function WeightScaleSettingsCard() {
  const [cfg, setCfg] = useState<ScaleConfig>(loadScaleConfig());
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<ScaleStatus>(weightScale.status);
  const [statusMsg, setStatusMsg] = useState(weightScale.lastError);
  const connected = status === 'connected';
  const [reading, setReading] = useState<ScaleReading | null>(weightScale.last);
  const [busy, setBusy] = useState(false);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [showMonitor, setShowMonitor] = useState(false);
  const monitorRef = useRef<HTMLDivElement | null>(null);

  const patch = (p: Partial<ScaleConfig>) => {
    const next = saveScaleConfig(p);
    setCfg(next);
    if (p.portPath !== undefined) void applyPreferredPort(next.portPath);
    toast.success('Scale setting saved');
  };

  const refreshPorts = async () => {
    setScanning(true);
    const list = await listSerialPorts();
    setPorts(list);
    setScanning(false);
    if (!list.length) {
      toast.warning(isElectronApp()
        ? 'No COM port found — check the USB-to-RS232 cable and driver'
        : 'COM port list sirf desktop EXE me milti hai');
    } else {
      toast.success(`Found ${list.length} COM port(s)`);
    }
  };

  useEffect(() => {
    void refreshPorts();
    void applyPreferredPort(loadScaleConfig().portPath);
    const offR = weightScale.onReading(setReading);
    const offS = weightScale.onStatus((s, msg) => {
      setStatus(s);
      setStatusMsg(msg || '');
      if (s === 'connected') toast.success(`Scale connected${weightScale.activePort ? ` (${weightScale.activePort})` : ''}`);
      // 'no-data' and 'error' are shown inline below with the full explanation
      // rather than as a toast that scrolls away.
    });
    const offRaw = weightScale.onRaw((line) => {
      setRawLines(prev => [...prev.slice(-60), line]);
    });
    return () => { offR(); offS(); offRaw(); };
  }, []);

  useEffect(() => {
    if (monitorRef.current) monitorRef.current.scrollTop = monitorRef.current.scrollHeight;
  }, [rawLines]);

  const connect = async (forcePrompt = false) => {
    setBusy(true);
    const r = await weightScale.connect(loadScaleConfig(), { forcePrompt });
    setBusy(false);
    if (!r.ok) toast.error(r.error || 'Could not connect to the scale');
  };

  const kg = reading?.kg ?? 0;
  const selWidth = 'border rounded-md px-2 py-1.5 text-xs bg-background';

  return (
    <div className="space-y-3 border rounded-xl p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs font-bold">Weighing Scale (RS232 / COM Port)</p>
            <p className="text-[11px] text-muted-foreground">
              Mettler Toledo Brite, CAS, Avery — all supported
            </p>
          </div>
        </div>
        {/* Honest status. 'no-data' exists because an open COM port is not the
            same thing as a working scale — the old build showed a green
            CONNECTED for a port that never sent a byte. */}
        <span className={`text-[10px] font-bold px-2 py-1 rounded ${
          status === 'connected' ? 'bg-emerald-600 text-white'
          : status === 'no-data' ? 'bg-amber-500 text-white'
          : status === 'error' ? 'bg-destructive text-destructive-foreground'
          : status === 'connecting' ? 'bg-status-info text-white'
          : 'bg-muted text-muted-foreground'
        }`}>
          {status === 'connected' ? `● ${weightScale.activePort || 'CONNECTED'}`
            : status === 'no-data' ? '◐ PORT OPEN — NO DATA'
            : status === 'error' ? '✕ ERROR'
            : status === 'connecting' ? '… CONNECTING'
            : '○ OFFLINE'}
        </span>
      </div>

      {/* ===== COM PORT ===== */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">COM Port</p>
          <p className="text-[11px] text-muted-foreground">
            See Device Manager &gt; Ports (COM &amp; LPT) — e.g. COM3 or COM4
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            className={selWidth}
            value={cfg.portPath}
            onChange={(e) => patch({ portPath: e.target.value })}
          >
            <option value="">Auto (first port)</option>
            {ports.map(p => (
              <option key={p.portName} value={p.portName}>
                {p.portName}{p.displayName ? ` — ${p.displayName.slice(0, 28)}` : ''}
              </option>
            ))}
            {/* Show the saved port even if it is not currently in the list (cable unplugged) */}
            {cfg.portPath && !ports.some(p => p.portName === cfg.portPath) && (
              <option value={cfg.portPath}>{cfg.portPath} (not connected)</option>
            )}
          </select>
          <button
            onClick={refreshPorts}
            disabled={scanning}
            title="Re-scan the port list"
            className="px-2 py-1.5 rounded-md border bg-background hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ===== SERIAL PARAMETERS ===== */}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Baud Rate</span>
          <select
            className={`${selWidth} w-full`}
            value={String(cfg.baudRate)}
            onChange={(e) => patch({ baudRate: Number(e.target.value) })}
          >
            {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Data Bits</span>
          <select
            className={`${selWidth} w-full`}
            value={String(cfg.dataBits)}
            onChange={(e) => patch({ dataBits: Number(e.target.value) as 7 | 8 })}
          >
            <option value="8">8</option>
            <option value="7">7</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Parity</span>
          <select
            className={`${selWidth} w-full`}
            value={cfg.parity}
            onChange={(e) => patch({ parity: e.target.value as ScaleConfig['parity'] })}
          >
            <option value="none">None</option>
            <option value="even">Even</option>
            <option value="odd">Odd</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Stop Bits</span>
          <select
            className={`${selWidth} w-full`}
            value={String(cfg.stopBits)}
            onChange={(e) => patch({ stopBits: Number(e.target.value) as 1 | 2 })}
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Scale Unit</span>
          <select
            className={`${selWidth} w-full`}
            value={cfg.unit}
            onChange={(e) => patch({ unit: e.target.value as ScaleConfig['unit'] })}
          >
            <option value="kg">kg</option>
            <option value="g">grams</option>
            <option value="lb">pounds</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold space-y-1">
          <span className="block">Price Rounding</span>
          <select
            className={`${selWidth} w-full`}
            value={cfg.priceRounding}
            onChange={(e) => patch({ priceRounding: e.target.value as ScaleConfig['priceRounding'] })}
          >
            <option value="whole">Whole (PKR — 12.5 → 13)</option>
            <option value="decimal">Decimal ($ — 12.5 → 12.50)</option>
          </select>
        </label>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Set these same values in the Brite scale menu too:
        <b> Setup &gt; Communication &gt; RS232 &gt; {cfg.baudRate},{cfg.dataBits},
        {cfg.parity === 'none' ? 'N' : cfg.parity === 'even' ? 'E' : 'O'},{cfg.stopBits}</b>
      </p>

      {/* ===== BEHAVIOUR TOGGLES ===== */}
      {([
        ['stableOnly', 'Only accept stable weight', 'Reject fluctuating weight (recommended)'],
        ['autoConnect', 'Connect on POS startup', 'No need to press Connect every time'],
        ['autoCapture', 'Capture weight on item tap', 'Tap a weight item → weight fills in automatically'],
        ['autoReconnect', 'Reconnect automatically', 'Re-open the port by itself if the cable is knocked out mid-shift'],
      ] as const).map(([key, label, hint]) => (
        <label key={key} className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 rounded-lg cursor-pointer">
          <div>
            <span className="text-xs font-semibold block">{label}</span>
            <span className="text-[11px] text-muted-foreground">{hint}</span>
          </div>
          <button
            type="button"
            onClick={() => patch({ [key]: !cfg[key] } as Partial<ScaleConfig>)}
            className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${cfg[key] ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${cfg[key] ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      ))}

      {/* ===== LIVE TEST ===== */}
      <div className="rounded-lg border bg-background p-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-mono ${connected ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-muted border-transparent'}`}>
            <span className="text-xl font-black tabular-nums">{kg.toFixed(3)}</span>
            <span className="text-xs font-bold text-muted-foreground">kg</span>
            {connected && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${reading?.stable ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                {reading?.stable ? 'STABLE' : 'HOLD…'}
              </span>
            )}
          </div>

          {!connected ? (
            <>
              <button
                onClick={() => connect(false)}
                disabled={busy || !isWebSerialAvailable()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 flex items-center gap-1"
              >
                <Link2 className="h-3.5 w-3.5" />
                {busy ? 'Connecting…' : status === 'no-data' || status === 'error' ? 'Retry & Test' : 'Connect & Test'}
              </button>
              {(status === 'no-data' || status === 'error') && (
                <button
                  onClick={() => { void weightScale.disconnect(); }}
                  className="px-3 py-2 rounded-lg border text-xs font-bold"
                  title="Close the port so it can be re-opened cleanly"
                >
                  Reset port
                </button>
              )}
              <button
                onClick={() => connect(true)}
                disabled={busy || !isWebSerialAvailable()}
                className="px-3 py-2 rounded-lg border text-xs font-bold disabled:opacity-50"
                title="Open the system port chooser"
              >
                Choose port…
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { weightScale.tare(); toast.success('Tare set — container weight subtracted'); }}
                className="px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Tare
              </button>
              <button
                onClick={() => { weightScale.clearTare(); void weightScale.disconnect(); }}
                className="px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1"
              >
                <Link2Off className="h-3.5 w-3.5" /> Disconnect
              </button>
            </>
          )}

          <button
            onClick={() => setShowMonitor(v => !v)}
            className="px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1 ml-auto"
          >
            <Terminal className="h-3.5 w-3.5" /> {showMonitor ? 'Hide' : 'Raw data'}
          </button>
        </div>

        {(status === 'no-data' || status === 'error') && statusMsg && (
          <p className="text-[11px] leading-snug font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
            ⚠ {statusMsg}
            {status === 'no-data' && ' Open “Raw data” below: readable lines mean the baud rate is right, garbage characters mean it is wrong.'}
            <br />
            <span className="text-muted-foreground font-normal">
              Billing is unaffected — weights can always be typed in at the counter.
            </span>
          </p>
        )}

        {showMonitor && (
          <div>
            <div
              ref={monitorRef}
              className="h-28 overflow-y-auto rounded-md bg-black/90 text-emerald-400 font-mono text-[10px] p-2 leading-relaxed"
            >
              {rawLines.length === 0
                ? <span className="text-muted-foreground">Place weight on the scale — raw data will appear here…</span>
                : rawLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Clean lines (e.g. <code>ST,GS, 1.250kg</code>) = correct.
              Garbage characters = baud rate mismatch. Nothing at all = wrong COM port or a
              straight cable (a null-modem cable is required).
            </p>
          </div>
        )}
      </div>

      {!isWebSerialAvailable() && (
        <p className="text-[11px] text-amber-600 font-semibold">
          ⚠️ The scale requires the desktop (EXE) app — browsers do not support serial ports.
        </p>
      )}
    </div>
  );
}
