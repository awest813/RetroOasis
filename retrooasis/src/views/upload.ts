import { hrefFor } from '../lib/router'

const CORE_OPTIONS: Array<{ label: string; value: string }> = [
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
        Drop a file to play immediately via EmulatorJS. For a lasting library, link a
        <code>roms/&lt;platform&gt;/</code> folder from the Library page, or host files and list them in
        <code>catalog/games.json</code>.
      </p>
      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 28rem;">
        <label class="ro-muted" for="ro-core">System core</label>
        <select id="ro-core" class="ro-search" style="padding: 0.55rem 0.75rem; background: var(--ro-bg-panel); border: 1px solid var(--ro-line); color: var(--ro-text);">
          ${CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <label class="ro-btn" for="ro-file" data-ro-focusable="true" style="text-align: center;">
          Choose ROM file
        </label>
        <input id="ro-file" type="file" hidden />
        <p class="ro-muted" id="ro-status">No file selected.</p>
        <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}">Back to library</a>
      </div>
    </section>
  `

  const input = root.querySelector<HTMLInputElement>('#ro-file')
  const coreSelect = root.querySelector<HTMLSelectElement>('#ro-core')
  const status = root.querySelector<HTMLElement>('#ro-status')

  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file || !coreSelect) return

    const objectUrl = URL.createObjectURL(file)
    const params = new URLSearchParams({
      rom: objectUrl,
      core: coreSelect.value,
      name: file.name.replace(/\.[^.]+$/, ''),
      back: './#/upload',
    })

    if (status) status.textContent = `Launching ${file.name}…`
    window.location.href = `./player.html?${params.toString()}`
  })
}
