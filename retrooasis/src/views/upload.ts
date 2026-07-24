import { UPLOAD_CORE_OPTIONS, coreFromExtension, coreNeedsThreads } from '../lib/cores'
import { hrefFor } from '../lib/router'
import { getEjsChannel } from '../lib/store'

export function renderUpload(root: HTMLElement): void {
  root.innerHTML = `
    <section class="ro-view">
      <p class="ro-kicker">Power path</p>
      <h1 class="ro-title">Upload ROM</h1>
      <p class="ro-lede">
        Drop a file to play immediately via EmulatorJS. PSP / DOS / 3DS cores need threads
        (COOP/COEP) and default to the <strong>nightly</strong> CDN channel.
      </p>
      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 32rem;">
        <label class="ro-muted" for="ro-core">System core</label>
        <select id="ro-core" class="ro-input">
          ${UPLOAD_CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <div class="ro-drop" id="ro-drop" tabindex="0" data-ro-focusable="true">
          <strong>Drop ROM here</strong>
          <span class="ro-muted">or click to choose a file</span>
        </div>
        <input id="ro-file" type="file" hidden />
        <p class="ro-muted" id="ro-status">Channel: ${getEjsChannel()}. Change in Settings.</p>
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
    const channel = getEjsChannel()
    const params = new URLSearchParams({
      rom: objectUrl,
      core,
      name,
      channel,
      back: './#/upload',
    })
    if (coreNeedsThreads(core)) params.set('threads', '1')

    if (status) status.textContent = `Launching ${file.name} (${core}, ${channel})…`
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
