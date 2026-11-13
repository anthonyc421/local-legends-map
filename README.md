# The Local Legends Map

Source and published build for [LocalLegendsMap.com](https://locallegendsmap.com).

## How it is organized

| Path | What it is |
|---|---|
| `src/index.html` | The single-file site. This is the source of truth; edit this. |
| `build.cjs` | Turns the source into the published site (one real page per address, images, sitemap, redirects). |
| `dist/` | The published site. Cloudflare serves this folder exactly as it is. |
| `build-report.json` | Page count and the list of addresses from the last build. |

## How publishing works

1. Change `src/index.html`.
2. Run `npm install` once, then `npm run build`. This rebuilds `dist/`.
3. Commit and push to `main`. Cloudflare publishes `dist/` automatically.

Cloudflare settings: no build command, output directory `dist`, production branch `main`.

The build needs Node 22+, plus Chrome via Playwright for the prerender step
(`CHROME_PATH` can point at an installed Chrome).
