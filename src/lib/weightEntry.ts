// ============================================================
// WEIGHT ENTRY — the arithmetic behind the weight-item side panel.
//
// A weight item (sold per kg) is entered one of two ways:
//   • By weight — "1.5 kg": the price is kg × rate, rounded the way the shop
//     set it (Settings → Scale: whole rupees, or paisa);
//   • By amount — "Rs. 500 worth": the price is exactly the amount asked for,
//     and the weight is what that buys (rounded to the gram).
// Weight can be typed in kg, grams or pao (a quarter kg).
//
// Pure functions only — the panel (components/pos/WeightEntrySheet.tsx) and the
// tests share them, and nothing here reads the cart, the database or a printer.
// ============================================================

export type WeightMode = 'weight' | 'amount';
export type WeightUnit = 'kg' | 'g' | 'pao';
export type PriceRounding = 'whole' | 'decimal';

export const DEFAULT_KG_PRESETS = [0.25, 0.5, 1, 1.5, 2, 5];
export const DEFAULT_AMOUNT_PRESETS = [100, 200, 500, 1000, 2000];

/** The shop's preset buttons, cleaned: positive numbers, no repeats, at most `max`. Falls back when none are usable. */
export function presetsFrom(list: unknown, fallback: number[], max = 8): number[] {
  if (!Array.isArray(list)) return fallback;
  const out: number[] = [];
  for (const v of list) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out.length ? out : fallback;
}

/** "0.25, 0.5 ,1" → [0.25, 0.5, 1] (for the Settings text box). */
export function parsePresetText(text: string): number[] {
  return String(text || '').split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
}

export function toKg(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const kg = unit === 'g' ? value / 1000 : unit === 'pao' ? value * 0.25 : value;
  return Math.round(kg * 1000) / 1000;
}

/** How much `amount` buys at `rate` per kg, to the gram. */
export function kgForAmount(amount: number, rate: number): number {
  if (!(amount > 0) || !(rate > 0)) return 0;
  return Math.round((amount / rate) * 1000) / 1000;
}

export function roundPrice(value: number, rounding: PriceRounding): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return rounding === 'decimal' ? Math.round(value * 100) / 100 : Math.round(value);
}

/** kg × rate, rounded the shop's way (the same rule as lib/weightScale.computeWeightPrice). */
export function priceForKg(kg: number, rate: number, rounding: PriceRounding): number {
  if (!(kg > 0) || !(rate > 0)) return 0;
  return roundPrice(kg * rate, rounding);
}

/** "1.5", "0.417", "2" — a weight without trailing zeros. */
export function formatKg(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return '0';
  return String(Math.round(kg * 1000) / 1000);
}

export interface WeightLine {
  kg: number;
  price: number;
}

/**
 * The cart line the panel would add, or null while nothing sensible is typed.
 * By amount, the price is the amount itself; the weight must come to at least a gram.
 */
export function weightLine(mode: WeightMode, typed: string, unit: WeightUnit, rate: number, rounding: PriceRounding): WeightLine | null {
  const value = parseFloat(typed);
  if (!Number.isFinite(value) || value <= 0 || !(rate > 0)) return null;
  if (mode === 'amount') {
    const price = roundPrice(value, rounding);
    const kg = kgForAmount(price, rate);
    return kg > 0 && price > 0 ? { kg, price } : null;
  }
  const kg = toKg(value, unit);
  const price = priceForKg(kg, rate, rounding);
  return kg > 0 && price > 0 ? { kg, price } : null;
}

/**
 * One key on the panel's keypad (or the keyboard): a digit, '.', or '⌫'.
 * Keeps the number sane: one decimal point, at most `decimals` places, at most 7 characters.
 */
export function typeKey(current: string, key: string, decimals = 3): string {
  const cur = current || '';
  if (key === '⌫' || key === 'Backspace') return cur.slice(0, -1);
  if (key === '.') {
    if (decimals <= 0 || cur.includes('.')) return cur;
    return cur ? `${cur}.` : '0.';
  }
  if (!/^\d$/.test(key)) return cur;
  if (cur.length >= 7) return cur;
  const dot = cur.indexOf('.');
  if (dot >= 0 && cur.length - dot - 1 >= decimals) return cur;
  if (cur === '0') return key; // no leading zeros: "05" → "5"
  return cur + key;
}

/** A preset written into the display: the number as the cashier would have typed it. */
export function presetText(n: number): string {
  return formatKg(n);
}
