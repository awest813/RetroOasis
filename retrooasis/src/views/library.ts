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
    const sampleCount = games.filter((g) => g.demo).length
    const sampleCue =
      sampleCount > 0
        ? `<p class="ro-gallery__cue">Includes ${sampleCount} sample entr${sampleCount === 1 ? 'y' : 'ies'} so you can explore the UI — hide them in Settings if you only want real ROMs.</p>`
        : ''

    root.innerHTML = `
      <section class="ro-view ro-library">
        <aside class="ro-systems" aria-label="Library navigation">
          <div class="ro-systems__head">
            <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Library</p>
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
            <a class="ro-btn" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
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
          <div class="ro-section-head">
            <div>
              <p class="ro-kicker">${escapeHtml(heading.kicker)}</p>
              <h2 class="ro-title">${escapeHtml(heading.title)}</h2>
              <p class="ro-lede">${games.length} game${games.length === 1 ? '' : 's'}</p>
              ${sampleCue}
            </div>
            <div class="ro-search">
              <input type="search" id="ro-q" placeholder="Search your library" value="${escapeAttr(query)}" />
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
                      favorites.includes(g.id),
                    ),
                  )
                  .join('')}</div>`
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

function emptyState(sel: LibrarySelection): string {
  if (sel.kind === 'collection' && sel.id === 'recent') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">No recent plays</p>
        <p class="ro-empty__body">Launch a title from any system shelf and it will show up here.</p>
        <a class="ro-btn" href="${hrefFor('/library/@all')}" data-ro-focusable="true">Browse all games</a>
      </div>`
  }
  if (sel.kind === 'collection' && sel.id === 'favorites') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">No favorites yet</p>
        <p class="ro-empty__body">Open a game and tap Favorite to pin it on this shelf.</p>
        <a class="ro-btn" href="${hrefFor('/library/@all')}" data-ro-focusable="true">Browse all games</a>
      </div>`
  }
  if (sel.kind === 'platform') {
    return `
      <div class="ro-empty">
        <p class="ro-empty__title">Shelf is empty</p>
        <p class="ro-empty__body">Link a ROM folder, host your games, or add a file — saved ROMs stay on this device.</p>
        <div class="ro-btn-row" style="justify-content:center">
          <a class="ro-btn" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/settings')}" data-ro-focusable="true">Settings</a>
        </div>
      </div>`
  }
  return `
    <div class="ro-empty">
      <p class="ro-empty__title">Library is empty</p>
      <p class="ro-empty__body">Add a ROM to save it on this device, host files on your site, or link a folder.</p>
      <a class="ro-btn" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>
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
            : 'Catalog'
  const subClass =
    game.source === 'upload'
      ? 'ro-tile__sub ro-tile__sub--saved'
      : game.demo
        ? 'ro-tile__sub ro-tile__sub--sample'
        : 'ro-tile__sub'
  return `
    <a
      class="ro-tile${favorited ? ' ro-tile--fav' : ''}"
      href="${hrefFor(`/game/${game.id}`)}"
      data-ro-focusable="true"
    >
      ${coverMarkup(game.title, platformAccentVar(accent), cover)}
      ${favorited ? '<span class="ro-tile__fav" aria-label="Favorited">★</span>' : ''}
      <div class="ro-tile__meta">
        <span class="ro-tile__title">${escapeHtml(game.title)}</span>
        <span class="${subClass}">${sub}</span>
      </div>
    </a>
  `
}
