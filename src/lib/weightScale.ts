// ============================================================
// WEIGHT SCALE SERVICE — international retail standard.
//
// Uses the Web Serial API (Chromium/Electron native) — no
// native driver or extra software installation is required.
//
// Supported protocols (auto-detect):
//   • Toledo / Mettler continuous  : "ST,GS,+  1.234kg"
//   • CAS / Avery / generic ASCII  : "US,NT,+ 0.000 kg"
//   • Simple numeric               : "1.234"
//   • Prefixed                     : "W1.234kg" / "+001.234"
//
// Stable-only capture: weight is only captured when the scale sends
// "ST" (stable) — a fluctuating reading is rejected.
// ============================================================

export type ScaleUnit = 'kg' | 'g' | 'lb';

/**
 * Connection state. `no-data` is deliberately distinct from `connected`:
 * a port that opens but never sends a byte means the wrong COM port, the
 * wrong baud rate or a dead cable — reporting that as "connected" is how
 * the scale used to look fine while never producing a weight.
 */
export type ScaleStatus = 'disconnected' | 'connecting' | 'connected' | 'no-data' | 'error';

export interface ScaleReading {
  /** Weight in kilograms (always normalized to kg). */
  kg: number;
  /** Raw value as sent by scale. */
  raw: string;
  /** Scale ne stable bataya? (ST vs US) */
  stable: boolean;
  /** Net ya Gross reading. */
  net: boolean;
  at: number;
}

export interface ScaleConfig {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: 'none' | 'even' | 'odd';
  /** The scale's own unit — the reading is converted to kg based on this. */
  unit: ScaleUnit;
  /** Only capture stable readings. */
  stableOnly: boolean;
  /** Windows COM port the scale is wired to, e.g. "COM3" / "COM4".
   *  Empty = pehla available port (purana behaviour). */
  portPath: string;
  /** POS khulte hi scale se khud connect ho jaye. */
  autoConnect: boolean;
  /** Weight item ka button dabate hi stable weight khud utha lo. */
  autoCapture: boolean;
  /** kg × rate ka natija kaise round ho.
   *  'whole'   → PKR wagera (12.5 → 13)   [default, purana behaviour]
   *  'decimal' → $ / cents (12.5 → 12.50) */
  priceRounding: 'whole' | 'decimal';
  /** How long to wait for the scale's first line before calling it silent. */
  dataTimeoutMs: number;
  /** Re-open the port automatically after an unplug / cable glitch. */
  autoReconnect: boolean;
}

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  unit: 'kg',
  stableOnly: true,
  portPath: '',
  autoConnect: true,
  autoCapture: true,
  priceRounding: 'whole',
  dataTimeoutMs: 3000,
  autoReconnect: true,
};

/** kg × rate → line price, config ki rounding policy ke mutabiq. */
export function computeWeightPrice(kg: number, ratePerKg: number, cfg: ScaleConfig = loadScaleConfig()): number {
  const rate = Number(ratePerKg);
  const w = Number(kg);
  if (!Number.isFinite(rate) || !Number.isFinite(w) || rate <= 0 || w <= 0) return 0;
  const raw = w * rate;
  return cfg.priceRounding === 'decimal'
    ? Math.round(raw * 100) / 100
    : Math.round(raw);
}

/** Cart line ka note — KOT aur receipt dono par yehi chhapta hai. */
export function weightNote(kg: number, ratePerKg: number): string {
  const rate = Number(ratePerKg) || 0;
  return `${Number(kg).toFixed(3)} KG @ ${rate}/KG`;
}

const CFG_KEY = 'dtpos-scale-config';

export function loadScaleConfig(): ScaleConfig {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return { ...DEFAULT_SCALE_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SCALE_CONFIG };
}

export function saveScaleConfig(cfg: Partial<ScaleConfig>) {
  const next = { ...loadScaleConfig(), ...cfg };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch {}
  return next;
}

/**
 * Kisi string me se "COM3" jaisa token nikalta hai — akela ho ya
 * displayName me chhupa ("WCH PCI Express-SERIAL (COM3)").
 */
export function extractComToken(s: string | undefined | null): string {
  const m = String(s ?? '').toUpperCase().match(/COM\s*\d+/);
  return m ? m[0].replace(/\s+/g, '') : '';
}

/**
 * Screenshot wale scenario ke liye: do WCH serial ports (COM3, COM4).
 * User COM3 chunta hai — yeh helper us port ko list me se pehchanta hai,
 * chahe COM number portName me ho ya displayName me.
 */
export function matchPreferredPort(
  ports: SerialPortInfo[],
  preferred: string,
): SerialPortInfo | undefined {
  const want = extractComToken(preferred);
  if (!want) return undefined;
  return ports.find(p =>
    extractComToken(p.portName) === want || extractComToken(p.displayName) === want);
}

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export interface SerialPortInfo {
  /** Windows ka naam — "COM3", "COM4" … */
  portName: string;
  /** Chromium ka internal id (main process ise callback me maangta hai). */
  portId?: string;
  displayName?: string;
  vendorId?: string;
  productId?: string;
}

/**
 * Machine par mojood COM ports ki list.
 * Sirf Electron (EXE) me chalti hai — browser security ki wajah se web par
 * port ki list nahi milti (wahan user ko chooser dialog dikhana parta hai).
 */
export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  try {
    const api: any = (window as any).electronAPI;
    if (!api?.listSerialPorts) return [];
    const res = await api.listSerialPorts();
    if (!res?.success || !Array.isArray(res.ports)) return [];
    return res.ports
      .map((p: any) => ({
        portName: String(p.portName || p.path || '').trim(),
        portId: p.portId,
        displayName: p.displayName || p.friendlyName,
        vendorId: p.vendorId,
        productId: p.productId,
      }))
      .filter((p: SerialPortInfo) => !!p.portName);
  } catch {
    return [];
  }
}

/** Main process ko batao ke kaunsa COM port chahiye (COM3/COM4). */
export async function applyPreferredPort(portPath: string): Promise<void> {
  try {
    const api: any = (window as any).electronAPI;
    if (api?.setPreferredSerialPort) await api.setPreferredSerialPort(portPath || '');
  } catch {}
}

/**
 * Parse a single line. Covers the format of every major brand.
 * Return null agar line me koi valid weight na ho.
 */
export function parseScaleLine(line: string, unit: ScaleUnit = 'kg'): ScaleReading | null {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  // Stability flags: ST=stable US=unstable (Toledo/CAS standard)
  const hasST = /\bST\b/.test(upper);
  const hasUS = /\bUS\b/.test(upper);
  const stable = hasST ? true : hasUS ? false : true; // flag na ho to stable maano
  const net = /\bNT\b/.test(upper) ? true : /\bGS\b/.test(upper) ? false : true;

  // Unit line me likhi ho to wo priority le (kg/g/lb)
  // FIX: previously \bLB\b was used — in "2.500LB" there is no word-boundary
  // between the digit and the L, so pounds were never detected
  // (2.5 lb was mistakenly counted as 2.5 kg). Now the suffix is matched directly.
  let lineUnit: ScaleUnit = unit;
  if (/LB/.test(upper)) lineUnit = 'lb';
  else if (/KG/.test(upper)) lineUnit = 'kg';
  else if (/[0-9]\s*G\b/.test(upper)) lineUnit = 'g';

  // Pehla signed decimal number nikalo
  const m = upper.match(/[-+]?\s*\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const numStr = m[0].replace(/\s+/g, '').replace(',', '.');
  const val = Number(numStr);
  if (!Number.isFinite(val)) return null;

  const kg = lineUnit === 'g' ? val / 1000 : lineUnit === 'lb' ? val * 0.45359237 : val;
  // Sanity: 0–500 kg (retail scale ki asal range)
  if (kg < 0 || kg > 500) return null;

  return { kg: Math.round(kg * 1000) / 1000, raw, stable, net, at: Date.now() };
}

type Listener = (r: ScaleReading) => void;

class WeightScaleService {
  private port: any = null;
  private reader: any = null;
  private buffer = '';
  private listeners = new Set<Listener>();
  private rawListeners = new Set<(line: string) => void>();
  private statusListeners = new Set<(s: ScaleStatus, msg?: string) => void>();
  private reading = false;
  private tareKg = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  /** Set once the port has produced at least one byte. */
  private sawData = false;
  private connecting = false;
  last: ScaleReading | null = null;
  /** Jis COM port par abhi juda hua hai (UI me dikhane ke liye). */
  activePort = '';
  status: ScaleStatus = 'disconnected';
  lastError = '';

  /**
   * True only when the port is open, the read loop is running AND the scale
   * has actually sent something. A port that opens onto the wrong device
   * reports false here instead of showing a green "connected" that never
   * produces a weight.
   */
  get connected() { return !!this.port && this.reading && this.sawData; }
  /** The port is open, whether or not the scale has spoken yet. */
  get portOpen() { return !!this.port && this.reading; }

  onReading(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: (s: ScaleStatus, msg?: string) => void) {
    this.statusListeners.add(fn); return () => this.statusListeners.delete(fn);
  }
  private emit(r: ScaleReading) { this.last = r; this.listeners.forEach(f => { try { f(r); } catch { /* listener threw */ } }); }
  private emitStatus(s: ScaleStatus, msg?: string) {
    this.status = s;
    if (msg) this.lastError = msg;
    if (s === 'connected') this.lastError = '';
    this.statusListeners.forEach(f => { try { f(s, msg); } catch { /* listener threw */ } });
  }

  /** Tare: mojooda wazan ko zero maan lo (container/lifafa ka wazan minus). */
  tare() { this.tareKg = this.last?.kg ?? 0; }
  clearTare() { this.tareKg = 0; }
  get tareValue() { return this.tareKg; }

  /** Raw line listeners — diagnostics monitor ke liye (parse hone se pehle). */
  onRaw(fn: (line: string) => void) { this.rawListeners.add(fn); return () => this.rawListeners.delete(fn); }

  /**
   * Connect to the scale.
   *
   * ROOT CAUSE this replaces (client: "I select COM4 but the scale still
   * does not work"): the old code reused `getPorts()[0]` whenever exactly one
   * port had ever been authorised, *without checking it was the COM port the
   * user picked*. Authorise COM3 once, later switch the setting to COM4, and
   * the app kept talking to COM3 forever — and reported it as connected.
   *
   * Web Serial deliberately hides the COM name from the renderer, so the only
   * component that can honour the choice is the Electron main process, via its
   * select-serial-port handler. Therefore: whenever a COM port IS configured we
   * always go through requestPort() so the main process resolves it by name and
   * fails loudly if it is absent. A previously authorised port is reused only
   * when no specific COM has been chosen.
   */
  async connect(cfg: ScaleConfig = loadScaleConfig(), opts: { forcePrompt?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
    if (!isWebSerialAvailable()) {
      return { ok: false, error: 'This device/browser does not support Web Serial. Use the Desktop (EXE) app.' };
    }
    if (this.connecting) return { ok: false, error: 'Already connecting to the scale — please wait.' };
    // Already open and healthy? Reuse it.
    if (this.portOpen) return { ok: true };
    // A previous failed attempt may have left a half-open port — clean it up.
    await this.teardown(false);

    this.connecting = true;
    this.emitStatus('connecting');
    try {
      let selected: any = null;
      try {
        const nav: any = navigator;
        // Tell the main process which COM port to pick (COM3 / COM4 …).
        await applyPreferredPort(cfg.portPath);

        const want = extractComToken(cfg.portPath);
        const existing: any[] = (await nav.serial.getPorts()) || [];

        if (opts.forcePrompt || want) {
          // A specific COM was requested (or the user asked to choose): let the
          // main process resolve it by name. This is the only path that can
          // tell COM3 from COM4 when both are the same USB adapter model.
          selected = await nav.serial.requestPort();
        } else if (existing.length === 1) {
          // No preference set and exactly one authorised port — reuse it.
          selected = existing[0];
        } else {
          selected = await nav.serial.requestPort();
        }
      } catch (e: any) {
        // requestPort rejects with "No port selected by the user" when the
        // chooser is cancelled OR the main process could not match the port.
        const msg = String(e?.message || e);
        const friendly = /No port selected/i.test(msg)
          ? `Could not open ${cfg.portPath || 'a COM port'}. It was not found on this PC — check the USB/serial cable and its driver, then press Refresh in Settings and pick the port again.`
          : `Port selection failed: ${msg}`;
        this.emitStatus('error', friendly);
        return { ok: false, error: friendly };
      }

      if (!selected) {
        const msg = 'No COM port was selected.';
        this.emitStatus('error', msg);
        return { ok: false, error: msg };
      }

      // ---- open the port (retry once — it may still be held by an old handle) ----
      const openParams = {
        baudRate: cfg.baudRate,
        dataBits: cfg.dataBits,
        stopBits: cfg.stopBits,
        parity: cfg.parity,
        flowControl: 'none' as const,
      };
      let openErr: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await selected.open(openParams);
          openErr = null;
          break;
        } catch (e: any) {
          openErr = e;
          // "Failed to open serial port" usually means another handle still
          // holds it — wait a moment and try once more.
          try { await selected.close?.(); } catch { /* not open */ }
          await new Promise(r => setTimeout(r, 400));
        }
      }
      if (openErr) {
        const msg = String(openErr?.message || openErr);
        const friendly = /open/i.test(msg)
          ? `Could not open ${cfg.portPath || 'the COM port'}. It may be in use by another program (close the scale utility, another POS window or a terminal app), or the COM port is wrong. Check Settings → COM port, then try again.`
          : `Open failed: ${msg}`;
        this.port = null;
        this.emitStatus('error', friendly);
        return { ok: false, error: friendly };
      }

      this.port = selected;
      this.sawData = false;
      try {
        const info = this.port.getInfo?.() || {};
        this.activePort = extractComToken(info.portName) || extractComToken(cfg.portPath) || (cfg.portPath || '').toUpperCase();
      } catch { this.activePort = (cfg.portPath || '').toUpperCase(); }
      this.reading = true;
      this.reconnectAttempts = 0;
      void this.readLoop(cfg);

      // ---- prove the link: an open port is not the same as a working scale ----
      const gotData = await this.waitForData(Math.max(500, cfg.dataTimeoutMs ?? 3000));
      if (!gotData) {
        // The port stays open — some scales only transmit when weight is placed
        // on the pan — but we must not claim a healthy connection.
        const msg = `${this.activePort || 'The port'} opened but the scale sent no data. Check the baud rate (currently ${cfg.baudRate}), the cable, or whether this is the right COM port.`;
        this.emitStatus('no-data', msg);
        return { ok: false, error: msg };
      }

      this.emitStatus('connected');
      return { ok: true };
    } finally {
      this.connecting = false;
    }
  }

  /** Resolve true as soon as the scale sends anything, false on timeout. */
  private waitForData(timeoutMs: number): Promise<boolean> {
    if (this.sawData) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const finish = (v: boolean) => { if (done) return; done = true; clearInterval(poll); clearTimeout(timer); resolve(v); };
      const poll = setInterval(() => { if (this.sawData) finish(true); }, 60);
      const timer = setTimeout(() => finish(this.sawData), timeoutMs);
    });
  }

  /** Close everything and forget the port. Never throws. */
  private async teardown(emit: boolean) {
    this.reading = false;
    this.sawData = false;
    try { await this.reader?.cancel(); } catch { /* already cancelled */ }
    try { this.reader?.releaseLock(); } catch { /* not locked */ }
    try { await this.port?.close(); } catch { /* already closed */ }
    this.port = null;
    this.reader = null;
    this.buffer = '';
    this.activePort = '';
    this.last = null;
    if (emit) this.emitStatus('disconnected');
  }

  /**
   * Re-open after an unplug / cable glitch, backing off 2s, 4s, 8s … up to 30s.
   * Billing never waits on this: it runs in the background and gives up quietly.
   */
  private scheduleReconnect(cfg: ScaleConfig) {
    if (!cfg.autoReconnect || this.reconnectTimer) return;
    const delay = Math.min(30000, 2000 * Math.pow(2, Math.min(4, this.reconnectAttempts)));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.portOpen) return;
      void this.connect(cfg).then(r => {
        if (!r.ok) this.scheduleReconnect(cfg);
      });
    }, delay);
  }

  private async readLoop(cfg: ScaleConfig) {
    let lostConnection = false;
    try {
      const decoder = new TextDecoder();
      this.reader = this.port.readable.getReader();
      while (this.reading) {
        const { value, done } = await this.reader.read();
        if (done) { lostConnection = true; break; }
        if (value && value.length) {
          // First byte from the device: the link is real, not just an open port.
          if (!this.sawData) {
            this.sawData = true;
            if (this.status !== 'connected') this.emitStatus('connected');
          }
        }
        this.buffer += decoder.decode(value, { stream: true });
        // Lines split (CR, LF ya dono)
        const parts = this.buffer.split(/[\r\n]+/);
        this.buffer = parts.pop() || '';
        for (const line of parts) {
          // Raw line hamesha emit karo — chahe parse fail ho jaye. Diagnostics
          // monitor me user dekh sakta hai ke scale asal me kya bhej rahi hai
          // (baud mismatch ka pata isi se chalta hai — garbage characters).
          if (line) this.rawListeners.forEach(f => { try { f(line); } catch {} });
          const r = parseScaleLine(line, cfg.unit);
          if (r) {
            const adjusted = { ...r, kg: Math.max(0, Math.round((r.kg - this.tareKg) * 1000) / 1000) };
            this.emit(adjusted);
          }
        }
        // Runaway buffer guard
        if (this.buffer.length > 4096) this.buffer = '';
      }
    } catch (e: any) {
      // Unplugged cable / adapter reset lands here.
      lostConnection = true;
      this.emitStatus('error', e?.message || String(e));
    } finally {
      try { this.reader?.releaseLock(); } catch { /* not locked */ }
      if (lostConnection && this.reading) {
        // The old code left `port` set after a read error, so `connected`
        // stayed true forever and nothing ever reconnected — a dead scale
        // that still looked healthy. Tear down properly, then retry quietly.
        await this.teardown(true);
        this.scheduleReconnect(cfg);
      }
    }
  }

  /** User-initiated disconnect — also cancels any pending auto-reconnect. */
  async disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectAttempts = 0;
    await this.teardown(true);
  }

  /**
   * Wait for a stable reading (for the capture button).
   * If no stable reading is found within timeoutMs, returns the last reading.
   */
  async captureStable(timeoutMs = 4000, stableOnly = true): Promise<ScaleReading | null> {
    // Deliberately `portOpen`, not `connected`: some scales only transmit once
    // something is placed on the pan, so a port that has not spoken yet is
    // still worth listening to. A silent scale resolves null on the timeout and
    // the cashier types the weight — billing is never blocked either way.
    if (!this.portOpen) return null;
    if (!stableOnly && this.last) return this.last;
    return new Promise((resolve) => {
      let done = false;
      const off = this.onReading((r) => {
        if (done) return;
        if (!stableOnly || (r.stable && r.kg > 0)) { done = true; off(); resolve(r); }
      });
      setTimeout(() => { if (!done) { done = true; off(); resolve(this.last); } }, timeoutMs);
    });
  }
}

export const weightScale = new WeightScaleService();

/**
 * POS start hote hi scale se khud connect karne ki koshish.
 * Sirf Electron me — aur sirf tab jab port pehle se authorize ho, warna
 * browser chooser dialog user gesture ke baghair block kar deta hai.
 * Khamoshi se fail hota hai: scale na ho to POS normal chalta rahe.
 */
export async function autoConnectScale(): Promise<boolean> {
  const cfg = loadScaleConfig();
  if (!cfg.autoConnect) return false;
  if (!isWebSerialAvailable()) return false;
  if (weightScale.portOpen) return true;
  try {
    const nav: any = navigator;
    const existing: any[] = (await nav.serial.getPorts()) || [];
    // No port has ever been authorised on this machine — the very first
    // connection has to come from the user pressing Connect in Settings.
    if (!existing.length) return false;
    const r = await weightScale.connect(cfg);
    return r.ok;
  } catch {
    // Startup must never be held up by a peripheral. Billing works without it.
    return false;
  }
}
