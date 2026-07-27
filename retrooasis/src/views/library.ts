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
import { resolveCoverUrl } from '../lib/covers'
import { coverMarkup, escapeAttr, escapeHtml, hydrateCovers } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { registerViewCleanup } from '../lib/viewLifecycle'
import { pickLocalLibrary, supportsDirectoryPicker } from '../lib/localLibrary'
import { hrefFor, type VirtualCollection } from '../lib/router'
import { getFavorites, getLibretroCovers, getRecents, toggleFavorite } from '../lib/store'
import { sfxToggle } from '../lib/sfx'
import { friendlyError } from '../lib/userErrors'

export type LibrarySelection =
  | { kind: 'platform'; id: string }
  | { kind: 'collection'; id: VirtualCollection }

export async function renderLibrary(
  root: HTMLElement,
  selection?: LibrarySelection | string,
): Promise<void> {
  const catalog = await loadCatalog()
  const counts = countByPlatform(catalog)
  const canPick = supportsDirectoryPicker()
  const useLibretro = getLibretroCovers()
  let favorites = getFavorites()
  const recents = getRecents()

  // Match Home: only list systems that currently have titles.
  const ordered = [...catalog.platforms]
    .filter((p) => (counts[p.id] ?? 0) > 0)
    .sort((a, b) => {
      const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })

  const sel = normalizeSelection(selection)

  if (sel.kind === 'platform' && !findPlatform(catalog, sel.id)) {
    root.innerHTML = `
      <section class="ro-view">
        <div class="ro-empty">
          <p class="ro-empty__title">System not found</p>
          <p class="ro-empty__body">That platform isn’t in your catalog.</p>
          <a class="ro-btn ro-btn--primary" href="${hrefFor('/library')}" data-ro-focusable="true">Back to library</a>
        </div>
      </section>
    `
    const empty = root.querySelector<HTMLElement>('.ro-empty')
    if (empty) registerViewCleanup(bindGridFocus(empty))
    root.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
    return
  }

  const platform = sel.kind === 'platform' ? findPlatform(catalog, sel.id) : undefined
  let query = ''
  let queryRaw = ''
  let sortDesc = false
  let cleanup: (() => void) | undefined
  let searchTimer = 0
  const isRecent = sel.kind === 'collection' && sel.id === 'recent'

  const paint = (opts?: { restoreSearch?: boolean; restoreFavId?: string }) => {
    cleanup?.()
    favorites = getFavorites()
    let games = selectGames(catalog, sel, favorites, recents)
    games = games.filter((g) => !query || g.title.toLowerCase().includes(query))
    if (!isRecent) {
      games = [...games].sort((a, b) =>
        sortDesc ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title),
      )
    }

    const heading = galleryHeading(sel, platform)
    const sampleCount = games.filter((g) => g.demo).length
    const demoOnly =
      !catalog.local && !(catalog.uploadedCount ?? 0) && !(catalog.hostedCount ?? 0)
    const sampleCue =
      sampleCount > 0 && !demoOnly
        ? `<p class="ro-gallery__cue">Includes ${sampleCount} sample entr${sampleCount === 1 ? 'y' : 'ies'} so you can explore the UI — hide them in Settings if you only want real ROMs.</p>`
        : ''
    const onboard =
      demoOnly
        ? `<aside class="ro-onboard" aria-label="Getting started">
            <p class="ro-onboard__title">Add a ROM to start playing</p>
            <p class="ro-onboard__body">Samples fill the shelf so you can look around. Drop in a file or link a folder when you’re ready.</p>
            <div class="ro-btn-row">
              <a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
              <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Library settings</a>
            </div>
          </aside>`
        : ''

    root.innerHTML = `
      <section class="ro-view ro-library">
        <aside class="ro-systems" aria-label="Library navigation">
          <div class="ro-systems__head">
            <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Library</p>
            <h1 class="ro-systems__title">Library</h1>
            <p class="ro-systems__meta">${libraryMeta(catalog)}</p>
          </div>

          <div class="ro-systems__section">
            <p class="ro-systems__label">Collections</p>
            <div class="ro-systems__scroller">
              <nav class="ro-systems__list" data-ro-systems>
                ${collectionRow('recent', 'Recent', recents.filter((id) => !!catalog.games.find((g) => g.id === id)).length, sel)}
                ${collectionRow('favorites', 'Favorites', favorites.filter((id) => !!catalog.games.find((g) => g.id === id)).length, sel)}
                ${collectionRow('all', 'All games', catalog.games.length, sel)}
              </nav>
            </div>
          </div>

          <div class="ro-systems__section">
            <p class="ro-systems__label">Systems</p>
            <div class="ro-systems__scroller">
              <nav class="ro-systems__list" data-ro-platforms>
                ${ordered
                  .map((p) =>
                    systemRow(
                      p,
                      counts[p.id] ?? 0,
                      sel.kind === 'platform' && sel.id === p.id,
                    ),
                  )
                  .join('')}
              </nav>
            </div>
          </div>

          <div class="ro-systems__actions">
            <a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
            ${
              canPick
                ? `<button type="button" class="ro-btn ro-btn--ghost" id="ro-link-folder" data-ro-focusable="true">Link folder</button>`
                : ''
            }
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Settings</a>
            <p class="ro-muted" id="ro-lib-status" hidden></p>
          </div>
        </aside>

        <div class="ro-gallery">
          ${onboard}
          <div class="ro-section-head">
            <div>
              <p class="ro-kicker">${escapeHtml(heading.kicker)}</p>
              <h2 class="ro-title">${escapeHtml(heading.title)}</h2>
              <p class="ro-lede">${games.length} game${games.length === 1 ? '' : 's'}</p>
              ${sampleCue}
            </div>
            <div class="ro-search">
              <label class="ro-sr-only" for="ro-q">Search your library</label>
              <input type="search" id="ro-q" placeholder="Search your library" value="${escapeAttr(queryRaw)}" autocomplete="off" />
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-sort" aria-label="${isRecent ? 'Sort pinned to play order' : sortDesc ? 'Sort Z to A' : 'Sort A to Z'}"${isRecent ? ' disabled title="Pinned to play order"' : ''}>
                ${isRecent ? 'Play order' : sortDesc ? 'Z–A' : 'A–Z'}
              </button>
            </div>
          </div>
          ${
            games.length
              ? `<div class="ro-grid" data-ro-grid>${games
                  .map((g) =>
                    gameTile(
                      g,
                      findPlatform(catalog, g.platform)?.accent ?? 'sega',
                      useLibretro,
                      favorites.includes(g.id),
                    ),
                  )
                  .join('')}</div>`
              : query
                ? searchEmptyState(queryRaw)
                : emptyState(sel)
          }
        </div>
      </section>
    `

    bindLibraryChrome(root, () => {
      void renderLibrary(root, sel)
    })

    const input = root.querySelector<HTMLInputElement>('#ro-q')
    input?.addEventListener('input', () => {
      queryRaw = input.value
      query = queryRaw.trim().toLowerCase()
      window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => {
        paint({ restoreSearch: true })
      }, 160)
    })

    root.querySelector('#ro-sort')?.addEventListener('click', () => {
      if (isRecent) return
      sortDesc = !sortDesc
      paint({ restoreSearch: true })
    })

    root.querySelector('#ro-clear-search')?.addEventListener('click', () => {
      query = ''
      queryRaw = ''
      paint({ restoreSearch: true })
    })

    root.querySelector('[data-ro-grid]')?.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-fav-id]')
      if (!btn) return
      event.preventDefault()
      event.stopPropagation()
      const id = btn.dataset.favId
      if (!id) return
      sfxToggle()
      toggleFavorite(id)
      paint({ restoreFavId: id })
    })

    hydrateCovers(root)

    if (opts?.restoreFavId) {
      root
        .querySelector<HTMLElement>(`[data-fav-id="${CSS.escape(opts.restoreFavId)}"]`)
        ?.focus()
    } else if (opts?.restoreSearch && input) {
      input.focus()
      const len = input.value.length
      input.setSelectionRange(len, len)
    }

    const systems = root.querySelector<HTMLElement>('[data-ro-systems]')
    const platforms = root.querySelector<HTMLElement>('[data-ro-platforms]')
    const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
    const empty = root.querySelector<HTMLElement>('.ro-empty')
    const onboard = root.querySelector<HTMLElement>('.ro-onboard')
    const actions = root.querySelector<HTMLElement>('.ro-systems__actions')
    const cleanups: Array<() => void> = []
    if (systems) cleanups.push(bindGridFocus(systems))
    if (platforms) cleanups.push(bindGridFocus(platforms))
    if (grid) cleanups.push(bindGridFocus(grid))
    if (empty) cleanups.push(bindGridFocus(empty))
    if (onboard) cleanups.push(bindGridFocus(onboard))
    if (actions) cleanups.push(bindGridFocus(actions))
    cleanup = () => {
      window.clearTimeout(searchTimer)
      cleanups.forEach((fn) => fn())
    }
    registerViewCleanup(cleanup)
  }

  paint()
}

export async function renderPlatform(
  root: HTMLElement,
  platformId: string,
): Promise<void> {
  return renderLibrary(root, { kind: 'platform', id: platformId })
}

export async function renderCollection(
  root: HTMLElement,
  collection: VirtualCollection,
): Promise<void> {
  return renderLibrary(root, { kind: 'collection', id: collection })
}

function normalizeSelection(selection: LibrarySelection | string | undefined): LibrarySelection {
  if (typeof selection === 'string') {
    return { kind: 'platform', id: selection }
  }
  if (selection) return selection
  return { kind: 'collection', id: 'all' }
}

function selectGames(
  catalog: Catalog,
  sel: LibrarySelection,
  favorites: string[],
  recents: string[],
): Game[] {
  if (sel.kind === 'platform') return gamesForPlatform(catalog, sel.id)
  if (sel.id === 'all') return [...catalog.games]
  if (sel.id === 'favorites') {
    return favorites
      .map((id) => catalog.games.find((g) => g.id === id))
      .filter((g): g is Game => !!g)
  }
  return recents
    .map((id) => catalog.games.find((g) => g.id === id))
    .filter((g): g is Game => !!g)
}

function galleryHeading(
  sel: LibrarySelection,
  platform?: Platform,
): { kicker: string; title: string } {
  if (sel.kind === 'platform') {
    return {
      kicker: platform?.shortName ?? 'System',
      title: platform?.name ?? sel.id,
    }
  }
  const map = {
    recent: { kicker: 'Collection', title: 'Recently played' },
    favorites: { kicker: 'Collection', title: 'Favorites' },
    all: { kicker: 'Collection', title: 'All games' },
  }
  return map[sel.id]
}

function searchEmptyState(queryRaw: string): string {
  return `
    <div class="ro-empty">
      <p class="ro-empty__title">No matches</p>
      <p class="ro-empty__body">Nothing matched “${escapeHtml(queryRaw.trim())}”. Try another title, or clear the search.</p>
      <button type="button" class="ro-btn ro-btn--primary" id="ro-clear-search" data-ro-focusable="true">Clear search</button>
    </div>`
}

function emptyState(sel: LibrarySelection): string {
  if (sel.kind === 'collection' && sel.id === 'recent') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">Nothing played yet</p>
        <p class="ro-empty__body">Open a game and it will show up here.</p>
        <a class="ro-btn ro-btn--primary" href="${hrefFor('/library/@all')}" data-ro-focusable="true">Browse games</a>
      </div>`
  }
  if (sel.kind === 'collection' && sel.id === 'favorites') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">No favorites yet</p>
        <p class="ro-empty__body">Star a game from the library grid or its details page.</p>
        <a class="ro-btn ro-btn--primary" href="${hrefFor('/library/@all')}" data-ro-focusable="true">Browse games</a>
      </div>`
  }
  if (sel.kind === 'platform') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">Shelf is empty</p>
        <p class="ro-empty__body">Link a ROM folder, host your games, or add a file — saved ROMs stay on this device.</p>
        <div class="ro-btn-row ro-btn-row--center">
          <a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Settings</a>
        </div>
      </div>`
  }
  return `
    <div class="ro-empty">
      <p class="ro-empty__title">Library is empty</p>
      <p class="ro-empty__body">Add a ROM to save it on this device, host files on your site, or link a folder.</p>
      <a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
    </div>`
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
        status.textContent = friendlyError(err, 'Folder link cancelled.')
      }
    }
  })
}

function libraryMeta(catalog: Catalog): string {
  const parts: string[] = []
  if (catalog.local) {
    parts.push(`${catalog.local.count} local · ${escapeHtml(catalog.local.folderName)}`)
  }
  if (catalog.uploadedCount) {
    parts.push(`${catalog.uploadedCount} saved`)
  }
  if (catalog.hostedCount) {
    parts.push(`${catalog.hostedCount} hosted`)
  }
  return parts.length ? parts.join(' · ') : 'Demo catalog'
}

function collectionRow(
  id: VirtualCollection,
  label: string,
  count: number,
  sel: LibrarySelection,
): string {
  const active = sel.kind === 'collection' && sel.id === id
  const glyph = id === 'recent' ? '▶' : id === 'favorites' ? '★' : '◈'
  return `
    <a
      class="ro-system${active ? ' ro-system--active' : ''}"
      href="${hrefFor(`/library/@${id}`)}"
      data-ro-focusable="true"
      ${active ? 'aria-current="page"' : ''}
      style="--cover-accent: var(--ro-accent)"
    >
      <span class="ro-system__glyph" aria-hidden="true">${glyph}</span>
      <span class="ro-system__text">
        <span class="ro-system__name">${escapeHtml(label)}</span>
        <span class="ro-system__count">${count}</span>
      </span>
    </a>
  `
}

function systemRow(platform: Platform, count: number, active: boolean): string {
  return `
    <a
      class="ro-system${active ? ' ro-system--active' : ''}"
      href="${hrefFor(`/library/${platform.id}`)}"
      data-ro-focusable="true"
      ${active ? 'aria-current="page"' : ''}
      style="--cover-accent: ${platformAccentVar(platform.accent)}"
      title="${escapeAttr(platform.name)}"
    >
      <span class="ro-system__glyph" aria-hidden="true">${escapeHtml(platform.shortName.slice(0, 3))}</span>
      <span class="ro-system__text">
        <span class="ro-system__name">${escapeHtml(platform.name)}</span>
        <span class="ro-system__count">${count}</span>
      </span>
    </a>
  `
}

function gameTile(
  game: Game,
  accent: string,
  useLibretro: boolean,
  favorited: boolean,
): string {
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  const sub =
    game.source === 'local'
      ? 'Local'
      : game.source === 'hosted'
        ? 'Hosted'
        : game.source === 'upload'
          ? 'Saved'
          : game.demo
            ? 'Sample'
            : ''
  const subClass =
    game.source === 'upload'
      ? 'ro-tile__sub ro-tile__sub--saved'
      : game.demo
        ? 'ro-tile__sub ro-tile__sub--sample'
        : 'ro-tile__sub'
  const pressed = favorited ? 'true' : 'false'
  const favLabel = favorited ? 'Remove from favorites' : 'Add to favorites'
  return `
    <div class="ro-tile${favorited ? ' ro-tile--fav' : ''}">
      <a
        class="ro-tile__link"
        href="${hrefFor(`/game/${game.id}`)}"
        data-ro-focusable="true"
      >
        ${coverMarkup(game.title, platformAccentVar(accent), cover)}
        <div class="ro-tile__meta">
          <span class="ro-tile__title">${escapeHtml(game.title)}</span>
          ${sub ? `<span class="${subClass}">${sub}</span>` : ''}
        </div>
      </a>
      <button
        type="button"
        class="ro-tile__fav"
        data-fav-id="${escapeAttr(game.id)}"
        aria-pressed="${pressed}"
        aria-label="${escapeAttr(favLabel)}"
        title="${escapeAttr(favLabel)}"
      >★</button>
    </div>
  `
}
