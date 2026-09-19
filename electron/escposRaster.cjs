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
 * Find the document's real edges from the measuring rule at its top.
 *
 * The rule (see receiptLayout.ts) is a solid hairline the FULL width of the
 * slip, printed as the document's first element. So row one tells us exactly
 * which columns of the screenshot are the slip and which are whatever blank
 * the capture picked up beside it — on every bill, identically, regardless of
 * how long that bill's widest line happens to be.
 *
 * That last part is the whole point. Cropping to the INK instead made a
 * receipt with a long widest line and one with a short widest line crop and
 * then scale differently, so the same shop with the same settings got two
 * different widths.
 *
 * Returns null when no rule is found — an older document, or a capture that
 * lost its first rows — and the caller falls back to the ink crop.
 */
function findMeasureRule(pixels, width, height, cutoff = 200) {
  if (!width || !height) return null;

  const inkAt = (x, y) => {
    const i = (y * width + x) * 4;
    const b = pixels[i] || 0;
    const g = pixels[i + 1] || 0;
    const r = pixels[i + 2] || 0;
    const a = pixels[i + 3] ?? 255;
    const alpha = a / 255;
    return (((0.299 * r + 0.587 * g + 0.114 * b) * alpha) + (255 * (1 - alpha))) < cutoff;
  };

  // Row 0 can catch an antialiased edge, so read the second row where there
  // is one — the rule is at least two device pixels tall by construction.
  const probe = Math.min(1, height - 1);
  let first = -1;
  let last = -1;
  for (let x = 0; x < width; x++) {
    if (inkAt(x, probe)) {
      if (first === -1) first = x;
      last = x;
    }
  }
  if (first === -1) return null;

  const span = last - first + 1;
  // A rule is SOLID across its whole span. A first line of text is not, so a
  // document without a rule is rejected here rather than mistaken for one.
  let inked = 0;
  for (let x = first; x <= last; x++) if (inkAt(x, probe)) inked++;
  if (inked < span * 0.98) return null;
  // And it must be a meaningful fraction of the capture, or it is a stray mark.
  if (span < width * 0.3) return null;

  // How tall is it? Walk down while rows stay solid across the same span.
  //
  // The rule is two CSS pixels, and the worker never zooms past 8x, so it
  // cannot be more than about sixteen device rows. A solid run longer than
  // MAX_RULE_ROWS is therefore not the rule — it is a template with a black
  // header band, or a capture of something else entirely. Rather than cut a
  // shop's own banner off the top of every slip, we decline to recognise a
  // rule at all and the caller falls back to the ink crop.
  const MAX_RULE_ROWS = 24;
  let barHeight = 0;
  for (let y = 0; y < Math.min(height, MAX_RULE_ROWS + 1); y++) {
    let solid = 0;
    for (let x = first; x <= last; x++) if (inkAt(x, y)) solid++;
    if (solid < span * 0.98) break;
    barHeight = y + 1;
  }
  if (barHeight < 1 || barHeight > MAX_RULE_ROWS || barHeight >= height) return null;

  return { first, last, width: span, barHeight };
}

/**
 * Crop a capture to the document itself, using the measuring rule.
 *
 * Removes the blank the capture picked up beside the slip AND the rule, so
 * what is handed to the resize is exactly the slip and nothing else.
 */
function cropToMeasureRule(image) {
  const size = image.getSize();
  if (!size.width || !size.height) return null;
  const bitmap = image.toBitmap();
  const realWidth = Math.max(1, Math.round(bitmap.length / 4 / size.height));
  const rule = findMeasureRule(bitmap, realWidth, size.height);
  if (!rule) return null;
  if (typeof image.crop !== 'function') return null;

  const height = size.height - rule.barHeight;
  if (height < 1) return null;
  return {
    image: image.crop({ x: rule.first, y: rule.barHeight, width: rule.width, height }),
    trimmedLeft: rule.first,
    trimmedRight: realWidth - 1 - rule.last,
  };
}

/**
 * Full pipeline for an Electron NativeImage. Kept as the one entry point
 * main.cjs calls, so the resize step stays in step with the dot packing.
 */
function escposRasterBytes(image, paperLabel, autoCut = true, opts = {}) {
  const geom = rasterGeometry(paperLabel, opts.marginLeftMm, opts.marginRightMm);

  // ===== FINDING THE SLIP INSIDE THE SCREENSHOT =====
  //
  // The capture is not always exactly the slip. Whether the worker window can
  // be sized to the document depends on Windows' minimum window width, the
  // display's scale factor and whether a child overflowed, so on a real
  // machine there can be blank beside it. That blank has to go before the
  // resize, or the receipt is scaled down to fit alongside it — the narrow
  // slip with a wide band down the right.
  //
  // Cropping to the INK removes it, and that is what shipped first. But the
  // ink is a different width on every bill, so a receipt whose widest line is
  // long and one whose widest line is short were cropped and then scaled
  // differently: same shop, same settings, two widths. Turning the crop off
  // instead brought the blank straight back.
  //
  // So the document now states its own width with a hairline rule across its
  // first two rows, and that is what we crop to. It is the same two columns
  // on every bill, so the crop is identical on every bill AND the blank still
  // goes. The ink crop stays as the fallback for a capture with no rule.
  let trimmed = { trimmedLeft: 0, trimmedRight: 0 };
  if (opts.cropBlankSides !== false && typeof image.crop === 'function') {
    try {
      // Preferred: the document told us its own width, so the crop is the
      // same on every bill.
      const ruled = cropToMeasureRule(image);
      if (ruled) {
        image = ruled.image;
        trimmed = ruled;
      } else {
        // No rule in this capture — an older document, or one whose first
        // rows were lost. Fall back to the ink, which removes the blank
        // beside the slip but does vary with the bill's widest line.
        const r = cropBlankSides(image, opts);
        image = r.image;
        trimmed = r;
      }
    } catch { /* a failed crop must never stop a print */ }
  }

  const src = image.getSize();
  if (!src.width || !src.height) throw new Error('Rendered receipt is empty');
  const scaledHeight = Math.min(65535, Math.max(1, Math.round(src.height * (geom.contentDots / src.width))));
  const resized = src.width === geom.contentDots
    ? image
    : image.resize({ width: geom.contentDots, height: scaledHeight, quality: 'best' });

  // ===== TRUST THE BITMAP, NOT getSize() =====
  //
  // `getSize()` reports DEVICE-INDEPENDENT pixels while `toBitmap()` hands
  // back PHYSICAL ones. On a display running at 125% or 150% — which is the
  // default on a lot of Windows machines — those two numbers differ, and
  // reading a 1.25x-wide buffer as if it were 1x walks off the end of every
  // row. The slip comes out squeezed into part of the roll with a wide blank
  // band beside it, which is the narrow-receipt report, and it is invisible
  // on a 100% display.
  //
  // The buffer's own length cannot lie: 4 bytes per pixel, so width is
  // length / 4 / height. That is what the dot packer is given.
  const size = resized.getSize();
  const bitmap = resized.toBitmap();
  const realWidth = size.height > 0
    ? Math.max(1, Math.round(bitmap.length / 4 / size.height))
    : size.width;
  if (realWidth !== size.width && typeof opts.onScaleMismatch === 'function') {
    try { opts.onScaleMismatch({ reported: size.width, actual: realWidth, height: size.height }); } catch { /* diagnostics only */ }
  }

  let packed = packDots(bitmap, realWidth, size.height, geom, opts);

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
  findMeasureRule,
  cropToMeasureRule,
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
