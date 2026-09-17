# DT POS Enterprise — Release Notes

## v1.3.3 — The raw slip reads like the old one again

### Item names are no longer chopped

The bill printed `1 x Chicken Achari  - Large (Larg` with the rest of the name
simply gone: the row was hard-truncated to the column width. A customer cannot
check a bill whose item names stop mid-word, and a chef cannot cook from a KOT
that does the same. Long names now wrap onto an indented continuation line, and
the amount stays on the first line, flush to the right edge where it is looked
for. Applies to the bill, the KOT and the token.

### Raw slips print at the larger size by default

The plain ESC/POS slip read much lighter than the rendered template, which is
what "it was bigger before" meant. Item rows and the total now print at double
**height** — `GS !` leaves the width alone, so the same 48 characters still fit
the line; only the weight on paper changes. Printer Settings → Fast Billing Mode
has a **Large / Compact** choice, applying to the bill and the KOT together.

Sample of the current output, at the full 48-column width:

```
FIRST CHEF PIZZA &
BURGER
EMCO STOP SKP ROAD LAHORE
------------------------------------------------
BILL #1025                                DINING
------------------------------------------------
1 x Anda Shami Burger                     Rs 140
1 x Chicken Achari (Large)               Rs 1300
1 x DONER PIZZA (Large)                  Rs 1500
------------------------------------------------
Subtotal                                 Rs 3120
================================================
TOTAL            Rs 3120
```

The shop name also breaks between words rather than inside one — it printed
`FIRST CHEF PIZZA & BUR` / `GER` before, because double width halves the
columns that fit and the builder was not tracking that.

## v1.3.2 — RAW printing now matches the Windows driver, edge for edge

Reported precisely: **Windows Driver Only prints with correct equal margins but
is slow; RAW / ESC-POS / Automatic prints fast but leaves about 10 mm extra on
the right, and comes out slightly narrower.** That is exactly what the geometry
was doing, and the arithmetic shows why:

| stored margins | content width | left gap | right gap |
|---|---|---|---|
| L3 / R10 | 59 mm | 7.0 mm | **14.5 mm** |
| L0 / R0 | **72 mm** | 4.0 mm | 4.0 mm |

Two separate mistakes, both now fixed.

**1. The raw path subtracted margins from an area that is already inset.**
On an 80 mm roll the head can only mark the middle ~72 mm, so roughly 4 mm of
each edge is already blank paper that no setting can print on. The Windows
driver fills that full 72 mm. The raw path took the configured side margins off
it as well, so the slip came out narrower than the same bill through the driver
— the "width kam" half of the report. Side margins now default to **0**: the
paper's own unprintable edge is the margin, and both paths produce the same
72 mm, 48 characters per line.

**2. Asymmetric stored values could still reach the paper.**
Lopsided pairs arrived from an old shipped default, a stale migration and a
restored backup. The layout resolver now equalises left and right by default,
taking the smaller of the two so a repair never narrows the slip. A caller that
is genuinely compensating for one machine's head offset opts in explicitly.
No stored value, however it got there, can print a lopsided slip again.

Verified across every way a machine can arrive in a bad state — clean install,
3/10, 0/3, 3/0 — all now print with equal gaps.

## v1.3.1 — The margin repair now survives, and the cut stops eating text

### The 10 mm right margin came back because the repair never saved

v1.2.1 added a repair that equalises lopsided printer margins on load. It ran,
it marked itself done — and it never wrote the corrected values back. The very
next read saw the "already repaired" flag, skipped the repair, and handed out
the original 3 mm / 10 mm values again. The fix held for exactly one read and
then undid itself, which is why the wide right band was still on the paper.

Reproduced as a failing test first (`expected 10 to be 3`), then fixed: the
corrected list is written to storage **before** the flag is set. If the write
fails the flag stays clear and the repair is retried on the next load, which is
the safe direction to fail in.

### The raw slip was being cut through its own last lines

The cutter sits 15-25 mm past the print head, so the paper must advance at
least that far before the blade closes. The feed was counted in **line feeds**,
whose height depends on the current line spacing — and Paper Save sets
`ESC 3 20`, shrinking each feed line from 24 dots to 20, while compact mode also
asked for fewer lines. Three lines at 20 dots is 7.5 mm of clearance against a
20 mm gap, so the blade came down on text that had only just printed.

Now the builder restores the default line spacing, feeds an exact distance with
`ESC d`, and never drops below six lines (about 18 mm). Paper Save saves paper
in the body of the slip; the clearance the blade needs is physical and is no
longer traded away for it. Compact line spacing also relaxes from 20 to 22
dots, which measured cramped on a 203 DPI head.

## v1.3.0 — Fast Billing Mode: one switch for every slip

Shops split on this. Some want their logo and their chosen receipt design on
every bill; others want the counter to move and do not care what the slip looks
like. Fast Billing is now a single shop-wide switch in Printer Settings.

- **On** — the bill, the KOT, the token and the shift report are all built as
  raw ESC/POS text and go straight to the printer. No render step at all, so
  no logo, no QR and no premium layout.
- **Off** — all four print their designed template and still go out as one
  silent RAW job with no dialog.

Margins stay equal on both sides either way.

The switch is global on purpose: a raw bill followed by a rendered token is the
worst of both, two looks and two speeds. A single printer can still override it
in Printer Settings → Print Mode, for hardware whose driver refuses raw bytes.

### Print mode is now decided in one place

Four components print slips and each decided this for itself, which is how they
drifted: the bill honoured the printer's mode while the KOT and the token
ignored it, and the shift report had no raw path at all. All four now call one
resolver, with precedence: the printer's own mode, then the shop switch, then
the rendered default.

### The shift report gained a raw renderer

It was the only slip with no ESC/POS builder, so turning on Fast Billing
produced a raw bill, a raw KOT, a raw token — and then a rendered report.

### Enlarged text no longer breaks mid-word

`GS !` doubles the glyph width, which halves how many characters fit on a line.
The builder did not track that, so a shop name longer than 24 characters ran
past the columns an 80mm roll has and the printer hard-wrapped it inside the
word: the client's slip read `FIRST CHEF PIZZA & BUR` / `GER`. Enlarged lines
now wrap on word boundaries at the real column count for the current size.

### Known: the printer driver can add its own asymmetry

The FIT FP-1100 driver ships with **Left 3.0 mm and Right 5.0 mm** under
Properties → Custom Paper → Margin. Those are applied by the driver itself, on
top of anything the POS sends, so they skew the Windows-driver path by 2 mm no
matter how the app is configured. Set both to the same value there. Fast
Billing bypasses the driver entirely, so it is unaffected.

## v1.2.1 — The margin fix that actually reaches the machine

v1.2.0 corrected the equal-margin logic and still printed lopsided on the
client's hardware, on the receipt, the KOT, the token and the shift report
alike. Physical paper was right and the code was wrong.

**Cause: a migration that could not run.** `loadPrintMargins()` supplies the
side margins to every slip type. Its one-time reset is guarded by a flag
written on *first run of any build carrying it* — and the flag it checked,
`dtpos-print-geometry-v3`, was already set on deployed machines from v1.1.1,
with whatever asymmetric values were in storage at that moment. The guard saw
the flag, skipped the reset, and every later release inherited those numbers.
v1.2.0 fixed the printer-config default but never touched this store, so the
stale values kept flowing to all four slip types. That is precisely why the
wide right band appeared on every slip rather than just on bills.

- The migration is now `v4` and clears the superseded v2/v3 flags, so a machine
  that rolls back and forward is migrated rather than skipped again.
- The printer-config repair no longer matches only the exact 3mm/10mm pair. It
  equalises **any** asymmetric pair, taking the smaller of the two so a repair
  never widens a slip — and it runs **once**, behind its own flag, so a shop
  that calibrates its printer afterwards keeps its own numbers for good.
- Printer Settings shows a warning when the active margins are unequal, with a
  **Make margins equal** button that fixes both stores at once. A machine can
  hold an asymmetric pair in the printer's configuration *or* in the device
  settings, and working out which is in force is not the shop's job.
- The alignment slip now prints **Margins from** (which store the numbers came
  from) and **Margins equal? YES / NO - FIX THIS**. The previous slip reported
  the numbers but not their source, which turned the last round of diagnosis
  into guesswork.

### Test coverage

The test that would have caught this is the one nobody had written: not "does
a fresh machine get equal margins" — it always did — but "does a machine that
**already** carries the old flag and bad values get repaired". That case is now
pinned, along with the one-time contract and the never-widen rule. 253 tests.

## v1.2.0 — Receipt alignment, Paper Save parity, raw ESC/POS geometry

### Receipt margins are now equal on every print path

The right margin printed much wider than the left: the slip sat hard against
the paper's left edge and boxes, table borders and separator lines stopped
short of the right edge. Two independent causes, both fixed.

**1. Lopsided default margins (the dominant cause in the field).**
`defaultPrinterConfig()` created every printer with `leftMarginMm: 3` and
`rightMarginMm: 10` — a built-in 7&nbsp;mm asymmetry. `ReceiptPreview` feeds
those two numbers straight into the print path, so a slip printed lopsided by
configuration on any machine whose printer was added through Printer Settings
or the calibration panel. Both defaults are now an equal 2&nbsp;mm. Machines
already holding the old pair are repaired when settings load; a calibration a
shop set by hand is never overwritten.

**2. No horizontal centring on the driver path.**
The Electron driver/HTML fallback laid the document out at the *content* width
inside a *full roll* page and left it block-aligned, so all the slack landed on
the right. Measured on an 80&nbsp;mm roll at the 2&nbsp;mm defaults: 0&nbsp;mm
left against 11.9&nbsp;mm right. The ESC/POS raster path was already symmetric,
which is why earlier attempts looked correct in code — only one of the two
paths had ever been measured. Both paths now resolve their geometry through one
shared layout module and are verified to print 6.0&nbsp;mm left against
5.8&nbsp;mm right (0.3&nbsp;mm worst case, against a 1&nbsp;mm bar).

New `src/printing/paperProfile.ts` holds the only copy of the paper numbers —
printable width, dot count and characters per line for 58/80/110&nbsp;mm.
`printCss.ts` previously carried its own table whose 110&nbsp;mm printable
width (100&nbsp;mm) disagreed with the 104&nbsp;mm used everywhere else, and
the Test Print ruler was hard-coded to 42 columns on 80&nbsp;mm paper where
Font A fits 48 — so a correctly aligned slip looked short on the right.

### Print Alignment Test

Printer Settings has a **Print Alignment Test** card. It prints a calibration
slip through either Raw ESC/POS or the Windows driver, carrying a full-width
`=` ruler, a full-width box, `LEFT`/`RIGHT` on one line, and the active paper
profile, printable dot width and print strategy. Pass condition: both blank
edges match within about 1&nbsp;mm and the ruler does not wrap. A wrapped ruler
means the characters-per-line constant is wrong — fix the constant, not the
font size.

### Paper Save now applies in the packaged app

`printNode` accepted a `compact` option, forwarded it to the desktop fast path,
and then called `injectPrintCss(paperWidth)` without it on its own window path,
never setting `thermal-compact` on the body. Paper Save therefore did nothing
for every slip that prints through `printNode` — KOT, tokens, the shift report
and test prints — whenever the fast path was unavailable. Both paths now share
one options object, including the compact font size and line height. Compact
mode measures a 31–34% shorter slip.

On the raw path, Paper Save now also tightens line spacing (`ESC 3`), which is
where the paper is physically saved.

### Raw ESC/POS printing

- `GS L` (left margin) and `GS W` (print area width) are now set on **every**
  job, on both the raw and raster paths. Both settings persist in printer NVRAM
  and are *not* cleared by `ESC @` on many models, so a printer left with a
  non-zero left margin or a narrowed print area printed every later job shifted
  and short regardless of what the POS sent.
- The raw path now resolves the printer through the same name matcher as the
  driver path. It previously handed the stored name straight to winspool, so a
  printer installed as `... (Copy 1)`, or one carrying a non-breaking space,
  failed to open on the raw path while the same printer printed fine through
  the driver. There is one matcher in the main process now, not two.
- The raw job timeout is 5&nbsp;s (was 10&nbsp;s), so a stalled or unplugged
  printer surfaces an error quickly and the POS stays responsive.
- The ESC/POS builder gained Font B, line spacing and cash-drawer kick.

### Notes

- Printer settings remain machine-local; no cross-device sync behaviour changed.
- The KOT quantity fix, the three-strategy driver fallback chain, `printerMatch`
  name matching and the weighing-scale COM port logic are unchanged.
- 235 automated tests pass, including 27 new regression locks covering the
  equal-margin invariant, the sticky ESC/POS geometry commands and the margin
  repair.

## v1.0.40 — Digital Target build (offline, branded, fast)

A maintenance and hardening release. No module was removed and no workflow was
redesigned; the existing UI, features and data model are intact.

### Firebase removed — completely
The product was sold as a 100% offline Windows POS but still carried the whole
cloud stack: the `firebase` npm package, Firestore rules and indexes, a hosting
project, Cloud Functions and a licensing module that reached Firestore on every
activation. All of it is gone. There is no cloud package in `package.json`, no
"firebase" string in the built bundle, and a browser run with every non-local
request blocked shows the POS making **zero external requests**.

Legacy code written against a cloud document API now resolves to
`src/lib/offlineNoCloud.ts` — one clearly named, inert module where writes are
no-ops and reads return empty. Working billing and reporting logic was not
rewritten just to delete an import.

### Licensing now works with no internet
A key encodes its own plan, expiry and device allowance and carries an
HMAC-SHA-256 signature, so `DTPOS-XXXX-XXXX-XXXX-XXXX` validates on a machine
that has never been online. Device binding still comes from the AES-256-GCM
vault keyed by the hardware ID, and clock-tamper detection is unchanged.
Machines already activated keep working from their vault. The Firebase Super
Admin portal is replaced by `superadmin/`, an offline console (see below).

### Super Admin panel, offline
`superadmin/` is a full console rather than a bare key generator: a dashboard
with renewals due, licence issuing with copy / send-on-WhatsApp, a searchable
client registry with CSV export and JSON backup, key verification, and a
**device map**.

The map is fed without the POS ever phoning home. Right after activating, the
shop's screen shows a short signed **activation code** it can send on WhatsApp;
pasting that into the panel links the client and drops the machine on the map
at the exact coordinates it was activated. The code is optional for the shop —
their POS already works — and a tampered one is rejected.

What the panel deliberately cannot do is reach a shop's PC: the product is
genuinely offline, so *Suspend* is a note in your own records. Control comes
from the expiry date on the key you issue.

### Billing speed
Every mutation used to serialise the entire database and write it
synchronously, then serialise it again (pretty-printed) for the Electron file.
One paid bill did that about **twenty times** in a row on the UI thread — the
freeze cashiers saw on Pay, and it grew worse with sales history. A bill is now
**one** serialisation, reused for both sinks, while money-bearing bills still
force an immediate durable write.

### Inventory accuracy
A paid bill ran **three** independent stock-deduction paths, each with its own
guard or none, so a directly linked item could lose three units of stock per
unit sold. There is one funnel now, guarded by the order's own flag.

### Pay button at 100% zoom
Staff had to drop the app to ~85% zoom. CLR / Hold / PAY and the Kitchen +
Receipt buttons lived inside the collapsible keypad, so minimising it removed
PAY entirely and a short screen clipped it. They are now a pinned action bar.
The POS also sized itself to the viewport rather than its container, so any
banner above the header pushed the bottom controls out of reach.

Verified in Chromium at 1366×768, 1280×720 and 1920×1080 at 100%: PAY, CLR,
Hold, Kitchen, Customer Receipt, Special Note, Running and the 3-dot menu
(Credit, Void, Cart width) are all in view, with no page scroll.

### Cart stability
The cart-width −/+ buttons sat directly above the per-line quantity −/+
controls, so staff resized the billing column by accident. Width moved to the
3-dot menu; the drag handle stays. Eight quantity increments and eight
decrements now leave the cart's width, left edge, item-region height and PAY
position unchanged.

### Printing
- A failed silent print no longer opens a modal print dialog nobody is there to
  dismiss — that was a dead printer freezing the till, and the receipt path even
  reported it as success.
- "Bill #N saved successfully, but the printer is not responding", with Retry.
- New print-failure badge in the header: per-job Retry, Retry all, Select
  printer, Discard. The bill records `printStatus: failed` so a later reprint
  can tell "never came out" from "already printed".
- Receipts gained the duplicate protection KOTs already had.
- Roughly 300ms less latency per slip: fixed sleeps replaced by waiting on
  frames and webfonts, which is also a stronger blank-page guard.

### Weighing scale
- Choosing COM4 now actually uses COM4. The old code reused the first
  previously authorised port without checking it matched, and the Electron
  handler silently substituted a different port when the chosen one was absent.
- An open port is no longer reported as a working scale: a distinct
  "PORT OPEN — NO DATA" state names the likely causes.
- Unplugging is detected and, optionally, reconnected with backoff. Previously
  the POS believed a dead scale was still attached.
- Manual weight entry is permanent, not hidden behind the scale being down.

### Branding
Digital Target's logo replaces the generic "D" tile as the Windows, installer
and browser icon (multi-resolution, legible at 16px), and every in-app logo
slot uses a properly cropped mark instead of the full lockup squeezed into a
32px square. The app also genuinely runs the brand palette now — a migration
had been force-setting an unrelated purple-and-pink theme on every install.
`--primary` measures exactly **#3C096C**.

### Other fixes
- One inventory item saved without a sale price crashed the entire Inventory
  page; all numeric fields are guarded.
- Asset paths that were absolute (favicon, manifest, PWA icons) and therefore
  broken under the `file://` protocol Electron loads from.
- Stale "cloud dashboard / real-time sync" copy on the login screen.

### Verification
- 101 unit tests pass, including new suites for the offline license key format,
  the billing write path, printer fallback and scale connection.
- `tsc --noEmit` clean; `vite build` clean; Windows installer config unchanged.
- 58 module routes opened in Chromium: no blank page, no crash, no horizontal
  overflow, zero runtime errors, zero external network requests.


## v1.0.40 (2026-08-13) — Cart section bara + adjustable

### Client report: "cart me sirf 2 items nazar aati hain, scroll karna parta hai"
**Asal wajah:** cart column sirf 280–300px chaura tha. Totals, keypad, note aur action buttons fixed jagah lete thay, is liye item list ke liye sirf ~2 rows bachti thin.

**Fix (client ki tajweez ke mutabiq — "left-right adjustment kar lo"):**
- **Cart ab drag se chaura/chhota** hota hai — baayein kinare par resize handle (280px se 560px). Chaurai `localStorage` me save rehti hai, POS dobara kholne par wohi rehti hai.
- **Default chaurai 300px → 380px** — is se hi keypad kam vertical jagah leta hai aur item list ko zyada milti hai.
- Header me **− / +** buttons bhi (mouse drag ke ilawa), aur handle par **double-click = reset**.
- Item list ko `basis` + screen-height ke hisab se **minimum height** di gayi — chhoti screen par kam, bari par zyada.
- Keypad ab `shrink` karta hai (pehle fixed tha), is liye **action buttons kabhi nahi katte** — Running/Hold hamesha nazar aata hai.

**Naapa hua natija (headless browser se, asal layout par):**

| Screen height | Items nazar | Buttons theek |
|---|---|---|
| 600px | 4 | ✅ |
| 720px | **6** | ✅ |
| 768px | **7** | ✅ |
| 900px | **10** | ✅ |
| 1080px | **16** | ✅ |

Har size par action buttons cart ke andar rehte hain — kabhi cut nahi hote.

### Verified
`tsc` ✅ · build ✅ · **76 tests pass** · layout 5 screen sizes par naap kar verify kiya.

## v1.0.39d (2026-08-13) — Table dialog wapas

### Client report: "ye pehle tha ab nahi hai"
Table par click karne wala dialog (Edit/Add Items, Transfer, Merge, Split, Mark Pending Payment, Payment & Free Table, View Dine History) nazar aana band ho gaya tha.

**Asal wajah:** dialog ka code kabhi HATA nahi tha — sab options `TablesPage.tsx` me mojood thay. Masla `handleTableClick` me tha: running table par click karte hi seedha POS par navigate ho jata tha (`/?retrieve=...`), is liye dialog khulne ka mauqa hi nahi milta tha. Yani options tak pahunchne ka RASTA band tha, options khud nahi.

**Fix:**
- Ab har table par click **dialog kholta hai** (chahe free ho ya running).
- POS jane ke liye dialog me naya numayan **"✏️ Edit / Add Items"** button — order mojood ho to usi order ko retrieve karta hai, warna table ke sath naya order kholta hai. (Yani pehle wala kaam ab ek extra click par, lekin saare table-management options ke sath.)
- "Mark as Paid & Free" ka label screenshot ke mutabiq **"💳 Payment & Free Table"**.
- Roman Urdu toast (`free ho gaya`) → English.

### Verified
`tsc` ✅ · build ✅ · **76 tests pass** · dialog ke saare buttons build bundle (`TablesPage` chunk) me confirm kiye.

## v1.0.39c (2026-08-13) — License delete option + Black Copper confirm

### License / Customer remove (client: "kabhi zyada licenses generate ho jate hain")
- Super Admin panel me har license par naya **🗑 Delete** action.
- **Do marhale ki tasdeeq** — pehle normal Delete, guard chale to Force Delete.
- **Safety guards:** jo license kisi machine par CHAL rahi ho (active device), ya kisi business ko assigned ho — wo seedhi delete nahi hoti. Pehle warning aati hai (warna customer ka POS band ho jata). Force option se hi hatti hai.
- **History zaya nahi hoti:** delete se pehle poora record `deletedLicenses` collection me archive hota hai (deletedBy + deletedAt ke sath). Archive na ho to delete hota hi nahi.
- Activity Logs me `license-deleted` entry.
- **Customers tab:** har customer par **🔑 Manage licenses** button — seedha us business ki licenses par le jata hai (customer alag record nahi, licenses se hi banta hai).
- Firestore rules: `allow delete` sirf Super Admin; `deletedLicenses` par update/delete kisi ko nahi (archive tamper-proof).

### Black Copper
Pehle se supported tha — confirm kiya. Kul **11 brand presets**: BIXOLON, Epson TM, Xprinter, **Black Copper**, Rongta, SPRT/SpeedX, Fujitsu, HPRT, Star Micronics, Citizen, Generic 58mm/80mm. Printer naam se brand khud detect ho kar paper size + render mode set ho jata hai.

### Verified
`tsc` ✅ · main build ✅ · superadmin build + tsc ✅ · **76 tests pass**.

## v1.0.39b (2026-08-13) — "Printer not detected" ROOT CAUSE FIX

### Client error
`Print fail: Printer "BIXOLON SRP-352plusIII (Copy 1)" Windows me detect nahi ho raha`
— halanke printer laga hua aur ON tha.

### Asal wajah (do alag bugs)
1. **Naam ki matching bohot SAKHT thi** — sirf exact equality (`name === requested`). `(Copy 1)` suffix, double space, non-breaking space (`\u00A0`), ya `name` vs `displayName` ka farq — kisi bhi wajah se match fail ho jata tha.
2. **Aur match na hone par HARD FAIL** — yani print ki koshish hi nahi hoti thi. Pichle release ka fallback chain (custom → driver → minimal) kabhi chalta hi nahi tha, kyunki us se PEHLE hi function return kar jata tha. Isi liye BIXOLON fix asar nahi kar raha tha.

### Fix
- **6-marhala matching** (`src/printing/printerMatch.ts`, wahi logic `main.cjs` me): exact → normalized → no-suffix → starts-with → contains → reverse.
- **Ab kabhi hard-fail nahi.** Match na mile to naam waise hi Windows ko de dete hain (`passthrough`) — spooler aksar khud resolve kar leta hai.
- **Aakhri safety net:** named printer par sab fail ho jaye to Windows ke **default printer** par ek koshish, aur user ko saaf warning.
- **Behtar error:** ab error me Windows ke reported printers ki poori list aur har koshish ka natija hota hai (`custom:fail | driver:ok`) — agla masla foran pakda jaye.
- **Renderer bhi theek:** `PrinterSettingsPanel` aur `printerDiagnostics` bhi wahi narm matching use karte hain — jhooti "Printer not detected" warning khatam.

### Verified
`tsc` ✅ · build ✅ · electron syntax ✅ · **76 tests pass** (18 naye printer-match tests — client ke asal naam "BIXOLON SRP-352plusIII (Copy 1)" ke 8 scenarios: Copy suffix, displayName, spacing, NBSP, Copy 2 mismatch, kai printers, plus false-positive guards).

## v1.0.39 (2026-08-12) — Printer compatibility (BIXOLON) + English pass

### 1. BIXOLON 352 / 111 Plus par print na hona — ROOT CAUSE FIX
**Asal wajah:** `electron/main.cjs` ka `print-receipt` handler **hamesha** custom `pageSize` (80000 microns) bhejta tha. BIXOLON class ke Windows drivers custom page size **reject** kar dete hain → job fail (isi liye error aata tha). Web version isi printer par chalta hai kyunki browser driver ki apni default page use karta hai — yehi farq tha.

**Fix — automatic fallback chain (koi printer-specific hardcode nahi):**
1. `custom` — explicit pageSize (Epson TM-T20 / generic ESC-POS par proven, behaviour same)
2. `driver` — koi pageSize nahi, Windows printer ki apni preferences (BIXOLON yahan chalta hai)
3. `minimal` — sirf silent + copies (aakhri koshish)

- Jo strategy chal jaye wo **printer ke naam ke sath yaad** rakhi jati hai — agli print pehli hi koshish me (koi extra delay nahi).
- "User cancelled" par aage koshish nahi hoti.
- Fail hone par **saaf error** milta hai jis me har koshish ka natija hota hai (error hide nahi kiya).
- Pehle se chalne wale printers par **koi regression nahi** — custom pehle hi try hoti hai.

### 2. Printer diagnostics (requirement 16)
Naya `print-diagnostics` IPC: app version, Electron/Chrome, Windows release, arch, printer name/driver/status/default, aur har printer ki working strategy. **Koi customer/business data record nahi hota.**

### 3. Paper width
58mm / 80mm / 110mm pehle se settings se aati hai (hardcode nahi) — verify kiya aur test se lock kiya.

### 4. Roman Urdu — user-facing text saaf
Bache hue ~13 hardcoded Roman-Urdu strings English me: ErrorBoundary ("Something went wrong"), branch tooltip, print speed test, brand signature, Menu Manager move up/down, Settings (tax exclusive, per-station routing, master switch, quick-amount placeholders), Admin Sales History PDF error. Build bundle scan: page/component chunks me **zero** Roman-Urdu user strings. Multi-language feature (English/Urdu/Roman Urdu/Arabic) intact — Urdu sirf tab jab user khud select kare.

### Verified
`tsc` ✅ · build ✅ · **58 tests pass** (11 naye print-strategy tests: BIXOLON scenario, regression guard, remembered strategy, paper widths). Versions aligned: package.json, superadmin, `version.ts` — sab **1.0.39**.

### ⚠️ Abhi baqi (agle round me)
Client ke prompt me maanga gaya poora **Region system** (currency/date/number format per country — Pakistan/Singapore) aur **complete i18n migration** (har module ka har string translation system me) is release me **shamil NAHI** — ye bara architectural kaam hai. Mojooda 4-language system aur English default kaam kar raha hai.

## v1.0.38c (2026-08-12) — POS Cart layout + License Device Management

### 1. POS Cart — scrolling khatam
**Root cause:** cart column par DO scrollbars thay (nested scrolling) — outer container par `overflow-y-auto` AUR andar item-list par bhi. Sath hi numpad + special note poori jagah kha jate thay.
- Outer container ab `overflow-hidden` + `min-h-0` — **sirf item list scroll hoti hai**.
- Header, totals, payment aur action buttons par `shrink-0` — hamesha nazar aate hain, kabhi scroll ke peeche nahi jate.
- **Keypad** aur **Special Note** ab collapse/expand ho sakte hain (▾/▸). Choice `localStorage` (`dtpos-cart-ui`) me save — refresh par bhi wohi rehti hai.
- Collapsed halat me bhi summary badge dikhta hai (note ka text / keypad ki value) — content chhupta nahi, sirf minimize hota hai.
- **Credit / Void / Cancel** ab 3-dot menu me (click-outside se band). "Running" button poora chaura.
- Koi functionality nahi hataayi: add/remove item, qty, customer, discount, promo, payment, scale, totals — sab waise hi.

### 2. Super Admin — License Device Management
**Root cause (backend):** license me sirf EK `deviceId` string thi. Ek dafa set hone ke baad koi doosra PC activate nahi kar sakta tha, aur purana "Reset Device" record hi mita deta tha — is liye wohi PC wapas aane par **dobara license mangta tha**.
**Aur ahem:** `firestore.rules` me `hasOnly([...])` me `devices` field allowed hi nahi thi aur `deviceId` change hard-block tha — sirf UI banane se kuch kaam na karta.
- Naya `devices[]` model: har device ka `id, status (active/unlinked), firstActivatedAt, lastSeenAt, unlinkedAt, unlinkedBy, appVersion`.
- Naya `maxDevices` — Generate form me "Devices allowed" field, baad me Manage Devices se bhi change ho sakta hai.
- **Unlink = delete nahi.** Status 'unlinked' hota hai → slot **foran khali**, aur history audit ke liye mehfooz. Wohi PC wapas aaye to **usi record se dobara active** — license dobara nahi manga jata.
- Activation ab **sirf ACTIVE devices** ginta hai — purane/historical records nayi machine ko block nahi karte.
- **Manage Devices** modal: device list, status badges, first/last seen, Unlink (confirmation ke sath), Re-link, device limit editor, empty state.
- License row par `💻 used/allowed` badge.
- Verify cycle bhi multi-device aware — warna doosri machine har cycle par block hoti.
- **Security:** `maxDevices` sirf Super Admin likh sakta hai (Firestore rules me bhi enforce) — client apni limit khud nahi barha sakta.
- **Purane customers safe:** legacy `deviceId` khud-ba-khud `devices[]` me migrate hoti hai — koi logout nahi.
- Legacy `adminResetDevice` bhi ab consistent (active devices ko unlink karta hai, warna slot ghera reh jata).

### Verified
`tsc` ✅ · main build ✅ · superadmin build + tsc ✅ · **47 tests pass** (17 naye device-slot tests: unlink→slot free, purani device wapas, limit full, legacy migration, Firestore round-trip). Versions aligned: package.json, superadmin, `version.ts` — sab **1.0.38**.

## v1.0.38b (2026-08-12) — client-reported scale errors + KOT qty
### Weighing scale (2 errors from screenshots)
- **"requestPort: No port selected by the user"**: `electron/main.cjs` ka serial handler empty/na-mile port list par foran `callback('')` de deta tha. Windows par WCH PCI-E serial ports (COM3/COM4) kabhi thodi der se enumerate hote hain. Ab handler `serial-port-added` par 4s tak intezaar karta hai, phir preferred COM port select karta hai (ya real adapter par fallback — Bluetooth/COM1 chhod kar).
- **"Failed to open serial port"**: `weightScale.ts` ab open fail hone par 400ms baad ek dafa retry karta hai (port aksar purane handle se free ho raha hota hai), aur saaf English error deta hai (port kisi aur program/POS window me khula ho sakta hai).

### KOT quantity
- `kotQtyLabel` ab kabhi khali nahi — quantity missing/0/NaN par bhi "1" (blank qty guard).
- Classic KOT par qty ab item NAAM ke aage bhi plain bold text me ("2 × Chicken Biryani") — agar dayein box printer par clip ho to bhi qty nazar aaye. Qty box ko `flex-shrink:0` + `nowrap`.
- NOTE: pichla CSS-only qty fix kaafi nahi tha. Physical printout ki photo + printer model se 100% confirm ho sakta hai.

## v1.0.38 (2026-08-09)
### Round 2 — client testing feedback (KOT qty + scale errors)
- **KOT qty on NETWORK/LAN printers (client: "online KOT me qty print nahi hoti")**: ESC/POS text conversion me item-name aur qty alag `<span>` the bina separator ke, is liye flatten hone par qty naam se chipak jati thi ("Chicken Biryani3"). Ab `</span>` ko space se separate kiya — "Chicken Biryani  3". USB/Windows-driver printers ka HTML path pehle hi theek tha (headless print render se qty "3"/"2" saaf visible confirm ki).
- **Scale connect errors ("requestPort: No port selected" + "open: Failed to open serial port")**:
  - Failed open ab port ko `null` kar deta hai — pehle half-open port bacha reh jata tha aur agli koshish ghalti se "connected" samajh leti thi.
  - Main process ka fallback ab legacy "Communications Port (COM1)" aur Bluetooth serial links ko skip karta hai — asal USB/PCI serial adapter (scale) ko prefer karta hai. Pehle galti se COM1 khul jata tha jahan scale nahi hoti (open fail).
  - Clear, actionable English error messages: port busy / dusra program band karein / Settings me COM port check karein.
  - Port matching portName + displayName dono par (Windows par COM number kabhi friendly-name me hota hai).


- Poore app me bikhre hue ~50 hard-coded Roman-Urdu user-facing strings (toasts, labels, placeholders, confirm dialogs, hints) professional English me convert kiye — POS, Settings, Super Admin, Online Order, Tables, Menu Manager, Staff, Receiving, Credits, KDS/KOT sab. Default language pehle bhi English tha; ab English mode me kahin bhi Urdu leak nahi hoti (verified: build bundle ke page/component chunks me zero Roman-Urdu user strings).
- Multi-language feature (English / Urdu / Roman Urdu / Arabic) bilkul intact hai — Urdu sirf tab dikhega jab user khud us language ko chunay. Agar Roman-Urdu / Urdu options hatane hain to bata dein.
- `src/lib/version.ts` ka stale `APP_VERSION = '1.0.10-offline'` ab `1.0.38` ke saath aligned (browser mode me sahi version dikhega).
- Design system (purple #3C096C / #5A189A / #E0AAFF, status colors, radii) pehle se app me mojood tha aur reference design se match karta hai — tokens change ki zaroorat nahi thi.


- **KOT qty ghayab thi (client report)**: `printCss.ts` ka `.print-black-box` rule qty box ko `color:#fff` par force kar raha tha `!important` ke saath. Thermal printer par safed text = koi ink = qty print hi nahi hoti thi (browser preview me theek lagti thi). Ab kaala text + solid border, background transparent — thermal-safe. Classic / Bold / VIP-Chef / Station sab designs par qty ab print hoti hai.
- **KOT cancel bug**: `printQueue.ts` me cancel clamp `Math.max(it.quantity, …)` tha — is se cancellation ka koi asar nahi hota tha aur cancelled item agli KOT par dobara chhap jata tha. Ab `Math.max(0, …)`.
- **Weight items KOT par**: pehle weight item ki qty "1" chhapti thi (asal wazan chhupa hota tha). Ab seedha "1.250 KG" chhapta hai — kitchen ke liye saaf.
- **Print queue jam / double print**: `AutoKotPrinter.tsx` me primary-host guard subscription ke baad tha aur dependency array khali `[]` thi — natija: 2-second poll kabhi start nahi hota tha aur passive host bhi print kar deta tha (stuck queue + double KOT). Guard ab sab se upar, deps theek.

### Weighing Scale (RS232 / COM Port)
- **COM port select (client request)**: pehle `electron/main.cjs` hard-coded `portList[0]` utha leta tha — scale COM4 par ho aur COM3 par kuch aur, to POS ghalat device se jur jata tha. Ab Settings me COM port chuna jata hai (COM3/COM4…), main process usi ko match karta hai — **portName aur displayName dono** me COM number dhoondta hai (Windows par kabhi COM3 friendly-name me hota hai), na mile to logged fallback. Client ki machine par do WCH PCI-E serial ports the (COM3, COM4) — yeh isi ke liye test kiya gaya.
- **Naya Scale Settings card** (`WeightScaleSettingsCard.tsx`): COM port dropdown + Refresh, baud / data bits / parity / stop bits, unit (kg/g/lb), auto-connect, auto-capture, aur **live raw-data monitor** — testing ke waqt dikhta hai scale asal me kya bhej rahi hai (saaf lines = sahi, garbage = baud mismatch, kuch nahi = ghalat port ya straight cable).
- `weightScale.ts`: configured port match, raw-line listeners, active-port tracking, auto-connect bootstrap.

### Weight items (Crab @ rate/kg)
- Weight item ka button dabate hi scale se wazan **khud** aa jata hai (auto-capture), ya **F9 / "Get Weight"** button se manual.
- **NaN price bug fix**: `ratePerKg` set na ho to `kg × undefined` = NaN aur line Rs.0 par chali jati thi. Ab saaf error message.
- **Price rounding setting**: `whole` (PKR default — 1.25kg×10=13) ya `decimal` ($ — 1.25kg×10=12.50).
- Cart line + KOT + receipt sab par note `1.250 KG @ 10/KG` format me.

### Verified
- `tsc -b` green · `vite build` green · **27 tests pass** (26 QC tests: scale parsing, weight pricing, KOT qty label, cancel clamp, aur COM3/COM4 port matching client ki machine ke mutabiq) · new files eslint-clean.

## v1.0.4 (2026-06-27)
### Critical fixes
- **LAN / Network Printer**: Receipt aur Test Print ab same path use karte hain. ESC/POS bytes UTF-8 safe, HTML→text layout preserve, blank-slip guard added. Counter role pe LAN printer configured ho to local receipt automatically TCP raw print pe jata hai.
- **Business Day Engine** (new `src/lib/businessDay.ts`): Restaurant apna Business Day Start/Close time set kar sakta hai (Settings → KOT tab). 08:00 AM → 03:00 AM jaisi shifts ek hi business day me count hongi. Dashboard widgets (Today/Yesterday/Current Shift/Business Day) is engine ko use karte hain.
- **Date + Time Range Filter** (new `src/components/DateTimeRangeFilter.tsx`): Today / Yesterday / This Week / This Month / Custom presets — har report me drop kar sakte hain.

### Super Admin
- **Online / Offline Device counts** monitoring panel ke top strip me already present, ab "View Portfolio" link bhi.
- **Portfolio Dashboard** (new `/super-portfolio`): Global KPI strip + per-restaurant cards (Today sale, Month sale, Online devices, Plan, Expiry) + Daily Sales line + Top Restaurants bar. Real-time via Firestore snapshots.

### Settings
- Naya "Business Day Timing (Shift)" card — Start & Close time inputs.

### Verified
- TypeScript build green.


## v1.0.1 (2026-06-18)

### Highlights
- Version bumped to **1.0.1** across web app, desktop app, and Release Manager defaults.
- Support Chat widget visibility fixed — now appears only on **Dashboard** and **Settings**, hidden on POS and all other screens.
- Documentation added: `BUILD_AND_RELEASE.md`, `QA_REPORT.md`, `RELEASE_NOTES.md`.

### Preserved (no breaking changes)
- Firebase multi-tenant structure (`tenants/{tenantId}/...`) unchanged.
- Device approval, Super Admin gating, feature flags untouched.
- All existing modules intact: POS, Dine-in, Takeaway, Delivery, KDS, Rider portal, HR, Accounts, Inventory, WhatsApp, Release Manager, Auto-updater, Offline sync, Silent print, Printer mapping.

### Known limits (require live environment)
- Silent printing, KOT printer mapping, rider GPS, Firebase security rules, and offline→online sync need real hardware / live tenant to fully validate. See `QA_REPORT.md`.
