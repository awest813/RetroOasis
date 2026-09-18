/** Pure helpers for the Add a ROM view — status copy, file lists, batch summaries. */

import { coreNeedsThreads } from './cores'

export type UploadKind = 'saved' | 'skipped' | 'error'

export interface UploadOutcome {
  kind: UploadKind
  filename: string
  detail: string
  gameId?: string
}

export function filesFromList(list: ArrayLike<File> | null | undefined): File[] {
  if (!list) return []
  return Array.from(list).filter((file) => Boolean(file?.name?.trim()))
}

export function dataTransferHasDirectory(dt: DataTransfer | null | undefined): boolean {
  if (!dt?.items?.length) return false
  return Array.from(dt.items).some((item) => {
    if (item.kind !== 'file') return false
    const entry = item.webkitGetAsEntry?.()
    return Boolean(entry?.isDirectory)
  })
}

export function dataTransferIsDirectoryOnly(dt: DataTransfer | null | undefined): boolean {
  if (!dt?.items?.length) return false
  const entries = Array.from(dt.items).map((item) => {
    if (item.kind !== 'file') return null
    return item.webkitGetAsEntry?.() ?? null
  })
  if (entries.some((entry) => !entry)) return false
  return entries.every((entry) => entry!.isDirectory)
}

export function formatUploadProgress(
  index: number,
  total: number,
  phase: string,
  filename: string,
  sizeLabel?: string,
): string {
  const prefix = total > 1 ? `${index + 1} of ${total} · ` : ''
  const size = sizeLabel ? ` (${sizeLabel})` : ''
  return `${prefix}${phase} ${filename}${size}…`
}

export function summarizeUpload(outcomes: UploadOutcome[]): string {
  if (!outcomes.length) return 'No ROM files to add.'

  const saved = outcomes.filter((o) => o.kind === 'saved').length
  const skipped = outcomes.filter((o) => o.kind === 'skipped').length
  const failed = outcomes.filter((o) => o.kind === 'error').length

  if (saved === outcomes.length) {
    return saved === 1
      ? `Saved ${outcomes[0].filename}. It’s in your library.`
      : `Saved ${saved} ROMs. They’re in your library.`
  }

  if (saved === 0 && failed === 0) {
    return skipped === 1
      ? outcomes[0].detail
      : `Skipped ${skipped} files. Choose a system, or use a common ROM extension.`
  }

  if (saved === 0 && skipped === 0) {
    return failed === 1
      ? outcomes[0].detail
      : `${failed} files couldn’t be saved. See the list below.`
  }

  const parts: string[] = []
  if (saved) parts.push(`saved ${saved}`)
  if (skipped) parts.push(`skipped ${skipped}`)
  if (failed) parts.push(`${failed} failed`)
  return `${parts.join(', ')}. See the list below.`
}

export function shouldLaunchAfterUpload(outcomes: UploadOutcome[]): boolean {
  return outcomes.length === 1 && outcomes[0]?.kind === 'saved' && Boolean(outcomes[0].gameId)
}

export function threadSupportHint(core: string, hasThreads: boolean): string | null {
  if (core === 'auto' || !coreNeedsThreads(core) || hasThreads) return null
  return 'This page is missing thread support, so this system may not start. Use the RetroOasis dev server or a host with isolation headers.'
}

export function folderDropMessage(): string {
  return 'Folders aren’t copied here. Link a folder in Settings to add a whole library without filling this browser’s storage.'
}

export function emptyDropMessage(): string {
  return 'That drop didn’t include a ROM file. Choose files, or link a folder in Settings.'
}

export function discSetLabel(filenames: string[]): string {
  if (filenames.length <= 1) return filenames[0] || 'ROM'
  return `${filenames[0]} + ${filenames.length - 1} more`
}
