import { getAccent, setAccent, type AccentMode } from '../lib/store'

export function renderSettings(root: HTMLElement): void {
  const accent = getAccent()

  root.innerHTML = `
    <section class="ro-view">
      <p class="ro-kicker">Cabinet prefs</p>
      <h1 class="ro-title">Settings</h1>
      <p class="ro-lede">Local-only preferences. A service worker / installable PWA lands in a later phase.</p>

      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 36rem;">
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
            <strong>Hosting</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              Build with <code>npm run build</code> in <code>retrooasis/</code>, then serve
              <code>dist/</code> beside EmulatorJS <code>data/</code> and your <code>roms/</code>.
            </p>
          </div>
        </div>
        <div class="ro-settings-row">
          <div>
            <strong>PWA</strong>
            <p class="ro-muted" style="margin: 0.25rem 0 0;">
              Manifest is wired. Offline caching + install prompt come next once the shell settles.
            </p>
          </div>
        </div>
      </div>
    </section>
  `

  root.querySelectorAll<HTMLButtonElement>('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.accent as AccentMode
      setAccent(mode)
      renderSettings(root)
    })
  })
}
