import {
  findGame,
  findPlatform,
  loadCatalog,
  platformAccentVar,
} from '../lib/catalog'
import { coverMarkup, escapeHtml } from '../lib/dom'
import { bindGridFocus } from '../lib/focus'
import { getRecents } from '../lib/store'
import { hrefFor } from '../lib/router'

export async function renderLobby(root: HTMLElement): Promise<void> {
  const catalog = await loadCatalog()
  const recentIds = getRecents()
  const recents = recentIds
    .map((id) => findGame(catalog, id))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .slice(0, 6)
  const recent = recents[0]

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
    ${
      recents.length
        ? `
      <section class="ro-view ro-shelf" aria-label="Recently played">
        <div class="ro-section-head">
          <div>
            <p class="ro-kicker">Continue</p>
            <h2 class="ro-title">Recently played</h2>
          </div>
        </div>
        <div class="ro-grid" data-ro-grid>
          ${recents
            .map((game) => {
              const platform = findPlatform(catalog, game.platform)
              return `
              <a class="ro-tile" href="${hrefFor(`/game/${game.id}`)}" data-ro-focusable="true">
                ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), game.cover)}
                <div class="ro-tile__meta">
                  <span class="ro-tile__title">${escapeHtml(game.title)}</span>
                  <span class="ro-tile__sub">${escapeHtml(platform?.shortName ?? game.platform)}</span>
                </div>
              </a>`
            })
            .join('')}
        </div>
      </section>`
        : ''
    }
  `

  root.querySelector<HTMLElement>('.ro-lobby [data-ro-focusable="true"]')?.focus()
  const grid = root.querySelector<HTMLElement>('[data-ro-grid]')
  if (grid) bindGridFocus(grid)
}
