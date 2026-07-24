import {
  findGame,
  findPlatform,
  loadCatalog,
  platformAccentVar,
} from '../lib/catalog'
import { coverMarkup, escapeHtml } from '../lib/dom'
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
  let busy = false

  const paint = () => {
    root.innerHTML = `
      <section class="ro-view ro-detail">
        <div class="ro-detail__cover">
          ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), game.cover)}
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
            ${game.source === 'local' ? '<span class="ro-badge">Local folder</span>' : ''}
          </div>
          <p class="ro-lede">
            Core <strong>${escapeHtml(game.core)}</strong>
            · File <code>${escapeHtml(game.file)}</code>
          </p>
          ${
            game.demo
              ? `<p class="ro-muted">Sample entry for UI walkthrough. Link a ROM folder, point catalog <code>file</code> at a hosted ROM, or use Upload.</p>`
              : ''
          }
          <p class="ro-muted" id="ro-play-status" hidden></p>
          <div class="ro-btn-row ro-detail__actions">
            <button type="button" class="ro-btn ro-btn--primary" id="ro-play" data-ro-focusable="true"${busy ? ' disabled' : ''}>Play</button>
            <button type="button" class="ro-btn" id="ro-favorite" data-ro-focusable="true">
              ${favorited ? 'Unfavorite' : 'Favorite'}
            </button>
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/upload')}">Upload ROM</a>
          </div>
        </div>
      </section>
    `

    root.querySelector('#ro-play')?.addEventListener('click', async () => {
      busy = true
      paint()
      try {
        await launchGame(game)
      } catch (err) {
        busy = false
        paint()
        const el = root.querySelector<HTMLElement>('#ro-play-status')
        if (el) {
          el.hidden = false
          el.textContent = err instanceof Error ? err.message : 'Could not launch game.'
        }
      }
    })

    root.querySelector('#ro-favorite')?.addEventListener('click', () => {
      favorited = toggleFavorite(game.id)
      paint()
    })

    root.querySelector<HTMLElement>('#ro-play')?.focus()
  }

  paint()
}
