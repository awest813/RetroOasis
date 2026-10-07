export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

// Reuse successful matches when switching between the library, home and detail.
const loadedCovers = new Map<string, string>()
const hydratedCovers = new WeakSet<HTMLImageElement>()
let coverRefreshVersion = 0

// Match results also persist across visits and reloads: a hit is tried first,
// and a miss skips its whole run of guesses (up to 36 requests) for a while.
const MATCH_STORE = 'retrooasis.coverMatches'
const HIT_TTL = 30 * 24 * 3600 * 1000
const MISS_TTL = 7 * 24 * 3600 * 1000
const MAX_MATCHES = 2000
type StoredMatch = { u: string | null; t: number }
let storedMatches: Record<string, StoredMatch> | null = null
// An <img> error can't tell a 404 from being offline. Persist a miss only when every
// host it tried has served a cover this session, so a blocked host or lost Wi-Fi
// (even with same-site art still loading) isn't remembered as missing art.
const reachedCoverHosts = new Set<string>()
const coverHost = (url: string): string | null => {
  try { return new URL(url, window.location.href).host } catch { return null }
}

function matchStore(): Record<string, StoredMatch> {
  if (storedMatches) return storedMatches
  try { storedMatches = JSON.parse(localStorage.getItem(MATCH_STORE) ?? '{}') ?? {} } catch { storedMatches = {} }
  return storedMatches!
}
function saveMatches(): void {
  const store = matchStore()
  const keys = Object.keys(store)
  if (keys.length > MAX_MATCHES) {
    keys.sort((a, b) => store[a].t - store[b].t).slice(0, keys.length - MAX_MATCHES).forEach((key) => delete store[key])
  }
  try { localStorage.setItem(MATCH_STORE, JSON.stringify(store)) } catch { /* Storage full or unavailable: session memory still works. */ }
}
/** Short, stable id for a candidate list (FNV-1a), so stored keys stay small. */
function matchId(key: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193)
  return `${(hash >>> 0).toString(36)}.${key.length.toString(36)}`
}
function storedMatch(key: string): StoredMatch | null {
  const match = matchStore()[matchId(key)]
  if (!match || Date.now() - match.t > (match.u ? HIT_TTL : MISS_TTL)) return null
  return match
}
function rememberMatch(key: string, url: string | null): void {
  matchStore()[matchId(key)] = { u: url, t: Date.now() }
  saveMatches()
}

/** Forget learned matches and request fresh HTTP artwork on subsequent views. */
export function refreshCoverArt(): void {
  loadedCovers.clear()
  storedMatches = {}
  try { localStorage.removeItem(MATCH_STORE) } catch { /* nothing stored */ }
  coverRefreshVersion = Math.max(Date.now(), coverRefreshVersion + 1)
}

function coverRequestUrl(value: string, version = coverRefreshVersion): string {
  if (!version || typeof document === 'undefined') return value
  try {
    const url = new URL(value, document.baseURI)
    if (!['http:', 'https:'].includes(url.protocol)) return value
    const libretro = url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/libretro-thumbnails/')
    // Preserve query-bearing custom URLs, which may be signed by their host.
    if (url.search && !libretro) return value
    url.searchParams.set('_ro_cover_refresh', String(version))
    return url.href
  } catch {
    return value
  }
}

export function coverMarkup(
  title: string,
  accentVar: string,
  coverUrl: string | readonly string[] | null | undefined,
): string {
  const candidates = [...new Set((typeof coverUrl === 'string' ? [coverUrl] : [...(coverUrl ?? [])]).map((url) => url.trim()).filter(Boolean))]
  const key = JSON.stringify(candidates)
  const stored = candidates.length ? storedMatch(key) : null
  // A recent miss: show the placeholder without repeating every guess.
  if (stored && stored.u === null && !loadedCovers.has(key)) candidates.length = 0
  const remembered = loadedCovers.get(key) ?? stored?.u ?? undefined
  if (remembered && candidates.includes(remembered)) {
    candidates.splice(candidates.indexOf(remembered), 1)
    candidates.unshift(remembered)
  }
  if (candidates.length) {
    return `
      <div class="ro-cover ro-cover--image" style="--cover-accent: ${accentVar}">
        <img
          class="ro-cover__img"
          src="${escapeAttr(coverRequestUrl(candidates[0]))}"
          data-cover-candidates="${escapeAttr(JSON.stringify(candidates))}"
          data-cover-key="${escapeAttr(key)}"
          data-cover-version="${coverRefreshVersion}"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span class="ro-cover__mark" aria-hidden="true"></span>
        <span class="ro-cover__label ro-cover__label--fallback">${escapeHtml(title)}</span>
      </div>
    `
  }
  return `
    <div class="ro-cover" style="--cover-accent: ${accentVar}">
      <span class="ro-cover__mark" aria-hidden="true"></span>
      <span class="ro-cover__label">${escapeHtml(title)}</span>
    </div>
  `
}

/**
 * Blurred fill around contained box art, drawn from the image that already
 * loaded: a CSS background of the same URL would fetch it a second time.
 * Drawing cross-origin art only taints the canvas; nothing reads it back.
 */
function paintCoverBackdrop(parent: HTMLElement, img: HTMLImageElement): void {
  if (parent.querySelector('.ro-cover__backdrop')) return
  try {
    const canvas = document.createElement('canvas')
    canvas.className = 'ro-cover__backdrop'
    canvas.width = 24
    canvas.height = 32
    canvas.setAttribute('aria-hidden', 'true')
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    parent.prepend(canvas)
  } catch { /* The accent placeholder stays behind the art. */ }
}

function markCoverReady(img: HTMLImageElement): void {
  const parent = img.parentElement
  if (!parent || parent.classList.contains('ro-cover--missing')) return
  paintCoverBackdrop(parent, img)
  parent.classList.add('ro-cover--ready')
}

function markCoverMissing(img: HTMLImageElement): void {
  const parent = img.parentElement
  if (!parent) return
  img.style.display = 'none'
  parent.classList.add('ro-cover--missing')
  parent.classList.remove('ro-cover--ready')
}

/**
 * Bind load/error for covers after innerHTML inject.
 * Bind once, including cached images that completed before hydration.
 * Keep the placeholder visible until an attempt succeeds or all attempts fail.
 */
export function hydrateCovers(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('.ro-cover--image img').forEach((img) => {
    const parent = img.parentElement
    if (!parent) return
    if (hydratedCovers.has(img)) return
    hydratedCovers.add(img)
    if (parent.classList.contains('ro-cover--ready') || parent.classList.contains('ro-cover--missing')) {
      return
    }

    let candidates: string[] = []
    try {
      const parsed: unknown = JSON.parse(img.dataset.coverCandidates ?? '[]')
      if (Array.isArray(parsed)) candidates = parsed.filter((url): url is string => typeof url === 'string')
    } catch { /* Older markup may have just one source. */ }
    let attempt = 0
    // Markup can be injected before refresh and hydrated afterwards.
    const requestVersion = Number(img.dataset.coverVersion ?? coverRefreshVersion)
    const finish = () => {
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
    }
    const onLoad = () => {
      if (img.naturalWidth === 0) {
        onError()
        return
      }
      markCoverReady(img)
      const host = candidates[attempt] ? coverHost(candidates[attempt]) : null
      if (host) reachedCoverHosts.add(host)
      if (requestVersion === coverRefreshVersion && img.isConnected && img.dataset.coverKey && candidates[attempt]) {
        // Bound session memory for very large libraries.
        if (loadedCovers.size >= 1000) loadedCovers.delete(loadedCovers.keys().next().value!)
        loadedCovers.set(img.dataset.coverKey, candidates[attempt])
        if (storedMatch(img.dataset.coverKey)?.u !== candidates[attempt]) rememberMatch(img.dataset.coverKey, candidates[attempt])
      }
      finish()
    }
    const onError = () => {
      // A removed grid/detail view should not launch its remaining guesses.
      if (!img.isConnected) {
        finish()
        return
      }
      // A stale view must not start new guesses or erase a fresh learned match.
      if (requestVersion !== coverRefreshVersion) {
        markCoverMissing(img)
        finish()
        return
      }
      attempt++
      if (attempt < candidates.length) {
        img.src = coverRequestUrl(candidates[attempt], requestVersion)
      } else {
        if (img.dataset.coverKey) {
          loadedCovers.delete(img.dataset.coverKey)
          const hostsReached = candidates.length > 0 && candidates.every((url) => reachedCoverHosts.has(coverHost(url) ?? ''))
          if (hostsReached && navigator.onLine !== false) rememberMatch(img.dataset.coverKey, null)
        }
        markCoverMissing(img)
        finish()
      }
    }

    img.addEventListener('load', onLoad)
    img.addEventListener('error', onError)

    if (img.complete) {
      if (img.naturalWidth > 0) onLoad()
      else onError()
    }
  })
}
