// ============================================================
// WHITE TEXT ON BLACK FILLS — "the black bar prints, the price on it does not".
//
// The print stylesheet paints all slip text black. Blocks drawn as white on a
// black fill that were not marked .dt-reverse printed black on black: on the
// Modern, Executive, Metro, Taste Bistro and Design 2/3/5 receipts the TOTAL
// and the grand total vanished, and on nine designs so did an UNPAID box.
// Fixed twice over: the templates mark their reversed blocks (every print
// path), and the print window keeps white text white on any dark fill
// (electron/reversedText.cjs — any template, including future ones).
// Found by the print simulator's visibility check over all 61 slips.
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { render } from '@testing-library/react';
import { createElement } from 'react';

const require_ = createRequire(import.meta.url);
const { cutoffFor, reversedTextJs, applyReversedText } = require_('../../electron/reversedText.cjs');
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

// jsdom serialises the colours it is given as rgb(), as Chromium does.
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';

/** getComputedStyle as Chromium reports it, from the inline styles below. */
function stubComputedStyle() {
  vi.stubGlobal('getComputedStyle', (el: HTMLElement) => ({
    backgroundColor: el.style.backgroundColor || 'rgba(0, 0, 0, 0)',
    fontWeight: el.style.fontWeight || '400',
  }));
}
const run = (html: string, darkness = 6) => {
  document.body.innerHTML = `<div class="dt-fast-root">${html}</div>`;
  return (0, eval)(reversedTextJs(cutoffFor(darkness)));
};
const style = (id: string) => (document.getElementById(id) as HTMLElement).style;

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('the print-window step', () => {
  it('text on a black fill prints white, bold; the fill prints solid black', () => {
    stubComputedStyle();
    const n = run(`<div id="bar" style="background-color: rgb(0, 0, 0)"><span id="label">TOTAL</span><span id="amt" style="font-weight: 900">Rs 1,827</span></div><p id="after">Thank you</p>`);
    expect(style('bar').getPropertyValue('background-color')).toBe(BLACK);
    expect(style('bar').getPropertyPriority('background-color')).toBe('important');
    for (const id of ['bar', 'label', 'amt']) {
      expect(style(id).getPropertyValue('color')).toBe(WHITE);
      expect(style(id).getPropertyPriority('color')).toBe('important');
    }
    expect(style('label').getPropertyValue('font-weight')).toBe('700');   // regular → bold
    expect(style('amt').getPropertyValue('font-weight')).toBe('900');      // already heavy: kept
    expect(style('after').getPropertyValue('color')).toBe('');              // outside the fill
    expect(n).toBe(3);
  });

  it('a light box inside a dark fill keeps black text', () => {
    stubComputedStyle();
    run(`<div id="bar" style="background-color: rgb(0, 0, 0)"><span id="pill" style="background-color: rgb(255, 255, 255)"><b id="paid">PAID</b></span><span id="no">#1042</span></div>`);
    expect(style('no').getPropertyValue('color')).toBe(WHITE);
    expect(style('pill').getPropertyValue('color')).toBe('');
    expect(style('paid').getPropertyValue('color')).toBe('');
  });

  it('decides by what the head prints: mid-grey fills print as ink, light greys as paper', () => {
    stubComputedStyle();
    run(`<div id="mid" style="background-color: rgb(136, 136, 136)"><i id="a">x</i></div><div id="pale" style="background-color: rgb(221, 221, 221)"><i id="b">y</i></div>`);
    expect(style('a').getPropertyValue('color')).toBe(WHITE);      // luminance 136 < 186
    expect(style('b').getPropertyValue('color')).toBe('');         // 221 ≥ 186
    // At the lightest darkness the cut-off falls below 136 and the grey prints as paper.
    run(`<div style="background-color: rgb(136, 136, 136)"><i id="c">x</i></div>`, 1);
    expect(style('c').getPropertyValue('color')).toBe('');
  });

  it('ignores see-through fills and slips with nothing reversed', () => {
    stubComputedStyle();
    expect(run(`<div style="background-color: rgba(0, 0, 0, 0.2)"><i id="t">x</i></div>`)).toBe(0);
    expect(style('t').getPropertyValue('color')).toBe('');
    expect(run(`<p>plain</p>`)).toBe(0);
  });

  it('cut-off matches the raster stage (108 + 13 × darkness)', () => {
    expect([1, 6, 7, 10].map(cutoffFor)).toEqual([121, 186, 199, 238]);
    expect(cutoffFor(undefined)).toBe(186);
    expect(cutoffFor(99)).toBe(238);
  });

  it('never throws into the print handler', async () => {
    expect(await applyReversedText({ executeJavaScript: async () => { throw new Error('gone'); } }, 6)).toBe(0);
    expect(await applyReversedText(null, 6)).toBe(0);
    const executeJavaScript = vi.fn(async (_js: string) => 2);
    expect(await applyReversedText({ executeJavaScript }, 7)).toBe(2);
    expect(executeJavaScript.mock.calls[0][0]).toContain('const CUT = 199;');
  });

  it('runs on both routes, after the text weight and before measuring or printing', () => {
    const main = read('electron/main.cjs');
    expect(main.match(/await applyTextWeight\(win\.webContents, options\.textWeight\);\s*\/\/ White text on a black fill stays white \(see reversedText\.cjs\)\.\s*await applyReversedText\(win\.webContents, options\.darkness\);/g)).toHaveLength(2);
    const escpos = main.slice(main.indexOf("ipcMain.handle('print-html-escpos'"));
    expect(escpos.indexOf('applyReversedText')).toBeLessThan(escpos.indexOf('SQUEEZED-SLIP'));
  });
});

describe('the templates mark their own reversed blocks (window print path too)', () => {
  it('every white-on-black block in the classic designs carries .dt-reverse', () => {
    const lines = read('src/components/ReceiptPreview.tsx').split('\n').filter(l => /background: '#000'/.test(l) && /color: '#fff'/.test(l));
    expect(lines.length).toBe(14);
    for (const l of lines) expect(l, l.trim().slice(0, 80)).toMatch(/className="dt-reverse"/);
  });
  it('the payment-status box is reversed only when unpaid', () => {
    expect(read('src/components/ReceiptPreview.tsx')).toContain(`<div className={paid ? undefined : 'dt-reverse'} style={{`);
    expect(read('src/components/StandardReceipt.tsx')).toContain(`<div className={paid ? undefined : 'dt-reverse'} style={{`);
  });
});

describe('order details never run past the paper edge', () => {
  it('two fields share a line only when both fit; a wide one takes the whole line', async () => {
    const { StandardInfoGrid } = await import('@/lib/standardOrderInfo');
    const order: any = { orderNumber: 1042, orderType: 'dining', createdAt: '2026-09-24T10:00:00', items: [], waiterName: 'Ali Raza', customer: { name: 'Ahmed Khan', phone: '0300-1234567' } };
    const { container } = render(createElement(StandardInfoGrid, { order, labelWidth: 70, fontSize: 11 }));
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.display).toBe('flex');
    expect(grid.style.flexWrap).toBe('wrap');
    const row = grid.firstElementChild as HTMLElement;
    expect(row.style.flex).toBe('1 1 calc(50% - 4px)');
    expect(row.style.maxWidth).toBe('100%');
    const [label, , value] = Array.from(row.children) as HTMLElement[];
    expect(label.style.flexShrink).toBe('0');
    expect(parseFloat(value.style.minWidth)).toBe(0);
  });
});
