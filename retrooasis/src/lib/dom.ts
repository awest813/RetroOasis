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
          src="${escapeAttr(coverUrl)}"
          alt=""
          loading="lazy"
          onerror="this.style.display='none'; this.parentElement && this.parentElement.classList.add('ro-cover--missing')"
        />
        <span class="ro-cover__label ro-cover__label--fallback">${escapeHtml(title)}</span>
      </div>
    `
  }
  return `
    <div class="ro-cover" style="--cover-accent: ${accentVar}">
      <span class="ro-cover__label">${escapeHtml(title)}</span>
    </div>
  `
}
