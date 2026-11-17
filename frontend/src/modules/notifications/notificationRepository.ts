import { parseDate } from '../../shared/lib/calendar'
import { cycles } from '../biorhythms/model'
import { isTime } from '../tasks/timeIntervals'
import type { Notice } from './model'

const storageKey = 'ideal-day.notifications.v1'
const empty: readonly Notice[] = []
let cachedRaw: string | null = null
let snapshot = empty
const listeners = new Set<() => void>()

function isNotice(value: unknown): value is Notice {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Notice>
  if (typeof item.id !== 'string' || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)
    || typeof item.read !== 'boolean') return false
  if (item.kind === 'task') {
    return typeof item.taskId === 'string' && typeof item.title === 'string' && isTime(item.startTime)
      && typeof item.onTime === 'boolean'
  }
  return item.kind === 'cycle' && typeof item.date === 'string' && parseDate(item.date) !== null
    && cycles.some((cycle) => cycle.id === item.cycle)
}

function read() {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw !== cachedRaw) {
      const parsed: unknown = raw === null ? empty : JSON.parse(raw)
      if (!Array.isArray(parsed) || !parsed.every(isNotice)) throw new Error('Invalid notification history')
      snapshot = parsed
      cachedRaw = raw
    }
  } catch {
    // Keep the last valid snapshot until local storage becomes available again.
  }
  return snapshot
}

function write(items: readonly Notice[]) {
  const raw = JSON.stringify(items)
  window.localStorage.setItem(storageKey, raw)
  cachedRaw = raw
  snapshot = items
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === storageKey) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export async function withNotificationLock(action: () => void) {
  if (navigator.locks?.request) await navigator.locks.request(storageKey, action)
  else action()
}

export const notificationRepository = {
  read,
  subscribe,
  // The scheduler rechecks history and appends within withNotificationLock.
  append(items: readonly Notice[]) {
    if (items.length) write([...items, ...read()])
  },
  markAllRead() {
    return withNotificationLock(() => {
      const items = read()
      if (items.some((item) => !item.read)) write(items.map((item) => item.read ? item : { ...item, read: true }))
    })
  },
}
