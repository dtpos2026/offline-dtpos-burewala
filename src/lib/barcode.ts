// ============================================================
// BARCODE — international retail standard.
//
//  • EAN-13 / EAN-8 / UPC-A checksum validation
//  • Weight/Price EMBEDDED barcodes (in-store labels):
//      GS1 prefix 20–29 — these are what supermarket scales print.
//      Format configurable: PP CCCCC WWWWW C  (weight) or
//                           PP CCCCC PPPPP C  (price)
//  • Keyboard-wedge scanner listener (USB scanners type like a
//    keyboard — fast keystrokes + Enter).
// ============================================================

export type EmbeddedMode = 'weight' | 'price' | 'off';

export interface EmbeddedConfig {
  mode: EmbeddedMode;
  /** Which prefixes are in-store labels (default 20–29). */
  prefixes: string[];
  /** Decimal places of the embedded field (weight: 3 = grams, price: 2 = cents). */
  decimals: number;
}

export const DEFAULT_EMBEDDED: EmbeddedConfig = {
  mode: 'weight',
  prefixes: ['20', '21', '22', '23', '24', '25', '26', '27', '28', '29'],
  decimals: 3,
};

/** EAN-13 / EAN-8 / UPC-A check digit verify. */
export function isValidBarcodeChecksum(code: string): boolean {
  const s = String(code || '').replace(/\D/g, '');
  if (![8, 12, 13].includes(s.length)) return false;
  const digits = s.split('').map(Number);
  const check = digits.pop()!;
  digits.reverse();
  let sum = 0;
  digits.forEach((d, i) => { sum += d * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

export interface ParsedBarcode {
  /** The raw scanned value, unchanged. */
  raw: string;
  /** Code used for item lookup (item-code portion if embedded). */
  lookupCode: string;
  /** Embedded weight (kg) — if this is a weight-embedded label. */
  weightKg?: number;
  /** Embedded price — if this is a price-embedded label. */
  price?: number;
  embedded: boolean;
  validChecksum: boolean;
}

/**
 * Parse a scan. If it's an in-store weight/price label, the weight/price
 * is extracted separately; otherwise it's just the lookup code.
 */
export function parseBarcode(raw: string, cfg: EmbeddedConfig = DEFAULT_EMBEDDED): ParsedBarcode {
  const code = String(raw || '').trim().replace(/\s+/g, '');
  const digits = code.replace(/\D/g, '');
  const validChecksum = isValidBarcodeChecksum(digits);

  const isEmbedded =
    cfg.mode !== 'off' &&
    digits.length === 13 &&
    cfg.prefixes.includes(digits.slice(0, 2));

  if (!isEmbedded) {
    return { raw: code, lookupCode: code, embedded: false, validChecksum };
  }

  // PP CCCCC VVVVV C  → prefix(2) itemCode(5) value(5) check(1)
  const itemCode = digits.slice(2, 7);
  const valueRaw = Number(digits.slice(7, 12));
  const value = valueRaw / Math.pow(10, cfg.decimals);

  if (cfg.mode === 'weight') {
    return { raw: code, lookupCode: itemCode, weightKg: value, embedded: true, validChecksum };
  }
  return { raw: code, lookupCode: itemCode, price: value, embedded: true, validChecksum };
}

/**
 * Keyboard-wedge barcode scanner listener.
 * A scanner types much faster than a human — this speed is what
 * identifies it, so it doesn't conflict with normal typing.
 */
export function attachBarcodeScanner(
  onScan: (code: string) => void,
  opts: { minLength?: number; maxKeyGapMs?: number } = {},
): () => void {
  const minLength = opts.minLength ?? 4;
  const maxGap = opts.maxKeyGapMs ?? 40; // faster than 40ms = machine
  let buf = '';
  let lastAt = 0;

  const handler = (e: KeyboardEvent) => {
    // Don't interfere if the user is typing in a text field —
    // unless it's our own scan-input field.
    const el = document.activeElement as HTMLElement | null;
    const inField = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as any).isContentEditable);
    const isScanField = el?.getAttribute?.('data-barcode-input') === 'true';
    if (inField && !isScanField) return;

    const now = Date.now();
    if (now - lastAt > maxGap) buf = ''; // large gap = new (human) typing
    lastAt = now;

    if (e.key === 'Enter') {
      if (buf.length >= minLength) {
        const code = buf;
        buf = '';
        onScan(code);
        e.preventDefault();
      }
      buf = '';
      return;
    }
    if (e.key.length === 1) buf += e.key;
    if (buf.length > 64) buf = '';
  };

  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}
