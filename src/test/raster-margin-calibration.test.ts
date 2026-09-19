// ============================================================
// THE CALIBRATION MUST REACH THE PAPER IN AUTO / RAW FAST MODE.
//
// The shop's machine needs Left 3 / Right 5 to print a centred slip. In
// Windows Driver Only that pair works. In Auto / RAW Fast the same pair did
// not, and changing it did not move the print the way the number said.
//
// The cause was in the raster stage, not in the margin plumbing. The capture
// was cropped to its INK and that crop was then resized back up to the full
// content width — so the slip was stretched to fill whatever room the margins
// left, which undoes them. Worse, the crop is measured per bill: a receipt
// with a long widest line and one with a short widest line got different
// scale factors, so the same shop with the same settings got two widths.
//
// These tests drive the real raster pipeline with a NativeImage-shaped stub
// and assert the DOTS, because dots are what the printer receives. They cover
// the exact margin pairs the shop asked to be tested.
// ============================================================
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  escposRasterBytes, rasterGeometry, paperDotsOf,
} = require_('../../electron/escposRaster.cjs');

/** A NativeImage-shaped stub whose whole width is inked. */
function slipImage(width: number, height: number, inkFrom = 0, inkTo = width - 1) {
  const data = Buffer.alloc(width * height * 4, 0xff);
  for (let y = 0; y < height; y++) {
    for (let x = inkFrom; x <= inkTo; x++) {
      const i = (y * width + x) * 4;
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  const make = (w: number, h: number, buf: Buffer): any => ({
    getSize: () => ({ width: w, height: h }),
    toBitmap: () => buf,
    isEmpty: () => w === 0 || h === 0,
    crop: ({ x, y, width: cw, height: ch }: any) => {
      const out = Buffer.alloc(cw * ch * 4, 0xff);
      for (let row = 0; row < ch; row++) {
        buf.copy(out, row * cw * 4, ((y + row) * w + x) * 4, ((y + row) * w + x + cw) * 4);
      }
      return make(cw, ch, out);
    },
    resize: ({ width: rw, height: rh }: any) => {
      // Nearest-neighbour is enough: these tests measure WHERE the ink lands,
      // not how it is filtered.
      const out = Buffer.alloc(rw * rh * 4, 0xff);
      for (let y = 0; y < rh; y++) {
        const sy = Math.min(h - 1, Math.floor(y * h / rh));
        for (let x = 0; x < rw; x++) {
          const sx = Math.min(w - 1, Math.floor(x * w / rw));
          buf.copy(out, (y * rw + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
        }
      }
      return make(rw, rh, out);
    },
  });
  return make(width, height, data);
}

/** Where the ink actually starts and ends, read back out of the raster bytes. */
function inkSpan(bytes: Buffer, paperDots: number) {
  const rowBytes = Math.ceil(paperDots / 8);
  // Skip the init block and the GS v 0 header to reach the dot rows.
  const header = bytes.indexOf(Buffer.from([0x1d, 0x76, 0x30, 0x00]));
  expect(header, 'no raster header in the job').toBeGreaterThan(-1);
  const start = header + 8;
  let first = -1;
  let last = -1;
  for (let x = 0; x < paperDots; x++) {
    const byte = bytes[start + (x >> 3)];
    if (byte === undefined) break;
    if (byte & (0x80 >> (x & 7))) {
      if (first === -1) first = x;
      last = x;
    }
  }
  return { first, last };
}

/** GS L (left margin) and GS W (print area) as the printer will read them. */
function geometryCommands(bytes: Buffer) {
  const at = (a: number, b: number) => bytes.indexOf(Buffer.from([a, b]));
  const gsL = at(0x1d, 0x4c);
  const gsW = at(0x1d, 0x57);
  return {
    leftMargin: bytes[gsL + 2] | (bytes[gsL + 3] << 8),
    printArea: bytes[gsW + 2] | (bytes[gsW + 3] << 8),
  };
}

const DOTS_PER_MM = 8;

describe('the margin pairs the shop asked to be tested', () => {
  // Exactly the matrix from the request.
  const CASES: Array<[number, number]> = [
    [3, 5],   // the machine's own calibration
    [5, 5],
    [5, 3],
    [8, 5],
    [3, 8],
  ];

  for (const [left, right] of CASES) {
    it(`puts the slip at ${left}mm from the head with ${right}mm left over`, () => {
      const bytes = escposRasterBytes(slipImage(800, 60), '80mm', true, {
        marginLeftMm: left, marginRightMm: right,
      });
      const paperDots = paperDotsOf('80mm');
      const span = inkSpan(bytes, paperDots);

      // The ink begins exactly at the configured left margin...
      expect(span.first, `left margin ${left}mm did not reach the dots`).toBe(left * DOTS_PER_MM);
      // ...and stops exactly the configured right margin short of the head.
      expect(paperDots - 1 - span.last, `right margin ${right}mm did not reach the dots`)
        .toBe(right * DOTS_PER_MM);
    });
  }

  it('moves the slip when only the left margin changes', () => {
    // The complaint in one assertion: change the number, the print moves.
    const paperDots = paperDotsOf('80mm');
    const at3 = inkSpan(escposRasterBytes(slipImage(800, 60), '80mm', true,
      { marginLeftMm: 3, marginRightMm: 5 }), paperDots);
    const at8 = inkSpan(escposRasterBytes(slipImage(800, 60), '80mm', true,
      { marginLeftMm: 8, marginRightMm: 5 }), paperDots);

    expect(at8.first - at3.first).toBe(5 * DOTS_PER_MM);
  });

  it('moves it the other way when only the right margin changes', () => {
    const paperDots = paperDotsOf('80mm');
    const at5 = inkSpan(escposRasterBytes(slipImage(800, 60), '80mm', true,
      { marginLeftMm: 3, marginRightMm: 5 }), paperDots);
    const at8 = inkSpan(escposRasterBytes(slipImage(800, 60), '80mm', true,
      { marginLeftMm: 3, marginRightMm: 8 }), paperDots);

    expect(at5.last - at8.last).toBe(3 * DOTS_PER_MM);
    expect(at8.first).toBe(at5.first);
  });
});

describe('the ink crop no longer stretches the slip', () => {
  it('gives two bills of different widths the SAME margins', () => {
    // THE BUG. The crop measured each capture's own ink and resized it back
    // up to the content width, so a bill whose widest line was short was
    // stretched more than one whose widest line was long. Same shop, same
    // settings, two widths.
    const paperDots = paperDotsOf('80mm');
    const wide = slipImage(800, 60, 0, 799);        // a long widest line
    const narrow = slipImage(800, 60, 100, 699);    // a short one

    const a = inkSpan(escposRasterBytes(wide, '80mm', true, { marginLeftMm: 3, marginRightMm: 5 }), paperDots);
    const b = inkSpan(escposRasterBytes(narrow, '80mm', true, { marginLeftMm: 3, marginRightMm: 5 }), paperDots);

    // The narrow bill keeps its own inset instead of being stretched out to
    // the same edges as the wide one.
    expect(a.first).toBe(3 * DOTS_PER_MM);
    expect(b.first).toBeGreaterThan(a.first);
  });

  it('still crops when a caller explicitly asks for it', () => {
    // The behaviour is kept, just no longer the default.
    const paperDots = paperDotsOf('80mm');
    const narrow = slipImage(800, 60, 100, 699);
    const cropped = inkSpan(
      escposRasterBytes(narrow, '80mm', true, { marginLeftMm: 3, marginRightMm: 5, cropBlankSides: true }),
      paperDots,
    );
    expect(cropped.first).toBe(3 * DOTS_PER_MM);
  });
});

describe('the printer is told the full head, and positioned by the dots', () => {
  it('sets GS L to zero and GS W to the whole printable width', () => {
    // The raster already places the slip at the right dot column, so the
    // printer's own margin must be zero or the two offsets add up and push
    // the content off the right edge.
    const bytes = escposRasterBytes(slipImage(800, 60), '80mm', true,
      { marginLeftMm: 3, marginRightMm: 5 });
    const cmd = geometryCommands(bytes);
    expect(cmd.leftMargin).toBe(0);
    expect(cmd.printArea).toBe(paperDotsOf('80mm'));
  });

  it('computes the same geometry on 58mm paper', () => {
    const geom = rasterGeometry('58mm', 3, 5);
    expect(geom.paperDots).toBe(384);
    expect(geom.leftDots).toBe(24);
    expect(geom.rightDots).toBe(40);
    expect(geom.contentDots).toBe(384 - 24 - 40);
  });

  it('never lets an absurd margin leave no slip at all', () => {
    const geom = rasterGeometry('80mm', 60, 60);
    expect(geom.contentDots).toBeGreaterThanOrEqual(32);
    expect(geom.leftDots + geom.contentDots).toBeLessThanOrEqual(geom.paperDots);
  });
});
