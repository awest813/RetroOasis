import {
  UPLOAD_CORE_OPTIONS,
  coreForPlatform,
  coreNeedsThreads,
  isRomFile,
  romFileAccept,
} from '../lib/cores'
import { detectRomPlatform } from '../lib/archives'
import {
  groupDiscSetFiles,
  missingCompanionsMessage,
  readDescriptorTexts,
} from '../lib/discSets'
import { escapeHtml } from '../lib/dom'
import { takePendingUploads } from '../lib/pendingUploads'
import { buildPlayerUrl } from '../lib/play'
import { hrefFor } from '../lib/router'
import { formatEjsChannelLabel, pushRecent } from '../lib/store'
import { reloadUploadedLibrary, type Game } from '../lib/catalog'
import { formatBytes, getUploadedLibraryMeta, saveUploadedRomSet } from '../lib/uploadedLibrary'
import { getStorageSnapshot, storageWarning } from '../lib/storageQuota'
import {
  dataTransferHasDirectory,
  dataTransferIsDirectoryOnly,
  discSetLabel,
  emptyDropMessage,
  filesFromList,
  folderDropMessage,
  formatUploadProgress,
  shouldLaunchAfterUpload,
  summarizeUpload,
  threadSupportHint,
  type UploadOutcome,
} from '../lib/uploadFlow'
import { friendlyError } from '../lib/userErrors'
import { bindGridFocus } from '../lib/focus'
import { sfxConfirm } from '../lib/sfx'
import { supportsDirectoryPicker } from '../lib/localLibrary'
import { registerViewCleanup } from '../lib/viewLifecycle'

const CORE_EXT_HINTS: Record<string, string> = {
  auto: 'Auto picks a system from the extension, and looks inside .zip / .7z / .rar to find one.',
  nes: 'Common: .nes · .fds · .unif',
  snes: 'Common: .sfc · .smc',
  gb: 'Common: .gb · .gbc',
  gba: 'Common: .gba',
  nds: 'Common: .nds',
  n64: 'Common: .z64 · .n64 · .v64',
  vb: 'Common: .vb',
  '3ds': 'Common: .3ds · .cia · .cci — needs threads',
  psx: 'Common: .cue · .chd · .bin/.img — zips/7z/rar of these work in Auto',
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

function hasThreadSupport(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
}

function coreHintText(core: string): string {
  const base = CORE_EXT_HINTS[core] ?? 'Pick the system that matches your ROM.'
  const warn = threadSupportHint(core, hasThreadSupport())
  return warn ? `${base} ${warn}` : base
}

function channelFootnote(): string {
  return `Using the ${formatEjsChannelLabel()} channel. PSP, 3DS, and DOS always use Nightly — change the rest in Settings.`
}

export function renderUpload(root: HTMLElement): void {
  const canPickFolder = supportsDirectoryPicker()
  root.innerHTML = `
    <section class="ro-view ro-upload">
      <header class="ro-upload__head">
        <p class="ro-kicker"><a href="${hrefFor('/')}">Home</a><span aria-hidden="true"> / </span>Add a ROM</p>
        <h1 class="ro-title">Add a ROM</h1>
        <p class="ro-lede">
          Drop in ROM or ISO files to save them on this device and start playing.
          Disc dumps (.cue + .bin, playlists) are kept together. They stay in your library until you remove them.
        </p>
      </header>
      <div class="ro-stack ro-upload__stack">
        <div class="ro-upload__field">
          <label class="ro-upload__label" for="ro-core">System</label>
          <select id="ro-core" class="ro-input" data-ro-focusable="true" aria-describedby="ro-core-hint">
            ${UPLOAD_CORE_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
          <p class="ro-muted ro-upload__hint" id="ro-core-hint">${coreHintText('auto')}</p>
        </div>
        <div
          class="ro-drop"
          id="ro-drop"
          tabindex="0"
          data-ro-focusable="true"
          role="button"
          aria-labelledby="ro-drop-title"
          aria-describedby="ro-drop-sub ro-core-hint"
        >
          <span class="ro-drop__mark" aria-hidden="true">＋</span>
          <strong class="ro-drop__title" id="ro-drop-title">Drop ROM files here</strong>
          <span class="ro-muted ro-drop__sub" id="ro-drop-sub">or click to choose — you can add more than one</span>
        </div>
        <input id="ro-file" type="file" accept="${romFileAccept()}" hidden multiple />
        <p class="ro-muted ro-upload__status" id="ro-status" role="status" aria-live="polite" hidden></p>
        <ol class="ro-upload__log" id="ro-upload-log" hidden></ol>
        <p class="ro-muted ro-upload__meta" id="ro-upload-meta"></p>
        <p class="ro-muted ro-upload__footnote" id="ro-upload-footnote">${channelFootnote()}</p>
        ${
          canPickFolder
            ? `<p class="ro-muted ro-upload__footnote">To add a whole <code>roms/&lt;system&gt;/</code> folder without copying it, <a href="${hrefFor('/settings')}">link it in Settings</a>.</p>`
            : ''
        }
        <div class="ro-btn-row ro-upload__actions">
          <a class="ro-btn ro-btn--ghost" id="ro-upload-library" href="${hrefFor('/library')}" data-ro-focusable="true">View library</a>
          <a class="ro-btn ro-btn--ghost" href="${hrefFor('/')}" data-ro-focusable="true">Back home</a>
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
  const log = root.querySelector<HTMLOListElement>('#ro-upload-log')
  const meta = root.querySelector<HTMLElement>('#ro-upload-meta')
  const libraryBtn = root.querySelector<HTMLAnchorElement>('#ro-upload-library')
  const stack = root.querySelector<HTMLElement>('.ro-upload__stack')
  let busy = false
  let active = true
  const cleanupFocus = stack ? bindGridFocus(stack) : undefined
  registerViewCleanup(() => {
    active = false
    cleanupFocus?.()
  })

  const say = (text: string) => {
    if (!status) return
    status.textContent = text
    status.hidden = !text
  }

  const setDropCopy = (mode: 'idle' | 'drag' | 'busy') => {
    if (!dropTitle || !dropSub) return
    if (mode === 'busy') {
      dropTitle.textContent = 'Saving…'
      dropSub.textContent = 'Keep this tab open'
      return
    }
    if (mode === 'drag') {
      dropTitle.textContent = 'Release to add'
      dropSub.textContent = 'Saves to this device — one file starts playing'
      return
    }
    dropTitle.textContent = 'Drop ROM files here'
    dropSub.textContent = 'or click to choose — you can add more than one'
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
    const core = coreSelect.value
    hint.textContent = coreHintText(core)
    hint.classList.toggle('ro-upload__hint--warn', Boolean(threadSupportHint(core, hasThreadSupport())))
    if (input) {
      if (core === 'auto') {
        input.setAttribute('accept', romFileAccept())
      } else {
        input.removeAttribute('accept')
      }
    }
  }

  const paintMeta = async () => {
    if (!meta || !active) return
    try {
      const uploaded = await getUploadedLibraryMeta()
      const storage = await getStorageSnapshot()
      if (!active) return
      const saved = uploaded.count
        ? `${uploaded.count} saved ROM${uploaded.count === 1 ? '' : 's'} · ${formatBytes(uploaded.bytes)} on this device`
        : 'Nothing saved on this device yet.'
      const warn = storageWarning(storage)
      meta.textContent = warn ? `${saved} ${warn}` : saved
    } catch {
      if (active) meta.textContent = ''
    }
  }

  const paintLog = (outcomes: UploadOutcome[]) => {
    if (!log) return
    if (!outcomes.length) {
      log.innerHTML = ''
      log.hidden = true
      return
    }
    log.hidden = false
    log.innerHTML = outcomes
      .map((outcome) => {
        const mark = outcome.kind === 'saved' ? 'Saved' : outcome.kind === 'skipped' ? 'Skipped' : 'Error'
        const body =
          outcome.kind === 'saved' && outcome.gameId
            ? `<a href="${hrefFor(`/game/${encodeURIComponent(outcome.gameId)}`)}" data-ro-focusable="true">${escapeHtml(outcome.filename)}</a>
               <span class="ro-muted">${escapeHtml(outcome.detail)}</span>`
            : `<span>${escapeHtml(outcome.filename)}</span>
               <span class="ro-muted">${escapeHtml(outcome.detail)}</span>`
        return `<li class="ro-upload__log-item ro-upload__log-item--${outcome.kind}">
          <span class="ro-upload__log-mark">${mark}</span>
          <div class="ro-upload__log-copy">${body}</div>
        </li>`
      })
      .join('')
  }

  const highlightLibrary = (saved: boolean) => {
    if (!libraryBtn) return
    libraryBtn.classList.toggle('ro-btn--primary', saved)
    libraryBtn.classList.toggle('ro-btn--ghost', !saved)
  }

  coreSelect?.addEventListener('change', syncHint)
  syncHint()
  void paintMeta()

  const launch = async (files: File[], note?: string) => {
    if (!coreSelect || busy || files.length === 0) return
    sfxConfirm()
    paintLog([])
    highlightLibrary(false)
    setBusy(true)

    const outcomes: UploadOutcome[] = []
    let playable: Game | undefined
    let navigating = false

    try {
      const texts = await readDescriptorTexts(files)
      if (!active) return
      const plans = groupDiscSetFiles(files, texts)

      for (let index = 0; index < plans.length; index += 1) {
        if (!active) return
        const plan = plans[index]
        const label = discSetLabel(plan.files.map((file) => file.name))
        let core = coreSelect.value

        if (core === 'auto') {
          if (!isRomFile(plan.primary.name)) {
            const detail = `File type isn’t recognized. Pick a system above, or use a common ROM extension.`
            outcomes.push({ kind: 'skipped', filename: label, detail })
            say(formatUploadProgress(index, plans.length, 'Skipping', label))
            continue
          }
          say(formatUploadProgress(index, plans.length, 'Checking', label, formatBytes(plan.files.reduce((n, f) => n + f.size, 0))))
          let detected: string | null = null
          try {
            detected = await detectRomPlatform(plan.primary)
          } catch (err) {
            outcomes.push({
              kind: 'error',
              filename: label,
              detail: friendlyError(err, 'Couldn’t read that file.'),
            })
            continue
          }
          if (!detected) {
            outcomes.push({
              kind: 'skipped',
              filename: label,
              detail: 'Couldn’t auto-detect. Choose a system from the list.',
            })
            continue
          }
          core = coreForPlatform(detected)
        }

        const missingNote = missingCompanionsMessage(plan.primary.name, plan.missing)
        if (missingNote && plan.files.length === 1) {
          outcomes.push({ kind: 'skipped', filename: label, detail: missingNote })
          continue
        }

        const batchBytes = plan.files.reduce((n, f) => n + f.size, 0)
        say(formatUploadProgress(index, plans.length, 'Saving', label, formatBytes(batchBytes)))

        try {
          const snapshot = await getStorageSnapshot()
          if (!active) return
          const spaceNote = storageWarning(snapshot, batchBytes)
          const nextPercent = snapshot.quota > 0 ? ((snapshot.usage + batchBytes) / snapshot.quota) * 100 : 0
          if (spaceNote && nextPercent >= 95) {
            outcomes.push({ kind: 'error', filename: label, detail: spaceNote })
            continue
          }
          const { game, replaced } = await saveUploadedRomSet(plan.files, core)
          pushRecent(game.id)
          await reloadUploadedLibrary()
          const needsThreads = coreNeedsThreads(core)
          const threadNote =
            needsThreads && !hasThreadSupport()
              ? ' Saved, but this page is missing thread support so it may not start.'
              : ''
          const setNote = plan.kind === 'disc-set' ? ` Packed ${plan.files.length} files.` : ''
          const spaceWarn = spaceNote ? ` ${spaceNote}` : ''
          outcomes.push({
            kind: 'saved',
            filename: label,
            detail: `${replaced ? 'Replaced existing file' : 'Added to library'}${setNote}${missingNote ? ` ${missingNote}` : ''}${threadNote}${spaceWarn}`,
            gameId: game.id,
            holdLaunch: Boolean(missingNote),
          })
          playable = game
        } catch (err) {
          outcomes.push({
            kind: 'error',
            filename: label,
            detail: friendlyError(err, 'Try another file.'),
          })
        }
      }

      if (!active) return

      if (shouldLaunchAfterUpload(outcomes) && playable) {
        say(`Saved. Starting ${playable.title}…`)
        navigating = true
        window.location.href = buildPlayerUrl(
          playable,
          playable.file,
          hrefFor(`/game/${encodeURIComponent(playable.id)}`),
        )
        return
      }

      paintLog(outcomes)
      const savedCount = outcomes.filter((o) => o.kind === 'saved').length
      highlightLibrary(savedCount > 0)
      const summary = summarizeUpload(outcomes)
      say(note ? `${summary} ${note}` : summary)
      if (savedCount > 0) libraryBtn?.focus({ preventScroll: true })
      await paintMeta()
    } finally {
      if (input) input.value = ''
      if (active && !navigating) setBusy(false)
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

  drop?.addEventListener('dragenter', (event) => {
    event.preventDefault()
    if (busy) return
    drop.setAttribute('data-drag', 'true')
    setDropCopy('drag')
  })
  drop?.addEventListener('dragover', (event) => {
    event.preventDefault()
    if (busy) return
    drop.setAttribute('data-drag', 'true')
  })
  drop?.addEventListener('dragleave', (event) => {
    event.preventDefault()
    const next = event.relatedTarget
    if (next instanceof Node && drop.contains(next)) return
    drop.removeAttribute('data-drag')
    if (!busy) setDropCopy('idle')
  })
  drop?.addEventListener('drop', (event) => {
    event.preventDefault()
    drop.removeAttribute('data-drag')
    if (!busy) setDropCopy('idle')
    if (busy) return

    const dt = event.dataTransfer
    if (dataTransferIsDirectoryOnly(dt)) {
      paintLog([])
      highlightLibrary(false)
      say(folderDropMessage())
      return
    }

    const files = filesFromList(dt?.files)
    if (files.length === 0) {
      paintLog([])
      highlightLibrary(false)
      say(emptyDropMessage())
      return
    }

    if (dataTransferHasDirectory(dt)) {
      void launch(files, 'Folders were ignored — link a folder in Settings to add a whole library.')
      return
    }
    void launch(files)
  })

  input?.addEventListener('change', () => {
    const files = filesFromList(input.files)
    if (files.length > 0) void launch(files)
  })

  const pending = takePendingUploads()
  if (pending.length) void launch(pending)
}
