import { escapeHtml } from '../lib/dom'
import { hrefFor } from '../lib/router'
import { formatBytes } from '../lib/uploadedLibrary'
import { decodeBackup, deleteSave, encodeBackup, listSaves, MAX_BACKUP_BYTES, restoreBackup, type SaveBackup, type SaveEntry, type SaveKind } from '../lib/saves'
import { suppressPadBackUntilRelease } from '../lib/input'
import { registerViewCleanup } from '../lib/viewLifecycle'
import { bindRowFocus } from '../lib/focus'

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function renderSaves(root: HTMLElement): Promise<void> {
  let active = true
  let cleanupFocus: (() => void) | undefined
  let entries: SaveEntry[] = []
  let kind: SaveKind = 'game'
  let pending: SaveBackup | null = null
  let busy = false
  let busyFocus: HTMLElement | null = null
  let failed = false
  let query = ''
  registerViewCleanup(() => { active = false; cleanupFocus?.() })
  root.innerHTML = `
    <section class="ro-view ro-saves">
      <p class="ro-kicker"><a href="${hrefFor('/settings')}">Settings</a> / On this device</p>
      <h1 class="ro-title">Local saves</h1>
      <p class="ro-lede">Keep your progress close. Back up and restore saves stored in this browser.</p>
      <p class="ro-muted">Close games in other tabs before changing saves. Browser data is separate for each site and device; clearing it removes local progress.</p>
      <div class="ro-saves__toolbar">
        <div class="ro-toggle-group" role="group" aria-label="Save type">
          <button class="ro-btn" data-kind="game" aria-pressed="true">In-game saves</button>
          <button class="ro-btn" data-kind="state" aria-pressed="false">Save states</button>
        </div>
        <div class="ro-btn-row">
          <button class="ro-btn ro-btn--primary" id="ro-save-backup">Back up saves</button>
          <button class="ro-btn ro-btn--ghost" id="ro-save-import">Restore backup</button>
          <button class="ro-btn ro-btn--ghost" id="ro-save-refresh">Refresh</button>
        </div>
      </div>
      <p class="ro-muted" id="ro-save-explainer"></p>
      <input type="file" id="ro-save-file" accept=".json,application/json" hidden />
      <div id="ro-save-review" class="ro-onboard" hidden></div>
      <label class="ro-saves__search">Find a save<input type="search" class="ro-input" id="ro-save-query" placeholder="Search filenames" /></label>
      <p class="ro-muted ro-saves__summary" id="ro-save-summary"></p>
      <p class="ro-muted ro-saves__status" id="ro-save-status" role="status" aria-live="polite"></p>
      <div id="ro-save-list"></div>
    </section>`
  const list = root.querySelector<HTMLElement>('#ro-save-list')!
  const status = root.querySelector<HTMLElement>('#ro-save-status')!
  const summary = root.querySelector<HTMLElement>('#ro-save-summary')!
  const review = root.querySelector<HTMLElement>('#ro-save-review')!
  const input = root.querySelector<HTMLInputElement>('#ro-save-file')!
  const say = (text: string) => { if (active) status.textContent = text }
  const setBusy = (value: boolean) => {
    if (value && !busy) busyFocus = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null
    busy = value
    root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = value })
    root.querySelector<HTMLButtonElement>('#ro-save-backup')!.disabled = value || failed || !entries.some(e => e.bytes)
    list.setAttribute('aria-busy', String(value))
    if (!value) {
      if (busyFocus?.isConnected && document.activeElement === document.body) busyFocus.focus({ preventScroll: true })
      busyFocus = null
    }
  }
  const draw = () => {
    cleanupFocus?.()
    const files = entries.filter(e => e.bytes)
    const visible = files.filter(e => e.key.toLowerCase().includes(query.toLowerCase()))
    list.innerHTML = visible.length ? visible.map(entry => {
      const index = entries.indexOf(entry)
      const filename = entry.key.split('/').pop()!
      return `<article class="ro-save-row" data-ro-focus-row>
        <div class="ro-save-row__copy"><h2>${escapeHtml(filename)}</h2>
          <p class="ro-muted">${formatBytes(entry.bytes!.byteLength)}${entry.modified ? ` · ${escapeHtml(new Date(entry.modified).toLocaleString())}` : ' · Date unavailable'}</p>
          ${kind === 'game' ? `<p class="ro-save-row__path">${escapeHtml(entry.key.slice('/data/saves/'.length))}</p>` : ''}
        </div>
        <div class="ro-btn-row">
          <button class="ro-btn ro-btn--ghost" data-download="${index}" data-ro-focusable="true" aria-label="Download ${escapeHtml(filename)}">Download</button>
          <button class="ro-btn ro-btn--danger" data-delete="${index}" data-ro-focusable="true" aria-label="Delete ${escapeHtml(filename)}">Delete</button>
        </div></article>`
    }).join('') : `<div class="ro-empty"><p class="ro-empty__title">${query ? 'No matching saves' : 'No saves here yet'}</p>
      <p class="ro-empty__body">${query ? 'Try another filename.' : kind === 'game' ? 'Save your progress inside a game, then return here. You can also restore a RetroOasis backup.' : 'In the player, choose Browser for Save State Location and create a save state. Downloaded states are not listed here.'}</p></div>`
    cleanupFocus = bindRowFocus(list)
    summary.textContent = `${visible.length} of ${files.length} saves · ${formatBytes(files.reduce((sum, e) => sum + e.bytes!.byteLength, 0))} total`
  }
  const refresh = async (): Promise<boolean> => {
    failed = false
    setBusy(true)
    say('Reading local saves…')
    try {
      entries = await listSaves(kind)
      if (active) { draw(); say('') }
      return true
    } catch (error) {
      failed = true
      entries = []
      if (active) summary.textContent = ''
      if (active) list.innerHTML = '<div class="ro-empty"><p class="ro-empty__title">Saves could not be read</p><p class="ro-empty__body">Your progress has not been changed. Try Refresh.</p></div>'
      say(error instanceof Error ? error.message : 'Local save storage is unavailable.')
      return false
    } finally { if (active) setBusy(false) }
  }
  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await work() } catch (error) { say(error instanceof Error ? error.message : 'Could not complete that action.') }
    finally { if (active) setBusy(false) }
  }
  const explain = () => {
    root.querySelector('#ro-save-explainer')!.textContent = kind === 'game'
      ? 'In-game saves include battery saves and memory cards. Backups include their original folders.'
      : 'Save states capture an exact moment. Restore them with the same game and compatible emulator core.'
  }
  root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => button.addEventListener('click', () => {
    if (busy) return
    kind = button.dataset.kind as SaveKind
    pending = null
    review.hidden = true
    root.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b === button)))
    explain()
    void refresh()
  }))
  root.querySelector('#ro-save-query')!.addEventListener('input', event => {
    query = (event.target as HTMLInputElement).value.trim()
    if (!busy && !failed) { draw(); say(summary.textContent ?? '') }
  })
  root.querySelector('#ro-save-refresh')!.addEventListener('click', () => { void refresh() })
  root.querySelector('#ro-save-backup')!.addEventListener('click', () => void run(async () => {
    const latest = await listSaves(kind)
    if (!active) return
    download(new Blob([encodeBackup(kind, latest)], { type: 'application/json' }), `retrooasis-${kind}-saves-${new Date().toISOString().slice(0, 10)}.json`)
    say('Backup download started. Keep the file somewhere safe.')
  }))
  root.querySelector('#ro-save-import')!.addEventListener('click', () => { input.value = ''; input.click() })
  input.addEventListener('change', () => void run(async () => {
    pending = null
    review.hidden = true
    const file = input.files?.[0]
    if (!file) return
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Backups must be smaller than 128 MB.')
    const parsed = decodeBackup(await file.text())
    if (!active) return
    const files = parsed.entries.filter(e => e.bytes)
    if (!files.length) throw new Error('This backup contains no save files.')
    const current = await listSaves(parsed.kind)
    if (!active) return
    pending = parsed
    const count = files.length
    const existingKeys = new Set(current.filter(e => e.bytes).map(e => e.key))
    const conflicts = files.filter(e => existingKeys.has(e.key)).length
    review.hidden = false
    review.innerHTML = `<h2 class="ro-onboard__title">Ready to restore ${count} ${parsed.kind === 'game' ? 'in-game saves' : 'save states'}</h2>
      <p class="ro-onboard__body">${escapeHtml(file.name)} · ${formatBytes(files.reduce((sum, e) => sum + e.bytes!.byteLength, 0))}</p>
      <p class="ro-muted">${count - conflicts} new · ${conflicts} already on this device. Existing saves are kept by default.</p>
      <ul class="ro-saves__preview">${files.slice(0, 5).map(e => `<li>${escapeHtml(e.key.split('/').pop()!)}${existingKeys.has(e.key) ? ' · already saved' : ''}</li>`).join('')}${count > 5 ? `<li>And ${count - 5} more…</li>` : ''}</ul>
      <label class="ro-saves__replace"><input type="checkbox" id="ro-save-replace" /> Replace saves with the same names</label>
      <div class="ro-btn-row"><button class="ro-btn ro-btn--primary" id="ro-save-confirm">Restore ${count} saves</button><button class="ro-btn ro-btn--ghost" id="ro-save-cancel">Cancel</button></div>`
    review.querySelector('#ro-save-cancel')!.addEventListener('click', () => { pending = null; review.hidden = true; root.querySelector<HTMLButtonElement>('#ro-save-import')!.focus() })
    review.querySelector('#ro-save-confirm')!.addEventListener('click', () => void run(async () => {
      if (!pending) return
      const replace = review.querySelector<HTMLInputElement>('#ro-save-replace')!.checked
      if (replace) {
        const ok = window.confirm('Replace matching local saves with this backup? Current progress in those saves will be overwritten. Close other game tabs first.')
        suppressPadBackUntilRelease()
        if (!ok) return
      }
      const result = await restoreBackup(pending, replace)
      if (!active) return
      kind = pending.kind
      root.querySelectorAll<HTMLElement>('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)))
      explain()
      pending = null
      review.hidden = true
      query = ''
      root.querySelector<HTMLInputElement>('#ro-save-query')!.value = ''
      const refreshed = await refresh()
      if (!active) return
      if (refreshed) say(`Restored ${result.restored} saves; kept ${result.skipped} existing saves. Restart the game to load restored progress.`)
      else say(`Restored ${result.restored} saves; kept ${result.skipped}. The list could not be refreshed. Try Refresh.`)
      root.querySelector<HTMLButtonElement>('#ro-save-import')!.focus()
    }))
    review.querySelector<HTMLButtonElement>('#ro-save-confirm')!.focus()
    say('Backup checked. Review the restore options above.')
  }))
  list.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!button || busy) return
    const index = Number(button.dataset.download ?? button.dataset.delete)
    const entry = entries[index]
    if (!entry?.bytes) return
    if (button.dataset.download !== undefined) {
      download(new Blob([entry.bytes], { type: 'application/octet-stream' }), entry.key.split('/').pop()!)
      say('Save download started. Use the player to import an individual raw save file.')
    } else {
      const ok = window.confirm(`Delete “${entry.key}” from this browser? This cannot be undone. Download it first if you want a backup. Close other game tabs first.`)
      suppressPadBackUntilRelease()
      if (ok) void run(async () => {
        await deleteSave(kind, entry.key)
        if (!active) return
        const refreshed = await refresh()
        if (!active) return
        say(refreshed ? 'Save deleted from this browser.' : 'Save deleted, but the list could not be refreshed. Try Refresh.')
        root.querySelector<HTMLButtonElement>('#ro-save-refresh')!.focus()
      })
    }
  })
  explain()
  await refresh()
  if (active && document.activeElement === root) root.querySelector<HTMLButtonElement>('[data-kind]')!.focus({ preventScroll: true })
}
