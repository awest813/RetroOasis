/** Original XMB-style category icons (SVG). No trademarked console marks. */

const VB = 'viewBox="0 0 32 32" aria-hidden="true" focusable="false"'

function svg(body: string): string {
  return `<svg ${VB} class="ro-xmb__glyph">${body}</svg>`
}

const ICONS: Record<string, string> = {
  home: svg(
    `<path fill="currentColor" d="M16 4.5 3.5 14.2V28h9.2v-8.2h6.6V28h9.2V14.2z"/>`,
  ),
  recent: svg(
    `<circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M15 8h2v8.2l5.2 3.1-.9 1.6L15 17.2z"/>`,
  ),
  favorites: svg(
    `<path fill="currentColor" d="m16 5 2.7 6.4 6.9.6-5.2 4.4 1.6 6.7L16 19.6l-5.9 3.5 1.6-6.7-5.2-4.4 6.9-.6z"/>`,
  ),
  add: svg(
    `<path fill="currentColor" d="M14.2 6.5h3.6v7.7h7.7v3.6h-7.7v7.7h-3.6v-7.7H6.5v-3.6h7.7z"/>`,
  ),
  settings: svg(
    `<path fill="currentColor" d="M14.1 4h3.8l.5 2.8 2.6-.8 1.9 3.3-2.1 1.8.7 2.5-2.7.7v2.4l2.7.7-.7 2.5 2.1 1.8-1.9 3.3-2.6-.8-.5 2.8h-3.8l-.5-2.8-2.6.8-1.9-3.3 2.1-1.8-.7-2.5 2.7-.7v-2.4l-2.7-.7.7-2.5-2.1-1.8 1.9-3.3 2.6.8zm1.9 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/>`,
  ),

  // Platform silhouettes / monograms — original, not official logos
  nes: svg(
    `<rect x="4" y="11" width="24" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="10" cy="17" r="2.2" fill="currentColor"/>
     <path fill="currentColor" d="M16 14.5h8v2h-8zm0 3.5h5v2h-5z"/>`,
  ),
  snes: svg(
    `<rect x="3.5" y="12" width="25" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="10" cy="17" r="2" fill="currentColor"/>
     <circle cx="22" cy="15.5" r="1.4" fill="currentColor"/>
     <circle cx="24.2" cy="18" r="1.4" fill="currentColor"/>`,
  ),
  gb: svg(
    `<rect x="8" y="3.5" width="16" height="25" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="10.5" y="6.5" width="11" height="9" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="16" cy="22" r="2.4" fill="currentColor"/>`,
  ),
  gba: svg(
    `<rect x="2.5" y="10" width="27" height="12" rx="6" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="10" y="12.5" width="12" height="7" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="6.5" cy="16" r="1.6" fill="currentColor"/>
     <circle cx="25.5" cy="16" r="1.6" fill="currentColor"/>`,
  ),
  nds: svg(
    `<rect x="7" y="3" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <rect x="7" y="17" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <rect x="9" y="5" width="14" height="8" fill="currentColor" opacity=".3"/>
     <rect x="9" y="19" width="14" height="8" fill="currentColor" opacity=".3"/>`,
  ),
  '3ds': svg(
    `<rect x="5" y="4" width="22" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <rect x="5" y="17" width="22" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <rect x="7.5" y="6" width="17" height="7" fill="currentColor" opacity=".28"/>
     <rect x="7.5" y="19" width="17" height="7" fill="currentColor" opacity=".28"/>
     <circle cx="23" cy="22.5" r="1.2" fill="currentColor"/>`,
  ),
  vb: svg(
    `<path fill="none" stroke="currentColor" stroke-width="2" d="M6 10h20v10H6z"/>
     <rect x="8.5" y="12" width="6.5" height="6" rx="1" fill="currentColor" opacity=".4"/>
     <rect x="17" y="12" width="6.5" height="6" rx="1" fill="currentColor" opacity=".4"/>
     <path fill="currentColor" d="M12 22h8v2h-8z"/>`,
  ),
  n64: svg(
    `<path fill="none" stroke="currentColor" stroke-width="2" d="M8 14h16v8H8z"/>
     <path fill="currentColor" d="M14 6h4v8h-4zM10 8h3v3h-3zm9 0h3v3h-3z"/>
     <circle cx="11" cy="22" r="1.5" fill="currentColor"/>
     <circle cx="21" cy="22" r="1.5" fill="currentColor"/>`,
  ),
  psx: svg(
    `<rect x="6" y="11" width="20" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="11" cy="17" r="2" fill="currentColor"/>
     <path fill="currentColor" d="M18.5 14.5h5v1.6h-5zm1.2 3h3.8v1.6h-3.8z"/>`,
  ),
  psp: svg(
    `<rect x="2" y="10" width="28" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="9" y="12.5" width="14" height="7" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="5.5" cy="16" r="1.5" fill="currentColor"/>
     <path fill="currentColor" d="M24 14h3v1.4h-3zm0 2.6h3v1.4h-3z"/>`,
  ),
  segaMD: svg(
    `<rect x="4" y="12" width="24" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M7 15h5v4H7zm13-.5 4 2.5-4 2.5z"/>`,
  ),
  segaMS: svg(
    `<rect x="5" y="11" width="22" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="11" cy="16.5" r="2" fill="currentColor"/>
     <path fill="currentColor" d="M17 14h7v2h-7zm0 3.5h5v2h-5z"/>`,
  ),
  segaGG: svg(
    `<rect x="6" y="6" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="9" y="9" width="14" height="9" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="13" cy="23" r="1.5" fill="currentColor"/>
     <circle cx="19" cy="23" r="1.5" fill="currentColor"/>`,
  ),
  segaCD: svg(
    `<rect x="4" y="11" width="24" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="16" cy="17" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
     <circle cx="16" cy="17" r="1.4" fill="currentColor"/>`,
  ),
  sega32x: svg(
    `<rect x="5" y="8" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M9 12h5v2H9zm0 4h8v2H9zm9-5.5 5 3.5-5 3.5z"/>`,
  ),
  segaSaturn: svg(
    `<rect x="4" y="10" width="24" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="11" cy="16.5" r="2.2" fill="currentColor"/>
     <path fill="currentColor" d="M17 13.5h7v2h-7zm1.5 3.5h5v2h-5z"/>`,
  ),
  arcade: svg(
    `<path fill="none" stroke="currentColor" stroke-width="2" d="M8 4h16l2 8H6z"/>
     <rect x="9" y="12" width="14" height="10" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M11 24h10v4H11z"/>
     <circle cx="16" cy="17" r="2" fill="currentColor"/>`,
  ),
  mame: svg(
    `<path fill="none" stroke="currentColor" stroke-width="2" d="M8 4h16l2 8H6z"/>
     <rect x="9" y="12" width="14" height="10" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M11 24h10v4H11z"/>
     <circle cx="16" cy="17" r="2" fill="currentColor"/>`,
  ),
  atari2600: svg(
    `<rect x="5" y="10" width="22" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M8 13h6v2H8zm0 4h4v2H8z"/>
     <circle cx="22" cy="16.5" r="2.2" fill="currentColor"/>`,
  ),
  atari7800: svg(
    `<rect x="4" y="11" width="24" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="10" cy="16.5" r="2" fill="currentColor"/>
     <path fill="currentColor" d="M16 14h8v2h-8zm0 3.5h6v2h-6z"/>`,
  ),
  atari5200: svg(
    `<rect x="6" y="7" width="20" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="16" cy="14" r="3.2" fill="currentColor" opacity=".4"/>
     <circle cx="16" cy="14" r="1.4" fill="currentColor"/>
     <path fill="currentColor" d="M11 22h10v2H11z"/>`,
  ),
  lynx: svg(
    `<rect x="2.5" y="9" width="27" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="8" y="11.5" width="12" height="9" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="24.5" cy="16" r="2" fill="currentColor"/>`,
  ),
  jaguar: svg(
    `<rect x="4" y="11" width="24" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M8 14h5v5H8zm12 0 5 2.5-5 2.5z"/>`,
  ),
  '3do': svg(
    `<rect x="5" y="10" width="22" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="12" cy="16.5" r="2.4" fill="currentColor"/>
     <path fill="currentColor" d="M17.5 14h6v1.8h-6zm0 3.2h4.5v1.8H17.5z"/>`,
  ),
  pce: svg(
    `<rect x="4" y="12" width="24" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="10" cy="17" r="2" fill="currentColor"/>
     <circle cx="22" cy="17" r="2" fill="currentColor"/>
     <path fill="currentColor" d="M14 15h4v4h-4z"/>`,
  ),
  pcfx: svg(
    `<rect x="5" y="9" width="22" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M9 12h6v2H9zm0 4h10v2H9z"/>
     <circle cx="23" cy="16" r="1.6" fill="currentColor"/>`,
  ),
  ngp: svg(
    `<rect x="9" y="3.5" width="14" height="25" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="11" y="6" width="10" height="9" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="16" cy="21" r="2" fill="currentColor"/>
     <path fill="currentColor" d="M12 25h8v1.6h-8z"/>`,
  ),
  ws: svg(
    `<rect x="3" y="9" width="26" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="7" y="11.5" width="13" height="9" rx="1" fill="currentColor" opacity=".35"/>
     <circle cx="24" cy="16" r="2" fill="currentColor"/>`,
  ),
  coleco: svg(
    `<rect x="5" y="8" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="16" cy="14" r="3" fill="currentColor" opacity=".4"/>
     <path fill="currentColor" d="M10 20h12v2H10z"/>`,
  ),
  c64: svg(
    `<rect x="4" y="8" width="24" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="7" y="11" width="18" height="5" fill="currentColor" opacity=".3"/>
     <path fill="currentColor" d="M8 19h3v2H8zm5 0h3v2h-3zm5 0h3v2h-3z"/>`,
  ),
  c128: svg(
    `<rect x="3.5" y="9" width="25" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="6" y="11.5" width="20" height="4" fill="currentColor" opacity=".3"/>
     <path fill="currentColor" d="M7 19h4v1.8H7zm6 0h4v1.8h-4zm6 0h4v1.8h-4z"/>`,
  ),
  vic20: svg(
    `<rect x="4" y="9" width="24" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="7" y="12" width="12" height="4" fill="currentColor" opacity=".35"/>
     <path fill="currentColor" d="M21 12h3v8h-3z"/>`,
  ),
  plus4: svg(
    `<rect x="4" y="8" width="24" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M8 12h16v2H8zm0 4h10v2H8z"/>`,
  ),
  pet: svg(
    `<rect x="6" y="5" width="20" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="8.5" y="7.5" width="15" height="9" fill="currentColor" opacity=".28"/>
     <path fill="currentColor" d="M5 21h22v3H5z"/>`,
  ),
  amiga: svg(
    `<rect x="4" y="7" width="24" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>
     <rect x="7" y="10" width="18" height="6" fill="currentColor" opacity=".3"/>
     <path fill="currentColor" d="M8 24h16v2H8zM10 20h2v2h-2zm4 0h2v2h-2zm4 0h2v2h-2z"/>`,
  ),
  dos: svg(
    `<rect x="5" y="6" width="22" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
     <path fill="currentColor" d="M8 10h12v1.6H8zm0 3.5h8v1.6H8zm0 3.5h10v1.6H8z"/>
     <path fill="currentColor" d="M8 24h16v2H8z"/>`,
  ),
  intv: svg(
    `<rect x="4" y="10" width="24" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
     <circle cx="10" cy="16.5" r="2.4" fill="currentColor"/>
     <rect x="16" y="13.5" width="8" height="6" rx="1" fill="currentColor" opacity=".4"/>`,
  ),
}

/** Fallback monogram for platforms without a dedicated mark. */
function monogram(short: string): string {
  const label = short
    .slice(0, 4)
    .toUpperCase()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  return `<span class="ro-xmb__cat-text">${label}</span>`
}

export function xmbCategoryIcon(kind: string, shortFallback = ''): string {
  return ICONS[kind] ?? monogram(shortFallback || kind)
}

export function xmbPlatformIcon(platformId: string, shortName: string): string {
  if (ICONS[platformId]) return ICONS[platformId]
  if (platformId.startsWith('sega')) return ICONS.segaMD
  if (platformId.startsWith('atari')) return ICONS.atari2600
  return monogram(shortName)
}
