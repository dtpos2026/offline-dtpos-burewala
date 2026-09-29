# DT POS — UI design system (v1.15)

One set of design tokens drives **both** the POS and the Super Admin panel.
This page is the map for anyone changing how the product looks.

## The rule

The interface style is presentation only. It changes colours, radii, shadows,
spacing and which navigation buttons are shown. It never touches business
logic, calculations, the database, the licence, users and permissions, or the
printer / receipt / KOT / token code.

## Two styles, thirteen Modern themes

| Style | What it is | How it is selected |
| --- | --- | --- |
| **Modern** (default) | Light, flat surfaces; a theme decides the colours | `<html data-ui="modern">` |
| **Classic** | The interface exactly as it was before v1.15 | attribute absent |

Settings → Theme → **Interface style** switches between them. The choice is
stored per device and applies at once, with no restart. Nothing else is read or
written.

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
| `src/lib/uiThemes.ts` | The twelve themes. |
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
