/** Lightweight keyboard focus for grids (gamepad Phase 2). */

export function bindGridFocus(root: HTMLElement): () => void {
  const items = () =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-ro-focusable="true"]')).filter(
      (el) => !el.hasAttribute('disabled'),
    )

  const onKeyDown = (event: KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter']
    if (!keys.includes(event.key)) return

    const list = items()
    if (!list.length) return

    const active = document.activeElement as HTMLElement | null
    let index = active ? list.indexOf(active) : -1
    if (index < 0) index = 0

    const columns = estimateColumns(root, list)
    let next = index

    if (event.key === 'ArrowRight') next = Math.min(list.length - 1, index + 1)
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
    if (event.key === 'ArrowDown') next = Math.min(list.length - 1, index + columns)
    if (event.key === 'ArrowUp') next = Math.max(0, index - columns)

    if (event.key === 'Enter') {
      active?.click()
      return
    }

    if (next !== index || active !== list[next]) {
      event.preventDefault()
      list[next]?.focus()
    }
  }

  root.addEventListener('keydown', onKeyDown)
  return () => root.removeEventListener('keydown', onKeyDown)
}

function estimateColumns(_root: HTMLElement, list: HTMLElement[]): number {
  if (list.length < 2) return 1
  const top = list[0].offsetTop
  let cols = 1
  for (let i = 1; i < list.length; i++) {
    if (list[i].offsetTop !== top) break
    cols++
  }
  return Math.max(1, cols)
}
