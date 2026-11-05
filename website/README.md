# Nook website

Marketing site for **Nook | AI Answering Sidebar on Any Page**, a Chrome extension that puts Gemini in the
side panel and answers the question on the current page in one click.

Plain static HTML, CSS and JS. No build step. Smooth scrolling (Lenis) and fonts load from CDNs.

## Layout

- `public/`: everything that gets served (`index.html`, `styles.css`, `site.js`, `assets/`, `privacy/`).
- `tools/`: scripts that generated some of the assets (hero landscape SVGs, video poster, design canvas). Not served.
- `wrangler.toml`, `deploy.sh`: Cloudflare Pages config.

## Preview locally

```sh
cd public && python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Deploy

Hosted on Cloudflare Pages, output directory `public`, no build command.

- Git-connected: every push to `main` deploys.
- Manual: `npx wrangler login`, check `npx wrangler whoami`, then `./deploy.sh` (project `nook`) or
  `./deploy.sh <project-name>`.

## Visitor and click stats

`functions/api/event.js` counts page views, live visitors (a random per-tab id pinged every 30s) and "Add to Chrome"
clicks into the D1 database `nook-stats` (schema in `schema.sql`); no cookies, IPs or device details. `functions/stats.js`
serves a private dashboard at `/stats?key=...`, where the key is the Pages secret `STATS_KEY` (kept out of this repo).
Store links carry `utm_source=trynook.org&utm_content=<button>`, so the Chrome Web Store's own stats can attribute installs.
