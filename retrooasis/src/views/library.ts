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
import { launchGame } from '../lib/play'
import { registerViewCleanup } from '../lib/viewLifecycle'
import { pickLocalLibrary, supportsDirectoryPicker } from '../lib/localLibrary'
import { hrefFor, navigate, type VirtualCollection } from '../lib/router'
import {
  getFavorites,
  getLibretroCovers,
  getLibrarySort,
  getLibraryView,
  getRecents,
  setLibrarySort,
  setLibraryView,
  toggleFavorite,
  type LibrarySort,
  type LibraryViewMode,
} from '../lib/store'
import { sfxConfirm, sfxToggle } from '../lib/sfx'
import { friendlyError } from '../lib/userErrors'

export type LibrarySelection =
  | { kind: 'platform'; id: string }
  | { kind: 'collection'; id: VirtualCollection }
  | { kind: 'tag'; id: string }

type PaintOpts = {
  restoreSearch?: boolean
  restoreFavId?: string
  restoreFocusId?: string
}

type GameGroup = { key: string; name: string; accent: string; games: Game[] }

const SORT_OPTIONS: Array<[LibrarySort, string]> = [
  ['az', 'Title A–Z'],
  ['za', 'Title Z–A'],
  ['recent', 'Recently played'],
  ['platform', 'System'],
  ['year', 'Year (newest)'],
]

const ICONS = {
  search:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
  grid: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
  list: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4.5 2.9v10.2c0 .8.9 1.3 1.6.9l8.1-5.1c.6-.4.6-1.4 0-1.8L6.1 2c-.7-.4-1.6.1-1.6.9z"/></svg>',
}

export async function renderLibrary(
  root: HTMLElement,
  selection?: LibrarySelection | string,
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
      <aside class="ro-systems" aria-label="Library navigation">
        <div class="ro-systems__head">
          <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Library</p>
          <h1 class="ro-title ro-skeleton ro-skeleton--title" style="width: 40%"></h1>
          <p class="ro-lede ro-skeleton ro-skeleton--lede"></p>
        </div>
        <div class="ro-systems__section">
          <p class="ro-systems__label ro-skeleton ro-skeleton--text" style="width: 30%"></p>
          <div class="ro-systems__scroller">
            <nav class="ro-systems__list">
              <div class="ro-skeleton ro-skeleton--text" style="margin-bottom: 0.75rem"></div>
              <div class="ro-skeleton ro-skeleton--text" style="margin-bottom: 0.75rem"></div>
              <div class="ro-skeleton ro-skeleton--text" style="margin-bottom: 0.75rem"></div>
            </nav>
          </div>
        </div>
      </aside>
      <div class="ro-gallery">
        <div class="ro-section-head">
          <div>
            <p class="ro-kicker ro-skeleton ro-skeleton--text" style="width: 20%"></p>
            <h2 class="ro-title ro-skeleton ro-skeleton--title" style="width: 60%"></h2>
            <p class="ro-lede ro-skeleton ro-skeleton--lede"></p>
          </div>
        </div>
        <div class="ro-librarybar ro-skeleton" style="height: 2.6rem; max-width: 34rem"></div>
        <div class="ro-grid" data-ro-grid>
          ${Array.from({ length: 8 })
            .map(
              () => `
            <div class="ro-tile">
              <a class="ro-tile__link" tabindex="-1" aria-hidden="true">
                <div class="ro-cover ro-skeleton ro-skeleton--cover"></div>
              </a>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    </section>
  `

  const catalog = await loadCatalog()
  if (!active) return
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
  const groupOrder = new Map(ordered.map((p, i) => [p.id, i]))
  const platformById = new Map(catalog.platforms.map((p) => [p.id, p]))

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
    if (empty) cleanup = bindGridFocus(empty)
    root.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
    return
  }

  const platform = sel.kind === 'platform' ? findPlatform(catalog, sel.id) : undefined
  let query = ''
  let queryRaw = ''
  let view: LibraryViewMode = getLibraryView()
  let sort = getLibrarySort()
  let playingId = ''
  let searchTimer = 0
  // Systems rail starts expanded on desktop widths; collapsed behind the toggle on mobile.
  let filtersExpanded = window.matchMedia('(min-width: 901px)').matches
  const isRecent = sel.kind === 'collection' && sel.id === 'recent'
  const DEBOUNCE_DELAY = 250 // ms

  // Collect unique tags from all games
  const allTags = Array.from(new Set(catalog.games.flatMap((g) => g.tags ?? []))).sort()

  const paint = (opts: PaintOpts = {}) => {
    if (!active) return
    cleanup?.()
    favorites = getFavorites()
    const selected = selectGames(catalog, sel, favorites, recents)
    let games = applySearch(selected, query, platformById)
    if (!isRecent) games = sortGames(games, sort, recents)
    const grouped = !isRecent && sort === 'platform' && sel.kind !== 'platform'

    const heading = galleryHeading(sel, platform)
    const sampleCount = games.filter((g) => g.demo).length
    const demoOnly =
      !catalog.local && !(catalog.uploadedCount ?? 0) && !(catalog.hostedCount ?? 0)
    const sampleCue =
      sampleCount > 0 && !demoOnly
        ? `<p class="ro-gallery__cue">Includes ${sampleCount} sample entr${sampleCount === 1 ? 'y' : 'ies'} so you can explore the UI — hide them in Settings if you only want real ROMs.</p>`
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

    const tile = (g: Game) =>
      gameTile(g, platformById.get(g.platform), useLibretro, favorites.includes(g.id))
    const row = (g: Game) =>
      gameRow(g, platformById.get(g.platform), useLibretro, favorites.includes(g.id))
    const renderGames = (list: Game[]): string =>
      view === 'grid'
        ? `<div class="ro-grid" data-ro-grid>${list.map(tile).join('')}</div>`
        : `<div class="ro-list" data-ro-list>${list.map(row).join('')}</div>`

    let body: string
    if (grouped) {
      body = groupGames(games, platformById, groupOrder)
        .map(
          (grp) => `
        <section class="ro-group" style="--cover-accent: ${platformAccentVar(grp.accent)}">
          <header class="ro-group__head">
            <span class="ro-group__bar" aria-hidden="true"></span>
            <h3 class="ro-group__title">${escapeHtml(grp.name)}</h3>
            <span class="ro-group__count">${grp.games.length}</span>
          </header>
          ${renderGames(grp.games)}
        </section>`,
        )
        .join('')
    } else {
      body = renderGames(games)
    }

    const sortSelect = isRecent
      ? `<select class="ro-librarybar__sort" id="ro-sortmode" disabled aria-label="Sort games" title="Pinned to play order"><option selected>Play order</option></select>`
      : `<select class="ro-librarybar__sort" id="ro-sortmode" aria-label="Sort games" title="Sort games">
          ${SORT_OPTIONS.map(
            ([value, label]) =>
              `<option value="${value}"${sort === value ? ' selected' : ''}>${label}</option>`,
          ).join('')}
        </select>`

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

          <button type="button" class="ro-btn ro-btn--ghost ro-systems__toggle" id="ro-browse-filters" aria-expanded="${filtersExpanded}" aria-controls="ro-browse-options">${filtersExpanded ? 'Hide systems & tags' : 'Browse systems & tags'}</button>
          <div class="ro-systems__options" id="ro-browse-options" data-expanded="${filtersExpanded}">
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

          ${allTags.length > 0 ? `
          <div class="ro-systems__section">
            <p class="ro-systems__label">Tags</p>
            <div class="ro-systems__scroller">
              <nav class="ro-systems__list" data-ro-tags>
                ${allTags.map((tag) => tagRow(tag, sel.kind === 'tag' && sel.id.toLowerCase().replace(/\s+/g, '-') === tag.toLowerCase().replace(/\s+/g, '-'))).join('')}
              </nav>
            </div>
          </div>
          ` : ''}

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
              <p class="ro-lede">${countLabel}</p>
              ${sel.kind !== 'collection' ? `<a href="${hrefFor('/library/@all')}">Browse all games</a>` : ''}
              ${sampleCue}
            </div>
          </div>
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
            ${sortSelect}
            <div class="ro-librarybar__view" role="group" aria-label="Library view">
              <button type="button" class="ro-librarybar__viewbtn${view === 'grid' ? ' is-active' : ''}" id="ro-view-grid" aria-pressed="${view === 'grid'}" data-ro-focusable="true" title="Cover grid" aria-label="Cover grid view">${ICONS.grid}</button>
              <button type="button" class="ro-librarybar__viewbtn${view === 'list' ? ' is-active' : ''}" id="ro-view-list" aria-pressed="${view === 'list'}" data-ro-focusable="true" title="List view" aria-label="List view">${ICONS.list}</button>
            </div>
            <span id="ro-search-status" class="ro-sr-only" role="status">${games.length} result${games.length === 1 ? '' : 's'}</span>
          </div>
          ${games.length ? body : query ? searchEmptyState(queryRaw) : emptyState(sel)}
          <p class="ro-muted" id="ro-play-status" role="status" aria-live="polite" hidden></p>
        </div>
      </section>
    `

    bindLibraryChrome(root, () => {
      if (active) void renderLibrary(root, sel)
    })

    root.querySelector('#ro-browse-filters')?.addEventListener('click', () => {
      filtersExpanded = !filtersExpanded
      const toggle = root.querySelector<HTMLButtonElement>('#ro-browse-filters')!
      toggle.setAttribute('aria-expanded', String(filtersExpanded))
      toggle.textContent = filtersExpanded ? 'Hide systems & tags' : 'Browse systems & tags'
      root.querySelector<HTMLElement>('#ro-browse-options')!.dataset.expanded = String(filtersExpanded)
    })

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

    root.querySelector<HTMLSelectElement>('#ro-sortmode')?.addEventListener('change', (event) => {
      const select = event.currentTarget as HTMLSelectElement
      const value = select.value as LibrarySort
      if (SORT_OPTIONS.some(([key]) => key === value)) {
        sort = value
        setLibrarySort(value)
        paint({ restoreFocusId: 'ro-sortmode' })
      }
    })

    root.querySelector('#ro-view-grid')?.addEventListener('click', () => {
      if (view === 'grid') return
      view = 'grid'
      setLibraryView('grid')
      sfxToggle()
      paint({ restoreFocusId: 'ro-view-grid' })
    })

    root.querySelector('#ro-view-list')?.addEventListener('click', () => {
      if (view === 'list') return
      view = 'list'
      setLibraryView('list')
      sfxToggle()
      paint({ restoreFocusId: 'ro-view-list' })
    })

    root.querySelectorAll('[data-ro-clear-search]').forEach((button) =>
      button.addEventListener('click', () => {
        query = ''
        queryRaw = ''
        paint({ restoreSearch: true })
      }),
    )

    root.querySelector('.ro-gallery')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null
      const playBtn = target?.closest<HTMLButtonElement>('[data-play-id]')
      if (playBtn) {
        event.preventDefault()
        event.stopPropagation()
        void quickPlay(playBtn)
        return
      }
      const favBtn = target?.closest<HTMLButtonElement>('[data-fav-id]')
      if (!favBtn) return
      event.preventDefault()
      event.stopPropagation()
      const id = favBtn.dataset.favId
      if (!id) return
      sfxToggle()
      toggleFavorite(id)
      paint({ restoreFavId: id })
    })

    hydrateCovers(root)

    if (opts.restoreFavId) {
      const button = root
        .querySelector<HTMLElement>(`[data-fav-id="${CSS.escape(opts.restoreFavId)}"]`)
      const fallback = root.querySelector<HTMLElement>('[data-ro-grid] [data-ro-focusable], .ro-list [data-ro-focusable], .ro-empty [data-ro-focusable]')
      ;(button ?? fallback)?.focus()
    } else if (opts.restoreFocusId) {
      const button = root.querySelector<HTMLElement>(`#${opts.restoreFocusId}`)
      const fallback = root.querySelector<HTMLElement>('#ro-sortmode')
      ;(button ?? fallback)?.focus()
    } else if (opts.restoreSearch && input) {
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

  const quickPlay = async (button: HTMLButtonElement): Promise<void> => {
    const id = button.dataset.playId
    const game = id ? catalog.games.find((g) => g.id === id) : undefined
    if (!game || playingId) return
    if (game.demo) {
      navigate(`/game/${encodeURIComponent(game.id)}`)
      return
    }
    playingId = game.id
    button.setAttribute('aria-busy', 'true')
    const status = root.querySelector<HTMLElement>('#ro-play-status')
    if (status) {
      status.hidden = false
      status.textContent = `Starting ${game.title}…`
    }
    sfxConfirm()
    try {
      await launchGame(game, selectionHref(sel))
    } catch (err) {
      playingId = ''
      if (status) {
        status.textContent = friendlyError(err, 'Couldn’t start that game. Try again.')
      }
      paint({ restoreFocusId: undefined })
      root
        .querySelector<HTMLElement>(`[data-play-id="${CSS.escape(game.id)}"]`)
        ?.focus()
    }
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
    // Check if it's a tag route (e.g., "tag/action")
    if (selection.startsWith('tag/')) {
      const tagId = selection.slice(4)
      return { kind: 'tag', id: tagId }
    }
    return { kind: 'platform', id: selection }
  }
  if (selection) return selection
  return { kind: 'collection', id: 'all' }
}

function selectionHref(sel: LibrarySelection): string {
  if (sel.kind === 'platform') return hrefFor(`/library/${encodeURIComponent(sel.id)}`)
  if (sel.kind === 'tag') {
    return hrefFor(`/library/tag/${encodeURIComponent(sel.id.toLowerCase().replace(/\s+/g, '-'))}`)
  }
  return hrefFor(`/library/@${sel.id}`)
}

function selectGames(
  catalog: Catalog,
  sel: LibrarySelection,
  favorites: string[],
  recents: string[],
): Game[] {
  if (sel.kind === 'platform') return gamesForPlatform(catalog, sel.id)
  if (sel.kind === 'tag') {
    // Convert tag ID back to original case for matching
    const tagId = sel.id.toLowerCase().replace(/\s+/g, '-')
    return catalog.games.filter((g) => g.tags?.some((t) => t.toLowerCase().replace(/\s+/g, '-') === tagId))
  }
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

function sortGames(games: Game[], sort: LibrarySort, recents: string[]): Game[] {
  if (sort === 'recent') {
    const rank = new Map(recents.map((id, i) => [id, i]))
    return [...games].sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      if (ra !== rb) return ra - rb
      return a.title.localeCompare(b.title)
    })
  }
  if (sort === 'year') {
    return [...games].sort((a, b) => {
      const ya = Number(a.year) || 0
      const yb = Number(b.year) || 0
      if (ya !== yb) return yb - ya
      return a.title.localeCompare(b.title)
    })
  }
  if (sort === 'az' || sort === 'za') {
    return [...games].sort((a, b) =>
      sort === 'za' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title),
    )
  }
  // 'platform' ordering comes from grouped rendering
  return [...games]
}

function groupGames(
  games: Game[],
  platformById: Map<string, Platform>,
  order: Map<string, number>,
): GameGroup[] {
  const map = new Map<string, GameGroup>()
  for (const g of games) {
    const platform = platformById.get(g.platform)
    const key = platform?.id ?? g.platform
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        name: platform?.name ?? g.platform,
        accent: platform?.accent ?? 'sega',
        games: [],
      }
      map.set(key, group)
    }
    group.games.push(g)
  }
  return [...map.values()]
    .map((group) => {
      group.games.sort((a, b) => a.title.localeCompare(b.title))
      return group
    })
    .sort((a, b) => {
      const oa = order.get(a.key) ?? Number.MAX_SAFE_INTEGER
      const ob = order.get(b.key) ?? Number.MAX_SAFE_INTEGER
      if (oa !== ob) return oa - ob
      return a.name.localeCompare(b.name)
    })
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
  if (sel.kind === 'tag') {
    return {
      kicker: 'Tag',
      title: `#${sel.id}`,
    }
  }
  const map: Record<string, { kicker: string; title: string }> = {
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
      <p class="ro-empty__body">Nothing matched “${escapeHtml(queryRaw.trim())}”. Try a title, system or tag — or clear the search.</p>
      <button type="button" class="ro-btn ro-btn--primary" data-ro-clear-search data-ro-focusable="true">Clear search</button>
    </div>`
}

function emptyState(sel: LibrarySelection): string {
  if (sel.kind === 'tag') {
    return `<div class="ro-empty">
      <p class="ro-empty__title">No games with this tag</p>
      <p class="ro-empty__body">Choose another tag or browse your full library.</p>
      <a class="ro-btn ro-btn--primary" href="${hrefFor('/library/@all')}" data-ro-focusable="true">Browse games</a>
    </div>`
  }
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
      aria-label="${escapeHtml(label)} collection with ${count} game${count === 1 ? '' : 's'}"
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
      aria-label="${escapeHtml(platform.name)} system with ${count} game${count === 1 ? '' : 's'}"
      title="${escapeAttr(platform.name)}"
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

function tagRow(tag: string, active: boolean): string {
  const tagId = tag.toLowerCase().replace(/\s+/g, '-')
  return `
    <a
      class="ro-system${active ? ' ro-system--active' : ''}"
      href="${hrefFor(`/library/tag/${encodeURIComponent(tagId)}`)}"
      data-ro-focusable="true"
      ${active ? 'aria-current="page"' : ''}
      aria-label="${escapeHtml(tag)} tag"
      title="${escapeAttr(tag)}"
    >
      <span class="ro-system__glyph" aria-hidden="true">#</span>
      <span class="ro-system__text">
        <span class="ro-system__name">${escapeHtml(tag)}</span>
      </span>
    </a>
  `
}

function sourceBadge(game: Game): { label: string; cls: string } | null {
  if (game.source === 'upload') return { label: 'Saved', cls: ' ro-badge--saved' }
  if (game.source === 'local') return { label: 'Local', cls: '' }
  if (game.source === 'hosted') return { label: 'Hosted', cls: '' }
  if (game.demo) return { label: 'Sample', cls: ' ro-badge--sample' }
  return null
}

function gameTile(
  game: Game,
  platform: Platform | undefined,
  useLibretro: boolean,
  favorited: boolean,
): string {
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  const badge = sourceBadge(game)
  const year = game.year != null && game.year !== '' ? String(game.year) : ''
  const subParts = [platform?.shortName ?? game.platform, year].filter(Boolean)
  const pressed = favorited ? 'true' : 'false'
  const favLabel = favorited ? `Remove ${escapeHtml(game.title)} from favorites` : `Add ${escapeHtml(game.title)} to favorites`
  const gameHref = hrefFor(`/game/${encodeURIComponent(game.id)}`)
  return `
    <div class="ro-tile${favorited ? ' ro-tile--fav' : ''}">
      <a
        class="ro-tile__link"
        href="${gameHref}"
        data-ro-focusable="true"
        aria-label="View ${escapeAttr(game.title)} details"
      >
        ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), cover)}
        <span class="ro-tile__scrim" aria-hidden="true">
          <span class="ro-tile__title">${escapeHtml(game.title)}</span>
          ${subParts.length ? `<span class="ro-tile__sub">${escapeHtml(subParts.join(' · '))}</span>` : ''}
        </span>
      </a>
      ${badge ? `<span class="ro-tile__badge${badge.cls}">${badge.label}</span>` : ''}
      <button
        type="button"
        class="ro-tile__play"
        data-play-id="${escapeAttr(game.id)}"
        data-ro-focusable="true"
        aria-label="Play ${escapeAttr(game.title)}"
        title="Play ${escapeAttr(game.title)}"
      >${ICONS.play}</button>
      <button
        type="button"
        class="ro-tile__fav"
        data-fav-id="${escapeAttr(game.id)}"
        aria-pressed="${pressed}"
        aria-label="${favLabel}"
        title="${favLabel}"
      >★</button>
    </div>
  `
}

function gameRow(
  game: Game,
  platform: Platform | undefined,
  useLibretro: boolean,
  favorited: boolean,
): string {
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  const badge = sourceBadge(game)
  const year = game.year != null && game.year !== '' ? String(game.year) : ''
  const accent = platformAccentVar(platform?.accent ?? 'sega')
  const pressed = favorited ? 'true' : 'false'
  const favLabel = favorited ? `Remove ${escapeHtml(game.title)} from favorites` : `Add ${escapeHtml(game.title)} to favorites`
  const gameHref = hrefFor(`/game/${encodeURIComponent(game.id)}`)
  const subParts = [platform?.name ?? game.platform, game.developer].filter(Boolean)
  return `
    <div class="ro-row${favorited ? ' ro-row--fav' : ''}">
      <a class="ro-row__main" href="${gameHref}" data-ro-focusable="true" aria-label="View ${escapeAttr(game.title)} details">
        <span class="ro-row__thumb">${coverMarkup(game.title, accent, cover)}</span>
        <span class="ro-row__text">
          <span class="ro-row__title">${escapeHtml(game.title)}</span>
          <span class="ro-row__sub">${escapeHtml(subParts.join(' · '))}</span>
        </span>
        <span class="ro-row__platform" style="--cover-accent: ${accent}">${escapeHtml(platform?.shortName ?? game.platform)}</span>
        <span class="ro-row__year">${year ? escapeHtml(year) : '—'}</span>
        ${badge ? `<span class="ro-row__badge${badge.cls}">${badge.label}</span>` : ''}
      </a>
      <button
        type="button"
        class="ro-row__play"
        data-play-id="${escapeAttr(game.id)}"
        data-ro-focusable="true"
        aria-label="Play ${escapeAttr(game.title)}"
        title="Play ${escapeAttr(game.title)}"
      >${ICONS.play}<span>Play</span></button>
      <button
        type="button"
        class="ro-row__fav"
        data-fav-id="${escapeAttr(game.id)}"
        aria-pressed="${pressed}"
        aria-label="${favLabel}"
        title="${favLabel}"
      >★</button>
    </div>
  `
}
