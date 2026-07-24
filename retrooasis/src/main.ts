import type { Route } from './lib/router'
import { getRoute, hrefFor, onRoute, startRouter } from './lib/router'
import { applyStoredAccent } from './lib/store'
import { renderLobby } from './views/lobby'
import { renderLibrary } from './views/library'
import { renderPlatform } from './views/platform'
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

app.innerHTML = `
  <div class="ro-shell">
    <header class="ro-topbar">
      <a class="ro-brand" href="${hrefFor('/')}">
        <span class="ro-brand__mark">RETRO OASIS</span>
        <span class="ro-brand__sub">Arcade</span>
      </a>
      <nav class="ro-nav" aria-label="Primary">
        <a data-nav="lobby" href="${hrefFor('/')}">Lobby</a>
        <a data-nav="library" href="${hrefFor('/library')}">Library</a>
        <a data-nav="upload" href="${hrefFor('/upload')}">Upload</a>
        <a data-nav="settings" href="${hrefFor('/settings')}">Settings</a>
      </nav>
    </header>
    <main class="ro-main" id="ro-main" tabindex="-1"></main>
    <footer class="ro-footer">RetroOasis · static ROM shelf · powered by EmulatorJS</footer>
  </div>
`

const mainEl = app.querySelector<HTMLElement>('#ro-main')
if (!mainEl) throw new Error('#ro-main missing')
const main = mainEl

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
  main.focus({ preventScroll: true })

  switch (route.name) {
    case 'lobby':
      await renderLobby(main)
      break
    case 'library':
      await renderLibrary(main)
      break
    case 'platform':
      await renderPlatform(main, route.platformId)
      break
    case 'game':
      await renderGameDetail(main, route.gameId)
      break
    case 'upload':
      renderUpload(main)
      break
    case 'settings':
      renderSettings(main)
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

startRouter()
void render(getRoute())
