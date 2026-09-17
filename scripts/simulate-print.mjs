// ============================================================
// PRINTER SIMULATOR
//
// Renders a slip exactly the way the desktop app's hidden print worker does,
// then runs the REAL raster conversion (electron/escposRaster.cjs) over the
// capture and writes out the 1-bit dot matrix the thermal head would mark.
//
// This answers the question a screenshot cannot: where does the ink actually
// land across the paper's 576 dots? It reports the measured left and right
// ink margins in millimetres, so "the right margin is too wide" becomes a
// number instead of an impression.
//
// Usage:
//   node scripts/simulate-print.mjs                 # all premium templates
//   node scripts/simulate-print.mjs premium-panel   # one template
//
// Requires the dev server on 127.0.0.1:5199 (see scripts/print-lab.html).
// ============================================================
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { rasterGeometry, escposRasterBytes } = require_('../electron/escposRaster.cjs');

const OUT = process.env.SIM_OUT || path.resolve('.print-sim');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAB = process.env.LAB_URL || 'http://127.0.0.1:5199/scripts/print-lab.html';

fs.mkdirSync(OUT, { recursive: true });

/** Decode a PNG buffer to { width, height, data } RGBA. */
function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

/**
 * Box-filter downscale to the printer's content width.
 *
 * Electron's NativeImage.resize does this in C++; doing it here with the
 * same target width keeps the simulation faithful. Averaging (rather than
 * nearest-neighbour) matters: it is what turns a supersampled render into
 * the grey levels the darkness threshold then judges.
 */
function resizeRgba(src, targetWidth) {
  const scale = src.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(src.height / scale));
  const out = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(src.height, Math.max(sy0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < targetWidth; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(src.width, Math.max(sx0 + 1, Math.floor((x + 1) * scale)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3];
          n++;
        }
      }
      const o = (y * targetWidth + x) * 4;
      // packDots reads BGRA order (Electron's toBitmap), so swap here.
      out[o] = b / n; out[o + 1] = g / n; out[o + 2] = r / n; out[o + 3] = a / n;
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

/**
 * Stand-in for the Electron NativeImage the print handler hands to the
 * raster stage. Implementing the same three methods means the simulator can
 * call the REAL escposRasterBytes rather than re-running its internals —
 * which is the whole point: a simulation that reimplements the pipeline
 * stops being evidence about the pipeline.
 */
function nativeImageLike(rgba) {
  return {
    getSize: () => ({ width: rgba.width, height: rgba.height }),
    resize: ({ width }) => nativeImageLike(resizeRgba(rgba, width)),
    toBitmap: () => rgba.data,
  };
}

/**
 * Decode the ESC/POS byte stream back into dot rows.
 *
 * This is what the printer's firmware does, so decoding it here checks the
 * bytes that actually leave the machine — including the GS v 0 header's row
 * count. A header claiming zero rows is precisely how a shipped build came
 * to feed and cut blank paper while reporting success, so it is an error
 * here, not a curiosity.
 */
function decodeEscposRaster(bytes) {
  const marker = Buffer.from([0x1d, 0x76, 0x30, 0x00]);
  const at = bytes.indexOf(marker);
  if (at < 0) throw new Error('no GS v 0 raster command in the output');
  const rowBytes = bytes[at + 4] | (bytes[at + 5] << 8);
  const height = bytes[at + 6] | (bytes[at + 7] << 8);
  if (!rowBytes || !height) {
    throw new Error(`raster header claims ${rowBytes} row-bytes x ${height} rows — the printer would feed blank paper`);
  }
  const start = at + 8;
  const expected = rowBytes * height;
  const data = bytes.subarray(start, start + expected);
  if (data.length < expected) {
    throw new Error(`raster data truncated: header wants ${expected} bytes, stream has ${data.length}`);
  }
  return { rowBytes, height, data };
}

/** Render the packed dot rows back out as a viewable PNG of the paper. */
function dotsToPng(packed, paperDots, file) {
  const { rowBytes, height, data } = packed;
  const png = new PNG({ width: paperDots, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < paperDots; x++) {
      const ink = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      const o = (y * paperDots + x) * 4;
      const v = ink ? 0 : 255;
      png.data[o] = v; png.data[o + 1] = v; png.data[o + 2] = v; png.data[o + 3] = 255;
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** Where the ink actually starts and stops across the paper. */
function measureInk(packed, paperDots, dotsPerMm) {
  const { rowBytes, height, data } = packed;
  let first = paperDots, last = -1, firstRow = -1, lastRow = -1;
  for (let y = 0; y < height; y++) {
    let rowHasInk = false;
    for (let x = 0; x < paperDots; x++) {
      if ((data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1) {
        if (x < first) first = x;
        if (x > last) last = x;
        rowHasInk = true;
      }
    }
    if (rowHasInk) {
      if (firstRow < 0) firstRow = y;
      lastRow = y;
    }
  }
  if (last < 0) return null;
  const mm = d => Math.round((d / dotsPerMm) * 10) / 10;
  return {
    leftGapDots: first,
    rightGapDots: paperDots - 1 - last,
    leftGapMm: mm(first),
    rightGapMm: mm(paperDots - 1 - last),
    inkWidthDots: last - first + 1,
    inkWidthMm: mm(last - first + 1),
    topBlankRows: firstRow,
    bottomBlankRows: height - 1 - lastRow,
    // 203 DPI: 8 dot rows per mm vertically as well.
    topBlankMm: Math.round((firstRow / 8) * 10) / 10,
    bottomBlankMm: Math.round(((height - 1 - lastRow) / 8) * 10) / 10,
    paperLengthMm: Math.round((height / 8) * 10) / 10,
  };
}

const only = process.argv[2];

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto(LAB, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__printLabReady === true, { timeout: 20000 });

const slips = await page.evaluate(() => window.__printLabSlips());
const results = [];

for (const slip of slips) {
  if (only && slip.id !== only) continue;

  // Build the real worker document for this slip, exactly as fastPrint does.
  const built = await page.evaluate(id => window.__printLabBuild(id), slip.id);

  const doc = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await doc.setContent(built.html, { waitUntil: 'networkidle' });
  await doc.evaluate(() => document.fonts && document.fonts.ready);

  const geom = rasterGeometry(built.paperLabel, built.marginLeftMm, built.marginRightMm);

  // Measure EXACTLY as electron/main.cjs does — including scrollWidth. If any
  // descendant overflows the slip box, the worker captures that wider area
  // and the downscale then squeezes the visible content into part of the
  // paper, leaving the rest blank. Screenshotting the element instead would
  // clip the overflow away and hide the very fault we are looking for.
  const measureJs = `(() => {
    const root = document.querySelector('.dt-fast-root') || document.body;
    const r = root.getBoundingClientRect();
    return {
      rectWidth: Math.ceil(r.width),
      scrollWidth: root.scrollWidth,
      width: Math.ceil(Math.max(r.width, root.scrollWidth, 1)),
      height: Math.ceil(Math.max(r.height, root.scrollHeight, document.body.scrollHeight, 1)),
    };
  })()`;
  const metrics = await doc.evaluate(measureJs);

  // Supersample the way capturePage does — through the device scale factor,
  // NOT CSS zoom. CSS zoom rescales getBoundingClientRect(), browser zoom
  // does not, and mixing the two is what produced a capture several times
  // too wide. The fixed main.cjs derives the capture size from this single
  // 1x measurement and never re-reads it, so the simulation does the same.
  const quality = 2;
  const requestedZoom = Math.max(1, Math.min(8, (geom.contentDots / metrics.width) * quality));
  const fittingZoom = Math.min(4000 / metrics.width, 30000 / metrics.height);
  const zoom = Math.max(1, Math.min(requestedZoom, fittingZoom));

  const capW = Math.ceil(metrics.width * zoom);
  const capH = Math.ceil(metrics.height * zoom);

  // deviceScaleFactor renders the same CSS layout at `zoom` device pixels per
  // CSS pixel, which is exactly what the worker's zoomed capture yields.
  const hi = await browser.newPage({
    viewport: { width: Math.ceil(metrics.width), height: Math.min(4000, Math.ceil(metrics.height)) },
    deviceScaleFactor: zoom,
  });
  await hi.setContent(built.html, { waitUntil: 'networkidle' });
  await hi.evaluate(() => document.fonts && document.fonts.ready);
  const shot = await hi.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x: 0, y: 0, width: Math.ceil(metrics.width), height: Math.min(4000, Math.ceil(metrics.height)) },
  });
  await hi.close();
  void capW; void capH;

  const supersampled = decodePng(shot);

  // Drive the REAL raster entry point with EXACTLY the options
  // electron/main.cjs passes it — no more, no less. Passing tidier arguments
  // than the caller uses is how a blank-paper bug slipped through: the
  // defaulting that broke was never exercised.
  const bytes = escposRasterBytes(nativeImageLike(supersampled), built.paperLabel, true, {
    darkness: built.darkness,
    bold: built.bold,
    marginLeftMm: built.marginLeftMm,
    marginRightMm: built.marginRightMm,
    bottomFeedLines: undefined,
  });
  // Decode the bytes back the way the printer's firmware would.
  const packed = decodeEscposRaster(bytes);

  const file = path.join(OUT, `${slip.id}.png`);
  dotsToPng(packed, geom.paperDots, file);
  const ink = measureInk(packed, geom.paperDots, geom.dotsPerMm);

  results.push({
    id: slip.id,
    label: slip.label,
    cssWidthPx: built.cssWidthPx,
    measuredRectPx: metrics.rectWidth,
    measuredScrollPx: metrics.scrollWidth,
    overflowPx: Math.max(0, metrics.scrollWidth - metrics.rectWidth),
    contentDots: geom.contentDots,
    escposBytes: bytes.length,
    rasterRows: packed.height,
    expectedLeftMm: built.marginLeftMm,
    expectedRightMm: built.marginRightMm,
    ...ink,
    file,
  });
  await doc.close();
}

await browser.close();
console.log(JSON.stringify({ pageErrors, results }, null, 2));
