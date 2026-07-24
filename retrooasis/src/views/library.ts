import {
  loadCatalog,
  countByPlatform,
  platformAccentVar,
  type Platform,
} from '../lib/catalog'
import { hrefFor } from '../lib/router'
import { bindGridFocus } from '../lib/focus'

export async function renderLibrary(root: HTMLElement): Promise<void> {
  const catalog = await loadCatalog()
  const counts = countByPlatform(catalog)

  root.innerHTML = `
    <section class="ro-view">
      <div class="ro-section-head">
        <div>
          <p class="ro-kicker">Library</p>
          <h1 class="ro-title">Systems</h1>
          <p class="ro-lede">Pick a cabinet. Sample catalog ships with demos — drop real ROMs under <code>roms/</code> when you host.</p>
        </div>
      </div>
      <div class="ro-grid ro-grid--platforms" data-ro-grid>
        ${catalog.platforms.map((p) => platformTile(p, counts[p.id] ?? 0)).join('')}
      </div>
    </section>
  `

  const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
  if (grid) bindGridFocus(grid)
}

function platformTile(platform: Platform, count: number): string {
  return `
    <a
      class="ro-tile"
      href="${hrefFor(`/library/${platform.id}`)}"
      data-ro-focusable="true"
      style="--cover-accent: ${platformAccentVar(platform.accent)}"
    >
      <div class="ro-cover">
        <span class="ro-cover__label">${escapeHtml(platform.shortName)}</span>
      </div>
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(platform.name)}</span>
        <span class="ro-tile__sub">${count} title${count === 1 ? '' : 's'}</span>
      </div>
    </a>
  `
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
