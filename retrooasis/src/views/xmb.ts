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
      blurb: string
    }
  | {
      kind: 'action'
      id: string
      title: string
      sub: string
      href: string
      glyph: string
      accent: string
      blurb: string
    }

interface XmbCategory {
  id: string
  label: string
  icon: string
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

function gameBlurb(game: Game, platformName: string): string {
  if (game.description?.trim()) return game.description.trim()
  const bits: string[] = []
  if (game.year) bits.push(String(game.year))
  if (game.developer) bits.push(game.developer)
  if (bits.length) return bits.join(' · ')
  const tags = (game.tags ?? []).filter((t) => t && t !== 'demo')
  if (game.demo && tags.length) return `Sample · ${tags.join(' · ')}`
  if (game.demo) return `Sample ${platformName} entry — open for details.`
  if (tags.length) return tags.join(' · ')
  return `Open for details and play on ${platformName}.`
}

function gameItem(game: Game, catalog: Catalog, useLibretro: boolean): XmbItem {
  const platform = findPlatform(catalog, game.platform)
  const accent = platformAccentVar(platform?.accent ?? 'sega')
  const cover = resolveCoverUrl(game.platform, game.title, game.cover, useLibretro)
  const platformName = platform?.shortName ?? game.platform
  return {
    kind: 'game',
    id: game.id,
    title: game.title,
    sub: platformName,
    href: hrefFor(`/game/${game.id}`),
    accent,
    cover,
    blurb: gameBlurb(game, platformName),
  }
}

function iconSvg(kind: string, short: string): string {
  const common = 'viewBox="0 0 32 32" aria-hidden="true" focusable="false"'
  switch (kind) {
    case 'home':
      return `<svg ${common}><path fill="currentColor" d="M16 5 4 14v13h8v-8h8v8h8V14z"/></svg>`
    case 'recent':
      return `<svg ${common}><path fill="none" stroke="currentColor" stroke-width="2.2" d="M16 7a9 9 0 1 1-7.4 3.8"/><path fill="currentColor" d="M15 11h2v6l4 2-1 1.7-5-2.7z"/><path fill="currentColor" d="M7 10h5v2H8.2l1.6 1.6-1.4 1.4L5 11.6z"/></svg>`
    case 'favorites':
      return `<svg ${common}><path fill="currentColor" d="m16 5.5 2.9 6.2 6.8.7-5.1 4.5 1.5 6.6L16 20.3 9.9 23.5l1.5-6.6-5.1-4.5 6.8-.7z"/></svg>`
    case 'add':
      return `<svg ${common}><path fill="currentColor" d="M14 6h4v8h8v4h-8v8h-4v-8H6v-4h8z"/></svg>`
    case 'settings':
      return `<svg ${common}><path fill="currentColor" d="M13.2 4h5.6l.7 3.2 3-.9 2.8 4.8-2.3 2.1.9 2.8-2.8.9v3.2l2.8.9-.9 2.8 2.3 2.1-2.8 4.8-3-.9-.7 3.2h-5.6l-.7-3.2-3 .9-2.8-4.8 2.3-2.1-.9-2.8 2.8-.9v-3.2l-2.8-.9.9-2.8-2.3-2.1 2.8-4.8 3 .9zm2.8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`
    default:
      return `<span class="ro-xmb__cat-text">${escapeHtml(short)}</span>`
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
      blurb: 'Pick up where you left off.',
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
    blurb: 'Open the full grid by system, recent, and favorites.',
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
      blurb: 'Upload a file and keep it on this device.',
    })
  }

  const categories: XmbCategory[] = [
    {
      id: 'home',
      label: 'Home',
      icon: iconSvg('home', 'HOME'),
      accent: 'var(--ro-accent)',
      items: homeItems,
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: iconSvg('recent', 'REC'),
      accent: 'var(--ro-accent)',
      items: recentGames.map((g) => gameItem(g, catalog, useLibretro)),
      empty: 'Nothing played yet. Open a game and it will show up here.',
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: iconSvg('favorites', 'FAV'),
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
    icon: iconSvg('add', 'ADD'),
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
        blurb: 'Files stay in this browser until you remove them.',
      },
    ],
  })

  categories.push({
    id: 'settings',
    label: 'Settings',
    icon: iconSvg('settings', 'SET'),
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
        blurb: 'Cabinet prefs stay on this device.',
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
  const short = platform.shortName.slice(0, 4).toUpperCase()
  return {
    id: `plat:${platform.id}`,
    label: platform.shortName,
    icon: iconSvg('platform', short),
    accent: platformAccentVar(platform.accent),
    items: games.map((g) => gameItem(g, catalog, useLibretro)),
  }
}

function itemMarkup(item: XmbItem, active: boolean, distance: number): string {
  const dist = Math.min(4, Math.abs(distance))
  if (item.kind === 'game') {
    return `
      <a
        class="ro-xmb__item"
        href="${item.href}"
        data-ro-xmb-item="${escapeAttr(item.id)}"
        data-active="${active ? 'true' : 'false'}"
        data-distance="${dist}"
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
      data-distance="${dist}"
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
      aria-label="${escapeAttr(cat.label)}"
      aria-pressed="${active ? 'true' : 'false'}"
    >
      <span class="ro-xmb__cat-icon">${cat.icon}</span>
      <span class="ro-xmb__cat-label">${escapeHtml(cat.label)}</span>
    </button>`
}

function railMarkup(cat: XmbCategory, itemIndex: number): string {
  if (!cat.items.length) {
    return `<p class="ro-xmb__empty" aria-hidden="true"></p>`
  }
  return cat.items.map((item, i) => itemMarkup(item, i === itemIndex, i - itemIndex)).join('')
}

function infoMarkup(cat: XmbCategory, itemIndex: number): string {
  const item = cat.items[itemIndex]
  if (!item) {
    const empty = cat.empty ?? 'Nothing here yet.'
    return `
      <p class="ro-xmb__info-kicker">${escapeHtml(cat.label)}</p>
      <h2 class="ro-xmb__info-title">Nothing here yet</h2>
      <p class="ro-xmb__info-body">${escapeHtml(empty)}</p>`
  }
  return `
    <p class="ro-xmb__info-kicker">${escapeHtml(cat.label)}</p>
    <h2 class="ro-xmb__info-title">${escapeHtml(item.title)}</h2>
    <p class="ro-xmb__info-body">${escapeHtml(item.blurb)}</p>`
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatClockDate(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export async function renderXmb(root: HTMLElement): Promise<void> {
  cleanup?.()
  cleanup = null

  const catalog = await loadCatalog()
  const categories = buildCategories(catalog)

  let catIndex = readSessionIndex(SESSION_CAT, categories.length - 1)
  let itemIndex = readSessionIndex(
    SESSION_ITEM,
    Math.max(0, (categories[catIndex]?.items.length ?? 1) - 1),
  )
  if (categories[catIndex] && itemIndex >= categories[catIndex].items.length) {
    itemIndex = 0
  }

  const now = new Date()

  root.innerHTML = `
    <section class="ro-xmb" aria-label="Cross menu" tabindex="0">
      <p class="ro-xmb__brand" aria-hidden="true">RETRO OASIS</p>
      <div class="ro-xmb__clock" aria-hidden="true">
        <span class="ro-xmb__clock-time" data-ro-xmb-clock>${escapeHtml(formatClock(now))}</span>
        <span class="ro-xmb__clock-date" data-ro-xmb-date>${escapeHtml(formatClockDate(now))}</span>
      </div>
      <div class="ro-xmb__cats" role="tablist" aria-label="Categories">
        ${categories.map((cat, i) => catMarkup(cat, i === catIndex)).join('')}
      </div>
      <div class="ro-xmb__rail">
        <div class="ro-xmb__rail-inner" data-anim="in" role="list">
          ${railMarkup(categories[catIndex], itemIndex)}
        </div>
      </div>
      <aside class="ro-xmb__info" aria-live="polite">
        ${infoMarkup(categories[catIndex], itemIndex)}
      </aside>
      <p class="ro-xmb__hint">← → categories · ↑ ↓ items · Enter open</p>
    </section>
  `

  const shell = root.querySelector<HTMLElement>('.ro-xmb')
  if (!shell) return

  const catsEl = shell.querySelector<HTMLElement>('.ro-xmb__cats')
  const railInner = shell.querySelector<HTMLElement>('.ro-xmb__rail-inner')
  const infoEl = shell.querySelector<HTMLElement>('.ro-xmb__info')
  const clockEl = shell.querySelector<HTMLElement>('[data-ro-xmb-clock]')
  const dateEl = shell.querySelector<HTMLElement>('[data-ro-xmb-date]')
  if (!catsEl || !railInner || !infoEl) return

  const syncTransforms = () => {
    const desktop = window.matchMedia('(min-width: 901px)').matches
    const activeCat = catsEl.querySelector<HTMLElement>('[data-active="true"]')

    if (desktop && activeCat) {
      catsEl.style.setProperty('--xmb-shift', '0px')
      const shellRect = shell.getBoundingClientRect()
      const catRect = activeCat.getBoundingClientRect()
      const targetX = shellRect.width * 0.2
      const currentCenter = catRect.left - shellRect.left + catRect.width / 2
      const catShift = targetX - currentCenter
      catsEl.style.setProperty('--xmb-shift', `${catShift}px`)
      shell.style.setProperty(
        '--xmb-rail-x',
        `${Math.max(24, targetX - activeCat.offsetWidth / 2)}px`,
      )
    }

    const activeItem = railInner.querySelector<HTMLElement>('[data-active="true"]')
    if (desktop && activeItem && activeCat) {
      const items = Array.from(railInner.querySelectorAll<HTMLElement>('.ro-xmb__item'))
      const idx = items.indexOf(activeItem)
      if (idx >= 0) {
        const styles = getComputedStyle(railInner)
        const gap = Number.parseFloat(styles.rowGap || styles.gap) || 16
        let offset = 0
        for (let i = 0; i < idx; i++) {
          offset += items[i].offsetHeight + gap
        }
        // Sit the focused item just under the category label — avoids icon/label overlap.
        const shellRect = shell.getBoundingClientRect()
        const label = activeCat.querySelector<HTMLElement>('.ro-xmb__cat-label')
        const anchor = label ?? activeCat
        const anchorRect = anchor.getBoundingClientRect()
        const focusTop = anchorRect.bottom - shellRect.top + 14
        const shift = focusTop - offset
        railInner.style.setProperty('--xmb-item-shift', `${shift}px`)
      }
    } else if (desktop) {
      // Empty category: park the empty rail under the active category.
      if (activeCat) {
        const shellRect = shell.getBoundingClientRect()
        const label = activeCat.querySelector<HTMLElement>('.ro-xmb__cat-label')
        const anchor = label ?? activeCat
        const anchorRect = anchor.getBoundingClientRect()
        const focusTop = anchorRect.bottom - shellRect.top + 14
        railInner.style.setProperty('--xmb-item-shift', `${focusTop}px`)
      } else {
        railInner.style.setProperty('--xmb-item-shift', '0px')
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
      void railInner.offsetWidth
      railInner.dataset.anim = 'in'
      window.setTimeout(() => {
        if (railInner.dataset.anim === 'in') railInner.dataset.anim = ''
      }, 420)
    }

    railInner.innerHTML = railMarkup(cat, itemIndex)
    infoEl.innerHTML = infoMarkup(cat, itemIndex)
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

  const tickClock = () => {
    const d = new Date()
    if (clockEl) clockEl.textContent = formatClock(d)
    if (dateEl) dateEl.textContent = formatClockDate(d)
  }
  const clockTimer = window.setInterval(tickClock, 30_000)

  const onResize = () => syncTransforms()
  window.addEventListener('resize', onResize)

  paint()
  shell.focus({ preventScroll: true })

  cleanup = () => {
    unbind()
    window.clearInterval(clockTimer)
    window.removeEventListener('resize', onResize)
  }
}

export function disposeXmb(): void {
  cleanup?.()
  cleanup = null
}
