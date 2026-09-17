// ============================================================
// SCALE CONNECTION — v1.0.40 regression locks.
//
// Client report: "I select COM4 in Settings but the scale still does not
// work / the software says connected but no weight arrives."
// ============================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

interface FakePort {
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  getInfo(): Record<string, never>;
  readable: { getReader(): unknown };
}

/** Minimal Web Serial fake: a port that opens and optionally emits lines. */
function fakePort(opts: { emits?: string[]; failOpen?: boolean } = {}): FakePort {
  const lines = opts.emits ?? [];
  let i = 0;
  let closed = false;
  return {
    opened: false,
    async open() {
      if (opts.failOpen) throw new Error('Failed to open serial port');
      this.opened = true;
    },
    async close() { closed = true; this.opened = false; },
    getInfo() { return {}; },
    readable: {
      getReader() {
        return {
          async read() {
            if (closed || i >= lines.length) {
              // hold the loop open without spinning
              await new Promise(r => setTimeout(r, 50));
              return { value: undefined, done: closed };
            }
            const chunk = new TextEncoder().encode(lines[i++]);
            await new Promise(r => setTimeout(r, 10));
            return { value: chunk, done: false };
          },
          async cancel() { closed = true; },
          releaseLock() {},
        };
      },
    },
  };
}

function installSerial(cfg: { getPorts: FakePort[]; requestPort?: () => Promise<FakePort> }) {
  const requestPort = vi.fn(cfg.requestPort ?? (async () => { throw new Error('No port selected by the user'); }));
  Object.defineProperty(navigator, 'serial', {
    configurable: true,
    value: { getPorts: async () => cfg.getPorts, requestPort },
  });
  return { requestPort };
}

describe('choosing a COM port', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => { Reflect.deleteProperty(navigator, 'serial'); });

  it('asks the main process to resolve the port whenever a COM is configured', async () => {
    const { weightScale, saveScaleConfig, loadScaleConfig } = await import('@/lib/weightScale');
    saveScaleConfig({ portPath: 'COM4', dataTimeoutMs: 120, autoReconnect: false });

    const alreadyAuthorised = fakePort();          // e.g. COM3, authorised earlier
    const theRealScale = fakePort({ emits: ['ST,GS,+  1.234kg\r\n'] });
    const { requestPort } = installSerial({
      getPorts: [alreadyAuthorised],
      requestPort: async () => theRealScale,
    });

    const r = await weightScale.connect(loadScaleConfig());

    // The old build reused getPorts()[0] and opened the WRONG adapter.
    expect(requestPort).toHaveBeenCalled();
    expect(alreadyAuthorised.opened).toBe(false);
    expect(r.ok).toBe(true);
    await weightScale.disconnect();
  });

  it('explains a missing port instead of opening a different one', async () => {
    const { weightScale, saveScaleConfig, loadScaleConfig } = await import('@/lib/weightScale');
    saveScaleConfig({ portPath: 'COM7', dataTimeoutMs: 120, autoReconnect: false });
    const other = fakePort();
    installSerial({ getPorts: [other] });   // requestPort rejects: main process refused

    const r = await weightScale.connect(loadScaleConfig());

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/COM7/);
    expect(r.error).toMatch(/cable|driver/i);
    expect(other.opened).toBe(false);
    expect(weightScale.connected).toBe(false);
  });
});

describe('reporting the truth about the link', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => { Reflect.deleteProperty(navigator, 'serial'); });

  it('does not claim "connected" for a port that never sends data', async () => {
    const { weightScale, saveScaleConfig, loadScaleConfig } = await import('@/lib/weightScale');
    saveScaleConfig({ portPath: 'COM3', dataTimeoutMs: 150, autoReconnect: false });
    const silent = fakePort({ emits: [] });
    installSerial({ getPorts: [], requestPort: async () => silent });

    const r = await weightScale.connect(loadScaleConfig());

    expect(r.ok).toBe(false);
    expect(weightScale.status).toBe('no-data');
    expect(weightScale.connected).toBe(false);   // the old build showed green here
    expect(weightScale.portOpen).toBe(true);     // but the port IS open, so keep listening
    expect(r.error).toMatch(/baud rate/i);
    await weightScale.disconnect();
  });

  it('reports connected once the scale actually speaks', async () => {
    const { weightScale, saveScaleConfig, loadScaleConfig } = await import('@/lib/weightScale');
    saveScaleConfig({ portPath: 'COM3', dataTimeoutMs: 800, autoReconnect: false });
    const talking = fakePort({ emits: ['ST,GS,+  2.500kg\r\n'] });
    installSerial({ getPorts: [], requestPort: async () => talking });

    const r = await weightScale.connect(loadScaleConfig());

    expect(r.ok).toBe(true);
    expect(weightScale.status).toBe('connected');
    expect(weightScale.connected).toBe(true);
    await weightScale.disconnect();
  });

  it('goes back to disconnected after the user unplugs it', async () => {
    const { weightScale, saveScaleConfig, loadScaleConfig } = await import('@/lib/weightScale');
    saveScaleConfig({ portPath: 'COM3', dataTimeoutMs: 800, autoReconnect: false });
    installSerial({ getPorts: [], requestPort: async () => fakePort({ emits: ['ST,GS,+  1.000kg\r\n'] }) });

    await weightScale.connect(loadScaleConfig());
    expect(weightScale.connected).toBe(true);

    await weightScale.disconnect();

    expect(weightScale.connected).toBe(false);
    expect(weightScale.portOpen).toBe(false);
    expect(weightScale.status).toBe('disconnected');
  });

  it('a scale that never connects cannot block billing', async () => {
    const { weightScale } = await import('@/lib/weightScale');
    // nothing connected at all
    const r = await weightScale.captureStable(50, true);
    expect(r).toBeNull();          // resolves, does not hang — the cashier types it
  });
});
