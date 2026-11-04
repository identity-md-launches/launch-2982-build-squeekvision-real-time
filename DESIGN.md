# SqueekVision design

This file describes what is in `src/` now. `dist/` is a byte-for-byte copy made by `scripts/build.mjs`. No values below come from a rendered browser: this machine had no shell and no browser, so the responsive behaviour is described from the CSS rules (see `artifacts/validation.md`).

## Overview

SqueekVision is a one-page, dark dashboard for people watching the SqueekChain network on Sepolia. It has no dependencies: plain HTML, one stylesheet and two ES modules. The page is dense and calm. A short header holds the product name and the one main action (**Refresh now**). Below it, cards show one topic each in order of importance: wheel status, next block, $SQK supply, then the full-width settlements table, hourly activity chart and contract list. Amber is the only accent. It marks the main action, progress fills and the brand wheel. Status is always given in words, and a coloured dot is added beside the word.

## Colors

Defined as custom properties in `src/styles.css` (`:root`). Primitives are named by hue. Components use only the semantic roles.

| Role token | Primitive | Value | Use |
| --- | --- | --- | --- |
| `--color-page` | `--ink-950` | `#0b0e12` | Page background, table and tab-group wells |
| `--color-surface` | `--ink-900` | `#12161c` | Card background, table row dividers |
| `--color-raised` | `--ink-800` | `#1b2129` | Badges, selected tab, progress track, contract row dividers |
| `--color-border` | `--ink-700` | `#2a323d` | Card and tab-group borders, chart baseline, zero-height bars |
| `--color-text` | `--ink-100` | `#e6ebf1` | Primary text |
| `--color-text-muted` | `--ink-400` | `#8d99a8` | Labels, notes, meta lines, unselected tabs, table headers |
| `--color-action` | `--amber-400` | `#f4b740` | The primary button, progress fills, chart bars, brand mark, warning dot |
| `--color-on-action` | `--amber-950` | `#1c1404` | Text on the amber button |
| `--color-link` / `--color-focus` | `--sky-300` | `#8ec5ff` | Links and the focus outline |
| `--color-positive` | `--green-400` | `#4ade80` | Running, settling, live, verified |
| `--color-negative` | `--red-400` | `#f87171` | Errors, incidents, no data |

The only literal value outside the tokens is the primary button's hover colour, `#f7c561` (`src/styles.css`, `.btn-primary:hover`). The design has one theme, which is dark (`color-scheme: dark`). The contrast ratios in `artifacts/validation.md` were worked out from these hex values with the WCAG formula. They were not measured on a rendered page.

## Typography

- Families: `--font-sans` is the system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`). `--font-mono` (`ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`) is used only for addresses and transaction hashes. No font files are bundled, so each platform shows its own system face.
- Weights: 400 for body text and 600 for headings, values, buttons, tabs and badges.
- Scale: five sizes, all defined as tokens.

| Token | Size | Roles |
| --- | --- | --- |
| `--text-sm` | 0.8125rem / 13px | Meta lines, notes, `dt` labels, badges, table, axis, addresses |
| `--text-md` | 0.9375rem / 15px | Body, controls, `h3` |
| `--text-lg` | 1.125rem / 18px | `h2` card titles, wheel metrics, supply values |
| `--text-xl` | 1.5rem / 24px | `h1` |
| `--text-2xl` | 2rem / 32px | The next-block percentage |

- Line height is 1.5 for body text, 1.25 for headings and 1.1 for the big figure. Headings use `text-wrap: balance`. Notes are capped at `65ch`.
- Every changing number uses `font-variant-numeric: tabular-nums`.
- There is no letter-spacing and no uppercase transform. Copy uses sentence case.

## Layout

- Spacing uses a 4px base: `--space-1` 4px, `--space-2` 8px, `--space-3` 12px, `--space-4` 16px, `--space-5` 24px, `--space-6` 32px. Cards have 16px padding and a 16px gap between children. The grid gap is 16px.
- Content is capped at `--page-max` (72rem). The header, `main.grid` and footer share the same 16px inline padding, so their edges line up.
- Breakpoints are in `src/styles.css`:
  - **Below 46rem** (phones): one column. The header wraps: the brand comes first, then a row with **Refresh now** and the auto-refresh toggle, then the status line across the full width. On a 390-wide screen the header and the start of the wheel card fit in the first screen (worked out from CSS sizes, not seen in a browser).
  - **46rem and up**: two columns. The wheel card spans both columns. Next block and supply sit side by side. The settlement summary shows four across. The contract groups split 3fr/2fr.
  - **68rem and up**: three columns, so wheel, block and supply share the top row. The protocol contract list uses two columns.
  - Settlements, activity and contracts always span every column (`.span-all`).
- Overflow: the settlements table keeps a `34rem` minimum width and scrolls sideways inside `.table-wrap`, which is a focusable, labelled region. Metric and fact grids use `repeat(auto-fit, minmax(...))`, so they drop to two columns before values get squeezed. Values wrap with `overflow-wrap: anywhere` as a last resort.

## Elevation & Depth

The surfaces are flat, with no shadows. Depth comes from tone: page (`ink-950`), then card (`ink-900`), then raised (`ink-800`). Cards have a 1px `--color-border` outline. Wells inside a card, such as the table and the tab group, go back to the page tone rather than adding another card. A card whose latest refresh failed but still shows older data gets a dashed border (`.card[data-stale="true"]`).

## Shapes

Radii are `--radius-sm` 6px (tabs, focus outline, skip link), `--radius-md` 10px (button, tab group, table well) and `--radius-lg` 14px (cards). Pills (`999px`) are used for badges and progress tracks. Tab radii are concentric: a 10px group, 4px padding, then 6px tabs. Chart bars have 3px top corners.

## Components

All are patterns in plain HTML and CSS. None is a library export.

- **Primary button** `.btn.btn-primary` (`src/index.html`, `#refresh`): the one filled action on the page. It is at least 44px tall. Hover lightens it, and pressing scales it to 0.97. It gets `aria-busy="true"` while a request is in flight. A manual refresh is announced through the polite live region `#announcer`.
- **Toggle** `.toggle` with a native checkbox `#auto`: its label states what the ON state does ("Auto-refresh every 15 s"). The label area is 44px tall.
- **Card** `.card` with `.card-head` (an `h2` plus an optional badge or meta line): one topic per card. Never put a card inside another card.
- **Badge** `.badge[data-tone=neutral|positive|warning|negative]`: a dot plus a word. The word carries the meaning.
- **Definition grids** `.metrics`, `.facts`, `.facts-lg`, `.facts-row`: `dt` labels in muted 13px and `dd` values in 600 weight.
- **Progress bar** `.progress > .progress-fill` (add `.progress-thin` for a thinner bar and `.progress-still` for no stripes): it has `role="progressbar"` with `aria-valuenow` and `aria-valuetext`. The fill moves by `transform: scaleX()` over 900ms. The stripes only move while the queue is enabled and above 0% (`data-idle`).
- **Tabs** `.tabs[role=tablist] > .tab[role=tab]`: follows the ARIA tabs pattern with a roving `tabindex`. Arrow keys, Home and End select and focus a tab, and each switch loads that range. The selected tab uses the raised tone, not the accent.
- **Data table** `.table-wrap > table`: right-aligned numbers (`.num`), monospace hashes (`.mono`) and dividers between rows. The table is hidden when there are no rows, and the note below it explains why.
- **Bar chart** `.chart > ol.bars > li.bar > .bar-fill`: each bar has a visually hidden text label ("14:00: 3 settlements"). Zero bars use the border colour at 2px. The axis shows the start, middle and end hours. The caption gives the empty or highest-bar summary.
- **Address list** `ul.contracts > li`: a label, an optional capability state, and a shortened address that links to Sepolia Etherscan in a new tab. The link's accessible name contains the full address.
- **Notes** `.note`: muted 13px text. They are hidden when empty. `data-tone="negative"` turns them red for errors.
- **Wheel icon** `#wheel-icon`: muted when idle. When running it turns amber and spins (1.6s per turn).
- Motion: only specific properties transition, never `all`. The `prefers-reduced-motion: reduce` rule turns off every animation and makes transitions near-instant.

## Do's and Don'ts

- Do start a new section as a `.card` inside `main.grid`, and add `.span-all` when it holds a table or chart.
- Do keep **Refresh now** as the only amber-filled control. Use the neutral tab style or a plain link for secondary actions.
- Do add new sizes to the five `--text-*` tokens only by replacing one. The page uses five on purpose.
- Do write state as a word in a badge or note. Colour comes second.
- Do write API values with `textContent` through the `h()` helper in `src/app.js`, never as HTML.
- Don't add shadows, gradient text or cards inside cards. Don't add uppercase labels above headings.
- Don't hard-code colours. Add a primitive and a role token in `:root` first.
- To add a page section: map the API fields in a pure function in `src/lib.js` and test it in `tests/lib.test.mjs`. Render it in `src/app.js` with `setText`, `setBadge` and `setNote`. Add the markup to `src/index.html` using the card, badge and facts patterns. Then run `npm run build`.
