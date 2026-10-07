/* RetroOasis app-shell service worker.
 * Caches SPA chrome + catalog. Leaves /data/ and /roms/ on the network. */

const CACHE = 'retrooasis-shell-v12'
// Libretro box art, so the library keeps its covers offline. Fetched with CORS:
// opaque responses would each count as megabytes of padded quota.
const COVER_CACHE = 'retrooasis-covers-v1'
const COVER_LIMIT = 600
let coverPuts = 0

function isLibretroCover(req, url) {
  return req.destination === 'image' && url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/libretro-thumbnails/')
}

async function trimCovers(cache) {
  const keys = await cache.keys()
  // Keys come back in insertion order; drop the oldest beyond the limit.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - COVER_LIMIT)).map((key) => cache.delete(key)))
}

async function coverResponse(event, url) {
  const refresh = url.searchParams.has('_ro_cover_refresh')
  const key = new URL(url)
  key.searchParams.delete('_ro_cover_refresh')
  const cache = await caches.open(COVER_CACHE)
  if (!refresh) {
    const cached = await cache.match(key.href)
    if (cached) return cached
  }
  try {
    const response = await fetch(url.href, { mode: 'cors', credentials: 'omit', cache: refresh ? 'reload' : 'default' })
    // Misses (404) pass through uncached; the page remembers them itself.
    if (response.ok) {
      event.waitUntil(cache.put(key.href, response.clone()).then(() => (++coverPuts % 25 === 0 ? trimCovers(cache) : undefined)).catch(() => {}))
    }
    return response
  } catch {
    return (await cache.match(key.href)) || Response.error()
  }
}

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
  // The player frontend: without these an update would leave play broken offline.
  './emulator/loader.js',
  './emulator/emulator.min.js',
  './emulator/emulator.min.css',
  // N64 Transfer Pak (Pokémon Stadium) works offline too.
  './transfer-pak.js',
  './ejs-start-hooks.js',
  './rom-source.js',
  './library-saves.js',
  './link-session.js',
  './lan-capabilities.js',
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
      .then(async (keys) => {
        const old = keys.filter((k) => k.startsWith('retrooasis-shell-') && k !== CACHE)
        // Keep the hosted library list across updates; it is only cached on use.
        try {
          const manifest = new URL('roms/manifest.json', self.location.href).href
          const fresh = await caches.open(CACHE)
          for (const name of old) {
            if (await fresh.match(manifest)) break
            const kept = await (await caches.open(name)).match(manifest)
            if (kept) await fresh.put(manifest, kept)
          }
        } catch {
          /* never block activation */
        }
        await Promise.all(old.map((k) => caches.delete(k)))
      })
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
  if (isLibretroCover(req, url)) {
    event.respondWith(coverResponse(event, url))
    return
  }
  if (url.origin !== self.location.origin) return

  const path = url.pathname
  // Room traffic and invite responses must always reach the LAN service.
  if (path.startsWith('/api/lan') || path.startsWith('/socket.io/') || path.endsWith('/controller-input.js') || /\/lan(?:-[^/]+)?\.(?:html|js|css)$/.test(path)) return
  // The hosted library list stays available offline (network-first); ROMs and cores do not.
  if (path.endsWith('/roms/manifest.json')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, res.clone())).catch(() => {}))
        return res
      }).catch(async () => (await caches.match(req, { cacheName: CACHE })) || Response.error()),
    )
    return
  }
  if (path.includes('/data/') || path.includes('/roms/')) return
  // These player files keep fixed names. Fetch updates first, retain an offline copy.
  // That includes the unhashed ES modules beside the pages (link-host.js imports
  // library-saves.js, and so on): served stale-while-revalidate, the first visit after an
  // update mixed new and old modules and failed on a missing export.
  if (path.includes('/emulator/') || (/\/[\w-]+\.js$/.test(path) && !path.includes('/assets/') && !path.endsWith('/sw.js'))) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        let response
        try { response = await fetch(req, { cache: 'no-cache' }) } catch { return (await cache.match(req)) || Response.error() }
        // A server error or an SPA fallback page (HTML for a script) must not replace a good
        // copy; a 404 still surfaces, since it means the deployment lacks the file.
        const type = response.headers.get('content-type') || ''
        if (response.ok && /javascript|css/.test(type)) {
          event.waitUntil(cache.put(req, response.clone()).catch(() => {}))
          return response
        }
        if (response.status >= 500 || (response.ok && type.includes('text/html'))) return (await cache.match(req)) || response
        return response
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
