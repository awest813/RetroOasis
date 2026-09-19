/** Files handed to the PWA via OS file handlers before Add ROM is open. */

let pending: File[] = []

export function queuePendingUploads(files: File[]): void {
  pending = files.filter((file) => Boolean(file?.name?.trim()))
}

export function takePendingUploads(): File[] {
  const files = pending
  pending = []
  return files
}

export function hasPendingUploads(): boolean {
  return pending.length > 0
}
