/**
 * coi-serviceworker — Cross-Origin Isolation + PWA Cache Service Worker
 *
 * Injects COOP/COEP where hosts cannot set headers. Production builds emit
 * `pwa-precache.json` so installs cache hashed bundles. `/assets/*` uses
 * stale-while-revalidate. Shell URLs precache per-request so one missing icon
 * does not abort the entire precache (GitHub Pages omits optional assets).
 */

const CACHE_NAME = "retro-oasis-shell-v6";

/**
 * Core shell URLs (each attempted independently — failures are non-fatal).
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
    "./audio-processor.js",
    "./coi-serviceworker.js",
  ];
  return roots.map((rel) => new Request(new URL(rel, scope).href, { credentials: "same-origin" }));
}

async function precacheShell(cache) {
  await Promise.allSettled(getShellPrecacheRequests().map((req) => cache.add(req)));
}

/**
 * Precache URLs listed by Vite (`pwa-precache.json`), when present.
 */
async function precacheFromBuildManifest(cache) {
  try {
    const manifestUrl = new URL("pwa-precache.json", self.registration.scope);
    const res = await fetch(manifestUrl);
    if (!res.ok) return;
    const list = await res.json();
    if (!Array.isArray(list)) return;
    await Promise.allSettled(
      list.map((rel) => {
        const url = new URL(rel, self.registration.scope).href;
        return cache.add(new Request(url, { credentials: "same-origin" }));
      }),
    );
  } catch {
    // Dev server or deploy without generated manifest.
  }
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await precacheShell(cache);
      await precacheFromBuildManifest(cache);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isHashedAssetUrl(url) {
  return (
    url.pathname.includes("/assets/") &&
    /\.(?:js|mjs|css|wasm)$/i.test(url.pathname)
  );
}

async function assetStaleWhileRevalidate(req, coepValue) {
  const cache = await caches.open(CACHE_NAME);
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
    void networkPromise;
    return addCOIHeaders(cached.clone(), coepValue);
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;

  return offlinePlainResponse("Offline — cached asset unavailable.");
}

function offlinePlainResponse(body) {
  return new Response(body, {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Resolve SPA navigations when offline: match exact URL, ignore query, then index.html at scope.
 */
async function matchOfflineNavigation(req) {
  const cache = await caches.open(CACHE_NAME);
  let hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;

  const scope = self.registration.scope;
  try {
    const indexReq = new Request(new URL("index.html", scope).href);
    hit = await cache.match(indexReq);
    if (hit) return hit;

    hit = await cache.match(new Request(scope));
    if (hit) return hit;
  } catch {
    // Non-fatal.
  }
  return undefined;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && url.searchParams.has("share-target")) {
    const scopeOrigin = new URL(self.registration.scope).origin;
    if (url.origin === scopeOrigin) {
      event.respondWith(handleShareTarget(req));
    }
    return;
  }

  if (req.url.startsWith("blob:")) {
    event.respondWith(fetch(req));
    return;
  }

  if (!req.url.startsWith("http")) return;
  if (req.cache === "only-if-cached" && req.mode !== "same-origin") return;

  const ua = req.headers.get("user-agent") ?? "";
  const isWebKit =
    (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)) ||
    /CriOS\//.test(ua);
  const coepValue = isWebKit ? "credentialless" : "require-corp";

  if (
    req.method === "GET" &&
    req.url.startsWith(self.location.origin) &&
    isHashedAssetUrl(url)
  ) {
    event.respondWith(assetStaleWhileRevalidate(req, coepValue));
    return;
  }

  const isSameOriginNav =
    req.mode === "navigate" &&
    req.url.startsWith(self.location.origin);

  if (isSameOriginNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
          return addCOIHeaders(res, coepValue);
        })
        .catch(async () => {
          const cached = await matchOfflineNavigation(req);
          if (cached) return addCOIHeaders(cached.clone(), coepValue);
          return offlinePlainResponse("Offline — check your connection and reload.");
        }),
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response.status === 0 || (!response.ok && response.type === "opaque")) {
          return response;
        }

        if (
          req.url.startsWith(self.location.origin) &&
          (req.destination === "script" || req.destination === "style")
        ) {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }

        return addCOIHeaders(response, coepValue);
      })
      .catch(() => fetch(req)),
  );
});

function addCOIHeaders(response, coepValue) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", coepValue);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("rom").filter((f) => f instanceof File);
    if (files.length > 0) {
      const cache = await caches.open("retro-oasis-shared-roms");
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
    // Non-fatal — redirect even if storage failed.
  }
  return Response.redirect(self.registration.scope, 303);
}
