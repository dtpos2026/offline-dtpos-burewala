# DT POS — UI design system (v1.15)

One set of design tokens drives **both** the POS and the Super Admin panel.
This page is the map for anyone changing how the product looks.

## The rule

The interface style is presentation only. It changes colours, radii, shadows,
spacing and which navigation buttons are shown. It never touches business
logic, calculations, the database, the licence, users and permissions, or the
printer / receipt / KOT / token code.

## Two styles

| Style | What it is | How it is selected |
| --- | --- | --- |
| **Modern** (default) | Light, warm, flat surfaces; one accent colour | `<html data-ui="modern">` |
| **Classic** | The interface exactly as it was before v1.15 | attribute absent |

Settings → Theme → **Interface style** switches between them. The choice is
stored per device (`dtpos-ui-style`, `dtpos-ui-accent`) and applies at once,
with no restart. Nothing else is read or written.

## Files

| File | Job |
| --- | --- |
| `src/styles/ui-tokens.css` | The tokens. Every value lives here: palette, accent, status colours, radii, shadows, control heights, spacing and type scales, and the resolved `--ui-*` aliases for inline styles. |
| `src/styles/ui-modern.css` | What a token cannot say: focus, table and dialog finish, flat replacements for the old gradients, badge tints. Every selector starts with `html[data-ui="modern"]`. |
| `src/lib/uiStyle.ts` | Applies the style and the accent, keeps the accent readable (`safeAccent` darkens a pale colour until white text on it reaches contrast 4.6). |
| `src/lib/navPrefs.ts` | Module visibility (Settings → Modules): what is in the sidebar, under **More**, or hidden. Navigation only. |
| `src/components/ui-kit/*` | `PageHeader`, `StatCard`, `StatusBadge`, `EmptyState`, `LoadingState`, `SectionCard`, `SearchField`, `SegmentedControl`. |
| `src/components/shell/*` | The Modern sidebar, header, clock and the **More** launcher. |
| `superadmin/src/theme.ts` | Maps the Super Admin's style constants onto the same `--ui-*` variables. |

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
