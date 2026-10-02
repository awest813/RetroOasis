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

export function coverMarkup(
  title: string,
  accentVar: string,
  coverUrl: string | readonly string[] | null | undefined,
): string {
  const candidates = [...new Set((typeof coverUrl === 'string' ? [coverUrl] : [...(coverUrl ?? [])]).map((url) => url.trim()).filter(Boolean))]
  const key = JSON.stringify(candidates)
  const remembered = loadedCovers.get(key)
  if (remembered && candidates.includes(remembered)) {
    candidates.splice(candidates.indexOf(remembered), 1)
    candidates.unshift(remembered)
  }
  if (candidates.length) {
    return `
      <div class="ro-cover ro-cover--image" style="--cover-accent: ${accentVar}">
        <img
          class="ro-cover__img"
          src="${escapeAttr(candidates[0])}"
          data-cover-candidates="${escapeAttr(JSON.stringify(candidates))}"
          data-cover-key="${escapeAttr(key)}"
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

function markCoverReady(img: HTMLImageElement): void {
  const parent = img.parentElement
  if (!parent || parent.classList.contains('ro-cover--missing')) return
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
      if (img.dataset.coverKey && candidates[attempt]) {
        // Bound session memory for very large libraries.
        if (loadedCovers.size >= 1000) loadedCovers.delete(loadedCovers.keys().next().value!)
        loadedCovers.set(img.dataset.coverKey, candidates[attempt])
      }
      finish()
    }
    const onError = () => {
      // A removed grid/detail view should not launch its remaining guesses.
      if (!img.isConnected) {
        finish()
        return
      }
      attempt++
      if (attempt < candidates.length) {
        img.src = candidates[attempt]
      } else {
        if (img.dataset.coverKey) loadedCovers.delete(img.dataset.coverKey)
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
