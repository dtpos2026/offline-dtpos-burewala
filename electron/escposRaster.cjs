// ============================================================
// ESC/POS RASTER CONVERSION
//
// Turns a rendered receipt bitmap into the bytes a thermal printer marks.
// Extracted from main.cjs so the exact same code can be driven offline by
// the printer simulator (scripts/simulate-print.mjs) — a copy would drift,
// and then the simulation would stop telling the truth about the paper.
//
// Quality rules:
//   • The capture is produced at (or above) the printer's real dot width, so
//     the bitmap is DOWN-sampled, never up-scaled — up-scaling a 302px render
//     to 576 dots was the cause of the blurred / faded print.
//   • Darkness is user tunable: it moves the black/white cut-off.
//   • Bold adds a 1-dot horizontal smear so thin fonts stay solid.
//   • Left/right margins are honoured in DOTS, so they apply even in raw mode.
// ============================================================

/**
 * Coerce to a finite number, falling back when it is not one.
 *
 * `Number(undefined) ?? fallback` does NOT work: ?? only catches null and
 * undefined, and Number(undefined) is NaN. That mistake made the trim below
 * compute a NaN height, which produced an empty buffer and a raster header
 * claiming zero rows — the printer fed and cut blank paper on every job.
 */
function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Printable width in dots at 203 DPI. */
function paperDotsOf(paperLabel) {
  return paperLabel === '58mm' ? 384 : paperLabel === '110mm' ? 832 : 576;
}

/** Printable width in mm — always less than the roll width. */
function paperMmOf(paperLabel) {
  return paperLabel === '58mm' ? 48 : paperLabel === '110mm' ? 104 : 72;
}

/**
 * Work out where the content sits across the paper's dots.
 *
 * Returned separately from the pixel loop so the simulator (and tests) can
 * assert the geometry without rendering anything.
 */
function rasterGeometry(paperLabel, marginLeftMm, marginRightMm) {
  const paperDots = paperDotsOf(paperLabel);
  const paperMm = paperMmOf(paperLabel);
  const dotsPerMm = paperDots / paperMm;
  const leftDots = Math.max(0, Math.min(paperDots - 32, Math.round((Number(marginLeftMm) || 0) * dotsPerMm)));
  const rightDots = Math.max(0, Math.min(paperDots - 32 - leftDots, Math.round((Number(marginRightMm) || 0) * dotsPerMm)));
  const contentDots = Math.max(32, paperDots - leftDots - rightDots);
  return { paperDots, paperMm, dotsPerMm, leftDots, rightDots, contentDots };
}

/**
 * Convert an RGBA bitmap to a 1-bit dot matrix laid out across the paper.
 *
 * `pixels` is BGRA or RGBA 4 bytes per pixel — the channel order only shifts
 * the luminance weights slightly, which is below the black/white threshold.
 * Returns { rowBytes, height, data } where `data` is the packed dot rows.
 */
function packDots(pixels, width, height, geom, opts = {}) {
  // darkness 1 (lightest) .. 10 (darkest) -> luminance cut-off 121..238
  const darkness = Math.max(1, Math.min(10, Math.round(Number(opts.darkness) || 6)));
  const cutoff = 108 + darkness * 13;
  const bold = opts.bold === true;
  const { paperDots, leftDots } = geom;

  const rowBytes = Math.ceil(paperDots / 8);
  const data = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowBytes;
    let prevInk = false;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const b = pixels[i] || 0;
      const g = pixels[i + 1] || 0;
      const r = pixels[i + 2] || 0;
      const a = pixels[i + 3] ?? 255;
      const alpha = a / 255;
      const lum = ((0.299 * r + 0.587 * g + 0.114 * b) * alpha) + (255 * (1 - alpha));
      const ink = lum < cutoff;
      if (ink || (bold && prevInk)) {
        const px = x + leftDots;
        if (px < paperDots) data[rowOff + (px >> 3)] |= (0x80 >> (px & 7));
      }
      prevInk = ink;
    }
  }
  return { rowBytes, height, data };
}

/**
 * Drop blank dot rows from the top and bottom of a slip.
 *
 * A rendered document carries its own trailing space — the last element's
 * margin, the body's bottom edge, a rounding row or two — and every one of
 * those rows is real paper the printer feeds before the cut. On an 80mm
 * receipt this measured over 15mm of blank tail on top of the cutter feed.
 *
 * `keepTop`/`keepBottom` leave a deliberate breathing margin so the first
 * line is not flush against the tear edge.
 */
function trimBlankRows(packed, keepTop = 0, keepBottom = 0) {
  const { rowBytes, height, data } = packed;
  // Never let a bad margin value turn into a NaN slice.
  const padTop = Math.max(0, Math.round(finite(keepTop, 0)));
  const padBottom = Math.max(0, Math.round(finite(keepBottom, 0)));
  const rowIsBlank = (y) => {
    const off = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) if (data[off + i] !== 0) return false;
    return true;
  };
  let first = 0;
  while (first < height && rowIsBlank(first)) first++;
  // Entirely blank — leave it to the caller's empty-slip guard.
  if (first >= height) return packed;
  let last = height - 1;
  while (last > first && rowIsBlank(last)) last--;

  const top = Math.max(0, first - padTop);
  const bottom = Math.min(height - 1, last + padBottom);
  const newHeight = bottom - top + 1;
  if (newHeight === height) return packed;
  return {
    rowBytes,
    height: newHeight,
    data: data.subarray(top * rowBytes, (bottom + 1) * rowBytes),
  };
}

/**
 * How much of the printable width the ink actually covers, 0..1.
 *
 * A healthy slip fills nearly all of it. A low value means the capture was
 * wider than the slip and the downscale squeezed the content into part of
 * the roll, which is worth surfacing in the log rather than silently
 * printing a narrow receipt with a wide blank margin.
 */
function inkCoverage(packed, contentDots) {
  const { rowBytes, height, data } = packed;
  let first = -1, last = -1;
  for (let y = 0; y < height; y++) {
    const off = y * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const byte = data[off + i];
      if (!byte) continue;
      for (let bit = 0; bit < 8; bit++) {
        if ((byte >> (7 - bit)) & 1) {
          const x = i * 8 + bit;
          if (first < 0 || x < first) first = x;
          if (x > last) last = x;
        }
      }
    }
  }
  if (last < 0) return 0;
  return (last - first + 1) / Math.max(1, contentDots);
}

/** Wrap packed dot rows in the ESC/POS commands that print and cut them. */
function wrapRasterCommands(packed, autoCut = true, opts = {}) {
  const { rowBytes, height, data } = packed;
  // A raster header claiming zero rows makes the printer feed and cut blank
  // paper while reporting success. Refuse it: the caller treats a throw as a
  // failed raster and falls back to the driver's own HTML path, so the slip
  // still prints instead of silently coming out empty.
  if (!Number.isFinite(height) || height < 1 || !data || data.length < rowBytes) {
    throw new Error('Rendered receipt is empty — refusing to send a blank raster');
  }
  // ===== STICKY GEOMETRY RESET =====
  // `GS L` (left margin) and `GS W` (print area width) persist in the
  // printer's NVRAM between jobs and are NOT cleared by `ESC @` on many
  // models. A printer left with a non-zero left margin, or a print-area
  // width below its full dot count, shifts and clips every later job — the
  // slip prints tight to the left with a wide blank band down the right.
  //
  // This path already positions the slip itself: packDots writes the bitmap
  // at `leftDots` across the full paper width. So the printer's own margin
  // must be ZERO and its print area the FULL width, or the two offsets add
  // up and the content is pushed off the right edge.
  const paperDots = Math.max(1, Math.min(65535, rowBytes * 8));
  const init = Buffer.from([
    0x1b, 0x40,                                             // ESC @  initialize
    0x1d, 0x4c, 0x00, 0x00,                                 // GS L   left margin = 0
    0x1d, 0x57, paperDots & 0xff, (paperDots >> 8) & 0xff,  // GS W   full print area
    0x1b, 0x61, 0x00,                                       // ESC a  left align
  ]);
  const raster = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    rowBytes & 0xff, (rowBytes >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);
  // Keep the cutter safely below the final printed row. Some thermal cutters
  // sit 12–25 mm after the print head; three LF bytes were not enough on those
  // models and the last line looked prematurely cut. ESC d feeds exact blank
  // lines, then one (and only one) cut command is sent.
  const bottomFeedLines = Math.max(3, Math.min(12, Math.round(Number(opts.bottomFeedLines) || 6)));
  const tail = autoCut
    ? Buffer.from([0x1b, 0x64, bottomFeedLines, 0x1d, 0x56, 0x00])
    : Buffer.from([0x1b, 0x64, 1]);
  return Buffer.concat([init, raster, data, tail]);
}

/**
 * Find the first and last columns that carry ink in an RGBA bitmap.
 *
 * Returns null when the bitmap is blank, so the caller leaves it alone and
 * the existing empty-slip guard handles it.
 */
function inkColumns(pixels, width, height, cutoff = 200) {
  let first = -1, last = -1;
  // Every 4th row is plenty to locate the edges and keeps this cheap on a
  // long bill, where the bitmap can be tens of thousands of rows.
  for (let y = 0; y < height; y += 4) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const a = pixels[i + 3] ?? 255;
      if (a < 8) continue;
      const lum = (0.299 * pixels[i + 2] + 0.587 * pixels[i + 1] + 0.114 * pixels[i]) * (a / 255)
        + 255 * (1 - a / 255);
      if (lum < cutoff) {
        if (first < 0 || x < first) first = x;
        if (x > last) last = x;
      }
    }
  }
  return last < 0 ? null : { first, last };
}

/**
 * Trim blank columns from the sides of the capture.
 *
 * ===== WHY THIS EXISTS =====
 * The slip is captured from the print worker's VIEWPORT, and the viewport is
 * only exactly the slip when every step lines up: setContentSize must not be
 * clamped, the zoom factor must map CSS pixels to device pixels as expected,
 * and no child may overflow the authored width. On a real Windows machine any
 * one of those can leave blank space beside the content — and because the
 * capture is then downscaled so its FULL width fills the printable dots, that
 * blank space steals room from the receipt. The slip comes out narrow with a
 * wide band down one side, which is what "Automatic" was printing while the
 * Windows driver path, which never goes through a capture, looked perfect.
 *
 * Trimming the blank first means the RECEIPT fills the printable width,
 * whatever the capture picked up around it.
 *
 * `maxScaleUp` stops this rescuing a slip that is legitimately narrow: a
 * capture whose ink covers less than 1/maxScaleUp of its width is left alone,
 * because enlarging it that far would be a guess, not a fix.
 */
function cropBlankSides(image, opts = {}) {
  const maxScaleUp = Number(opts.maxScaleUp) || 2.2;
  const size = image.getSize();
  if (!size.width || !size.height) return { image, trimmedLeft: 0, trimmedRight: 0 };

  const ink = inkColumns(image.toBitmap(), size.width, size.height);
  if (!ink) return { image, trimmedLeft: 0, trimmedRight: 0 };

  const inkWidth = ink.last - ink.first + 1;
  const trimmedLeft = ink.first;
  const trimmedRight = size.width - 1 - ink.last;

  // Nothing worth trimming, or the ink is too small a fraction to trust.
  if (trimmedLeft + trimmedRight < 2) return { image, trimmedLeft: 0, trimmedRight: 0 };
  if (inkWidth * maxScaleUp < size.width) return { image, trimmedLeft: 0, trimmedRight: 0 };

  const cropped = image.crop({ x: ink.first, y: 0, width: inkWidth, height: size.height });
  return { image: cropped, trimmedLeft, trimmedRight };
}

/**
 * Full pipeline for an Electron NativeImage. Kept as the one entry point
 * main.cjs calls, so the resize step stays in step with the dot packing.
 */
function escposRasterBytes(image, paperLabel, autoCut = true, opts = {}) {
  const geom = rasterGeometry(paperLabel, opts.marginLeftMm, opts.marginRightMm);

  // Remove any blank the capture picked up beside the slip, so the receipt
  // itself is what gets scaled to the printable width.
  let trimmed = { trimmedLeft: 0, trimmedRight: 0 };
  if (opts.cropBlankSides !== false && typeof image.crop === 'function') {
    try {
      const r = cropBlankSides(image, opts);
      image = r.image;
      trimmed = r;
    } catch { /* a failed crop must never stop a print */ }
  }

  const src = image.getSize();
  if (!src.width || !src.height) throw new Error('Rendered receipt is empty');
  const scaledHeight = Math.min(65535, Math.max(1, Math.round(src.height * (geom.contentDots / src.width))));
  const resized = src.width === geom.contentDots
    ? image
    : image.resize({ width: geom.contentDots, height: scaledHeight, quality: 'best' });
  const size = resized.getSize();

  let packed = packDots(resized.toBitmap(), size.width, size.height, geom, opts);

  // Remove the document's own blank top/bottom, keeping a small deliberate
  // margin. Without this the slip carries its trailing whitespace onto the
  // paper before the cutter feed is even added.
  const keepTop = Math.max(0, Math.round(finite(opts.topMarginDots, 8)));
  const keepBottom = Math.max(0, Math.round(finite(opts.bottomMarginDots, 8)));
  packed = trimBlankRows(packed, keepTop, keepBottom);

  if (typeof opts.onDiagnostics === 'function') {
    try {
      opts.onDiagnostics({
        coverage: inkCoverage(packed, geom.contentDots),
        heightRows: packed.height,
        contentDots: geom.contentDots,
        trimmedLeft: trimmed.trimmedLeft,
        trimmedRight: trimmed.trimmedRight,
      });
    } catch { /* diagnostics must never break a print */ }
  }
  return wrapRasterCommands(packed, autoCut, opts);
}

module.exports = {
  inkColumns,
  cropBlankSides,
  trimBlankRows,
  inkCoverage,
  paperDotsOf,
  paperMmOf,
  rasterGeometry,
  packDots,
  wrapRasterCommands,
  escposRasterBytes,
};
