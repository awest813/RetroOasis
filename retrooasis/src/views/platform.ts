import {
  findPlatform,
  gamesForPlatform,
  loadCatalog,
  platformAccentVar,
  type Game,
} from '../lib/catalog'
import { coverMarkup, escapeAttr, escapeHtml } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { hrefFor } from '../lib/router'
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

  let query = ''
  let favoritesOnly = false
  let cleanup: (() => void) | undefined

  const paint = () => {
    cleanup?.()
    const games = gamesForPlatform(catalog, platformId).filter((g) => {
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
            <p class="ro-lede">${games.length} game${games.length === 1 ? '' : 's'}</p>
          </div>
          <div class="ro-search">
            <input type="search" id="ro-q" placeholder="Search titles" value="${escapeAttr(query)}" />
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-fav" aria-pressed="${favoritesOnly}">
              ${favoritesOnly ? 'Favorites' : 'All'}
            </button>
          </div>
        </div>
        ${
          games.length
            ? `<div class="ro-grid" data-ro-grid>${games.map((g) => gameTile(g, platform.accent)).join('')}</div>`
            : `<div class="ro-empty">No games match. Link a folder from the library, or add files under <code>roms/${escapeHtml(platformId)}/</code>.</div>`
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
    if (grid) cleanup = bindGridFocus(grid)
  }

  paint()
}

function gameTile(game: Game, accent: string): string {
  const sub =
    game.source === 'local'
      ? 'Local'
      : game.source === 'hosted'
        ? 'Hosted'
        : game.demo
          ? 'Demo entry'
          : 'Catalog'
  return `
    <a
      class="ro-tile"
      href="${hrefFor(`/game/${game.id}`)}"
      data-ro-focusable="true"
    >
      ${coverMarkup(game.title, platformAccentVar(accent), game.cover)}
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(game.title)}</span>
        <span class="ro-tile__sub">${sub}</span>
      </div>
    </a>
  `
}
