# RetroOasis — Deployment & Rollback Guide

This document describes how to deploy RetroOasis to a static host and how to recover from a bad release without losing user data.

---

## Architecture overview

RetroOasis is a **fully static** single-page application with no backend server. The build output is a directory of HTML, CSS, JavaScript, and WebAssembly files that can be served from any static host (GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3 + CloudFront, etc.).

All user data lives in the **browser** (IndexedDB + localStorage). There is no database to migrate or back up server-side.

---

## Build

```bash
npm ci          # reproducible install
npm run build   # type-check + Vite bundle → dist/
```

The `dist/` directory is the deployment artifact. Files are content-hash-named (e.g. `assets/main-a1b2c3.js`) except `index.html` and a few static assets.

---

## Deployment

### GitHub Pages (default)

The repo includes a GitHub Actions workflow that builds and publishes to GitHub Pages on every push to `main`. No manual steps are required.

### Manual / other hosts

1. Run `npm run build`.
2. Upload the contents of `dist/` to your host's publish directory.
3. Set the following HTTP response headers for **all files** (the `coi-serviceworker.js` injects them at the service-worker level for hosts that don't support custom headers, but header-level is preferred):
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
4. (Recommended) Also set:
   ```
   X-Frame-Options: DENY
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin
   frame-ancestors 'none'
   ```

---

## Cache invalidation

Vite appends a content hash to every JS/CSS chunk filename. Old cached filenames are never served after a deploy — users automatically download new assets on their next visit.

**Exception: `index.html`** — this file is not hash-named. Configure your CDN or server to serve it with `Cache-Control: no-cache` so browsers always fetch the latest version.

Recommended CDN cache settings:

| File pattern | Cache-Control |
|---|---|
| `index.html` | `no-cache, no-store` or `max-age=0` |
| `assets/*.js`, `assets/*.css` | `max-age=31536000, immutable` |
| `coi-serviceworker.js` | `no-cache, no-store` |
| `*.wasm` | `max-age=31536000, immutable` |

---

## WASM / emulator core cache invalidation

RetroOasis caches compiled WebAssembly modules in IndexedDB (`retro-oasis-wasm`), keyed by URL. The cache is validated on each page load via a conditional `HEAD` request (ETag / Last-Modified). As long as the CDN sets correct `ETag` or `Last-Modified` headers on `.wasm` files, stale cores are automatically evicted.

If a new deployment changes a core that is not cache-busted by URL (rare), you can force eviction by incrementing the WASM DB version in `src/wasmCache.ts` (`WASM_DB_VERSION`). Incrementing the version drops and rebuilds the database, causing all cached modules to be re-compiled on next load.

---

## Rollback procedure

Because all user data is local, a rollback is purely a deployment artifact swap. **No user data is lost by rolling back.**

### Step 1 — Identify the last good build

```bash
git log --oneline -20 main
# Find the last commit with a known-good deployment
```

### Step 2 — Build the previous release

```bash
git checkout <good-commit-sha>
npm ci
npm run build
```

### Step 3 — Deploy the old artifact

Upload the `dist/` contents to your host, overwriting the bad release. For GitHub Pages, push the old commit's build artifact to the `gh-pages` branch or re-run the deployment workflow pointing at the old commit.

### Step 4 — Purge CDN cache

If you use a CDN in front of the host:

- **Cloudflare**: Caching → Purge Everything (or purge just `index.html`).
- **AWS CloudFront**: Create a cache invalidation for `/*` or specifically `/index.html`.
- **Netlify / Vercel**: Deployments are atomic — roll back to a previous deployment in the dashboard.

### Step 5 — Verify

Open the site in an incognito window and confirm the expected version is live (check the page title, version notes, or a known-fixed UI element).

---

## Monitoring bad deployments

RetroOasis has no server-side telemetry. Watch for bad releases via:

- **GitHub Issues** — users will report problems here.
- **Browser console errors** — ask early testers to share screenshots of the DevTools console.
- **Build CI status** — the GitHub Actions workflow runs `tsc --noEmit` + Vitest before deploying; a build failure will block the release automatically.

---

## Rollback checklist

- [ ] Identified the last good commit SHA
- [ ] Built the old artifact from that commit
- [ ] Deployed the old artifact to the static host
- [ ] Purged CDN / edge cache for `index.html`
- [ ] Confirmed in incognito that the rollback is live
- [ ] Opened a post-mortem issue in GitHub to document what went wrong
