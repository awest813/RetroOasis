/** Decorative action icons: labels belong to the surrounding control. */
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  library: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  favorite: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  settings: '<path d="m9.5 3-.6 2.4-1.5.9L5 5.6 2.5 10l1.8 1.7v1.6L2.5 15l2.5 4.4 2.4-.7 1.5.9.6 2.4h5l.6-2.4 1.5-.9 2.4.7 2.5-4.4-1.8-1.7v-1.6L21.5 10 19 5.6l-2.4.7-1.5-.9L14.5 3z"/><circle cx="12" cy="12.5" r="3.5"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  saves: '<path d="M4 3h13l4 4v14H4zM8 3v6h8V3M8 21v-7h9v7"/>',
  edit: '<path d="m14 5 5 5M4 20l5-1L20 8a3.5 3.5 0 0 0-5-5L4 14z"/>',
  remove: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
} as const

export function icon(name: keyof typeof paths, filled = false): string {
  return `<svg class="ro-icon" viewBox="0 0 24 24" width="20" height="20" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`
}
