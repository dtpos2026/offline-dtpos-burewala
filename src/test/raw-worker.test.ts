// ============================================================
// RAW PRINT HELPER — the warm PowerShell bridge (electron/rawWorker.cjs).
//
// Reported from a Lahore shop: prints came out ~20 s late, KOTs lost their
// footer, and the printer had to be "detected and activated" again and
// again. Three helper faults could each turn every later slip into a slow
// Windows-driver print until the app restarted; these tests pin them.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { createRawWorker } = require_('../../electron/rawWorker.cjs');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

class FakeProc extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  written: any[] = [];
  killed = false;
  dead = false;
  auto: 'ok' | 'err' | 'none';
  stdin = { write: (line: string) => {
    if (this.dead) throw new Error('write EPIPE');
    const job = JSON.parse(line);
    this.written.push(job);
    if (this.auto === 'ok') setTimeout(() => this.stdout.emit('data', `OK:${job.id}\n`), 1);
    if (this.auto === 'err') setTimeout(() => this.stdout.emit('data', `ERR:${job.id}:OpenPrinter failed for 'X' (1801)\n`), 1);
  } };
  constructor(auto: 'ok' | 'err' | 'none' = 'ok') { super(); this.auto = auto; }
  ready() { this.stdout.emit('data', 'READY\n'); }
  kill() { this.killed = true; setTimeout(() => this.emit('exit', 1), 5); }
}

function harness(opts: { behaviour?: Array<'ready' | 'slow' | 'never' | 'crash'>; auto?: 'ok' | 'err' | 'none' } = {}) {
  const procs: FakeProc[] = [];
  const behaviour = opts.behaviour || [];
  const bridge = createRawWorker({
    platform: 'win32',
    scriptPath: () => 'C:/tmp/raw.ps1',
    startupMs: 60, waitMs: 30, jobTimeoutMs: 40, rewarmMs: 10,
    spawn: () => {
      const p = new FakeProc(opts.auto || 'ok');
      const b = behaviour[procs.length] || 'ready';
      procs.push(p);
      if (b === 'ready') setTimeout(() => p.ready(), 2);
      if (b === 'slow') setTimeout(() => p.ready(), 45);      // slower than one slip waits
      if (b === 'crash') setTimeout(() => p.emit('exit', 1), 3); // antivirus / policy kill
      return p;
    },
  });
  return { bridge, procs };
}

const bytes = Buffer.from([0x1b, 0x40, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x0a]);

describe('the warm helper', () => {
  it('starts once and serves every slip', async () => {
    const { bridge, procs } = harness();
    expect(await bridge.send('BlackCopper 80mm Series', bytes, 1)).toEqual({ success: true });
    expect(await bridge.send('BlackCopper 80mm Series', bytes, 1)).toEqual({ success: true });
    expect(procs).toHaveLength(1);
    expect(procs[0].written.map(j => j.printerName)).toEqual(['BlackCopper 80mm Series', 'BlackCopper 80mm Series']);
    expect(Buffer.from(procs[0].written[0].data, 'base64').equals(bytes)).toBe(true);
    bridge.setQuitting(true); bridge.stop();
  });

  it('reports a printer error as a failed job (the caller falls back)', async () => {
    const { bridge } = harness({ auto: 'err' });
    const r = await bridge.send('Old Name', bytes, 1);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/OpenPrinter failed/);
    bridge.setQuitting(true); bridge.stop();
  });
});

describe('a slow start does not break every later slip', () => {
  it('one slip waits a bounded time, then the SAME helper serves the next slip', async () => {
    const { bridge, procs } = harness({ behaviour: ['slow'] });
    const first = await bridge.send('P', bytes, 1);
    expect(first).toMatchObject({ success: false, error: 'Direct print worker is still starting' });
    await sleep(30); // the helper finishes starting in the background
    expect(await bridge.send('P', bytes, 1)).toEqual({ success: true });
    expect(procs).toHaveLength(1);
    bridge.setQuitting(true); bridge.stop();
  });

  it('a start that never finishes is abandoned, and the next slip gets a fresh helper', async () => {
    const { bridge, procs } = harness({ behaviour: ['never', 'ready'] });
    expect((await bridge.send('P', bytes, 1)).success).toBe(false);
    await sleep(90); // past the startup limit: the stuck process is killed and a new one starts
    expect(procs[0].killed).toBe(true);
    expect(await bridge.send('P', bytes, 1)).toEqual({ success: true });
    expect(procs.length).toBeGreaterThanOrEqual(2);
    bridge.setQuitting(true); bridge.stop();
  });
});

describe('a helper that dies before it is ready does not hang the queue', () => {
  it('the waiting slip fails promptly and later slips print', async () => {
    const { bridge, procs } = harness({ behaviour: ['crash', 'ready'] });
    const t0 = Date.now();
    const first = await bridge.send('P', bytes, 1);
    expect(first.success).toBe(false);
    expect(Date.now() - t0).toBeLessThan(200); // not the 30 s job timeout
    await sleep(20);
    expect(await bridge.send('P', bytes, 1)).toEqual({ success: true });
    expect(procs.length).toBeGreaterThanOrEqual(2);
    bridge.setQuitting(true); bridge.stop();
  });
});

describe('after a slow job', () => {
  it('the helper is restarted in the background, so the next slip is not a cold start', async () => {
    const { bridge, procs } = harness({ auto: 'none' }); // the job never answers
    const r = await bridge.send('P', bytes, 1);
    expect(r).toMatchObject({ success: false, error: 'Direct print timed out' });
    expect(procs[0].killed).toBe(true);
    await sleep(30);
    expect(procs.length).toBe(2);            // restarted without waiting for a slip
    expect(bridge.state().running).toBe(true);
    bridge.setQuitting(true); bridge.stop();
  });

  it('the old process exiting late never kills the new one', async () => {
    const { bridge, procs } = harness({ auto: 'none' });
    await bridge.send('P', bytes, 1);         // times out → stop → restart
    await sleep(40);
    procs[0].emit('exit', 1);                 // a late, stale exit event
    await sleep(10);
    expect(procs[1].killed).toBe(false);
    expect(bridge.state().running).toBe(true);
    bridge.setQuitting(true); bridge.stop();
  });

  it('no restart while the app is quitting', async () => {
    const { bridge, procs } = harness();
    await bridge.send('P', bytes, 1);
    bridge.setQuitting(true);
    bridge.stop();
    await sleep(30);
    expect(procs).toHaveLength(1);
  });
});

describe('a helper that dies', () => {
  it('says why: its error output is kept and reported with the failure', async () => {
    const { bridge, procs } = harness({ behaviour: ['never'] });
    const first = bridge.get();
    procs[0].stderr.emit('data', 'Add-Type : Cannot add type.\r\n  The compiler\r\n');
    procs[0].stderr.emit('data', 'was blocked by policy.\r\n');
    procs[0].emit('exit', 1);
    await expect(first).rejects.toThrow('Direct print worker exited: Add-Type : Cannot add type. The compiler was blocked by policy.');
    bridge.setQuitting(true); bridge.stop();
  });
  it('between jobs fails the next slip at once (not after the job timeout) and is replaced', async () => {
    const { bridge, procs } = harness();
    expect(await bridge.send('P', bytes, 1)).toEqual({ success: true });
    procs[0].dead = true;                     // gone, but no exit event yet
    const t0 = Date.now();
    const r = await bridge.send('P', bytes, 1);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Direct print worker unavailable: write EPIPE/);
    expect(Date.now() - t0).toBeLessThan(30);  // the job timeout is 40 ms here
    await sleep(20);
    expect(await bridge.send('P', bytes, 1)).toEqual({ success: true });
    expect(procs).toHaveLength(2);
    bridge.setQuitting(true); bridge.stop();
  });
});

describe('off Windows', () => {
  it('never spawns anything and fails cleanly', async () => {
    let spawned = 0;
    const bridge = createRawWorker({ platform: 'linux', scriptPath: () => '', spawn: () => { spawned++; return new FakeProc(); } });
    await expect(bridge.get()).rejects.toThrow(/Windows only/);
    expect((await bridge.send('P', bytes, 1)).success).toBe(false);
    expect(spawned).toBe(0);
  });
});
