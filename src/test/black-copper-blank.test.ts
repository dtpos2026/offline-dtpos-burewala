// ============================================================
// BLANK SLIPS ON BLACK COPPER (and similar budget ESC/POS printers).
//
// Reported: the printer feeds and cuts blank paper. Three causes in the
// image route are covered here:
//   1. the whole slip went out as ONE GS v 0 image (thousands of rows); a
//      printer that cannot take it drops the image and still feeds + cuts;
//   2. a blank capture (hidden window not painted yet) was sent as a blank
//      raster and reported as printed, so nothing fell back;
//   3. Printer Center's Test Print used the Windows driver while bills used
//      the image route, so the test passed on a printer that printed blank.
// What cannot be proven here: the physical Black Copper printer.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require_ = createRequire(import.meta.url);
const raster = require_('../../electron/escposRaster.cjs');
const { wrapRasterCommands, escposRasterBytes, rasterGeometry, hasInk, RASTER_BAND_ROWS } = raster;

const GS_V_0 = [0x1d, 0x76, 0x30, 0x00];

/** Read the job back the way printer firmware does: every GS v 0 band in order. */
function decodeBands(bytes: Buffer) {
  const marker = Buffer.from(GS_V_0);
  const bands: Array<{ rowBytes: number; rows: number; at: number }> = [];
  const parts: Buffer[] = [];
  let at = bytes.indexOf(marker);
  let end = -1;
  while (at >= 0) {
    const rowBytes = bytes[at + 4] | (bytes[at + 5] << 8);
    const rows = bytes[at + 6] | (bytes[at + 7] << 8);
    const start = at + 8;
    parts.push(bytes.subarray(start, start + rowBytes * rows));
    bands.push({ rowBytes, rows, at });
    end = start + rowBytes * rows;
    const next = bytes.indexOf(marker, end);
    if (next !== -1 && next !== end) throw new Error(`stray bytes between bands at ${end}`);
    at = next;
  }
  return { bands, data: Buffer.concat(parts), tail: bytes.subarray(end) };
}

function randomPacked(height: number, rowBytes = 72) {
  const data = Buffer.alloc(rowBytes * height);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 27; // deterministic "ink"
  data[0] = 0xff;
  return { rowBytes, height, data };
}

describe('the image goes to the printer in bands, not one giant block', () => {
  it(`bands are at most ${128} rows, back to back, and carry every dot unchanged`, () => {
    expect(RASTER_BAND_ROWS).toBe(128);
    for (const height of [1, 127, 128, 129, 300, 2400]) {
      const packed = randomPacked(height);
      const bytes: Buffer = wrapRasterCommands(packed, true, {});
      const { bands, data, tail } = decodeBands(bytes);
      expect(bands.length, `height ${height}`).toBe(Math.ceil(height / 128));
      for (const b of bands) {
        expect(b.rowBytes).toBe(72);
        expect(b.rows).toBeGreaterThan(0);
        expect(b.rows).toBeLessThanOrEqual(128);
      }
      expect(bands.reduce((a, b) => a + b.rows, 0)).toBe(height);
      expect(data.equals(packed.data)).toBe(true);
      // ESC d n, then one full cut — after the last band only.
      expect([...tail]).toEqual([0x1b, 0x64, 6, 0x1d, 0x56, 0x00]);
    }
  });

  it('a 300 mm report is 19 small bands — nothing near the 2,303-row limit some printers enforce', () => {
    const { bands } = decodeBands(wrapRasterCommands(randomPacked(2400), true, {}));
    expect(bands).toHaveLength(19);
    expect(Math.max(...bands.map(b => b.rows))).toBeLessThanOrEqual(128);
  });

  it('the job still starts by resetting the printer and its sticky margins', () => {
    const bytes: Buffer = wrapRasterCommands(randomPacked(10), true, {});
    expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]);             // ESC @
    expect([...bytes.subarray(2, 6)]).toEqual([0x1d, 0x4c, 0x00, 0x00]); // GS L 0
  });
});

describe('a blank capture is never printed', () => {
  const geom = rasterGeometry('80mm', 2, 2);
  const image = (pixels: Buffer, width: number, height: number) => {
    const img: any = { getSize: () => ({ width, height }), resize: () => img, toBitmap: () => pixels, crop: () => img };
    return img;
  };

  it('an all-white capture is refused (so the handler re-captures, then uses the driver)', () => {
    const w = geom.contentDots, h = 80;
    const white = Buffer.alloc(w * h * 4, 0xff);
    expect(() => escposRasterBytes(image(white, w, h), '80mm', true, { marginLeftMm: 2, marginRightMm: 2 }))
      .toThrow(/blank — refusing to print blank paper/);
  });

  it('a capture with ink prints', () => {
    const w = geom.contentDots, h = 80;
    const px = Buffer.alloc(w * h * 4, 0xff);
    for (let y = 30; y < 40; y++) for (let x = 20; x < 200; x++) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
    const bytes: Buffer = escposRasterBytes(image(px, w, h), '80mm', true, { marginLeftMm: 2, marginRightMm: 2 });
    expect(decodeBands(bytes).bands.length).toBeGreaterThan(0);
  });

  it('hasInk', () => {
    expect(hasInk({ data: Buffer.alloc(100) })).toBe(false);
    expect(hasInk({ data: Buffer.from([0, 0, 1]) })).toBe(true);
    expect(hasInk(null)).toBe(false);
  });

  it('the desktop handler re-captures a blank page (with a repaint) before giving up', () => {
    const main = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');
    const handler = main.slice(main.indexOf("ipcMain.handle('print-html-escpos'"), main.indexOf("ipcMain.handle('print-receipt'"));
    expect(handler).toMatch(/const RETRY_WAIT_MS = \[0, 120, 350\];/);
    expect(handler).toMatch(/win\.webContents\.invalidate\(\)/);
    expect(handler).toMatch(/if \(!\/blank\/i\.test\(String\(e && e\.message\)\)\) break;/);
    expect(handler).toMatch(/throw lastErr \|\| new Error/);
    // A normal slip is captured once: the waits only apply to attempts after the first.
    expect(handler).toMatch(/if \(attempt > 0\) \{/);
  });
});

describe('a refused image prints through the Windows driver instead', () => {
  afterEach(() => { delete (window as any).electronAPI; });

  it('fastPrintHtml falls back and says why', async () => {
    const printHtml = vi.fn(async () => ({ success: true }));
    (window as any).electronAPI = {
      printHtmlEscpos: vi.fn(async () => ({ success: false, error: 'Rendered receipt is blank — refusing to print blank paper' })),
      printHtml,
    };
    const { fastPrintHtml } = await import('@/printing/fastPrint');
    const r = await fastPrintHtml({ html: '<div>' + 'Bill line text '.repeat(10) + '</div>', paperWidth: '80mm', printerName: 'BlackCopper BC-85AC' } as any);
    expect(r).toMatchObject({ success: true, route: 'driver' });
    expect(r.rasterError).toMatch(/blank/);
    expect(printHtml).toHaveBeenCalledTimes(1);
  });

  it('a healthy image prints on the image route', async () => {
    (window as any).electronAPI = { printHtmlEscpos: vi.fn(async () => ({ success: true })), printHtml: vi.fn() };
    const { fastPrintHtml } = await import('@/printing/fastPrint');
    const r = await fastPrintHtml({ html: '<div>' + 'Bill line text '.repeat(10) + '</div>', paperWidth: '80mm' } as any);
    expect(r).toMatchObject({ success: true, route: 'raster' });
  });
});

describe('Printer Center test print = the bill route, with a "came out blank" switch', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });
  afterEach(() => { vi.doUnmock('@/printing'); delete (window as any).electronAPI; });

  const printer = (over: any = {}) => ({
    id: 'p1', name: 'Counter', connection: 'system', printerName: 'BlackCopper BC-85AC', role: 'counter', paperSize: '80mm',
    leftMarginMm: 2, rightMarginMm: 2, topFeedMm: 0, bottomFeedMm: 0, autoCut: true, beep: false, copies: 1, escposMode: false, enabled: true, ...over,
  });

  it('blank → Windows driver → Raw text → nothing left to try', async () => {
    const { nextModeAfterBlank } = await import('@/printing/testSlip');
    expect(nextModeAfterBlank('auto')).toBe('driver');
    expect(nextModeAfterBlank('driver')).toBe('raw');
    expect(nextModeAfterBlank('raw')).toBeNull();
  });

  it('the test uses the mode a bill would use (printer mode, then Fast Billing)', async () => {
    const { testModeFor } = await import('@/printing/testSlip');
    expect(testModeFor(printer())).toBe('auto');
    expect(testModeFor(printer({ printMode: 'driver' }))).toBe('driver');
    expect(testModeFor(printer(), { fastRawPrintMode: true })).toBe('raw');
    expect(testModeFor(printer({ printMode: 'driver' }), { fastRawPrintMode: true })).toBe('driver');
  });

  it('Automatic: goes through printNode on the image route, and reports a driver fallback honestly', async () => {
    const printNode = vi.fn(async () => ({ success: true, attempts: ['fast-window:driver (image route: Rendered receipt is blank — refusing to print blank paper)'] }));
    vi.doMock('@/printing', () => ({ printNode }));
    const { printTestSlip } = await import('@/printing/testSlip');
    const r = await printTestSlip(printer() as any, 'auto');
    expect(r).toMatchObject({ success: true, mode: 'auto' });
    expect(r.route).toBe('Windows driver (image route refused: Rendered receipt is blank — refusing to print blank paper)');
    const [portal, opts] = printNode.mock.calls[0] as any;
    expect(opts).toMatchObject({ printerName: 'BlackCopper BC-85AC', paperWidth: '80mm', silent: true, logType: 'test', printMode: undefined });
    expect(portal.textContent).toContain('DT POS TEST');
    expect(portal.textContent).toContain('Mode: Automatic (image sent as RAW)');
  });

  it('Windows driver: the image stage is skipped, like a bill in that mode', async () => {
    const printNode = vi.fn(async () => ({ success: true, attempts: ['fast-window:driver'] }));
    vi.doMock('@/printing', () => ({ printNode }));
    const { printTestSlip } = await import('@/printing/testSlip');
    const r = await printTestSlip(printer({ printMode: 'driver' }) as any, 'driver');
    expect((printNode.mock.calls[0] as any)[1].printMode).toBe('driver');
    expect(r.route).toBe('Windows driver');
  });

  it('Raw text: plain ESC/POS text straight to the printer', async () => {
    const printRaw = vi.fn(async () => ({ success: true }));
    (window as any).electronAPI = { printRaw };
    const { printTestSlip } = await import('@/printing/testSlip');
    const r = await printTestSlip(printer({ printMode: 'raw' }) as any, 'raw');
    expect(r).toMatchObject({ success: true, mode: 'raw', route: 'Raw ESC/POS text' });
    const job = (printRaw.mock.calls[0] as any)[0];
    expect(job.printerName).toBe('BlackCopper BC-85AC');
    expect(String.fromCharCode(...job.data)).toContain('DT POS TEST');
  });

  it('the panel saves the next mode and prints the test again when it came out blank', () => {
    const panel = readFileSync(resolve(__dirname, '../components/PrinterSettingsPanel.tsx'), 'utf8');
    expect(panel).not.toMatch(/printReceiptNative\(/); // the old driver-only test is gone
    expect(panel).toMatch(/const next = nextModeAfterBlank\(lastTest\.mode\);/);
    expect(panel).toMatch(/await savePrinterSettings\(nextSettings\);/);
    expect(panel).toMatch(/await testSystem\(updated, next\);/);
    expect(panel).toMatch(/Came out blank/);
    expect(panel).toMatch(/Scratch the paper with a fingernail/);
  });
});
