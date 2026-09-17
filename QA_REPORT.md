# DT POS — QA Report

## v1.0.40 verification (Digital Target build)

Method: `tsc --noEmit`, `vitest run`, `vite build`, plus a headless Chromium
run driving the real production bundle — activation, login, billing, and every
module route — with **all non-local network requests blocked**.

| Check | Result |
| --- | --- |
| Version | 1.0.40 in `package.json` and `APP_VERSION` |
| TypeScript | clean |
| Unit tests | 101 passed |
| Production build | clean |
| Windows installer config | unchanged (NSIS, `DT-POS-Enterprise-Setup-v1.0.40.exe`) |
| Firebase npm package | not installed |
| "firebase" in built bundle | 0 occurrences |
| External network requests during a full session | 0 |
| Module routes opened | 58, all render |
| Blank / 404 / crashed routes | 0 |
| Horizontal overflow | none |
| Runtime console or page errors | 0 |

### Billing screen at 100% zoom

Measured with the real DOM at 100% root font size, cart loaded:

| Viewport | PAY | CLR / Hold | Kitchen / Receipt | Special Note | Running + 3-dot | Cart rows visible | Page scroll |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1366×768 | ✅ | ✅ | ✅ | ✅ | ✅ | ~6 | none |
| 1280×720 | ✅ | ✅ | ✅ | ✅ | ✅ | ~5 | none |
| 1920×1080 | ✅ | ✅ | ✅ | ✅ | ✅ | ~9 + keypad open | none |
| 1366×768, minimart mode | ✅ | ✅ | ✅ | ✅ | ✅ | ~3 + scan panel | none |

Cart stability: eight quantity increments then eight decrements leave the
cart's width (380px), left edge (x=986), item-region height (244px) and PAY
position (y=654–690) identical to the baseline.

Interaction: Special Note opens and keeps typed text; the 3-dot menu shows
Credit, Void and Cart width entirely inside the viewport without moving PAY.

### Automated regression locks added

| Suite | What it pins |
| --- | --- |
| `license-key.test.ts` | Key round-trip, tamper rejection, format errors, legacy-key message |
| `billing-write-path.test.ts` | ≤2 DB writes per bill, one stock deduction per item, no double deduction on re-save, stock log written, bill readable the instant `saveOrder` returns |
| `print-fallback.test.ts` | No duplicate receipt on double submit, no duplicate KOT while pending, failed job stays retryable, bill survives an exhausted printer and is marked unprinted, manual retry re-queues |
| `scale-connection.test.ts` | Configured COM resolved through the main process, missing port explained not substituted, silent port reports `no-data` not `connected`, talking port connects, unplug returns to disconnected, `captureStable` resolves with no scale |

### Not verified here

The following need real Windows hardware and were not exercised in this
environment: printing to a physical thermal printer, an actual RS-232/USB
scale on a COM port, and running the built NSIS installer. The code paths for
all three are covered by the unit suites above and by inspection, but a
hardware pass on the target machine is still recommended before rollout.


## Phase 1 — Core POS & Order Flow

Test method: TypeScript build (`tsc --noEmit`) + headless Chromium smoke test
of all 28 Phase-1 routes with authenticated localStorage session against the
running dev server (http://localhost:8080).

### ✅ Passed (no crash, page mounted)
All 28 routes mounted successfully:
`/`, `/tables`, `/bills`, `/delivery`, `/pickup`, `/kitchen`, `/credits`,
`/void-bills`, `/retray`, `/pending-payments`, `/online-portal`,
`/online-approval`, `/blocked-customers`, `/blocked-locations`,
`/dashboard`, `/menu`, `/inventory`, `/customers`, `/audit-history`,
`/settings`, `/accounts`, `/daily-wages`, `/parties`, `/hr`,
`/reports`, `/reports-center`, `/users`, `/branches`, `/printer-settings`.

### 🔧 Bugs found & fixed

1. **Duplicate React key warning in sidebar** (`/settings`)
   - Cause: `permissions.ts` had two entries with `path: '/settings'`
     (`settings` and `day-close`). `AppLayout` keyed list items by `path`.
   - Fix: `AppLayout.tsx` → `key={item.key}` (keys are unique).

2. **Uncaught Firestore snapshot error on `/printer-settings`**
   - Cause: `printerSettings.subscribePrinterSettings` and
     `cloudPrintJobs.subscribePendingJobs` called `onSnapshot` without an
     error callback. Permission errors propagated as uncaught `pageerror`.
   - Fix: added `console.warn` error handlers to both subscriptions.

3. **TypeScript build**: clean — no type errors anywhere in the project.

### Notes
- "Firestore permissions" warnings in console while running with a fake
  tenant are expected (no real auth) — not a code bug.
- Phase 2 (Menu/Inventory/Customers/Delivery/HR/Accounts/Reports) and
  Phase 3 (Settings/Printing/Admin/Public routes) pending.

## Phase 2 — Inventory / Menu / Customers / Delivery / HR / Accounts / Reports

Test method: same headless Chromium smoke test, 31 routes.

### ✅ Passed (no runtime errors)
`/menu`, `/variations`, `/recipes`, `/inventory`, `/receiving`, `/wastage`,
`/parties`, `/customers`, `/customer-map`, `/crm`, `/marketing`, `/whatsapp`,
`/promo-codes`, `/delivery`, `/riders`, `/live-riders`, `/live-map`, `/rider`,
`/pickup`, `/hr`, `/daily-wages`, `/accounts`, `/pending-payments`, `/credits`,
`/reports`, `/reports-center`, `/profitability`, `/costing`,
`/admin-sales-history`, `/audit-history`, `/void-bills`.

### 🔧 Bugs found
None — all 31 modules mounted cleanly, no uncaught errors, no console
errors beyond expected Firestore "permission-denied" noise from the fake QA
tenant. TypeScript build still clean.

## Phase 3 — Admin / Settings / Printing / Public routes / Super Admin

Test method: same headless smoke test, including 3 public unauthenticated
routes and the super-admin shell.

### ✅ Passed
- **Public (no login)**: `/order/qa-tenant`, `/track/qa-tenant`,
  `/order-taker/qa-tenant` — all rendered without crash.
- **Admin auth**: `/settings`, `/printer-settings`, `/users`, `/devices`,
  `/branches`, `/branches-map`, `/backup`, `/bill-editor`, `/retray`,
  `/promo-codes`, `/blocked-customers`, `/blocked-locations`,
  `/online-approval`, `/online-portal` — all mounted clean.
- **Super Admin**: `/super-admin` mounted without runtime error.

### Notes
- `/devices`, `/branches`, `/branches-map` show a visible "Missing or
  insufficient permissions" message when the fake QA tenant cannot read
  Firestore. With a real authenticated tenant this does not occur — no code
  fix needed.
- Public `/order-taker/<tid>` is gated by an `initStore` spinner until the
  tenant data resolves; expected behaviour.

### 🔧 Bugs found in Phase 3
None.

## Summary
| Phase | Routes tested | Bugs fixed |
|------:|--------------:|-----------:|
| 1     | 28            | 2          |
| 2     | 31            | 0          |
| 3     | 18            | 0          |
| **Total** | **77**    | **2**      |

Build: TypeScript clean. App is stable across all surveyed modules.
