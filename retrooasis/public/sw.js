/* RetroOasis app-shell service worker.
 * Caches SPA chrome + catalog. Leaves /data/ and /roms/ on the network. */

const CACHE = 'retrooasis-shell-v3'

const PRECACHE = [
  './',
  './index.html',
  './player.html',
  './manifest.webmanifest',
  './favicon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './catalog/platforms.json',
  './catalog/games.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Prefer settled adds so one missing URL doesn't block the whole SW.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(url).catch(() => {
            /* ignore individual precache misses */
          }),
        ),
      )
      // Stay waiting until the page asks to activate (update toast → reload).
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isShellAsset(req, path) {
  return (
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'manifest' ||
    req.destination === 'image' ||
    path.includes('/catalog/') ||
    path.includes('/assets/') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.webmanifest')
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const path = url.pathname
  if (path.includes('/data/') || path.includes('/roms/')) return

  // Navigations / HTML: network-first so deploys update, offline falls back to shell.
  const isNav = req.mode === 'navigate' || req.destination === 'document'
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            void caches.open(CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        })
        .catch(async () => {
          const cache = await caches.open(CACHE)
          return (
            (await cache.match(req, { ignoreSearch: true })) ||
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            Response.error()
          )
        }),
    )
    return
  }

  // Hashed build assets: cache-first (filename changes on deploy).
  if (path.includes('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true })
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) void cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  // Other shell assets: stale-while-revalidate.
  if (isShellAsset(req, path)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true })
        const network = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
