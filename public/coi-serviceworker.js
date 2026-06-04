/**
 * coi-serviceworker — Cross-Origin Isolation + High-Performance PWA Cache Service Worker
 *
 * Strategy:
 *   - CacheFirst + background update for navigation (instant app start)
 *   - Stale-while-revalidate for all static hashed assets (/assets/*)
 *   - CacheFirst for fonts, images, icons — rarely change
 *   - Precaches critical shell + build manifest entries
 *   - Separate cache namespaces: shell vs shared user data
 *   - Aggressive COI header injection for SharedArrayBuffer/WASM
 */

const SHELL_CACHE = "retro-oasis-shell-v8";
const SHARE_TARGET_CACHE = "retro-oasis-shared-roms-v1";
const LEGACY_SHARE_TARGET_CACHES = ["retro-oasis-user-v1", "retro-oasis-shared-roms"];
const PRESERVED_CACHES = new Set([SHELL_CACHE, SHARE_TARGET_CACHE, ...LEGACY_SHARE_TARGET_CACHES]);

// ── Gaming-aware update deferral ─────────────────────────────────────────
//
// Chromebooks aggressively update service workers.  If a game is running,
// skipWaiting() would kill the current SW mid-game (losing COI headers,
// breaking SharedArrayBuffer).  We defer activation until the client tells
// us the game has stopped.
let _isGaming = false;

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "retro-oasis-gaming-status") {
    _isGaming = !!data.gaming;
    // If the client signals gaming has stopped AND a new SW is waiting,
    // activate immediately.
    if (!_isGaming) {
      self.skipWaiting();
    }
  }
});

/**
 * Core shell URLs precached on install (best-effort; failures non-fatal).
 */
function getShellPrecacheRequests() {
  const scope = self.registration.scope;
  const roots = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png",
    "./apple-touch-icon.png",
    "./favicon.ico",
    "./audio-processor.js",
    "./coi-serviceworker.js",
  ];
  return roots.map((rel) => new Request(new URL(rel, scope).href, { credentials: "same-origin" }));
}

async function precacheShell(cache) {
  await Promise.allSettled(getShellPrecacheRequests().map((req) => cache.add(req).catch(() => {})));
}

/**
 * Precache the Vite-generated list in pwa-precache.json.
 * Includes all JS/CSS/WASM that are part of the critical initial load.
 */
async function precacheFromBuildManifest(cache) {
  try {
    const manifestUrl = new URL("pwa-precache.json", self.registration.scope);
    const res = await fetch(manifestUrl);
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;

    // Precache in small batches to avoid overwhelming the fetch queue on first install.
    const batchSize = 8;
    for (let i = 0; i < list.length; i += batchSize) {
      const slice = list.slice(i, i + batchSize);
      await Promise.allSettled(
        slice.map((rel) => {
          const url = new URL(rel, self.registration.scope).href;
          return cache.add(new Request(url, { credentials: "same-origin" })).catch(() => {});
        }),
      );
    }
  } catch {
    // Dev server or deploy without generated manifest — non-fatal.
  }
}

self.addEventListener("install", (event) => {
  // If a game is running, defer activation — skipWaiting() would kill the
  // current service worker mid-game and break SharedArrayBuffer / COI.
  if (!_isGaming) {
    self.skipWaiting();
  }
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      await precacheShell(cache);
      await precacheFromBuildManifest(cache);
    }),
  );
});

/**
 * On activate: remove stale caches from previous versions.
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !PRESERVED_CACHES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Identify Vite-hashed (content-addressed) assets.
 */
function isHashedAssetUrl(url) {
  if (!url.pathname.includes("/assets/")) return false;
  return /\.(?:js|mjs|css|wasm|map)$/i.test(url.pathname);
}

/**
 * Identify static image/font/icon assets that benefit from long CacheFirst.
 */
function isLongLivedStaticAsset(url) {
  const p = url.pathname;
  return (
    p.includes("/assets/") &&
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|woff2?|otf)$/i.test(p)
  );
}

/**
 * Identify EmulatorJS data files (cores, compression WASM, localisation).
 * These are versioned on the EJS CDN and benefit from stale-while-revalidate.
 */
function isEmulatorDataUrl(url) {
  const p = url.pathname;
  return p.includes("/data/") && /\.(?:js|mjs|css|wasm|json)$/i.test(p);
}

/**
 * Attach required COI headers to every response we serve.
 * Safari needs "credentialless" for COEP; other browsers use "require-corp".
 */
function addCOIHeaders(response, coepValue) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", coepValue);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  // Ensure WASM streaming works for large modules.
  if (response.headers.get("Content-Type")?.includes("application/wasm")) {
    headers.set("Content-Type", "application/wasm");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Determine the right COEP value based on User-Agent.
 */
function getCoepValue(req) {
  const ua = req.headers.get("user-agent") ?? "";
  const isWebKit =
    (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)) ||
    /CriOS\//.test(ua);
  return isWebKit ? "credentialless" : "require-corp";
}

/**
 * Stale-while-revalidate for hashed assets (JS, CSS, WASM).
 * Serves instantly from cache, updates in background.
 */
async function staleWhileRevalidateAsset(req, coepValue) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((response) => {
      if (response.ok) {
        const clone = response.clone();
        void cache.put(req, clone).catch(() => {});
      }
      return addCOIHeaders(response, coepValue);
    })
    .catch(() => null);

  if (cached) {
    // Fire-and-forget background update
    void networkPromise;
    return addCOIHeaders(cached.clone(), coepValue);
  }

  const fresh = await networkPromise;
  return fresh ?? offlinePlainResponse("Offline — required asset unavailable.");
}

/**
 * CacheFirst for long-lived static assets (fonts, images, icons).
 * Only revalidates when the client explicitly bypasses cache.
 */
async function cacheFirstStatic(req, coepValue) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return addCOIHeaders(cached.clone(), coepValue);

  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      void cache.put(req, clone).catch(() => {});
    }
    return addCOIHeaders(res, coepValue);
  } catch {
    return offlinePlainResponse("Offline — static asset unavailable.");
  }
}

/**
 * CacheFirst navigation + background revalidate.
 * Delivers instant app shell; silently refreshes in background.
 */
async function cacheFirstNavigation(req, coepValue) {
  const cache = await caches.open(SHELL_CACHE);

  // Try cache first (fast path)
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) {
    // Background refresh (non-blocking)
    void fetch(req)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          void cache.put(req, clone).catch(() => {});
        }
      })
      .catch(() => {});
    return addCOIHeaders(cached.clone(), coepValue);
  }

  // No cached shell — fall back to network, then cache for next time
  try {
    const res = await fetch(req);
    if (res.ok) {
      const clone = res.clone();
      void cache.put(req, clone).catch(() => {});
    }
    return addCOIHeaders(res, coepValue);
  } catch {
    // Offline fallback: find index.html or root
    const scope = self.registration.scope;
    const indexReq = new Request(new URL("index.html", scope).href);
    const indexHit = await cache.match(indexReq);
    if (indexHit) return addCOIHeaders(indexHit.clone(), coepValue);

    const rootHit = await cache.match(new Request(scope));
    if (rootHit) return addCOIHeaders(rootHit.clone(), coepValue);

    return offlinePlainResponse("Offline — unable to load app shell.");
  }
}

/**
 * Generic fallback fetch with single COI header injection.
 */
async function networkWithFallback(req, coepValue) {
  try {
    const res = await fetch(req);
    if (res.status === 0 || (!res.ok && res.type === "opaque")) {
      return res;
    }
    // Cache successful same-origin script/style responses for future offline use.
    if (req.url.startsWith(self.location.origin) &&
       (req.destination === "script" || req.destination === "style")) {
      const cache = await caches.open(SHELL_CACHE);
      const clone = res.clone();
      void cache.put(req, clone).catch(() => {});
    }
    return addCOIHeaders(res, coepValue);
  } catch {
    // Final fallback: try cache one more time for same-origin GETs
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return addCOIHeaders(hit.clone(), coepValue);
    return offlinePlainResponse("Offline — network request failed.");
  }
}

function offlinePlainResponse(body) {
  return new Response(body, {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Share-target handling (File Sharing API)
  if (req.method === "POST" && url.searchParams.has("share-target")) {
    const scopeOrigin = new URL(self.registration.scope).origin;
    if (url.origin === scopeOrigin) {
      event.respondWith(handleShareTarget(req));
    }
    return;
  }

  // Blob URLs must bypass the service worker.
  if (req.url.startsWith("blob:")) {
    event.respondWith(fetch(req));
    return;
  }

  // Only handle HTTP(s) requests.
  if (!req.url.startsWith("http")) return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;
  if (req.method !== "GET") return;

  const coepValue = getCoepValue(req);

  // 1. Hashed assets (JS, CSS, WASM, maps) → Stale-while-revalidate
  if (req.url.startsWith(self.location.origin) && isHashedAssetUrl(url)) {
    event.respondWith(staleWhileRevalidateAsset(req, coepValue));
    return;
  }

  // 2. Long-lived static assets (fonts, images, icons) → CacheFirst
  if (req.url.startsWith(self.location.origin) && isLongLivedStaticAsset(url)) {
    event.respondWith(cacheFirstStatic(req, coepValue));
    return;
  }

  // 3. Same-origin navigation (SPA routes) → CacheFirst + background revalidate
  if (req.mode === "navigate" && req.url.startsWith(self.location.origin)) {
    event.respondWith(cacheFirstNavigation(req, coepValue));
    return;
  }

  // 4. EmulatorJS data files (cores, compression, localisation) → SWR
  //    These are loaded per-game by EJS.  CacheFirst avoids network stalls
  //    on the critical game-launch path; background update keeps them fresh.
  if (req.url.startsWith(self.location.origin) && isEmulatorDataUrl(url)) {
    event.respondWith(staleWhileRevalidateAsset(req, coepValue));
    return;
  }

  // 5. Everything else (cross-origin, data URLs, etc.)
  event.respondWith(networkWithFallback(req, coepValue));
});

/**
 * Share-target: store shared ROM files for the main app to pick up.
 */
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("rom").filter((f) => f instanceof File);
    if (files.length > 0) {
      const cache = await caches.open(SHARE_TARGET_CACHE);
      for (const file of files) {
        const key = new Request(`/_shared/${encodeURIComponent(file.name)}`);
        await cache.put(key, new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Share-Filename": file.name,
          },
        }));
      }
    }
  } catch {
    // Non-fatal.
  }
  return Response.redirect(self.registration.scope, 303);
}
