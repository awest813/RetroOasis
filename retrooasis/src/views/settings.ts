import {
  applyLocalScan,
  clearUploadedCatalog,
  loadCatalog,
  refreshCatalogView,
  unlinkLocalCatalog,
} from '../lib/catalog'
import {
  getLocalLibraryMeta,
  pickLocalLibrary,
  supportsDirectoryPicker,
} from '../lib/localLibrary'
import {
  canInstallPwa,
  isPwaInstalled,
  promptPwaInstall,
} from '../lib/pwa'
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
import { friendlyError } from '../lib/userErrors'
import { bindRowFocus } from '../lib/focus'
import { suppressPadBackUntilRelease } from '../lib/input'
import { registerViewCleanup } from '../lib/viewLifecycle'

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

function pressed(on: boolean): string {
  return on ? 'true' : 'false'
}

function confirmAction(message: string): boolean {
  const ok = window.confirm(message)
  suppressPadBackUntilRelease()
  return ok
}

export async function renderSettings(root: HTMLElement): Promise<void> {
  const accent = getAccent()
  const crt = getCrtEnabled()
  const hideDemos = getHideDemos()
  const layout = getLayout()
  const sounds = getSoundsEnabled()
  const pack = getSoundPack()
  const libretro = getLibretroCovers()
  const ejsChannel = getEjsChannel()
  const meta = await getLocalLibraryMeta()
  const uploadedMeta = await getUploadedLibraryMeta()
  const hasSab = typeof SharedArrayBuffer !== 'undefined'
  const catalog = await loadCatalog()
  const canPick = supportsDirectoryPicker()
  const installable = canInstallPwa()
  const installed = isPwaInstalled()
  // Preserve row focus/scroll across catalog-driven rebuilds.
  const existing = root.querySelector<HTMLElement>('[data-ro-settings]')
  if (existing) {
    const active = document.activeElement as HTMLElement | null
    if (active?.dataset.focusId && root.contains(active)) rememberFocus(active.dataset.focusId)
    rememberScroll()
  }

  const restoreId = readFocus()
  const restoreScroll = readScroll()

  root.innerHTML = `
    <section class="ro-view ro-settings-page">
      <header class="ro-settings-page__head">
        <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Settings</p>
        <h1 class="ro-title">Settings</h1>
        <p class="ro-lede">Cabinet prefs stay on this device.</p>
      </header>

      <div class="ro-settings" data-ro-settings>
        <section class="ro-settings__group" aria-labelledby="ro-set-look">
          <h2 class="ro-settings__heading" id="ro-set-look">Look</h2>

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
          <h2 class="ro-settings__heading" id="ro-set-playback">Sound &amp; cores</h2>

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
              <button type="button" class="ro-btn" data-pack="soft" data-focus-id="pack-soft"${sounds ? ' data-ro-focusable="true"' : ' disabled'} aria-pressed="${pressed(pack === 'soft')}">Soft</button>
              <button type="button" class="ro-btn" data-pack="xmb" data-focus-id="pack-xmb"${sounds ? ' data-ro-focusable="true"' : ' disabled'} aria-pressed="${pressed(pack === 'xmb')}">XMB</button>
              <button type="button" class="ro-btn" data-pack="arcade" data-focus-id="pack-arcade"${sounds ? ' data-ro-focusable="true"' : ' disabled'} aria-pressed="${pressed(pack === 'arcade')}">Arcade</button>
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--stack" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>EmulatorJS channel</strong>
              <p class="ro-muted">
                Most systems use Stable. PSP, 3DS, and DOS stay on Nightly unless you pick Local.
                ${
                  hasSab
                    ? 'Threaded cores can run here.'
                    : 'Threaded cores need special host headers — see the README.'
                }
              </p>
            </div>
            <div class="ro-toggle-group ro-toggle-group--channels" role="group" aria-label="EmulatorJS channel">
              <button type="button" class="ro-btn" data-ejs="stable" data-focus-id="ejs-stable" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'stable')}">Stable</button>
              <button type="button" class="ro-btn" data-ejs="nightly" data-focus-id="ejs-nightly" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'nightly')}">Nightly</button>
              <button type="button" class="ro-btn" data-ejs="latest" data-focus-id="ejs-latest" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'latest')}">Latest</button>
              <button type="button" class="ro-btn" data-ejs="local" data-focus-id="ejs-local" data-ro-focusable="true" aria-pressed="${pressed(ejsChannel === 'local')}">Local</button>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-library">
          <h2 class="ro-settings__heading" id="ro-set-library">Library</h2>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Libretro covers</strong>
              <p class="ro-muted">Fill missing box art when available.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-libretro" data-focus-id="libretro" data-ro-focusable="true" aria-pressed="${pressed(libretro)}" aria-label="Libretro covers">${libretro ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Hide demos</strong>
              <p class="ro-muted">Show only ROMs you’ve hosted, linked, or saved.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--toggle" id="ro-hide-demos" data-focus-id="hide-demos" data-ro-focusable="true" aria-pressed="${pressed(hideDemos)}" aria-label="Hide demos">${hideDemos ? 'On' : 'Off'}</button>
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
                     <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-uploads" data-focus-id="clear-uploads" data-ro-focusable="true">Clear</button>`
                  : `<a class="ro-btn" href="${hrefFor('/upload')}" data-focus-id="add-rom" data-ro-focusable="true">Add ROM</a>`
              }
            </div>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Local folder</strong>
              <p class="ro-muted">
                ${
                  meta.linked
                    ? `Linked to <strong>${meta.name ?? 'folder'}</strong>`
                    : canPick
                      ? 'Link a <code>roms/&lt;system&gt;/</code> folder on this computer.'
                      : 'This browser can’t link folders. Use Add ROM instead.'
                }
              </p>
              <p class="ro-muted" id="ro-folder-status" hidden></p>
            </div>
            <div class="ro-btn-row">
              ${canPick ? `<button type="button" class="ro-btn" id="ro-link" data-focus-id="link-folder" data-ro-focusable="true">${meta.linked ? 'Relink' : 'Link folder'}</button>` : ''}
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
          <h2 class="ro-settings__heading" id="ro-set-data">Data</h2>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Install app</strong>
              <p class="ro-muted">
                ${
                  installed
                    ? 'Running as an installed app.'
                    : installable
                      ? 'Add a home-screen shortcut.'
                      : 'Install appears on HTTPS after the shell is cached.'
                }
              </p>
            </div>
            ${
              installed
                ? ''
                : installable
                  ? `<button type="button" class="ro-btn" id="ro-install" data-focus-id="install" data-ro-focusable="true" aria-label="Install RetroOasis">Install app</button>`
                  : `<button type="button" class="ro-btn" data-focus-id="install" disabled title="Install appears on HTTPS after the shell is cached.">Unavailable here</button>`
            }
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Clear recents &amp; favorites</strong>
              <p class="ro-muted">Recently played and favorites on this device.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-prefs" data-focus-id="clear-prefs" data-ro-focusable="true">Clear</button>
          </div>

          <div class="ro-settings-row" data-ro-focus-row>
            <div class="ro-settings-row__copy">
              <strong>Metadata edits</strong>
              <p class="ro-muted">Title and cover changes from game pages.</p>
            </div>
            <div class="ro-btn-row">
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-export-over" data-focus-id="export-over" data-ro-focusable="true">Export</button>
              <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-over" data-focus-id="clear-over" data-ro-focusable="true">Clear</button>
            </div>
          </div>
        </section>

        <div class="ro-settings__footer" data-ro-focus-row>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/')}" data-focus-id="back-home" data-ro-focusable="true">Back home</a>
          <p class="ro-settings__footnote ro-muted">
            Self-host: <code>npm run oasis:build</code>, serve <code>dist/</code> beside
            <code>data/</code> and <code>roms/</code>.
          </p>
        </div>
      </div>
    </section>
  `

  const rerender = (focusId?: string) => {
    if (focusId) rememberFocus(focusId)
    rememberScroll()
    void renderSettings(root)
  }

  root.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAccent(btn.dataset.accent as AccentMode)
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
      if (btn.disabled) return
      setSoundPack(btn.dataset.pack as SoundPack)
      if (getSoundsEnabled()) sfxToggle()
      rerender(btn.dataset.focusId)
    })
  })

  root.querySelector('#ro-libretro')?.addEventListener('click', () => {
    setLibretroCovers(!getLibretroCovers())
    rerender('libretro')
  })

  root.querySelectorAll<HTMLButtonElement>('[data-ejs]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setEjsChannel(btn.dataset.ejs as EjsChannel)
      rerender(btn.dataset.focusId)
    })
  })

  root.querySelector('#ro-hide-demos')?.addEventListener('click', () => {
    rememberFocus('hide-demos')
    rememberScroll()
    setHideDemos(!getHideDemos())
    refreshCatalogView()
  })

  root.querySelector('#ro-link')?.addEventListener('click', async () => {
    const status = root.querySelector<HTMLElement>('#ro-folder-status')
    try {
      const result = await pickLocalLibrary()
      await applyLocalScan(result)
      rerender('link-folder')
    } catch (err) {
      if (status) {
        status.hidden = false
        status.textContent = friendlyError(err, 'Cancelled.')
      }
    }
  })

  root.querySelector('#ro-unlink')?.addEventListener('click', async () => {
    if (!confirmAction('Unlink the local ROM folder on this device?')) return
    await unlinkLocalCatalog()
    rerender('unlink-folder')
  })

  root.querySelector('#ro-clear-uploads')?.addEventListener('click', async () => {
    if (!confirmAction('Remove all saved ROMs from this device? This can’t be undone.')) return
    await clearUploadedCatalog()
    rerender('clear-uploads')
  })

  root.querySelector('#ro-install')?.addEventListener('click', async () => {
    await promptPwaInstall()
    rerender('install')
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
    URL.revokeObjectURL(url)
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
    registerViewCleanup(bindRowFocus(focusRoot))
    const restore =
      (restoreId
        ? focusRoot.querySelector<HTMLElement>(
            `[data-focus-id="${CSS.escape(restoreId)}"]:not([disabled])`,
          )
        : null) ??
      focusRoot.querySelector<HTMLElement>('[data-ro-focusable="true"]:not([disabled])')
    if (restore) {
      restore.focus({ preventScroll: true })
      if (restoreScroll != null) {
        window.scrollTo(0, restoreScroll)
        rememberScroll(restoreScroll)
      } else {
        restore.closest('[data-ro-focus-row]')?.scrollIntoView({ block: 'nearest' })
      }
      if (restore.dataset.focusId) rememberFocus(restore.dataset.focusId)
    }
  }
}
