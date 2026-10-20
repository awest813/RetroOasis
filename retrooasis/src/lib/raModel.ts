/**
 * RetroAchievements account, cached progress, and the game-page card.
 * The web API key stays in localStorage on this device and is only sent to retroachievements.org.
 */

import { escapeHtml } from './dom'
import { hrefFor } from './router'

const ACCOUNT_KEY = 'retrooasis.ra.account'
const LINKS_KEY = 'retrooasis.ra.links'
const PROGRESS_KEY = 'retrooasis.ra.progress'

export interface RaAccount {
  username: string
  key: string
  points: number
  softcore: number
  rank: number | null
  totalRanked: number | null
  pic: string
}

export interface RaProfile {
  username: string
  points: number
  softcore: number
  rank: number | null
  totalRanked: number | null
  pic: string
}

export interface RaListedGame {
  id: number
  title: string
  icon: string
  points: number
  achievements: number
  hashes: string[]
}

export interface RaAchievement {
  id: number
  title: string
  description: string
  points: number
  badge: string
  order: number
  type: string
  earned: string | null
  hardcore: boolean
}

export interface RaProgress {
  id: number
  title: string
  consoleName: string
  icon: string
  points: number
  earned: number
  total: number
  hardcore: number
  earnedPoints: number
  award: string | null
  achievements: RaAchievement[]
}

export type RaCardState = 'signed-out' | 'checking' | 'unsupported' | 'unmatched' | 'missing' | 'ready' | 'error'

export interface RaCard {
  state: RaCardState
  message: string
  progress?: RaProgress
}

export interface RaLink {
  fileKey: string
  hash: string
  raId: number
  at: number
}

export interface RaProgressSnap {
  at: number
  earned: number
  total: number
  hardcore: number
  title: string
  award?: string | null
}

const MEDIA = 'https://media.retroachievements.org'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or a full quota — the session can still show what it loaded */
  }
}

export function getRaAccount(): RaAccount | null {
  const raw = readJson<Partial<RaAccount> | null>(ACCOUNT_KEY, null)
  if (!raw || typeof raw.username !== 'string' || typeof raw.key !== 'string' || !raw.username || !raw.key) return null
  return {
    username: raw.username,
    key: raw.key,
    points: Number(raw.points) || 0,
    softcore: Number(raw.softcore) || 0,
    rank: typeof raw.rank === 'number' ? raw.rank : null,
    totalRanked: typeof raw.totalRanked === 'number' ? raw.totalRanked : null,
    pic: typeof raw.pic === 'string' ? raw.pic : '',
  }
}

export function setRaAccount(account: RaAccount): void {
  writeJson(ACCOUNT_KEY, account)
}

export function clearRaAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    /* ignore */
  }
}

function links(): Record<string, RaLink> {
  const raw = readJson<Record<string, RaLink>>(LINKS_KEY, {})
  return raw && typeof raw === 'object' ? raw : {}
}

export function getRaLink(gameId: string): RaLink | null {
  const link = links()[gameId]
  if (!link || typeof link.hash !== 'string' || typeof link.fileKey !== 'string') return null
  return link
}

export function setRaLink(gameId: string, link: RaLink): void {
  const all = links()
  all[gameId] = link
  writeJson(LINKS_KEY, all)
}

let pendingAchievementsSettings = false

/** The game page asked Settings to open on the Achievements section. */
export function requestAchievementsSettings(): void {
  pendingAchievementsSettings = true
}

export function takeAchievementsSettingsRequest(): boolean {
  const pending = pendingAchievementsSettings
  pendingAchievementsSettings = false
  return pending
}

export function forgetRaGame(gameId: string): void {
  forgetRaGames([gameId])
}

export function forgetRaGames(gameIds: string[]): void {
  if (!gameIds.length) return
  const all = links()
  let changed = false
  for (const gameId of gameIds) {
    if (!all[gameId]) continue
    delete all[gameId]
    changed = true
  }
  if (changed) writeJson(LINKS_KEY, all)
}

function progressMap(): Record<string, RaProgressSnap> {
  const raw = readJson<Record<string, RaProgressSnap>>(PROGRESS_KEY, {})
  return raw && typeof raw === 'object' ? raw : {}
}

export function rememberProgress(progress: RaProgress): void {
  const all = progressMap()
  all[String(progress.id)] = {
    at: Date.now(),
    earned: progress.earned,
    total: progress.total,
    hardcore: progress.hardcore,
    title: progress.title,
    award: progress.award,
  }
  writeJson(PROGRESS_KEY, all)
}

export function progressSnap(raId: number): RaProgressSnap | null {
  const snap = progressMap()[String(raId)]
  if (!snap || typeof snap.total !== 'number') return null
  return snap
}

/** Short library caption: Mastered, Complete, or 12/40. Empty when this game hasn’t been matched. */
export function achievementBadge(gameId: string): string {
  if (!getRaAccount()) return ''
  const link = getRaLink(gameId)
  if (!link || link.raId <= 0) return ''
  const snap = progressSnap(link.raId)
  if (!snap || snap.total <= 0) return ''
  if (snap.hardcore >= snap.total) return 'Mastered'
  if (snap.earned >= snap.total) return 'Complete'
  if (snap.award === 'Beaten') return 'Beaten'
  return `${snap.earned}/${snap.total}`
}

export function achievementBadgeTitle(gameId: string): string {
  const badge = achievementBadge(gameId)
  if (!badge) return ''
  if (badge === 'Mastered') return 'Mastered on RetroAchievements'
  if (badge === 'Complete') return 'Completed on RetroAchievements'
  if (badge === 'Beaten') return 'Beaten on RetroAchievements'
  const [earned, total] = badge.split('/')
  return `${earned} of ${total} RetroAchievements`
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function field(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] != null) return obj[key]
  }
  return undefined
}

/** Only RetroAchievements media paths. Anything else is dropped so a response can’t set an image URL. */
export function raImageUrl(path: unknown): string {
  if (typeof path !== 'string' || !path) return ''
  if (path.startsWith('https://media.retroachievements.org/')) return path
  if (path.startsWith('/Images/') || path.startsWith('/UserPic/') || path.startsWith('/Badge/')) return `${MEDIA}${path}`
  return ''
}

export function raBadgeUrl(name: string, locked: boolean): string {
  const clean = name.replace(/[^A-Za-z0-9_-]/g, '')
  if (!clean) return ''
  return `${MEDIA}/Badge/${clean}${locked ? '_lock' : ''}.png`
}

export function formatRaDate(raw: string | null | undefined): string {
  if (!raw) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!match) return ''
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[Number(match[2]) - 1]
  if (!month) return ''
  return `${month} ${Number(match[3])}, ${match[1]}`
}

export function formatRaRank(profile: Pick<RaProfile, 'rank' | 'totalRanked' | 'points' | 'softcore'>): string {
  const points = `${profile.points.toLocaleString()} points`
  const rank = profile.rank != null
    ? `Rank ${profile.rank.toLocaleString()}${profile.totalRanked ? ` of ${profile.totalRanked.toLocaleString()}` : ''}`
    : ''
  const soft = profile.softcore > 0 ? `${profile.softcore.toLocaleString()} softcore` : ''
  return [rank, points, soft].filter(Boolean).join(' · ')
}

const AWARD_LABELS: Record<string, string> = {
  mastered: 'Mastered',
  completed: 'Completed',
  beaten: 'Beaten',
  'beaten-softcore': 'Beaten',
  'beaten-hardcore': 'Beaten',
}

export function parseProfile(body: unknown, expectedUser: string): RaProfile | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  const username = str(field(obj, 'User', 'user'))
  if (!username) return null
  if (expectedUser && username.toLowerCase() !== expectedUser.trim().toLowerCase()) return null
  return {
    username,
    points: num(field(obj, 'TotalPoints', 'totalPoints')),
    softcore: num(field(obj, 'TotalSoftcorePoints', 'totalSoftcorePoints')),
    rank: field(obj, 'Rank', 'rank') == null ? null : num(field(obj, 'Rank', 'rank')),
    totalRanked: field(obj, 'TotalRanked', 'totalRanked') == null ? null : num(field(obj, 'TotalRanked', 'totalRanked')),
    pic: raImageUrl(field(obj, 'UserPic', 'userPic')),
  }
}

export function parseGameList(body: unknown): RaListedGame[] {
  if (!Array.isArray(body)) return []
  const games: RaListedGame[] = []
  for (const entry of body) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const id = num(field(obj, 'ID', 'id'))
    if (id <= 0) continue
    const hashes = field(obj, 'Hashes', 'hashes')
    games.push({
      id,
      title: str(field(obj, 'Title', 'title')),
      icon: raImageUrl(field(obj, 'ImageIcon', 'imageIcon')),
      points: num(field(obj, 'Points', 'points')),
      achievements: num(field(obj, 'NumAchievements', 'numAchievements')),
      hashes: Array.isArray(hashes) ? hashes.filter((hash): hash is string => typeof hash === 'string' && /^[0-9a-f]{32}$/i.test(hash)).map((hash) => hash.toLowerCase()) : [],
    })
  }
  return games
}

export function parseProgress(body: unknown): RaProgress | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  const id = num(field(obj, 'ID', 'id'))
  const title = str(field(obj, 'Title', 'title'))
  if (id <= 0 || !title) return null
  const raw = field(obj, 'Achievements', 'achievements')
  const list: RaAchievement[] = []
  const entries = raw && typeof raw === 'object' ? Object.values(raw as Record<string, unknown>) : []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const ach = entry as Record<string, unknown>
    const achId = num(field(ach, 'ID', 'id'))
    if (achId <= 0) continue
    const earned = str(field(ach, 'DateEarned', 'dateEarned'))
    const hardcore = str(field(ach, 'DateEarnedHardcore', 'dateEarnedHardcore'))
    list.push({
      id: achId,
      title: str(field(ach, 'Title', 'title')) || 'Achievement',
      description: str(field(ach, 'Description', 'description')),
      points: num(field(ach, 'Points', 'points')),
      badge: str(field(ach, 'BadgeName', 'badgeName')),
      order: num(field(ach, 'DisplayOrder', 'displayOrder')),
      type: str(field(ach, 'type', 'Type')),
      earned: hardcore || earned || null,
      hardcore: Boolean(hardcore),
    })
  }
  list.sort((a, b) => a.order - b.order || a.id - b.id)
  const earnedPoints = list.reduce((sum, ach) => sum + (ach.earned ? ach.points : 0), 0)
  const awardRaw = str(field(obj, 'HighestAwardKind', 'highestAwardKind')).toLowerCase()
  const earnedField = field(obj, 'NumAwardedToUser', 'numAwardedToUser')
  const hardcoreField = field(obj, 'NumAwardedToUserHardcore', 'numAwardedToUserHardcore')
  return {
    id,
    title,
    consoleName: str(field(obj, 'ConsoleName', 'consoleName')),
    icon: raImageUrl(field(obj, 'ImageIcon', 'imageIcon')),
    points: num(field(obj, 'Points', 'points')) || list.reduce((sum, ach) => sum + ach.points, 0),
    earned: earnedField == null ? list.filter((ach) => ach.earned).length : num(earnedField),
    total: num(field(obj, 'NumAchievements', 'numAchievements')) || list.length,
    hardcore: hardcoreField == null ? list.filter((ach) => ach.hardcore).length : num(hardcoreField),
    earnedPoints,
    award: AWARD_LABELS[awardRaw] ?? null,
    achievements: list,
  }
}

export function raFailureMessage(status: number, body: unknown): string {
  if (status === 401) return 'RetroAchievements didn’t accept that web API key.'
  if (status === 404) return 'RetroAchievements couldn’t find that username.'
  if (status === 429) return 'RetroAchievements is busy. Wait a minute and try again.'
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    const message = str(obj.message || obj.Error || obj.error)
    if (/unauth/i.test(message)) return 'RetroAchievements didn’t accept that web API key.'
    if (/not found|unknown user/i.test(message)) return 'RetroAchievements couldn’t find that username.'
  }
  if (status >= 500) return 'RetroAchievements is unavailable. Try again in a little while.'
  return 'Couldn’t reach RetroAchievements. Check your connection and try again.'
}

function typeLabel(type: string): string {
  if (type === 'missable') return 'Missable'
  if (type === 'win_condition') return 'Win'
  return ''
}

/** 0 hides the list, 1 shows the first eight, 2 shows every achievement. */
export function achievementCardHtml(card: RaCard, listMode = 0): string {
  const state = card.state === 'ready' ? 'ready' : card.state === 'checking' ? 'checking' : 'off'
  const progress = card.progress
  const pill = progress
    ? progress.total > 0 && progress.hardcore >= progress.total
      ? 'Mastered'
      : progress.total > 0 && progress.earned >= progress.total
        ? progress.award || 'Complete'
        : `${progress.earned} of ${progress.total}`
    : card.state === 'signed-out'
      ? 'Connect'
      : card.state === 'checking'
        ? 'Checking'
        : card.state === 'unmatched'
          ? 'No set'
          : card.state === 'unsupported' || card.state === 'missing'
            ? 'Can’t match'
            : 'Couldn’t load'
  const total = progress?.achievements.length ?? 0
  const limit = listMode >= 2 ? total : listMode === 1 ? Math.min(8, total) : 0
  const moreLabel = listMode <= 0 && total > 0
    ? 'Show achievements'
    : listMode === 1 && total > limit
      ? `Show all ${total}`
      : ''
  const awardBit = progress?.award && pill !== progress.award && pill !== 'Mastered' && pill !== 'Complete' ? progress.award : ''
  const actions = [
    moreLabel ? `<button type="button" class="ro-btn" id="ro-ra-more" data-ro-focusable="true">${moreLabel}</button>` : '',
    card.state === 'signed-out' ? `<a class="ro-btn" id="ro-ra-settings" href="${hrefFor('/settings')}" data-ro-focusable="true">Connect in Settings</a>` : '',
    card.state === 'error' || card.state === 'unmatched' || card.state === 'missing' || card.state === 'ready'
      ? `<button type="button" class="ro-btn ro-btn--ghost" id="ro-ra-retry" data-ro-focusable="true">Check again</button>`
      : '',
    progress && listMode >= 1 ? `<a class="ro-btn ro-btn--ghost" href="https://retroachievements.org/game/${progress.id}" target="_blank" rel="noopener" data-ro-focusable="true">View on RetroAchievements</a>` : '',
  ].filter(Boolean).join('')
  const items = (progress?.achievements ?? []).slice(0, limit).map((ach) => {
    const locked = !ach.earned
    const src = raBadgeUrl(ach.badge, locked)
    const fallback = raBadgeUrl(ach.badge, false)
    const when = formatRaDate(ach.earned)
    const tag = typeLabel(ach.type)
    return `<li class="ro-ra-ach" data-earned="${locked ? 'false' : 'true'}">
      ${src ? `<img alt="" width="48" height="48" src="${escapeHtml(src)}"${fallback && locked ? ` data-fallback="${escapeHtml(fallback)}"` : ''} />` : '<span class="ro-ra-ach__blank" aria-hidden="true"></span>'}
      <div>
        <div class="ro-ra-ach__top">
          <strong>${escapeHtml(ach.title)}</strong>
          <span>${ach.points} ${ach.points === 1 ? 'pt' : 'pts'}</span>
        </div>
        ${ach.description ? `<p>${escapeHtml(ach.description)}</p>` : ''}
        <p class="ro-muted">${[when ? `Earned ${when}` : 'Locked', ach.hardcore ? 'Hardcore' : '', tag].filter(Boolean).map((part) => escapeHtml(part)).join(' · ')}</p>
      </div>
    </li>`
  }).join('')

  return `<section class="ro-online-card ro-ra-card" id="ro-ra-card" data-state="${state}" aria-labelledby="ro-ra-title">
    <div class="ro-online-card__head">
      <h2 class="ro-online-card__title" id="ro-ra-title">Achievements</h2>
      <span class="ro-online-card__state" id="ro-ra-state">${escapeHtml(pill)}</span>
    </div>
    <p class="ro-muted ro-online-card__text" id="ro-ra-detail">${escapeHtml(card.message)}</p>
    ${progress ? `<p class="ro-muted">${escapeHtml([progress.consoleName, `${progress.points.toLocaleString()} points`, progress.earnedPoints ? `${progress.earnedPoints.toLocaleString()} earned` : '', awardBit].filter(Boolean).join(' · '))}</p>` : ''}
    ${items ? `<ul class="ro-ra-list" tabindex="-1">${items}</ul>` : ''}
    ${actions ? `<div class="ro-btn-row ro-online-card__actions">${actions}</div>` : ''}
  </section>`
}
