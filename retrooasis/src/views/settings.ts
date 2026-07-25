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

  root.innerHTML = `
    <section class="ro-view ro-settings-page">
      <p class="ro-kicker">Cabinet prefs</p>
      <h1 class="ro-title">Settings</h1>
      <p class="ro-lede">Tweaks stay on this device. Install the app when your browser offers it for a home-screen shortcut.</p>

      <div class="ro-settings">
        <section class="ro-settings__group" aria-labelledby="ro-set-look">
          <h2 class="ro-settings__heading" id="ro-set-look">Look</h2>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Accent</strong>
              <p class="ro-muted">Sega cyan or PlayStation amber.</p>
            </div>
            <div class="ro-toggle-group" role="group" aria-label="Accent color">
              <button type="button" class="ro-btn" data-accent="sega" aria-pressed="${accent === 'sega'}">Sega</button>
              <button type="button" class="ro-btn" data-accent="ps" aria-pressed="${accent === 'ps'}">PS</button>
            </div>
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Layout</strong>
              <p class="ro-muted">TV mode enlarges targets for couch and gamepad use.</p>
            </div>
            <div class="ro-toggle-group" role="group" aria-label="Layout mode">
              <button type="button" class="ro-btn" data-layout="standard" aria-pressed="${layout === 'standard'}">Standard</button>
              <button type="button" class="ro-btn" data-layout="tv" aria-pressed="${layout === 'tv'}">TV</button>
            </div>
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>CRT overlay</strong>
              <p class="ro-muted">Heavier scanlines and edge darkening on the shell.</p>
            </div>
            <button type="button" class="ro-btn" id="ro-crt" aria-pressed="${crt}">${crt ? 'On' : 'Off'}</button>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-playback">
          <h2 class="ro-settings__heading" id="ro-set-playback">Playback</h2>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>UI sounds</strong>
              <p class="ro-muted">Soft menu blips on move and confirm. Off by default.</p>
            </div>
            <button type="button" class="ro-btn" id="ro-sounds" aria-pressed="${sounds}">${sounds ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Sound pack</strong>
              <p class="ro-muted">Gentle tones or sharper arcade beeps.</p>
            </div>
            <div class="ro-toggle-group" role="group" aria-label="Sound pack">
              <button type="button" class="ro-btn" data-pack="soft" aria-pressed="${pack === 'soft'}">Soft</button>
              <button type="button" class="ro-btn" data-pack="arcade" aria-pressed="${pack === 'arcade'}">Arcade</button>
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--stack">
            <div class="ro-settings-row__copy">
              <strong>EmulatorJS channel</strong>
              <p class="ro-muted">
                Where cores load from. Most systems use <strong>stable</strong>;
                PSP, 3DS, and DOS always use <strong>nightly</strong> unless you pick Local.
                ${
                  hasSab
                    ? 'Threaded cores can run in this browser.'
                    : 'Threaded cores need special host headers — use the RetroOasis dev server, or see the README.'
                }
              </p>
            </div>
            <div class="ro-toggle-group ro-toggle-group--channels" role="group" aria-label="EmulatorJS channel">
              <button type="button" class="ro-btn" data-ejs="stable" aria-pressed="${ejsChannel === 'stable'}">Stable</button>
              <button type="button" class="ro-btn" data-ejs="nightly" aria-pressed="${ejsChannel === 'nightly'}">Nightly</button>
              <button type="button" class="ro-btn" data-ejs="latest" aria-pressed="${ejsChannel === 'latest'}">Latest</button>
              <button type="button" class="ro-btn" data-ejs="local" aria-pressed="${ejsChannel === 'local'}">Local</button>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-library">
          <h2 class="ro-settings__heading" id="ro-set-library">Library</h2>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Libretro covers</strong>
              <p class="ro-muted">Fill in missing box art from Libretro thumbnails when available.</p>
            </div>
            <button type="button" class="ro-btn" id="ro-libretro" aria-pressed="${libretro}">${libretro ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Hide demo catalog</strong>
              <p class="ro-muted">Show only ROMs you’ve hosted, linked, or saved.</p>
            </div>
            <button type="button" class="ro-btn" id="ro-hide-demos" aria-pressed="${hideDemos}">${hideDemos ? 'On' : 'Off'}</button>
          </div>

          <div class="ro-settings-row ro-settings-row--stack">
            <div class="ro-settings-row__copy">
              <strong>Saved ROMs</strong>
              ${
                uploadedMeta.count
                  ? `<p class="ro-muted">${uploadedMeta.count} ROM${uploadedMeta.count === 1 ? '' : 's'} · ${formatBytes(uploadedMeta.bytes)} on this device</p>`
                  : `<p class="ro-muted">Files you add stay on this device between visits.</p>`
              }
            </div>
            <div class="ro-btn-row">
              ${
                uploadedMeta.count
                  ? `<a class="ro-btn ro-btn--ghost" href="${hrefFor('/library/@all')}">View library</a>
                     <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-uploads">Clear</button>`
                  : `<a class="ro-btn" href="${hrefFor('/upload')}">Add ROM</a>`
              }
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--stack">
            <div class="ro-settings-row__copy">
              <strong>Local folder</strong>
              <p class="ro-muted">
                ${
                  meta.linked
                    ? `Linked to <strong>${meta.name ?? 'folder'}</strong>`
                    : canPick
                      ? 'Link a <code>roms/&lt;system&gt;/</code> folder on this computer.'
                      : 'This browser can’t link folders. Use Add ROM or a hosted manifest instead.'
                }
              </p>
              <p class="ro-muted" id="ro-folder-status" hidden></p>
            </div>
            <div class="ro-btn-row">
              ${canPick ? `<button type="button" class="ro-btn" id="ro-link">${meta.linked ? 'Relink' : 'Link folder'}</button>` : ''}
              ${meta.linked ? `<button type="button" class="ro-btn ro-btn--ghost" id="ro-unlink">Unlink</button>` : ''}
            </div>
          </div>

          <div class="ro-settings-row ro-settings-row--note">
            <div class="ro-settings-row__copy">
              <strong>Hosted ROMs</strong>
              <p class="ro-muted">
                ${
                  catalog.hostedCount
                    ? `Loaded ${catalog.hostedCount} from your site’s <code>roms/manifest.json</code>.`
                    : 'Optional for any browser: put games under <code>roms/</code> and generate a manifest (see the README).'
                }
              </p>
            </div>
          </div>
        </section>

        <section class="ro-settings__group" aria-labelledby="ro-set-data">
          <h2 class="ro-settings__heading" id="ro-set-data">Data</h2>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Install app</strong>
              <p class="ro-muted">
                ${
                  installed
                    ? 'You’re running RetroOasis as an installed app.'
                    : installable
                      ? 'Add it to your home screen for quicker launches.'
                      : 'Install appears on HTTPS after the app shell is cached (production build).'
                }
              </p>
            </div>
            ${
              installable
                ? `<button type="button" class="ro-btn" id="ro-install">Install</button>`
                : ''
            }
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Clear play history</strong>
              <p class="ro-muted">Removes recently played and favorites on this device.</p>
            </div>
            <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-prefs">Clear</button>
          </div>

          <div class="ro-settings-row">
            <div class="ro-settings-row__copy">
              <strong>Metadata edits</strong>
              <p class="ro-muted">Title and cover changes from game pages. Export as JSON or clear them.</p>
            </div>
            <div class="ro-btn-row">
              <button type="button" class="ro-btn ro-btn--ghost" id="ro-export-over">Export</button>
              <button type="button" class="ro-btn ro-btn--danger" id="ro-clear-over">Clear</button>
            </div>
          </div>
        </section>

        <p class="ro-settings__footnote ro-muted">
          Self-host tip: build with <code>npm run oasis:build</code>, serve <code>dist/</code> beside
          <code>data/</code> and <code>roms/</code>. Scan with <code>npm run oasis:scan</code>.
        </p>
      </div>
    </section>
  `

  root.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setAccent(btn.dataset.accent as AccentMode)
      void renderSettings(root)
    })
  })

  root.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLayout(btn.dataset.layout as LayoutMode)
      applyStoredLayout()
      void renderSettings(root)
    })
  })

  root.querySelector('#ro-crt')?.addEventListener('click', () => {
    setCrtEnabled(!getCrtEnabled())
    applyStoredCrt()
    void renderSettings(root)
  })

  root.querySelector('#ro-sounds')?.addEventListener('click', () => {
    const next = !getSoundsEnabled()
    setSoundsEnabled(next)
    if (next) sfxToggle()
    void renderSettings(root)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSoundPack(btn.dataset.pack as SoundPack)
      if (getSoundsEnabled()) sfxToggle()
      void renderSettings(root)
    })
  })

  root.querySelector('#ro-libretro')?.addEventListener('click', () => {
    setLibretroCovers(!getLibretroCovers())
    void renderSettings(root)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-ejs]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setEjsChannel(btn.dataset.ejs as EjsChannel)
      void renderSettings(root)
    })
  })

  root.querySelector('#ro-hide-demos')?.addEventListener('click', () => {
    setHideDemos(!getHideDemos())
    refreshCatalogView()
    void renderSettings(root)
  })

  root.querySelector('#ro-link')?.addEventListener('click', async () => {
    const status = root.querySelector<HTMLElement>('#ro-folder-status')
    try {
      const result = await pickLocalLibrary()
      await applyLocalScan(result)
      void renderSettings(root)
    } catch (err) {
      if (status) {
        status.hidden = false
        status.textContent = friendlyError(err, 'Cancelled.')
      }
    }
  })

  root.querySelector('#ro-unlink')?.addEventListener('click', async () => {
    await unlinkLocalCatalog()
    void renderSettings(root)
  })

  root.querySelector('#ro-clear-uploads')?.addEventListener('click', async () => {
    if (!window.confirm('Remove all saved ROMs from this device? This can’t be undone.')) return
    await clearUploadedCatalog()
    void renderSettings(root)
  })

  root.querySelector('#ro-install')?.addEventListener('click', async () => {
    await promptPwaInstall()
    void renderSettings(root)
  })

  root.querySelector('#ro-clear-prefs')?.addEventListener('click', () => {
    if (!window.confirm('Clear recently played and favorites on this device?')) return
    clearLocalPrefs()
    void renderSettings(root)
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
    if (!window.confirm('Clear all local metadata edits on this device?')) return
    clearAllOverrides()
    refreshCatalogView()
    void renderSettings(root)
  })
}
