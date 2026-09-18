// ============================================================
// ROUTE PREFETCH — pay the download and parse cost while idle,
// not while the cashier is waiting.
//
// Why this exists
// ---------------
// Every page is `lazy()`-loaded, so the first navigation to one downloads
// AND PARSES its chunk on the main thread before anything renders. Most
// chunks are small enough that nobody notices. Three are not:
//
//   BarChart (recharts)  ~375 KB   CRM Insights, Dashboard, Analytics
//   xlsx                 ~425 KB   report export
//   jspdf                ~390 KB   PDF export
//
// Recharts is the one that hurts daily use. Moving between WhatsApp,
// Customers and CRM meant the first CRM visit stopped the UI for two to
// three seconds while 375 KB of charting library was parsed — the reported
// freeze. Parsing is synchronous and cannot be made faster; it can only be
// moved somewhere nobody is waiting.
//
// So: once the POS has settled, quietly pull the heavy chunks in during idle
// time. By the time anyone opens CRM the module is already in memory and the
// route switch is immediate.
//
// This changes no UI, no data and no behaviour. If a prefetch fails it is
// ignored — the normal lazy import still runs on navigation exactly as
// before, so the worst case is the old speed rather than an error.
// ============================================================

type Importer = () => Promise<unknown>;

/** Chunks worth warming, heaviest-first. */
const PREFETCH: Array<{ label: string; load: Importer }> = [
  // Recharts, via a page that pulls it in. This is the one that caused the
  // WhatsApp -> Customers -> CRM freeze.
  { label: 'charts', load: () => import('@/pages/CrmInsightsPage') },
  // The rest of the Marketing group, so moving between the three is instant
  // in both directions.
  { label: 'customers', load: () => import('@/pages/CustomersPage') },
  { label: 'whatsapp', load: () => import('@/pages/WhatsAppPage') },
];

let started = false;

/** Run a callback when the browser is idle, or soon after if it cannot. */
function onIdle(fn: () => void, timeout = 3000): void {
  const ric = (globalThis as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (typeof ric === 'function') ric(fn, { timeout });
  else setTimeout(fn, timeout);
}

/**
 * Warm the heavy route chunks in the background.
 *
 * Safe to call more than once; only the first call does anything. Chunks are
 * fetched ONE AT A TIME, each in its own idle slot, so the warming itself
 * never becomes the thing that blocks a click.
 */
export function prefetchHeavyRoutes(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  let i = 0;
  const next = () => {
    if (i >= PREFETCH.length) return;
    const entry = PREFETCH[i++];
    entry.load()
      .catch(() => { /* the lazy import on navigation still works */ })
      .finally(() => onIdle(next, 2000));
  };

  // Give the POS itself a moment to finish its own first paint and data load
  // before competing with it for the network or the main thread.
  onIdle(next, 4000);
}
