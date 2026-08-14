export type InputModality = 'mouse' | 'key' | 'pad'

let modality: InputModality = 'mouse'

export function getInputModality(): InputModality {
  return modality
}

export function setModality(next: InputModality): void {
  if (modality === next) return
  modality = next
  document.documentElement.dataset.input = next
}

export function setModalityFromPad(): void {
  setModality('pad')
}
