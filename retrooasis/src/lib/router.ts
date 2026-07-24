export type VirtualCollection = 'recent' | 'favorites' | 'all'

export type Route =
  | { name: 'lobby' }
  | { name: 'library' }
  | { name: 'platform'; platformId: string }
  | { name: 'collection'; collection: VirtualCollection }
  | { name: 'game'; gameId: string }
  | { name: 'upload' }
  | { name: 'settings' }
  | { name: 'notfound' }

type Listener = (route: Route) => void

const listeners = new Set<Listener>()
const VIRTUAL = new Set<VirtualCollection>(['recent', 'favorites', 'all'])

function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  const parts = raw.split('/').filter(Boolean)

  if (parts.length === 0) return { name: 'lobby' }
  if (parts[0] === 'library' && parts.length === 1) return { name: 'library' }
  if (parts[0] === 'library' && parts[1]) {
    const id = decodeURIComponent(parts[1])
    if (id.startsWith('@')) {
      const collection = id.slice(1) as VirtualCollection
      if (VIRTUAL.has(collection)) return { name: 'collection', collection }
    }
    return { name: 'platform', platformId: id }
  }
  if (parts[0] === 'game' && parts[1]) return { name: 'game', gameId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'upload') return { name: 'upload' }
  if (parts[0] === 'settings') return { name: 'settings' }
  return { name: 'notfound' }
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

function emit(): void {
  const route = getRoute()
  for (const listener of listeners) listener(route)
}

export function startRouter(): void {
  window.addEventListener('hashchange', emit)
  if (!window.location.hash) {
    window.location.hash = '#/'
  } else {
    emit()
  }
}

export function routePath(route: Route): string {
  switch (route.name) {
    case 'lobby':
      return '#/'
    case 'library':
      return '#/library'
    case 'platform':
      return `#/library/${encodeURIComponent(route.platformId)}`
    case 'collection':
      return `#/library/@${route.collection}`
    case 'game':
      return `#/game/${encodeURIComponent(route.gameId)}`
    case 'upload':
      return '#/upload'
    case 'settings':
      return '#/settings'
    default:
      return '#/'
  }
}
