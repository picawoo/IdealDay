const keyPrefix = 'ideal-day.task-activity.v1:'
const listeners = new Set<() => void>()
let revision = 0

function notify() {
  revision++
  listeners.forEach((listener) => listener())
}

function handleStorage(event: StorageEvent) {
  if (event.key === null || event.key.startsWith(keyPrefix)) notify()
}

export const taskActivity = {
  finishedAt(id: string) {
    try {
      const value = window.localStorage.getItem(keyPrefix + 'finished:' + id)
      return value !== null && Number.isFinite(Number(value)) ? Number(value) : undefined
    } catch { return undefined }
  },
  lastChanged(id: string): number | undefined {
    try {
      const raw = window.localStorage.getItem(keyPrefix + id)
      const timestamp = raw === null ? NaN : Number(raw)
      return Number.isFinite(timestamp) ? timestamp : undefined
    } catch {
      return undefined
    }
  },
  record(id: string, finished = false) {
    try {
      window.localStorage.setItem(keyPrefix + id, String(Date.now()))
      if (finished) window.localStorage.setItem(keyPrefix + 'finished:' + id, String(Date.now()))
    } catch {
      // The task is already saved. The center can sort using the notice date.
      return
    }
    notify()
  },
  revision: () => revision,
  subscribe(listener: () => void) {
    if (!listeners.size) window.addEventListener('storage', handleStorage)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) window.removeEventListener('storage', handleStorage)
    }
  },
}
