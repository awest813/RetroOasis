import {
  findGame,
  findPlatform,
  loadCatalog,
  platformAccentVar,
  refreshCatalogView,
  reloadUploadedLibrary,
} from '../lib/catalog'
import { coreNeedsThreads, normalizePlayCore } from '../lib/cores'
import { resolveCoverUrl } from '../lib/covers'
import { coverMarkup, escapeAttr, escapeHtml, hydrateCovers } from '../lib/dom'
import { hrefFor, navigate } from '../lib/router'
import { launchGame } from '../lib/play'
import {
  clearOverride,
  exportOverridesJson,
  getOverride,
  setOverride,
} from '../lib/overrides'
import { sfxConfirm, sfxToggle } from '../lib/sfx'
import { forgetGameId, getLibretroCovers, isFavorite, toggleFavorite } from '../lib/store'
import { getUploadedRomRecord, removeUploadedRom } from '../lib/uploadedLibrary'
import { friendlyError } from '../lib/userErrors'
import { bindGridFocus } from '../lib/focus'
import { registerViewCleanup } from '../lib/viewLifecycle'

export async function renderGameDetail(root: HTMLElement, gameId: string): Promise<void> {
  const catalog = await loadCatalog()
  const game = findGame(catalog, gameId)

  if (!game) {
    root.innerHTML = `
      <section class="ro-view">
        <div class="ro-empty">
          <p class="ro-empty__title">Game not found</p>
          <p class="ro-empty__body">That title isn’t on this shelf anymore.</p>
          <div class="ro-btn-row ro-btn-row--center">
            <a class="ro-btn" href="${hrefFor('/')}">Home</a>
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}">Library</a>
          </div>
        </div>
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
  let focusCleanup: (() => void) | null = null
  let fileLabel = game.file
  if (game.source === 'upload') {
    const record = await getUploadedRomRecord(game.id)
    const name = record?.filename || 'Saved on this device'
    fileLabel = name.replace(/\.[^.]+$/, '') || name
  }

  const paint = () => {
    focusCleanup?.()
    focusCleanup = null
    const over = getOverride(game.id)
    const playCore = normalizePlayCore(game.core)
    const threadBadge = coreNeedsThreads(playCore)
      ? '<span class="ro-badge">Threads</span>'
      : ''
    root.innerHTML = `
      <section class="ro-view ro-detail">
        <div class="ro-detail__cover">
          ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), cover)}
        </div>
        <div class="ro-stack">
          <p class="ro-kicker">
            <a href="${hrefFor('/')}">Home</a>
            <span aria-hidden="true"> / </span>
            <a href="${hrefFor('/library')}">Library</a>
            ${
              platform
                ? `<span aria-hidden="true"> / </span><a href="${hrefFor(`/library/${platform.id}`)}">${escapeHtml(platform.shortName)}</a>`
                : ''
            }
          </p>
          <h1 class="ro-title">${escapeHtml(game.title)}</h1>
          <div class="ro-detail__badges">
            <span class="ro-badge">${escapeHtml(platform?.shortName ?? game.platform)}</span>
            ${game.source === 'local' ? '<span class="ro-badge">Local folder</span>' : ''}
            ${game.source === 'hosted' ? '<span class="ro-badge">Hosted</span>' : ''}
            ${game.source === 'upload' ? '<span class="ro-badge ro-badge--saved">Saved</span>' : ''}
            ${game.demo ? '<span class="ro-badge">Sample</span>' : ''}
            ${over ? '<span class="ro-badge">Edited locally</span>' : ''}
            ${threadBadge}
          </div>
          <p class="ro-lede">
            Core <strong>${escapeHtml(playCore)}</strong>
            · File <code>${escapeHtml(fileLabel)}</code>
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
              ? `<p class="ro-muted">This is a sample shelf entry for browsing the UI — the demo ROM file isn’t included. Use <a href="${hrefFor('/upload')}">Add ROM</a> or Library → Link folder to play a real game.</p>`
              : ''
          }
          ${
            game.source === 'upload'
              ? `<p class="ro-muted">Saved on this device. Clearing this site’s browser data will remove it too.</p>`
              : ''
          }
          <p class="ro-muted" id="ro-play-status" role="status" aria-live="polite" hidden></p>
          <div class="ro-btn-row ro-detail__actions"${busy ? ' aria-busy="true"' : ''}>
            ${
              game.demo
                ? `<a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-play" data-ro-focusable="true"${busy ? ' disabled' : ''} title="Opens the player to show the missing-ROM error for this sample entry">See missing-ROM message</button>`
                : `<button type="button" class="ro-btn ro-btn--primary" id="ro-play" data-ro-focusable="true"${busy ? ' disabled' : ''}>${busy ? 'Starting…' : 'Play'}</button>`
            }
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-favorite" data-ro-focusable="true" aria-pressed="${favorited}">
              ${favorited ? '★ Favorited' : 'Favorite'}
            </button>
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-edit" data-ro-focusable="true">
              ${editing ? 'Close editor' : 'Edit metadata'}
            </button>
            ${
              game.source === 'upload'
                ? `<button type="button" class="ro-btn ro-btn--danger" id="ro-remove-upload" data-ro-focusable="true">Remove</button>`
                : ''
            }
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
              <p class="ro-muted">Edits stay on this device. Export JSON if you want to reuse them as sidecars or manifest fields.</p>
            </form>`
              : ''
          }
        </div>
      </section>
    `

    hydrateCovers(root)

    root.querySelector('#ro-play')?.addEventListener('click', async () => {
      sfxConfirm()
      busy = true
      paint()
      const status = root.querySelector<HTMLElement>('#ro-play-status')
      if (status && !game.demo) {
        status.hidden = false
        status.textContent = 'Starting emulator…'
      }
      try {
        await launchGame(game)
      } catch (err) {
        busy = false
        paint()
        const el = root.querySelector<HTMLElement>('#ro-play-status')
        if (el) {
          el.hidden = false
          el.textContent = friendlyError(err, 'Couldn’t start that game. Try again.')
        }
      }
    })

    root.querySelector('#ro-favorite')?.addEventListener('click', () => {
      sfxToggle()
      favorited = toggleFavorite(game.id)
      paint()
    })

    root.querySelector('#ro-remove-upload')?.addEventListener('click', async () => {
      if (!window.confirm(`Remove “${game.title}” from your library on this device?`)) return
      try {
        await removeUploadedRom(game.id)
        forgetGameId(game.id)
        await reloadUploadedLibrary()
        navigate('/library')
      } catch (err) {
        const el = root.querySelector<HTMLElement>('#ro-play-status')
        if (el) {
          el.hidden = false
          el.textContent = friendlyError(err, 'Couldn’t remove that ROM. Try again.')
        }
      }
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

    const actions = root.querySelector<HTMLElement>('.ro-detail__actions')
    if (actions) {
      focusCleanup = bindGridFocus(actions)
      registerViewCleanup(() => {
        focusCleanup?.()
        focusCleanup = null
      })
    } else {
      registerViewCleanup(null)
    }
    root.querySelector<HTMLElement>('#ro-play')?.focus()
  }

  paint()
}
