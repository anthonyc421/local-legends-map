# The Local Legends Map

Source and published build for [LocalLegendsMap.com](https://locallegendsmap.com).

## How it is organized

| Path | What it is |
|---|---|
| `src/index.html` | The single-file site. This is the source of truth; edit this. |
| `build.cjs` | Turns the source into the published site (one real page per address, images, sitemap, redirects). |
| `dist/` | The published site. Cloudflare serves this folder exactly as it is. |
| `wrangler.jsonc` | Cloudflare settings: serve `dist/`, show `404.html` for missing pages. |
| `build-report.json` | Page count and the list of addresses from the last build. |

## How publishing works

1. Change `src/index.html`.
2. Run `npm install --no-save playwright sharp` once, then `npm run build:site`. This rebuilds `dist/`.
3. Commit and push to `main`. Cloudflare publishes `dist/` automatically.

Cloudflare settings: build command empty, deploy command `npx wrangler deploy`, production branch `main`.
`wrangler.jsonc` tells Cloudflare to serve `dist/` and to use `404.html` for missing pages.

The build needs Node 22+, plus Chrome via Playwright for the prerender step
(`CHROME_PATH` can point at an installed Chrome).
