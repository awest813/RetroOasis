import type { Route } from './lib/router'
import { getRoute, hrefFor, onRoute, startRouter } from './lib/router'
import {
  applyStoredAccent,
  applyStoredCrt,
  applyStoredLayout,
  getAccent,
} from './lib/store'
import { initCatalogExtras, onCatalogChange } from './lib/catalog'
import {
  applyPwaDisplayMode,
  canInstallPwa,
  initPwaInstall,
  onPwaInstallChange,
  promptPwaInstall,
  registerServiceWorker,
  syncThemeColor,
} from './lib/pwa'
import { installInputChrome } from './lib/input'
import { mountWave, setWaveActive } from './lib/wave'
import { disposeActiveView, registerViewCleanup } from './lib/viewLifecycle'
import { bindGridFocus } from './lib/focus'
import { disposeXmb, clearXmbSession, renderXmb } from './views/xmb'
import { renderCollection, renderLibrary } from './views/library'
import { renderGameDetail } from './views/detail'
import { renderUpload } from './views/upload'
import { renderSettings } from './views/settings'
import { renderSaves } from './views/saves'

import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import './styles/xmb.css'

const appEl = document.querySelector<HTMLDivElement>('#app')
if (!appEl) {
  throw new Error('#app missing')
}
const app = appEl

applyStoredAccent()
applyStoredCrt()
applyStoredLayout()
syncThemeColor(getAccent())
installInputChrome()
initPwaInstall()
applyPwaDisplayMode()
registerServiceWorker()

app.innerHTML = `
  <a class="ro-skip" href="#ro-main">Skip to shelf</a>
  <div class="ro-shell">
    <div class="ro-wave" aria-hidden="true">
      <canvas class="ro-wave__canvas" id="ro-wave-canvas"></canvas>
      <div class="ro-wave__fade"></div>
    </div>
    <div class="ro-crt" aria-hidden="true"></div>
    <header class="ro-topbar">
      <a class="ro-brand" href="${hrefFor('/')}">
        <span class="ro-brand__mark">RETRO OASIS</span>
        <span class="ro-brand__sub">Home</span>
      </a>
      <div class="ro-topbar__right">
        <button type="button" class="ro-btn ro-btn--ghost ro-install-btn" id="ro-install-top" aria-label="Install RetroOasis as an app" title="Install RetroOasis on this device" hidden>Install as app</button>
        <button type="button" class="ro-nav-toggle" id="ro-nav-toggle" aria-expanded="false" aria-controls="ro-nav" aria-label="Toggle navigation menu">
          <span class="ro-nav-toggle-icon"><span></span></span>
        </button>
        <nav class="ro-nav" id="ro-nav" aria-label="Primary navigation">
          <a data-nav="lobby" href="${hrefFor('/')}">Home</a>
          <a data-nav="library" href="${hrefFor('/library')}">Library</a>
          <a data-nav="upload" href="${hrefFor('/upload')}">Add ROM</a>
          <a data-nav="settings" href="${hrefFor('/settings')}">Settings</a>
        </nav>
      </div>
    </header>
    <main class="ro-main" id="ro-main" tabindex="-1"></main>
    <footer class="ro-footer">RetroOasis · your static ROM shelf · powered by EmulatorJS</footer>
  </div>
`

const shellEl = app.querySelector<HTMLElement>('.ro-shell')
const waveCanvas = app.querySelector<HTMLCanvasElement>('#ro-wave-canvas')
if (waveCanvas) mountWave(waveCanvas)

const mainEl = app.querySelector<HTMLElement>('#ro-main')
if (!mainEl) throw new Error('#ro-main missing')
const main = mainEl

main.innerHTML = `
  <section class="ro-view ro-loading" aria-busy="true" aria-live="polite">
    <p class="ro-kicker">RETRO OASIS</p>
    <p class="ro-loading__label">Loading your shelf…</p>
    <div class="ro-loading__bar" aria-hidden="true"></div>
  </section>
`

const installTop = app.querySelector<HTMLButtonElement>('#ro-install-top')

function syncInstallButton(): void {
  if (!installTop) return
  const show = canInstallPwa()
  installTop.hidden = !show
}

installTop?.addEventListener('click', async () => {
  installTop.disabled = true
  installTop.setAttribute('aria-busy', 'true')
  try {
    await promptPwaInstall()
  } finally {
    installTop.removeAttribute('aria-busy')
    installTop.disabled = false
    syncInstallButton()
  }
})

onPwaInstallChange(() => {
  syncInstallButton()
  if (getRoute().name === 'settings') void render(getRoute())
})

/** Home links should open the Home category, not the last XMB platform. */
app.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest?.('a')
  if (!link) return
  const href = link.getAttribute('href')
  if (href === '#/' || href === '#') clearXmbSession()
  
  // Close mobile nav when a nav link is clicked
  const navToggle = app.querySelector<HTMLButtonElement>('#ro-nav-toggle')
  const nav = app.querySelector<HTMLElement>('#ro-nav')
  if (navToggle && nav && navToggle.getAttribute('aria-expanded') === 'true') {
    const isNavLink = link.closest('.ro-nav')
    if (isNavLink) {
      navToggle.setAttribute('aria-expanded', 'false')
      nav.removeAttribute('data-open')
    }
  }
})

// Mobile nav toggle button handler
app.querySelector<HTMLButtonElement>('#ro-nav-toggle')?.addEventListener('click', () => {
  const navToggle = app.querySelector<HTMLButtonElement>('#ro-nav-toggle')
  const nav = app.querySelector<HTMLElement>('#ro-nav')
  if (!navToggle || !nav) return
  
  const isExpanded = navToggle.getAttribute('aria-expanded') === 'true'
  navToggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true')
  if (isExpanded) {
    nav.removeAttribute('data-open')
  } else {
    nav.setAttribute('data-open', 'true')
  }
})

function syncNav(route: Route): void {
  const map: Record<string, string> = {
    lobby: 'lobby',
    library: 'library',
    platform: 'library',
    collection: 'library',
    tag: 'library',
    game: 'library',
    upload: 'upload',
    settings: 'settings',
    saves: 'settings',
  }
  const current = map[route.name]
  app.querySelectorAll<HTMLAnchorElement>('.ro-nav a').forEach((link) => {
    const key = link.dataset.nav
    if (current && key === current) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
}

function syncShellMode(route: Route): void {
  const xmb = route.name === 'lobby'
  shellEl?.classList.toggle('ro-shell--xmb', xmb)
  setWaveActive(xmb)
  syncTopbarInert(xmb)
  if (!xmb) disposeXmb()
}

function syncTopbarInert(xmb: boolean): void {
  const topbar = shellEl?.querySelector('.ro-topbar')
  const desktopXmb = xmb && window.matchMedia('(min-width: 901px)').matches
  topbar?.toggleAttribute('inert', desktopXmb)
}

window.addEventListener('resize', () => {
  if (getRoute().name === 'lobby') syncTopbarInert(true)
})

window.matchMedia('(min-width: 901px)').addEventListener('change', () => {
  if (getRoute().name === 'lobby') syncTopbarInert(true)
})

/** Route renders are serialized: views await catalogs internally, so rapid
 *  hash navigation could otherwise let a stale async render paint over the
 *  newer route. The newest requested route always wins. */
let renderSeq = 0
let renderChain: Promise<void> = Promise.resolve()

function render(route: Route): Promise<void> {
  const seq = ++renderSeq
  renderChain = renderChain.then(async () => {
    if (seq !== renderSeq) return
    await renderRoute(route)
  })
  return renderChain
}

async function renderRoute(route: Route): Promise<void> {
  disposeActiveView()
  syncNav(route)
  syncShellMode(route)
  syncInstallButton()
  syncDocumentTitle(route)
  syncBrandSub(route)

  switch (route.name) {
    case 'lobby':
      await renderXmb(main)
      break
    case 'library':
      main.focus({ preventScroll: true })
      await renderCollection(main, 'all')
      break
    case 'platform':
      main.focus({ preventScroll: true })
      await renderLibrary(main, { kind: 'platform', id: route.platformId })
      break
    case 'collection':
      main.focus({ preventScroll: true })
      await renderCollection(main, route.collection)
      break
    case 'tag':
      main.focus({ preventScroll: true })
      await renderLibrary(main, { kind: 'tag', id: route.tagId })
      break
    case 'game':
      main.focus({ preventScroll: true })
      await renderGameDetail(main, route.gameId)
      break
    case 'upload':
      main.focus({ preventScroll: true })
      renderUpload(main)
      break
    case 'settings':
      main.focus({ preventScroll: true })
      await renderSettings(main)
      break
    case 'saves':
      main.focus({ preventScroll: true })
      await renderSaves(main)
      break
    default:
      main.focus({ preventScroll: true })
      main.innerHTML = `
        <section class="ro-view">
          <div class="ro-empty">
            <p class="ro-empty__title">Lost in the oasis</p>
            <p class="ro-empty__body">That route isn’t on the shelf. Head home or browse the library.</p>
            <div class="ro-btn-row ro-btn-row--center">
              <a class="ro-btn ro-btn--primary" href="${hrefFor('/')}" data-ro-focusable="true">Home</a>
              <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}" data-ro-focusable="true">Library</a>
            </div>
          </div>
        </section>
      `
      {
        const empty = main.querySelector<HTMLElement>('.ro-empty')
        if (empty) registerViewCleanup(bindGridFocus(empty))
        main.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
      }
  }
}

function syncDocumentTitle(route: Route): void {
  const base = 'RetroOasis'
  switch (route.name) {
    case 'lobby':
      document.title = `${base} · Home`
      break
    case 'library':
    case 'collection':
      document.title = `${base} · Library`
      break
    case 'tag':
      document.title = `${base} · #${route.tagId}`
      break
    case 'platform':
      document.title = `${base} · ${route.platformId}`
      break
    case 'game':
      document.title = `${base} · Game`
      break
    case 'upload':
      document.title = `${base} · Add a ROM`
      break
    case 'settings':
      document.title = `${base} · Settings`
      break
    case 'saves':
      document.title = `${base} · Local saves`
      break
    default:
      document.title = `${base} · Not found`
  }
}

const BRAND_SUBS: Record<string, string> = {
  recent: 'Recent',
  favorites: 'Favorites',
  all: 'All games',
}

function syncBrandSub(route: Route): void {
  const el = app.querySelector<HTMLElement>('.ro-brand__sub')
  if (!el) return
  let label = ''
  switch (route.name) {
    case 'lobby':
      label = 'Home'
      break
    case 'library':
    case 'collection':
      label = route.name === 'library' ? 'All games' : BRAND_SUBS[route.collection] ?? 'Library'
      break
    case 'tag':
      label = `#${route.tagId}`
      break
    case 'platform':
      label = route.platformId
      break
    case 'game':
      label = 'Game'
      break
    case 'upload':
      label = 'Add a ROM'
      break
    case 'settings':
      label = 'Settings'
      break
    case 'saves':
      label = 'Local saves'
      break
    default:
      label = ''
  }
  el.textContent = label
}

onRoute((route) => {
  void render(route)
})

onCatalogChange(() => {
  // The Add ROM view manages its own status line mid-batch and triggers this
  // refresh itself — re-rendering it would wipe in-flight progress.
  if (getRoute().name === 'upload') return
  void render(getRoute())
})

startRouter()

void initCatalogExtras().finally(() => {
  void render(getRoute())
})
