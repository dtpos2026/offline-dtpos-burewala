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
const { STANDARD_WEIGHT_JS } = require_('../electron/textWeight.cjs');
const { reversedTextJs, cutoffFor } = require_('../electron/reversedText.cjs');
const { CODE_BOXES_JS, toCaptureRegions } = require_('../electron/codeRegions.cjs');
// The print window keeps white text white on dark fills; SIM_NO_REVERSE=1
// shows what the slips printed before that step existed.
const REVERSE = process.env.SIM_NO_REVERSE !== '1';
// SIM_PRESET mirrors Print Quality → Text weight: 'standard' (default in the
// app), 'bold', or 'extra' (the old default: darkness 7 + one-dot smear).
const PRESET = process.env.SIM_PRESET || 'bold';
const PRESETS = { standard: { darkness: 6, bold: false }, bold: { darkness: 6, bold: false }, extra: { darkness: 7, bold: true } };
const preset = PRESETS[PRESET] || PRESETS.bold;

// Darkness the raster stage uses for this run (see packDots' cut-off).
const DARKNESS = process.env.SIM_PRESET ? preset.darkness : 6;
const CUTOFF = 108 + Math.max(1, Math.min(10, DARKNESS)) * 13;

/**
 * Text the thermal head cannot show.
 *
 * The head marks a dot wherever the pixel is darker than the cut-off. Text is
 * readable only when it and the paint behind it fall on opposite sides of
 * that line: black on paper, or paper-white on a solid black fill. Both on
 * the same side — black text on a black bar — is a line that prints as a
 * solid block or not at all. Independent of how the app decides colours, so
 * it checks the fix instead of repeating it.
 */
const VISIBILITY_FN = (cutoff) => {
  const root = document.querySelector('.dt-fast-root') || document.body;
  const origin = root.getBoundingClientRect();
  const parse = (v) => {
    const m = /rgba?\(([^)]*)\)/.exec(v || '');
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (c, base) => ({ r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a), a: 1 });
  const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  const paint = (el) => {
    const chain = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) chain.push(e);
    let c = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = chain.length - 1; i >= 0; i--) {
      const b = parse(getComputedStyle(chain[i]).backgroundColor);
      if (b && b.a > 0) c = over(b, c);
    }
    return c;
  };
  const invisible = [];
  const reversed = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const bg = paint(el);
    const fg = over(parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 }, bg);
    // Measure over the text itself, not its (often full-width) box: a short
    // word in a wide bar is mostly bar.
    const range = document.createRange();
    range.selectNodeContents(n);
    const t = range.getBoundingClientRect();
    const box = t.width > 0 && t.height > 0 ? t : r;
    const item = {
      text: text.slice(0, 48),
      color: cs.color,
      background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height,
    };
    const fgInk = lum(fg) < cutoff;
    const bgInk = lum(bg) < cutoff;
    if (fgInk === bgInk) invisible.push(item);
    else if (bgInk) reversed.push(item);
  }
  return { invisible, reversed };
};

/** Elements that stick out past the slip's right edge (what overflowPx measures). */
const OVERFLOW_FN = () => {
  const root = document.querySelector('.dt-fast-root') || document.body;
  const edge = root.getBoundingClientRect().right + 0.5;
  const out = [];
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > edge) {
      out.push({ tag: el.tagName.toLowerCase(), over: Math.round(r.right - edge + 0.5), width: Math.round(r.width), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), style: (el.getAttribute('style') || '').slice(0, 90) });
    }
  }
  // Text that runs past its own box (nowrap, pre, letter-spacing) sticks out
  // without any element doing so.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.right > edge) {
        const el = n.parentElement;
        out.push({ tag: '#text in ' + (el ? el.tagName.toLowerCase() : '?'), over: Math.round(r.right - edge + 0.5), width: Math.round(r.width), text: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), style: el ? (el.getAttribute('style') || '').slice(0, 90) : '' });
        break;
      }
    }
  }
  // Deepest culprits first: a parent sticks out only because a child does.
  return out.filter(o => !out.some(p => p !== o && p.text.includes(o.text) && p.width < o.width)).slice(-6);
};

/** Share of paper-white dots the raster stage leaves inside a box. */
function paperShare(resized, cssToDots, box, cutoff) {
  const x0 = Math.max(0, Math.floor(box.x * cssToDots));
  const y0 = Math.max(0, Math.floor(box.y * cssToDots));
  const x1 = Math.min(resized.width, Math.ceil((box.x + box.w) * cssToDots));
  const y1 = Math.min(resized.height, Math.ceil((box.y + box.h) * cssToDots));
  let paper = 0, total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * resized.width + x) * 4;
      // BGRA, as packDots reads it
      const l = 0.299 * resized.data[i + 2] + 0.587 * resized.data[i + 1] + 0.114 * resized.data[i];
      if (l >= cutoff) paper++;
      total++;
    }
  }
  return total ? paper / total : 0;
}

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
  // The slip arrives as consecutive GS v 0 bands (escposRaster.cjs,
  // RASTER_BAND_ROWS). Each band is read the way the firmware reads it, and
  // the next band must start exactly where this one's data ends — a stray
  // byte between bands would print as a character or shift every later row.
  const marker = Buffer.from([0x1d, 0x76, 0x30, 0x00]);
  let at = bytes.indexOf(marker);
  if (at < 0) throw new Error('no GS v 0 raster command in the output');
  const parts = [];
  let rowBytes = 0;
  let height = 0;
  let bands = 0;
  let maxBandRows = 0;
  while (at >= 0) {
    const rb = bytes[at + 4] | (bytes[at + 5] << 8);
    const rows = bytes[at + 6] | (bytes[at + 7] << 8);
    if (!rb || !rows) {
      throw new Error(`raster header claims ${rb} row-bytes x ${rows} rows — the printer would feed blank paper`);
    }
    if (rowBytes && rb !== rowBytes) throw new Error(`band ${bands + 1} is ${rb} bytes wide, band 1 was ${rowBytes}`);
    rowBytes = rb;
    const start = at + 8;
    const expected = rb * rows;
    const data = bytes.subarray(start, start + expected);
    if (data.length < expected) {
      throw new Error(`raster data truncated: band ${bands + 1} wants ${expected} bytes, stream has ${data.length}`);
    }
    parts.push(data);
    height += rows;
    bands++;
    maxBandRows = Math.max(maxBandRows, rows);
    const next = start + expected;
    at = bytes.indexOf(marker, next);
    if (at !== -1 && at !== next) throw new Error(`unexpected ${at - next} byte(s) between raster bands ${bands} and ${bands + 1}`);
  }
  return { rowBytes, height, data: Buffer.concat(parts), bands, maxBandRows };
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
  if (PRESET === 'standard') await doc.evaluate(STANDARD_WEIGHT_JS);
  if (REVERSE) await doc.evaluate(reversedTextJs(cutoffFor(DARKNESS)));

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
  const codeBoxes = await doc.evaluate(CODE_BOXES_JS);
  const visibility = await doc.evaluate(VISIBILITY_FN, CUTOFF);
  const overflowBy = metrics.scrollWidth > metrics.rectWidth ? await doc.evaluate(OVERFLOW_FN) : [];

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
  if (PRESET === 'standard') await hi.evaluate(STANDARD_WEIGHT_JS);
  if (REVERSE) await hi.evaluate(reversedTextJs(cutoffFor(DARKNESS)));
  const shot = await hi.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x: 0, y: 0, width: Math.ceil(metrics.width), height: Math.min(4000, Math.ceil(metrics.height)) },
  });
  await hi.close();
  void capW; void capH;

  const supersampled = decodePng(shot);
  // White text on a black fill must survive the threshold: measure the paper
  // dots left inside each reversed line, on the same downscale the raster
  // stage makes.
  const resized = resizeRgba(supersampled, geom.contentDots);
  const cssToDots = geom.contentDots / metrics.width;
  const reversed = visibility.reversed.map(b => ({ text: b.text, paperPct: Math.round(paperShare(resized, cssToDots, b, CUTOFF) * 1000) / 10 }));

  // Drive the REAL raster entry point with EXACTLY the options
  // electron/main.cjs passes it — no more, no less. Passing tidier arguments
  // than the caller uses is how a blank-paper bug slipped through: the
  // defaulting that broke was never exercised.
  const bytes = escposRasterBytes(nativeImageLike(supersampled), built.paperLabel, true, {
    darkness: process.env.SIM_PRESET ? preset.darkness : built.darkness,
    bold: process.env.SIM_PRESET ? preset.bold : built.bold,
    marginLeftMm: built.marginLeftMm,
    marginRightMm: built.marginRightMm,
    bottomFeedLines: undefined,
    exactRegions: process.env.SIM_NO_EXACT === '1' ? undefined : toCaptureRegions(codeBoxes, zoom),
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
    overflowBy,
    contentDots: geom.contentDots,
    escposBytes: bytes.length,
    rasterRows: packed.height,
    rasterBands: packed.bands,
    maxBandRows: packed.maxBandRows,
    expectedLeftMm: built.marginLeftMm,
    expectedRightMm: built.marginRightMm,
    ...ink,
    // Text that cannot print (same side of the ink threshold as its paint).
    invisibleText: visibility.invisible.length,
    invisibleSamples: visibility.invisible.slice(0, 6).map(v => `${v.text} [${v.color} on ${v.background}]`),
    // White-on-black lines, and the share of white dots left in each.
    reversedLines: reversed.length,
    reversedFaint: reversed.filter(r => r.paperPct < 8),
    reversedAll: reversed,
    file,
  });
  await doc.close();
}

await browser.close();
console.log(JSON.stringify({ pageErrors, results }, null, 2));
