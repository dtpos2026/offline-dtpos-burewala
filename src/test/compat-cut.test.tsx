// ============================================================
// COMPATIBILITY CUT — "feed, then cut" for a printer that cuts early.
//
// Reported on a BIXOLON SRP-352plus III: the cutter fires before the last line
// has passed the blade, so the footer ("Printed …") is cut through and its
// remainder comes out on top of the NEXT slip. The option pads the slip so the
// paper moves whatever the printer does with a feed command.
//
// Pinned (byte by byte, because the whole value is in what the printer receives):
//   • OFF: every path sends exactly what it always sent;
//   • ON, raster: blank DOT ROWS (no ink) after the slip, ESC 2, plain LFs, then
//     one cut — and the rows are real raster bands the printer firmware decodes;
//   • ON, ESC/POS text: more plain LFs, no ESC d, then the cut;
//   • ON, Windows driver: more blank clearance before the dot;
//   • the switch is device-local, off by default, and in Settings → Printer and
//     Printer Center.
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EscposDoc } from '@/printing/escposBuilder';
import { buildEscposFromHtml } from '@/printing/escpos';
import { buildWorkerDocument } from '@/printing/fastPrint';
import {
  isCompatCut, setCompatCut, COMPAT_CUT_KEY, COMPAT_PAD_MM, COMPAT_FEED_LINES, COMPAT_MIN_TEXT_FEED_LINES, COMPAT_DRIVER_EXTRA_MM,
} from '@/printing/cutPrefs';
import CompatCutCard, { CompatCutToggle } from '@/components/CompatCutToggle';

const require_ = createRequire(import.meta.url);
const raster = require_('../../electron/escposRaster.cjs');
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** A packed slip of `rows` rows, 32 dots wide, with ink on the first row. */
function slip(rows = 4, paperDots = 32) {
  const rowBytes = paperDots / 8;
  const data = Buffer.alloc(rowBytes * rows);
  data[0] = 0xff;
  return { rowBytes, height: rows, data };
}

/** Everything after the last raster band, and the raster rows that had no ink. */
function parse(bytes: Buffer, rowBytes = 4) {
  const marker = Buffer.from([0x1d, 0x76, 0x30, 0x00]);
  let at = bytes.indexOf(marker);
  let rows = 0, blankRows = 0, end = 0;
  while (at >= 0) {
    const rb = bytes[at + 4] | (bytes[at + 5] << 8);
    const n = bytes[at + 6] | (bytes[at + 7] << 8);
    expect(rb).toBe(rowBytes);
    const start = at + 8;
    const data = bytes.subarray(start, start + rb * n);
    expect(data.length).toBe(rb * n);                       // a band the firmware can read
    for (let y = 0; y < n; y++) if (data.subarray(y * rb, (y + 1) * rb).every(b => b === 0)) blankRows++;
    rows += n; end = start + rb * n;
    at = bytes.indexOf(marker, end);
    if (at !== -1) expect(at).toBe(end);                    // bands are consecutive
  }
  return { rows, blankRows, tail: bytes.subarray(end) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => cleanup());

describe('the preference', () => {
  it('is off until a shop turns it on, and lives on this computer', () => {
    expect(isCompatCut()).toBe(false);
    setCompatCut(true);
    expect(localStorage.getItem(COMPAT_CUT_KEY)).toBe('1');
    expect(isCompatCut()).toBe(true);
    setCompatCut(false);
    expect(localStorage.getItem(COMPAT_CUT_KEY)).toBeNull();
    expect(isCompatCut()).toBe(false);
  });
});

describe('raster (the rendered slip, as RAW)', () => {
  it('OFF: the same bytes as before — ESC d n, then the cut', () => {
    const out = raster.wrapRasterCommands(slip(), true, { bottomFeedLines: 6 });
    const p = parse(out);
    expect(p.rows).toBe(4);
    expect([...p.tail]).toEqual([0x1b, 0x64, 6, 0x1d, 0x56, 0x00]);
    // The caller passing compatCut: false changes nothing either.
    expect(raster.wrapRasterCommands(slip(), true, { bottomFeedLines: 6, compatCut: false }).equals(out)).toBe(true);
  });

  it('ON: blank dot rows after the slip, ESC 2, plain line feeds, then ONE cut', () => {
    const out = raster.wrapRasterCommands(slip(), true, { bottomFeedLines: 6, compatCut: true });
    const p = parse(out);
    expect(p.rows).toBe(4 + COMPAT_PAD_MM * 8);                  // 4 slip rows + 20 mm of padding at 8 dots/mm
    expect(p.blankRows).toBe(COMPAT_PAD_MM * 8 + 3);            // the padding and the three blank slip rows: no ink
    expect([...p.tail]).toEqual([0x1b, 0x32, ...Array(COMPAT_FEED_LINES).fill(0x0a), 0x1d, 0x56, 0x00]);
    // The ink is still only where the slip put it.
    expect(out[13 + 8]).toBe(0xff);                          // first data byte after ESC @ … and the first band header
  });

  it('ON: a long padding is cut into bands the printer accepts (128 rows at most)', () => {
    const out = raster.wrapRasterCommands(slip(), true, { compatCut: true, compatPadMm: 50 });
    const marker = Buffer.from([0x1d, 0x76, 0x30, 0x00]);
    let at = out.indexOf(marker); let max = 0;
    while (at >= 0) { max = Math.max(max, out[at + 6] | (out[at + 7] << 8)); at = out.indexOf(marker, at + 4); }
    expect(max).toBeLessThanOrEqual(raster.RASTER_BAND_ROWS);
    expect(parse(out).rows).toBe(4 + 50 * 8);
  });

  it('ON: the printer\'s own extra feed (Bottom mm) adds to the padding', () => {
    const base = parse(raster.wrapRasterCommands(slip(), true, { compatCut: true, compatPadMm: COMPAT_PAD_MM })).rows;
    const more = parse(raster.wrapRasterCommands(slip(), true, { compatCut: true, compatPadMm: COMPAT_PAD_MM + 6 })).rows;
    expect(more - base).toBe(48);
  });

  it('ON but Auto Cut off: no cut and no padding — the option never cuts when cutting is off', () => {
    const out = raster.wrapRasterCommands(slip(), false, { compatCut: true });
    const p = parse(out);
    expect(p.rows).toBe(4);
    expect([...p.tail]).toEqual([0x1b, 0x64, 1]);
  });

  it('keeps the empty-slip guard', () => {
    expect(() => raster.wrapRasterCommands({ rowBytes: 4, height: 0, data: Buffer.alloc(0) }, true, { compatCut: true })).toThrow(/empty/i);
  });
});

describe('ESC/POS text (LAN and raw USB)', () => {
  const tail = (bytes: number[], n: number) => bytes.slice(-n);

  it('builder OFF: ESC d n, then the cut', () => {
    const b = new EscposDoc('80mm').text('hello').cut(6, false).bytes();
    expect(tail(b, 6)).toEqual([0x1b, 0x64, 6, 0x1d, 0x56, 0x00]);
  });

  it('builder ON: only plain line feeds (no ESC d), at least eight, then the cut', () => {
    const b = new EscposDoc('80mm').text('hello').cut(6, true).bytes();
    const afterEsc2 = b.slice(b.lastIndexOf(0x32, b.length - 1) - 1);
    expect(b.slice(-3)).toEqual([0x1d, 0x56, 0x00]);
    const feeds = b.slice(0, -3).reverse().findIndex(x => x !== 0x0a);
    expect(feeds).toBeGreaterThanOrEqual(COMPAT_MIN_TEXT_FEED_LINES);
    expect(afterEsc2.includes(0x64)).toBe(false);
  });

  it('builder follows this computer\'s setting when the caller does not say', () => {
    const off = new EscposDoc('80mm').text('x').cut().bytes();
    setCompatCut(true);
    const on = new EscposDoc('80mm').text('x').cut().bytes();
    expect(on.length).toBeGreaterThan(off.length);
  });

  it('HTML → ESC/POS: OFF keeps its three bottom feeds; ON has at least eight, before the same cut', () => {
    const feedsBefore = (bytes: number[]) => {
      const cut = bytes.length - 3;
      let n = 0; while (bytes[cut - 1 - n] === 0x0a) n++;
      return n;
    };
    const off = buildEscposFromHtml('<p>Hello there, a receipt</p>', { compatCut: false });
    const on = buildEscposFromHtml('<p>Hello there, a receipt</p>', { compatCut: true });
    expect(off.slice(-3)).toEqual([0x1d, 0x56, 0x00]);
    expect(on.slice(-3)).toEqual([0x1d, 0x56, 0x00]);
    expect(feedsBefore(on) - feedsBefore(off)).toBe(COMPAT_MIN_TEXT_FEED_LINES - 3);
    expect(feedsBefore(on)).toBeGreaterThanOrEqual(COMPAT_MIN_TEXT_FEED_LINES);
    // and with no say-so it reads the setting
    setCompatCut(true);
    expect(feedsBefore(buildEscposFromHtml('<p>Hello there, a receipt</p>'))).toBeGreaterThanOrEqual(COMPAT_MIN_TEXT_FEED_LINES);
  });
});

describe('Windows driver', () => {
  const clearance = (html: string) => Number(/class="dt-cut-clearance"[^>]*><div style="display:block;height:([\d.]+)mm;/.exec(html)![1]);
  const args = { html: '<div>slip</div>', paperWidth: '80mm' as const, autoCut: true };

  it('ON adds blank clearance before the dot the driver has to print', () => {
    const off = clearance(buildWorkerDocument({ ...args, compatCut: false }, 'html').html);
    const on = clearance(buildWorkerDocument({ ...args, compatCut: true }, 'html').html);
    expect(on - off).toBe(COMPAT_DRIVER_EXTRA_MM);
    // the setting is read when the caller says nothing
    setCompatCut(true);
    expect(clearance(buildWorkerDocument(args, 'html').html)).toBe(on);
  });

  it('is never applied to the raster document, which pads inside the image instead', () => {
    expect(buildWorkerDocument({ ...args, compatCut: true }, 'raster').html).not.toContain('dt-cut-clearance');
  });
});

describe('the print path hands the option to the printer process', () => {
  it('fastPrint passes it with the extra feed; main forwards it to the raster stage', () => {
    const fast = read('printing/fastPrint.ts');
    expect(fast).toMatch(/compatCut: compatOf\(args\),\s*compatPadMm: COMPAT_PAD_MM \+ extraFeed\(args\)/);
    const main = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');
    expect(main).toMatch(/compatCut: options\.compatCut === true,\s*compatPadMm: options\.compatPadMm/);
  });
});

describe('the switch', () => {
  it('is in Settings → Printer and in Printer Center → Print quality', () => {
    expect(read('components/settings/PrinterSettingsTab.tsx')).toMatch(/<CompatCutToggle \/>/);
    const page = read('pages/PrinterSettingsPage.tsx');
    expect(page).toMatch(/<PrintQualityCard \/>\s*<CompatCutCard \/>/);
  });

  it('turns it on and off, and says what it does', () => {
    render(<CompatCutCard />);
    expect(document.querySelector('[data-compat-cut]')!.textContent).toMatch(/cuts through the last line/);
    const sw = screen.getByRole('switch', { name: /Compatibility cut for older printers \(feed, then cut\)/ });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(isCompatCut()).toBe(true);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(isCompatCut()).toBe(false);
  });

  it('two copies of the switch stay in step', () => {
    render(<><CompatCutToggle /><CompatCutToggle /></>);
    const [a, b] = screen.getAllByRole('switch');
    fireEvent.click(a);
    expect(b).toHaveAttribute('aria-checked', 'true');
  });
});
