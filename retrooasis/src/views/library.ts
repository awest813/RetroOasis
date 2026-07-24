import {
  applyLocalScan,
  countByPlatform,
  findPlatform,
  gamesForPlatform,
  loadCatalog,
  platformAccentVar,
  type Catalog,
  type Game,
  type Platform,
} from '../lib/catalog'
import { coverMarkup, escapeAttr, escapeHtml } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { pickLocalLibrary, supportsDirectoryPicker } from '../lib/localLibrary'
import { hrefFor } from '../lib/router'
import { getFavorites } from '../lib/store'

export async function renderLibrary(
  root: HTMLElement,
  platformId?: string,
): Promise<void> {
  const catalog = await loadCatalog()
  const counts = countByPlatform(catalog)
  const canPick = supportsDirectoryPicker()

  const ordered = [...catalog.platforms].sort((a, b) => {
    const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })

  const selectedId =
    platformId && findPlatform(catalog, platformId)
      ? platformId
      : firstPlatformWithGames(ordered, counts) ?? ordered[0]?.id

  if (!platformId && selectedId) {
    // Land on a concrete system so the right pane always has context.
    window.location.replace(hrefFor(`/library/${selectedId}`))
    return
  }

  if (platformId && !findPlatform(catalog, platformId)) {
    root.innerHTML = `
      <section class="ro-view">
        <p class="ro-kicker">404</p>
        <h1 class="ro-title">System not found</h1>
        <p class="ro-lede"><a href="${hrefFor('/library')}">Back to library</a></p>
      </section>
    `
    return
  }

  const platform = selectedId ? findPlatform(catalog, selectedId) : undefined
  let query = ''
  let favoritesOnly = false
  let cleanup: (() => void) | undefined

  const paint = () => {
    cleanup?.()
    const games = selectedId
      ? gamesForPlatform(catalog, selectedId).filter((g) => {
          if (favoritesOnly && !getFavorites().includes(g.id)) return false
          if (!query) return true
          return g.title.toLowerCase().includes(query)
        })
      : []

    root.innerHTML = `
      <section class="ro-view ro-library">
        <aside class="ro-systems" aria-label="Systems">
          <div class="ro-systems__head">
            <p class="ro-kicker">Systems</p>
            <h1 class="ro-systems__title">Library</h1>
            <p class="ro-systems__meta">${libraryMeta(catalog)}</p>
          </div>
          <nav class="ro-systems__list" data-ro-systems>
            ${ordered
              .map((p) => systemRow(p, counts[p.id] ?? 0, p.id === selectedId))
              .join('')}
          </nav>
          <div class="ro-systems__actions">
            ${
              canPick
                ? `<button type="button" class="ro-btn" id="ro-link-folder" data-ro-focusable="true">Link folder</button>`
                : ''
            }
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Settings</a>
            <p class="ro-muted" id="ro-lib-status" hidden></p>
          </div>
        </aside>

        <div class="ro-gallery">
          <div class="ro-section-head">
            <div>
              <p class="ro-kicker">${escapeHtml(platform?.shortName ?? 'Library')}</p>
              <h2 class="ro-title">${escapeHtml(platform?.name ?? 'Select a system')}</h2>
              <p class="ro-lede">${games.length} game${games.length === 1 ? '' : 's'}</p>
            </div>
            <div class="ro-search">
              <input type="search" id="ro-q" placeholder="Search titles" value="${escapeAttr(query)}" ${selectedId ? '' : 'disabled'} />
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-fav" aria-pressed="${favoritesOnly}" ${selectedId ? '' : 'disabled'}>
                ${favoritesOnly ? 'Favorites' : 'All'}
              </button>
            </div>
          </div>
          ${
            !selectedId
              ? `<div class="ro-empty">Choose a system from the left panel.</div>`
              : games.length
                ? `<div class="ro-grid" data-ro-grid>${games
                    .map((g) => gameTile(g, platform?.accent ?? 'sega'))
                    .join('')}</div>`
                : `<div class="ro-empty">No games here yet. Link a folder, host <code>roms/manifest.json</code>, or add files under <code>roms/${escapeHtml(selectedId)}/</code>.</div>`
          }
        </div>
      </section>
    `

    bindLibraryChrome(root, () => {
      void renderLibrary(root, selectedId)
    })

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

    const systems = root.querySelector<HTMLElement>('[data-ro-systems]')
    const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
    if (systems) cleanup = bindGridFocus(systems)
    if (grid) {
      const gridCleanup = bindGridFocus(grid)
      const prev = cleanup
      cleanup = () => {
        prev?.()
        gridCleanup()
      }
    }
  }

  paint()
}

/** Kept for route compatibility — same left-rail library shell. */
export async function renderPlatform(
  root: HTMLElement,
  platformId: string,
): Promise<void> {
  return renderLibrary(root, platformId)
}

function bindLibraryChrome(root: HTMLElement, reload: () => void): void {
  const status = root.querySelector<HTMLElement>('#ro-lib-status')
  root.querySelector('#ro-link-folder')?.addEventListener('click', async () => {
    if (status) {
      status.hidden = false
      status.textContent = 'Scanning folder…'
    }
    try {
      const result = await pickLocalLibrary()
      await applyLocalScan(result)
      reload()
    } catch (err) {
      if (status) {
        status.hidden = false
        status.textContent = err instanceof Error ? err.message : 'Folder link cancelled.'
      }
    }
  })
}

function firstPlatformWithGames(
  platforms: Platform[],
  counts: Record<string, number>,
): string | undefined {
  return platforms.find((p) => (counts[p.id] ?? 0) > 0)?.id
}

function libraryMeta(catalog: Catalog): string {
  if (catalog.local) {
    return `${catalog.local.count} local · ${escapeHtml(catalog.local.folderName)}`
  }
  if (catalog.hostedCount) {
    return `${catalog.hostedCount} hosted`
  }
  return 'Demo catalog'
}

function systemRow(platform: Platform, count: number, active: boolean): string {
  return `
    <a
      class="ro-system${active ? ' ro-system--active' : ''}"
      href="${hrefFor(`/library/${platform.id}`)}"
      data-ro-focusable="true"
      ${active ? 'aria-current="page"' : ''}
      style="--cover-accent: ${platformAccentVar(platform.accent)}"
    >
      <span class="ro-system__glyph" aria-hidden="true">${escapeHtml(platform.shortName.slice(0, 3))}</span>
      <span class="ro-system__text">
        <span class="ro-system__name">${escapeHtml(platform.name)}</span>
        <span class="ro-system__count">${count}</span>
      </span>
    </a>
  `
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
