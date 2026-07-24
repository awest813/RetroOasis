import { getRecents } from '../lib/store'
import { loadCatalog, findGame } from '../lib/catalog'
import { hrefFor } from '../lib/router'

export async function renderLobby(root: HTMLElement): Promise<void> {
  const catalog = await loadCatalog()
  const recentId = getRecents()[0]
  const recent = recentId ? findGame(catalog, recentId) : undefined

  root.innerHTML = `
    <section class="ro-lobby ro-view" aria-label="RetroOasis lobby">
      <div class="ro-lobby__stage" aria-hidden="true"></div>
      <div class="ro-lobby__glow" aria-hidden="true"></div>
      <div class="ro-lobby__content">
        <p class="ro-kicker">Select game · Press start</p>
        <h1 class="ro-lobby__brand">RETRO OASIS</h1>
        <p class="ro-lobby__headline">Your ROM shelf. Your browser. Arcade soul.</p>
        <p class="ro-lede">
          Browse systems, pick a title, and launch EmulatorJS — a static oasis you can host anywhere.
        </p>
        <div class="ro-btn-row">
          ${
            recent
              ? `<a class="ro-btn ro-btn--primary" href="${hrefFor(`/game/${recent.id}`)}" data-ro-focusable="true">Continue · ${escapeHtml(recent.title)}</a>`
              : `<a class="ro-btn ro-btn--primary" href="${hrefFor('/library')}" data-ro-focusable="true">Press Start</a>`
          }
          <a class="ro-btn" href="${hrefFor('/library')}" data-ro-focusable="true">Browse Systems</a>
        </div>
      </div>
    </section>
  `

  root.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
