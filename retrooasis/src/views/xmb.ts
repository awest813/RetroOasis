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
import { xmbCategoryIcon, xmbPlatformIcon } from '../lib/xmbIcons'
import { getInputModality } from '../lib/inputModality'
import { sfxConfirm, sfxMove } from '../lib/sfx'

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

const SESSION_CAT = 'retrooasis.xmb.catId'
const SESSION_ITEM = 'retrooasis.xmb.itemId'

let cleanup: Cleanup | null = null
let renderGen = 0

function readSessionId(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeSession(catId: string, itemId: string | null): void {
  try {
    sessionStorage.setItem(SESSION_CAT, catId)
    if (itemId) sessionStorage.setItem(SESSION_ITEM, itemId)
    else sessionStorage.removeItem(SESSION_ITEM)
  } catch {
    /* ignore */
  }
}

function resolveSessionFocus(categories: XmbCategory[]): { catIndex: number; itemIndex: number } {
  const catId = readSessionId(SESSION_CAT)
  let catIndex = catId ? categories.findIndex((c) => c.id === catId) : 0
  if (catIndex < 0) catIndex = 0

  const itemId = readSessionId(SESSION_ITEM)
  const items = categories[catIndex]?.items ?? []
  let itemIndex = itemId ? items.findIndex((i) => i.id === itemId) : 0
  if (itemIndex < 0) itemIndex = 0
  return { catIndex, itemIndex }
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
    href: hrefFor('/library/@all'),
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
      icon: xmbCategoryIcon('home'),
      accent: 'var(--ro-accent)',
      items: homeItems,
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: xmbCategoryIcon('recent'),
      accent: 'var(--ro-accent)',
      items: recentGames.map((g) => gameItem(g, catalog, useLibretro)),
      empty: 'Nothing played yet. Open a game and it will show up here.',
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: xmbCategoryIcon('favorites'),
      accent: 'var(--ro-accent-ps)',
      items: favoriteGames.map((g) => gameItem(g, catalog, useLibretro)),
      empty: 'No favorites yet. Star a game from the library grid or its details page.',
    },
  ]

  const platformsWithGames = catalog.platforms.filter((p) => (counts[p.id] ?? 0) > 0)
  for (const platform of platformsWithGames) {
    categories.push(platformCategory(platform, catalog, useLibretro))
  }

  categories.push({
    id: 'add',
    label: 'Add',
    icon: xmbCategoryIcon('add'),
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
    icon: xmbCategoryIcon('settings'),
    accent: 'var(--ro-text-dim)',
    items: [
      {
        kind: 'action',
        id: 'settings',
        title: 'Settings',
        sub: 'Look, sound, library, and data',
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
  return {
    id: `plat:${platform.id}`,
    label: platform.shortName,
    icon: xmbPlatformIcon(platform.id, platform.shortName),
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
        ${active ? 'aria-current="true"' : ''}
        tabindex="-1"
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
      ${active ? 'aria-current="true"' : ''}
      tabindex="-1"
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
      ${active ? 'aria-current="true"' : ''}
      tabindex="-1"
    >
      <span class="ro-xmb__cat-icon">${cat.icon}</span>
      <span class="ro-xmb__cat-label">${escapeHtml(cat.label)}</span>
    </button>`
}

function railMarkup(cat: XmbCategory, itemIndex: number): string {
  if (!cat.items.length) {
    const copy = cat.empty ?? 'Nothing here yet.'
    return `
      <div class="ro-xmb__empty">
        <p>${escapeHtml(copy)}</p>
        ${emptyCtas(cat.id)}
      </div>`
  }
  return cat.items.map((item, i) => itemMarkup(item, i === itemIndex, i - itemIndex)).join('')
}

function emptyCtas(catId: string): string {
  if (catId === 'recent' || catId === 'favorites') {
    return `
      <div class="ro-btn-row">
        <a class="ro-btn" href="${hrefFor('/library/@all')}">Browse games</a>
      </div>`
  }
  return `
    <div class="ro-btn-row">
      <a class="ro-btn" href="${hrefFor('/upload')}">Add ROM</a>
    </div>`
}

function infoMarkup(cat: XmbCategory, itemIndex: number): string {
  const item = cat.items[itemIndex]
  if (!item) {
    return `
      <div class="ro-xmb__info-inner" data-ro-info>
        <div class="ro-xmb__info-copy">
          <p class="ro-xmb__info-kicker">${escapeHtml(cat.label)}</p>
          <h2 class="ro-xmb__info-title">${escapeHtml(cat.label)}</h2>
          <p class="ro-xmb__info-body">${escapeHtml(cat.empty ?? 'Nothing here yet.')}</p>
          ${emptyCtas(cat.id)}
        </div>
      </div>`
  }

  const stage =
    item.kind === 'game'
      ? `<div class="ro-xmb__stage" style="--item-accent: ${item.accent}">
          ${coverMarkup(item.title, item.accent, item.cover)}
        </div>`
      : `<div class="ro-xmb__stage ro-xmb__stage--glyph" style="--item-accent: ${item.accent}">
          <span class="ro-xmb__stage-glyph">${escapeHtml(item.glyph)}</span>
        </div>`

  const kicker =
    item.kind === 'game' && item.sub && item.sub !== cat.label ? item.sub : cat.label

  return `
    <div class="ro-xmb__info-inner" data-ro-info>
      ${stage}
      <div class="ro-xmb__info-copy">
        <p class="ro-xmb__info-kicker">${escapeHtml(kicker)}</p>
        <h2 class="ro-xmb__info-title">${escapeHtml(item.title)}</h2>
        <p class="ro-xmb__info-body">${escapeHtml(item.blurb)}</p>
      </div>
    </div>`
}

function formatClock(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')}`
}

function formatClockDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`
}

function hintCopy(): string {
  return getInputModality() === 'pad'
    ? 'D-pad move · A / Start open · B back'
    : '← → categories · ↑ ↓ items · Enter open'
}

function scheduleMinuteClock(tick: () => void): () => void {
  let timeout = 0
  let interval = 0
  const arm = () => {
    tick()
    const now = Date.now()
    const delay = 60_000 - (now % 60_000) + 50
    timeout = window.setTimeout(() => {
      tick()
      interval = window.setInterval(tick, 60_000)
    }, delay)
  }
  arm()
  return () => {
    window.clearTimeout(timeout)
    window.clearInterval(interval)
  }
}

export async function renderXmb(root: HTMLElement): Promise<void> {
  const gen = ++renderGen
  cleanup?.()
  cleanup = null

  const catalog = await loadCatalog()
  if (gen !== renderGen) return

  const categories = buildCategories(catalog)
  let { catIndex, itemIndex } = resolveSessionFocus(categories)

  const now = new Date()

  root.innerHTML = `
    <section class="ro-xmb" aria-label="Cross menu" role="application" tabindex="0">
      <p class="ro-xmb__brand">RETRO OASIS</p>
      <div class="ro-xmb__clock" aria-hidden="true">
        <span class="ro-xmb__clock-time" data-ro-xmb-clock>${escapeHtml(formatClock(now))}</span>
        <span class="ro-xmb__clock-date" data-ro-xmb-date>${escapeHtml(formatClockDate(now))}</span>
      </div>
      <p class="ro-xmb__live" data-ro-xmb-live aria-live="polite"></p>
      <div class="ro-xmb__cats" role="toolbar" aria-label="Categories">
        ${categories.map((cat, i) => catMarkup(cat, i === catIndex)).join('')}
      </div>
      <div class="ro-xmb__rail">
        <div class="ro-xmb__rail-inner">
          ${railMarkup(categories[catIndex], itemIndex)}
        </div>
      </div>
      <aside class="ro-xmb__info ro-xmb__info--in" aria-hidden="true">
        ${infoMarkup(categories[catIndex], itemIndex)}
      </aside>
      <p class="ro-xmb__hint" data-ro-xmb-hint>${escapeHtml(hintCopy())}</p>
    </section>
  `

  if (gen !== renderGen) return

  const shell = root.querySelector<HTMLElement>('.ro-xmb')
  if (!shell) return

  const catsEl = shell.querySelector<HTMLElement>('.ro-xmb__cats')
  const railInner = shell.querySelector<HTMLElement>('.ro-xmb__rail-inner')
  const infoEl = shell.querySelector<HTMLElement>('.ro-xmb__info')
  const liveEl = shell.querySelector<HTMLElement>('[data-ro-xmb-live]')
  const clockEl = shell.querySelector<HTMLElement>('[data-ro-xmb-clock]')
  const dateEl = shell.querySelector<HTMLElement>('[data-ro-xmb-date]')
  const hintEl = shell.querySelector<HTMLElement>('[data-ro-xmb-hint]')
  if (!catsEl || !railInner || !infoEl) return

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = motionQuery.matches
  let animTimer = 0
  let nudgeTimer = 0
  let enterTimer = 0
  let alive = true

  const thumbInsetX = (item: HTMLElement | null): number => {
    if (!item) return 28
    const thumb = item.querySelector<HTMLElement>('.ro-xmb__item-thumb')
    if (!thumb) return 28
    const padL = Number.parseFloat(getComputedStyle(item).paddingLeft) || 0
    return padL + thumb.offsetWidth / 2
  }

  const persist = () => {
    const cat = categories[catIndex]
    if (!cat) return
    writeSession(cat.id, cat.items[itemIndex]?.id ?? null)
  }

  const DESKTOP_MQ = '(min-width: 901px)'
  let wasDesktop = window.matchMedia(DESKTOP_MQ).matches
  let resizeRaf = 0
  let resizeIdle = 0
  let resizing = false

  const clearLayoutVars = () => {
    catsEl.style.removeProperty('--xmb-shift')
    shell.style.removeProperty('--xmb-rail-x')
    railInner.style.removeProperty('--xmb-item-shift')
  }

  const setResizing = (on: boolean) => {
    if (on === resizing) return
    resizing = on
    if (on) shell.dataset.resizing = '1'
    else delete shell.dataset.resizing
  }

  const syncTransforms = () => {
    const desktop = window.matchMedia(DESKTOP_MQ).matches
    const activeCat = catsEl.querySelector<HTMLElement>('[data-active="true"]')

    if (!desktop) {
      clearLayoutVars()
      if (activeCat) {
        activeCat.scrollIntoView({
          inline: 'center',
          block: 'nearest',
          behavior: reducedMotion || resizing ? 'auto' : 'smooth',
        })
      }
      wasDesktop = false
      return
    }

    if (!wasDesktop) {
      // Crossing mobile → desktop: drop stale mobile scroll and re-measure cold.
      clearLayoutVars()
      void shell.offsetWidth
    }
    wasDesktop = true

    if (activeCat) {
      // Keep the focus column left of mid so the info panel has room.
      const w = shell.clientWidth
      const targetRatio = w < 1100 ? 0.16 : w >= 1600 ? 0.22 : 0.2
      const targetX = w * targetRatio
      const catShift = targetX - (activeCat.offsetLeft + activeCat.offsetWidth / 2)
      catsEl.style.setProperty('--xmb-shift', `${catShift}px`)

      const catIcon = activeCat.querySelector<HTMLElement>('.ro-xmb__cat-icon')
      const iconCenterInCat = catIcon
        ? catIcon.offsetLeft + catIcon.offsetWidth / 2
        : activeCat.offsetWidth / 2
      const iconCenterX = activeCat.offsetLeft + iconCenterInCat + catShift
      const sampleItem =
        railInner.querySelector<HTMLElement>('.ro-xmb__item[data-active="true"]') ??
        railInner.querySelector<HTMLElement>('.ro-xmb__item')
      const inset = thumbInsetX(sampleItem)
      shell.style.setProperty('--xmb-rail-x', `${Math.max(8, iconCenterX - inset)}px`)
    }

    const activeItem = railInner.querySelector<HTMLElement>('[data-active="true"]')
    if (activeItem && activeCat) {
      const items = Array.from(railInner.querySelectorAll<HTMLElement>('.ro-xmb__item'))
      const idx = items.indexOf(activeItem)
      if (idx >= 0) {
        const styles = getComputedStyle(railInner)
        const gap = Number.parseFloat(styles.rowGap || styles.gap) || 16
        let offset = 0
        for (let i = 0; i < idx; i++) {
          offset += items[i].offsetHeight + gap
        }
        // Layout offsets stay stable while cats translateX during resize.
        const catIcon = activeCat.querySelector<HTMLElement>('.ro-xmb__cat-icon')
        const focusY = catIcon
          ? catsEl.offsetTop + activeCat.offsetTop + catIcon.offsetTop + catIcon.offsetHeight / 2
          : catsEl.offsetTop + activeCat.offsetTop + activeCat.offsetHeight / 2
        const shift = focusY - offset - activeItem.offsetHeight / 2
        railInner.style.setProperty('--xmb-item-shift', `${shift}px`)
      }
    } else if (activeCat) {
      const catIcon = activeCat.querySelector<HTMLElement>('.ro-xmb__cat-icon')
      const focusY = catIcon
        ? catsEl.offsetTop + activeCat.offsetTop + catIcon.offsetTop + catIcon.offsetHeight / 2
        : catsEl.offsetTop + activeCat.offsetTop + activeCat.offsetHeight / 2
      const iconHalf = (catIcon?.offsetHeight ?? 48) / 2
      // Park empty-state copy below the category icon, not through it.
      railInner.style.setProperty('--xmb-item-shift', `${Math.max(0, focusY + iconHalf + 18)}px`)
    } else {
      railInner.style.setProperty('--xmb-item-shift', '0px')
    }
  }

  const scheduleSync = () => {
    setResizing(true)
    window.clearTimeout(resizeIdle)
    if (resizeRaf) cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        syncTransforms()
        resizeIdle = window.setTimeout(() => {
          setResizing(false)
          syncTransforms()
        }, 140)
      })
    })
  }

  const syncViewportHeight = () => {
    const h = window.visualViewport?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--ro-vvh', `${Math.round(h)}px`)
  }

  const syncChromeHeight = () => {
    const topbar = document.querySelector<HTMLElement>('.ro-shell--xmb .ro-topbar')
    if (!topbar) return
    const desktop = window.matchMedia(DESKTOP_MQ).matches
    if (desktop) {
      shell.style.removeProperty('--ro-xmb-chrome')
      return
    }
    const h = Math.ceil(topbar.getBoundingClientRect().height)
    if (h > 0) shell.style.setProperty('--ro-xmb-chrome', `${h}px`)
  }

  const announce = (cat: XmbCategory) => {
    if (!liveEl) return
    const item = cat.items[itemIndex]
    liveEl.textContent = item
      ? `${cat.label}. ${item.title}. ${item.sub}`
      : `${cat.label}. ${cat.empty ?? 'Nothing here yet.'}`
  }

  const dismissHint = () => {
    hintEl?.classList.add('ro-xmb__hint--gone')
  }

  const syncHintCopy = () => {
    if (!hintEl || hintEl.classList.contains('ro-xmb__hint--gone')) return
    hintEl.textContent = hintCopy()
  }

  const paintInfo = (cat: XmbCategory, dir?: 'left' | 'right' | 'up' | 'down') => {
    infoEl.classList.remove('ro-xmb__info--in', 'ro-xmb__info--from-left', 'ro-xmb__info--from-right')
    if (dir === 'left') infoEl.classList.add('ro-xmb__info--from-left')
    if (dir === 'right') infoEl.classList.add('ro-xmb__info--from-right')
    infoEl.innerHTML = infoMarkup(cat, itemIndex)
    void infoEl.offsetWidth
    infoEl.classList.add('ro-xmb__info--in')
  }

  const paint = (opts?: {
    animateRail?: boolean
    railDir?: 'left' | 'right'
    itemNudge?: 'up' | 'down'
  }) => {
    const cat = categories[catIndex]
    if (!cat) return

    catsEl.querySelectorAll<HTMLElement>('.ro-xmb__cat').forEach((el, i) => {
      const on = i === catIndex
      el.dataset.active = on ? 'true' : 'false'
      el.setAttribute('aria-pressed', on ? 'true' : 'false')
      if (on && opts?.animateRail && !reducedMotion) {
        el.classList.remove('ro-xmb__cat--settle')
        void el.offsetWidth
        el.classList.add('ro-xmb__cat--settle')
      } else {
        el.classList.remove('ro-xmb__cat--settle')
      }
    })

    window.clearTimeout(animTimer)
    window.clearTimeout(nudgeTimer)
    if (opts?.animateRail && !reducedMotion) {
      railInner.dataset.anim = ''
      delete railInner.dataset.dir
      void railInner.offsetWidth
      railInner.dataset.anim = 'in'
      if (opts.railDir) railInner.dataset.dir = opts.railDir
      animTimer = window.setTimeout(() => {
        if (railInner.dataset.anim === 'in') {
          railInner.dataset.anim = ''
          delete railInner.dataset.dir
        }
      }, 480)
    } else {
      railInner.dataset.anim = ''
      delete railInner.dataset.dir
    }

    railInner.innerHTML = railMarkup(cat, itemIndex)

    if (opts?.itemNudge && !reducedMotion) {
      const active = railInner.querySelector<HTMLElement>('.ro-xmb__item[data-active="true"]')
      if (active) {
        active.dataset.nudge = opts.itemNudge
        nudgeTimer = window.setTimeout(() => {
          delete active.dataset.nudge
        }, 280)
      }
    }

    const infoDir = opts?.railDir ?? opts?.itemNudge
    paintInfo(cat, infoDir)
    announce(cat)
    persist()
    requestAnimationFrame(() => {
      syncChromeHeight()
      syncTransforms()
      if (shell.contains(document.activeElement) || document.activeElement === shell) {
        shell.focus({ preventScroll: true })
      }
    })
  }

  const activate = () => {
    const cat = categories[catIndex]
    const item = cat?.items[itemIndex]
    if (item) {
      navigate(item.href)
      return
    }
    // Empty shelf: confirm follows the CTA instead of no-op.
    if (cat?.id === 'recent' || cat?.id === 'favorites') {
      navigate(hrefFor('/library/@all'))
      return
    }
    navigate(hrefFor('/upload'))
  }

  catsEl.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-ro-xmb-cat]')
    if (!btn) return
    const id = btn.dataset.roXmbCat
    const next = categories.findIndex((c) => c.id === id)
    if (next < 0) return
    dismissHint()
    if (next === catIndex) return
    sfxMove()
    const railDir = next > catIndex ? 'right' : 'left'
    catIndex = next
    itemIndex = 0
    paint({ animateRail: true, railDir })
  })

  railInner.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('.ro-xmb__item')
    if (!link) return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    const id = link.dataset.roXmbItem
    const next = categories[catIndex]?.items.findIndex((i) => i.id === id) ?? -1
    if (next < 0) return
    itemIndex = next
    persist()
    dismissHint()
    sfxConfirm()
    activate()
  })

  let wheelLock = 0
  const onWheel = (event: WheelEvent) => {
    const now = performance.now()
    if (now < wheelLock) {
      event.preventDefault()
      return
    }
    const horiz = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey
    const delta = horiz ? event.deltaX || event.deltaY : event.deltaY
    if (Math.abs(delta) < 6) return
    event.preventDefault()
    wheelLock = now + 150
    dismissHint()
    if (horiz) {
      const next =
        delta > 0 ? Math.min(categories.length - 1, catIndex + 1) : Math.max(0, catIndex - 1)
      if (next === catIndex) return
      sfxMove()
      const railDir = next > catIndex ? 'right' : 'left'
      catIndex = next
      itemIndex = 0
      paint({ animateRail: true, railDir })
      return
    }
    const count = categories[catIndex]?.items.length ?? 0
    if (!count) return
    const next = delta > 0 ? Math.min(count - 1, itemIndex + 1) : Math.max(0, itemIndex - 1)
    if (next === itemIndex) return
    sfxMove()
    const itemNudge = next > itemIndex ? 'down' : 'up'
    itemIndex = next
    paint({ itemNudge })
  }
  shell.addEventListener('wheel', onWheel, { passive: false })

  const unbind = bindXmbFocus(shell, {
    getCategoryCount: () => categories.length,
    getItemCount: () => categories[catIndex]?.items.length ?? 0,
    getCategoryIndex: () => catIndex,
    getItemIndex: () => itemIndex,
    setCategoryIndex: (index) => {
      dismissHint()
      if (index === catIndex) return
      const railDir = index > catIndex ? 'right' : 'left'
      catIndex = index
      itemIndex = 0
      paint({ animateRail: true, railDir })
    },
    setItemIndex: (index) => {
      dismissHint()
      if (index === itemIndex) return
      const itemNudge = index > itemIndex ? 'down' : 'up'
      itemIndex = index
      paint({ itemNudge })
    },
    confirm: activate,
  })

  const tickClock = () => {
    const d = new Date()
    if (clockEl) {
      const next = formatClock(d)
      if (clockEl.textContent !== next) {
        clockEl.textContent = next
        if (!reducedMotion) {
          clockEl.classList.remove('ro-xmb__clock-time--tick')
          void clockEl.offsetWidth
          clockEl.classList.add('ro-xmb__clock-time--tick')
        }
      }
    }
    if (dateEl) dateEl.textContent = formatClockDate(d)
  }
  const stopClock = scheduleMinuteClock(tickClock)

  const onResize = () => {
    syncViewportHeight()
    syncChromeHeight()
    scheduleSync()
  }
  syncViewportHeight()
  syncChromeHeight()
  window.addEventListener('resize', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)

  const desktopMq = window.matchMedia(DESKTOP_MQ)
  const onBreakpoint = () => {
    syncChromeHeight()
    scheduleSync()
  }
  desktopMq.addEventListener('change', onBreakpoint)

  const shellRo =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleSync())
      : null
  shellRo?.observe(shell)

  const topbar = document.querySelector('.ro-shell--xmb .ro-topbar')
  const topbarRo =
    typeof ResizeObserver !== 'undefined' && topbar
      ? new ResizeObserver(() => {
          syncChromeHeight()
          scheduleSync()
        })
      : null
  if (topbar) topbarRo?.observe(topbar)

  const layoutObserver = new MutationObserver(() => scheduleSync())
  layoutObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-layout'],
  })

  void document.fonts?.ready?.then(() => {
    if (alive) scheduleSync()
  })

  const onMotionChange = () => {
    reducedMotion = motionQuery.matches
  }
  motionQuery.addEventListener('change', onMotionChange)

  const modalityObserver = new MutationObserver(syncHintCopy)
  modalityObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-input'],
  })
  syncHintCopy()

  if (!reducedMotion) {
    shell.dataset.enter = '1'
    enterTimer = window.setTimeout(() => {
      delete shell.dataset.enter
    }, 900)
  }

  paint({ animateRail: true, railDir: 'right' })
  requestAnimationFrame(() => {
    if (document.activeElement?.classList.contains('ro-skip')) return
    shell.focus({ preventScroll: true })
  })

  const onSelectStart = (event: Event) => {
    event.preventDefault()
  }
  shell.addEventListener('selectstart', onSelectStart)

  cleanup = () => {
    alive = false
    unbind()
    stopClock()
    window.clearTimeout(animTimer)
    window.clearTimeout(nudgeTimer)
    window.clearTimeout(enterTimer)
    window.clearTimeout(resizeIdle)
    if (resizeRaf) cancelAnimationFrame(resizeRaf)
    shellRo?.disconnect()
    topbarRo?.disconnect()
    layoutObserver.disconnect()
    modalityObserver.disconnect()
    motionQuery.removeEventListener('change', onMotionChange)
    desktopMq.removeEventListener('change', onBreakpoint)
    window.removeEventListener('resize', onResize)
    window.visualViewport?.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    shell.removeEventListener('wheel', onWheel)
    shell.removeEventListener('selectstart', onSelectStart)
  }
}

export function disposeXmb(): void {
  renderGen += 1
  cleanup?.()
  cleanup = null
}
