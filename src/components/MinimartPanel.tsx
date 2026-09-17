// ============================================================
// MINIMART PANEL — barcode scanning + live weight scale.
// Shown on the POS screen when Minimart Mode is ON.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Scale, ScanBarcode, Link2, Link2Off, RotateCcw, Keyboard } from 'lucide-react';
import {
  weightScale, loadScaleConfig, isWebSerialAvailable,
  type ScaleReading, type ScaleStatus,
} from '@/lib/weightScale';
import { parseBarcode, DEFAULT_EMBEDDED, type EmbeddedConfig } from '@/lib/barcode';

interface Props {
  /** Called on barcode scan (with embedded weight/price if present). */
  onScan: (result: { code: string; weightKg?: number; price?: number }) => void;
  /** Called when weight is captured from the scale. */
  onWeight: (kg: number) => void;
  embeddedMode?: 'weight' | 'price' | 'off';
}

export default function MinimartPanel({ onScan, onWeight, embeddedMode = 'weight' }: Props) {
  const [reading, setReading] = useState<ScaleReading | null>(weightScale.last);
  const [status, setStatus] = useState<ScaleStatus>(weightScale.status);
  const [scaleMsg, setScaleMsg] = useState(weightScale.lastError);
  const [manual, setManual] = useState('');
  const [manualKg, setManualKg] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const connected = status === 'connected';

  useEffect(() => {
    const offR = weightScale.onReading(setReading);
    const offS = weightScale.onStatus((s, msg) => {
      setStatus(s);
      setScaleMsg(msg || '');
      if (s === 'connected') toast.success('Weight scale connected');
      // 'no-data' and 'error' already carry a specific message from the
      // service; showing it raw here would duplicate the inline notice.
    });
    return () => { offR(); offS(); };
  }, []);

  const cfg: EmbeddedConfig = { ...DEFAULT_EMBEDDED, mode: embeddedMode };

  const submitCode = (code: string) => {
    if (!code.trim()) return;
    const p = parseBarcode(code, cfg);
    onScan({ code: p.lookupCode, weightKg: p.weightKg, price: p.price });
    setManual('');
    inputRef.current?.focus();
  };

  const connect = async () => {
    setBusy(true);
    const r = await weightScale.connect(loadScaleConfig());
    setBusy(false);
    if (!r.ok) toast.error(r.error || 'Scale failed to connect');
  };

  const capture = async () => {
    const cfgS = loadScaleConfig();
    const r = await weightScale.captureStable(4000, cfgS.stableOnly);
    if (!r || r.kg <= 0) { toast.error('No weight detected — place the item on the scale, or type the weight'); return; }
    if (cfgS.stableOnly && !r.stable) { toast.warning('Weight is still fluctuating — please wait'); return; }
    onWeight(r.kg);
    toast.success(`${r.kg.toFixed(3)} kg added`);
  };

  /** Scale down / not fitted? The counter keeps billing by hand. */
  const submitManualKg = () => {
    const kgVal = Number(String(manualKg).replace(',', '.'));
    if (!Number.isFinite(kgVal) || kgVal <= 0) { toast.error('Enter a weight in kg'); return; }
    if (kgVal > 500) { toast.error('That weight looks wrong — enter kilograms'); return; }
    onWeight(Math.round(kgVal * 1000) / 1000);
    setManualKg('');
    toast.success(`${kgVal.toFixed(3)} kg added manually`);
  };

  const kg = reading?.kg ?? 0;

  return (
    <div className="space-y-2 p-2 rounded-xl border bg-muted/30">
      {/* Barcode input — the scanner types into this field */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            data-barcode-input="true"
            className="pl-8 h-10 font-mono"
            placeholder="Scan a barcode or type and press Enter…"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCode(manual); } }}
            autoFocus
          />
        </div>
        <Button size="sm" className="h-10" onClick={() => submitCode(manual)}>Add</Button>
      </div>

      {/* Scale row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-mono ${connected ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-muted border-transparent'}`}>
          <Scale className={`h-4 w-4 ${connected ? 'text-emerald-600' : 'text-muted-foreground'}`} />
          <span className="text-xl font-black tabular-nums">{kg.toFixed(3)}</span>
          <span className="text-xs font-bold text-muted-foreground">kg</span>
          {connected && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${reading?.stable ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
              {reading?.stable ? 'STABLE' : 'HOLD…'}
            </span>
          )}
        </div>

        {!connected ? (
          <Button size="sm" variant="outline" onClick={connect} disabled={busy || !isWebSerialAvailable()}>
            <Link2 className="h-4 w-4 mr-1" />
            {busy ? 'Connecting…' : status === 'no-data' || status === 'error' ? 'Retry Scale' : 'Connect Scale'}
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={capture}>Capture Weight</Button>
            <Button size="sm" variant="outline" onClick={() => { weightScale.tare(); toast.success('Tare set — container weight subtracted'); }}>
              <RotateCcw className="h-4 w-4 mr-1" /> Tare
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { weightScale.clearTare(); weightScale.disconnect(); }}>
              <Link2Off className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* ===== MANUAL WEIGHT — always available =====
          The scale is an optional peripheral. Whether it is missing, on the
          wrong COM port, unplugged mid-shift or simply silent, the counter
          keeps billing by typing the weight. This is never hidden. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Keyboard className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            className="pl-8 h-9 font-mono"
            placeholder={connected ? 'Or type the weight in kg…' : 'Type the weight in kg (scale not connected)…'}
            value={manualKg}
            onChange={(e) => setManualKg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManualKg(); } }}
          />
        </div>
        <Button size="sm" variant={connected ? 'outline' : 'default'} className="h-9" onClick={submitManualKg}>
          Add kg
        </Button>
      </div>

      {(status === 'no-data' || status === 'error') && scaleMsg && (
        <p className="text-[11px] text-amber-600 font-semibold leading-snug">
          ⚖️ {scaleMsg} You can keep billing — type the weight above.
        </p>
      )}

      {!isWebSerialAvailable() && (
        <p className="text-[11px] text-amber-600 font-semibold">
          A desktop (EXE) app is required for the scale — browsers do not support serial port access.
          Weights can still be typed in above.
        </p>
      )}
    </div>
  );
}
