# SqueekVision

SqueekVision is a live dashboard for the SqueekChain network. It is a single static page with no dependencies, no framework and no external assets. It reads three public endpoints and refreshes every 15 seconds:

| Panel | Source |
| --- | --- |
| Squeektoshi wheel (running/idle, rotation, speed, distance) | `GET https://api.squeekchain.com/v1/status` → `measurement`, `builder` |
| Next block progress bar, block height, buffered rounds | same → `settlementQueue.projected`, `settlementQueue.buffered` |
| $SQK supply (minted, circulating, max cap) | `GET https://api.squeekchain.com/v1/economy/state` → `supply`, `asset`, `capabilities.token` |
| Contract and authority addresses (linked to sepolia.etherscan.io) | same → `deployment.components.*.address`, `deployment.authority` |
| Settlements table and summary with Now / 24h / 7d tabs | `GET https://api.squeekchain.com/v1/settlements?range=now\|24h\|7d` |
| Hourly activity bar chart | `GET …/v1/settlements?range=24h` → `buckets[].settlementCount` |

Controls: **Refresh now** reloads every panel, and the **Auto-refresh every 15 s** checkbox pauses or resumes the timer. The header shows when the data was last updated and counts down to the next refresh. Refreshing pauses while the browser tab is hidden. The range tabs work with the arrow keys, Home and End.

## Layout

```
src/            source: index.html, styles.css, app.js (DOM), lib.js (pure data mapping), favicon.svg, og-image.svg
dist/           the committed static export (byte copy of src/, relative ./ URLs)
scripts/build.mjs   copies src/ to dist/ and checks share tags and relative asset URLs (--check compares only)
tests/lib.test.mjs  node:test unit tests for the API mapping in src/lib.js
jsconfig.json   JS type checking (checkJs) used by `npm run typecheck`
DESIGN.md       tokens, type, layout and components
artifacts/validation.md   review and verification record
```

## Install

You need Node 18 or newer. There are no packages to download, and `package-lock.json` lists none.

```sh
npm install      # nothing to fetch; it only writes the (empty) lockfile tree
```

## Preview

The page uses ES modules, so serve it over HTTP. Opening the file directly (`file://`) will not work.

```sh
npm run preview          # python3 -m http.server 4173 --directory dist
# or: npx serve dist
```

Then open http://localhost:4173/. Every asset URL is relative (`./app.js`), so the export also works under a subpath, through an IPFS gateway or at an ENS name.

## Rebuild

```sh
npm run build      # rebuild dist/ from src/
npm run check      # check dist/ matches src/ and index.html has its share tags
npm test           # unit tests for the data mapping
npm run typecheck  # tsc --noEmit over src/*.js (downloads typescript@5.6.3 with npx)
```

Edit files only in `src/`, then run `npm run build` and commit `src/` and `dist/` together.

## Verification status

Read this before you rely on the export. Full detail is in `artifacts/validation.md`.

None of the commands above have been run. The shell on the build machine would not start (sandbox error "Failed to create bridge sockets"), and the Playwright browser was not installed. The files were written directly instead: `dist/` was written by hand as an exact copy of `src/`, without running `npm run build`. These checks remain to be done:

- `npm run build`, `npm run check`, `npm test` and `npm run typecheck`. Their results are unknown.
- The design probe (`taste.mjs`) and any browser check: rendering at 320, 390 and 1440 wide, the console, and whether the API sends CORS headers that let a browser read it.

These checks were done:

- All three endpoints were read on 2026-11-04 with a web fetch, and the code maps the field names they actually returned.
- The API mapping was reviewed by reading the source.

## Known limitations

- **API data on 2026-11-04:**
  - The wheel has not reported yet (`measurement: null`). The rotation, speed and distance field names are guesses (`rpm`, `speedKmh`/`speedMetersPerSecond`, `distanceMeters`, …) until the API publishes them.
  - `supply` is `null` because the token is not yet safe-confirmed (`capabilities.token.reason: not_yet_safe`).
  - The settlement lists are empty.
  - Until these fill in, the page shows a dash and a plain explanation in place of each missing value.
- **Block progress units:** `blockProgress` is read as thousandths of a block. This is inferred from `workPerThousandBlocks` and is not documented by the API.
- **Share image:** `og:image` is an SVG with a relative URL. Some link unfurlers only accept an absolute PNG or JPEG URL. Without a shell, no PNG could be produced.
- **CORS:** if the API does not send CORS headers, the browser blocks the requests. Each panel then shows "did not load", and the header shows the reason and a retry hint.
