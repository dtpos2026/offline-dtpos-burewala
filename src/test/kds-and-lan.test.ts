// ============================================================
// Kitchen Display and LAN discovery — honesty locks.
//
// Both features touch hardware this test suite cannot drive, so what is
// pinned here is the part that CAN go wrong silently: the claims the code
// makes about what it knows. Specifically that neither invents information
// the operating system does not actually provide.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');
const preload = readFileSync(resolve(__dirname, '../../electron/preload.cjs'), 'utf8');
const centre = readFileSync(resolve(__dirname, '../components/KitchenDisplayCenter.tsx'), 'utf8');
const kds = readFileSync(resolve(__dirname, '../pages/KdsTvPage.tsx'), 'utf8');

describe('display detection uses the OS, and claims nothing more', () => {
  it('reads the real display list from Electron', () => {
    expect(main).toMatch(/screen\.getAllDisplays\(\)/);
    expect(main).toMatch(/screen\.getPrimaryDisplay\(\)/);
    expect(main).toMatch(/ipcMain\.handle\('list-displays'/);
  });

  it('never fabricates a cable type as display DATA', () => {
    // Windows does not tell an application whether a monitor is on HDMI, VGA
    // or a USB adapter. A picker showing those as if they were known would be
    // a guess dressed as information.
    //
    // The card DOES mention the cable names in its explanatory line, and that
    // is the point: it tells the user plainly that every connection appears
    // the same way and why. So what is asserted here is that no cable name
    // ever reaches the display MODEL — the main process builds each entry
    // from the OS label and resolution only.
    // No cable name may appear as a FIELD of a display entry.
    expect(main).not.toMatch(/(connection|port|cable|interface)\s*:\s*['"`](HDMI|VGA|USB|DVI|DisplayPort)/i);
    // The label must come from the OS, with a resolution fallback — never a
    // guessed connection type.
    expect(main).toMatch(/d\.label && String\(d\.label\)\.trim\(\)/);
    expect(main).toMatch(/Display \$\{w\}x\$\{h\}/);
  });

  it('positions the window inside the chosen display bounds', () => {
    // This is what actually puts the window on that physical screen.
    expect(main).toMatch(/x: b\.x/);
    expect(main).toMatch(/y: b\.y/);
    expect(main).toMatch(/setFullScreen\(true\)/);
  });

  it('prefers an external screen when none was chosen', () => {
    // A kitchen display on the cashier's own monitor helps nobody.
    expect(main).toMatch(/!d\.internal/);
  });

  it('exposes the display API through the preload bridge', () => {
    for (const fn of ['listDisplays', 'openKdsWindow', 'closeKdsWindow']) {
      expect(preload, `${fn} is not bridged`).toMatch(new RegExp(fn));
    }
  });
});

describe('the kitchen board shows finished work, not a history', () => {
  it('keeps a short recent window rather than everything', () => {
    expect(kds).toMatch(/RECENT_MS/);
  });

  it('separates cancelled from completed', () => {
    // A cancellation must be noticed within seconds or food keeps being made.
    expect(kds).toMatch(/CANCELLED/);
    expect(kds).toMatch(/line-through/);
  });

  it('flags a genuinely new order and lets the flag expire', () => {
    expect(kds).toMatch(/freshIds/);
    expect(kds).toMatch(/NEW/);
    expect(kds).toMatch(/next\.delete\(id\)/);
  });

  it('honours reduced-motion', () => {
    // This screen is watched for hours; movement has to be optional.
    expect(kds).toMatch(/prefers-reduced-motion/);
  });
});

describe('LAN discovery stays inside what it can justify', () => {
  it('scans only the machine own /24 subnets', () => {
    expect(main).toMatch(/255\.255\.255\.0/);
    expect(main).toMatch(/os\.networkInterfaces\(\)/);
  });

  it('caps concurrency and timeout so it cannot swamp the network', () => {
    expect(main).toMatch(/concurrency/);
    expect(main).toMatch(/Math\.min\(2000, Number\(options\.timeout\)/);
  });

  it('reports what answered without configuring anything', () => {
    // A host answering on 9100 is very likely a printer, but "very likely" is
    // not "is" — the user still chooses.
    expect(main).toMatch(/ipcMain\.handle\('scan-lan-printers'/);
    expect(main).toMatch(/printers: found\.map/);
  });
});
