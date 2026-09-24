// ============================================================
// TEXT SPACING — Settings → Receipt / KOT → line, word and letter spacing.
//
// "Receipt ya koi bhi — line aur word spacing adjust karne ka option ho."
// Nothing may change until the shop picks a value; a picked value must reach
// the preview AND the printed slip (same attributes on both nodes, rules in
// both stylesheets).
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSpacing, spacingNodeProps, spacingPatch, hasSpacing } from '@/lib/textSpacing';
import ReceiptPreview from '@/components/ReceiptPreview';
import KitchenReceipt from '@/components/KitchenReceipt';
import TextSpacingCard from '@/components/TextSpacingCard';
import StandardReceipt from '@/components/StandardReceipt';
import { buildSampleOrder } from '@/lib/sampleOrder';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const base: any = { name: 'Chai Corner', address: 'Main Boulevard', phone1: '0300-0000000', paperSize: '80mm', receiptDesign: 'classic' };

// The sliders measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
beforeEach(() => { localStorage.clear(); });

describe('reading the setting', () => {
  it('unset means "as designed" — nothing on the slip', () => {
    expect(readSpacing(base, 'bill')).toEqual({ line: null, word: 0, letter: 0 });
    expect(spacingNodeProps(base, 'bill')).toEqual({ attrs: {}, style: {} });
    expect(hasSpacing(readSpacing(base, 'kot'))).toBe(false);
  });
  it('values are bounded and rounded to the slider steps', () => {
    expect(readSpacing({ receiptLineSpacing: 1.52, receiptWordSpacing: 3.3, receiptLetterSpacing: 0.6 }, 'bill'))
      .toEqual({ line: 1.5, word: 3.5, letter: 0.5 });
    expect(readSpacing({ receiptLineSpacing: 9, receiptWordSpacing: 99, receiptLetterSpacing: -2 }, 'bill'))
      .toEqual({ line: 2.2, word: 10, letter: 0 });
    expect(readSpacing({ receiptLineSpacing: 'x' }, 'bill').line).toBeNull();
  });
  it('bill and KOT are separate', () => {
    const s = { receiptLineSpacing: 1.5, kotWordSpacing: 2 };
    expect(readSpacing(s, 'bill')).toEqual({ line: 1.5, word: 0, letter: 0 });
    expect(readSpacing(s, 'kot')).toEqual({ line: null, word: 2, letter: 0 });
  });
  it('the node carries only what was chosen', () => {
    expect(spacingNodeProps({ receiptLineSpacing: 1.4 }, 'bill')).toEqual({ attrs: { 'data-dt-line': '' }, style: { '--dt-line-height': '1.4' } });
    expect(spacingNodeProps({ kotWordSpacing: 2 }, 'kot')).toEqual({
      attrs: { 'data-dt-spacing': '' },
      style: { '--dt-word-spacing': '2px', '--dt-letter-spacing': '0px' },
    });
  });
  it('clearing writes nothing back', () => {
    expect(spacingPatch('bill', { line: null, word: 0, letter: 0 })).toEqual({ receiptLineSpacing: undefined, receiptWordSpacing: undefined, receiptLetterSpacing: undefined });
    expect(spacingPatch('kot', { line: 1.3 })).toEqual({ kotLineSpacing: 1.3 });
  });
});

describe('the bill and the KOT carry it on preview and print nodes alike', () => {
  const order = buildSampleOrder();
  it('bill: untouched by default, both nodes marked when set', () => {
    render(<ReceiptPreview order={order} settings={base} showPrintButton={false} />);
    const nodes = Array.from(document.querySelectorAll('.receipt-paper[data-design]')) as HTMLElement[];
    expect(nodes).toHaveLength(2); // preview + print portal
    for (const n of nodes) {
      expect(n.hasAttribute('data-dt-line')).toBe(false);
      expect(n.hasAttribute('data-dt-spacing')).toBe(false);
    }
    cleanup();
    render(<ReceiptPreview order={order} settings={{ ...base, receiptLineSpacing: 1.5, receiptWordSpacing: 2 }} showPrintButton={false} />);
    for (const n of Array.from(document.querySelectorAll('.receipt-paper[data-design]')) as HTMLElement[]) {
      expect(n.hasAttribute('data-dt-line')).toBe(true);
      expect(n.hasAttribute('data-dt-spacing')).toBe(true);
      expect(n.style.getPropertyValue('--dt-line-height')).toBe('1.5');
      expect(n.style.getPropertyValue('--dt-word-spacing')).toBe('2px');
    }
  });
  it('KOT uses its own values', () => {
    render(<KitchenReceipt order={order} settings={{ ...base, receiptLineSpacing: 1.5, kotLineSpacing: 1.2 }} showPrintButton={false} />);
    const print = document.querySelector('.print-receipt[data-kot-design]') as HTMLElement;
    expect(print.style.getPropertyValue('--dt-line-height')).toBe('1.2');
  });
});

describe('the rules exist on screen and in print', () => {
  it('the print stylesheet applies them above the root letter-spacing and compact rows', async () => {
    const { buildPrintCss } = await import('@/printing/printCss');
    const css = buildPrintCss('80mm' as any, true);
    expect(css).toContain('.print-receipt[data-dt-spacing] {');
    expect(css).toMatch(/\.print-receipt\[data-dt-line\] \*[\s\S]*?line-height: var\(--dt-line-height\) !important;/);
    expect(css).toContain('letter-spacing: var(--dt-letter-spacing, 0) !important;');
  });
  it('the app stylesheet applies them to the preview', () => {
    const css = read('src/index.css');
    expect(css).toContain('[data-dt-line] *');
    expect(css).toContain('word-spacing: var(--dt-word-spacing, normal);');
  });
});

describe('the settings card', () => {
  function Harness({ kind }: { kind: 'bill' | 'kot' }) {
    const [s, setS] = useState<any>({ ...base });
    return (
      <>
        <TextSpacingCard settings={s} setSettings={setS} kind={kind} />
        <output data-testid="state">{JSON.stringify({ l: s.receiptLineSpacing, kl: s.kotLineSpacing })}</output>
      </>
    );
  }
  it('a preset sets the line spacing; "As designed" clears everything', () => {
    render(<Harness kind="bill" />);
    expect(screen.getByTestId('line-value-bill').textContent).toBe('As designed');
    fireEvent.click(screen.getByRole('button', { name: 'Relaxed' }));
    expect(screen.getByTestId('line-value-bill').textContent).toBe('1.50 ×');
    expect(screen.getByTestId('state').textContent).toBe('{"l":1.5}');
    fireEvent.click(screen.getAllByRole('button', { name: 'As designed' })[0]);
    expect(screen.getByTestId('state').textContent).toBe('{}');
  });
  it('on the KOT tab it writes the KOT keys', () => {
    render(<Harness kind="kot" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByTestId('state').textContent).toBe('{"kl":1.1}');
  });
  it('is on both tabs, above their live previews', () => {
    expect(read('src/components/settings/ReceiptSettingsTab.tsx')).toMatch(/<TextSpacingCard settings=\{settings\} setSettings=\{setSettings\} kind="bill" \/>[\s\S]*Live Receipt Preview/);
    expect(read('src/components/settings/KotSettingsTab.tsx')).toMatch(/<TextSpacingCard settings=\{settings\} setSettings=\{setSettings\} kind="kot" \/>[\s\S]*Live KOT Preview/);
  });
});

describe('Standard receipt order details (they ran into each other and off the paper)', () => {
  it('prints them as label : value lines, each group kept whole', () => {
    const order = { ...buildSampleOrder(), createdAt: '2026-09-24T10:53:00' };
    const { container } = render(<StandardReceipt order={order as any} settings={base} />);
    const text = container.textContent || '';
    expect(text).toContain('Date: 24 Sep 2026');
    expect(text).toContain('Order No: #1042');
    expect(text).toContain('Type : Dine-In');
    // No four-cell table for the details any more: only the item table remains.
    expect(container.querySelectorAll('table')).toHaveLength(1);
    const groups = Array.from(container.querySelectorAll('span')).filter(s => (s as HTMLElement).style.whiteSpace === 'nowrap');
    expect(groups.map(g => g.textContent)).toEqual(expect.arrayContaining(['Date: 24 Sep 2026', 'Time : 10:53 am']));
  });
});
