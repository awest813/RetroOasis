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
import { coverMarkup, escapeAttr, escapeHtml } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { pickLocalLibrary, supportsDirectoryPicker } from '../lib/localLibrary'
import { hrefFor, type VirtualCollection } from '../lib/router'
import { getFavorites, getLibretroCovers, getRecents } from '../lib/store'

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
  const favorites = getFavorites()
  const recents = getRecents()

  const ordered = [...catalog.platforms].sort((a, b) => {
    const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })

  const sel = normalizeSelection(selection, ordered, counts)

  if (!selection && sel.kind === 'platform') {
    window.location.replace(hrefFor(`/library/${sel.id}`))
    return
  }

  if (sel.kind === 'platform' && !findPlatform(catalog, sel.id)) {
    root.innerHTML = `
      <section class="ro-view">
        <p class="ro-kicker">404</p>
        <h1 class="ro-title">System not found</h1>
        <p class="ro-lede"><a href="${hrefFor('/library')}">Back to library</a></p>
      </section>
    `
    return
  }

  const platform = sel.kind === 'platform' ? findPlatform(catalog, sel.id) : undefined
  let query = ''
  let sortDesc = false
  let cleanup: (() => void) | undefined

  const paint = () => {
    cleanup?.()
    let games = selectGames(catalog, sel, favorites, recents)
    games = games.filter((g) => !query || g.title.toLowerCase().includes(query))
    if (sel.kind !== 'collection' || sel.id !== 'recent') {
      games = [...games].sort((a, b) =>
        sortDesc ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title),
      )
    }

    const heading = galleryHeading(sel, platform)

    root.innerHTML = `
      <section class="ro-view ro-library">
        <aside class="ro-systems" aria-label="Library navigation">
          <div class="ro-systems__head">
            <p class="ro-kicker">Library</p>
            <h1 class="ro-systems__title">Oasis</h1>
            <p class="ro-systems__meta">${libraryMeta(catalog)}</p>
          </div>

          <div class="ro-systems__section">
            <p class="ro-systems__label">Collections</p>
            <nav class="ro-systems__list" data-ro-systems>
              ${collectionRow('recent', 'Recent', recents.filter((id) => !!catalog.games.find((g) => g.id === id)).length, sel)}
              ${collectionRow('favorites', 'Favorites', favorites.filter((id) => !!catalog.games.find((g) => g.id === id)).length, sel)}
              ${collectionRow('all', 'All games', catalog.games.length, sel)}
            </nav>
          </div>

          <div class="ro-systems__section">
            <p class="ro-systems__label">Systems</p>
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
              <p class="ro-kicker">${escapeHtml(heading.kicker)}</p>
              <h2 class="ro-title">${escapeHtml(heading.title)}</h2>
              <p class="ro-lede">${games.length} game${games.length === 1 ? '' : 's'}</p>
            </div>
            <div class="ro-search">
              <input type="search" id="ro-q" placeholder="Search titles" value="${escapeAttr(query)}" />
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-sort">
                ${sel.kind === 'collection' && sel.id === 'recent' ? 'Recent' : sortDesc ? 'Z–A' : 'A–Z'}
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
                    ),
                  )
                  .join('')}</div>`
              : `<div class="ro-empty">${emptyCopy(sel)}</div>`
          }
        </div>
      </section>
    `

    bindLibraryChrome(root, () => {
      void renderLibrary(root, sel)
    })

    const input = root.querySelector<HTMLInputElement>('#ro-q')
    input?.addEventListener('input', () => {
      query = input.value.trim().toLowerCase()
      paint()
      root.querySelector<HTMLInputElement>('#ro-q')?.focus()
    })

    root.querySelector('#ro-sort')?.addEventListener('click', () => {
      if (sel.kind === 'collection' && sel.id === 'recent') return
      sortDesc = !sortDesc
      paint()
    })

    const systems = root.querySelector<HTMLElement>('[data-ro-systems]')
    const platforms = root.querySelector<HTMLElement>('[data-ro-platforms]')
    const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
    const cleanups: Array<() => void> = []
    if (systems) cleanups.push(bindGridFocus(systems))
    if (platforms) cleanups.push(bindGridFocus(platforms))
    if (grid) cleanups.push(bindGridFocus(grid))
    cleanup = () => cleanups.forEach((fn) => fn())
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

function normalizeSelection(
  selection: LibrarySelection | string | undefined,
  ordered: Platform[],
  counts: Record<string, number>,
): LibrarySelection {
  if (typeof selection === 'string') {
    return { kind: 'platform', id: selection }
  }
  if (selection) return selection
  const first = ordered.find((p) => (counts[p.id] ?? 0) > 0)?.id ?? ordered[0]?.id
  return first ? { kind: 'platform', id: first } : { kind: 'collection', id: 'all' }
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

function emptyCopy(sel: LibrarySelection): string {
  if (sel.kind === 'collection' && sel.id === 'recent') {
    return 'No recently played games yet. Launch something from a system shelf.'
  }
  if (sel.kind === 'collection' && sel.id === 'favorites') {
    return 'No favorites yet. Star a game from its detail page.'
  }
  if (sel.kind === 'platform') {
    return `No games here yet. Link a folder, host roms/manifest.json, or add files under roms/${sel.id}/.`
  }
  return 'Library is empty.'
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

function libraryMeta(catalog: Catalog): string {
  if (catalog.local) {
    return `${catalog.local.count} local · ${escapeHtml(catalog.local.folderName)}`
  }
  if (catalog.hostedCount) {
    return `${catalog.hostedCount} hosted`
  }
  return 'Demo catalog'
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
    >
      <span class="ro-system__glyph" aria-hidden="true">${escapeHtml(platform.shortName.slice(0, 3))}</span>
      <span class="ro-system__text">
        <span class="ro-system__name">${escapeHtml(platform.name)}</span>
        <span class="ro-system__count">${count}</span>
      </span>
    </a>
  `
}

function gameTile(game: Game, accent: string, useLibretro: boolean): string {
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
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
      ${coverMarkup(game.title, platformAccentVar(accent), cover)}
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(game.title)}</span>
        <span class="ro-tile__sub">${sub}</span>
      </div>
    </a>
  `
}
