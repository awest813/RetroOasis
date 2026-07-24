import {
  applyLocalScan,
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
import {
  applyStoredCrt,
  applyStoredLayout,
  clearLocalPrefs,
  getAccent,
  getCrtEnabled,
  getHideDemos,
  getLayout,
  getSoundsEnabled,
  setAccent,
  setCrtEnabled,
  setHideDemos,
  setLayout,
  setSoundsEnabled,
  type AccentMode,
  type LayoutMode,
} from '../lib/store'
import { sfxToggle } from '../lib/sfx'

export async function renderSettings(root: HTMLElement): Promise<void> {
  const accent = getAccent()
  const crt = getCrtEnabled()
  const hideDemos = getHideDemos()
  const layout = getLayout()
  const sounds = getSoundsEnabled()
  const meta = await getLocalLibraryMeta()
  const catalog = await loadCatalog()
  const canPick = supportsDirectoryPicker()
  const installable = canInstallPwa()
  const installed = isPwaInstalled()

  root.innerHTML = `
    <section class="ro-view">
      <p class="ro-kicker">Cabinet prefs</p>
      <h1 class="ro-title">Settings</h1>
      <p class="ro-lede">Local-only preferences. Install the app shell as a PWA when the browser offers it.</p>

      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 40rem;">
        <div class="ro-settings-row">
          <div>
            <strong>Accent</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">Sega cyan or PlayStation amber.</p>
          </div>
          <div class="ro-toggle-group">
            <button type="button" class="ro-btn" data-accent="sega" aria-pressed="${accent === 'sega'}">Sega</button>
            <button type="button" class="ro-btn" data-accent="ps" aria-pressed="${accent === 'ps'}">PS</button>
          </div>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Layout</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">TV mode enlarges focus targets for couch / gamepad use.</p>
          </div>
          <div class="ro-toggle-group">
            <button type="button" class="ro-btn" data-layout="standard" aria-pressed="${layout === 'standard'}">Standard</button>
            <button type="button" class="ro-btn" data-layout="tv" aria-pressed="${layout === 'tv'}">TV</button>
          </div>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>CRT overlay</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">Heavier scanlines + vignette on the shell.</p>
          </div>
          <button type="button" class="ro-btn" id="ro-crt" aria-pressed="${crt}">${crt ? 'On' : 'Off'}</button>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>UI sounds</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">Soft menu blips on move / confirm. Off by default.</p>
          </div>
          <button type="button" class="ro-btn" id="ro-sounds" aria-pressed="${sounds}">${sounds ? 'On' : 'Off'}</button>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Hide demo catalog</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">Show only hosted / linked ROMs in the library.</p>
          </div>
          <button type="button" class="ro-btn" id="ro-hide-demos" aria-pressed="${hideDemos}">${hideDemos ? 'On' : 'Off'}</button>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Hosted ROMs</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              ${
                catalog.hostedCount
                  ? `Loaded <strong>${catalog.hostedCount}</strong> from <code>roms/manifest.json</code>.`
                  : 'Optional <code>roms/manifest.json</code> works on every browser (see example + generate script).'
              }
            </p>
          </div>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Local ROM folder</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              ${
                meta.linked
                  ? `Linked: <strong>${meta.name ?? 'folder'}</strong>`
                  : canPick
                    ? 'Use File System Access to scan <code>roms/&lt;platform&gt;/</code>.'
                    : 'This browser cannot link folders. Use hosted manifest or Upload.'
              }
            </p>
            <p class="ro-muted" id="ro-folder-status" hidden></p>
          </div>
          <div class="ro-btn-row">
            ${canPick ? `<button type="button" class="ro-btn" id="ro-link">Link</button>` : ''}
            ${meta.linked ? `<button type="button" class="ro-btn ro-btn--ghost" id="ro-unlink">Unlink</button>` : ''}
          </div>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Install app</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              ${
                installed
                  ? 'Running as an installed PWA.'
                  : installable
                    ? 'Browser is ready to install RetroOasis.'
                    : 'Install prompt appears on HTTPS after the shell is cached (production build).'
              }
            </p>
          </div>
          ${
            installable
              ? `<button type="button" class="ro-btn ro-btn--primary" id="ro-install">Install</button>`
              : ''
          }
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Clear play data</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">Recents and favorites stored in this browser.</p>
          </div>
          <button type="button" class="ro-btn ro-btn--ghost" id="ro-clear-prefs">Clear</button>
        </div>

        <div class="ro-settings-row">
          <div>
            <strong>Hosting</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              <code>npm run oasis:build</code> → serve <code>retrooasis/dist/</code> beside EmulatorJS
              <code>data/</code> and optional <code>roms/</code>. Generate a manifest with
              <code>npm run oasis:manifest</code>.
            </p>
          </div>
        </div>
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
        status.textContent = err instanceof Error ? err.message : 'Cancelled.'
      }
    }
  })

  root.querySelector('#ro-unlink')?.addEventListener('click', async () => {
    await unlinkLocalCatalog()
    void renderSettings(root)
  })

  root.querySelector('#ro-install')?.addEventListener('click', async () => {
    await promptPwaInstall()
    void renderSettings(root)
  })

  root.querySelector('#ro-clear-prefs')?.addEventListener('click', () => {
    clearLocalPrefs()
    void renderSettings(root)
  })
}
