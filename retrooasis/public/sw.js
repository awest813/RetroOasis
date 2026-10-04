/* RetroOasis app-shell service worker.
 * Caches SPA chrome + catalog. Leaves /data/ and /roms/ on the network. */

const CACHE = 'retrooasis-shell-v9'

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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('retrooasis-shell-') && k !== CACHE).map((k) => caches.delete(k))))
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
  // Room traffic and invite responses must always reach the LAN service.
  if (path.startsWith('/api/lan') || path.startsWith('/socket.io/') || path.endsWith('/controller-input.js') || /\/lan(?:-[^/]+)?\.(?:html|js|css)$/.test(path)) return
  if (path.includes('/data/') || path.includes('/roms/')) return
  // These player files keep fixed names. Fetch updates first, retain an offline copy.
  if (path.includes('/emulator/')) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const response = await fetch(req, { cache: 'no-cache' })
          if (response.ok) event.waitUntil(cache.put(req, response.clone()).catch(() => {}))
          return response
        } catch { return (await cache.match(req)) || Response.error() }
      }),
    )
    return
  }
  // Explicit artwork refresh bypasses ignoreSearch app-shell image caches.
  if (req.destination === 'image' && url.searchParams.has('_ro_cover_refresh')) {
    const cacheUrl = new URL(url)
    cacheUrl.searchParams.delete('_ro_cover_refresh')
    const cacheReq = new Request(cacheUrl.href, { credentials: req.credentials })
    event.respondWith(
      fetch(req, { cache: 'reload' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(cacheReq, copy)).catch(() => {}))
          }
          return res
        })
        .catch(async () => {
          const cache = await caches.open(CACHE)
          return (await cache.match(cacheReq)) || Response.error()
        }),
    )
    return
  }

  // Navigations / HTML: network-first so deploys update, offline falls back to shell.
  const isNav = req.mode === 'navigate' || req.destination === 'document'
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            event.waitUntil(caches.open(CACHE).then((cache) => {
              // player.html?rom=… would otherwise cache one entry per Play visit.
              const cacheReq = url.search
                ? new Request(`${url.origin}${url.pathname}`, { credentials: req.credentials })
                : req
              return cache.put(cacheReq, copy)
            }).catch(() => {}))
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
        if (res.ok) event.waitUntil(cache.put(req, res.clone()).catch(() => {}))
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
            if (res.ok) return cache.put(req, res.clone()).catch(() => {}).then(() => res)
            return res
          })
          .catch(() => cached)
        event.waitUntil(network.then(() => {}))
        return cached || network
      }),
    )
  }
})
