type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type PwaInstallState = 'installed' | 'prompt' | 'ios' | 'unavailable'

type Listener = () => void

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) listener()
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** True when running as an installed PWA (standalone / fullscreen / iOS home screen). */
export function isStandaloneDisplay(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

/** Mark the document for standalone chrome (safe areas, hide install CTAs). */
export function applyPwaDisplayMode(): void {
  const standalone = isStandaloneDisplay()
  document.documentElement.dataset.display = standalone ? 'standalone' : 'browser'
  if (standalone) installed = true
}

export function initPwaInstall(): void {
  applyPwaDisplayMode()

  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    applyPwaDisplayMode()
    emit()
  })

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit()
  })

  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    applyPwaDisplayMode()
    emit()
  })
}

export function onPwaInstallChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canInstallPwa(): boolean {
  return !!deferred && !installed && !isStandaloneDisplay()
}

export function isPwaInstalled(): boolean {
  return installed || isStandaloneDisplay()
}

export function getPwaInstallState(): PwaInstallState {
  if (isPwaInstalled()) return 'installed'
  if (deferred) return 'prompt'
  if (isIosDevice()) return 'ios'
  return 'unavailable'
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const event = deferred
  deferred = null
  await event.prompt()
  const choice = await event.userChoice
  if (choice.outcome === 'accepted') {
    installed = true
    applyPwaDisplayMode()
  }
  emit()
  return choice.outcome
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[RetroOasis] SW registration failed', err)
    })
  })
}

/** Keep browser chrome theme-color in sync with the current accent. */
export function syncThemeColor(accent: 'sega' | 'ps'): void {
  const color = accent === 'ps' ? '#0c1218' : '#071018'
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = color
}
