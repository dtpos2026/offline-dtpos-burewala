// ============================================================
// WEIGHT ITEM PANEL — by weight or by amount.
//
// Pinned:
//   • by weight: kg × rate at the shop's rounding; grams and pao convert to kg;
//   • by amount: the price is exactly the amount, the weight is what it buys (to the gram);
//   • the keypad keeps one decimal point, a sane length and no leading zeros;
//   • the shop's presets are cleaned (and fall back to the defaults);
//   • the panel: presets, keypad, Enter adds, Esc closes, a scale reading fills it in,
//     and while it is open Enter / '+' never reach the POS behind it;
//   • the POS opens it for weight items (setting on), switches it, closes it for other items.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_AMOUNT_PRESETS, DEFAULT_KG_PRESETS, formatKg, kgForAmount, parsePresetText, presetsFrom, toKg, typeKey, weightLine,
} from '@/lib/weightEntry';
import WeightEntrySheet from '@/components/pos/WeightEntrySheet';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
afterEach(() => cleanup());

describe('the arithmetic', () => {
  it('by weight: kg × rate, rounded the shop’s way', () => {
    expect(weightLine('weight', '1.5', 'kg', 1200, 'whole')).toEqual({ kg: 1.5, price: 1800 });
    expect(weightLine('weight', '0.333', 'kg', 1000, 'whole')).toEqual({ kg: 0.333, price: 333 });
    expect(weightLine('weight', '0.333', 'kg', 7.5, 'decimal')).toEqual({ kg: 0.333, price: 2.5 });
    expect(weightLine('weight', '750', 'g', 900, 'whole')).toEqual({ kg: 0.75, price: 675 });
    expect(weightLine('weight', '2', 'pao', 1200, 'whole')).toEqual({ kg: 0.5, price: 600 });
  });
  it('by amount: exactly that amount, and the weight it buys', () => {
    expect(weightLine('amount', '500', 'kg', 1200, 'whole')).toEqual({ kg: 0.417, price: 500 });
    expect(weightLine('amount', '100', 'kg', 7, 'whole')).toEqual({ kg: 14.286, price: 100 });
    expect(kgForAmount(250, 1000)).toBe(0.25);
  });
  it('nothing to add while nothing sensible is typed, or without a rate', () => {
    expect(weightLine('weight', '', 'kg', 1200, 'whole')).toBeNull();
    expect(weightLine('weight', '0', 'kg', 1200, 'whole')).toBeNull();
    expect(weightLine('weight', '1', 'kg', 0, 'whole')).toBeNull();
    expect(weightLine('amount', '0.4', 'kg', 100000, 'whole')).toBeNull(); // rounds to Rs 0
  });
  it('units and formatting', () => {
    expect(toKg(250, 'g')).toBe(0.25);
    expect(toKg(3, 'pao')).toBe(0.75);
    expect(formatKg(1.5)).toBe('1.5');
    expect(formatKg(0.4166667)).toBe('0.417');
    expect(formatKg(0)).toBe('0');
  });
  it('the keypad', () => {
    expect(typeKey('', '.')).toBe('0.');
    expect(typeKey('1.5', '.')).toBe('1.5');
    expect(typeKey('0', '5')).toBe('5');
    expect(typeKey('1.234', '5')).toBe('1.234'); // 3 decimals at most
    expect(typeKey('12', '.', 0)).toBe('12'); // whole rupees: no point
    expect(typeKey('1234567', '8')).toBe('1234567');
    expect(typeKey('12', '⌫')).toBe('1');
    expect(typeKey('12', 'x')).toBe('12');
  });
  it('presets: cleaned, capped, with defaults', () => {
    expect(presetsFrom([0.25, '0.5', -1, 0, 'x', 0.25, 1], DEFAULT_KG_PRESETS)).toEqual([0.25, 0.5, 1]);
    expect(presetsFrom([], DEFAULT_KG_PRESETS)).toEqual(DEFAULT_KG_PRESETS);
    expect(presetsFrom(undefined, DEFAULT_AMOUNT_PRESETS)).toEqual([100, 200, 500, 1000, 2000]);
    expect(presetsFrom([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [])).toHaveLength(8);
    expect(parsePresetText(' 0.25, 0.5 ,abc, 1 ')).toEqual([0.25, 0.5, 1]);
  });
});

describe('the panel', () => {
  const setup = (over: any = {}) => {
    const onAdd = vi.fn(); const onClose = vi.fn(); const onReadScale = vi.fn();
    const props = {
      item: { id: 'm1', name: 'Mutton Karahi' }, rate: 1200, currency: 'Rs.', rounding: 'whole' as const,
      kgPresets: DEFAULT_KG_PRESETS, amountPresets: DEFAULT_AMOUNT_PRESETS, onAdd, onClose, onReadScale, ...over,
    };
    const view = render(<WeightEntrySheet {...props} />);
    return { onAdd, onClose, onReadScale, view, props };
  };
  const qty = () => document.querySelector('[data-weight-qty]')!.textContent;
  const price = () => document.querySelector('[data-weight-price]')!.textContent;

  it('a preset, then Add to cart', () => {
    const { onAdd } = setup();
    expect((document.querySelector('[data-weight-add]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-weight-preset="1.5"]')!);
    expect(qty()).toBe('1.5 kg');
    expect(price()).toBe('Rs. 1,800');
    fireEvent.click(document.querySelector('[data-weight-add]')!);
    expect(onAdd).toHaveBeenCalledWith({ kg: 1.5, price: 1800 });
  });

  it('by amount from the keyboard; Enter adds and never reaches the POS', () => {
    const { onAdd } = setup();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    fireEvent.click(screen.getByRole('tab', { name: 'By amount (Rs.)' }));
    for (const k of ['5', '0', '0']) fireEvent.keyDown(document.body, { key: k });
    expect(qty()).toBe('0.417 kg');
    expect(price()).toBe('Rs. 500');
    fireEvent.keyDown(document.body, { key: '+' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith({ kg: 0.417, price: 500 });
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('the on-screen keypad, grams, Esc closes', () => {
    const { onClose } = setup();
    fireEvent.click(document.querySelector('[data-weight-unit="g"]')!);
    for (const k of ['7', '5', '0']) fireEvent.click(document.querySelector(`[data-weight-key="${k}"]`)!);
    expect(qty()).toBe('0.75 kg');
    expect(price()).toBe('Rs. 900');
    fireEvent.click(document.querySelector('[data-weight-key="⌫"]')!);
    expect(document.querySelector('[data-weight-display]')!.textContent).toBe('75');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('a scale reading fills the weight in; F9 asks for one', () => {
    const { view, props, onReadScale } = setup();
    fireEvent.keyDown(document.body, { key: 'F9' });
    expect(onReadScale).toHaveBeenCalled();
    view.rerender(<WeightEntrySheet {...props} scaleReading={{ kg: 1.234, at: 1 }} />);
    expect(qty()).toBe('1.234 kg');
    expect(price()).toBe('Rs. 1,481');
  });

  it('typing in the POS search box is left alone', () => {
    setup();
    const search = document.createElement('input');
    document.body.appendChild(search);
    fireEvent.keyDown(search, { key: '7' });
    expect(document.querySelector('[data-weight-display]')!.textContent).toBe('0');
    search.remove();
  });
});

describe('wired into the POS and Settings', () => {
  const pos = read('pages/POSScreen.tsx');
  it('weight items open the panel when the setting is on; other items close it', () => {
    expect(pos).toMatch(/const weightPanelOn = \(settings as any\)\.weightEntryPanel !== false;/);
    expect(pos).toMatch(/if \(item\.pricingType === 'weight' && weightPanelOn\) \{/);
    expect(pos).toMatch(/\/\/ Any other item: an open weight panel closes[^\n]*\n\s*setWeightSheet\(null\);/);
    expect(pos).toMatch(/<WeightEntrySheet[\s\S]*onAdd=\{addFromWeightSheet\}/);
  });
  it('By amount is sold at exactly the amount; the scale keeps working', () => {
    expect(pos).toMatch(/const price = exactPrice && exactPrice > 0 \? exactPrice : computeWeightPrice\(kg, rate\);/);
    expect(pos).toMatch(/if \(!weightItem && weightSheet\?\.item\) weightItem = weightSheet\.item;/);
    expect(pos).toMatch(/onReadScale=\{\(\) => \{ void captureForWeightSheet\(\); \}\}/);
  });
  it('Settings has the switch and the preset boxes', () => {
    const card = read('components/settings/PosEntryCard.tsx');
    expect(card).toMatch(/onCheckedChange=\{v => onChange\(\{ weightEntryPanel: v \}\)\}/);
    expect(card).toMatch(/weightPresetsKg/);
    expect(card).toMatch(/weightPresetsAmount/);
    expect(read('pages/SettingsPage.tsx')).toMatch(/<PosEntryCard settings=\{settings\}/);
  });
});
