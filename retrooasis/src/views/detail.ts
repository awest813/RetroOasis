import {
  findGame,
  findPlatform,
  loadCatalog,
  platformAccentVar,
  refreshCatalogView,
  reloadUploadedLibrary,
} from '../lib/catalog'
import { coreNeedsThreads, coreOptionsMarkup, normalizePlayCore } from '../lib/cores'
import { resolveCoverUrls, romFilenameFromUrl } from '../lib/covers'
import { coverResourceLinks } from '../lib/coverResources'
import { coverMarkup, escapeAttr, escapeHtml, hydrateCovers } from '../lib/dom'
import { hrefFor, navigate } from '../lib/router'
import { launchGame } from '../lib/play'
import { checkLanService, LAN_CORES, LINK_CORES } from '../lib/lan'
import {
  clearOverride,
  exportOverridesJson,
  formFieldsToPatch,
  getOverride,
  setOverride,
} from '../lib/overrides'
import { sfxToggle } from '../lib/sfx'
import { forgetGameId, getLibretroCovers, getTransferPak, isFavorite, setTransferPak, toggleFavorite } from '../lib/store'
import { getUploadedRomRecord, removeUploadedRom } from '../lib/uploadedLibrary'
import { friendlyError } from '../lib/userErrors'
import { bindGridFocus } from '../lib/focus'
import { suppressPadBackUntilRelease } from '../lib/input'
import { registerViewCleanup } from '../lib/viewLifecycle'
import { icon } from '../lib/icons'

export async function renderGameDetail(root: HTMLElement, gameId: string): Promise<void> {
  let active = true
  let focusCleanup: (() => void) | null = null
  let editing = false
  let menuOpen = false
  const lanAbort = new AbortController()
  let paint: (restoreFocusId?: string) => void = () => {}

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (editing) {
      // Cancel the metadata form instead of leaving the page.
      event.preventDefault()
      event.stopPropagation()
      editing = false
      paint('ro-options-btn')
      return
    }
    if (!menuOpen) return
    // Close the menu without triggering the global Escape/back shortcut.
    event.preventDefault()
    event.stopPropagation()
    menuOpen = false
    paint('ro-options-btn')
  }

  registerViewCleanup(() => {
    active = false
    lanAbort.abort()
    document.removeEventListener('keydown', onKey)
    focusCleanup?.()
    focusCleanup = null
  })

  const catalog = await loadCatalog()
  if (!active) return
  const game = findGame(catalog, gameId)

  if (!game) {
    root.innerHTML = `
      <section class="ro-view">
        <div class="ro-empty">
          <p class="ro-empty__title">Game not found</p>
          <p class="ro-empty__body">That title isn’t on this shelf anymore.</p>
          <div class="ro-btn-row ro-btn-row--center">
            <a class="ro-btn ro-btn--primary" href="${hrefFor('/')}" data-ro-focusable="true">Home</a>
            <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}" data-ro-focusable="true">Library</a>
          </div>
        </div>
      </section>
    `
    const empty = root.querySelector<HTMLElement>('.ro-empty')
    if (empty) focusCleanup = bindGridFocus(empty)
    root.querySelector<HTMLElement>('[data-ro-focusable="true"]')?.focus()
    return
  }

  const platform = findPlatform(catalog, game.platform)
  const cover = resolveCoverUrls(
    game.platform,
    game.title,
    game.cover,
    getLibretroCovers() && !game.demo,
    game.romFilename ?? romFilenameFromUrl(game.file),
  )
  let favorited = isFavorite(game.id)
  let busy = false
  const linkSystem = LINK_CORES.has(normalizePlayCore(game.core))
  // N64 Transfer Pak (Pokémon Stadium): any Game Boy / Color game in the library.
  const transferCarts = normalizePlayCore(game.core) === 'n64' && !game.demo
    ? catalog.games.filter(g => normalizePlayCore(g.core) === 'gb' && !g.demo).sort((a, b) => a.title.localeCompare(b.title))
    : []
  let transferPakId = transferCarts.some(g => g.id === getTransferPak(game.id)) ? getTransferPak(game.id) : ''
  const lanCandidate = (LAN_CORES.has(normalizePlayCore(game.core)) || linkSystem) && !game.demo
  const lanCheck = lanCandidate ? checkLanService(lanAbort.signal) : null
  let lan = false
  // Online card state: checking → ready, or the reason hosting isn't available here.
  type OnlineState = 'checking' | 'ready' | 'off' | 'needs-core' | 'needs-link'
  let onlineState: OnlineState = 'checking'
  const ONLINE_STATE_TEXT: Record<OnlineState, string> = { checking: 'Checking…', ready: 'Ready', off: 'Room service off', 'needs-core': 'Core not prepared', 'needs-link': 'Link cores not built' }
  const onlineHelp = (state: OnlineState): string => ({
    checking: '',
    ready: '',
    off: 'To host, start the room service on this computer.',
    'needs-core': 'Prepare this system’s multiplayer core once on this computer.',
    'needs-link': 'Build the link cores once on this computer.',
  })[state]
  let fileLabel = game.file
  if (game.source === 'upload') {
    const record = await getUploadedRomRecord(game.id)
    if (!active) return
    const name = record?.filename || 'Saved on this device'
    fileLabel = name.replace(/\.[^.]+$/, '') || name
    if (record?.parts && record.parts.length > 1) {
      fileLabel = `${record.parts[0]} + ${record.parts.length - 1} more`
    }
  }

  const startPlay = async (focusId: string, lanHost: boolean | 'link' = false): Promise<void> => {
    if (busy || !active) return
    busy = true
    paint(focusId)
    const status = root.querySelector<HTMLElement>('#ro-play-status')
    if (status && !game.demo) {
      status.hidden = false
      status.textContent = lanHost === 'link' ? 'Opening Trade & link…' : 'Starting emulator…'
    }
    try {
      await launchGame(game, undefined, lanHost, transferCarts.find(g => g.id === transferPakId))
    } catch (err) {
      if (!active) return
      busy = false
      paint(focusId)
      const el = root.querySelector<HTMLElement>('#ro-play-status')
      if (el) {
        el.hidden = false
        el.textContent = friendlyError(err, 'Couldn’t start that game. Try again.')
      }
    }
  }

  paint = (restoreFocusId?: string) => {
    if (!active) return
    focusCleanup?.()
    focusCleanup = null
    const over = getOverride(game.id)
    const playCore = normalizePlayCore(game.core)
    const threadBadge = coreNeedsThreads(playCore)
      ? '<span class="ro-badge">Threads</span>'
      : ''
    const libraryHref = platform
      ? hrefFor(`/library/${platform.id}`)
      : hrefFor('/library')
    const showMenu = menuOpen && !editing
    root.innerHTML = `
      <section class="ro-view ro-detail">
        <div class="ro-detail__cover">
          ${coverMarkup(game.title, platformAccentVar(platform?.accent ?? 'sega'), cover)}
        </div>
        <div class="ro-stack">
          <p class="ro-kicker">
            <a href="${hrefFor('/')}">Home</a>
            <span aria-hidden="true"> / </span>
            <a href="${hrefFor('/library')}">Library</a>
            ${
              platform
                ? `<span aria-hidden="true"> / </span><a href="${hrefFor(`/library/${platform.id}`)}">${escapeHtml(platform.shortName)}</a>`
                : ''
            }
          </p>
          <h1 class="ro-title">${escapeHtml(game.title)}</h1>
          <div class="ro-detail__badges">
            <span class="ro-badge">${escapeHtml(platform?.shortName ?? game.platform)}</span>
            ${game.demo ? '<span class="ro-badge">Sample</span>' : ''}
            ${game.tags?.includes('disc-set') ? '<span class="ro-badge">Disc set</span>' : ''}
            ${over ? '<span class="ro-badge">Edited locally</span>' : ''}
            ${threadBadge}
          </div>
          <p class="ro-lede">
            Core <strong>${escapeHtml(playCore)}</strong>
            · File <code>${escapeHtml(fileLabel)}</code>
            ${game.year != null ? ` · ${escapeHtml(String(game.year))}` : ''}
            ${game.developer ? ` · ${escapeHtml(game.developer)}` : ''}
          </p>
          ${
            game.description
              ? `<p class="ro-lede">${escapeHtml(game.description)}</p>`
              : ''
          }
          ${
            game.demo
              ? `<p class="ro-muted">This is a sample entry for exploring the UI — the ROM file isn’t included. Use <a href="${hrefFor('/upload')}">Add ROM</a> or link a folder in <a href="${hrefFor('/settings')}">Settings</a> to play a real game.</p>`
              : ''
          }
          ${
            game.source === 'upload'
              ? `<p class="ro-muted">Saved on this device. Clearing this site’s browser data will remove it too.</p>`
              : ''
          }
          <p class="ro-muted" id="ro-play-status" role="status" aria-live="polite" hidden></p>
          <div class="ro-btn-row ro-detail__actions"${busy ? ' aria-busy="true"' : ''}>
            ${
              game.demo
                ? `<a class="ro-btn ro-btn--primary ro-btn--lg" href="${hrefFor('/upload')}" data-ro-focusable="true">Add ROM</a>`
                : `<button type="button" class="ro-btn ro-btn--primary ro-btn--lg" id="ro-play" data-ro-focusable="true"${busy ? ' disabled' : ''}>${busy ? 'Starting…' : 'Play'}</button>`
            }
            <button
              type="button"
              class="ro-btn ro-btn--ghost"
              id="ro-options-btn"
              data-ro-focusable="true"
              aria-expanded="${showMenu}"
              aria-controls="ro-options-menu"
            >${icon('add')} Options</button>
          </div>
          ${lanCandidate ? `
          <section class="ro-online-card" aria-labelledby="ro-online-title" id="ro-online" data-state="${onlineState}">
            <div class="ro-online-card__head">
              <h2 class="ro-online-card__title" id="ro-online-title">${linkSystem ? 'Trade &amp; link' : 'Online play'}</h2>
              <span class="ro-online-card__state" id="ro-online-state">${ONLINE_STATE_TEXT[onlineState]}</span>
            </div>
            <p class="ro-muted">${linkSystem
              ? 'Trade and battle with a friend over an emulated link cable. They join from their own browser on the same Wi-Fi, with their own cartridge and save.'
              : normalizePlayCore(game.core) === 'n64'
                ? 'Up to 4 players on the same Wi-Fi. Friends join from their browser with no ROM needed, and everyone sees your screen.'
                : '2 players on the same Wi-Fi. Your friend joins from their browser with no ROM needed and sees your screen.'}</p>
            <p class="ro-muted ro-online-card__help" id="ro-online-help"${onlineHelp(onlineState) ? '' : ' hidden'}>${onlineHelp(onlineState)} <a href="${hrefFor('/settings')}">Online play setup</a></p>
            <div class="ro-btn-row">
              <button type="button" class="ro-btn ro-btn--lg${lan ? ' ro-btn--primary' : ''}" id="ro-host-lan" data-ro-focusable="true"${busy || !lan ? ' disabled' : ''}>${linkSystem ? 'Start Trade &amp; link' : 'Host a room'}</button>
            </div>
          </section>` : ''}
          ${
            transferCarts.length || (normalizePlayCore(game.core) === 'n64' && /stadium/i.test(game.title))
              ? `<section class="ro-online-card ro-tpk-card" aria-labelledby="ro-tpk-title">
              <div class="ro-online-card__head">
                <h2 class="ro-online-card__title" id="ro-tpk-title">Transfer Pak</h2>
                <span class="ro-online-card__state">Controller 1</span>
              </div>
              ${transferCarts.length ? `<label class="ro-muted ro-transfer-pak">Game Boy cartridge
              <select class="ro-input" id="ro-transfer-pak" data-ro-focusable="true" aria-describedby="ro-transfer-pak-help">
                <option value="">None</option>
                ${transferCarts.map(g => `<option value="${escapeAttr(g.id)}"${g.id === transferPakId ? ' selected' : ''}>${escapeHtml(g.title)}</option>`).join('')}
              </select></label>` : `<p class="ro-muted">Add a Game Boy or Game Boy Color game with <a href="${hrefFor('/upload')}">Add ROM</a> to plug it in here.</p>`}
              <ul class="ro-tpk-card__facts" id="ro-transfer-pak-help">
                <li><strong>Games</strong> Stadium: Red, Blue, Yellow. Stadium 2: those plus Gold, Silver, Crystal.</li>
                <li><strong>Save</strong> Uses the cartridge’s RetroOasis save. Save it in a Pokémon Center, or import a .sav in its player. Changes come back here, with a backup.</li>
                <li><strong>Not yet</strong> GB Tower (playing the Game Boy game on the TV).</li>
              </ul>
            </section>`
              : ''
          }
          ${
            showMenu
              ? `
          <div class="ro-options" id="ro-options-menu" role="group" aria-label="Game options">
            <p class="ro-options__label" aria-hidden="true">Options</p>
            <button type="button" class="ro-options__item" id="ro-menu-favorite" data-ro-focusable="true" aria-pressed="${favorited}">
              ${icon('favorite', favorited)}<span>${favorited ? 'Favorited' : 'Favorite'}</span>
            </button>
            <button type="button" class="ro-options__item" id="ro-edit" data-ro-focusable="true">
              ${icon('edit')}<span>Edit metadata</span>
            </button>
            <a class="ro-options__item" href="${hrefFor('/saves')}" data-ro-focusable="true">${icon('saves')}<span>Local saves</span></a>
            <a class="ro-options__item" href="${libraryHref}" data-ro-focusable="true">${icon('back')}<span>Back to library</span></a>
            ${
              game.demo
                ? `<button type="button" class="ro-options__item" id="ro-demo-play" data-ro-focusable="true"${busy ? ' disabled' : ''}>${icon('play')}<span>Try sample anyway</span></button>`
                : ''
            }
            ${
              game.source === 'upload'
                ? `<button type="button" class="ro-options__item ro-options__item--danger" id="ro-remove-upload" data-ro-focusable="true">${icon('remove')}<span>Remove from library</span></button>`
                : ''
            }
          </div>`
              : ''
          }
          ${
            editing
              ? `
            <form class="ro-stack ro-meta-form" id="ro-meta-form">
              <label class="ro-muted">Title <input class="ro-input" name="title" value="${escapeAttr(over?.title ?? game.title)}" /></label>
              <label class="ro-muted">Core
                <select class="ro-input" name="core">
                  ${coreOptionsMarkup(over?.core ?? game.core)}
                </select>
              </label>
              <label class="ro-muted">Year <input class="ro-input" name="year" value="${escapeAttr(String(over?.year ?? game.year ?? ''))}" /></label>
              <label class="ro-muted">Developer <input class="ro-input" name="developer" value="${escapeAttr(over?.developer ?? game.developer ?? '')}" /></label>
              <label class="ro-muted">Cover URL <input class="ro-input" name="cover" aria-describedby="ro-cover-help" placeholder="https://example.com/cover.png" value="${escapeAttr(over?.cover ?? game.cover ?? '')}" /></label>
              <p class="ro-muted" id="ro-cover-help">Paste a direct image URL, rather than a game page. If external art won’t load, use an image hosted with your ROM library or a matching cover in your linked folder.</p>
              ${coverResourceLinks()}
              <label class="ro-muted">Description <textarea class="ro-input" name="description" rows="3">${escapeHtml(over?.description ?? game.description ?? '')}</textarea></label>
              <div class="ro-btn-row">
                <button type="submit" class="ro-btn ro-btn--primary" data-ro-focusable="true">Save locally</button>
                <button type="button" class="ro-btn ro-btn--ghost" id="ro-cancel-edit" data-ro-focusable="true">Cancel</button>
                <button type="button" class="ro-btn ro-btn--ghost" id="ro-clear-over" data-ro-focusable="true">Clear edits</button>
                <button type="button" class="ro-btn ro-btn--ghost" id="ro-export-over" data-ro-focusable="true">Export edits</button>
              </div>
              <p class="ro-muted">Edits stay on this device. Export JSON to back them up or reuse them on another build.</p>
            </form>`
              : ''
          }
        </div>
      </section>
    `

    hydrateCovers(root)

    root.querySelector('#ro-play')?.addEventListener('click', () => void startPlay('ro-play'))
    root.querySelector('#ro-host-lan')?.addEventListener('click', () => void startPlay('ro-host-lan', linkSystem ? 'link' : true))

    root.querySelector('#ro-demo-play')?.addEventListener('click', () => void startPlay('ro-demo-play'))
    root.querySelector<HTMLSelectElement>('#ro-transfer-pak')?.addEventListener('change', event => {
      transferPakId = (event.target as HTMLSelectElement).value
      setTransferPak(game.id, transferPakId)
    })

    root.querySelector('#ro-options-btn')?.addEventListener('click', () => {
      menuOpen = !menuOpen
      sfxToggle()
      paint(menuOpen ? 'ro-menu-favorite' : 'ro-options-btn')
    })

    root.querySelector('#ro-menu-favorite')?.addEventListener('click', () => {
      sfxToggle()
      favorited = toggleFavorite(game.id)
      paint('ro-menu-favorite')
    })

    root.querySelector('#ro-edit')?.addEventListener('click', () => {
      editing = true
      menuOpen = false
      paint()
    })

    root.querySelector('#ro-remove-upload')?.addEventListener('click', async () => {
      if (!window.confirm(`Remove “${game.title}” from your library on this device?`)) {
        suppressPadBackUntilRelease()
        return
      }
      suppressPadBackUntilRelease()
      try {
        await removeUploadedRom(game.id)
        if (!active) return
        forgetGameId(game.id)
        await reloadUploadedLibrary()
        if (!active) return
        navigate('/library')
      } catch (err) {
        if (!active) return
        const el = root.querySelector<HTMLElement>('#ro-play-status')
        if (el) {
          el.hidden = false
          el.textContent = friendlyError(err, 'Couldn’t remove that ROM. Try again.')
        }
      }
    })

    root.querySelector('#ro-meta-form')?.addEventListener('submit', (event) => {
      event.preventDefault()
      const form = event.target as HTMLFormElement
      const data = new FormData(form)
      try {
        setOverride(
          game.id,
          formFieldsToPatch(game, {
            title: String(data.get('title') || ''),
            core: String(data.get('core') || ''),
            year: String(data.get('year') || ''),
            developer: String(data.get('developer') || ''),
            cover: String(data.get('cover') || ''),
            description: String(data.get('description') || ''),
          }),
        )
        editing = false
        refreshCatalogView()
      } catch (err) {
        const el = root.querySelector<HTMLElement>('#ro-play-status')
        if (el) {
          el.hidden = false
          el.textContent = friendlyError(err, 'Couldn’t save those edits.')
        }
      }
    })

    root.querySelector('#ro-cancel-edit')?.addEventListener('click', () => {
      editing = false
      paint('ro-options-btn')
    })

    root.querySelector('#ro-clear-over')?.addEventListener('click', () => {
      clearOverride(game.id)
      refreshCatalogView()
    })

    root.querySelector('#ro-export-over')?.addEventListener('click', () => {
      const blob = new Blob([exportOverridesJson()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'retrooasis-overrides.json'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    })

    const focusRoot =
      root.querySelector<HTMLElement>('.ro-stack') ??
      root.querySelector<HTMLElement>('.ro-detail__actions')
    if (focusRoot) focusCleanup = bindGridFocus(focusRoot)
    const preferred = restoreFocusId
      ? root.querySelector<HTMLElement>(`#${restoreFocusId}`)
      : editing
      ? root.querySelector<HTMLElement>('#ro-meta-form input')
      : root.querySelector<HTMLElement>('#ro-play, .ro-detail__actions [data-ro-focusable="true"]')
    preferred?.focus()
  }

  document.addEventListener('keydown', onKey)
  paint()
  if (lanCheck) void lanCheck.then(result => {
    if (!active) return
    lan = result.state === 'ready' && result.info.cores.includes(normalizePlayCore(game.core))
    onlineState = lan ? 'ready' : result.state !== 'ready' ? 'off' : linkSystem ? 'needs-link' : 'needs-core'
    const card = root.querySelector<HTMLElement>('#ro-online')
    if (card) card.dataset.state = onlineState
    const stateLine = root.querySelector<HTMLElement>('#ro-online-state')
    if (stateLine) stateLine.textContent = ONLINE_STATE_TEXT[onlineState]
    const help = root.querySelector<HTMLElement>('#ro-online-help')
    if (help?.firstChild) { help.firstChild.textContent = `${onlineHelp(onlineState)} `; help.hidden = !onlineHelp(onlineState) }
    const button = root.querySelector<HTMLButtonElement>('#ro-host-lan')
    if (button) { button.disabled = busy || !lan; button.classList.toggle('ro-btn--primary', lan) }
  })
  document.title = `RetroOasis · ${game.title}`
}
