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

function bindDisplayModeListener(query: string): void {
  try {
    window.matchMedia(query).addEventListener('change', () => {
      applyPwaDisplayMode()
      emit()
    })
  } catch {
    /* older Safari */
  }
}

export function initPwaInstall(): void {
  applyPwaDisplayMode()

  bindDisplayModeListener('(display-mode: standalone)')
  bindDisplayModeListener('(display-mode: fullscreen)')
  bindDisplayModeListener('(display-mode: minimal-ui)')

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
  await event.prompt()
  const choice = await event.userChoice
  if (choice.outcome === 'accepted') {
    installed = true
    deferred = null
    applyPwaDisplayMode()
  }
  // Keep deferred on dismiss so the user can try Install again this session.
  emit()
  return choice.outcome
}

function showUpdateToast(): void {
  if (document.getElementById('ro-sw-toast')) return
  const toast = document.createElement('div')
  toast.id = 'ro-sw-toast'
  toast.className = 'ro-sw-toast'
  toast.setAttribute('role', 'status')
  toast.innerHTML = `
    <span>Update ready</span>
    <button type="button" class="ro-btn ro-btn--primary" id="ro-sw-reload">Refresh</button>
  `
  document.body.appendChild(toast)
  toast.querySelector('#ro-sw-reload')?.addEventListener('click', () => {
    const go = () => window.location.reload()
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.waiting?.postMessage('SKIP_WAITING')
        go()
      })
      return
    }
    go()
  })
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        // A waiting worker means a new build is ready.
        if (reg.waiting) showUpdateToast()
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast()
            }
          })
        })
      })
      .catch((err) => {
        console.warn('[RetroOasis] SW registration failed', err)
      })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      // Soft hint only — toast already offers Refresh.
      showUpdateToast()
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
