// ============================================================
// PRINT MODE — which path a slip takes, decided in ONE place.
//
// Four components print slips and each used to decide this for itself, which
// is how they drifted: the bill honoured the printer's mode, the KOT and the
// token ignored it, and the shift report had no raw path at all. Turning on
// Fast Billing then produced a raw bill, a raw KOT, a raw token — and a
// rendered report.
//
// Precedence, strictest first:
//   1. The printer's own `printMode`, when it is not 'auto'. Mixed hardware
//      is real: one counter printer may refuse raw bytes while the kitchen
//      printer is happy with them.
//   2. The shop-wide Fast Billing switch.
//   3. 'auto' — rendered template, sent as one silent RAW job.
// ============================================================

export type ResolvedPrintMode = 'raw' | 'driver' | 'auto';

export interface PrintModeInput {
  /** The resolved printer configuration for this slip, if any. */
  printerConfig?: { printMode?: string } | null;
  /** The shop settings carrying the global Fast Billing switch. */
  settings?: { fastRawPrintMode?: boolean } | null;
}

/**
 * Decide how a slip should print.
 *
 * Exported and pure so the parity tests can assert that every slip type
 * reaches the same answer from the same inputs.
 */
export function resolvePrintMode(input: PrintModeInput): ResolvedPrintMode {
  const perPrinter = String(input.printerConfig?.printMode || 'auto');
  if (perPrinter === 'raw' || perPrinter === 'driver') return perPrinter;
  if (input.settings?.fastRawPrintMode === true) return 'raw';
  return 'auto';
}

/** True when this slip should be built as raw ESC/POS text. */
export function wantsRaw(input: PrintModeInput): boolean {
  return resolvePrintMode(input) === 'raw';
}

/** True when the rendered fast path must be skipped entirely. */
export function wantsDriverOnly(input: PrintModeInput): boolean {
  return resolvePrintMode(input) === 'driver';
}
