import { escapeAttr, escapeHtml } from './dom'

const RESOURCES = [
  { name: 'The Cover Project', url: 'https://www.thecoverproject.net/' },
  { name: 'LaunchBox Games Database', url: 'https://gamesdb.launchbox-app.com/' },
  { name: 'MobyGames', url: 'https://www.mobygames.com/' },
  { name: 'GameTDB', url: 'https://www.gametdb.com/' },
  { name: 'Libretro thumbnails', url: 'https://github.com/libretro-thumbnails/libretro-thumbnails' },
] as const

/** Shared browsing links for manually selected artwork. */
export function coverResourceLinks(): string {
  return `<ul class="ro-cover-resources" aria-label="Cover art resources">${RESOURCES.map(({ name, url }, index) => `<li><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-ro-focusable="true" data-focus-id="cover-resource-${index}" aria-label="${escapeAttr(name)} (opens in a new tab)">${escapeHtml(name)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`
}
