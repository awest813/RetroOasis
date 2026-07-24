import {
  loadCatalog,
  findPlatform,
  gamesForPlatform,
  platformAccentVar,
  type Game,
} from '../lib/catalog'
import { hrefFor } from '../lib/router'
import { bindGridFocus } from '../lib/focus'
import { getFavorites } from '../lib/store'

export async function renderPlatform(
  root: HTMLElement,
  platformId: string,
): Promise<void> {
  const catalog = await loadCatalog()
  const platform = findPlatform(catalog, platformId)

  if (!platform) {
    root.innerHTML = `
      <section class="ro-view">
        <p class="ro-kicker">404</p>
        <h1 class="ro-title">System not found</h1>
        <p class="ro-lede"><a href="${hrefFor('/library')}">Back to library</a></p>
      </section>
    `
    return
  }

  let games = gamesForPlatform(catalog, platformId)
  let query = ''
  let favoritesOnly = false

  const paint = () => {
    const filtered = games.filter((g) => {
      if (favoritesOnly && !getFavorites().includes(g.id)) return false
      if (!query) return true
      return g.title.toLowerCase().includes(query)
    })

    root.innerHTML = `
      <section class="ro-view">
        <div class="ro-section-head">
          <div>
            <p class="ro-kicker"><a href="${hrefFor('/library')}">Library</a> / ${escapeHtml(platform.shortName)}</p>
            <h1 class="ro-title">${escapeHtml(platform.name)}</h1>
            <p class="ro-lede">${filtered.length} game${filtered.length === 1 ? '' : 's'}</p>
          </div>
          <div class="ro-search">
            <input type="search" id="ro-q" placeholder="Search titles" value="${escapeAttr(query)}" />
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-fav" aria-pressed="${favoritesOnly}">
              ${favoritesOnly ? 'Favorites' : 'All'}
            </button>
          </div>
        </div>
        ${
          filtered.length
            ? `<div class="ro-grid" data-ro-grid>${filtered.map((g) => gameTile(g, platform.accent)).join('')}</div>`
            : `<div class="ro-empty">No games match. Add files under <code>roms/${escapeHtml(platformId)}/</code> and update the catalog JSON.</div>`
        }
      </section>
    `

    const input = root.querySelector<HTMLInputElement>('#ro-q')
    input?.addEventListener('input', () => {
      query = input.value.trim().toLowerCase()
      paint()
      root.querySelector<HTMLInputElement>('#ro-q')?.focus()
    })

    root.querySelector('#ro-fav')?.addEventListener('click', () => {
      favoritesOnly = !favoritesOnly
      paint()
    })

    const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
    if (grid) bindGridFocus(grid)
  }

  // keep reference stable for filter closure
  games = gamesForPlatform(catalog, platformId)
  paint()
}

function gameTile(game: Game, accent: string): string {
  return `
    <a
      class="ro-tile"
      href="${hrefFor(`/game/${game.id}`)}"
      data-ro-focusable="true"
      style="--cover-accent: ${platformAccentVar(accent)}"
    >
      <div class="ro-cover">
        <span class="ro-cover__label">${escapeHtml(game.title)}</span>
      </div>
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(game.title)}</span>
        <span class="ro-tile__sub">${game.demo ? 'Demo entry' : 'Ready'}</span>
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

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}
