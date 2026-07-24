import {
  loadCatalog,
  findGame,
  findPlatform,
  platformAccentVar,
} from '../lib/catalog'
import { hrefFor } from '../lib/router'
import { launchGame } from '../lib/play'
import { isFavorite, toggleFavorite } from '../lib/store'

export async function renderGameDetail(root: HTMLElement, gameId: string): Promise<void> {
  const catalog = await loadCatalog()
  const game = findGame(catalog, gameId)

  if (!game) {
    root.innerHTML = `
      <section class="ro-view">
        <p class="ro-kicker">404</p>
        <h1 class="ro-title">Game not found</h1>
        <p class="ro-lede"><a href="${hrefFor('/library')}">Back to library</a></p>
      </section>
    `
    return
  }

  const platform = findPlatform(catalog, game.platform)
  let favorited = isFavorite(game.id)

  const paint = () => {
    root.innerHTML = `
      <section class="ro-view ro-detail">
        <div class="ro-detail__cover">
          <div class="ro-cover" style="--cover-accent: ${platformAccentVar(platform?.accent ?? 'sega')}">
            <span class="ro-cover__label">${escapeHtml(game.title)}</span>
          </div>
        </div>
        <div class="ro-stack">
          <p class="ro-kicker">
            <a href="${hrefFor('/library')}">Library</a>
            ${platform ? `/ <a href="${hrefFor(`/library/${platform.id}`)}">${escapeHtml(platform.shortName)}</a>` : ''}
          </p>
          <h1 class="ro-title">${escapeHtml(game.title)}</h1>
          <div>
            <span class="ro-badge">${escapeHtml(platform?.name ?? game.platform)}</span>
            ${game.demo ? '<span class="ro-badge">Demo catalog</span>' : ''}
          </div>
          <p class="ro-lede">
            Core <strong>${escapeHtml(game.core)}</strong>
            · File <code>${escapeHtml(game.file)}</code>
          </p>
          ${
            game.demo
              ? `<p class="ro-muted">Sample entry for UI walkthrough. Point <code>file</code> at a ROM you host (or use Upload) to play for real.</p>`
              : ''
          }
          <div class="ro-btn-row ro-detail__actions">
            <button type="button" class="ro-btn ro-btn--primary" id="ro-play" data-ro-focusable="true">Play</button>
            <button type="button" class="ro-btn" id="ro-favorite" data-ro-focusable="true">
              ${favorited ? 'Unfavorite' : 'Favorite'}
            </button>
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/upload')}">Upload ROM</a>
          </div>
        </div>
      </section>
    `

    root.querySelector('#ro-play')?.addEventListener('click', () => {
      launchGame(game)
    })

    root.querySelector('#ro-favorite')?.addEventListener('click', () => {
      favorited = toggleFavorite(game.id)
      paint()
    })

    root.querySelector<HTMLElement>('#ro-play')?.focus()
  }

  paint()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
