export type VirtualCollection = 'recent' | 'favorites' | 'all'

export type Route =
  | { name: 'lobby' }
  | { name: 'library' }
  | { name: 'platform'; platformId: string }
  | { name: 'collection'; collection: VirtualCollection }
  | { name: 'tag'; tagId: string }
  | { name: 'game'; gameId: string }
  | { name: 'upload' }
  | { name: 'settings' }
  | { name: 'saves' }
  | { name: 'notfound' }

type Listener = (route: Route) => void

const listeners = new Set<Listener>()
const VIRTUAL = new Set<VirtualCollection>(['recent', 'favorites', 'all'])

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  const parts = raw.split('/').filter(Boolean)

  if (parts.length === 0) return { name: 'lobby' }
  // Bare #/library is the All-games shelf (same as #/library/@all).
  if (parts[0] === 'library' && parts.length === 1) {
    return { name: 'collection', collection: 'all' }
  }
  if (parts[0] === 'library' && parts[1] === 'tag') {
    if (parts[2]) return { name: 'tag', tagId: decodeURIComponent(parts[2]) }
    return { name: 'notfound' }
  }
  if (parts[0] === 'library' && parts.length === 2 && parts[1]) {
    const id = decodeURIComponent(parts[1])
    if (id.startsWith('@')) {
      const collection = id.slice(1) as VirtualCollection
      if (VIRTUAL.has(collection)) return { name: 'collection', collection }
      return { name: 'notfound' }
    }
    return { name: 'platform', platformId: id }
  }
  if (parts[0] === 'game' && parts.length === 2 && parts[1]) {
    return { name: 'game', gameId: decodeURIComponent(parts[1]) }
  }
  if (parts[0] === 'upload' && parts.length === 1) return { name: 'upload' }
  if (parts[0] === 'settings' && parts.length === 1) return { name: 'settings' }
  if (parts[0] === 'saves' && parts.length === 1) return { name: 'saves' }
  return { name: 'notfound' }
}

/** Parse a location hash into a route. Exported for tests. */
export function parseRouteHash(hash: string): Route {
  return parseHash(hash)
}

export function getRoute(): Route {
  return parseHash(window.location.hash || '#/')
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`
  if (window.location.hash === next) {
    emit()
    return
  }
  window.location.hash = next
}

export function hrefFor(path: string): string {
  return path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`
}

export function onRoute(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Where Back goes when there is no in-app history entry to return to. */
export function parentHash(route: Route): string | null {
  switch (route.name) {
    case 'lobby': return null
    case 'game':
    case 'platform':
    case 'tag': return '#/library'
    case 'collection': return route.collection === 'all' ? '#/' : '#/library'
    default: return '#/'
  }
}

// How many in-app entries precede the current one. Stored in history.state so it
// survives reloads and back/forward; a bookmark or shared link starts at 0.
let depth = 0
let replacing = false
function trackDepth(): void {
  const stored = (history.state as { roDepth?: unknown } | null)?.roDepth
  if (typeof stored === 'number') depth = stored
  else {
    // A replaced entry (Back to a parent route) keeps its depth; a new one adds to it.
    if (!replacing) depth += 1
    history.replaceState({ ...(history.state ?? {}), roDepth: depth }, '')
  }
  replacing = false
}

/** Escape / controller B: step back inside RetroOasis, never out to another site or a blank tab. */
export function goBackInApp(): boolean {
  if (depth > 0) { history.back(); return true }
  const parent = parentHash(getRoute())
  if (!parent) return false
  replacing = true
  window.location.replace(parent)
  return true
}

function emit(): void {
  const route = getRoute()
  for (const listener of listeners) listener(route)
}

export function startRouter(): void {
  window.addEventListener('hashchange', () => { trackDepth(); emit() })
  const stored = (history.state as { roDepth?: unknown } | null)?.roDepth
  depth = typeof stored === 'number' ? stored : 0
  if (typeof stored !== 'number') history.replaceState({ ...(history.state ?? {}), roDepth: 0 }, '')
  if (!window.location.hash) {
    // Replace, so the bare URL doesn't become an extra entry for Back to land on.
    window.location.replace('#/')
  } else {
    emit()
  }
}
