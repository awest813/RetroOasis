import {
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
import { hrefFor, type VirtualCollection } from '../lib/router'
import { getFavorites, getLibretroCovers, getRecents } from '../lib/store'
import { registerViewCleanup } from '../lib/viewLifecycle'

export type LibrarySelection =
  | { kind: 'platform'; id: string }
  | { kind: 'collection'; id: VirtualCollection }
  | { kind: 'tag'; id: string }

type PaintOpts = {
  restoreSearch?: boolean
}

const ICONS = {
  search:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
}

export async function renderLibrary(
  root: HTMLElement,
  selection?: LibrarySelection,
): Promise<void> {
  let active = true
  let cleanup: (() => void) | undefined
  const onSlashKey = (event: KeyboardEvent) => {
    if (event.key !== '/') return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
      return
    }
    event.preventDefault()
    root.querySelector<HTMLInputElement>('#ro-q')?.focus()
  }
  document.addEventListener('keydown', onSlashKey)
  registerViewCleanup(() => {
    active = false
    document.removeEventListener('keydown', onSlashKey)
    cleanup?.()
  })
  // Show skeleton loading state immediately
  root.innerHTML = `
    <section class="ro-view ro-library" aria-busy="true">
      <div class="ro-gallery">
        <div class="ro-section-head">
          <div>
            <h2 class="ro-title ro-skeleton ro-skeleton--title" style="width: 40%"></h2>
            <p class="ro-lede ro-skeleton ro-skeleton--lede"></p>
          </div>
        </div>
        <div class="ro-chips" aria-hidden="true">
          ${'<span class="ro-chip ro-skeleton" style="width: 5.5rem"></span>'.repeat(6)}
        </div>
        <div class="ro-librarybar ro-skeleton" style="height: 2.6rem; max-width: 34rem"></div>
        <div class="ro-grid" data-ro-grid>
          ${Array.from({ length: 8 })
            .map(
              () => `
            <div class="ro-tile">
              <div class="ro-tile__link" tabindex="-1" aria-hidden="true">
                <div class="ro-cover ro-skeleton ro-skeleton--cover"></div>
              </div>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    </section>
  `

  const catalog = await loadCatalog()
  if (!active) return

  let sel = normalizeSelection(selection)
  let query = ''
  let queryRaw = ''
  let searchTimer = 0
  const DEBOUNCE_DELAY = 250 // ms

  // Unknown platform deep-link: dedicated empty screen, not an empty shelf.
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
    if (empty) cleanup = bindGridFocus(empty)
    root.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
    return
  }

  // Legacy tag routes resolve to the All shelf with the tag prefilled as search.
  if (sel.kind === 'tag') {
    const slug = sel.id.toLowerCase().replace(/\s+/g, '-')
    const original = catalog.games
      .flatMap((g) => g.tags ?? [])
      .find((t) => t.toLowerCase().replace(/\s+/g, '-') === slug)
    query = (original ?? sel.id).toLowerCase()
    queryRaw = original ?? sel.id
    sel = { kind: 'collection', id: 'all' }
  }

  const counts = countByPlatform(catalog)
  const useLibretro = getLibretroCovers()
  const platformById = new Map(catalog.platforms.map((p) => [p.id, p]))
  // Match Home: only list systems that currently have titles.
  const ordered = [...catalog.platforms]
    .filter((p) => (counts[p.id] ?? 0) > 0)
    .sort((a, b) => {
      const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })

  const isRecent = sel.kind === 'collection' && sel.id === 'recent'

  const paint = (opts: PaintOpts = {}) => {
    if (!active) return
    cleanup?.()
    const favorites = getFavorites()
    const recents = getRecents()
    const selected = selectGames(catalog, sel, favorites, recents)
    let games = applySearch(selected, query, platformById)
    if (!isRecent) games = [...games].sort((a, b) => a.title.localeCompare(b.title))

    const heading = shelfTitle(sel, catalog)
    const demoOnly =
      !catalog.local && !(catalog.uploadedCount ?? 0) && !(catalog.hostedCount ?? 0)
    const sampleCue =
      games.some((g) => g.demo) && !demoOnly
        ? '<p class="ro-gallery__cue">Sample entries fill the shelf so you can explore the UI — hide them in Settings if you only want real ROMs.</p>'
        : ''
    const onboard = demoOnly
      ? `<aside class="ro-onboard" aria-label="Getting started">
          <p class="ro-onboard__title">Add a ROM to start playing</p>
          <p class="ro-onboard__body">Samples fill the shelf so you can look around. Drop in a file or link a folder when you’re ready.</p>
          <div class="ro-btn-row">
            <a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Library settings</a>
          </div>
        </aside>`
      : ''
    const countLabel = query
      ? `${games.length} of ${selected.length} game${selected.length === 1 ? '' : 's'}`
      : `${games.length} game${games.length === 1 ? '' : 's'}`

    const chip = (href: string, label: string, count: number, active_: boolean, title?: string) => `
      <a
        class="ro-chip${active_ ? ' is-active' : ''}"
        href="${href}"
        data-ro-focusable="true"
        ${active_ ? 'aria-current="page"' : ''}
        ${title ? `title="${escapeAttr(title)}"` : ''}
      >
        <span class="ro-chip__label">${escapeHtml(label)}</span>
        <span class="ro-chip__count">${count}</span>
      </a>
    `
    const chips = [
      chip(hrefFor('/library/@all'), 'All games', catalog.games.length, sel.kind === 'collection' && sel.id === 'all'),
      chip(
        hrefFor('/library/@favorites'),
        'Favorites',
        favorites.filter((id) => catalog.games.some((g) => g.id === id)).length,
        sel.kind === 'collection' && sel.id === 'favorites',
      ),
      chip(
        hrefFor('/library/@recent'),
        'Recent',
        recents.filter((id) => catalog.games.some((g) => g.id === id)).length,
        isRecent,
      ),
      ...ordered.map((p) =>
        chip(
          hrefFor(`/library/${p.id}`),
          p.shortName,
          counts[p.id] ?? 0,
          sel.kind === 'platform' && sel.id === p.id,
          p.name,
        ),
      ),
    ]

    const body = `<div class="ro-grid" data-ro-grid>${games
      .map((g) => gameTile(g, platformById.get(g.platform), useLibretro))
      .join('')}</div>`

    root.innerHTML = `
      <section class="ro-view ro-library">
        <div class="ro-gallery">
          ${onboard}
          <div class="ro-section-head">
            <div>
              <h2 class="ro-title">${escapeHtml(heading)}</h2>
              <p class="ro-lede">${countLabel}</p>
              ${sampleCue}
            </div>
          </div>
          <nav class="ro-chips" aria-label="Library filters">${chips.join('')}</nav>
          <div class="ro-librarybar" data-ro-librarybar>
            <div class="ro-librarybar__search">
              <span class="ro-librarybar__icon" aria-hidden="true">${ICONS.search}</span>
              <label class="ro-sr-only" for="ro-q">Search your library</label>
              <input type="search" id="ro-q" placeholder="Search games…" value="${escapeAttr(queryRaw)}" autocomplete="off" aria-describedby="ro-search-status" title="Search by title, system or tag — press / to focus" />
              ${
                queryRaw
                  ? `<button type="button" class="ro-librarybar__clear" data-ro-clear-search aria-label="Clear search" title="Clear search">×</button>`
                  : ''
              }
            </div>
            <span id="ro-search-status" class="ro-sr-only" role="status">${games.length} result${games.length === 1 ? '' : 's'}</span>
          </div>
          ${games.length ? body : query ? searchEmptyState(queryRaw) : emptyState(sel)}
        </div>
      </section>
    `

    const input = root.querySelector<HTMLInputElement>('#ro-q')
    input?.addEventListener('input', () => {
      queryRaw = input.value
      query = queryRaw.trim().toLowerCase()
      window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => {
        paint({ restoreSearch: true })
      }, DEBOUNCE_DELAY)
    })
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && queryRaw) {
        event.preventDefault()
        event.stopPropagation()
        query = ''
        queryRaw = ''
        paint({ restoreSearch: true })
      }
    })

    root.querySelectorAll('[data-ro-clear-search]').forEach((button) =>
      button.addEventListener('click', () => {
        query = ''
        queryRaw = ''
        paint({ restoreSearch: true })
      }),
    )

    hydrateCovers(root)

    if (opts.restoreSearch && input) {
      input.focus()
      const end = input.value.length
      input.setSelectionRange(end, end)
    }

    const cleanupNavigation = bindGridFocus(root)
    cleanup = () => {
      window.clearTimeout(searchTimer)
      cleanupNavigation()
    }
  }

  paint()
}

export async function renderCollection(
  root: HTMLElement,
  collection: VirtualCollection,
): Promise<void> {
  return renderLibrary(root, { kind: 'collection', id: collection })
}

function normalizeSelection(selection: LibrarySelection | undefined): LibrarySelection {
  return selection ?? { kind: 'collection', id: 'all' }
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

function applySearch(
  games: Game[],
  query: string,
  platformById: Map<string, Platform>,
): Game[] {
  if (!query) return games
  return games.filter((g) => {
    if (g.title.toLowerCase().includes(query)) return true
    const platform = platformById.get(g.platform)
    if (
      platform &&
      (platform.name.toLowerCase().includes(query) ||
        platform.shortName.toLowerCase().includes(query))
    ) {
      return true
    }
    return (g.tags ?? []).some((t) => t.toLowerCase().includes(query))
  })
}

function shelfTitle(sel: LibrarySelection, catalog: Catalog): string {
  if (sel.kind === 'platform') {
    return findPlatform(catalog, sel.id)?.name ?? sel.id
  }
  const map: Record<string, string> = {
    recent: 'Recently played',
    favorites: 'Favorites',
    all: 'All games',
  }
  return map[sel.id]
}

function searchEmptyState(queryRaw: string): string {
  return `
    <div class="ro-empty">
      <p class="ro-empty__title">No matches</p>
      <p class="ro-empty__body">Nothing matched “${escapeHtml(queryRaw.trim())}”. Try a title, system or tag — or clear the search.</p>
      <button type="button" class="ro-btn ro-btn--primary" data-ro-clear-search data-ro-focusable="true">Clear search</button>
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
        <p class="ro-empty__body">Star a game from its details page.</p>
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

function gameTile(
  game: Game,
  platform: Platform | undefined,
  useLibretro: boolean,
): string {
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  const gameHref = hrefFor(`/game/${encodeURIComponent(game.id)}`)
  return `
    <div class="ro-tile">
      <a
        class="ro-tile__link"
        href="${gameHref}"
        data-ro-focusable="true"
        aria-label="View ${escapeAttr(game.title)} details"
      >
        ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), cover)}
        <span class="ro-tile__caption">
          <span class="ro-tile__title">${escapeHtml(game.title)}</span>
          <span class="ro-tile__sub">${escapeHtml(platform?.shortName ?? game.platform)}</span>
        </span>
      </a>
    </div>
  `
}
