import { hasUnsavedChanges } from './unsavedChanges'

type UpdateState = 'idle' | 'waiting' | 'applying' | 'reload' | 'retry'

let registration: ServiceWorkerRegistration | undefined
let state: UpdateState = 'idle'
let activationTimeout: number | undefined
const listeners = new Set<() => void>()

function publish(next: UpdateState) {
  if (next === state) return
  state = next
  listeners.forEach((listener) => listener())
}

export function readPwaUpdate() {
  return state
}

export function subscribeToPwaUpdate(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function applyPwaUpdate(): 'draft' | 'started' {
  if (hasUnsavedChanges()) return 'draft'

  if (state === 'reload') {
    window.location.reload()
  } else if (registration?.waiting) {
    try {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      publish('applying')
      activationTimeout = window.setTimeout(() => publish('retry'), 15_000)
    } catch {
      publish('retry')
    }
  } else {
    void registration?.update().catch(() => undefined)
    publish('retry')
  }
  return 'started'
}

export function registerPwa() {
  if (!import.meta.env.PROD || !navigator.serviceWorker) return
  const serviceWorkers = navigator.serviceWorker
  let controller = serviceWorkers.controller

  serviceWorkers.addEventListener('controllerchange', () => {
    const previous = controller
    controller = serviceWorkers.controller
    if (!controller || controller === previous || (!previous && state === 'idle')) return
    window.clearTimeout(activationTimeout)

    // Only this tab's explicit request authorizes a reload, and only while its forms are clean.
    if (state === 'applying' && !hasUnsavedChanges()) window.location.reload()
    else publish('reload')
  })

  function detectWaiting() {
    if (registration?.waiting && serviceWorkers.controller && state !== 'applying') publish('waiting')
  }

  function checkForUpdate() {
    detectWaiting()
    if (navigator.onLine && document.visibilityState === 'visible' && !registration?.waiting && !registration?.installing) {
      void registration?.update().catch(() => undefined)
    }
  }

  const scope = import.meta.env.BASE_URL
  void serviceWorkers.register(`${scope}sw.js`, { scope, updateViaCache: 'none' }).then((workerRegistration) => {
    registration = workerRegistration
    const watchInstallingWorker = () => {
      registration?.installing?.addEventListener('statechange', detectWaiting)
    }
    registration.addEventListener('updatefound', watchInstallingWorker)
    watchInstallingWorker()
    detectWaiting()
    window.addEventListener('online', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', checkForUpdate)
    window.setInterval(checkForUpdate, 30 * 60_000)
  }).catch((error: unknown) => {
    console.warn('Не удалось подключить офлайн-режим.', error)
  })
}
