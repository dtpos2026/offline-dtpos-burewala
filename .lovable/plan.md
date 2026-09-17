# Same receipts, much faster printing

Goal: every existing receipt/KOT/token/report template prints exactly as designed — same layout, logo, spacing, Urdu font, Compact Mode — but the paper starts moving almost immediately after Pay, with a proper cut and no duplicates.

## 1. Stop the plain-text shortcut that changes your design

Today, when Pay is pressed, the app first tries a plain text-only path that builds the slip from scratch instead of using your template. That is why the Urdu name prints in a simple font and the design looks different from the preview. Only when that path fails does the real template get used.

Change: the template is always what gets printed. The plain text-only path is kept only for an explicit "direct test print" in Printer Settings, never for real bills.

## 2. Fix the short 1-2 inch strip (root cause)

The slip is rendered inside a hidden holder that is forced to zero width and height. The paper length is measured from that collapsed holder, so on some slips the measurement comes out tiny and the printer cuts after an inch. Where the measurement fails entirely the driver default is used, which can also cut early.

Change:
- Render the slip in an off-screen holder that keeps its real paper width and natural height instead of a 0x0 box, so measurement is always correct.
- Measure the printed page inside the hidden print window itself, after the slip has laid out there, and use that height. This is the height the printer actually receives.
- Sanity floor and ceiling: never send a page shorter than the measured content, never truncate long bills.
- No forced heights, no font-size changes, no template edits.

## 3. Make it fast (target: paper moves well under a second)

- Open and keep the hidden print window warm from app start, so the first bill does not pay the startup cost.
- Reuse the prepared stylesheet instead of rebuilding it per slip.
- Drop the remaining fixed waits on the desktop path; wait only for the actual layout/fonts signal, with a short cap.
- Remember the printer strategy that worked so no retry probing happens on later bills.
- Urdu slips keep a short bundled-font wait so Jameel Noori renders correctly; Latin-only slips skip it.

## 4. Cut, duplicates, rush reliability

- Cut command is sent after the complete slip, once per copy.
- Jobs stay serialized through the existing single print host and queue, with the existing duplicate guard, so rapid consecutive orders cannot overlap or double-print.
- Failures still land in Print Retry with a reason.

## 5. Active devices not showing in Super Admin

The POS writes its heartbeat over one path and the Super Admin device list reads over another. Before changing anything, confirm where the heartbeat lands and what the panel queries, then align them so live machines appear with their status, and Activate/Suspend/Revoke/Delete act on that same record.

## Verification

Each template tested separately and reported as Fixed / Tested / Working:
standard, compact, detailed receipt; KOT; token; thermal shift report; A4 report — checking full content, correct width, correct length, correct cut, Urdu rendering, and click-to-paper timing.

Anything that can only be confirmed on the restaurant's Windows machine with a real thermal printer (true latency, cut quality, darkness, second-printer routing) will be stated plainly rather than marked complete.

## Technical details

Expected files: `src/components/AutoKotPrinter.tsx` (remove direct-first, keep rendered path), `src/printing/directPrint.ts` (test-only), `src/printing/printService.ts` (height measurement), `src/printing/fastPrint.ts` (worker doc, height report-back, warm head cache), `electron/main.cjs` (warm worker, measure page height before print, page size), `src/printing/printCss.ts` / `src/index.css` (only if a hiding rule blocks a template), `src/lib/cloudLink.ts` and `superadmin/src/cloud.ts` / `Devices.tsx` for the device list.
