# DT POS Enterprise — Design, UI, Receipts, KOT & Token: the A-to-Z Reference

**Based on:** POS **v1.21.0** · Super Admin **v1.1.0** (30 Oct 2026)
**Written for:** upgrading the online system with the same look, the same slips and the same settings.
**Everything in this file was read from the code** (the registries `uiThemes.ts`, `premiumReceiptTemplates.ts`,
`tokenSlip.ts`, `displayTemplates.ts`, the Settings tabs, `ui-tokens.css`, the release notes) **and every slip
picture was rendered by the app's own print simulator** — nothing here is a mock-up.

> **Roman Urdu mukhtasar (pehle ye parhein)**
>
> - **Looks / themes:** 2 styles (Classic, Modern). Modern ke andar **13 food-colour themes**, **8 DT Retail themes**
>   (Royal Purple, Crimson, Black & Gold, Emerald, Sunset, Ocean, Night, **Espresso Orange**) aur **Custom** (apni theme
>   khud banao, `.json` export/import). Section 3.
> - **Screens:** sidebar + More launcher, Module Management, POS order screen (tiles, Order panel, categories top/left/right,
>   All-Categories grid), Premium payment screen, kg side panel, PIN sign-in, retail dashboard, Customer Display ka live bill.
>   Section 4.
> - **Receipts:** total **52 designs** — 25 purane (classic family), 16 Premium (13 + 3 café), 11 **DT Retail**. Har design ki
>   asli printer-jaisi picture neeche hai. Section 5.
> - **KOT:** 9 designs (Classic … **DT Kitchen Order**), per-order-type auto KOT, update/cancel KOT, copies, mirror, station
>   printers. v1.21 mein "Kitchen button par double KOT" fix hua. Section 6.
> - **Token:** 12 designs (5 DT Retail + 3 professional + 4 original), rules (categories + items), department/tear-off stubs.
>   Section 7.
> - **Settings:** har tab ka matlab aur important keys — Section 10. **Printer Center** — Section 11.
> - **Online system mein port karne ka tareeqa** (kya pehle copy karein, kya nahi, gotchas) — Section 13.
> - Recent PDF (User Guide, 143 pages) alag file hai: `DT-POS-Enterprise-User-Guide-v1.20.1.pdf`. Ye MD us PDF ka
>   *design/print* wala hissa gehrai se samjhata hai aur PDF mein jo cheezein nahi thin (theme values, slip ids,
>   settings keys, porting) wo add karta hai.

---

## Contents

1. [What is in this package](#1-what-is-in-this-package)
2. [The design rules (read this before you port anything)](#2-the-design-rules)
3. [Themes, A to Z](#3-themes-a-to-z)
4. [Screens and layout](#4-screens-and-layout)
5. [Receipts — all 52 designs](#5-receipts--all-52-designs)
6. [KOT (kitchen) slips](#6-kot-kitchen-slips)
7. [Token slips](#7-token-slips)
8. [Report slips](#8-report-slips-thermal)
9. [Customer Display and Kitchen Display templates](#9-customer-display-and-kitchen-display-templates)
10. [Settings, tab by tab](#10-settings-tab-by-tab)
11. [Printer Center](#11-printer-center)
12. [What is new, version by version](#12-what-is-new-version-by-version)
13. [Porting to your online system](#13-porting-to-your-online-system)
14. [Where everything lives in the code](#14-where-everything-lives-in-the-code)
15. [Honest limits](#15-honest-limits)
16. [Appendix — storage keys and HTML attributes](#16-appendix--storage-keys-and-html-attributes)

---

## 1. What is in this package

| File / folder | What it is |
| --- | --- |
| `DESIGN_UI_A_TO_Z.md` | This document. |
| `design-gallery/receipts/` | 52 receipt designs (`legacy-*` = the 25 classic-family designs, `premium-*` = 16, `dtr-*` = 11), each exactly as the thermal head prints it (80 mm, 576 dots wide, 1-bit). |
| `design-gallery/kot/` | 9 kitchen-slip designs (`kot-<id>.png`). |
| `design-gallery/tokens/` | 12 token designs (`token-<id>.png`). |
| `design-gallery/reports/` | 5 thermal report slips (shift report, sales summary…). |
| `design-gallery/themes/` | POS screen of every theme (and the Dashboard of the 8 DT Retail themes) at 1366 × 768. |
| `design-gallery/tools/capture-themes.mjs` | Regenerates the theme pictures. The slip pictures come from `scripts/simulate-print.mjs` (see [14](#14-where-everything-lives-in-the-code)). |
| `user-guide/screenshots/` | The 23 real screens used in this file (the full set of 129 is inside the PDF's source). |
| `DT-POS-Enterprise-User-Guide-v1.20.1.pdf` | The 143-page branded User Guide (sent separately). |

The sample restaurant in every picture is fictional ("Sample Restaurant").

---

## 2. The design rules

These come from `docs/UI_DESIGN_SYSTEM.md` and the tests that enforce them. They are the part to copy **before** copying
any colour.

1. **Presentation only.** Theme, style and layout change colours, radii, shadows, spacing and which navigation is shown.
   They never touch sales, bills, stock, users, the licence or printing.
2. **One set of tokens.** Every colour, radius, shadow, size and font is a CSS variable in `src/styles/ui-tokens.css`.
   New screens use the tokens (`bg-card`, `text-muted-foreground`, `bg-primary` …) — **never hex values**.
3. **Scoped by attributes on `<html>`.** Every Modern rule starts with `html[data-ui="modern"]`; every DT Retail rule must also
   contain `[data-look="retail"]`. Classic = the attribute is absent, so none of it matches. Tests fail the build if a rule
   leaks (`ui-style.test.ts`, `dt-retail-look.test.tsx`).
4. **Print is separate from screen.** Receipt, KOT and token printing build **their own document** that never carries
   `data-ui`, so no theme can alter a printed slip. The slips have their own designs (sections 5–8).
5. **Readable by test.** Every theme is checked for contrast: body text ≥ 7 : 1, other text ≥ 4.5 : 1, text on the accent ≥ 4.5 : 1
   (white on the brand colours of DT Retail is ≥ 3 : 1, the designer's exact colours). A custom colour is moved until it passes.
6. **Status colours mean something.** Green = paid/active, amber = pending/running, red = overdue/failed/danger,
   blue = info. Do not reuse them as decoration.
7. **Popups stay centred.** An entrance animation may only animate `opacity` and the `scale` property, never `transform`
   (Radix centres with `transform`). Dialogs are capped at `100dvh − 1.5rem` and scroll inside; a popup with a main action keeps it
   in a sticky footer.
8. **Where UI and function conflict, the function wins.**

---

## 3. Themes, A to Z

### 3.1 Two interface styles

| Style | What it is | Attribute |
| --- | --- | --- |
| **Modern** (default) | Light, flat surfaces; one accent colour; a theme decides the colours; Manrope typeface | `<html data-ui="modern">` |
| **Classic** | The interface exactly as it was before v1.15 (its own colour themes and dark option) | attribute absent |

*Settings → Appearance.* The choice is saved **per computer** and applies at once (no restart). Classic is one click away.

Under Modern there are three families: **Modern themes (13)**, **DT Retail (8)** and **Custom**.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/set-appearance.png" width="420" alt="Appearance"><br><b>Settings → Appearance</b> — style, families, theme gallery.</td>
<td valign="top"><img src="user-guide/screenshots/set-appearance-retail.png" width="420" alt="Appearance DT Retail"><br><b>DT Retail</b> family selected (animations switch, "Back to my previous look").</td>
</tr></table>

### 3.2 The 13 Modern themes

A theme is a **whole look**: page tint, panels, borders, the accent, the colour of text that sits on the accent, the colour the accent
takes when it is used *as text*, and whether the sidebar is light or dark. Food-colour names, because that is what a restaurant recognises.

| Id | Name | Accent | Accent (HSL) | Text on accent | Sidebar | Page background (HSL) | Feel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ember` | Ember Orange | `#d3420d` | `16 88% 44%` | light | light | `40 18% 96%` | Warm and appetising. The default. |
| `tomato` | Tomato Red | `#cc1925` | `356 78% 45%` | light | light | `24 12% 96%` | Bold pizza-menu red on clean white. |
| `pizza` | Red & Yellow | `#d5151f` | `357 82% 46%` | light | light | `220 16% 96%` | Fast-food brand look: red actions, yellow highlights, cream plates. |
| `fresh` | Fresh Green | `#1d7c50` | `152 62% 30%` | light | light | `148 24% 96%` | Salad-bar green with a mint-white page. |
| `sunny` | Sunny Yellow | `#fbbc0e` | `44 97% 52%` | dark text | light | `48 46% 95%` | Lemon yellow with dark, easy-to-read text on it. |
| `white` | Clean White | `#1c212c` | `222 22% 14%` | light | light | `220 20% 98%` | Milk-white and graphite. Calm and minimal. |
| `ocean` | Ocean Blue | `#175fd3` | `217 80% 46%` | light | light | `214 34% 96%` | Cool blue for a seafood or modern café. |
| `coffee` | Coffee Brown | `#744525` | `24 52% 30%` | light | light | `32 30% 95%` | Latte cream and espresso brown, made for cafés. |
| `rose` | Rose Pink | `#c51b5f` | `336 76% 44%` | light | light | `340 32% 97%` | Sweet-shop and bakery pink. |
| `violet` | Royal Purple | `#631da5` | `271 70% 38%` | light | light | `266 32% 97%` | Deep purple, close to the Digital Target brand. |
| `teal` | Mint Teal | `#167e77` | `176 70% 29%` | light | light | `176 28% 96%` | Fresh teal, light and clean. |
| `charcoal` | Charcoal Orange | `#d3420d` | `16 88% 44%` | light | DARK | `40 18% 96%` | Dark charcoal sidebar with the orange accent. |
| `navy` | Navy Night | `#175fd3` | `217 80% 46%` | light | DARK | `214 34% 96%` | Deep navy sidebar with a bright blue accent. |

Notes:
- **Ember Orange** is the default (`DEFAULT_THEME_ID`).
- **Sunny Yellow** puts *dark* text on the yellow, and uses a deep amber (`34 90% 30%`) wherever the accent is text (prices, links).
- The surface colours (page, card, border, muted) of each theme live in `ui-tokens.css` under
  `:root[data-ui="modern"][data-ui-theme="<id>"]`; the same triplets are in `uiThemes.ts` and a test fails if the two drift.
- *"Use my own accent colour"* still works on top of any theme (`dtpos-ui-accent`); choosing a theme clears it. A pale colour is
  darkened automatically until white text on it reaches 4.6 : 1 (`safeAccent`).

**What the 13 look like** (POS screen with a bill in the cart):

<table>
<tr><td valign="top"><img src="design-gallery/themes/ember-pos.png" width="330" alt="Ember Orange"><br><b>Ember Orange</b> · <code>ember</code></td><td valign="top"><img src="design-gallery/themes/tomato-pos.png" width="330" alt="Tomato Red"><br><b>Tomato Red</b> · <code>tomato</code></td><td valign="top"><img src="design-gallery/themes/pizza-pos.png" width="330" alt="Red & Yellow"><br><b>Red & Yellow</b> · <code>pizza</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/fresh-pos.png" width="330" alt="Fresh Green"><br><b>Fresh Green</b> · <code>fresh</code></td><td valign="top"><img src="design-gallery/themes/sunny-pos.png" width="330" alt="Sunny Yellow"><br><b>Sunny Yellow</b> · <code>sunny</code></td><td valign="top"><img src="design-gallery/themes/white-pos.png" width="330" alt="Clean White"><br><b>Clean White</b> · <code>white</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/ocean-pos.png" width="330" alt="Ocean Blue"><br><b>Ocean Blue</b> · <code>ocean</code></td><td valign="top"><img src="design-gallery/themes/coffee-pos.png" width="330" alt="Coffee Brown"><br><b>Coffee Brown</b> · <code>coffee</code></td><td valign="top"><img src="design-gallery/themes/rose-pos.png" width="330" alt="Rose Pink"><br><b>Rose Pink</b> · <code>rose</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/violet-pos.png" width="330" alt="Royal Purple"><br><b>Royal Purple</b> · <code>violet</code></td><td valign="top"><img src="design-gallery/themes/teal-pos.png" width="330" alt="Mint Teal"><br><b>Mint Teal</b> · <code>teal</code></td><td valign="top"><img src="design-gallery/themes/charcoal-pos.png" width="330" alt="Charcoal Orange"><br><b>Charcoal Orange</b> · <code>charcoal</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/navy-pos.png" width="330" alt="Navy Night"><br><b>Navy Night</b> · <code>navy</code></td><td></td><td></td></tr>
</table>

### 3.3 The 8 DT Retail themes

Made after the **"DT Retail POS Design Guide"**: dark gradient sidebar with a brand mark and a "Powered by Digital Target" card, a greeting
banner and a highlighted lead KPI on the Dashboard, a user chip with log-out in the header, rounded cards, softer shadows, the **Inter**
typeface, animated welcome and sign-in. Black & Gold and Night are **dark pages**. Each theme also has a sidebar gradient and a hero
gradient (below).

| Id | Name | Accent | Accent (HSL) | Text on accent | Dark page? | Swatches (sidebar · accent · page · highlight) | Feel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dtr-royal` | Royal Purple | `#6b26d9` | `263 70% 50%` | light | no | `#2a0a55 · #6d28d9 · #f4f2f9 · #f5b301` | Digital Target signature — deep purple luxury. |
| `dtr-crimson` | Crimson Red & White | `#dc2828` | `0 72% 51%` | light | no | `#2b0b0d · #dc2626 · #faf6f5 · #ffffff` | Bold red with clean white cards. |
| `dtr-gold` | Black & Gold | `#d39e17` | `43 80% 46%` | dark text | YES (dark page) | `#050505 · #d4a017 · #1a1810 · #f6efdc` | Dark luxury with gold accents. |
| `dtr-emerald` | Emerald | `#059467` | `161 94% 30%` | light | no | `#063a2b · #059669 · #f2f8f5 · #ffffff` | Fresh green — food & grocery. |
| `dtr-sunset` | Sunset Orange | `#e9590c` | `21 90% 48%` | light | no | `#34160a · #ea580c · #faf6f2 · #facc15` | Warm, energetic and friendly. |
| `dtr-ocean` | Ocean Blue | `#0284c5` | `200 98% 39%` | light | no | `#07304a · #0284c7 · #f1f6fa · #ffffff` | Calm, corporate and clear. |
| `dtr-night` | Night | `#895af6` | `258 90% 66%` | light | YES (dark page) | `#070c17 · #8b5cf6 · #0b1120 · #e6ebf5` | Dark mode for dim shops. |
| `dtr-espresso` | Espresso Orange | `#e9590c` | `21 90% 48%` | light | no | `#2a1b16 · #ea580c · #faf6f2 · #f5802d` | Espresso brown and orange, with PIN sign-in (the look of DT Retail POS v1.8). |

Extra attributes on `<html>` for this family:

| Attribute | Set when | Used for |
| --- | --- | --- |
| `data-look="retail"` | a DT Retail theme is chosen | every rule in `ui-retail.css` |
| `data-ui-mode="dark"` | Black & Gold or Night | dark-page fixes for screens that hard-code light colours |
| `data-anim="off"` | *Smooth animations* switched off | stops every retail animation (also honours the system's "reduce motion") |

**Sidebar gradient and hero gradient per theme** (HSL, top → bottom and start → end):

| Theme | Sidebar | Hero banner |
| --- | --- | --- |
| `dtr-royal` | `265 79% 18%` → `265 88% 10%` | `270 85% 21%` → `259 82% 66%` |
| `dtr-crimson` | `356 58% 10%` → `357 64% 5%` | `0 64% 31%` → `0 81% 62%` |
| `dtr-gold` | `0 0% 2%` → `40 27% 4%` | `43 98% 19%` → `46 77% 55%` |
| `dtr-emerald` | `162 81% 12%` → `160 80% 6%` | `164 86% 17%` → `160 69% 43%` |
| `dtr-sunset` | `18 67% 12%` → `18 74% 6%` | `16 76% 29%` → `26 94% 63%` |
| `dtr-ocean` | `204 82% 16%` → `203 87% 9%` | `202 81% 25%` → `199 89% 61%` |
| `dtr-night` | `221 53% 6%` → `222 48% 11%` | `273 84% 22%` → `259 87% 67%` |
| `dtr-espresso` | `17 68% 12%` → `16 73% 6%` | `17 79% 32%` → `25 91% 57%` |

**POS screen in each DT Retail theme:**

<table>
<tr><td valign="top"><img src="design-gallery/themes/dtr-royal-pos.png" width="330" alt="Royal Purple"><br><b>Royal Purple</b> · <code>dtr-royal</code></td><td valign="top"><img src="design-gallery/themes/dtr-crimson-pos.png" width="330" alt="Crimson Red & White"><br><b>Crimson Red & White</b> · <code>dtr-crimson</code></td><td valign="top"><img src="design-gallery/themes/dtr-gold-pos.png" width="330" alt="Black & Gold"><br><b>Black & Gold</b> · <code>dtr-gold</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/dtr-emerald-pos.png" width="330" alt="Emerald"><br><b>Emerald</b> · <code>dtr-emerald</code></td><td valign="top"><img src="design-gallery/themes/dtr-sunset-pos.png" width="330" alt="Sunset Orange"><br><b>Sunset Orange</b> · <code>dtr-sunset</code></td><td valign="top"><img src="design-gallery/themes/dtr-ocean-pos.png" width="330" alt="Ocean Blue"><br><b>Ocean Blue</b> · <code>dtr-ocean</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/dtr-night-pos.png" width="330" alt="Night"><br><b>Night</b> · <code>dtr-night</code></td><td valign="top"><img src="design-gallery/themes/dtr-espresso-pos.png" width="330" alt="Espresso Orange"><br><b>Espresso Orange</b> · <code>dtr-espresso</code></td><td></td></tr>
</table>

**Dashboard in each DT Retail theme** (greeting banner, lead KPI, second row of cards):

<table>
<tr><td valign="top"><img src="design-gallery/themes/dtr-royal-dashboard.png" width="330" alt="Royal Purple"><br><b>Royal Purple</b> · <code>dtr-royal</code></td><td valign="top"><img src="design-gallery/themes/dtr-crimson-dashboard.png" width="330" alt="Crimson Red & White"><br><b>Crimson Red & White</b> · <code>dtr-crimson</code></td><td valign="top"><img src="design-gallery/themes/dtr-gold-dashboard.png" width="330" alt="Black & Gold"><br><b>Black & Gold</b> · <code>dtr-gold</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/dtr-emerald-dashboard.png" width="330" alt="Emerald"><br><b>Emerald</b> · <code>dtr-emerald</code></td><td valign="top"><img src="design-gallery/themes/dtr-sunset-dashboard.png" width="330" alt="Sunset Orange"><br><b>Sunset Orange</b> · <code>dtr-sunset</code></td><td valign="top"><img src="design-gallery/themes/dtr-ocean-dashboard.png" width="330" alt="Ocean Blue"><br><b>Ocean Blue</b> · <code>dtr-ocean</code></td></tr>
<tr><td valign="top"><img src="design-gallery/themes/dtr-night-dashboard.png" width="330" alt="Night"><br><b>Night</b> · <code>dtr-night</code></td><td valign="top"><img src="design-gallery/themes/dtr-espresso-dashboard.png" width="330" alt="Espresso Orange"><br><b>Espresso Orange</b> · <code>dtr-espresso</code></td><td></td></tr>
</table>

**Classic** for comparison:

<img src="design-gallery/themes/classic-pos.png" width="420" alt="Classic">

### 3.4 Espresso Orange (v1.20) — "the DT Retail POS v1.8 look"

The eighth DT Retail theme. Same rules as the others, plus a block scoped to `[data-ui-theme="dtr-espresso"]`:

- **Sign-in:** a wider (54 %) espresso panel with two orange glows and faint Digital Target marks, "Welcome to *<shop>*", six feature chips,
  *Developed by Digital Target* and *Licensed to <licence holder>*. The cream side **is the PIN page** (name cards, 4 dots, keypad) with a
  *Use username & password* link and a first-login hint while the admin still has the factory password.
- **Shell:** a stacked clock (`05:06 pm / Wed, 07 Oct 2026`) and, for administrators only, a red line *"You are using the default admin password.
  Change it in Users to protect your data."* until the password is changed.
- **POS categories:** each pill carries a colour (`--cat-c`, by position) and a dot; the selected pill fills in its own colour; counts are hidden in the
  side panel.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/start-login-espresso.png" width="430" alt="Espresso sign-in"><br><b>Espresso Orange sign-in</b> — PIN page.</td>
<td valign="top"><img src="user-guide/screenshots/look-espresso-pos.png" width="430" alt="Espresso POS"><br><b>Inside</b> — espresso sidebar, stacked clock, default-password line, coloured category dots.</td>
</tr></table>

### 3.5 Custom themes (Settings → Appearance → Custom)

Design your own theme: choose the look (*Modern* or *DT Retail*), a light or dark page, and **five colours** (accent, page, panels, text, sidebar) — or
start from any built-in theme. Everything else is derived, and checked for readability (text moved until body ≥ 7 : 1 and the rest ≥ 4.5 : 1; a pale
accent gets dark text on it). Anything adjusted is explained.

- Up to **12** custom themes per computer (`dtpos-custom-themes`). Save, use, copy, edit, delete.
- **Export / Import** as a small file — exactly: `{ "format": "dtpos-theme", "version": 1, "theme": { … } }`. An import always gets a fresh id and never
  overwrites an existing theme. This is the easiest thing to carry to another system.
- The stylesheet block `:root[data-ui="modern"][data-ui-theme="custom-…"] { … }` is built from computed numbers only (never from the file's text) and injected as
  `<style id="dtpos-custom-theme">` while that theme is active.

### 3.6 What JavaScript sets when a theme is applied (`applyUiStyle` in `uiStyle.ts`)

On `<html>`: `data-ui`, `data-ui-theme`, `data-sidebar` (`light`/`dark`), `data-on-accent`, `data-look`, `data-ui-mode`, `data-anim`, and the variables
`--ui-accent-h/s/l`, `--ui-text-h/s/l`, `--ui-on-accent`, `--ui-soft-s`, `--ui-gold-on-dark`. All of it is removed for Classic.

Two ideas make light accents (yellow) work without special-casing screens: `--ui-on-accent` is the colour of text *on* the accent, and `--primary-text` is the
accent *as text on a light surface* (`.text-primary` reads it).

### 3.7 The design tokens (from `ui-tokens.css`)

| Group | Tokens |
| --- | --- |
| Accent | `--ui-accent-h/s/l` (set by JS), `--primary`, `--primary-foreground`, `--primary-text`, `--primary-glow`, `--primary-soft`, `--primary-soft-strong` |
| Neutrals | `--background`, `--foreground`, `--card`, `--popover`, `--secondary`, `--muted`, `--muted-foreground`, `--accent` (neutral hover surface), `--border`, `--input`, `--ring` |
| Status | `--status-success` `152 58% 31%`, `-warning` `36 94% 45%`, `-danger` `0 70% 47%`, `-info` `212 80% 45%`, `-pending`, `-cooking`, `-onway`, `-delivered`, `-cancelled`, `-teal`, `-purple`, `-free`, `-running`, `-pending-payment`, `-closed` (each with `-foreground`) |
| Shape | `--ui-radius-control` 0.625rem · `--ui-radius-card` 1rem · `--ui-radius-dialog` 1.25rem · `--ui-radius-pill` 999px · `--radius` 0.75rem |
| Size | `--ui-control-h` 2.5rem (sm 2.125, lg 3) · `--ui-row-h` 3rem · `--ui-card-pad` 1.25rem · `--ui-sidebar-w` 15rem (collapsed 4.5rem) · `--ui-header-h` 3.75rem · `--ui-page-max` 90rem |
| Spacing | `--ui-space-1…8` = 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2 rem |
| Type | `--ui-font` Manrope (bundled), `--ui-font-mono` JetBrains Mono (keys/codes); scale: caption 12 · secondary 13 · body 14 · card title 15 · section 17 · page 24 px |
| Shadows | `--ui-shadow-xs / sm / card / pop / focus` (barely there; focus = 3 px ring at 18 % accent) |
| Aliases for inline styles (Super Admin) | `--ui-bg`, `--ui-surface`, `--ui-surface-2`, `--ui-border`, `--ui-text`, `--ui-text-muted`, `--ui-accent`, `--ui-success/warning/danger/info` (+ `-soft`, `-text`, `-border`) |

All fonts and icons are bundled, so the app looks identical offline.

---

## 4. Screens and layout

### 4.1 The shell (Modern / DT Retail)

- **Sidebar** — the restaurant's name and logo lead; "Powered by Digital Target" is a small credit. Everyday modules in the sidebar: POS, Tables, Retrieve,
  Kitchen, Delivery, Pickup, Dashboard, Reports, Menu, Inventory, Customers. Everything else is one click away under **More** (search + groups).
  Collapses to icons with a tooltip each. The header has a **Go to module** search.
- **Settings → Modules (Module Management)** — per module: *Sidebar*, *More* or *Hidden*, order with arrows, ★ favourites. Navigation only: a hidden module
  keeps every record, and a user still sees only what their permissions allow. Settings can never be hidden. *Restore default* undoes everything.
- **Header** — status pills (link state, printer check), version pill, clock (stacked in Espresso), user chip with log-out (DT Retail).
- **Restart button** (Settings → Appearance) — "Restart application" in the Windows app, "Reload screen" in a browser. A relaunch only.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/ws-launcher.png" width="420" alt="More launcher"><br><b>More</b> launcher with search.</td>
<td valign="top"><img src="user-guide/screenshots/set-modules.png" width="420" alt="Module management"><br><b>Module Management</b>.</td>
</tr></table>

### 4.2 The POS order screen

<table><tr>
<td valign="top"><img src="user-guide/screenshots/pos-main.png" width="430" alt="POS"><br><b>The sale screen</b>.</td>
<td valign="top"><img src="user-guide/screenshots/pos-cart.png" width="230" alt="Cart"><br><b>The bill (Order panel)</b>.</td>
</tr></table>

- **Product tiles** show the **full name** (two lines — no more "Chicken Chee…"), the price in plain bold, a larger add button, and the category tabs show item counts.
  An item **without a photo** gets a coloured tile with its initials, one colour per category (DT Retail).
- **Order panel** — titled *Order*; a segmented **Dining / Takeaway / Delivery** control; card-like lines with a round **− +** stepper; a quiet totals block
  (Subtotal, quick discount chips, Discount Rs/%, Promo, Service, Total); Payment and Change; a collapsible keypad; one dominant **PAY** button with
  *CLR*, *Hold*, *Kitchen*, *Customer Receipt*, *Running* and a ⋮ menu.
- **On a 1080p screen with up to four lines** a line is two rows (name + total, then unit price + stepper); with more lines or a shorter screen it becomes one row.
- **Categories** can sit **top** (scrolling ribbon), **left** (vertical panel) or **right** (next to the bill — the default for new shops). Long names **wrap between
  words**, never cut. The **4-box button** beside *All* opens **All Categories**: every category as a box with its picture/icon, full name and item count
  (`CategoryGridDialog`), centred like the size picker.
- **Short screens** (the POS area under 680 px tall: 800×600, 1024×600, 1280×720): Discount / Promo / Service fold behind one line (never hidden while in use), the
  optional customer fields fold into a **Customer** button (always open for Delivery), the shortcut strip hides, and a narrow bill shows the unit price **under** the
  item name. Layout per monitor size is stored in *Settings → Screen & Layout* (*Save for this screen*).
- **Popups** — size/variant picker, payment, All Categories: centred, fit the window, scroll inside, confirm button sticky.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/pos-category-grid.png" width="430" alt="All categories"><br><b>All Categories</b> picker.</td>
<td valign="top"><img src="user-guide/screenshots/pos-variant.png" width="430" alt="Size picker"><br><b>Size / variant</b> picker.</td>
</tr></table>

### 4.3 Items sold by weight — the kg side panel (v1.20)

Tapping a per-kg item opens a panel on the right instead of the cart keypad:
- **By weight (kg):** presets 0.25 · 0.5 · 1 · 1.5 · 2 · 5 kg, a keypad, and kg / gram / pao units. Price = kg × rate, rounded the shop's way.
- **By amount (Rs.):** presets Rs. 100 · 200 · 500 · 1,000 · 2,000 or any amount; the line costs exactly that, and the weight shown is what it buys (to the gram).
- **Scale · F9** reads a connected scale into the panel. **Add to cart** or **Enter**; **Esc** closes. Tapping another kg item switches the panel; a normal item closes it.
- *Settings → General → Weight items (kg)*: panel on/off (off = the old keypad) and the shop's own preset buttons (`weightEntryPanel`, `weightPresetsKg`, `weightPresetsAmount`).

<img src="user-guide/screenshots/pos-weight.png" width="430" alt="Weight panel">

### 4.4 Payment screen — Premium (default) or Classic (v1.20)

Premium: a big **Total Payable**; **Cash / Online / Split / Other** tiles; an **Exact** button and the next round notes; **Change** and **Due (Credit)** side by side;
**Back to cart** and **Complete Sale (Enter)**. Paying less than the total = a **partial payment** (*Partial Pay · Rs. X (Due Rs. Y)*). A **Print receipt** box
(default from the receipt settings) lets the cashier skip or force the receipt for *this one bill* — the tandoor token still prints.
*Settings → General → Payment screen → Classic* (`paymentDialogStyle`) brings back the compact popup and its Quick Discount.

<img src="user-guide/screenshots/pos-payment.png" width="430" alt="Payment">

### 4.5 Sign-in, PIN and the welcome screen

- **Classic / Modern look:** username + password; *Remember me*; *Contact Admin*; and — new in v1.21 — **Forgot password?** (reset-code box, "Check for a reset now").
- **PIN sign-in (every look, v1.20):** *Users & Roles → Edit user → Quick login PIN (optional)*, exactly 4 digits; users with a PIN show a **PIN** badge; no user gets a PIN by
  itself. Tap your name, type the PIN (screen or keyboard); the 4th digit signs in. Five wrong PINs lock **that user's PIN** for a minute; the password is never locked by it.
  Espresso Orange opens on the PIN page; other looks show *Sign in with PIN* under *Sign In* once someone has a PIN.
- **Welcome (DT Retail):** the Digital Target mark pops in triangle by triangle, the wordmark rises, a light streak runs along a thin bar; the sign-in has a gradient brand panel
  with slowly floating triangles, "Billing made simple & fast." and six feature chips.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/start-login.png" width="400" alt="Sign-in"><br>Username + password.</td>
<td valign="top"><img src="user-guide/screenshots/start-login-pin.png" width="400" alt="PIN"><br>PIN page.</td>
</tr></table>

### 4.6 Dashboard

Modern: sales, orders, average order, profit, trend and order-type charts, shift and business day. DT Retail adds the **greeting banner** (Refresh and New Sale) and a **highlighted lead figure** with a second
row of headline cards (Cash, Card / Bank / Other, Discounts given, Tables occupied) — see the pictures in 3.3.

### 4.7 Customer Display with the live bill (v1.18)

With *Settings → Display → Enable Display Screen* on, the customer screen shows **"Your order"** beside the order board: items, quantities, amounts, discount, service charge and total in the
receipt's own words. It is built from an **allow-list** (`lib/liveBill.ts`): no cashier, waiter, rider, kitchen notes, customer phone or address; it disappears when the bill is paid or cleared; on a small
display it takes the whole screen while a customer is being served. Published to `dtpos-live-bill` (storage event + BroadcastChannel).

<img src="user-guide/screenshots/display-customer.png" width="430" alt="Customer display">

### 4.8 Super Admin panel (separate app)

Same design system (tokens via `--ui-*`), dark admin rail with icons, page bar with breadcrumb and an *Issue license* button, stat cards, tidy tables with status pills, styled confirmations and toasts
(Escape closes the top-most), a **Theme** menu with the same 21 themes. Tabs: Dashboard (licence health, renewals 7/14/30/60/90 days, activations, **Online now**, **Today's sales** per restaurant),
Issue License, Clients (filters with counts, ⋯ menu: licence status, **Reset admin password…** *(v1.21)*, delete), Devices, Device Map, Offline Billing, Support, Verify Key. Full reference: `docs/SUPER_ADMIN.md`.

---

## 5. Receipts — all 52 designs

### 5.1 How a receipt is chosen and drawn

- **Settings → Receipt & QR → Receipt Design Template** (and the same gallery with live preview in **Printer Center → Receipt design**) writes `settings.receiptDesign` (one id of the 52 below).
- `ReceiptPreview` draws the 25 classic-family designs. Ids beginning `premium-` are drawn by `PremiumReceipt` (layout engine, 5.3). Ids beginning `dtr-` are drawn by `DtRetailReceipt`
  (its own drawings).
- The same component renders the on-screen preview **and** the print — what you see is what prints.
- Print works on **80 mm and 58 mm** paper; every word and number comes from the live order (a template is configuration, never content).

### 5.2 The three families

| Family | Count | Engine | Adjustable by the shop |
| --- | --- | --- | --- |
| **Classic family** (original designs, `legacy-*` pictures) | 25 | hand-written React components | section toggles, fonts per line, spacing, scale, margins |
| **Premium** (13 reference-based + 3 café) | 16 | config-driven layout engine | per-template customization (5.3) |
| **DT Retail** (v1.17) | 11 | `DtRetailReceipt.tsx` + customization | per-template customization (5.3) |

#### 5.2.1 Classic family (25) — exactly as printed

<table>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-standard.png" width="210" alt="⭐ Standard (Recommended)"><br><b>⭐ Standard (Recommended)</b><br><code>standard</code><br><sub>80mm compact, clean. Logo → Name → Address → Phone, table never wraps, toggles for all sections.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-compact-thermal.png" width="210" alt="🧾 Compact Thermal (Paper Saver)"><br><b>🧾 Compact Thermal (Paper Saver)</b><br><code>compact-thermal</code><br><sub>Smallest fonts, tightest spacing, about 30–40 % less paper. Applies compact mode to the print.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-classic.png" width="210" alt="📋 Classic"><br><b>📋 Classic</b><br><code>classic</code><br><sub>Bordered table, traditional look.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-modern.png" width="210" alt="🖤 Modern Branded"><br><b>🖤 Modern Branded</b><br><code>modern</code><br><sub>Clean lines, inverted header.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-compact.png" width="210" alt="📏 Compact Mini"><br><b>📏 Compact Mini</b><br><code>compact</code><br><sub>Minimal size, paper saver.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-luxury.png" width="210" alt="✨ Luxury VIP"><br><b>✨ Luxury VIP</b><br><code>luxury</code><br><sub>Double borders, serif fonts.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-executive.png" width="210" alt="🏢 Executive"><br><b>🏢 Executive</b><br><code>executive</code><br><sub>Premium corporate, monogram + striped rows.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-royal.png" width="210" alt="👑 Royal Dining"><br><b>👑 Royal Dining</b><br><code>royal</code><br><sub>Fine-dining ornaments, serif elegance.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-bistro.png" width="210" alt="☕ Bistro Café"><br><b>☕ Bistro Café</b><br><code>bistro</code><br><sub>Friendly café vibe, rounded badges.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-heritage.png" width="210" alt="🏛 Heritage"><br><b>🏛 Heritage</b><br><code>heritage</code><br><sub>Vintage stamp header, classic ledger feel.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-metro.png" width="210" alt="🚇 Metro"><br><b>🚇 Metro</b><br><code>metro</code><br><sub>Bold uppercase, ticket-style bands.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-shahenshah.png" width="210" alt="👑 Shahenshah Style"><br><b>👑 Shahenshah Style</b><br><code>shahenshah</code><br><sub>Boxed header sections, classic dhaba look.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-taste-bistro.png" width="210" alt="🍴 Taste Bistro"><br><b>🍴 Taste Bistro</b><br><code>taste-bistro</code><br><sub>Chef-hat header, bordered items table.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-food-palace.png" width="210" alt="🍽 Food Palace"><br><b>🍽 Food Palace</b><br><code>food-palace</code><br><sub>Circle cloche logo, clean minimal lines.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-spice-house.png" width="210" alt="🌶 Spice House"><br><b>🌶 Spice House</b><br><code>spice-house</code><br><sub>Crossed-cutlery emblem, dotted item rows.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-taimoor.png" width="210" alt="📋 Taimoor"><br><b>📋 Taimoor</b><br><code>taimoor</code><br><sub>Clean customer receipt — chef-logo header, # / Item / Qty / Rate / Amount table.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-design1-table.png" width="210" alt="📊 Design 1 — Table Style"><br><b>📊 Design 1 — Table Style</b><br><code>design1-table</code><br><sub>Classic bordered table, dashed separators, full info grid.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-design2-box.png" width="210" alt="📦 Design 2 — Box Style"><br><b>📦 Design 2 — Box Style</b><br><code>design2-box</code><br><sub>Boxed info layout, bordered items, dark change bar.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-design3-modern.png" width="210" alt="🎨 Design 3 — Modern Style"><br><b>🎨 Design 3 — Modern Style</b><br><code>design3-modern</code><br><sub>Black banner header, icon info rows, 3-column totals.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-design4-compact.png" width="210" alt="📏 Design 4 — Compact Style"><br><b>📏 Design 4 — Compact Style</b><br><code>design4-compact</code><br><sub>Ultra compact, short labels, minimal spacing.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-design5-delivery.png" width="210" alt="🚚 Design 5 — Delivery Style"><br><b>🚚 Design 5 — Delivery Style</b><br><code>design5-delivery</code><br><sub>Delivery receipt with driver info and delivery charge.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-sero.png" width="210" alt="✨ Sero — Sleek Minimal"><br><b>✨ Sero — Sleek Minimal</b><br><code>sero</code><br><sub>Clean lines, dotted rows, bold total band.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-bero.png" width="210" alt="⚡ Bero — Bold Contrast"><br><b>⚡ Bero — Bold Contrast</b><br><code>bero</code><br><sub>Inverted header, boxed details, dark grand total.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-kot-style.png" width="210" alt="👨‍🍳 KOT Style"><br><b>👨‍🍳 KOT Style</b><br><code>kot-style</code><br><sub>Customer receipt: chef-hat logo header, info grid, bordered Qty/Note table, Special Notes box.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/legacy-kot-classic.png" width="210" alt="🍽 KOT Classic"><br><b>🍽 KOT Classic</b><br><code>kot-classic</code><br><sub>Clean dashed lines, chef-hat & cloche logo, dotted item rows, fully editable text & fonts.</sub></td><td></td><td></td></tr>
</table>

#### 5.2.2 Premium family (16) — 13 layouts from real restaurant receipts + 3 café designs

Only **layout** was taken from the reference receipts (typographic hierarchy, column structure, how the totals block is framed, where the hero number sits) — no shop name, logo, phone or tax id.
The last three are café designs: regular (not bold) body type, "2 × Item" lines and a pickup number the counter can call.

<table>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-paid-banner.png" width="210" alt="Paid Banner"><br><b>Paid Banner</b><br><code>premium-paid-banner</code><br><sub>Centred header, bold PAID/UNPAID banner, full meta block, bordered item grid.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-tax-invoice.png" width="210" alt="Tax Invoice"><br><b>Tax Invoice</b><br><code>premium-tax-invoice</code><br><sub>Large shop name, tax-number row, boxed date bar, full grid and a QR block.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-panel.png" width="210" alt="Panelled Bill"><br><b>Panelled Bill</b><br><code>premium-panel</code><br><sub>Framed address panel, bold title bar, big boxed order number, panelled totals.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-fine-dining.png" width="210" alt="Fine Dining"><br><b>Fine Dining</b><br><code>premium-fine-dining</code><br><sub>Serif type, generous spacing, rules instead of boxes, large table number.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-grid-invoice.png" width="210" alt="Grid Invoice"><br><b>Grid Invoice</b><br><code>premium-grid-invoice</code><br><sub>Classic invoice: two-column meta grid and a fully ruled table with a variant column.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-hall-detail.png" width="210" alt="Hall Detail"><br><b>Hall Detail</b><br><code>premium-hall-detail</code><br><sub>Every charge itemised — service, tax, discount, delivery — plus amount in words.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-quick-bill.png" width="210" alt="Quick Bill"><br><b>Quick Bill</b><br><code>premium-quick-bill</code><br><sub>Counter service: dashed rules, big bill number, oversized grand total, QR to pay.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-two-column.png" width="210" alt="Two Column"><br><b>Two Column</b><br><code>premium-two-column</code><br><sub>Logo left with shop details right, paired meta columns, heavy net-amount line.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-retail.png" width="210" alt="Retail Counter"><br><b>Retail Counter</b><br><code>premium-retail</code><br><sub>Shop-counter layout with a discount column, policy footer and contact block.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-grouped.png" width="210" alt="Grouped Menu"><br><b>Grouped Menu</b><br><code>premium-grouped</code><br><sub>Items gathered under their menu category, with a boxed payable block and QR.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-token-hero.png" width="210" alt="Token Hero"><br><b>Token Hero</b><br><code>premium-token-hero</code><br><sub>Very large token number under a decorated header, compact ruled item list.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-boxed-ledger.png" width="210" alt="Boxed Ledger"><br><b>Boxed Ledger</b><br><code>premium-boxed-ledger</code><br><sub>Bold two-line name, stacked framed meta panels, totals inside the item frame.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-rounded-panel.png" width="210" alt="Rounded Panel"><br><b>Rounded Panel</b><br><code>premium-rounded-panel</code><br><sub>Logo beside the shop block, soft-cornered item table and totals panel.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-cafe-classic.png" width="210" alt="Café Classic"><br><b>Café Classic</b><br><code>premium-cafe-classic</code><br><sub>Café bill: rounded pickup number with the customer's name, "2 × Item" lines with the price underneath, light rules.</sub></td><td valign="top" width="33%"><img src="design-gallery/receipts/premium-coffee-house.png" width="210" alt="Coffee House"><br><b>Coffee House</b><br><code>premium-coffee-house</code><br><sub>Warm serif guest check: framed header, "2 × Item" lines, soft totals panel and a QR for menu or feedback.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/receipts/premium-cafe-counter.png" width="210" alt="Café Counter"><br><b>Café Counter</b><br><code>premium-cafe-counter</code><br><sub>Quick counter service: ticket-style pickup number in very large type, paired details, "2 × Item" lines and a large total.</sub></td><td></td><td></td></tr>
</table>

#### 5.2.3 DT Retail family (11)

Built from plain boxes/CSS grid (**never `<table>`**, because the thermal print step restyles tables), white-on-black via the `dt-reverse` class the print worker understands. They print equal left and right
margins (2 mm) with no invisible text, on 80 mm and 58 mm.

<table>
<tr><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-classic.png" width="170" alt="DT Classic"><br><b>DT Classic</b><br><code>dtr-classic</code><br><sub>Centred header, dashed lines, SALES RECEIPT title and a four-column item table.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-modern.png" width="170" alt="DT Modern"><br><b>DT Modern</b><br><code>dtr-modern</code><br><sub>Black header band, two-line items (qty × rate) and a rounded, highlighted total.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-minimal.png" width="170" alt="DT Minimal"><br><b>DT Minimal</b><br><code>dtr-minimal</code><br><sub>Clean and borderless: name, amount, and "2 @ 450" underneath each item.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-restaurant.png" width="170" alt="DT Restaurant"><br><b>DT Restaurant</b><br><code>dtr-restaurant</code><br><sub>Framed DINE-IN / table / token box, quantity first, GRAND TOTAL between double rules.</sub></td></tr>
<tr><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-retail-invoice.png" width="170" alt="DT Retail Invoice"><br><b>DT Retail Invoice</b><br><code>dtr-retail-invoice</code><br><sub>Boxed grid with a SALES INVOICE band, item and quantity counts and a "you saved" line.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-compact.png" width="170" alt="DT Compact"><br><b>DT Compact</b><br><code>dtr-compact</code><br><sub>One line per item and a tight header — saves paper, great for 58 mm.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-boxed-grid.png" width="170" alt="DT Boxed Grid"><br><b>DT Boxed Grid</b><br><code>dtr-boxed-grid</code><br><sub>Bold boxes around every section, a black item header and a black GRAND TOTAL row.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-bold-restaurant.png" width="170" alt="DT Bold Restaurant"><br><b>DT Bold Restaurant</b><br><code>dtr-bold-restaurant</code><br><sub>Giant DINE-IN / TABLE / TOKEN box, heavy item lines and a black TOTAL bar.</sub></td></tr>
<tr><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-tax-invoice.png" width="170" alt="DT Tax Invoice + QR"><br><b>DT Tax Invoice + QR</b><br><code>dtr-tax-invoice</code><br><sub>NTN / STRN line, gross-to-net breakup, amount in words and a QR — FBR / PRA style.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-luxury.png" width="170" alt="DT Luxury"><br><b>DT Luxury</b><br><code>dtr-luxury</code><br><sub>Serif type, double-line frame, diamond dividers and dotted price leaders.</sub></td><td valign="top" width="25%"><img src="design-gallery/receipts/dtr-ticket.png" width="170" alt="DT Ticket"><br><b>DT Ticket</b><br><code>dtr-ticket</code><br><sub>Zig-zag paper edges, a dashed ORDER / TOKEN stub and a PAID stamp.</sub></td><td></td></tr>
</table>

### 5.3 The layout engine (this is the part worth porting)

A Premium/DT template is **data**, not code. Its layout object (`PremiumLayout`) uses this vocabulary:

| Property | Values |
| --- | --- |
| `header` | `centered` (logo above centred name block) · `logo-left` · `banner` (name reversed out of a solid bar) · `stacked` · `decorated` (rule-and-ornament frame) |
| `meta` (order block) | `rows` (label: value per line) · `two-column` · `boxed` · `split` |
| `items` | `grid` (every cell bordered) · `ruled` · `dotted` (leader between rows) · `plain` · `grouped` (category sub-headings) · `cafe` ("2 × Item", price underneath) |
| `totals` | `right` · `grid` · `panel` · `rounded` |
| `grandTotal` | `bar` (reversed solid) · `box` · `large` · `plain` |
| `hero` (one oversized number near the top) | `none` · `token` · `order` · `table` · `pickup` · `ticket` |
| `columns` | any of `sr`, `name`, `variant`, `qty`, `rate`, `amount`, in order |
| extras | `title` (e.g. "INVOICE"), `statusLine` (PAID/UNPAID), `amountInWords`, `qr`, `serif`, `rounded`, `boldBody`, `font`, `fontSize` |

**Per-template customization** (`PremiumCustomization`, saved in `dtpos-premium-template-customizations`, one entry per template id):

| Group | Fields |
| --- | --- |
| Name | `displayName` (what the shop calls this template; ≤ 60 chars) |
| Header | `showLogo`, `logoWidthPx` (24–260), `showName`, `showAddress`, `showPhone`, `headerNote` (free line, ≤ 200 — a tagline or tax number) |
| Order block | `showOrderNumber`, `showDateTime`, `showTable`, `showCashier`, `showCustomer`, `showDelivery`, `showOrderType` |
| Items | `showItemNotes`, `showVariants`, `showSerial` |
| Money | `showSubtotal`, `showDiscount`, `showTax`, `showServiceCharge`, `showPaymentMethod`, `showChange` |
| Footer | `footerText` (≤ 300), `thankYouText` (≤ 200), `showQr`, `showPoweredBy` |
| Layout | `fontSize` (9–20 px), `itemSpacing` (0–12), `sectionSpacing` (0–24), `topSpacing` (0–40), `bottomSpacing` (0–40), `fontFamily`, `boldBody` |
| `fontFamily` | `sans` (Segoe UI/Arial) · `grotesk` (Arial Narrow/Tahoma — fits more per line) · `serif` (Georgia/Times) · `slab` (Cambria/Georgia) · `mono` (Consolas/Courier New). Every option resolves to faces that ship with Windows so the print worker draws exactly the preview. |

The floors and ceilings matter: 6 px prints as grey mush on a thermal head and 30 px wraps every item name.

### 5.4 Receipt settings that apply to every design

| Setting (key) | Meaning |
| --- | --- |
| Show / hide sections — `receiptShowLogo`, `…Address`, `…Phone`, `…Discount`, `…Tax`, `…Footer`, `…PoweredBy` | Standard-receipt toggles (default ON) |
| **Compact Print Mode** — `receiptCompactMode` (+ `receiptCompactFontSize` 11 px, `receiptCompactLineHeight` 1.15, `receiptCompactPreserveLogo`) | Global: saves 30–40 % paper on receipts **and** KOT |
| **Receipt Fonts** (*Settings → Receipt Fonts*, `receiptStyles`) | Per line (restaurant name, address, phone, order number, items, totals…): font, size px, bold, alignment. Urdu faces: Aseer Unicode, AA Sameer Armaa, Jameel Noori Nastaleeq (+ Regular), Montserrat, Norvas Demo Expanded, Regaltion Highter. |
| **Text spacing** — `receiptLineSpacing` (1.0–2.2), `receiptWordSpacing`, `receiptLetterSpacing` (and `kot…`) | Live preview shown beside the sliders |
| Scale and margins — `receiptScale` (50–150 %), `receiptMarginTop/Bottom/Left/Right` (mm), `receiptTrimMm` (8 mm default) | Plus per-slip margins in Printer Center |
| Cutter — `autoCut`, `cutMode` (`full` / `partial`) | |
| **PAID / UNPAID label** — `receiptStatusMode` (`smart` · `always-paid` · `always-unpaid` · `none`) and `receiptModeByType` (per Dining / Takeaway / Delivery / Foodpanda) | |
| **QR & Barcode** (`receiptCodes`) | `qr`: enabled, mode (`auto` · `multi` · `single`), `autoView` (`text` / `page`), links (Google, Facebook, WhatsApp, Instagram…), `singleUrl`, `position` (`above` / `footer` / `below`), `sizeMm`; `barcode`: enabled, format (`code128` / `code39`), position, size (`small`/`medium`/`large`), prefix. Bill info opens on any phone. |
| `receiptDesign` | The chosen design id |

### 5.5 Bill wording — one place for every word (`lib/billLabels.ts`, `lib/serviceCharge.ts`)

Every receipt design, the raw (Fast Billing) slip, the QR text, the Customer Display and the order details say the same thing, and a line appears **only when the bill has it**:

| Situation | Printed as |
| --- | --- |
| Percentage discount | `Discount (10%)   -285` (or the shop's own title: `Eid Discount (10%)`) |
| Flat discount | `Discount   -300` |
| Percentage service charge | `Service Charge (10%)   257` |
| Flat service charge | `Service Charge   250` |
| Tax | the real rate from Settings, or just `Tax` — never a made-up rate |
| Sized item | the size once (`Pepperoni Feast - Large`), never twice |

### 5.6 Thermal-print rules that shaped the designs (do not break these)

1. **No `<table>` in a slip** — the thermal step forces borders, bold and centring on tables. Use CSS grid/flex boxes.
2. White text on a black bar uses the `dt-reverse` class (the print worker keeps it legible). Text and its background must fall on **opposite sides** of the printer's darkness cut-off (black on paper, or paper-white on solid black) — black on black prints as a solid block.
3. 80 mm paper = **576 dots** across (≈ 72 mm printable at 203 dpi); equal left/right margins (2 mm default). 58 mm designs must still work.
4. Fonts are Windows-safe stacks; no web fonts in a slip (a failed webfont is silently replaced and the print differs from the preview).
5. Floors on size/spacing (9 px minimum) — see the table above.
6. Check any change with `node scripts/simulate-print.mjs '<id-or-pattern>*'` — it renders through the **real raster code** and reports ink margins, invisible text and bar legibility.

---

## 6. KOT (kitchen) slips

### 6.1 The nine designs (*Settings → KOT Settings → KOT Template Design*, `kotDesign`)

<table>
<tr><td valign="top" width="33%"><img src="design-gallery/kot/kot-classic.png" width="230" alt="🍳 Classic"><br><b>🍳 Classic</b><br><code>classic</code><br><sub>Traditional design — icons and dashed borders. (The default.)</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-bold.png" width="230" alt="★ Bold"><br><b>★ Bold</b><br><code>bold</code><br><sub>Heavy font — large QTY, black bar.</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-minimal.png" width="230" alt="◻ Minimal"><br><b>◻ Minimal</b><br><code>minimal</code><br><sub>Simple and clean — the fewest elements.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/kot/kot-elegant.png" width="230" alt="✦ Elegant"><br><b>✦ Elegant</b><br><code>elegant</code><br><sub>Refined — letter spacing and a fine look.</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-vip-chef.png" width="230" alt="👨‍🍳 VIP Chef"><br><b>👨‍🍳 VIP Chef</b><br><code>vip-chef</code><br><sub>Large bold badges — easy for the chef to read.</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-station.png" width="230" alt="🏷 Station"><br><b>🏷 Station</b><br><code>station</code><br><sub>COLD / HOT / BEVG tags — station routing.</sub></td></tr>
<tr><td valign="top" width="33%"><img src="design-gallery/kot/kot-taimoor1.png" width="230" alt="📋 Taimoor 1"><br><b>📋 Taimoor 1</b><br><code>taimoor1</code><br><sub>Clean table design — Order / Token / Date / Time / Type / Table.</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-taimoor2.png" width="230" alt="📋 Taimoor 2"><br><b>📋 Taimoor 2</b><br><code>taimoor2</code><br><sub>Taimoor 1 + Waiter + Pax + Printed time.</sub></td><td valign="top" width="33%"><img src="design-gallery/kot/kot-dtr-kitchen.png" width="230" alt="🧾 DT Kitchen Order"><br><b>🧾 DT Kitchen Order</b><br><code>dtr-kitchen</code><br><sub>DT Retail — black title bar, DINE-IN / Table box, big quantities.</sub></td></tr>
</table>

### 6.2 What the KOT shows (toggles)

`kotShowLogo`, `kotShowAddress`, `kotShowPhone`, `kotShowCustomer`, `kotShowCustomerAddress` (default off), `kotShowWaiter`, `kotShowRider`, `kotShowNotes`, `kotShowDateTime`, `kotShowShopName`,
`kotShowDeveloperCredit`; editable footer lines `kotThankYouText` (default "— Thank You —") and `kotFooterNote` (default "Please check the order before preparing"); item font scale `kotFontScale` (100 = normal, 160 = very big);
text spacing (`kotLineSpacing` / `Word` / `Letter`). **Preset special notes** (`kotNotePresets`) become quick-pick chips on the POS and the Order Taker cart; the cashier can still type any note.

### 6.3 When a KOT prints

| Setting | Meaning |
| --- | --- |
| `kotEnabled` | Master KOT printing on/off (default on) |
| `autoPrintKot` (master) and `autoKotDining` / `autoKotTakeaway` / `autoKotDelivery` | Auto-print on a new order, per order type (each follows the master when unset) |
| `autoKotOnOrderTakerSave`, `autoKotOnOnlineOrder`, `autoKotOnDeliveryRunning` | Order Taker saves · a website order arrives · a delivery moves to cooking/on-the-way (all default on) |
| `manualSendToKitchen` | Only the *Kitchen* button sends |
| `kotSilentMode` | Hold all **auto** KOTs in the queue until released (an explicit *Send to Kitchen* / reprint always prints) |
| `printKotOnCancel` | Print a **CANCELLED** slip when an order already sent to the kitchen is voided/cancelled |
| `kotCopies` | 1 / 2 / 3 copies (default 1) |
| `kotPrinter`, `stationPrinters` (kitchen → printer), `backupPrinter`, `autoReprintOnFailure` | Where it goes; failover to the backup after retries |
| `kotFallbackToReceipt` (default on) | If no kitchen printer is set, use the receipt printer |
| `kotMirrorToReceiptPrinter` | Also print one verification copy on the cash/receipt printer |
| `autoCookingOnKot` | Printing the first KOT moves the order to *Preparing* |

### 6.4 Update and cancel KOTs

If an order that already went to the kitchen is edited, only the **difference** goes: a slip annotated **NEW ITEM / EXTRA QTY / CANCELLED / ALREADY SENT** (so the kitchen does not re-cook old items). Every KOT is kept
in the order's history (`kotLog`, `kotRevisions` with a running KOT number) and shown in *Bill and KOT edit history*. *Printed quantity* (`printedQty`) per line is what drives the difference.

### 6.5 The double-KOT fix (v1.21)

The **Kitchen** button saved the order — which queued the KOT through the print host — and then opened the *Kitchen Slip* window, whose preview **printed the same KOT again** outside the queue, where the duplicate
guards could not see it. Now the window prints by itself **only if the queue has not already sent that order's KOT** (`kotRecentlyQueued()`); otherwise it shows the slip with a note, and its **Print** button gives a
deliberate extra copy. With *Auto Print KOT* off, the window is the only printer and prints once. Note that **KOT copies** (KOT settings) and the kitchen printer's own **copies** (Printer Center) multiply — keep one of them at 1.

---

## 7. Token slips

A **token** is the small slip for a counter that makes part of the order (tandoor — roti/naan, BBQ, bar…). It is printed **instantly** (direct print, no queue wait) and recorded in a **token ledger** that the Token module (Reports) totals.

### 7.1 The twelve designs (*Printer Center → Tokens*, `tokenTemplate`, default `standard`)

<table>
<tr><td valign="top" width="25%"><img src="design-gallery/tokens/token-standard.png" width="170" alt="Standard"><br><b>Standard</b><br><code>standard</code><br><sub>Clean and compact — name, token number, items. The everyday slip.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-professional.png" width="170" alt="Professional"><br><b>Professional</b><br><code>professional</code><br><sub>Framed header, ruled item table, token number in a heavy panel.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-vip.png" width="170" alt="Bold / VIP"><br><b>Bold / VIP</b><br><code>vip</code><br><sub>Very large token number, reversed banner, strong spacing — readable across a counter.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-dtr-classic.png" width="170" alt="DT Classic"><br><b>DT Classic</b><br><code>dtr-classic</code><br><sub>DT Retail — rounded frame with a huge #number, order and type line, items and total.</sub></td></tr>
<tr><td valign="top" width="25%"><img src="design-gallery/tokens/token-dtr-boxed.png" width="170" alt="DT Boxed"><br><b>DT Boxed</b><br><code>dtr-boxed</code><br><sub>DT Retail — black TOKEN band over the number, order type underneath, items in a frame.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-dtr-bold.png" width="170" alt="DT Bold"><br><b>DT Bold</b><br><code>dtr-bold</code><br><sub>DT Retail — giant number between two heavy rules, read across a counter.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-dtr-minimal.png" width="170" alt="DT Minimal"><br><b>DT Minimal</b><br><code>dtr-minimal</code><br><sub>DT Retail — number first, shortest slip, nothing extra.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-dtr-ticket.png" width="170" alt="DT Ticket"><br><b>DT Ticket</b><br><code>dtr-ticket</code><br><sub>DT Retail — zig-zag paper edges and a dashed TOKEN / ORDER stub.</sub></td></tr>
<tr><td valign="top" width="25%"><img src="design-gallery/tokens/token-classic.png" width="170" alt="Classic"><br><b>Classic</b><br><code>classic</code><br><sub>Original design — boxed token number under a dashed item list.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-bold.png" width="170" alt="Bold"><br><b>Bold</b><br><code>bold</code><br><sub>Original design — large type with rules above and below the number.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-boxed.png" width="170" alt="Boxed"><br><b>Boxed</b><br><code>boxed</code><br><sub>Original design — fully bordered item table.</sub></td><td valign="top" width="25%"><img src="design-gallery/tokens/token-minimal.png" width="170" alt="Minimal"><br><b>Minimal</b><br><code>minimal</code><br><sub>Original design — token number first, shortest slip.</sub></td></tr>
</table>

### 7.2 Options on a token design (`dtpos-token-slip-options`)

| Option | Range / values | Default |
| --- | --- | --- |
| `fontSize` | 10–22 px | 14 |
| `tokenSize` (the number read from a distance) | 18–96 px | 44 |
| `align` | `left` · `center` · `right` | `center` |
| `spacing` | 0–16 px | 4 |
| `headerText` / `footerText` | ≤ 120 / ≤ 160 chars (footer replaces the counter instruction) | empty |
| `showLogo`, `showOrderNumber`, `showDateTime`, `showTable`, `showCustomer` | on/off | on, on, on, on, **off** |
| `showPrices` (DT Retail designs: each item's price + the slip total) | on/off | off |

### 7.3 Which items get a token (`tokenRules`)

`tokenPrintEnabled` turns the module on. An item gets a token if **either** rule matches: its category is in `tokenCategoryIds` (as many categories as needed) **or** the item itself is in `tokenMenuItemIds`. The two lists are independent.
The old single `tokenCategoryId` is still read for shops configured before.

### 7.4 Other token settings

- `tokenPrinter` — a separate token printer (falls back to the receipt printer).
- `tokenCountsInSales` — token-only items counted in sales reports or not (default on).
- `tokenShowTotal` — the "Total pieces" line (default on).
- `tokenPaymentMode` — off keeps a token as a kitchen instruction; on makes every token a tracked **paid/unpaid** record with its own amount.
- **Department / detachable tokens** (`tokenDepartmentMode`, `tokenDepartmentIds`, `tokenStubMode`): after the normal token, small **tear-off stubs** print so each counter keeps physical proof of what it served. Split modes:
  `department` (one stub per department: `SAJJI · QTY 6`), `item` (one per menu line), `piece` (one per unit sold — six Sajji print six stubs; the default, because it matches a physical count).

---

## 8. Report slips (thermal)

Reports (Sales Summary, Detailed Sales, Shift Report, GRN, Supplier Statement) print on the same thermal pipeline with black section bars and aligned tables (`printing/thermalReport.ts`).

<table>
<tr><td valign="top" width="20%"><img src="design-gallery/reports/report-pos-summary.png" width="150" alt="Sales Summary"><br><b>Sales Summary</b><br><code>report-pos-summary</code><br><sub>Order types, payment methods, total sales, other bills.</sub></td><td valign="top" width="20%"><img src="design-gallery/reports/report-pos-detailed.png" width="150" alt="Sales Report (Detailed)"><br><b>Sales Report (Detailed)</b><br><code>report-pos-detailed</code><br><sub>One entry per paid order.</sub></td><td valign="top" width="20%"><img src="design-gallery/reports/report-shift.png" width="150" alt="Shift Report"><br><b>Shift Report</b><br><code>report-shift</code><br><sub>Summary, tax, drawer, payments, order types, categories, products.</sub></td><td valign="top" width="20%"><img src="design-gallery/reports/report-grn.png" width="150" alt="Goods Receiving Note"><br><b>Goods Receiving Note</b><br><code>report-grn</code><br><sub>Item received, quantity, rate, surcharge, signature line.</sub></td><td valign="top" width="20%"><img src="design-gallery/reports/report-statement.png" width="150" alt="Supplier Statement"><br><b>Supplier Statement</b><br><code>report-statement</code><br><sub>Opening balance, ledger, balance.</sub></td></tr>
</table>

---

## 9. Customer Display and Kitchen Display templates

Both full-screen boards are described by **one data model** (`DisplayTemplate`): colours (`bg`, `surface`, `border`, `text`, `muted`, `accent`, `onAccent`, `preparing`, `ready`, `alert`), corner radius, type scale,
number scale, order/media ratio, density (`comfortable` / `compact`) and layout. They are *data*: no template ships its own component. The **shop's brand** (logo, name, accent) is on the screen; Digital Target appears once,
small: **"Powered by Digital Target"**. **Automatic mode** (`pickAutoTemplate`) reads the real resolution and aspect ratio and picks the template that suits (never stretches a layout). Brand purple is `#3C096C`
(deep `#240046`, lift `#5A189A`).

**Customer Display** — layouts: `now-serving` (media on one side, a read-down list of orders with a READY badge) or `columns` (two status columns of number tiles).

| Id | Name | Look |
| --- | --- | --- |
| `premium` | Premium | Deep purple and white. The default: calm, high contrast, reads from across a room. (now-serving list layout) |
| `modern` | Modern | Near-black with a purple accent. Understated, suits a screen in a bright room. (now-serving) |
| `minimal` | Minimal | White background, black type. Nothing but the numbers. |
| `colorful` | Colourful | Warm and saturated. For a family restaurant that wants the screen to be cheerful. |
| `restaurant` | Restaurant | Warm neutrals and gold. Dine-in rooms where the screen should not shout. |
| `promotional` | Promotional | Half the screen for deals and offers, half for the orders. (compact) |
| `large-order` | Large Order | Order numbers as big as the screen allows. For a wide counter or a noisy hall. |
| `order-ad` | Order + Advert | Orders on the left, a standing advert panel on the right. (now-serving) |
| `media-focused` | Media Focused | Mostly your video or banners, with a slim order strip beside them. (compact, now-serving) |
| `compact` | Compact | Fits more on a small or square screen without shrinking the numbers. (compact) |

**Kitchen Display** — layouts: `status-lanes` (NEW · PREPARING · READY · DELIVERY · COMPLETED, an order visibly travels left to right) or `grid` (every active ticket in one wall, oldest first).

| Id | Name | Look |
| --- | --- | --- |
| `clean` | Clean | Black on white. The most legible option under kitchen lighting. (grid) |
| `modern` | Modern | The dark board the kitchen has been using. Amber for waiting, green for ready. (status lanes) |
| `premium` | Premium | Purple and white, matching the customer screen. (status lanes) |
| `compact` | Compact | More tickets on screen at once. For a busy kitchen on one monitor. (status lanes) |
| `large-order` | Large Order | Fewer tickets, much bigger type. For a board read from several metres away. (grid) |
| `colorful` | Colourful | Stronger status colours, so a delayed ticket is unmissable. (status lanes) |
| `fast-kitchen` | Fast Kitchen | Densest of all: item lines first, everything else stripped back. (grid, compact) |

Settings: *Settings → Display* (`displayEnabled`, `displayShowItems`, `displayShowTotal`, `displayFullscreen`, `displayPromoImages` slideshow) and the Kitchen Display Center / TV Mode. Kitchen screens carry kitchen information only — no prices, payment or customer phone.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/kitchen-tv.png" width="430" alt="Kitchen TV"><br>Kitchen TV board.</td>
<td valign="top"><img src="user-guide/screenshots/kitchen-display-center.png" width="430" alt="Kitchen display center"><br>Kitchen Display Center.</td>
</tr></table>

---

## 10. Settings, tab by tab

*Settings* is a grouped list on the left (**General · Operations · Printing · Integrations · Advanced**); each tab has its own **Save** button at the bottom; the strip at the top confirms data is encrypted and kept apart per restaurant.

| Group | Tab | What it holds |
| --- | --- | --- |
| General | **General** | Country/currency/tax label · restaurant name, address, website, phones · **service charge** (percent/PKR + which order types: Dine-In / Takeaway / Delivery + "allow editing on a bill") · **weight items** panel + presets · **payment screen** Premium/Classic · **GST/VAT %** and mode (exclusive/inclusive) · quick discount presets (% and amounts) · payment quick amounts · delivery charge · **cash rounding** (none / 0.05 / 0.10 / 1) · event discount, exclusions, cashier discount approval · Food Cost & Profit tracking · loyalty (points per Rs 100, value, minimum) · logos |
| General | **Appearance** (`theme`) | Style (Classic/Modern) · theme manager (Modern 13 · DT Retail 8 · Custom) · Smooth animations · accent colour · *Back to my previous look* · Restart |
| General | **Modules** | Module Management (Sidebar / More / Hidden, order, ★ favourites) |
| General | **Screen & Layout** | The POS on *this monitor*: layout mode, product columns, card size, cart width, category placement and width, spacing, main menu on POS, keypad; *Save for this screen* |
| Operations | **Tables** | Floors/sections · kitchens/stations · tables (name, chairs, shape round/square/rectangle, floor) |
| Operations | **Waiters** · **Riders** | Service staff and delivery riders |
| Operations | **Self-Pickup** | Enable pickup · "Select Order Type" prompt · Foodpanda mode · pickup time slots (15–120 min) · "Order ready" WhatsApp text |
| Printing | **Printer** | Default / Kitchen (KOT) / Token printers · backup printer & failover · offline-printer alert · **Silent Print** · paper size, cut and trim |
| Printing | **Receipt & QR** | Receipt design gallery (52) + live preview · section toggles · compact mode · text spacing · **QR & Barcode** |
| Printing | **Receipt Fonts** | Font, size, bold, alignment per receipt line; Urdu fonts |
| Printing | **KOT Settings** | Sections 6.1–6.3 + token module switch + "Print CANCEL KOT" + kitchen timer minutes + business-day start time |
| Integrations | **WhatsApp** | Floating button (online edition) · message templates *Paid/Bill Clear*, *Delivery Status* + your own (`{customer_name}`, `{order_number}`, `{grand_total}`, `{restaurant_name}`, `{delivery_status_line}`, `{rider_block}`) |
| Integrations | **Cities** · **Service Areas** | Cities you serve by province · delivery areas inside each city (+ map link) |
| Integrations | **Display** | Customer display on/off, what it shows, promo slideshow |
| Integrations | *Online Order* | **Online edition only** — website ordering links (hidden in the offline build) |
| Advanced | *Branches* · *Devices* | **Online edition only** — multi-branch setup and approved devices (hidden in the offline build) |
| Advanced | **Day Close** | Opens the Day Close screen |

> Your online system keeps the three *online-only* tabs (Online Order, Branches, Devices). Everything else above is the same screen in both editions.

<table><tr>
<td valign="top"><img src="user-guide/screenshots/set-general.png" width="430" alt="General"><br>General.</td>
<td valign="top"><img src="user-guide/screenshots/set-kot.png" width="430" alt="KOT settings"><br>KOT Settings.</td>
</tr><tr>
<td valign="top"><img src="user-guide/screenshots/set-receipt.png" width="430" alt="Receipt"><br>Receipt &amp; QR.</td>
<td valign="top"><img src="user-guide/screenshots/set-screen.png" width="430" alt="Screen layout"><br>Screen &amp; Layout.</td>
</tr></table>

**Layout-related keys worth knowing:** `categoryLayout` (`top` / `side` / `right`), `paymentDialogStyle` (`premium` / `classic`), `weightEntryPanel`, `serviceChargeMode` (`percent` / `pkr`), `serviceChargeOrderTypes`, `serviceChargeEditable`,
`serviceChargeBeforeTax`, `taxPercent`, `taxMode`, `roundingMode`, `discountPresets`, `discountAmountPresets`, `paymentQuickAmounts`, `customPaymentTypes` (extra payment buttons by name), `minimartMode`, `embeddedBarcodeMode`.

---

## 11. Printer Center

Open from the sidebar. Sections on its left: **Status · Printers · Role mapping · Print mode & speed · Receipt design · Margins · Alignment test · Print quality · Calibration · Test print · Diagnostics & setup · Tokens.**

| Section | Purpose |
| --- | --- |
| Status | Is each printer reachable; *Re-detect*; *Fix printer names* (Windows renames a re-plugged USB printer "… (Copy 1)" — the most common cause of a blank slip); print preview before printing; auto-retry 0–3 |
| Printers | Installed printers and system readiness |
| Role mapping | Which slip prints where: receipt · kitchen · token · rider · backup |
| Print mode & speed | `raw` ESC/POS (fastest), `driver` (the Windows driver) or `auto` — decided per printer; speed test |
| Receipt design | The 52-design gallery with live preview, per-template customization (5.3) |
| Margins · Alignment test · Print quality · Calibration | Per-slip margins, test pattern, text weight/darkness presets, per-printer calibration |
| Tokens | Token design, options, rules, department stubs (section 7) |
| Test print, Diagnostics & setup | Test slips, machine setup, diagnostic center |

<table><tr>
<td valign="top"><img src="user-guide/screenshots/prn-design.png" width="430" alt="Printer Center design"><br>Receipt design gallery.</td>
<td valign="top"><img src="user-guide/screenshots/prn-tokens.png" width="430" alt="Printer Center tokens"><br>Tokens.</td>
</tr></table>

---

## 12. What is new, version by version

| Version | What changed in design / UI / slips |
| --- | --- |
| **v1.21.0** | **Super Admin: Reset admin password** per restaurant, applied by the offline POS automatically (sealed AES-GCM command; POS sign-in gets *Forgot password?* + reset-code box). **Double-KOT fix** on the Kitchen button. Super Admin v1.1.0. |
| **v1.20.1** | Customer details showed 0 orders (phone matching), Menu price range for size/inch items, Sales Report heading, English-only UI text; the 143-page User Guide. |
| **v1.20.0** | **kg side panel** (by weight / by amount), **Premium payment screen** + Print-receipt box, **Espresso Orange** theme, **PIN sign-in**, category colour dots, stacked clock, default-password reminder. |
| **v1.19.0 / 1.19.1** | **All Categories** picker, side/right panels show full names, centred popups in DT Retail, service charge and discount printed on every bill (52 designs checked), **today's sales** per restaurant in Super Admin, support messages reach only their restaurant. |
| **v1.18.0** | **Service charge per order type** (percent or PKR), report search + **Category & Product wise** report, **theme manager + Custom themes + export/import**, **live bill on the Customer Display**, categories on the **right**, short-screen layout (800×600…). |
| **v1.17.0** | **DT Retail look** — 7 themes, animated welcome/sign-in, **11 receipt designs, 5 token designs, DT Kitchen Order**. |
| **v1.16.1** | "Red & Yellow" brand theme. |
| **v1.16.0** | **12 Modern themes**, roomier POS order screen, professional Super Admin (dashboard from real data, ⋯ menus, styled confirmations, Theme menu). |
| **v1.15.0** | **Modern interface** (new default), Module Management, shorter sidebar + **More**, accent colour, Super Admin on the same design system, Restart button. |
| **v1.14.x** | Receipt **QR & Barcode** (bill info on any phone), readable black bars on every template, text spacing (line/word/letter), Retrieve → Pay prints at once. |
| **v1.13.x** | Report printing, Hold printing, Urdu/Hindi voices, bulk deal import; **café receipt templates (3)**, footer-cut fix, printer re-detection. |
| **v1.12.0** | Premium Phase 1: offline licence, device control, responsive POS, dining hold, day close, offline billing. |
| v1.6 – v1.11 | Customer Display, Kitchen Display Center, per-slip margins, calibration, Settings split into tabs, money under test. |

(Every release has the full list, with "Checked" and "Not checked here", in `RELEASE_NOTES.md`. The release notes record only the café additions (v1.13.3) of the Premium receipt family; the 13 reference-based layouts are older than that.)

---

## 13. Porting to your online system

### 13.1 Suggested order

1. **Tokens first.** Copy the variable *names* and values from `ui-tokens.css` (section 3.7) and apply them from `<html>` attributes exactly as `applyUiStyle()` does (3.6). Do not hard-code hex anywhere else.
2. **Themes as data.** Port `uiThemes.ts` (id, name, accent HSL, `onAccent`, `accentText`, surface triplets, sidebar, family, hero/sidebar gradients, swatches). It is plain data — the 21 themes, the custom-theme JSON format and the contrast checker in
   `customTheme.ts` carry over unchanged.
3. **Shell & POS screen** — sidebar + More + Module Management; product tile, Order panel, category panel (top/left/right), All Categories grid, centred popups, Premium payment, kg panel, PIN sign-in.
4. **Slips** — port the **config-driven** receipts first (`premiumReceiptTemplates.ts` + `PremiumReceipt.tsx` + `DtRetailReceipt.tsx`, 27 designs), the **KOT** (`KitchenReceipt.tsx`, 9 designs) and the **token** builders (`tokenSlip.ts`, 12 designs). The 25 classic-family receipts are hand-written components — port only the ones your clients use.
5. **Settings** — the keys in section 10 are plain JSON on one settings object; keep the names and your clients' saved settings keep working.
6. **Displays** — `displayTemplates.ts` is pure data too.

### 13.2 Where data lives (offline app → what to map in the online system)

| Offline storage key | What it is |
| --- | --- |
| `desi-pos-data` | The whole database blob (orders, menu, users, settings, tables…) — in the online system this is your tables/collections |
| `dtpos-ui-style`, `dtpos-ui-theme`, `dtpos-ui-accent`, `dtpos-ui-anim`, `dtpos-ui-prev` | Appearance — **per device**; in the online system keep them per device/browser (or per user) |
| `dtpos-custom-themes` | Up to 12 custom themes |
| `dtpos-premium-template-customizations`, `dtpos-premium-template-selected` | Per-template receipt customization and the selected template |
| `dtpos-token-slip-options` | Token design options |
| `pos-login-mode`, `pos-pin-last-user`, `dtpos-pin-lock` | Last sign-in mode · last PIN user · PIN lock counters |
| `dtpos-live-bill` | Customer-display live bill (storage event + BroadcastChannel) |
| `pos-print-queue`, `dtpos-print-host-lock` | The print queue (last 100 jobs) and its single-host lock |

*Print devices are local*: printer names, margins and print mode are **machine-local** settings, not per-restaurant — keep them that way.

### 13.3 What not to port as-is

- **The print host and Windows printing** (`AutoKotPrinter`, `printQueue`, `fastPrint`, `escposRaster.cjs`) are desktop-specific (Electron + a PowerShell helper + ESC/POS raster). In a browser-based system render the slip HTML and print it via the browser,
  a print agent, or a cloud-print service; the **designs** carry over, the transport does not.
- **Offline licence / device slots / vault** — specific to the offline edition (the online system has accounts).
- **Plaintext passwords** — the offline POS stores local user passwords in its own encrypted store; an online system must hash them.

### 13.4 Gotchas (all of them cost time once)

1. A slip must not inherit screen CSS: build its own document (no `data-ui`).
2. Tables in slips (see 5.6). White-on-black needs a reverse class + the cut-off rule.
3. Animations must not set `transform` on a centred dialog.
4. Category pills: wrap names between words; on short/narrow panels put the name on its own line.
5. Service-charge/discount words come from **one** module; do not format them in a template.
6. A sized item's name already contains its size — print it once.
7. Every new CSS rule must be scoped (`html[data-ui="modern"] …`, and `[data-look="retail"]` for retail) or Classic and the print window change.
8. Light accents (yellow) need *two* values: the colour on buttons and the deeper colour for the same accent used as text.
9. Check contrast per theme automatically (a test), not by eye.
10. `kotCopies` × printer `copies` multiply.

---

## 14. Where everything lives in the code

| Area | Files |
| --- | --- |
| Tokens & styles | `src/styles/ui-tokens.css`, `ui-modern.css`, `ui-pos.css`, `ui-retail.css` |
| Themes | `src/lib/uiThemes.ts`, `uiStyle.ts`, `customTheme.ts`, `components/settings/CustomThemeManager.tsx`, `InterfaceStyleCard.tsx`, `ThemePreview.tsx` |
| Shell | `components/shell/*`, `AppLayout.tsx`, `lib/navPrefs.ts`, `components/settings/ModuleManagementCard.tsx` |
| POS screen | `pages/POSScreen.tsx`, `components/pos/*` (`CategoryGridDialog`, `WeightEntrySheet`), `lib/posLayout.ts`, `lib/weightEntry.ts`, `components/PaymentDialog.tsx` |
| Sign-in | `pages/LoginPage.tsx`, `components/PinLoginPanel.tsx`, `LoginRetailBrand.tsx`, `ForgotPasswordDialog.tsx`, `SplashScreen.tsx` |
| Receipts | `components/ReceiptPreview.tsx` (25 classic), `PremiumReceipt.tsx`, `DtRetailReceipt.tsx`, `StandardReceipt.tsx`, `lib/premiumReceiptTemplates.ts`, `PremiumTemplateGallery.tsx`, `ReceiptCodes.tsx`, `lib/billLabels.ts`, `lib/serviceCharge.ts` |
| KOT | `components/KitchenReceipt.tsx`, `components/settings/KotSettingsTab.tsx`, `lib/printQueue.ts`, `components/AutoKotPrinter.tsx` |
| Tokens | `lib/tokenSlip.ts`, `tokenRules.ts`, `tokenDepartments.ts`, `tokenLedger.ts`, `components/TokenReceipt.tsx`, `TokenSettingsCard.tsx` |
| Report slips | `printing/thermalReport.ts`, `components/ShiftReport.tsx` |
| Displays | `lib/displayTemplates.ts`, `liveBill.ts`, `components/LiveBillPanel.tsx`, `pages/CustomerDisplayPage.tsx`, `KdsTvPage.tsx` |
| Settings | `pages/SettingsPage.tsx`, `components/settings/*`, `lib/types.ts` (`RestaurantSettings`) |
| Super Admin | `superadmin/src/*` (shared design tokens via the `@pos` alias), `docs/SUPER_ADMIN.md` |
| Docs | `docs/UI_DESIGN_SYSTEM.md`, `docs/user-guide/*` (the PDF and its source), `RELEASE_NOTES.md` |
| Print simulator | `scripts/simulate-print.mjs` + `scripts/print-lab.tsx` (renders any slip through the real raster code) |

**Regenerating the pictures in this file**

```bash
# slips (needs the dev server on :5199 and playwright-core):
npx vite --port 5199 --host 127.0.0.1 &
LAB_URL="http://127.0.0.1:5199/scripts/print-lab.html?pdf=1" SIM_OUT=./sim node scripts/simulate-print.mjs
# themes:
npx vite --config docs/user-guide/tools/vite.docs.config.mjs --port 5201 &
node docs/design-gallery/tools/capture-themes.mjs
```

---

## 15. Honest limits

- The slip pictures are from the **print simulator** (the real raster code, 1-bit, 576 dots) — not photographs of a physical printer. Paper colour and a worn head will look different. Please check one slip of each design you ship on your own printers.
- The theme pictures are from a **desktop browser (Chromium)** with demo data at 1366 × 768 — not a Windows counter, phone or tablet. The two status pills in the header ("Connecting…", "Check Setup") are the browser's, not a defect.
- Some emoji in labels (🍳, ☕ …) render in the screen pictures; the PDF removed food pictures on request.
- The DT Retail sign-in uses user tiles and a PIN pad **and** keeps the username/password form; the guide's separate splash window is the in-app welcome screen here.
- On Emerald, Sunset and Night, white button text is about 3.6 : 1 (the guide's exact brand colours — a pass for large/bold text); text *links* use a deeper shade.
- Not tested here: a real Firebase project, the installed Electron app, a physical printer, a real scale. The release notes list what was and was not checked for every version.

---

## 16. Appendix — storage keys and HTML attributes

**`<html>` attributes:** `data-ui` (`modern`), `data-ui-theme` (theme id), `data-sidebar` (`light`/`dark`), `data-on-accent`, `data-look` (`retail`), `data-ui-mode` (`dark`), `data-anim` (`off`).
**Hook attributes used by screens:** `data-dtr="brand-mark|user-row|user-chip|hero|search-wide"`, `data-dtr-kpis="lead|second"`, `data-pos-cart`, `data-pos-cat-grid`, `data-pos-pay`, `data-pay-premium`, `data-weight-*`, `data-cat-dot`.
**Local keys (appearance):** `dtpos-ui-style`, `dtpos-ui-theme`, `dtpos-ui-accent`, `dtpos-ui-anim`, `dtpos-ui-prev`, `dtpos-custom-themes`.
**Local keys (slips):** `dtpos-premium-template-customizations`, `dtpos-premium-template-selected`, `dtpos-token-slip-options`.
**Local keys (sign-in):** `pos-login-mode`, `pos-pin-last-user`, `dtpos-pin-lock`, `pos-remember-username`, `pos-saved-username`.

*End of document.*
