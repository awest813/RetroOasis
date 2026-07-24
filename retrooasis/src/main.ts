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
import { renderLobby } from './views/lobby'
import { renderLibrary } from './views/library'
import { renderGameDetail } from './views/detail'
import { renderUpload } from './views/upload'
import { renderSettings } from './views/settings'

import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'

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
  <div class="ro-shell">
    <div class="ro-crt" aria-hidden="true"></div>
    <header class="ro-topbar">
      <a class="ro-brand" href="${hrefFor('/')}">
        <span class="ro-brand__mark">RETRO OASIS</span>
        <span class="ro-brand__sub">Arcade</span>
      </a>
      <div class="ro-topbar__right">
        <button type="button" class="ro-btn ro-btn--primary ro-install-btn" id="ro-install-top" hidden>Install</button>
        <nav class="ro-nav" aria-label="Primary">
          <a data-nav="lobby" href="${hrefFor('/')}">Lobby</a>
          <a data-nav="library" href="${hrefFor('/library')}">Library</a>
          <a data-nav="upload" href="${hrefFor('/upload')}">Upload</a>
          <a data-nav="settings" href="${hrefFor('/settings')}">Settings</a>
        </nav>
      </div>
    </header>
    <main class="ro-main" id="ro-main" tabindex="-1"></main>
    <footer class="ro-footer">RetroOasis · static ROM shelf · powered by EmulatorJS</footer>
  </div>
`

const mainEl = app.querySelector<HTMLElement>('#ro-main')
if (!mainEl) throw new Error('#ro-main missing')
const main = mainEl

const installTop = app.querySelector<HTMLButtonElement>('#ro-install-top')

function syncInstallButton(): void {
  if (!installTop) return
  const show = canInstallPwa()
  installTop.hidden = !show
}

installTop?.addEventListener('click', async () => {
  await promptPwaInstall()
  syncInstallButton()
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
    game: 'library',
    upload: 'upload',
    settings: 'settings',
    notfound: 'lobby',
  }
  const current = map[route.name] ?? 'lobby'
  app.querySelectorAll<HTMLAnchorElement>('.ro-nav a').forEach((link) => {
    const key = link.dataset.nav
    if (key === current) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
}

async function render(route: Route): Promise<void> {
  syncNav(route)
  syncInstallButton()
  main.focus({ preventScroll: true })

  switch (route.name) {
    case 'lobby':
      await renderLobby(main)
      break
    case 'library':
      await renderLibrary(main)
      break
    case 'platform':
      await renderLibrary(main, route.platformId)
      break
    case 'game':
      await renderGameDetail(main, route.gameId)
      break
    case 'upload':
      renderUpload(main)
      break
    case 'settings':
      await renderSettings(main)
      break
    default:
      main.innerHTML = `
        <section class="ro-view">
          <p class="ro-kicker">Lost in the oasis</p>
          <h1 class="ro-title">404</h1>
          <p class="ro-lede"><a href="${hrefFor('/')}">Return to lobby</a></p>
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
