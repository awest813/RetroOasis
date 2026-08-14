import {
  coreForPlatform,
  coreFromExtension,
  platformFromFolder,
  slugId,
  titleFromFilename,
} from './cores'
import type { Game } from './catalog'

export interface HostedManifest {
  games?: Array<{
    id?: string
    title?: string
    platform?: string
    core?: string
    file: string
    cover?: string | null
    bios?: string | null
    tags?: string[]
    description?: string
    year?: string | number
    developer?: string
  }>
}

function platformFromFilePath(file: string): string | null {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean)
  // roms/<platform>/file or <platform>/file
  const idx = parts.findIndex((p) => p.toLowerCase() === 'roms')
  if (idx >= 0 && parts[idx + 1]) {
    return platformFromFolder(parts[idx + 1])
  }
  if (parts.length >= 2) {
    return platformFromFolder(parts[0])
  }
  return null
}

export function normalizeHostedGames(manifest: HostedManifest): Game[] {
  const games: Game[] = []
  for (const entry of manifest.games ?? []) {
    if (!entry.file) continue
    const filename = entry.file.split('/').pop() || entry.file
    const platform =
      entry.platform ||
      platformFromFilePath(entry.file) ||
      'nes'
    const core =
      entry.core ||
      coreFromExtension(filename, platform) ||
      coreForPlatform(platform)
    const id = entry.id || slugId(platform, filename).replace(/^local-/, 'hosted-')

    games.push({
      id,
      title: entry.title || titleFromFilename(filename),
      platform,
      core,
      file: entry.file,
      cover: entry.cover ?? null,
      bios: entry.bios ?? null,
      description: entry.description,
      year: entry.year,
      developer: entry.developer,
      tags: entry.tags ?? ['hosted'],
      source: 'hosted',
    })
  }
  return games.sort((a, b) => a.title.localeCompare(b.title))
}

/** Optional static library for any host (Safari, Firefox, CDN). */
export async function loadHostedManifest(): Promise<Game[]> {
  try {
    const res = await fetch('./roms/manifest.json', { cache: 'no-cache' })
    if (!res.ok) return []
    const data = (await res.json()) as HostedManifest
    return normalizeHostedGames(data)
  } catch {
    return []
  }
}
