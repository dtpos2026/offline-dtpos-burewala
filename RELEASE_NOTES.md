# DT POS Enterprise — Release Notes

## v1.11.0 — The settings screen, split

Nothing about Settings looks or behaves differently. This is the last item on
the improvement list, and it is maintenance: a file that had grown to the size
where people stop changing it.

### What was actually wrong, and what was not

SettingsPage.tsx was 3,989 lines. Two things I had assumed about it turned out
not to be true when I looked:

- it **already uses tabs**, so there was no wall of scrolling to fix;
- the tab library **only mounts the tab you are looking at**, so there was no
  performance cost either.

What was left is the real problem and a narrower one: nineteen tabs in one
file, where changing the receipt layout means scrolling past the Day Close
approval flow, and the risk of breaking something while changing something
else is high enough to make people cautious.

### Three tabs moved out

**Receipt**, **Printer** and **Kitchen ticket** now live in their own files —
1,450 lines, about a third of the page. Each was chosen because it needed a
**short list** of things from the page around it, and a short prop list is what
makes a move like this checkable rather than hopeful:

| Tab | Needs |
|---|---|
| Receipt | settings, setSettings, save, sample order |
| Printer | + installed printers, size presets, auto-start |
| Kitchen ticket | + kitchens, test print |

Not one line of what those tabs do changed. They read the same settings, save
through the same handler, and none of them reaches into the store behind the
page's back — a tab fetching its own copy would drift from the page's, and a
shop would watch a value change in one place and not the other. Tests pin all
three, and pin that the prop lists cannot quietly grow back.

The page is now 2,631 lines.

### Two tabs stayed, deliberately

**Day Close** is tangled with navigation, who is logged in, the order list and
an approval flow: moving it would mean threading twenty values through a prop
list, which trades one tangle for another. **General** is close behind. Neither
is worth the risk for a file-size number, and a test records that decision so
it is not mistaken later for something that was missed.

---

## v1.10.0 — The money is under test

Nothing a cashier does changes. This release puts the two calculations that
handle money and stock behind tests, and corrects two claims I made earlier
that measuring did not support.

### What the customer pays is now a module

The arithmetic between a cart and a grand total — discounts, service charge,
tax, delivery, rounding — lived inline in POSScreen.tsx among three thousand
lines of screen. That meant the one calculation in this application that
handles money was the one calculation nobody could test.

It moved to `src/lib/billTotals.ts` **unchanged**. Every line does what the
screen did, including the rounding choices, and the 28 tests lock that
behaviour rather than describe a better version of it — a "tidier" formula
would be a silent change to what a shop charges.

What is now pinned, with the reason each matters:

- discounts apply only to the **discountable** part, so a staff discount does
  not come off the cigarettes;
- the service charge is taken on the **discounted** amount, and tax on the
  subtotal **plus** the service charge;
- the shop's own worked example — item 100 → SC 10% → GST 9% → **119.90**;
- inclusive tax is shown, not added again;
- delivery is neither discounted nor taxed;
- rounding is last, so the slip and the till agree;
- and three stacked discounts on a small bill **cannot take it negative**.

### Stock coming off a sale is under test too

23 tests on the deduction engine, including the fault it was written to end:
three code paths deducting for the same paid order, so twenty burgers sold
took sixty off the shelf. Deducting twice is now a test failure.

Also pinned: a running or held bill takes nothing off; a credit sale does;
recipe units convert properly, because 250 g off a 5 kg bag is 0.25 and not
250, and getting that wrong empties a store room on paper in one shift; an
item with both a recipe and a direct link is deducted once, not twice; weight
items deduct the weight rather than the line count; and a void puts back
exactly what came off.

### Two corrections

**The bundle.** I said the 1.1 MB main chunk was costing 4–8 seconds because
xlsx, jsPDF and the charting library were inside it. Measuring says they are
already separate chunks and only the main one is preloaded, so they load when
a shop opens the screen that uses them and startup never pays for them. No
change was made, because there was nothing to fix.

**The types.** I said 534 `any` meant TypeScript was nominal here. Looking
properly: `types.ts` has none, `printQueue.ts` has two, and the single biggest
concentration — 62 in `offlineNoCloud.ts` — is deliberate, documented and
carries its own eslint exemption, because that module is an inert stub
standing in for a cloud SDK at dozens of legacy call sites that can never
execute. The core data and printing modules are properly typed. There is no
cleanup worth the churn.

---

## v1.9.0 — Faults that leave a trace, and a till you can rebuild

Nothing in this release changes how a bill is taken. It is about the three
things that go wrong in month six rather than in a demo.

### A failure now leaves a trace

This codebase carries hundreds of bare `catch {}` blocks, and most of them are
right to swallow — a failed log line must not take a bill down with it. But the
same habit had been applied to failures that matter, and those vanished, which
is why a support call could only ever start and end with "it stopped working".

`reportFault` is the other half of that pattern. The catch still swallows, so
nothing changes for the cashier; the failure is now written into the rolling
`app.log` the desktop app already keeps, and into a short in-memory list the
Diagnostics screen shows. Anything that escapes every catch in the app —
an uncaught error, an unhandled promise — is caught by a global net and
recorded too, instead of being a blank screen with no record of why.

### Running out of storage is visible instead of silent

The whole database goes into one localStorage key, against a browser quota of
roughly 5–10 MB. A busy counter passes that in months, and every write then
threw into a `console.error` nobody reads — the cashier carrying on taking
bills that were not being saved.

On Windows the desktop app is not actually relying on that cache: the JSON data
file is the durable store. So a full quota now stops the pointless mirroring,
keeps the file writes going, and **reports it once, loudly**, instead of failing
quietly forever. A failed write to the data file — which on Windows really is
data loss — is reported rather than logged to a console.

### The order archive stops growing forever

`archiveOrders` merged every order a shop had ever taken into another single
localStorage key, with no cap, sharing the same budget as the live database.

It keeps the newest 20,000 now — a shop doing 150 bills a day holds well over a
year, which is more than the reports screens ask for. If storage is tight
anyway it halves rather than losing the archive to a failed write, and says so.
Day Close backups still hold everything, so nothing dropped here was the only
copy.

### This machine's setup survives the machine

Every printer margin on a counter was found by somebody standing at a printer
with a ruler, and none of it lived anywhere but that PC's browser storage. A
dead hard disk cost a day.

**Printer Center → Diagnostics & setup** now saves one JSON file carrying the
lot: print margins, per-slip margins, printers with their roles and modes,
print quality, calibration, both display designs, the announcement voice and
output. Restoring it on a replacement computer takes a minute.

It deliberately carries **no** sales, orders, customers, staff or licence keys —
that is the shop's data, it has its own backup, and mixing them would make a
settings file something you could not safely hand to anybody. Keys are listed
explicitly rather than swept up by prefix, so a future release cannot quietly
start exporting something that should stay on the machine.

### One file for support

The same screen exports a diagnostics file: app version, screen and platform,
the last 500 log lines, recent faults, the print log, the printer configuration
and the machine setup — plus a note field, because what the shop was doing when
it went wrong is usually the most useful line in the whole report.

### A correction on startup speed

An earlier suggestion of mine said the 1.1 MB main bundle was costing 4–8
seconds because xlsx, jsPDF and the charting library were bundled into it. That
was wrong, and measuring said so: those are already separate chunks and only
the main one is preloaded, so they load when a shop opens the screen that uses
them and startup never pays for them. No change was made, because there was
nothing to fix.

---

## v1.8.0 — The boards as drawn, and the number spoken in Urdu

### The screens now match the printed designs

**The customer screen** is a white order panel beside the shop's media: a
purple "Now Serving" bar, a row per order carrying **ORDER #102** with what the
order is beneath it and a green **READY** badge on the right, and the shop's own
message along the bottom. The newest ready order is highlighted.

Why white cards on a coloured screen: the frame carries the shop's colour and
the rows are *read*. Scanning for your own number is the same job as reading a
receipt, and dark-on-light is what that job wants.

**The kitchen board** has a lane per stage — NEW, PREPARING, READY, DELIVERY,
COMPLETED — each under a solid colour bar, with light tickets beneath. A ticket
shows the number, the table, the wait, then item lines as **quantity then item**,
which is the order a cook works in. The header carries the kitchen, the time and
the date; the shop's bar runs along the bottom.

The status colours are now fixed across every template: red is not started,
amber is cooking, green is ready, blue is out with a rider, grey is done. A cook
learns that in their first shift and then reads the board by colour alone from
across the kitchen — a template that renamed those colours would take that away.

### The order number, in Urdu

Six wordings, three in Urdu and three in English, each carrying the **language
tag** Windows needs to choose a voice. That tag is the whole trick: without it
an Urdu sentence is handed to an English voice and comes out as nonsense.

A shop can also announce **twice, in two languages** — the number in Urdu and
again in English, which is what most counters here actually want. Where Windows
has no voice for a language installed, the settings screen says so before the
shop relies on it, and the test button says so again.

### Where the sound comes out

The announcement can start with a **chime**, and that chime can be sent to a
chosen output — the dining-room speakers over a USB sound card, say, leaving the
rest of the computer's sound alone.

The **spoken** part cannot be routed this way and the screen says so plainly.
Windows produces speech outside the page and sends it to the app's own output,
which is set in Windows under Sound → Volume mixer. There is no code that
changes that, and pretending otherwise would have a shop set a device, hear the
announcement on the wrong speakers, and have no way to understand why.

### A screen plugged in, or pulled out

Windows tells the app the moment a monitor appears or disappears — HDMI,
DisplayPort, VGA through an adapter, a USB display, it makes no difference — and
the Display Center list updates immediately and says what changed.

It is a **notification, not an action**. Nothing opens, moves or closes by
itself: a display window jumping monitors mid-service, or re-opening over the
till while a bill is being taken, is exactly the disturbance this prevents. The
list is kept honest; the shop clicks the screen it wants.

### The screens react at once, and the till never waits

Changes now carry across windows on an instant channel as well as through
storage, so a number reaching READY on the counter screen, or a ticket landing
on the kitchen board, happens as it happens rather than a beat later.

It is a **nudge only** — no data travels on it, the receiving window re-reads
for itself. A browser without the channel loses nothing but the promptness, and
the till is never waiting on a display window for anything.

---

## v1.7.2 — The receipt fills the roll again

**This fixes a regression I introduced in 1.7.1.** The receipt came out
narrower than the paper with a right margin well over 10 mm.

### What happened

The raster path screenshots the slip and scales that screenshot to the
printer's dots. The screenshot is not always exactly the slip: whether the
hidden worker window can be sized to the document depends on Windows' minimum
window width, the display's scale factor and whether a child overflowed. On a
real machine there can be blank beside it — and scaling that blank in with the
content shrinks the receipt to fit alongside it.

A crop to the slip's **ink** used to remove that blank. In 1.7.1 I turned it
off, because cropping to the ink has its own fault: the ink is a different
width on every bill, so a receipt with a long widest line and one with a short
widest line were cropped and then scaled differently — same shop, same
settings, two widths. Turning it off fixed that and brought the blank straight
back. Both behaviours were wrong; I traded one fault for a worse one.

### The fix

The document now **states its own width**. The raster document carries a
hairline rule across its first two rows, the full width of the slip. The raster
stage reads row one, takes the first and last inked column as the document's
edges, crops to exactly those, and discards the rule before anything is printed.

It is the same two columns on every bill, so the crop is identical on every
bill *and* the blank still goes. The ink crop remains as a fallback for a
capture with no rule.

Guards, because this runs on hardware I cannot test on: a run of solid rows
longer than a hairline could be is treated as a shop's own black header band
and left alone; a mark too narrow to be the document is ignored; and anything
unrecognised falls back to the ink crop, which is what 1.7.0 did. The rule is
in the raster document only — the Windows driver prints its page as-is, where a
rule would be a black line across the top of every receipt.

### Also

`getSize()` reports device-independent pixels while `toBitmap()` returns
physical ones. On a display running at 125% or 150% — the default on many
Windows machines — those differ, and reading the wider buffer as if it were the
narrower one walks off the end of every row. The dot packer now takes its width
from the buffer's own length, which cannot lie.

---

## v1.7.1 — The calibration reaches the paper in every mode

Five faults reported from the counter, and the layouts from the mockups.

### Left 3 / Right 5 now prints the same in Auto/RAW as in Driver mode

The machine needs Left 3 / Right 5 to print a centred slip. In Windows
Driver Only that worked; in Auto / RAW Fast it did not, and changing the
numbers did not move the print the way they said.

The margin plumbing was reaching the raster stage correctly. **The raster
stage was undoing it.** It cropped the capture down to its ink and then resized
that crop back up to the full content width — which stretches the slip to fill
whatever room the margins leave, applying them and taking them away in the same
step. Worse, the crop is measured per bill: a receipt with a long widest line
and one with a short widest line got different scale factors, so the same shop
with the same settings got two different widths.

That crop existed to rescue a squeezed slip whose real cause was the capture
being measured with `scrollWidth`, and that was fixed at the source. It is off
by default now, and the capture maps one-to-one onto the printable dots.

The test suite drives the real raster pipeline and reads the **dots** back out
of the print job for every pair asked for — 3/5, 5/5, 5/3, 8/5, 3/8 — plus the
two that matter most: change only Left and the ink moves by exactly that many
dots; change only Right and the far edge moves instead.

### Prints arriving late, or sticking

`/customer-display` and `/kds-tv` sat inside the app layout, which mounts the
print-queue host. Those screens open as **separate Electron windows**, so the
shop's TV was running a second copy of it. The "only one host" guard is a
module variable — one JavaScript context, not two windows — and the
cross-window lock behind it expires after eight seconds.

So the TV would take a job, mark it `printing`, render the receipt into its own
hidden DOM and print nothing, because the spooler call goes through the till's
window. The till then waited on a job somebody else had claimed until the
twenty-second safety timeout fired. Every background worker is now kept off
those routes, and the print host refuses to run in a display window regardless.

Two smaller causes of a wrong slip went with it. The direct-print settings cache
was **emptied** on every settings change, so a print landing in that gap
silently lost the printer's margins, paper size and cut setting; it is replaced
rather than emptied now, with a generation counter so a slow load cannot
overwrite a newer one. And the role resolver filtered on a truthy `enabled`
while startup detection and role mapping both read `!== false` — a config
restored from an older build has no such field, so the resolver found nothing
and that printer's margins looked inert.

### Add video did nothing

It called `window.prompt()`, which Electron does not implement: it returns null,
so the button was a no-op in the packaged app and worked only in a browser. It
opens a **native file chooser** now, with an address field beside it for a URL.
The video is not copied — only its path is stored — so the file has to stay
where it is, which the screen says.

### Order numbers sheared off

Four-digit numbers printed as `#111` with the last digit cut, and `#1105`
spilled outside its border. They were sized from the **viewport** while the tile
is only as wide as the column split and the column count leave it. Tiles now
declare a container and the number is fitted to it by digit count, so it fits
whatever the split, the screen or the order number.

### The layouts from the mockups

The customer screen has a **NOW SERVING** list: the shop's media on one side and
a read-down list on the other, each row carrying the order number, what the
order is, where it goes and a READY badge. A queue is read top to bottom, and a
bare number tile has nowhere to put the item name.

The kitchen board has **status lanes** — NEW, PREPARING, READY, DELIVERY,
COMPLETED — so a cook reads their own lane instead of scanning the whole wall,
and an order visibly travels left to right as it is worked. Five lanes fit
across a wide TV and fall into two rows on a narrower one, which is the second
mockup reached without a second layout. The older wall grid is kept for the
templates that suit a small kitchen. Both layouts render the same ticket
component, because two copies of that markup is how one of them ends up showing
a quantity the other does not.

---

## v1.7.0 — The margin settings do what they say, and the printer is ready at startup

Three faults that were costing a shop real time every day, and a display
system built around the point that the screen belongs to the restaurant.

### The Left margin setting did nothing

The layout resolver forced the two side margins to match by taking the
**smaller** of them. That was written to defend against stale lopsided values
on machines already in the field, and it did stop those — but it also threw
away every margin anyone typed by hand. Setting Left to 3 mm to stop the left
edge being clipped returned 0, the clipping carried on, and the setting looked
broken because it was.

Stale values now belong to the storage migrations that own them. The resolver
applies the numbers it is given: 4 mm left with 1 mm right shifts the slip
right, and stays there. Slack the resolver creates by itself — a calibrated
width, a clamp against an unreadable slip — is still split evenly, so nothing
nobody asked for collects on one edge.

### The RAW slip printed clipped on the left

Both side margins defaulted to zero, on the reasoning that the head's own
~4 mm unmarkable edge already *is* the margin. On a perfectly seated roll that
holds. On a roll a person loaded by hand it does not: the first markable column
lands at or past the edge of the paper.

Each paper profile now carries a safe inset in printer dots — **2.0 mm on
80 mm, 1.5 mm on 58 mm, 2.5 mm on 110 mm** — and that is what an unconfigured
slip gets. An explicit 0 is still obeyed and still fills the whole head.

Two migrations top up only the side margins that are currently **zero**, once
per machine. A printer calibrated to 3 mm / 5 mm because that is what squares
the slip on that hardware keeps those numbers: a non-zero margin is somebody's
measurement.

### The raw path was reading one setting and ignoring the rest

Fixing the resolver made Printer Settings reach the *rendered* slip. The raw
ESC/POS builders were still reading a single shop-level field — not the
printer's own calibration from Printer Center, not the per-slip margins, not
this device's. So the same bill moved when it went through the Windows driver
and refused to move when it went raw.

The builders now take a resolved geometry, in the documented order: this slip
kind's own margin, then the printer's calibration, then the device's. An unset
value stays unset rather than becoming 0, so the safe inset applies. The same
resolution carries the printer's **paper size** (a 58 mm kitchen printer under
an 80 mm shop default was building tickets at 576 dots and letting the printer
wrap every line), its calibrated width, and two switches the raw path had never
read at all — a printer set *not* to cut still cut, and one set to beep stayed
silent. The shift report is treated as the fourth slip kind.

### Every bill queued as Pending until Detect & Save was pressed

Nothing in the print path was broken; it was never told which device to use.
Startup detection now repairs the three ways a machine got there:

- **nothing configured** — adopt the Windows default printer, with its brand
  preset and that roll's safe inset;
- **a name Windows has since renamed** — a driver reinstall turns `POS-80`
  into `POS-80 (Copy 1)`; the saved name is re-pointed at the real device;
- **empty role targets** — Printer Center looked correct while the fields the
  print *queue* reads were blank.

It changes nothing when the configuration is already right, and when Windows
reports no printers it says so rather than inventing one. **Re-detect** in
Printer Center runs the same pass instead of only redrawing the list.

### Printer Center, by module

Thirteen cards in one column became eleven modules with a list beside them,
one shown at a time, remembered per device. On a phone the list is a strip of
chips above the content. No card was removed.

The new module is the one that was missing: **Role mapping** — which printer
each slip goes to. There were two lists of printers and nothing joining them, so
a printer could be added, detected and test-printed successfully while every
real bill still queued. It shows fallbacks rather than hiding them, and a saved
name Windows no longer has is flagged and stays selectable.

### Customer Display and Kitchen Display: designs

Ten designs for the screen above the counter, seven for the kitchen board,
chosen from a picker that **previews before it applies** — these screens are
usually in another room from the person configuring them.

Templates are data, not components: each is a set of colours and scales applied
as CSS custom properties to one layout, so ten looks do not become ten places
an order can fail to appear.

**Automatic mode** reads the screen the display actually opened on. A square or
portrait panel gets the compact design, which shows *more* rather than the same
layout squeezed; a large wide TV gets the big-number one. Kitchen ticket columns
come from the real pixel width instead of CSS breakpoints, because a 1366 px
monitor and a 4K TV are both "xl" and are not the same board.

### Whose branding this is

Digital Target writes the software. The restaurant it is installed in owns the
screen its customers look at, and the ticket its kitchen works from. So the
shop's logo and name are the largest things on both screens and at the top of
the KOT, and **Powered by Digital Target** is one small line underneath, which
a shop can switch off.

The rendered KOT always printed the shop's name; the raw one did not, so
switching a kitchen printer to raw quietly stripped it off every ticket. Both
print it now.

### Orders and advertising

The customer screen's width split is the shop's: 70/30, 50/50, 30/70,
orders-only, or any figure typed. On a narrow screen the banners move below the
orders rather than both being squeezed.

Each banner carries its own fit, position and size, applied as CSS to the
original file. Nothing is re-encoded on the way in, so a poster is shown at the
quality it was uploaded at, and **whole image** is the default — a deal with the
price cropped off it is worse than a black band.

### The second screen updates now

The Kitchen Display and the Customer Display are separate windows running the
same code, and they only read. The store returns an in-memory cache that only a
*mutation* replaced — so in a read-only window it was filled when the window
opened and stayed that way. Both screens showed whatever was on them when the
shop opened them; a customer's number never moved to READY.

They now listen for the browser's cross-window storage event, which fires in
every window except the one that wrote. A mutation this window has not flushed
is written out before the cache is dropped, so a counted bill cannot go with it.

### Screens, click to activate

A screen card in the Display Center opens the display on that screen there and
then, and shows each screen's shape (16:9, 4:3, portrait) — the property that
decides how the board is laid out. The list refreshes itself while the card is
open, so a TV switched on afterwards simply appears.

### Calibrating from a ruler instead of by trial

A client found by trial that Left 3 mm / Right 5 mm squared their slip in
Windows Driver mode. That is a real measurement of real hardware and it is
kept — but arriving at it took an evening of print, look, adjust, print again,
and every shop whose roll sits slightly differently has to repeat it.

The Alignment Test now takes the two gaps measured off the printed slip and
works out the margins that centre it. If the two figures do not add up to the
blank paper the profile expects, it says the slip is printing at the wrong
**width** — a paper profile or driver scaling fault — instead of moving
margins to disguise it.

### Switches that did nothing

Printer Center showed five toggles and two were read by nothing. **ESC/POS**
said exactly what Print Mode → Raw says; a shop that turned it on got no raw
printing and no explanation. It is gone, and stored values are folded into
Print Mode once per machine so the intent survives the switch.

**Browser Backup** would have restored a fallback that was removed on purpose:
at an unattended counter it put a modal print dialog in front of the cashier
*and reported the job as successful*, so a dead printer froze the till and hid
the failure. The browser build still falls back to the browser's own dialog by
itself. A switch whose honest label would be "freeze the till and hide the
error" should not exist.

**Auto Cut** and **Beep** were in the same state until this release — stored,
shown, and never read by the raw path. They are read now.

### Packaging

`npm run package:release` produces the ZIP a client is sent, and
`POS_TEST_CHECKLIST_v1.7.md` is the hardware sheet to work through with it.
The ZIP is source, not an installer: `electron-builder --win nsis` has to run
on Windows to produce an EXE that has actually been near the target platform.

---

## v1.6.0 — Customer Display: order-ready screen with your own branding

A second kind of screen, for the person standing at the counter rather than
the cook. They need two answers, readable across a room — is my order being
made, and is it ready — and something to look at in between.

### The screen

Two columns. **PREPARING** in amber with the wait time; **READY** in green,
the largest type on the display. A newly-ready order flashes and is **spoken
aloud** with its number, so a customer who looked away for ten seconds does
not miss it. A ready order then *stays on screen* for a hold period after it
is collected, because someone who stepped outside comes back and looks up.

### Your own banners and video

Beside the columns is a media panel: images you upload, or a video. Deals,
offers, brand imagery — this is the one moment the customer is standing still
and looking up, and a display that is only numbers wastes it.

The panel only appears when banners have actually been added; an empty panel
is worse than no panel, so without any the order columns take the full width.
A video plays through to its end before the next item rather than being cut
off by a timer. Banners live in this device's storage, which is a few
megabytes in total — the settings screen shows the current size, warns as it
fills, and reports a storage failure plainly instead of pretending an upload
worked.

### Announcements

Spoken through the voice installed in Windows. Wording is yours —
`Order number {n} is ready. Please collect.` by default — with a repeat count
and a **Test the voice** button. If no speech voice is installed the test says
so, rather than leaving a shop believing announcements are happening.

An order is announced **once**. Whatever was already ready when the screen
opened is not news and stays silent. The screen can also be muted at the
screen itself.

### Choosing what goes on the second screen

The Display Center now asks **what** to show as well as **where**: the dense
kitchen board cooks work from, or the customer display. With two external
screens a shop can run both. Everything the screen shows is read-only — the
display can never change an order; every status comes from the kitchen.

### Verified

335 tests. The announcement rules, the storage limits and the read-only
guarantee are all covered; the external-screen behaviour needs real hardware
and is noted as such.

## v1.5.0 — Kitchen Display Center, per-slip margins, LAN discovery

### Kitchen Display / TV Mode

**TV Mode** now opens a Kitchen Display Center: pick the screen the kitchen
will watch, then open the display on it as a real second window, positioned
inside that screen's bounds and made fullscreen.

A note on what the picker shows. Electron reports the displays the operating
system has — label, resolution, scale, position, which is primary — but it
does **not** report the cable. Windows exposes no API for "this monitor is on
HDMI". An HDMI/USB/VGA picker would therefore be a label with nothing behind
it. So screens are identified by their OS name and resolution instead, and
every connection appears the same way, because once the OS has a screen it
*is* the same thing to the application: bounds a window can be placed on.
Whichever cable it arrived by, the display lands where you point it. With no
screen chosen, an external one is preferred over the cashier's own monitor.

The kitchen board itself gained a **Recently Finished** strip — a short
ten-minute memory, not a history — where completed orders read green and
cancelled orders read red with the number struck through, because a
cancellation has to be noticed within seconds or food keeps being made. New
orders carry a **NEW** flag that expires on its own, with a one-shot entry
animation. Movement is deliberately restrained: this screen is watched for
hours, and anything that moves constantly becomes noise. `prefers-reduced-motion`
is honoured.

### Print Margin Settlement — one margin per kind of slip

Separate left/right margins for **Customer Receipt**, **KOT**, **Token** and
**Reports**, because the slips are cut and handled differently: a KOT is torn
off and spiked, a bill is handed over, a token goes in a pocket. The KOT's
right margin can now be nudged for the cutter without touching anything else.

Every field defaults to **inherit**, so an untouched installation prints
exactly as it did before — the printer's own calibration and then the device
default still apply. Only a number that is actually typed overrides anything.

### LAN printer discovery

**Find Network Printers** probes TCP 9100 across the machine's own /24
subnets, with capped concurrency and a short timeout so it cannot swamp the
network the POS is also using for orders. A host that answers is *reported*,
never auto-configured: answering on 9100 makes it very likely a printer, and
"very likely" is not "is". One click adds it as a LAN printer ready to be
assigned a role.

### Marketing navigation freeze

Moving between WhatsApp, Customers and CRM stalled for two to three seconds.
Every page is lazy-loaded and the recharts chunk is ~375 KB, so the first CRM
visit parsed it synchronously on the main thread. Parsing cannot be made
faster, only moved somewhere nobody is waiting — the heavy chunks are now
warmed during idle time once the POS has settled. No UI, data or behaviour
changed; if a prefetch fails the normal lazy import still runs as before.

### Smaller fixes

- **POS menu**: item name one step larger and heavier; price in a tinted,
  bordered chip so it no longer runs into the name. A shop that chose its own
  menu font still wins.
- **Department token**: the same monospace family as the receipts, item name
  at the largest size on the stub, and the quantity in a ruled box — a boxed
  number is found at a glance, a bare one has to be read for.
- **Network error messages** are now in English rather than Roman Urdu.

### Verified

320 tests. Retrieve → View → Print was inspected and left unchanged; it works.
Routes without a menu entry were audited and every one is deliberate (public
portals, the KDS window, superadmin). The three margin surfaces are three
different scopes, not duplicates, so none were merged.

## v1.4.1 — Counter fixes: Retrieve KOT, CRM freeze, duplicate menu, bolder slips

### "Reprint KOT from Retrieve does nothing"

Two faults stacked. The de-duplication guard that stops a double-click
producing two KOTs matched **any** pending or printing job for that order,
regardless of age — and a job can sit in `printing` forever when the app closed
mid-print, the spooler never answered, or the printer was unplugged. From then
on every KOT for that order was dropped. On top of that, the Retrieve screen
showed a success toast without looking at the result, so a dropped job looked
exactly like a printed one.

Jobs older than 60 seconds no longer block, and the screen now reports when a
print was not queued and why. The receipt reprint had the same unconditional
toast and is fixed with it.

### Customers → CRM froze on opening

The page called `getCustomers()`, `getBranches()` and `getOrders().filter()`
directly in the render body and listed the results as `useMemo` dependencies.
Each returns a **new array**, so the memo's inputs changed identity on every
render and it never once hit its cache: opening the page re-scanned the whole
order and customer history — a filter, a reduce, three passes over the
customers and a full sort — on every render, and again for every chart
re-render underneath. Those sources are memoised now, so the work happens once.

### Two menu entries called Retrieve

The `retray` entry directly under Void is retired. The POS screen's own
Retrieve Bills dialog is the one cashiers use, and two identically named menu
items was a standing source of confusion. The page and its route remain, so an
existing bookmark still works — only the duplicate menu entry is gone.

### Bolder raw slips, and margins you can nudge

- **Bold text on raw slips**, on by default. A thermal head fades with age and
  a compact slip fades first because its strokes are thinner; bold costs no
  extra paper. Switchable in Printer Settings.
- **Side margin nudge** in the Print Alignment Test card: −0.5 mm / +0.5 mm and
  a "Full width" reset, applied to **both** edges together. Letting the two
  drift apart is what produced the lopsided slips, so a genuine per-machine
  head offset stays on the calibration screen where it belongs.

### Cancel KOT

Checked and unchanged: cancelling or voiding an order still sends a KOT built
from what was already printed, with each line marked `CANCEL`, so the kitchen
stops cooking. Covered by tests now so it cannot quietly regress.

## v1.4.0 — Automatic fills the roll; Windows driver stops freezing the POS

Three print modes photographed side by side settled both faults at once:
Windows Driver Only filled the roll with correct margins but took seconds and
stuck the screen; Raw ESC/POS was fast and correct; Automatic was fast but
printed noticeably narrow with a wide band down the right.

### 1. Automatic (rendered template, sent as RAW) — narrow slip fixed

Only Automatic goes through a screen capture. The slip is captured from the
print worker's **viewport**, and the viewport is exactly the slip only when
everything lines up: `setContentSize` not clamped by Windows, the zoom factor
mapping CSS pixels as expected, and no child overflowing the authored width. On
a real machine any one of those leaves blank space beside the content — and
because the capture is then downscaled so its **full width** fills the
printable dots, that blank steals room from the receipt.

The raster stage now trims blank columns from the sides **before** the
downscale, so the receipt itself is what fills the paper, whatever the capture
picked up around it. A capture whose ink covers too small a fraction is left
alone: enlarging it that far would be a guess, not a fix. Template layout and
print quality are untouched — only the blank margin is removed.

### 2. Windows Driver Only — the seconds-long stall and the stuck screen

Driver-only switched the fast path off entirely, which sent the job to the
`print-receipt` handler — and that handler prints `mainWindow.webContents`,
**the whole POS window**. Chromium laid the entire application out for the
printer and blocked the renderer until the spooler answered: several seconds
per bill, the screen frozen meanwhile, and the slip appearing well after the
bill had been saved.

The driver's *rendering* is what the shop wants to keep; printing the POS
window was never part of it. Driver mode now keeps the hidden print worker and
skips only the raster stage, so the same driver output arrives with the fast
path's responsiveness and the POS screen never enters print mode at all.

### 3. Raw ESC/POS — deliberately untouched

Already fast and correct, so nothing in that path was modified.

### Verified

291 tests. The raster path measures 0.0 mm worst left/right difference and
100% ink coverage across all 20 templates. The crop is driven by tests that
reproduce the exact squeeze: a capture with a wide blank band restores to full
width, a healthy capture is left byte-identical, and a genuinely narrow slip is
refused rather than blown up.

## v1.3.4 — The slip was not mis-margined, it was being squeezed

A silent test print came back printing its own margins on the paper —
`Margins T:0 R:2 B:0 L:2 mm`, equal — and yet the content covered only about
60% of the roll with a wide blank band down the right. The margins were never
the problem on that slip. The capture was.

`electron/main.cjs` measured the slip as `Math.max(rect.width, scrollWidth)`.
The document is laid out at exactly the content width, so `scrollWidth` only
exceeds `rect.width` when a child **overflows** — a long unbroken word, a table
whose columns will not compress, an oversized image. That overflow is blank
paper to the right of the real content, and taking it as the capture width
meant the downscale to the printer's 576 dots squeezed the entire receipt into
a fraction of the roll.

The arithmetic: a child overflowing by about two thirds of the slip drops ink
coverage to roughly 60% of the paper — which is what the photographed slip
showed, on margins that were already equal.

- The capture width is now the slip's **authored** width. Overflow is clipped,
  which is what the head does with it anyway, rather than scaled down.
- The overflow is written to the log with its size and the usual causes, so it
  is visible rather than inferred from a photograph.
- The layout sets `overflow-x: hidden` on the slip root so it cannot happen in
  the first place. Vertical overflow stays visible — a slip grows downwards.
- The Test Print now passes the same geometry a real slip uses. It passed none
  of it, so it could report one geometry on the paper and print another, which
  is useless when the slip is the thing you are diagnosing with.

Verified across all 20 templates: 0.0 mm worst margin difference, 0 px
overflow, 100% ink coverage.

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
