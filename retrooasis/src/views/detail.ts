import {
  findGame,
  findPlatform,
  loadCatalog,
  platformAccentVar,
  refreshCatalogView,
} from '../lib/catalog'
import { resolveCoverUrl } from '../lib/covers'
import { coverMarkup, escapeAttr, escapeHtml } from '../lib/dom'
import { hrefFor } from '../lib/router'
import { launchGame } from '../lib/play'
import {
  clearOverride,
  exportOverridesJson,
  getOverride,
  setOverride,
} from '../lib/overrides'
import { sfxConfirm, sfxToggle } from '../lib/sfx'
import { getLibretroCovers, isFavorite, toggleFavorite } from '../lib/store'

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
  const cover = resolveCoverUrl(
    game.platform,
    game.title,
    game.cover,
    getLibretroCovers(),
  )
  let favorited = isFavorite(game.id)
  let busy = false
  let editing = false

  const paint = () => {
    const over = getOverride(game.id)
    root.innerHTML = `
      <section class="ro-view ro-detail">
        <div class="ro-detail__cover">
          ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), cover)}
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
            ${game.source === 'hosted' ? '<span class="ro-badge">Hosted</span>' : ''}
            ${over ? '<span class="ro-badge">Edited locally</span>' : ''}
          </div>
          <p class="ro-lede">
            Core <strong>${escapeHtml(game.core)}</strong>
            · File <code>${escapeHtml(game.file)}</code>
            ${game.year != null ? ` · ${escapeHtml(String(game.year))}` : ''}
            ${game.developer ? ` · ${escapeHtml(game.developer)}` : ''}
          </p>
          ${
            game.description
              ? `<p class="ro-lede">${escapeHtml(game.description)}</p>`
              : ''
          }
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
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-edit" data-ro-focusable="true">
              ${editing ? 'Close editor' : 'Edit metadata'}
            </button>
          </div>
          ${
            editing
              ? `
            <form class="ro-stack ro-meta-form" id="ro-meta-form">
              <label class="ro-muted">Title <input class="ro-input" name="title" value="${escapeAttr(over?.title ?? game.title)}" /></label>
              <label class="ro-muted">Year <input class="ro-input" name="year" value="${escapeAttr(String(over?.year ?? game.year ?? ''))}" /></label>
              <label class="ro-muted">Developer <input class="ro-input" name="developer" value="${escapeAttr(over?.developer ?? game.developer ?? '')}" /></label>
              <label class="ro-muted">Cover URL <input class="ro-input" name="cover" value="${escapeAttr(over?.cover ?? game.cover ?? '')}" /></label>
              <label class="ro-muted">Description <textarea class="ro-input" name="description" rows="3">${escapeHtml(over?.description ?? game.description ?? '')}</textarea></label>
              <div class="ro-btn-row">
                <button type="submit" class="ro-btn ro-btn--primary">Save locally</button>
                <button type="button" class="ro-btn ro-btn--ghost" id="ro-clear-over">Clear override</button>
                <button type="button" class="ro-btn ro-btn--ghost" id="ro-export-over">Export all</button>
              </div>
              <p class="ro-muted">Overrides stay in this browser. Export JSON to turn them into sidecars / manifest fields.</p>
            </form>`
              : ''
          }
        </div>
      </section>
    `

    root.querySelector('#ro-play')?.addEventListener('click', async () => {
      sfxConfirm()
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
      sfxToggle()
      favorited = toggleFavorite(game.id)
      paint()
    })

    root.querySelector('#ro-edit')?.addEventListener('click', () => {
      editing = !editing
      paint()
    })

    root.querySelector('#ro-meta-form')?.addEventListener('submit', (event) => {
      event.preventDefault()
      const form = event.target as HTMLFormElement
      const data = new FormData(form)
      setOverride(game.id, {
        title: String(data.get('title') || ''),
        year: String(data.get('year') || '') || undefined,
        developer: String(data.get('developer') || '') || undefined,
        cover: String(data.get('cover') || '') || undefined,
        description: String(data.get('description') || '') || undefined,
      })
      refreshCatalogView()
    })

    root.querySelector('#ro-clear-over')?.addEventListener('click', () => {
      clearOverride(game.id)
      refreshCatalogView()
    })

    root.querySelector('#ro-export-over')?.addEventListener('click', () => {
      const blob = new Blob([exportOverridesJson()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'retrooasis-overrides.json'
      a.click()
      URL.revokeObjectURL(url)
    })

    root.querySelector<HTMLElement>('#ro-play')?.focus()
  }

  paint()
}
