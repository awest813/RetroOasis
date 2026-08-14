import {
  UPLOAD_CORE_OPTIONS,
  coreFromExtension,
  isRomFile,
  romFileAccept,
} from '../lib/cores'
import { buildPlayerUrl } from '../lib/play'
import { hrefFor } from '../lib/router'
import { getEjsChannel, pushRecent } from '../lib/store'
import { formatBytes, saveUploadedRom } from '../lib/uploadedLibrary'
import { friendlyError } from '../lib/userErrors'
import { bindGridFocus } from '../lib/focus'
import { registerViewCleanup } from '../lib/viewLifecycle'

const CORE_EXT_HINTS: Record<string, string> = {
  auto: 'Auto picks a system from the file extension (.nes, .sfc, .gba, .zip, …).',
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
    <section class="ro-view ro-upload">
      <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Add ROM</p>
      <h1 class="ro-title">Add ROM</h1>
      <p class="ro-lede">
        Drop in a ROM to save it on this device and start playing.
        It stays in your library until you remove it.
      </p>
      <div class="ro-stack ro-upload__stack">
        <label class="ro-muted" for="ro-core">System</label>
        <select id="ro-core" class="ro-input" data-ro-focusable="true">
          ${UPLOAD_CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <p class="ro-muted ro-upload__hint" id="ro-core-hint">${CORE_EXT_HINTS.auto}</p>
        <div
          class="ro-drop"
          id="ro-drop"
          tabindex="0"
          data-ro-focusable="true"
          role="button"
          aria-label="Drop a ROM file here, or click to choose one"
        >
          <span class="ro-drop__mark" aria-hidden="true">▼</span>
          <strong class="ro-drop__title" id="ro-drop-title">Drop ROM here</strong>
          <span class="ro-muted ro-drop__sub" id="ro-drop-sub">or click to choose a file</span>
        </div>
        <input id="ro-file" type="file" accept="${romFileAccept()}" hidden />
        <p class="ro-muted ro-upload__status" id="ro-status" role="status" aria-live="polite">
          Using the ${getEjsChannel()} channel. PSP, 3DS, and DOS always use nightly — change the rest in Settings.
        </p>
        <div class="ro-btn-row">
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/')}" data-ro-focusable="true">Back home</a>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/library')}" data-ro-focusable="true">Library</a>
        </div>
      </div>
    </section>
  `

  const input = root.querySelector<HTMLInputElement>('#ro-file')
  const coreSelect = root.querySelector<HTMLSelectElement>('#ro-core')
  const hint = root.querySelector<HTMLElement>('#ro-core-hint')
  const status = root.querySelector<HTMLElement>('#ro-status')
  const drop = root.querySelector<HTMLElement>('#ro-drop')
  const dropTitle = root.querySelector<HTMLElement>('#ro-drop-title')
  const dropSub = root.querySelector<HTMLElement>('#ro-drop-sub')
  const stack = root.querySelector<HTMLElement>('.ro-upload__stack')
  let busy = false
  if (stack) registerViewCleanup(bindGridFocus(stack))

  const setDropCopy = (mode: 'idle' | 'drag' | 'busy') => {
    if (!dropTitle || !dropSub) return
    if (mode === 'busy') {
      dropTitle.textContent = 'Saving…'
      dropSub.textContent = 'Almost ready to play'
      return
    }
    if (mode === 'drag') {
      dropTitle.textContent = 'Release to add'
      dropSub.textContent = 'Saves to your library, then plays'
      return
    }
    dropTitle.textContent = 'Drop ROM here'
    dropSub.textContent = 'or click to choose a file'
  }

  const setBusy = (next: boolean) => {
    busy = next
    drop?.classList.toggle('ro-drop--busy', next)
    drop?.toggleAttribute('aria-busy', next)
    drop?.setAttribute('aria-disabled', next ? 'true' : 'false')
    if (coreSelect) coreSelect.disabled = next
    if (drop) drop.tabIndex = next ? -1 : 0
    setDropCopy(next ? 'busy' : 'idle')
  }

  const syncHint = () => {
    if (!coreSelect || !hint) return
    hint.textContent = CORE_EXT_HINTS[coreSelect.value] ?? 'Pick the system that matches your ROM.'
    if (input) {
      if (coreSelect.value === 'auto') {
        input.setAttribute('accept', romFileAccept())
      } else {
        input.removeAttribute('accept')
      }
    }
  }

  coreSelect?.addEventListener('change', syncHint)
  syncHint()

  const launch = async (file: File) => {
    if (!coreSelect || busy) return
    let core = coreSelect.value
    if (core === 'auto') {
      if (!isRomFile(file.name)) {
        if (status) {
          status.textContent =
            'That file type isn’t recognized. Pick a system above, or use a common ROM extension.'
        }
        return
      }
      const detected = coreFromExtension(file.name)
      if (!detected) {
        if (status) {
          status.textContent =
            'Couldn’t auto-detect that ROM. Choose a system from the list, then try again.'
        }
        return
      }
      core = detected
    }

    setBusy(true)
    if (status) {
      status.textContent = `Saving ${file.name} (${formatBytes(file.size)})…`
    }

    try {
      const game = await saveUploadedRom(file, file.name, core)
      pushRecent(game.id)

      if (status) status.textContent = `Saved. Starting ${file.name}…`
      const back = hrefFor(`/game/${game.id}`)
      window.location.href = buildPlayerUrl(game, game.file, back)
    } catch (err) {
      setBusy(false)
      if (input) input.value = ''
      if (status) {
        status.textContent = friendlyError(err, 'Couldn’t save that ROM. Try another file.')
      }
    }
  }

  drop?.addEventListener('click', () => {
    if (!busy) input?.click()
  })
  drop?.addEventListener('keydown', (event) => {
    if (busy) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      input?.click()
    }
  })

  ;['dragenter', 'dragover'].forEach((type) => {
    drop?.addEventListener(type, (event) => {
      event.preventDefault()
      if (busy) return
      drop.setAttribute('data-drag', 'true')
      setDropCopy('drag')
    })
  })
  ;['dragleave', 'drop'].forEach((type) => {
    drop?.addEventListener(type, (event) => {
      event.preventDefault()
      drop.removeAttribute('data-drag')
      if (!busy) setDropCopy('idle')
    })
  })

  drop?.addEventListener('drop', (event) => {
    if (busy) return
    const file = event.dataTransfer?.files?.[0]
    if (file) void launch(file)
  })

  input?.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) void launch(file)
  })
}
