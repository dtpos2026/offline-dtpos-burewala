# Fix token print, print speed, verification, KOT retry, pay popup, reports

Six reported issues, worked one by one. Two of them share the same confirmed root cause.

## 1. Token print — blank 1-inch strip

Confirmed cause: when a slip is handed to the hidden silent print worker, the slip's own wrapper is copied along with it. The worker's stylesheet contains a rule that hides every such wrapper unless it is the active one, and that rule outranks the override the worker adds. Result: the page prints empty and only the minimum paper length feeds and cuts.

Fix: mark the copied wrapper as active inside the worker document and raise the override so nested wrappers stay visible. Also compute the paper length from the rendered worker content instead of the off-screen copy, so short slips are not cut early.

## 2. Printing speed — must start under ~0.5s

Planned work:
- Warm the hidden print window at app start instead of creating it on the first print.
- Stop rebuilding and re-encoding the whole app stylesheet for every slip; build a trimmed print-only stylesheet once and reuse it.
- Load the slip through a reusable in-memory document instead of a large encoded URL.
- Skip the font-wait entirely for slips with no Urdu text, and cut the remaining waits in the print service.
- Remember the working printer strategy so the first attempt succeeds instead of trying three.

Target: click to first paper movement well under a second. Existing templates are untouched.

## 3. Repeated verification

Keep one verification per app start plus a quiet background re-check, with no repeat prompt while the result is unchanged, and a clear one-time screen only when access is actually blocked. Super Admin keeps its device list with activate, suspend, revoke and delete.

## 4. Kitchen KOT missing from Print Retry

Silent-KOT mode currently filters automatic kitchen jobs out of processing, so they never reach a printed or failed state and never surface in Print Retry. Change this so held kitchen jobs remain visible and retryable, and every failed kitchen job is recorded with its reason.

## 5. Payment Received screen on/off

Add a setting under Settings. When off, Pay completes the sale as cash immediately and prints; when on, the current Payment Received screen behaves exactly as today. Default stays on so nothing changes for existing users.

## 6. Thermal and A4 report printing

- Thermal shift report: same root cause as issue 1, fixed by the same change.
- A4 report: a global print rule hides everything on the page except receipt wrappers, so the on-screen report prints blank. Scope that rule so it only applies during slip printing, and give the report page a proper A4 print layout (page size, margins, table headers repeating across pages).

## Verification

Each item tested separately and reported as Fixed / Tested / Working, with anything that needs real printer hardware stated plainly rather than marked complete:
- token slip with content and correct cut
- timing measurement from click to print command
- restart and normal use without repeat verification
- failed kitchen job appearing in Print Retry and reprinting
- pay with the screen on and off
- thermal report and A4 report output

## Technical details

Files expected to change: `src/printing/fastPrint.ts`, `src/printing/printService.ts`, `src/printing/printCss.ts`, `electron/main.cjs`, `src/index.css`, `src/components/AutoKotPrinter.tsx`, `src/lib/printQueue.ts`, `src/components/PaymentDialog.tsx`, `src/pages/POSScreen.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/SalesReportPage.tsx`, `src/components/ShiftReport.tsx`, `src/lib/tokenSlip.ts`.

Physical thermal-printer behaviour (real latency, cut, darkness, second printer routing) can only be confirmed on the restaurant's Windows machine with a fresh installer.
