/**
 * coi-serviceworker - Cross-Origin Isolation + PWA Cache Service Worker
 *
 * Static hosts cannot set COOP/COEP headers directly, so this worker injects
 * them into responses and also caches the small app shell for faster reloads.
 */

const CACHE_NAME = "retrovault-shell-v1";

function getPrecacheUrls() {
  const scopeUrl = new URL(self.registration.scope);
  const basePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  return [basePath, `${basePath}index.html`];
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(getPrecacheUrls()).catch(() => {
        // Pre-cache failures are non-fatal.
      }),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

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
        .catch(() =>
          caches.match(req).then((cached) =>
            cached ?? new Response("Offline - please check your connection and reload.", {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "text/plain" },
            }),
          ),
        ),
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
