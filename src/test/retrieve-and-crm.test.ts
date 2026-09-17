// ============================================================
// Locks for the faults reported from the counter.
//
//  • "Reprint KOT from Retrieve does nothing" — the enqueue was refused and
//    the caller showed a success toast anyway, so a dropped job looked
//    exactly like a printed one.
//  • "Customers -> CRM sticks" — the page recomputed its whole insight set on
//    every render because its memo inputs changed identity every time.
//  • Two menu entries both called Retrieve.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('a stale print job must not block every later KOT', () => {
  it('ages out pending and printing jobs', () => {
    // A job can sit in 'printing' forever: the app closed mid-print, the
    // spooler never answered, the printer was unplugged. The guard matched
    // ANY such job regardless of age, so from then on every KOT for that
    // order was dropped silently.
    const code = stripComments(read('lib/printQueue.ts'));
    expect(code).toMatch(/STALE_JOB_MS/);
    expect(code).toMatch(/Date\.now\(\)\s*-\s*new Date\(j\.createdAt \|\| 0\)\.getTime\(\)\s*<\s*STALE_JOB_MS/);
  });
});

describe('a refused print must not report success', () => {
  it('checks the enqueue result before claiming the KOT was sent', () => {
    const code = stripComments(read('pages/RetrayPage.tsx'));
    // The success toast must be conditional on a job actually being created.
    expect(code).toMatch(/const job = enqueueKot\(/);
    expect(code).toMatch(/if \(job\)/);
    expect(code).toMatch(/toast\.warning/);
  });

  it('does the same for the receipt reprint', () => {
    const code = stripComments(read('pages/RetrayPage.tsx'));
    expect(code).toMatch(/const job = enqueueReceipt\(/);
  });
});

describe('the CRM page does its work once, not on every render', () => {
  it('memoises the data it feeds to the insights calculation', () => {
    // getCustomers(), getBranches() and getOrders().filter() each return a NEW
    // array, so listing them as memo dependencies meant the memo never hit.
    const code = stripComments(read('pages/CrmInsightsPage.tsx'));
    expect(code).toMatch(/useMemo\(\(\) => getCustomers\(\), \[\]\)/);
    expect(code).toMatch(/useMemo\(\(\) => getBranches\(\), \[\]\)/);
    expect(code).toMatch(/useMemo\([\s\S]*?getOrders\(\)\.filter/);
  });

  it('no longer calls the stores bare in the render body', () => {
    const code = stripComments(read('pages/CrmInsightsPage.tsx'));
    expect(code).not.toMatch(/^\s*const customers = getCustomers\(\);/m);
    expect(code).not.toMatch(/^\s*const allOrders = getOrders\(\)\.filter/m);
  });
});

describe('only one menu entry is called Retrieve', () => {
  it('retires the duplicate that sat under Void', () => {
    const code = stripComments(read('lib/permissions.ts'));
    expect(code).not.toMatch(/key: 'retray'/);
    expect(code).toMatch(/key: 'void-bills'/);
  });

  it('keeps the route working for anyone with a bookmark', () => {
    // Retiring a menu entry should not 404 the page behind it.
    expect(read('App.tsx')).toMatch(/path="\/retray"/);
  });
});

describe('the cancel KOT still goes to the kitchen', () => {
  it('builds cancel deltas from what was already printed', () => {
    const code = stripComments(read('lib/printQueue.ts'));
    expect(code).toMatch(/export function enqueueKotCancel/);
    expect(code).toMatch(/cancelDeltas\[it\.id\]/);
    expect(code).toMatch(/updateMode: true/);
  });

  it('is still triggered when an order is cancelled or voided', () => {
    const code = stripComments(read('pages/POSScreen.tsx'));
    expect(code).toMatch(/enqueueKotCancel\(updated\)/);
  });
});
