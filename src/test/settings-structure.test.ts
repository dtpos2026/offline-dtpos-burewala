// ============================================================
// THE SETTINGS SCREEN, AFTER THE SPLIT.
//
// SettingsPage.tsx had grown to nearly four thousand lines. That is not a
// user-facing fault — the tabs already work, and the tab library only mounts
// the one you are looking at — but it is the kind of file where the risk of
// breaking something while changing something else gets high enough that
// people stop changing it.
//
// Three tabs moved out: receipt, printer and kitchen ticket. They were chosen
// because each needed a SHORT list of things from the page around it, and a
// short prop list is what makes a move like this checkable rather than
// hopeful. The two that stayed are named below, with why.
//
// These tests are structural on purpose. What they protect is that a tab
// cannot go missing and a prop list cannot quietly grow back into a tangle.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const page = read('pages/SettingsPage.tsx');

const MOVED = [
  { tab: 'receipt', file: 'ReceiptSettingsTab', maxProps: 5 },
  { tab: 'printer', file: 'PrinterSettingsTab', maxProps: 8 },
  { tab: 'kot', file: 'KotSettingsTab', maxProps: 8 },
];

describe('every settings tab is still reachable', () => {
  it('keeps all twenty tabs', () => {
    // A tab that disappears in a refactor is a setting a shop can never
    // change again, and nothing will report it.
    const tabs = Array.from(page.matchAll(/TabsContent value="([a-z]+)"/g)).map(m => m[1]);
    // v1.12 added Screen & Layout.
    expect(tabs.length).toBe(20);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const key of ['general', 'receipt', 'printer', 'kot', 'dayclose', 'theme', 'whatsapp', 'tables', 'screen']) {
      expect(tabs, `the ${key} tab is gone`).toContain(key);
    }
  });

  it('renders the moved tabs from their own components', () => {
    for (const { tab, file } of MOVED) {
      expect(existsSync(resolve(__dirname, '..', `components/settings/${file}.tsx`)), `${file} is missing`).toBe(true);
      expect(page.includes(`<${file}`), `the ${tab} tab does not render ${file}`).toBe(true);
    }
  });
});

describe('the moved tabs kept a small, checkable contract', () => {
  for (const { file, maxProps } of MOVED) {
    it(`${file} takes no more than ${maxProps} props`, () => {
      // The short prop list is what made the move safe. If it grows, the tab
      // has re-entangled itself with the page and the next move will not be.
      const src = read(`components/settings/${file}.tsx`);
      const iface = src.slice(src.indexOf('interface Props {'), src.indexOf('}', src.indexOf('interface Props {')));
      const props = iface.split('\n').filter(l => /^\s+\w+[?]?:/.test(l));
      expect(props.length).toBeGreaterThan(0);
      expect(props.length).toBeLessThanOrEqual(maxProps);
    });
  }

  it('none of them reads the store behind the page\'s back', () => {
    // A tab that fetches its own settings would drift from the page's copy,
    // and a shop would watch a value change in one place and not the other.
    for (const { file } of MOVED) {
      const src = read(`components/settings/${file}.tsx`);
      expect(/\bgetSettings\s*\(/.test(src), `${file} reads settings itself instead of taking them`).toBe(false);
    }
  });

  it('saves through the page, not on their own', () => {
    for (const { file } of MOVED) {
      const src = read(`components/settings/${file}.tsx`);
      expect(src).toContain('onSave');
      expect(/\bsaveSettings\s*\(/.test(src), `${file} writes settings directly`).toBe(false);
    }
  });
});

describe('the two tabs that stayed, and why', () => {
  it('leaves Day Close and General in the page', () => {
    // Day Close is tangled with navigation, who is logged in, the order list
    // and an approval flow — moving it would mean threading twenty values
    // through a prop list, which trades one tangle for another. General is
    // close behind. Neither is worth the risk for a file-size number.
    expect(page).toContain('TabsContent value="dayclose"');
    expect(page).toContain('TabsContent value="general"');
  });

  it('brought the page well under three thousand lines', () => {
    // Not a target for its own sake — it is the measure of how much of the
    // page a person now has to hold in their head to change one tab.
    expect(page.split('\n').length).toBeLessThan(3000);
  });
});
