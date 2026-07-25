import { UPLOAD_CORE_OPTIONS, coreFromExtension } from '../lib/cores'
import { reloadUploadedLibrary } from '../lib/catalog'
import { buildPlayerUrl } from '../lib/play'
import { hrefFor } from '../lib/router'
import { getEjsChannel, pushRecent, resolveEjsChannel } from '../lib/store'
import { saveUploadedRom } from '../lib/uploadedLibrary'

const CORE_EXT_HINTS: Record<string, string> = {
  auto: 'Auto picks a core from the file extension (.nes, .sfc, .gba, .zip, …).',
  nes: 'Common: .nes · .fds · .unif',
  snes: 'Common: .sfc · .smc',
  gb: 'Common: .gb · .gbc',
  gba: 'Common: .gba',
  nds: 'Common: .nds',
  n64: 'Common: .z64 · .n64 · .v64',
  vb: 'Common: .vb',
  '3ds': 'Common: .3ds · .cia · .cci — needs threads',
  psx: 'Common: .cue · .chd · .bin/.img',
  ppsspp: 'Common: .iso · .cso · .pbp — needs threads',
  segaMD: 'Common: .md · .gen · .smd',
  segaMS: 'Common: .sms',
  segaGG: 'Common: .gg',
  segaCD: 'Common: .cue · .chd · .iso',
  sega32x: 'Common: .32x',
  segaSaturn: 'Common: .cue · .chd',
  arcade: 'Common: .zip · .7z (FBNeo sets)',
  mame2003: 'Common: .zip (MAME 2003 sets)',
  atari2600: 'Common: .a26 · .bin',
  atari7800: 'Common: .a78',
  atari5200: 'Common: .a52',
  lynx: 'Common: .lnx',
  jaguar: 'Common: .j64 · .jag',
  '3do': 'Common: .iso · .cue',
  pce: 'Common: .pce',
  pcfx: 'Common: .cue · .chd',
  ngp: 'Common: .ngp · .ngc',
  ws: 'Common: .ws · .wsc',
  coleco: 'Common: .col · .cv',
  vice_x64sc: 'Common: .d64 · .t64 · .prg',
  vice_x128: 'Common: .d64 · .t64 · .prg',
  vice_xvic: 'Common: .prg · .d64',
  vice_xplus4: 'Common: .prg · .d64',
  vice_xpet: 'Common: .prg · .d64',
  puae: 'Common: .adf · .hdf · .ipf',
  dosbox_pure: 'Common: .exe · .com · .bat · .iso — needs threads',
  intv: 'Common: .int · .itv',
}

export function renderUpload(root: HTMLElement): void {
  root.innerHTML = `
    <section class="ro-view">
      <p class="ro-kicker">Power path</p>
      <h1 class="ro-title">Add ROM</h1>
      <p class="ro-lede">
        Drop a file to save it in this browser’s library and play via EmulatorJS.
        Uploads stay on this device (IndexedDB) until you remove them. Most systems use the
        <strong>stable</strong> CDN; PSP / DOS / 3DS need threads (COOP/COEP) and use
        <strong>nightly</strong>.
      </p>
      <div class="ro-stack" style="margin-top: 1.5rem; max-width: 32rem;">
        <label class="ro-muted" for="ro-core">System core</label>
        <select id="ro-core" class="ro-input">
          ${UPLOAD_CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <p class="ro-muted ro-upload__hint" id="ro-core-hint">${CORE_EXT_HINTS.auto}</p>
        <div class="ro-drop" id="ro-drop" tabindex="0" data-ro-focusable="true">
          <span class="ro-drop__mark" aria-hidden="true">▼</span>
          <strong>Drop ROM here</strong>
          <span class="ro-muted">or click to choose a file</span>
        </div>
        <input id="ro-file" type="file" hidden />
        <p class="ro-muted" id="ro-status">Preferred channel: ${getEjsChannel()} (PSP / 3DS / DOS → nightly). Change in Settings.</p>
        <div class="ro-btn-row">
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}">Back to library</a>
        </div>
      </div>
    </section>
  `

  const input = root.querySelector<HTMLInputElement>('#ro-file')
  const coreSelect = root.querySelector<HTMLSelectElement>('#ro-core')
  const hint = root.querySelector<HTMLElement>('#ro-core-hint')
  const status = root.querySelector<HTMLElement>('#ro-status')
  const drop = root.querySelector<HTMLElement>('#ro-drop')

  const syncHint = () => {
    if (!coreSelect || !hint) return
    hint.textContent = CORE_EXT_HINTS[coreSelect.value] ?? 'Choose a core that matches your ROM.'
  }

  coreSelect?.addEventListener('change', syncHint)
  syncHint()

  const launch = async (file: File) => {
    if (!coreSelect) return
    let core = coreSelect.value
    if (core === 'auto') {
      core = coreFromExtension(file.name) || 'nes'
    }

    const channel = resolveEjsChannel(core)
    if (status) status.textContent = `Saving ${file.name} to library…`

    try {
      const game = await saveUploadedRom(file, file.name, core)
      await reloadUploadedLibrary()
      pushRecent(game.id)

      if (status) status.textContent = `Saved. Launching ${file.name} (${core}, ${channel})…`
      const back = hrefFor(`/game/${game.id}`)
      window.location.href = buildPlayerUrl(game, game.file, back)
    } catch (err) {
      if (status) {
        status.textContent =
          err instanceof Error ? err.message : 'Could not save ROM to the library.'
      }
    }
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
    if (file) void launch(file)
  })

  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) void launch(file)
  })
}
