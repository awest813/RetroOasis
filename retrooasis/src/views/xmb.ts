import {
  countByPlatform,
  findGame,
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
import { getFavorites, getLibretroCovers, getRecents } from '../lib/store'
import { hrefFor, navigate } from '../lib/router'
import { bindXmbFocus } from '../lib/xmbFocus'

type Cleanup = () => void

type XmbItem =
  | {
      kind: 'game'
      id: string
      title: string
      sub: string
      href: string
      accent: string
      cover: string | null
    }
  | {
      kind: 'action'
      id: string
      title: string
      sub: string
      href: string
      glyph: string
      accent: string
    }

interface XmbCategory {
  id: string
  label: string
  short: string
  accent: string
  items: XmbItem[]
  empty?: string
}

const SESSION_CAT = 'retrooasis.xmb.cat'
const SESSION_ITEM = 'retrooasis.xmb.item'

let cleanup: Cleanup | null = null

function readSessionIndex(key: string, max: number): number {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw == null) return 0
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.min(n, Math.max(0, max))
  } catch {
    return 0
  }
}

function writeSession(cat: number, item: number): void {
  try {
    sessionStorage.setItem(SESSION_CAT, String(cat))
    sessionStorage.setItem(SESSION_ITEM, String(item))
  } catch {
    /* ignore */
  }
}

function gameItem(game: Game, catalog: Catalog, useLibretro: boolean): XmbItem {
  const platform = findPlatform(catalog, game.platform)
  const accent = platformAccentVar(platform?.accent ?? 'sega')
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  return {
    kind: 'game',
    id: game.id,
    title: game.title,
    sub: platform?.shortName ?? game.platform,
    href: hrefFor(`/game/${game.id}`),
    accent,
    cover,
  }
}

function buildCategories(catalog: Catalog): XmbCategory[] {
  const useLibretro = getLibretroCovers()
  const recentIds = getRecents()
  const favoriteIds = getFavorites()
  const counts = countByPlatform(catalog)

  const recentGames = recentIds
    .map((id) => findGame(catalog, id))
    .filter((g): g is Game => !!g)

  const favoriteGames = favoriteIds
    .map((id) => findGame(catalog, id))
    .filter((g): g is Game => !!g)

  const homeItems: XmbItem[] = []
  const continueGame = recentGames[0]
  if (continueGame) {
    homeItems.push({
      ...gameItem(continueGame, catalog, useLibretro),
      id: `continue:${continueGame.id}`,
      title: continueGame.title,
      sub: 'Continue',
    })
  }
  homeItems.push({
    kind: 'action',
    id: 'browse-library',
    title: 'Browse library',
    sub: `${catalog.games.length} title${catalog.games.length === 1 ? '' : 's'}`,
    href: hrefFor('/library'),
    glyph: 'ALL',
    accent: 'var(--ro-accent)',
  })
  if (!continueGame) {
    homeItems.push({
      kind: 'action',
      id: 'home-add',
      title: 'Add a ROM',
      sub: 'Save it to your shelf',
      href: hrefFor('/upload'),
      glyph: 'ADD',
      accent: 'var(--ro-accent)',
    })
  }

  const categories: XmbCategory[] = [
    {
      id: 'home',
      label: 'Home',
      short: 'HOME',
      accent: 'var(--ro-accent)',
      items: homeItems,
    },
    {
      id: 'recent',
      label: 'Recent',
      short: 'REC',
      accent: 'var(--ro-accent)',
      items: recentGames.map((g) => gameItem(g, catalog, useLibretro)),
      empty: 'Nothing played yet. Open a game and it will show up here.',
    },
    {
      id: 'favorites',
      label: 'Favorites',
      short: 'FAV',
      accent: 'var(--ro-accent-ps)',
      items: favoriteGames.map((g) => gameItem(g, catalog, useLibretro)),
      empty: 'No favorites yet. Star a game from its details page.',
    },
  ]

  const platformsWithGames = catalog.platforms.filter((p) => (counts[p.id] ?? 0) > 0)
  for (const platform of platformsWithGames) {
    categories.push(platformCategory(platform, catalog, useLibretro))
  }

  categories.push({
    id: 'add',
    label: 'Add',
    short: 'ADD',
    accent: 'var(--ro-accent)',
    items: [
      {
        kind: 'action',
        id: 'upload',
        title: 'Add a ROM',
        sub: 'Upload and keep it on this device',
        href: hrefFor('/upload'),
        glyph: 'ADD',
        accent: 'var(--ro-accent)',
      },
    ],
  })

  categories.push({
    id: 'settings',
    label: 'Settings',
    short: 'SET',
    accent: 'var(--ro-text-dim)',
    items: [
      {
        kind: 'action',
        id: 'settings',
        title: 'Settings',
        sub: 'Accent, sound, covers, and more',
        href: hrefFor('/settings'),
        glyph: 'SET',
        accent: 'var(--ro-text-dim)',
      },
    ],
  })

  return categories
}

function platformCategory(
  platform: Platform,
  catalog: Catalog,
  useLibretro: boolean,
): XmbCategory {
  const games = gamesForPlatform(catalog, platform.id)
  return {
    id: `plat:${platform.id}`,
    label: platform.shortName,
    short: platform.shortName.slice(0, 4).toUpperCase(),
    accent: platformAccentVar(platform.accent),
    items: games.map((g) => gameItem(g, catalog, useLibretro)),
  }
}

function itemMarkup(item: XmbItem, active: boolean): string {
  if (item.kind === 'game') {
    return `
      <a
        class="ro-xmb__item"
        href="${item.href}"
        data-ro-xmb-item="${escapeAttr(item.id)}"
        data-active="${active ? 'true' : 'false'}"
        style="--item-accent: ${item.accent}"
      >
        <span class="ro-xmb__item-thumb">
          ${coverMarkup(item.title, item.accent, item.cover)}
        </span>
        <span class="ro-xmb__item-meta">
          <span class="ro-xmb__item-title">${escapeHtml(item.title)}</span>
          <span class="ro-xmb__item-sub">${escapeHtml(item.sub)}</span>
        </span>
      </a>`
  }

  return `
    <a
      class="ro-xmb__item"
      href="${item.href}"
      data-ro-xmb-item="${escapeAttr(item.id)}"
      data-active="${active ? 'true' : 'false'}"
      style="--item-accent: ${item.accent}"
    >
      <span class="ro-xmb__item-thumb ro-xmb__item-thumb--glyph">${escapeHtml(item.glyph)}</span>
      <span class="ro-xmb__item-meta">
        <span class="ro-xmb__item-title">${escapeHtml(item.title)}</span>
        <span class="ro-xmb__item-sub">${escapeHtml(item.sub)}</span>
      </span>
    </a>`
}

function catMarkup(cat: XmbCategory, active: boolean): string {
  return `
    <button
      type="button"
      class="ro-xmb__cat"
      data-ro-xmb-cat="${escapeAttr(cat.id)}"
      data-active="${active ? 'true' : 'false'}"
      style="--cat-accent: ${cat.accent}"
      aria-pressed="${active ? 'true' : 'false'}"
    >
      <span class="ro-xmb__cat-icon">${escapeHtml(cat.short)}</span>
      <span class="ro-xmb__cat-label">${escapeHtml(cat.label)}</span>
    </button>`
}

function railMarkup(cat: XmbCategory, itemIndex: number): string {
  if (!cat.items.length) {
    return `<p class="ro-xmb__empty">${escapeHtml(cat.empty ?? 'Nothing here yet.')}</p>`
  }
  return cat.items.map((item, i) => itemMarkup(item, i === itemIndex)).join('')
}

export async function renderXmb(root: HTMLElement): Promise<void> {
  cleanup?.()
  cleanup = null

  const catalog = await loadCatalog()
  const categories = buildCategories(catalog)

  let catIndex = readSessionIndex(SESSION_CAT, categories.length - 1)
  let itemIndex = readSessionIndex(SESSION_ITEM, Math.max(0, (categories[catIndex]?.items.length ?? 1) - 1))
  if (categories[catIndex] && itemIndex >= categories[catIndex].items.length) {
    itemIndex = 0
  }

  root.innerHTML = `
    <section class="ro-xmb" aria-label="Cross menu" tabindex="0">
      <p class="ro-xmb__brand" aria-hidden="true">RETRO OASIS</p>
      <div class="ro-xmb__cats" role="tablist" aria-label="Categories">
        ${categories.map((cat, i) => catMarkup(cat, i === catIndex)).join('')}
      </div>
      <div class="ro-xmb__rail">
        <div class="ro-xmb__rail-inner" data-anim="in" role="list">
          ${railMarkup(categories[catIndex], itemIndex)}
        </div>
      </div>
      <p class="ro-xmb__hint">← → categories · ↑ ↓ items · Enter open</p>
    </section>
  `

  const shell = root.querySelector<HTMLElement>('.ro-xmb')
  if (!shell) return

  const catsEl = shell.querySelector<HTMLElement>('.ro-xmb__cats')
  const railInner = shell.querySelector<HTMLElement>('.ro-xmb__rail-inner')
  if (!catsEl || !railInner) return

  let catShift = 0

  const syncTransforms = () => {
    const desktop = window.matchMedia('(min-width: 901px)').matches
    const activeCat = catsEl.querySelector<HTMLElement>('[data-active="true"]')

    if (desktop && activeCat) {
      // Measure without current shift so we can absolute-position the focused category.
      catsEl.style.setProperty('--xmb-shift', '0px')
      const shellRect = shell.getBoundingClientRect()
      const catRect = activeCat.getBoundingClientRect()
      const targetX = shellRect.width * 0.18
      const currentCenter = catRect.left - shellRect.left + catRect.width / 2
      catShift = targetX - currentCenter
      catsEl.style.setProperty('--xmb-shift', `${catShift}px`)
      shell.style.setProperty('--xmb-rail-x', `${Math.max(24, targetX - activeCat.offsetWidth / 2)}px`)
    }

    const activeItem = railInner.querySelector<HTMLElement>('[data-active="true"]')
    if (desktop && activeItem) {
      const items = Array.from(railInner.querySelectorAll<HTMLElement>('.ro-xmb__item'))
      const idx = items.indexOf(activeItem)
      if (idx >= 0) {
        const styles = getComputedStyle(railInner)
        const gap = Number.parseFloat(styles.rowGap || styles.gap) || 16
        let offset = 0
        for (let i = 0; i < idx; i++) {
          offset += items[i].offsetHeight + gap
        }
        // Place the active item near the top of the rail (under the category row).
        const shift = 12 - offset
        railInner.style.setProperty('--xmb-item-shift', `${shift}px`)
      }
    } else {
      railInner.style.setProperty('--xmb-item-shift', '0px')
    }

    if (!desktop && activeCat) {
      activeCat.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
    }
  }

  const paint = (opts?: { animateRail?: boolean }) => {
    const cat = categories[catIndex]
    if (!cat) return

    catsEl.querySelectorAll<HTMLElement>('.ro-xmb__cat').forEach((el, i) => {
      const on = i === catIndex
      el.dataset.active = on ? 'true' : 'false'
      el.setAttribute('aria-pressed', on ? 'true' : 'false')
    })

    if (opts?.animateRail) {
      railInner.dataset.anim = ''
      // force reflow for restart
      void railInner.offsetWidth
      railInner.dataset.anim = 'in'
    }

    railInner.innerHTML = railMarkup(cat, itemIndex)
    writeSession(catIndex, itemIndex)
    requestAnimationFrame(syncTransforms)
  }

  const activate = () => {
    const cat = categories[catIndex]
    const item = cat?.items[itemIndex]
    if (!item) return
    navigate(item.href)
  }

  catsEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-ro-xmb-cat]')
    if (!btn) return
    const id = btn.dataset.roXmbCat
    const next = categories.findIndex((c) => c.id === id)
    if (next < 0 || next === catIndex) return
    catIndex = next
    itemIndex = 0
    paint({ animateRail: true })
  })

  railInner.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.ro-xmb__item')
    if (!link) return
    const id = link.dataset.roXmbItem
    const next = categories[catIndex]?.items.findIndex((i) => i.id === id) ?? -1
    if (next >= 0) {
      itemIndex = next
      paint()
    }
  })

  const unbind = bindXmbFocus(shell, {
    getCategoryCount: () => categories.length,
    getItemCount: () => categories[catIndex]?.items.length ?? 0,
    getCategoryIndex: () => catIndex,
    getItemIndex: () => itemIndex,
    setCategoryIndex: (index) => {
      catIndex = index
      itemIndex = 0
      paint({ animateRail: true })
    },
    setItemIndex: (index) => {
      itemIndex = index
      paint()
    },
    confirm: activate,
  })

  const onResize = () => syncTransforms()
  window.addEventListener('resize', onResize)

  paint()
  shell.focus({ preventScroll: true })

  cleanup = () => {
    unbind()
    window.removeEventListener('resize', onResize)
  }
}

export function disposeXmb(): void {
  cleanup?.()
  cleanup = null
}
