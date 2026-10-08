import {
  applyLocalScan,
  clearUploadedCatalog,
  loadCatalog,
  refreshCatalogView,
  unlinkLocalCatalog,
} from '../lib/catalog'
import {
  getLocalLibraryMeta,
  grantLocalLibraryAccess,
  pickLocalLibrary,
  supportsDirectoryPicker,
} from '../lib/localLibrary'
import { getPwaInstallState, promptPwaInstall, syncThemeColor } from '../lib/pwa'
import { clearAllOverrides, exportOverridesJson } from '../lib/overrides'
import { hrefFor } from '../lib/router'
import {
  applyStoredCrt,
  applyStoredLayout,
  clearLocalPrefs,
  getAccent,
  getCrtEnabled,
  getHideDemos,
  getLayout,
  getEjsChannel,
  getLibretroCovers,
  getSoundPack,
  getSoundsEnabled,
  setAccent,
  setCrtEnabled,
  setEjsChannel,
  setHideDemos,
  setLayout,
  setLibretroCovers,
  setSoundPack,
  setSoundsEnabled,
  type AccentMode,
  type EjsChannel,
  type LayoutMode,
  type SoundPack,
} from '../lib/store'
import { sfxToggle } from '../lib/sfx'
import { formatBytes, getUploadedLibraryMeta } from '../lib/uploadedLibrary'
import { getStorageSnapshot, requestPersistentStorage } from '../lib/storageQuota'
import { clearEmulatorCache, emulatorCacheUsage } from '../lib/emulatorCache'
import { friendlyError } from '../lib/userErrors'
import { bindRowFocus } from '../lib/focus'
import { getInputModality } from '../lib/inputModality'
import { escapeHtml, refreshCoverArt } from '../lib/dom'
import { coverResourceLinks } from '../lib/coverResources'
import { checkLanService, type LanServiceResult } from '../lib/lan'
import { suppressPadBackUntilRelease } from '../lib/input'
import { registerViewCleanup } from '../lib/viewLifecycle'
import { describeConnectedPads, onPadPresenceChange, onPadInputChange, buttonPressed } from '../lib/gamepad'
import { controllerAxis } from '../../public/controller-input.js'

const FOCUS_KEY = 'retrooasis.settings.focusId'
const SCROLL_KEY = 'retrooasis.settings.scrollY'

function rememberFocus(id: string): void {
  try {
    sessionStorage.setItem(FOCUS_KEY, id)
  } catch {
    /* ignore */
  }
}

function rememberScroll(y = window.scrollY): void {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.max(0, Math.round(y))))
  } catch {
    /* ignore */
  }
}

function readFocus(): string | null {
  try {
    return sessionStorage.getItem(FOCUS_KEY)
  } catch {
    return null
  }
}

function readScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY)
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** Arriving at Settings from the menu starts at the top; Back from a link inside it returns to the same spot. */
export function forgetSettingsPosition(): void {
  try {
    sessionStorage.removeItem(FOCUS_KEY)
    sessionStorage.removeItem(SCROLL_KEY)
  } catch {
    /* ignore */
  }
}

function pressed(on: boolean): string {
  return on ? 'true' : 'false'
}

function confirmAction(message: string): boolean {
  const ok = window.confirm(message)
  suppressPadBackUntilRelease()
  return ok
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const lanAbort = new AbortController()
  const lanPromise = checkLanService(lanAbort.signal)
  let active = true
  let focusCleanup: (() => void) | undefined
  let scrollFrame = 0
  let stopControllerTest: (() => void) | undefined
  let pendingLanFocus = false
  const rememberFocusedControl = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null
    if (pendingLanFocus && target?.id !== 'ro-check-lan') pendingLanFocus = false
    if (active && target?.dataset.focusId) rememberFocus(target.dataset.focusId)
  }
  // The section rail marks the section on screen (the last one once the page bottoms out);
  // on phones the rail is one swipeable row, kept scrolled to that section's chip.
  // Pin the rail right under the app header (its height varies on phones).
  const pinRail = () => {
    const rail = root.querySelector<HTMLElement>('.ro-settings__nav')
    const bar = document.querySelector<HTMLElement>('.ro-topbar')
    if (!rail || !bar) return
    const pinned = ['sticky', 'fixed'].includes(getComputedStyle(bar).position)
    rail.style.setProperty('--ro-rail-top', `${pinned ? bar.offsetHeight : 0}px`)
  }
  const markCurrentSection = () => {
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-settings-section]')]
    if (!tabs.length) return
    const line = window.innerHeight * 0.3
    let current = tabs[0]
    for (const tab of tabs) {
      const heading = root.querySelector(`#ro-set-${tab.dataset.settingsSection}`)
      if (heading && heading.getBoundingClientRect().top <= line) current = tab
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = tabs[tabs.length - 1]
    if (current.getAttribute('aria-current') === 'true') return
    for (const tab of tabs) {
      if (tab === current) tab.setAttribute('aria-current', 'true')
      else tab.removeAttribute('aria-current')
    }
    const rail = current.parentElement
    if (rail && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2, behavior: 'smooth' })
  }
  const onScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; if (active) { rememberScroll(); markCurrentSection() } })
  }
  registerViewCleanup(() => {
    if (root.querySelector('[data-ro-settings]')) rememberScroll()
    active = false
    stopControllerTest?.()
    lanAbort.abort()
    cancelAnimationFrame(scrollFrame)
    root.removeEventListener('focusin', rememberFocusedControl)
    window.removeEventListener('scroll', onScroll)
    focusCleanup?.()
    focusCleanup = undefined
  })

  const accent = getAccent()
  const crt = getCrtEnabled()
  const hideDemos = getHideDemos()
  const layout = getLayout()
  const sounds = getSoundsEnabled()
  const pack = getSoundPack()
  const libretro = getLibretroCovers()
  const ejsChannel = getEjsChannel()
  const [meta, uploadedMeta, storage, catalog] = await Promise.all([
    getLocalLibraryMeta(), getUploadedLibraryMeta(), getStorageSnapshot(), loadCatalog(),
  ])
  if (!active) return
  const hasSab = typeof SharedArrayBuffer !== 'undefined'
  // Without the isolation headers here, the player turns threads on itself through the service worker.
  const canIsolate = !hasSab && 'serviceWorker' in navigator && window.isSecureContext
  const canPick = supportsDirectoryPicker()
  const installState = getPwaInstallState()
  // Preserve row focus/scroll across catalog-driven rebuilds.
  const existing = root.querySelector<HTMLElement>('[data-ro-settings]')
  if (existing) {
    const focused = document.activeElement as HTMLElement | null
    if (focused?.dataset.focusId && root.contains(focused)) rememberFocus(focused.dataset.focusId)
    rememberScroll()
  }

  const restoreId = readFocus()
  const restoreScroll = readScroll()
  pendingLanFocus = restoreId === 'lan-host' || restoreId === 'lan-join'

  root.innerHTML = `
    <section class="ro-view ro-settings-page">
      <header class="ro-settings-page__head">
        <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Settings</p>
        <h1 class="ro-title">Settings</h1>
        <p class="ro-lede">Look and sound, controllers, online play, your library and saves.</p>
      </header>

      <div class="ro-settings" data-ro-settings>
        <nav class="ro-settings__nav" aria-label="Settings sections" data-ro-focus-row>
          ${[
            ['look', 'Appearance'], ['playback', 'Sound'], ['controller', 'Controllers'],
            ['lan', 'Online play'], ['library', 'Library'], ['data', 'Saves & storage'], ['advanced', 'Advanced'],
          ].map(([id, label]) => `<button type="button" class="ro-btn ro-btn--ghost" data-settings-section="${id}" data-focus-id="section-${id}" data-ro-focusable="true">${escapeHtml(label)}</button>`).join('')}
        </nav>
        <section class="ro-settings__group" aria-labelledby="ro-set-look">
          <h2 class="ro-settings__heading" id="ro-set-look">Appearance</h2>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Accent</strong>
              <p class="ro-muted">Sega cyan or PlayStation amber.</p>
            </div>
            <div class="ro-toggle-group" role="group" aria-label="Accent color">
              <button type="button" class="ro-btn" data-accent="sega" data-focus-id="accent-sega" data-ro-focusable="true" aria-pressed="${pressed(accent === 'sega')}">Sega</button>
              <button type="button" class="ro-btn" data-accent="ps" data-focus-id="accent-ps" data-ro-focusable="true" aria-pressed="${pressed(accent === 'ps')}">PS</button>
            </div>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Layout</strong>
              <p class="ro-muted">TV mode enlarges targets for couch play.</p>
            </div>
            <div class="ro-toggle-group" role="group" aria-label="Layout mode">
              <button type="button" class="ro-btn" data-layout="standard" data-focus-id="layout-standard" data-ro-focusable="true" aria-pressed="${pressed(layout === 'standard')}">Standard</button>
              <button type="button" class="ro-btn" data-layout="tv" data-focus-id="layout-tv" data-ro-focusable="true" aria-pressed="${pressed(layout === 'tv')}">TV</button>
            </div>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>CRT overlay</strong>
              <p class="ro-muted">Heavier scanlines on the shell.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-crt" data-focus-id="crt" data-ro-focusable="true" aria-pressed="${pressed(crt)}" aria-label="CRT overlay">${crt ? 'On' : 'Off'}</button>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-playback">
          <h2 class="ro-settings__heading" id="ro-set-playback">Sound</h2>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>UI sounds</strong>
              <p class="ro-muted">Menu blips on move and confirm.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-sounds" data-focus-id="sounds" data-ro-focusable="true" aria-pressed="${pressed(sounds)}" aria-label="UI sounds">${sounds ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Sound pack</strong>
              <p class="ro-muted">${sounds ? 'Soft tones, XMB clicks, or arcade beeps.' : 'Turn on UI sounds to choose a pack.'}</p>
            </div>
            <div class="ro-toggle-group ro-toggle-group--packs" role="group" aria-label="Sound pack">
              <button type="button" class="ro-btn" data-pack="soft" data-focus-id="pack-soft" data-ro-focusable="true" aria-pressed="${pressed(pack === 'soft')}"${!sounds ? ' disabled' : ''}>Soft</button>
              <button type="button" class="ro-btn" data-pack="xmb" data-focus-id="pack-xmb" data-ro-focusable="true" aria-pressed="${pressed(pack === 'xmb')}"${!sounds ? ' disabled' : ''}>XMB</button>
              <button type="button" class="ro-btn" data-pack="arcade" data-focus-id="pack-arcade" data-ro-focusable="true" aria-pressed="${pressed(pack === 'arcade')}"${!sounds ? ' disabled' : ''}>Arcade</button>
            </div>
          </div>

        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-controller">
          <h2 class="ro-settings__heading" id="ro-set-controller">Controllers</h2>
          <div class="ro-settings-row ro-settings-row--stack" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Bluetooth &amp; USB controllers <span class="ro-settings__online-state" id="ro-controller-state"></span></strong>
              <p class="ro-muted" id="ro-controller-pairing"${describeConnectedPads().state === 'ready' ? ' hidden' : ''}>Pair with your device or connect by USB, then press and release a controller button.</p>
              <p class="ro-muted" id="ro-controller-status" role="status" aria-atomic="true">${escapeHtml(describeConnectedPads().message)}</p>
              <ul class="ro-settings__controller-list" id="ro-controller-list" aria-label="Connected controllers" hidden></ul>
              <details class="ro-settings__help">
                <summary data-focus-id="controller-help" data-ro-focusable="true">Controls &amp; troubleshooting</summary>
                <p class="ro-muted">D-pad or left stick moves. A / Cross chooses; B / Circle closes menus and goes back. Start chooses and Select goes back. In Settings, L1 / R1 jump between sections.</p>
                <p class="ro-muted">Face-button labels vary by controller: the bottom button chooses and the right button goes back.</p>
                <p class="ro-muted">Use HTTPS or localhost. If a controller stays unavailable, reconnect it and check again. Set game-specific controls in the player.</p>
                <p class="ro-muted">To switch menu controllers, press and release a button on the other controller. Local multiplayer controller assignments are separate: select each player’s controller in the player’s Controls menu.</p>
              </details>
            </div>
            <button type="button" class="ro-btn" id="ro-check-controller" data-focus-id="controller" data-ro-focusable="true" aria-describedby="ro-controller-status">Check controller</button>
          </div>
          <div class="ro-settings-row ro-settings-row--note" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <details class="ro-settings__help" id="ro-controller-test">
                <summary data-focus-id="controller-test" data-ro-focusable="true">Test buttons &amp; sticks</summary>
                <p class="ro-muted">While this test is open, controller buttons update the readout instead of navigating menus. Hold B / Circle to close it.</p>
                <p class="ro-controller-test__buttons" id="ro-controller-buttons">No standard controller detected.</p>
                <div class="ro-controller-test__sticks">
                  <span>Left stick <output id="ro-controller-left" aria-live="off">X 0.00 · Y 0.00</output></span>
                  <span>Right stick <output id="ro-controller-right" aria-live="off">X 0.00 · Y 0.00</output></span>
                </div>
              </details>
            </div>
          </div>
        </section>
        <section class="ro-settings__group ro-settings__online" aria-labelledby="ro-set-lan">
          <h2 class="ro-settings__heading" id="ro-set-lan">Online play</h2>
          <div class="ro-settings-row ro-settings__online-intro">
            <div class="ro-settings-row__copy">
              <p class="ro-muted">Two ways to play together. One computer runs the <b>RetroOasis host app</b>; friends join from their own phone or computer on the same Wi-Fi. Far apart? You can all join a free app like Tailscale instead.</p>
              <div class="ro-online-methods">
                <article class="ro-online-method">
                  <h3>Online rooms</h3>
                  <p>You run the game; friends see your screen and play with their own controller. They don’t need the game.</p>
                  <ul class="ro-settings__online-systems" aria-label="Online room systems">
                    <li><span>NES · SNES · Mega Drive · PlayStation</span><span>2 players</span></li>
                    <li><span>Nintendo 64 <em>Beta</em></span><span>Up to 4</span></li>
                  </ul>
                  <p class="ro-online-method__how">Game page → <b>Host a room</b></p>
                </article>
                <article class="ro-online-method">
                  <h3>Trade &amp; link</h3>
                  <p>Two handhelds on one link cable, for trades and link battles. Each player brings their own game and save.</p>
                  <ul class="ro-settings__online-systems" aria-label="Trade and link systems">
                    <li><span>Game Boy · Color · GBA <em>Beta</em></span><span>2 players</span></li>
                  </ul>
                  <p class="ro-online-method__how">Game page → <b>Start Trade &amp; link</b></p>
                </article>
              </div>
            </div>
          </div>
          <div class="ro-settings-row ro-settings-row--stack" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Host app <span class="ro-settings__online-state" id="ro-lan-state" data-state="checking">Checking</span></strong>
              <p class="ro-muted" id="ro-lan-service-status" role="status" aria-atomic="true">Checking whether the host app is running…</p>
              <p class="ro-muted" id="ro-lan-controls-status" hidden></p>
            </div>
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-check-lan" data-focus-id="lan-check" data-ro-focusable="true" aria-describedby="ro-lan-service-status">Check again</button>
          </div>
          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Host</strong>
              <p class="ro-muted">Pick a game, choose <b>Host a room</b> or <b>Start Trade &amp; link</b>, then share the invite link or QR code.</p>
            </div>
            <a class="ro-btn ro-btn--primary" id="ro-lan-host" role="link" tabindex="-1" aria-disabled="true" data-focus-id="lan-host" data-ro-focusable="true" aria-describedby="ro-lan-service-status">Choose a game</a>
          </div>
          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Join</strong>
              <p class="ro-muted">Open the host’s invite link or scan their QR code. Or enter their room code here.</p>
            </div>
            <a class="ro-btn ro-btn--ghost" id="ro-lan-join" role="link" tabindex="-1" aria-disabled="true" data-focus-id="lan-join" data-ro-focusable="true" aria-describedby="ro-lan-service-status">Enter room code</a>
          </div>
          <div class="ro-settings-row ro-settings-row--note" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <details class="ro-settings__help">
                <summary data-focus-id="lan-help" data-ro-focusable="true">Set up the host app</summary>
                <ol class="ro-settings__online-steps ro-muted">
                  <li>On the computer that will host, install <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js</a> (version 18 or newer).</li>
                  <li>Unzip the <b>RetroOasis host app</b> folder there and run <b>start-host</b>.</li>
                  <li>On that computer, open the address it shows (starting with <b>http://localhost</b>), add your games, and choose <b>Host a room</b>.</li>
                </ol>
                <p class="ro-muted"><b>Playing with someone far away:</b> you both install a free private-network app (<a href="https://tailscale.com" target="_blank" rel="noopener">Tailscale</a>, <a href="https://github.com/slackhq/nebula" target="_blank" rel="noopener">Nebula</a> or <a href="https://www.zerotier.com" target="_blank" rel="noopener">ZeroTier</a>), then pick that network in the room’s invite list.</p>
                <p class="ro-muted"><b>Friends can’t connect?</b> Send the invite marked Wi-Fi, make sure everyone is on the same Wi-Fi (guest Wi-Fi often blocks this), and if the computer asks, allow Node.js through its firewall.</p>
                <details class="ro-settings__help">
                  <summary data-focus-id="lan-dev" data-ro-focusable="true">From the project folder (developers)</summary>
                  <ol class="ro-settings__online-steps ro-muted">
                    <li>Build the host app folder:<code>npm run oasis:host:pack</code></li>
                    <li>Or run it in place. Prepare cores once, while online:<code>npm run oasis:lan:prepare</code></li>
                    <li>For Trade &amp; link, build the link cores once:<code>npm run oasis:lan:link</code></li>
                    <li>Start the host app:<code>npm run oasis:lan</code></li>
                  </ol>
                  <p class="ro-muted">Guest game controllers need HTTPS: <code>npm run oasis:lan:cert</code>, then start with <code>--cert</code> and <code>--key</code> (see README).</p>
                </details>
              </details>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-library">
          <h2 class="ro-settings__heading" id="ro-set-library">Library</h2>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Online box art</strong>
              <p class="ro-muted">Load missing box art from Libretro. Local and custom covers are tried first.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-libretro" data-focus-id="libretro" data-ro-focusable="true" aria-pressed="${pressed(libretro)}" aria-label="Online box art">${libretro ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Refresh cover art</strong>
              <p class="ro-muted">Retry cover matching and reload artwork as you browse.</p>
              <p class="ro-muted ro-cover-refresh-status" id="ro-cover-refresh-status" role="status" aria-live="polite" aria-atomic="true"></p>
            </div>
            <button type="button" class="ro-btn ro-btn--ghost" id="ro-refresh-covers" data-focus-id="refresh-covers" data-ro-focusable="true" aria-label="Refresh cover art" aria-describedby="ro-cover-refresh-status">Refresh</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Cover art resources</strong>
              <p class="ro-muted">Browse artwork, then add a direct image URL from a game’s metadata editor.</p>
              ${coverResourceLinks()}
            </div>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Hide samples</strong>
              <p class="ro-muted">Show only ROMs you’ve hosted, linked, or saved.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-hide-demos" data-focus-id="hide-demos" data-ro-focusable="true" aria-pressed="${pressed(hideDemos)}" aria-label="Hide samples">${hideDemos ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Saved ROMs</strong>
              ${
                uploadedMeta.count
                  ? `<p class="ro-muted">${uploadedMeta.count} ROM${uploadedMeta.count === 1 ? '' : 's'} · ${formatBytes(uploadedMeta.bytes)} on this device</p>`
                  : `<p class="ro-muted">Files you add stay on this device.</p>`
              }
            </div>
            <div class="ro-btn-row">
              ${
                uploadedMeta.count
                  ? `<a class="ro-btn ro-btn--ghost" href="${hrefFor('/library/@all')}" data-focus-id="view-library" data-ro-focusable="true">View library</a>
                     <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-uploads" data-focus-id="clear-uploads" data-ro-focusable="true">Clear saved ROMs</button>`
                  : `<a class="ro-btn ro-btn--primary" href="${hrefFor('/upload')}" data-focus-id="add-rom" data-ro-focusable="true">Add ROM</a>`
              }
            </div>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Local folder</strong>
              <p class="ro-muted">
                ${
                  meta.needsPermission
                    ? `Linked to <strong>${escapeHtml(meta.name ?? 'folder')}</strong>, but this browser needs permission again.`
                    : meta.linked
                      ? `Linked to <strong>${escapeHtml(meta.name ?? 'folder')}</strong>`
                      : canPick
                        ? 'Link a <code>roms/&lt;system&gt;/</code> folder on this computer.'
                        : 'This browser can’t link folders. Use Add ROM instead.'
                }
              </p>
              ${catalog.local?.unsupported?.length
                ? `<p class="ro-muted">Skipped ${escapeHtml(catalog.local.unsupported.join(', '))}: RetroOasis has no browser emulator for ${catalog.local.unsupported.length === 1 ? 'it' : 'them'} yet.</p>`
                : ''}
              <p class="ro-muted" id="ro-folder-status" role="status" hidden></p>
            </div>
            <div class="ro-btn-row">
              ${canPick ? `<button type="button" class="ro-btn" id="ro-link" data-focus-id="link-folder" data-ro-focusable="true">${meta.needsPermission ? 'Allow access' : meta.linked ? 'Relink' : 'Link folder'}</button>` : ''}
              ${meta.linked ? `<button type="button" class="ro-btn ro-btn--ghost" id="ro-unlink" data-focus-id="unlink-folder" data-ro-focusable="true">Unlink</button>` : ''}
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--note">
            <div class="ro-settings-row__copy">
              <strong>Hosted ROMs</strong>
              <p class="ro-muted">
                ${
                  catalog.hostedCount
                    ? `Loaded ${catalog.hostedCount} from <code>roms/manifest.json</code>.`
                    : 'Optional: put games under <code>roms/</code> and generate a manifest.'
                }
              </p>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-data">
          <h2 class="ro-settings__heading" id="ro-set-data">Saves &amp; storage</h2>

          <div class="ro-settings-row ro-settings-row--stack" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Browser storage</strong>
              <p class="ro-muted">
                ${
                  storage.supported && storage.quota > 0
                    ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} used (${Math.round(storage.percent)}%).${
                        storage.percent >= 80 ? ' Free space before adding large ISOs.' : ''
                      }`
                    : 'This browser doesn’t report how much space is left.'
                }
              </p>
              <p class="ro-muted" id="ro-storage-breakdown" hidden></p>
              <p class="ro-muted" id="ro-persist-status" role="status">
                ${
                  storage.persistent
                    ? 'This browser promised to keep saved ROMs when storage is tight.'
                    : 'Ask the browser to keep saved ROMs instead of clearing them when space is low.'
                }
              </p>
              ${
                storage.supported && storage.quota > 0
                  ? `<div class="ro-storage-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(storage.percent)}" aria-label="Browser storage used">
                      <span style="width:${Math.min(100, storage.percent).toFixed(1)}%"></span>
                    </div>`
                  : ''
              }
            </div>
            ${
              storage.persistent
                ? `<span class="ro-badge ro-badge--ok" role="status">Kept</span>`
                : `<button type="button" class="ro-btn" id="ro-persist" data-focus-id="persist" data-ro-focusable="true">Keep ROMs</button>`
            }
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Emulator cache</strong>
              <p class="ro-muted" id="ro-emu-cache-status" role="status" aria-atomic="true">Cores and copies of recently played games, kept for a week so they start faster. Checking size…</p>
            </div>
            <button type="button" class="ro-btn" id="ro-clear-emu-cache" data-focus-id="clear-emu-cache" data-ro-focusable="true" aria-describedby="ro-emu-cache-status">Clear cache</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Local saves</strong>
              <p class="ro-muted">Download, back up, and restore in-game progress and browser save states.</p>
            </div>
            <a class="ro-btn ro-btn--primary" href="${hrefFor('/saves')}" data-focus-id="saves" data-ro-focusable="true">Manage saves</a>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Install as app</strong>
              <p class="ro-muted">
                ${
                  installState === 'installed'
                    ? 'Running in app mode — home-screen launch, fullscreen chrome.'
                    : installState === 'prompt'
                      ? 'Install RetroOasis on this device for a fullscreen shelf.'
                      : installState === 'ios'
                        ? 'On iPhone/iPad: tap Share, then Add to Home Screen.'
                        : 'Available on HTTPS (or localhost) in a supported browser after the shell is cached.'
                }
              </p>
            </div>
            ${
              installState === 'installed'
                ? `<span class="ro-badge ro-badge--ok" role="status">Installed</span>`
                : installState === 'prompt'
                  ? `<button type="button" class="ro-btn ro-btn--primary" id="ro-install" data-focus-id="install" data-ro-focusable="true" aria-label="Install RetroOasis as an app">Install as app</button>`
                  : installState === 'ios'
                    ? `<span class="ro-badge" role="status" title="Use Share → Add to Home Screen">iOS tip</span>`
                    : `<span class="ro-badge" role="status" title="Needs HTTPS and a supported browser after the shell is cached.">Unavailable here</span>`
            }
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Clear recents &amp; favorites</strong>
              <p class="ro-muted">Recently played and favorites on this device.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-prefs" data-focus-id="clear-prefs" data-ro-focusable="true">Clear both</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Metadata edits</strong>
              <p class="ro-muted">Title and cover changes from game pages.</p>
            </div>
            <div class="ro-btn-row">
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-export-over" data-focus-id="export-over" data-ro-focusable="true">Export edits</button>
              <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-over" data-focus-id="clear-over" data-ro-focusable="true">Clear edits</button>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-advanced">
          <h2 class="ro-settings__heading" id="ro-set-advanced">Advanced</h2>
          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Emulator files</strong>
              <p class="ro-muted">
                Where game cores and support files load from. Stable suits most systems.
                PSP, DOS, and 3DS always use Nightly (unless Local).
              </p>
            </div>
            <div class="ro-toggle-group ro-toggle-group--channels" role="group" aria-label="Emulator files">
              <button type="button" class="ro-btn" data-ejs="stable" data-focus-id="ejs-stable" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'stable')}" title="Official stable CDN builds">Stable</button>
              <button type="button" class="ro-btn" data-ejs="nightly" data-focus-id="ejs-nightly" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'nightly')}" title="Newer CDN builds; required for PSP / DOS / 3DS">Nightly</button>
              <button type="button" class="ro-btn" data-ejs="latest" data-focus-id="ejs-latest" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'latest')}" title="Latest CDN channel">Latest</button>
              <button type="button" class="ro-btn" data-ejs="local" data-focus-id="ejs-local" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'local')}" title="Load from a local data/ folder next to the site">Local</button>
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--stack" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Thread support</strong>
              <p class="ro-muted">
                Lets PSP, DOS, and 3DS games run in the browser.
                Separate from the Nightly CDN channel above.
              </p>
              <p class="ro-muted">
                ${
                  hasSab
                    ? 'Available here. These systems also need compatible cores and game files.'
                    : canIsolate
                      ? 'Not on this page, but RetroOasis turns it on in the player when you start a PSP, DOS or 3DS game (the page reloads once).'
                      : 'Missing here, and this browser can’t turn it on. Use HTTPS or localhost in a recent Chrome, Edge or Firefox, or host with isolation headers (see README).'
                }
              </p>
            </div>
            <span class="ro-badge ${hasSab || canIsolate ? 'ro-badge--ok' : 'ro-badge--threads'}" role="status">${hasSab ? 'Ready' : canIsolate ? 'On demand' : 'Missing'}</span>
          </div>
          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Host RetroOasis yourself</strong>
              <p class="ro-muted">It’s a static site: run <code>npm run oasis:build</code> and serve <code>dist/</code> beside <code>data/</code> and <code>roms/</code>. Online play needs the host app (see Online play).</p>
            </div>
          </div>
        </section>

        <div class="ro-settings__footer" data-ro-focus-row>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/')}" data-focus-id="back-home" data-ro-focusable="true">Back home</a>
        </div>
      </div>
    </section>
  `

  const rerender = (focusId?: string) => {
    if (!active) return
    if (focusId) rememberFocus(focusId)
    rememberScroll()
    void renderSettings(root)
  }

  root.addEventListener('focusin', rememberFocusedControl)
  window.addEventListener('scroll', onScroll, { passive: true })
  root.querySelectorAll<HTMLButtonElement>('[data-settings-section]').forEach(button => {
    button.addEventListener('click', () => {
      const heading = root.querySelector<HTMLElement>(`#ro-set-${button.dataset.settingsSection}`)
      const section = heading?.closest('section')
      const target = section?.querySelector<HTMLElement>('[data-ro-focusable="true"]:not(summary):not([disabled]):not([aria-disabled="true"])')
      target?.focus({ preventScroll: true })
      heading?.scrollIntoView({ block: 'start' })
    })
  })
  markCurrentSection()
  pinRail()

  let working = false
  const restoreActionFocus = (button: HTMLButtonElement, wasFocused: boolean) => {
    if (active && wasFocused && (document.activeElement === document.body || document.activeElement === root)) button.focus({ preventScroll: true })
  }
  const runAction = async (id: string, action: () => Promise<void>, focusId: string) => {
    const button = root.querySelector<HTMLButtonElement>(`#${id}`)
    if (!active || working || !button || button.disabled) return
    working = true
    const wasFocused = document.activeElement === button
    rememberFocus(focusId)
    rememberScroll()
    button.disabled = true
    const row = button.closest<HTMLElement>('[data-ro-focus-row]')
    row?.setAttribute('aria-busy', 'true')
    try { await action(); if (active) rerender(focusId) }
    catch (error) {
      if (!active) return
      const copy = row?.querySelector('.ro-settings-row__copy')
      let status = copy?.querySelector<HTMLElement>('[data-action-status]')
      if (copy && !status) {
        status = document.createElement('p')
        status.className = 'ro-muted'
        status.dataset.actionStatus = ''
        status.setAttribute('role', 'status')
        copy.append(status)
      }
      if (status) status.textContent = friendlyError(error, 'Couldn’t complete that action. Try again.')
    } finally { working = false; if (active) { button.disabled = false; row?.removeAttribute('aria-busy'); restoreActionFocus(button, wasFocused) } }
  }

  root.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.accent as AccentMode
      setAccent(next)
      syncThemeColor(next)
      rerender(btn.dataset.focusId)
    })
  })

  root.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLayout(btn.dataset.layout as LayoutMode)
      applyStoredLayout()
      rerender(btn.dataset.focusId)
    })
  })

  root.querySelector('#ro-crt')?.addEventListener('click', () => {
    setCrtEnabled(!getCrtEnabled())
    applyStoredCrt()
    rerender('crt')
  })

  root.querySelector('#ro-sounds')?.addEventListener('click', () => {
    const next = !getSoundsEnabled()
    setSoundsEnabled(next)
    if (next) sfxToggle()
    rerender('sounds')
  })

  root.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return
      setSoundPack(btn.dataset.pack as SoundPack)
      if (getSoundsEnabled()) sfxToggle()
      rerender(btn.dataset.focusId)
    })
  })

  root.querySelector('#ro-libretro')?.addEventListener('click', () => {
    setLibretroCovers(!getLibretroCovers())
    rerender('libretro')
  })

  root.querySelector('#ro-refresh-covers')?.addEventListener('click', () => {
    refreshCoverArt()
    const status = root.querySelector('#ro-cover-refresh-status')
    if (status) status.textContent = getLibretroCovers()
      ? 'Cover matches reset. Artwork will be retried as you browse.'
      : 'Cover matches reset. Saved covers will be retried as you browse. Turn on Online box art for automatic matches.'
  })

  let lanCheck = 0
  const checkLan = async (pending: Promise<LanServiceResult> = checkLanService(lanAbort.signal)) => {
    const attempt = ++lanCheck
    const button = root.querySelector<HTMLButtonElement>('#ro-check-lan')
    const wasFocused = document.activeElement === button
    if (button) { button.disabled = true; button.textContent = 'Checking…' }
    const status = root.querySelector<HTMLElement>('#ro-lan-service-status')
    const badge = root.querySelector<HTMLElement>('#ro-lan-state')
    const controls = root.querySelector<HTMLElement>('#ro-lan-controls-status')
    const actions = Array.from(root.querySelectorAll<HTMLAnchorElement>('#ro-lan-host, #ro-lan-join'))
    if (status) status.textContent = 'Checking whether the host app is running…'
    if (badge) { badge.textContent = 'Checking'; badge.dataset.state = 'checking' }
    if (controls) controls.hidden = true
    for (const action of actions) { action.removeAttribute('href'); action.setAttribute('aria-disabled', 'true'); action.tabIndex = -1 }
    const result = await pending
    if (!active || attempt !== lanCheck) return
    const browserSupported = typeof window.RTCPeerConnection === 'function'
    const messages = {
      ready: ['Running', 'The host app is running here. You can host, and friends can join.'],
      unavailable: ['Not running', 'The host app isn’t running here. Joining a friend? Open their invite link. Hosting? Start the host app (see Set up the host app) and open the address it shows.'],
      unreachable: ['Can’t reach it', 'Couldn’t reach the host app. Keep its window open, check the Wi-Fi, then try again.'],
      timeout: ['No answer', 'The host app took too long to answer. Check the host computer and Wi-Fi, then try again.'],
      incompatible: ['Update needed', 'This page and the host app are different versions. Update the host app, restart it and reload this page.'],
      invalid: ['Something’s wrong', 'This address didn’t answer like the host app. Restart the host app and open the address it shows.'],
    } as const
    const [label, message] = browserSupported ? messages[result.state] : ['Browser not supported', 'This browser can’t play online. Use a current Chrome, Edge, Firefox or Safari.']
    const available = browserSupported && result.state === 'ready'
    if (status) status.textContent = message
    if (badge) { badge.textContent = label; badge.dataset.state = available ? 'ready' : 'unavailable' }
    if (controls && available && result.state === 'ready') {
      controls.textContent = result.info.secure
        ? 'Secure: friends can use a keyboard, touch screen or game controller.'
        : 'Friends can play with a keyboard or touch screen. For their game controllers, the host app needs a security certificate (see developers below).'
      controls.hidden = false
    }
    // Re-enable the check before moving focus away from an unavailable link.
    if (button) { button.disabled = false; button.textContent = 'Check again' }
    for (const action of actions) {
      action.setAttribute('aria-disabled', String(!available))
      if (available) { action.href = action.id === 'ro-lan-host' ? hrefFor('/library') : './lan.html'; action.removeAttribute('tabindex') }
      else if (document.activeElement === action) button?.focus()
    }
    if (attempt === 1 && pendingLanFocus) {
      const canRestore = document.activeElement === button || document.activeElement === root || document.activeElement === document.body
      if (canRestore) (available ? actions.find(action => action.dataset.focusId === restoreId) : button)?.focus({ preventScroll: true })
      pendingLanFocus = false
    }
    if (button) restoreActionFocus(button, wasFocused)
  }
  void checkLan(lanPromise)
  root.querySelector('#ro-check-lan')?.addEventListener('click', () => { void checkLan() })

  root.querySelectorAll<HTMLButtonElement>('[data-ejs]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setEjsChannel(btn.dataset.ejs as EjsChannel)
      rerender(btn.dataset.focusId)
    })
  })

  // Where the space goes: saved ROMs, EmulatorJS's cache, and the app/cover caches.
  const paintStorageBreakdown = async () => {
    const [cache, estimate] = await Promise.all([
      emulatorCacheUsage(),
      navigator.storage?.estimate?.().catch(() => null) ?? Promise.resolve(null),
    ])
    if (!active) return
    const status = root.querySelector('#ro-emu-cache-status')
    if (status) {
      const parts = [cache.games && `${cache.games} game${cache.games === 1 ? '' : 's'}`, cache.cores && `${cache.cores} core${cache.cores === 1 ? '' : 's'}`].filter(Boolean)
      status.textContent = cache.items
        ? `${formatBytes(cache.bytes)}${parts.length ? ` (${parts.join(', ')})` : ''}. Cores and copies of recently played games, kept for a week so they start faster. Clearing it never removes saves or saved ROMs.`
        : 'Empty. Cores and recently played games are cached here when you play.'
    }
    const clear = root.querySelector<HTMLButtonElement>('#ro-clear-emu-cache')
    if (clear) clear.disabled = !cache.items
    const breakdown = root.querySelector<HTMLElement>('#ro-storage-breakdown')
    const caches = (estimate as (StorageEstimate & { usageDetails?: { caches?: number } }) | null)?.usageDetails?.caches
    if (breakdown && (uploadedMeta.bytes || cache.bytes || caches)) {
      breakdown.textContent = [
        `Saved ROMs ${formatBytes(uploadedMeta.bytes)}`,
        `Emulator cache ${formatBytes(cache.bytes)}`,
        ...(caches !== undefined ? [`App & cover art ${formatBytes(caches)}`] : []),
      ].join(' · ')
      breakdown.hidden = false
    }
  }
  void paintStorageBreakdown()
  root.querySelector('#ro-clear-emu-cache')?.addEventListener('click', async () => {
    const button = root.querySelector<HTMLButtonElement>('#ro-clear-emu-cache')
    const status = root.querySelector('#ro-emu-cache-status')
    if (!button || button.disabled || !confirmAction('Clear the emulator cache? Cores and games are downloaded or copied again the next time you play. Saves are not affected.')) return
    const wasFocused = document.activeElement === button
    button.disabled = true
    try {
      await clearEmulatorCache()
      if (!active) return
      await paintStorageBreakdown()
      if (status) status.textContent = 'Emulator cache cleared. Saves and saved ROMs were not touched.'
    } catch (error) {
      if (!active) return
      button.disabled = false
      if (status) status.textContent = error instanceof Error ? error.message : 'Couldn’t clear the emulator cache.'
    }
    if (active && wasFocused && (document.activeElement === button || document.activeElement === document.body)) {
      root.querySelector<HTMLElement>('[data-focus-id="saves"]')?.focus({ preventScroll: true })
    }
  })

  const paintControllerStatus = () => {
    const status = root.querySelector('#ro-controller-status')
    const info = describeConnectedPads()
    if (status && status.textContent !== info.message) status.textContent = info.message
    const pairing = root.querySelector<HTMLElement>('#ro-controller-pairing')
    if (pairing) pairing.hidden = info.state === 'ready'
    const badge = root.querySelector<HTMLElement>('#ro-controller-state')
    if (badge) {
      badge.textContent = { ready: 'Ready', waiting: 'Press a button', unmapped: 'Custom layout', blocked: 'Access blocked', unsupported: 'Unavailable', insecure: 'HTTPS needed' }[info.state]
      badge.dataset.state = info.state === 'ready' ? 'ready' : 'unavailable'
    }
    const list = root.querySelector<HTMLUListElement>('#ro-controller-list')
    if (list) {
      list.hidden = !info.pads.length
      list.innerHTML = info.pads.map(pad => `<li>${escapeHtml(pad.id)} <span>${pad.index === info.standard?.index ? 'Menu controller' : pad.mapping === 'standard' ? 'Standard layout' : 'Custom layout'}</span></li>`).join('')
    }
  }
  paintControllerStatus()
  const stopPads = onPadPresenceChange(paintControllerStatus)

  const controllerTest = root.querySelector<HTMLDetailsElement>('#ro-controller-test')
  controllerTest?.addEventListener('toggle', () => {
    stopControllerTest?.(); stopControllerTest = undefined
    if (active && !controllerTest.open) {
      const readout = root.querySelector('#ro-controller-buttons')
      if (readout) readout.textContent = 'Open the test, then press buttons and move the sticks.'
    }
    if (!active || !controllerTest.open) return
    const names = ['A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'L1', 'R1', 'L2', 'R2', 'Select', 'Start', 'L stick', 'R stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home']
    // Controller-only players need a way out: holding B closes the test.
    let backHeldSince = 0
    stopControllerTest = onPadInputChange(pad => {
      const buttons = root.querySelector('#ro-controller-buttons')
      const pressed = pad ? Array.from(pad.buttons).flatMap((_, index) => buttonPressed(pad, index) ? [names[index] || `Button ${index + 1}`] : []) : []
      const holdingBack = !!pad && buttonPressed(pad, 1)
      backHeldSince = holdingBack ? backHeldSince || performance.now() : 0
      if (holdingBack && performance.now() - backHeldSince >= 1500) {
        // Closing unsubscribes; menus then wait for every button to be released.
        controllerTest.open = false
        controllerTest.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
        return
      }
      const text = document.hidden || !document.hasFocus() ? 'Test paused while this tab is inactive.' : pad ? pressed.length ? `Pressed: ${pressed.join(' · ')}${holdingBack ? ' — keep holding B to close' : ''}` : 'All buttons released.' : 'No standard controller detected.'
      if (buttons && buttons.textContent !== text) buttons.textContent = text
      for (const [id, axis] of [['left', 0], ['right', 2]] as const) {
        const output = root.querySelector(`#ro-controller-${id}`)
        const value = `X ${pad ? controllerAxis(pad, axis).toFixed(2) : '0.00'} · Y ${pad ? controllerAxis(pad, axis + 1).toFixed(2) : '0.00'}`
        if (output && output.textContent !== value) output.textContent = value
      }
    })
  })

  root.querySelector('#ro-check-controller')?.addEventListener('click', () => {
    paintControllerStatus()
  })

  root.querySelector('#ro-persist')?.addEventListener('click', async () => {
    const button = root.querySelector<HTMLButtonElement>('#ro-persist')
    if (working || !button || button.disabled) return
    const wasFocused = document.activeElement === button
    working = true
    button.disabled = true
    const ok = await requestPersistentStorage()
    working = false
    if (!active) return
    button.disabled = false
    restoreActionFocus(button, wasFocused)
    if (!ok) {
      const status = root.querySelector('#ro-persist-status')
      if (status) {
        status.textContent =
          'This browser didn’t promise to keep data. Install as an app or try again after using RetroOasis more.'
      }
      return
    }
    rerender('saves')
  })

  root.querySelector('#ro-hide-demos')?.addEventListener('click', () => {
    rememberFocus('hide-demos')
    rememberScroll()
    setHideDemos(!getHideDemos())
    refreshCatalogView()
  })

  root.querySelector('#ro-link')?.addEventListener('click', async () => {
    const button = root.querySelector<HTMLButtonElement>('#ro-link')
    if (working || !button || button.disabled) return
    const wasFocused = document.activeElement === button
    working = true
    button.disabled = true
    const status = root.querySelector<HTMLElement>('#ro-folder-status')
    try {
      if (meta.needsPermission) {
        const granted = await grantLocalLibraryAccess()
        if (!active) return
        if (granted) {
          await applyLocalScan(granted)
          if (!active) return
          rerender('link-folder')
          return
        }
        throw new Error('Folder access wasn’t granted. Allow access to continue, or unlink the folder.')
      }
      const result = await pickLocalLibrary()
      if (!active) return
      await applyLocalScan(result)
      if (!active) return
      rerender('link-folder')
    } catch (err) {
      if (!active) return
      if (status) {
        status.hidden = false
        status.textContent = friendlyError(err, 'Cancelled.')
      }
    } finally { working = false; if (active) { button.disabled = false; restoreActionFocus(button, wasFocused) } }
  })

  root.querySelector('#ro-unlink')?.addEventListener('click', async () => {
    if (!active || working) return
    if (!confirmAction('Unlink the local ROM folder on this device?')) return
    await runAction('ro-unlink', () => unlinkLocalCatalog(), 'link-folder')
  })

  root.querySelector('#ro-clear-uploads')?.addEventListener('click', async () => {
    if (!active || working) return
    if (!confirmAction('Remove all saved ROMs from this device? This can’t be undone.')) return
    await runAction('ro-clear-uploads', () => clearUploadedCatalog(), 'add-rom')
  })

  root.querySelector('#ro-install')?.addEventListener('click', async () => {
    await runAction('ro-install', async () => { await promptPwaInstall() }, 'install')
  })

  root.querySelector('#ro-clear-prefs')?.addEventListener('click', () => {
    if (!confirmAction('Clear recently played and favorites on this device?')) return
    clearLocalPrefs()
    rerender('clear-prefs')
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

  root.querySelector('#ro-clear-over')?.addEventListener('click', () => {
    if (!confirmAction('Clear all local metadata edits on this device?')) return
    rememberFocus('clear-over')
    rememberScroll()
    clearAllOverrides()
    refreshCatalogView()
  })

  const focusRoot = root.querySelector<HTMLElement>('[data-ro-settings]')
  if (focusRoot) {
    // Controller L1 / R1 jump between sections, like the section tabs.
    focusCleanup = bindRowFocus(focusRoot, dir => {
      const tabs = [...focusRoot.querySelectorAll<HTMLButtonElement>('[data-settings-section]')]
      const sections = tabs.map(tab => focusRoot.querySelector(`#ro-set-${tab.dataset.settingsSection}`)?.closest('section'))
      const current = sections.findIndex(section => section?.contains(document.activeElement))
      const next = dir === 'pageright' ? current + 1 : current === -1 ? 0 : current - 1
      if (next < 0 || next >= tabs.length) return true
      tabs[next].click()
      return true
    })
    const restore =
      (restoreId
        ? focusRoot.querySelector<HTMLElement>(
            `[data-focus-id="${CSS.escape(restoreId)}"]:not([disabled]):not([aria-disabled="true"])`,
          )
        : null) ??
      (pendingLanFocus ? focusRoot.querySelector<HTMLElement>('#ro-check-lan') : null) ??
      // A first control is focused only for keyboard / controller players; on touch
      // or mouse a ring on the first tab reads as a selection. The first D-pad press
      // focuses it anyway.
      (getInputModality() === 'mouse'
        ? null
        : focusRoot.querySelector<HTMLElement>('[data-ro-focusable="true"]:not([disabled]):not([aria-disabled="true"])'))
    if (restore) {
      restore.focus({ preventScroll: true })
      if (restoreScroll != null) {
        window.scrollTo(0, restoreScroll)
        rememberScroll(restoreScroll)
      } else {
        restore.closest('[data-ro-focus-row]')?.scrollIntoView({ block: 'nearest' })
      }
      if (restore.dataset.focusId) rememberFocus(restore.dataset.focusId)
    } else if (restoreScroll != null) {
      window.scrollTo(0, restoreScroll)
      rememberScroll(restoreScroll)
    }
  }

  const rowCleanup = focusCleanup
  focusCleanup = () => {
    stopPads()
    rowCleanup?.()
  }
}
