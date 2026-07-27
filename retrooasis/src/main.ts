import type { Route } from './lib/router'
import { getRoute, hrefFor, onRoute, startRouter } from './lib/router'
import {
  applyStoredAccent,
  applyStoredCrt,
  applyStoredLayout,
} from './lib/store'
import { initCatalogExtras, onCatalogChange } from './lib/catalog'
import {
  canInstallPwa,
  initPwaInstall,
  onPwaInstallChange,
  promptPwaInstall,
  registerServiceWorker,
} from './lib/pwa'
import { installInputChrome } from './lib/input'
import { mountWave, setWaveActive } from './lib/wave'
import { disposeActiveView } from './lib/viewLifecycle'
import { disposeXmb, renderXmb } from './views/xmb'
import { renderCollection, renderLibrary } from './views/library'
import { renderGameDetail } from './views/detail'
import { renderUpload } from './views/upload'
import { renderSettings } from './views/settings'

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
installInputChrome()
initPwaInstall()
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
        <span class="ro-brand__sub">Arcade</span>
      </a>
      <div class="ro-topbar__right">
        <button type="button" class="ro-btn ro-btn--ghost ro-install-btn" id="ro-install-top" aria-label="Install RetroOasis" hidden>Install app</button>
        <nav class="ro-nav" aria-label="Primary">
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

function syncNav(route: Route): void {
  const map: Record<string, string> = {
    lobby: 'lobby',
    library: 'library',
    platform: 'library',
    collection: 'library',
    game: 'library',
    upload: 'upload',
    settings: 'settings',
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

async function render(route: Route): Promise<void> {
  disposeActiveView()
  syncNav(route)
  syncShellMode(route)
  syncInstallButton()

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
    default:
      main.focus({ preventScroll: true })
      main.innerHTML = `
        <section class="ro-view">
          <div class="ro-empty">
            <p class="ro-empty__title">Lost in the oasis</p>
            <p class="ro-empty__body">That route isn’t on the shelf. Head home or browse the library.</p>
            <div class="ro-btn-row ro-btn-row--center">
              <a class="ro-btn ro-btn--primary" href="${hrefFor('/')}">Home</a>
              <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}">Library</a>
            </div>
          </div>
        </section>
      `
  }
}

onRoute((route) => {
  void render(route)
})

onCatalogChange(() => {
  void render(getRoute())
})

startRouter()

void initCatalogExtras().finally(() => {
  void render(getRoute())
})
