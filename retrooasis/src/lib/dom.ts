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

export function coverMarkup(
  title: string,
  accentVar: string,
  coverUrl: string | null | undefined,
): string {
  if (coverUrl) {
    return `
      <div class="ro-cover ro-cover--image" style="--cover-accent: ${accentVar}">
        <img
          class="ro-cover__img"
          src="${escapeAttr(coverUrl)}"
          alt=""
          loading="lazy"
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
 * Inline onload/onerror attributes are not executed for innerHTML inserts.
 */
export function hydrateCovers(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('.ro-cover--image img').forEach((img) => {
    const parent = img.parentElement
    if (!parent) return
    if (parent.classList.contains('ro-cover--ready') || parent.classList.contains('ro-cover--missing')) {
      return
    }

    if (img.complete) {
      if (img.naturalWidth > 0) markCoverReady(img)
      else markCoverMissing(img)
      return
    }

    img.addEventListener('load', () => markCoverReady(img), { once: true })
    img.addEventListener('error', () => markCoverMissing(img), { once: true })
  })
}
