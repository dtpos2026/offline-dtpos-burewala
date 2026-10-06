# DT POS — UI design system (v1.18)

One set of design tokens drives **both** the POS and the Super Admin panel.
This page is the map for anyone changing how the product looks.

## The rule

The interface style is presentation only. It changes colours, radii, shadows,
spacing and which navigation buttons are shown. It never touches business
logic, calculations, the database, the licence, users and permissions, or the
printer / receipt / KOT / token code.

## Two styles, thirteen Modern themes, and the DT Retail look

| Style | What it is | How it is selected |
| --- | --- | --- |
| **Modern** (default) | Light, flat surfaces; a theme decides the colours | `<html data-ui="modern">` |
| **Classic** | The interface exactly as it was before v1.15 | attribute absent |

Settings → Theme → **Interface style** switches between them. The choice is
stored per device and applies at once, with no restart. Nothing else is read or
written.

### Custom themes and the theme manager (v1.18)

Settings → Appearance shows the **style** (Classic / Modern) and, under Modern, three **families**:
Modern themes, DT Retail and Custom.

- `src/lib/customTheme.ts` turns a designer's choice — look (`modern` / `retail`), dark page, and five
  `#rrggbb` colours — into a full `UiTheme` plus one stylesheet block
  `:root[data-ui="modern"][data-ui-theme="custom-…"] { … }`. Text, quiet text, the accent as text and the
  sidebar text are moved until they read (body ≥ 7 : 1, the rest ≥ 4.5 : 1); a pale accent gets dark text on it.
- The block is built from computed numbers only (never from the file's text) and injected as
  `<style id="dtpos-custom-theme">` by `applyUiStyle()` only while that theme is active; Classic or any other
  theme removes it. Custom themes are registered in `uiThemes.ts` (`registerCustomThemes`) by
  `loadCustomThemes()` in `main.tsx`, before the first paint.
- Stored per computer in `dtpos-custom-themes` (max 12). Theme files: `{ format: "dtpos-theme", version: 1, theme }`;
  an import always gets a fresh id. Tests: `src/test/custom-theme.test.tsx`.

### Short screens (v1.18)

`lib/posLayout.ts` sets `short` when the POS area is under 680 px tall; the cart carries `data-short`.
The POS then folds Discount / Promo / Service and the optional customer row (never while in use), hides the
shortcut strip, and `ui-pos.css` tightens Modern rows (`[data-pos-cart][data-short]`). A narrow cart moves the
unit price under the item name. Categories can also sit on the **right** (`categoryPlacement: 'right'`).

### Customer Display live bill (v1.18)

`lib/liveBill.ts` defines the only fields the customer screen can receive (names, quantities, amounts,
totals) and builds them from an allow-list; `components/LiveBillPanel.tsx` draws them with the display
template's colours. Published to `dtpos-live-bill` (storage event + BroadcastChannel) only when
Settings → Display → Enable Display Screen is on.

### DT Retail look (v1.17)

Seven more themes — Royal Purple, Crimson Red & White, Black & Gold, Emerald,
Sunset Orange, Ocean Blue and Night — form the **DT Retail** family, after the
"DT Retail POS Design Guide". They are Modern themes with extra attributes:

| Attribute on `<html>` | Set when | Used for |
| --- | --- | --- |
| `data-look="retail"` | a DT Retail theme is chosen | every rule in `ui-retail.css` |
| `data-ui-mode="dark"` | Black & Gold or Night | dark-page fixes for screens that hard-code light colours |
| `data-anim="off"` | *Smooth animations* is switched off | stops every retail animation |

- `ui-retail.css` is imported after `ui-pos.css`. **Every selector must contain
  `[data-ui="modern"]` and `[data-look="retail"]`** (dark-page rules use
  `[data-ui-mode="dark"]`, which only retail themes set); `src/test/dt-retail-look.test.tsx`
  fails otherwise. Animations sit under `:not([data-anim="off"])` and `prefers-reduced-motion`.
- Screens hook on `data-dtr="…"` attributes (`brand-mark`, `user-row`, `user-chip`,
  `hero`, `search-wide`) and `data-dtr-kpis="lead|second"`, which exist in every look
  but are styled only under retail.
- **Going back:** `setTheme()` stores the previous style / theme / accent in
  `dtpos-ui-prev` when a retail theme is chosen from anything else;
  `restorePreviousLook()` puts it back. Picking a non-retail theme clears it.
  Keys used: `dtpos-ui-theme`, `dtpos-ui-style`, `dtpos-ui-accent`, `dtpos-ui-anim`,
  `dtpos-ui-prev` — nothing else is read or written.
- Retail themes may set `accentText` (a deeper shade, lighter on dark pages) so the
  accent stays readable as text (≥ 4.5 : 1); the brand colours on buttons are kept
  exactly as in the guide (≥ 3 : 1 for white text).
- **Print follows the same guide but not the same CSS:** receipt designs are
  `DtRetailReceipt.tsx` (11), token designs `dtrSlipHtml()` in `tokenSlip.ts` (5), and
  `renderDtrKitchen()` in `KitchenReceipt.tsx`. They use CSS grid, never `<table>`, because
  the thermal print step forces borders, bold and vertical centring on tables. White on black
  uses the `dt-reverse` class the print worker already understands. Check a change with
  `scripts/simulate-print.mjs 'dtr-*'` (80 mm, and `?paper=58mm` in `LAB_URL`).

### Themes (Modern)

A theme is a whole look: page tint, panels, borders, the accent, the colour of
the text that sits on the accent, and whether the sidebar is light or dark.
`src/lib/uiThemes.ts` lists them; `src/styles/ui-tokens.css` holds the surface
colours of each (`:root[data-ui="modern"][data-ui-theme="…"]`).

| Id | Name | Accent | Sidebar |
| --- | --- | --- | --- |
| `ember` | Ember Orange (default) | orange | light |
| `tomato` | Tomato Red | pizza red | light |
| `pizza` | Red & Yellow | brand red, yellow highlights and cream plates | light |
| `fresh` | Fresh Green | salad green | light |
| `sunny` | Sunny Yellow | lemon yellow, **dark text on it** | light |
| `white` | Clean White | graphite | light |
| `ocean` | Ocean Blue | blue | light |
| `coffee` | Coffee Brown | espresso | light |
| `rose` | Rose Pink | pink | light |
| `violet` | Royal Purple | purple | light |
| `teal` | Mint Teal | teal | light |
| `charcoal` | Charcoal Orange | orange | **dark** |
| `navy` | Navy Night | blue | **dark** |

Storage: `dtpos-ui-style`, `dtpos-ui-theme` (theme id) and `dtpos-ui-accent`
(optional own colour on top of a theme; choosing a theme clears it).

What JS sets on `<html>`: `data-ui`, `data-ui-theme`, `data-sidebar`,
`data-on-accent`, and `--ui-accent-h/s/l`, `--ui-text-h/s/l`, `--ui-on-accent`,
`--ui-soft-s`, `--ui-gold-on-dark`. All of it is removed for Classic.

Two ideas make light accents (yellow) work without special-casing screens:

- `--ui-on-accent` is the colour of text on the accent (white, or near-black).
  Buttons, chips and badges use `text-primary-foreground`, so they follow.
- `--primary-text` is the accent **as text on a light surface**. It equals the
  accent except for yellow, where it is a deep amber. `.text-primary` reads it
  (see the top of `ui-modern.css`), so prices and links stay readable.

`src/test/ui-themes.test.ts` checks every theme: contrast of text on the accent,
the accent as text, body and muted text, the dark sidebar's text; that the
stylesheet and the theme list agree; and that Classic removes every trace.

## Files

| File | Job |
| --- | --- |
| `src/styles/ui-tokens.css` | The tokens. Every value lives here: palette, accent, status colours, radii, shadows, control heights, spacing and type scales, and the resolved `--ui-*` aliases for inline styles. |
| `src/styles/ui-modern.css` | What a token cannot say: focus, table and dialog finish, flat replacements for the old gradients, badge tints. Every selector starts with `html[data-ui="modern"]`. |
| `src/styles/ui-pos.css` | The POS order screen: product tiles, the Order panel, lines, totals, the Pay bar. It hooks onto `data-pos-*` attributes that `POSScreen.tsx` carries in both styles, so Classic never matches it. |
| `src/lib/uiThemes.ts` | The thirteen Modern themes and the seven DT Retail ones. |
| `src/lib/customTheme.ts` | Custom themes: derive, check, store, import / export. |
| `src/components/settings/CustomThemeManager.tsx` | The designer and the list of custom themes. |
| `src/styles/ui-retail.css` | The DT Retail look: gradient shell, dashboard banner and cards, tiles, motion, dark-page fixes, splash and sign-in. Scoped to `data-look="retail"`. |
| `src/lib/uiStyle.ts` | Applies the style and the accent, keeps the accent readable (`safeAccent` darkens a pale colour until white text on it reaches contrast 4.6). |
| `src/lib/navPrefs.ts` | Module visibility (Settings → Modules): what is in the sidebar, under **More**, or hidden. Navigation only. |
| `src/components/ui-kit/*` | `PageHeader`, `StatCard`, `StatusBadge`, `EmptyState`, `LoadingState`, `SectionCard`, `SearchField`, `SegmentedControl`. |
| `src/components/shell/*` | The Modern sidebar, header, clock and the **More** launcher. |
| `superadmin/src/theme.ts` | Maps the Super Admin's style constants onto the same `--ui-*` variables. |
| `superadmin/src/ui.tsx` | The Super Admin's shared parts: `Section`, `Modal`, `RowMenu`, styled confirmations and toasts (`FeedbackProvider`), `Avatar`, `Chips`, `MiniBar`. |

## Using the tokens

- **POS components** use the Tailwind colour names as before (`bg-card`,
  `text-muted-foreground`, `bg-primary` …). Under Modern those names resolve to
  the new palette; under Classic they resolve to the old one.
- **Inline styles** (the Super Admin) use the resolved aliases:
  `var(--ui-bg)`, `--ui-surface`, `--ui-border`, `--ui-text`, `--ui-text-muted`,
  `--ui-accent`, `--ui-success` / `-soft` / `-text`, and the same for warning,
  danger and info.
- **Shape and size:** `--ui-radius-control | card | dialog | pill`,
  `--ui-control-h | -sm | -lg`, `--ui-row-h`, `--ui-shadow-xs | sm | card | pop | focus`.
- **Type:** Manrope for text, JetBrains Mono for keys and codes. Both are
  bundled (`@fontsource`), so nothing is fetched at run time.

## Rules for new screens

1. Take colours, radii and shadows from the tokens. Do not write hex values.
2. A rule added to `ui-modern.css` must start with `html[data-ui="modern"]`.
   `src/test/ui-style.test.ts` fails the build if one does not, or if a print
   rule sneaks in.
3. Keep the print window untouched. It builds its own document without the
   `data-ui` attribute, so Modern can never reach a receipt, KOT or token.
4. Status colours mean something (green paid/active, amber pending, red
   overdue/failed). Do not repurpose them as decoration.
5. Where UI and function conflict, the function wins.

## Verifying a change

```
npx tsc --noEmit -p tsconfig.app.json
npx vitest run
npm run build
(cd superadmin && npm run build)
```

Then open the screen in both styles (Settings → Theme → Interface style) and
at 1366 × 768, 1024 × 768 and 800 × 600.
