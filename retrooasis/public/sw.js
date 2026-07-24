/* RetroOasis app-shell service worker.
 * Caches SPA chrome + catalog. Leaves /data/ and /roms/ on the network. */

const CACHE = 'retrooasis-shell-v1'

const PRECACHE = [
  './',
  './index.html',
  './player.html',
  './manifest.webmanifest',
  './favicon.svg',
  './catalog/platforms.json',
  './catalog/games.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const path = url.pathname
  if (path.includes('/data/') || path.includes('/roms/')) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true })
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (req.destination === 'document' || req.destination === 'script' || req.destination === 'style' || req.destination === 'manifest' || path.includes('/catalog/') || path.endsWith('.svg'))) {
            void cache.put(req, res.clone())
          }
          return res
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
