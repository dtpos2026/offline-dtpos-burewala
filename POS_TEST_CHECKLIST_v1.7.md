# DT POS Enterprise v1.7.0 — Hardware Test Checklist

Everything in this release is covered by automated tests except the one thing
that matters most: what comes out of the printer. **Physical paper overrules
code.** If a check below disagrees with the software, the software is wrong —
write down what the paper did and it will be fixed against that.

Test machine: ____________________  Printer: ____________________
Paper: 58 / 80 / 110 mm            Date: ____________

---

## 1. Startup — the printer is ready without being asked

The whole point of this section: **PC on → printer on → software open → bill →
it prints.** No Detect, no Save.

| # | Step | Expected | Pass |
|---|------|----------|------|
| 1.1 | Turn the PC and printer on, open DT POS | Printer Center → Status shows the printer | ☐ |
| 1.2 | Take one order and pay it | It prints. It does **not** sit in Pending | ☐ |
| 1.3 | Printer Center → Role mapping | Customer bill and KOT both show a printer, marked **Routed** | ☐ |
| 1.4 | Close the app, rename the printer in Windows (add " Copy"), reopen | Printer Center still finds it; a bill still prints | ☐ |
| 1.5 | Unplug the printer, open the app | It says no printer is installed. It does **not** invent one | ☐ |

**If a bill lands in Pending:** open Printer Center → Role mapping and
photograph it. That screen names exactly what is missing.

---

## 2. Margins — the setting must move the paper

This is the fault that came back five times. Test it on paper, not on screen.

| # | Step | Expected | Pass |
|---|------|----------|------|
| 2.1 | Printer Center → Alignment test → **Print via Raw ESC/POS** | The `=` ruler reaches both edges on **one line**, no wrap | ☐ |
| 2.2 | Measure the blank paper at each edge | Left and right within **1 mm** of each other | ☐ |
| 2.3 | Read "Margins equal?" on the slip | Says **YES** | ☐ |
| 2.4 | Set the printer's Left margin to **6 mm**, print again | The slip visibly moves **right**, by about 6 mm | ☐ |
| 2.5 | Set Left back, set Right to **6 mm**, print again | The slip moves **left** | ☐ |
| 2.6 | Set both to 0, print again | The slip fills the full printable width | ☐ |
| 2.7 | Leave both blank (unset), print again | About **2 mm** of clear paper each side. Nothing clipped on the left | ☐ |
| 2.8 | Repeat 2.1–2.7 with **Print via Windows driver** | The same movement, the same measurements | ☐ |

**2.4 is the acceptance test for this release.** If the slip does not move when
the Left margin changes, stop and report it — that is the exact fault this
version exists to fix.

---

## 3. Calibration from a ruler (new)

| # | Step | Expected | Pass |
|---|------|----------|------|
| 3.1 | Print the alignment slip | — | ☐ |
| 3.2 | Measure both gaps, type them into **Measured on the printed slip** | It states how far off centre the slip is and which way | ☐ |
| 3.3 | Press **Apply** | The margins change to the pair it proposed | ☐ |
| 3.4 | Print the slip again and measure | Both edges now match within 1 mm | ☐ |
| 3.5 | Type two gaps that add up to far more blank paper than the profile expects | It warns that the **width** is wrong, and does not pretend margins will fix it | ☐ |

---

## 4. Every slip, both modes

Run each with Print Mode = **Raw ESC/POS**, then again with **Windows Driver Only**.

| # | Slip | Expected | Raw | Driver |
|---|------|----------|-----|--------|
| 4.1 | Customer bill | Full width, equal edges, cuts clear of the last line | ☐ | ☐ |
| 4.2 | KOT | Restaurant's name at the top; quantities correct | ☐ | ☐ |
| 4.3 | KOT update | Only the changed items, with their deltas | ☐ | ☐ |
| 4.4 | KOT cancel | Cancelled lines struck through | ☐ | ☐ |
| 4.5 | Token slip | Big number, readable across a counter | ☐ | ☐ |
| 4.6 | Shift report | Total matches the day's takings | ☐ | ☐ |
| 4.7 | Reprint from Retrieve | Same slip, no double token, no double sale | ☐ | ☐ |

---

## 5. Printer switches actually do something

| # | Step | Expected | Pass |
|---|------|----------|------|
| 5.1 | Printer Center → Printers → turn **Auto Cut** off, print a bill | The paper does **not** cut; it feeds and stops | ☐ |
| 5.2 | Turn Auto Cut back on, print | It cuts | ☐ |
| 5.3 | Turn **Beep** on, print | The printer beeps as the slip finishes | ☐ |
| 5.4 | Set the kitchen printer to **58 mm** while the shop default is 80 mm | The KOT prints at 58 mm width, no wrapped lines | ☐ |
| 5.5 | Confirm the ESC/POS and Browser Backup toggles are gone | Only Enabled, Auto Cut and Beep remain | ☐ |
| 5.6 | If ESC/POS had been ON before upgrading | That printer's Print Mode now reads **Raw ESC/POS** | ☐ |

---

## 6. Speed

Time from pressing **Pay** to the printer starting to move.

| # | Mode | Target | Measured | Pass |
|---|------|--------|----------|------|
| 6.1 | Raw ESC/POS | under 1 s | ______ | ☐ |
| 6.2 | Automatic (render → raw) | under 3 s | ______ | ☐ |
| 6.3 | Windows Driver Only | under 4 s | ______ | ☐ |
| 6.4 | Ten bills in a row, any mode | No slowdown, no freeze, no stuck queue | | ☐ |

---

## 7. Printer Center navigation

| # | Step | Expected | Pass |
|---|------|----------|------|
| 7.1 | Open Printer Center | Eleven modules listed at the side, one shown | ☐ |
| 7.2 | Click through all eleven | Each opens; nothing blank; no long scroll | ☐ |
| 7.3 | Open Margins, leave the page, come back | It reopens on Margins | ☐ |
| 7.4 | Narrow the window to phone width | The list becomes a strip of chips above the content | ☐ |

---

## 8. Customer Display

| # | Step | Expected | Pass |
|---|------|----------|------|
| 8.1 | Kitchen Display → TV Mode → click a screen card | It opens on that screen immediately | ☐ |
| 8.2 | Check the header | **Your** restaurant's logo and name are the largest things | ☐ |
| 8.3 | Check the small line under it | "Powered by Digital Target", one line, small | ☐ |
| 8.4 | Turn that line off in settings | It disappears from the screen | ☐ |
| 8.5 | Take an order in the POS | It appears under PREPARING **within 5 seconds** | ☐ |
| 8.6 | Mark it ready in the kitchen | It moves to READY on the customer screen, and is announced | ☐ |
| 8.7 | Try each of the ten designs — preview first | The preview matches what Apply produces | ☐ |
| 8.8 | Set the split to 50/50, then 30/70 | The banner panel grows as stated | ☐ |
| 8.9 | Add a banner, set fit to "Whole image" | Nothing is cropped, nothing stretched | ☐ |
| 8.10 | Set width to 60% and position to Top | The banner obeys both | ☐ |
| 8.11 | Add a video | It plays to its end before the next item | ☐ |
| 8.12 | Switch to **Match the screen automatically** on a 4:3 panel | The compact design is chosen; nothing is stretched | ☐ |

**8.5 and 8.6 are the second-screen fix.** Before this release those numbers
never moved.

---

## 9. Kitchen Display

| # | Step | Expected | Pass |
|---|------|----------|------|
| 9.1 | Open the kitchen board on the second screen | Restaurant's logo and name in the header | ☐ |
| 9.2 | Take an order in the POS | It appears on the board within 10 seconds, with the NEW flag | ☐ |
| 9.3 | Tap through Accept → Start → Ready | The POS and the customer screen both follow | ☐ |
| 9.4 | Void an order in the POS | It shows CANCELLED in the finished strip within seconds | ☐ |
| 9.5 | Try each of the seven designs | Colours change; every ticket stays readable | ☐ |
| 9.6 | Set Columns to 0 (automatic) | The count suits the screen — more on a wide TV | ☐ |
| 9.7 | Set Columns to 3 | Exactly three, whatever the screen | ☐ |

---

## 10. No regressions

| # | Area | Expected | Pass |
|---|------|----------|------|
| 10.1 | KOT quantities | Correct on every ticket, including updates | ☐ |
| 10.2 | BIXOLON printer | Still prints through its three-strategy fallback | ☐ |
| 10.3 | Weighing scale (COM port) | Still reads weight | ☐ |
| 10.4 | LAN printer on 9100 | Still prints | ☐ |
| 10.5 | Retrieve → print KOT | Prints; cancel prints the struck-through slip | ☐ |
| 10.6 | CRM / Marketing screens | Open without freezing | ☐ |
| 10.7 | Day close and backup | Completes, figures match | ☐ |
| 10.8 | Printer settings after restart | Still there; still machine-local | ☐ |

---

## Reporting a failure

For anything that fails, the fastest fix comes from:

1. a **photograph of the paper**, next to a ruler where margins are involved;
2. the **alignment slip** printed just before or after it — it carries the
   profile, the dot width, the margins and where they came from;
3. which **Print Mode** was selected;
4. what you did immediately before.

The alignment slip is the single most useful thing to send. It describes its
own settings, so nothing has to be guessed at from a screenshot.
