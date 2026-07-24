import { coreFromExtension } from '../lib/cores'
import { hrefFor } from '../lib/router'

const CORE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'NES', value: 'nes' },
  { label: 'SNES', value: 'snes' },
  { label: 'Game Boy', value: 'gb' },
  { label: 'GBA', value: 'gba' },
  { label: 'N64', value: 'n64' },
  { label: 'Mega Drive', value: 'segaMD' },
  { label: 'Master System', value: 'segaMS' },
  { label: 'PlayStation', value: 'psx' },
  { label: 'Arcade', value: 'arcade' },
]

export function renderUpload(root: HTMLElement): void {
  root.innerHTML = `
    <section class="ro-view">
      <p class="ro-kicker">Power path</p>
      <h1 class="ro-title">Upload ROM</h1>
      <p class="ro-lede">
        Drop a file to play immediately via EmulatorJS. For a lasting library, link a folder,
        or host <code>roms/manifest.json</code> beside the site.
      </p>
      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 32rem;">
        <label class="ro-muted" for="ro-core">System core</label>
        <select id="ro-core" class="ro-input">
          ${CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <div class="ro-drop" id="ro-drop" tabindex="0" data-ro-focusable="true">
          <strong>Drop ROM here</strong>
          <span class="ro-muted">or click to choose a file</span>
        </div>
        <input id="ro-file" type="file" hidden />
        <p class="ro-muted" id="ro-status">No file selected.</p>
        <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}">Back to library</a>
      </div>
    </section>
  `

  const input = root.querySelector<HTMLInputElement>('#ro-file')
  const coreSelect = root.querySelector<HTMLSelectElement>('#ro-core')
  const status = root.querySelector<HTMLElement>('#ro-status')
  const drop = root.querySelector<HTMLElement>('#ro-drop')

  const launch = (file: File) => {
    if (!coreSelect) return
    let core = coreSelect.value
    if (core === 'auto') {
      core = coreFromExtension(file.name) || 'nes'
    }

    const objectUrl = URL.createObjectURL(file)
    const name = file.name.replace(/\.[^.]+$/, '')
    const params = new URLSearchParams({
      rom: objectUrl,
      core,
      name,
      back: './#/upload',
    })

    if (status) status.textContent = `Launching ${file.name} (${core})…`
    window.location.href = `./player.html?${params.toString()}`
  }

  drop?.addEventListener('click', () => input?.click())
  drop?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      input?.click()
    }
  })

  ;['dragenter', 'dragover'].forEach((type) => {
    drop?.addEventListener(type, (event) => {
      event.preventDefault()
      drop.setAttribute('data-drag', 'true')
    })
  })
  ;['dragleave', 'drop'].forEach((type) => {
    drop?.addEventListener(type, (event) => {
      event.preventDefault()
      drop.removeAttribute('data-drag')
    })
  })

  drop?.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0]
    if (file) launch(file)
  })

  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) launch(file)
  })
}
