import { createLocalRecordStore } from '../../shared/lib/localRecordStore.ts'
import { withStorageLock } from '../../shared/lib/storageLock.ts'
import { parseDate } from '../../shared/lib/calendar.ts'
import { cycles } from '../biorhythms/model.ts'
import { isTime } from '../tasks/timeIntervals.ts'
import type { Notice } from './model.ts'

const storageKey = 'ideal-day.notifications.v1'
const expiredKey = 'ideal-day.notifications.expired.v1'

function isNotice(value: unknown): value is Notice {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Notice>
  if (typeof item.id !== 'string' || typeof item.createdAt !== 'number' || !(Math.abs(item.createdAt) <= 8.64e15)
    || typeof item.read !== 'boolean') return false
  if (item.kind === 'task') {
    return typeof item.taskId === 'string' && typeof item.title === 'string' && isTime(item.startTime)
      && typeof item.onTime === 'boolean'
  }
  return item.kind === 'cycle' && typeof item.date === 'string' && parseDate(item.date) !== null
    && cycles.some((cycle) => cycle.id === item.cycle)
    && (item.dayCycles === undefined || Array.isArray(item.dayCycles) && item.dayCycles.length >= 1 && item.dayCycles.length <= 3
      && new Set(item.dayCycles).size === item.dayCycles.length && item.dayCycles.every(id => cycles.some(cycle => cycle.id === id)))
}

const store = createLocalRecordStore(storageKey, isNotice)

function expiredIds(): Set<string> {
  const raw = window.localStorage.getItem(expiredKey)
  if (raw === null) return new Set()
  const ids: unknown = JSON.parse(raw)
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid expired notifications')
  return new Set(ids as string[])
}

export const notificationRepository = {
  read: store.read,
  subscribe: store.subscribe,
  readIssue: store.readIssue,
  append(items: readonly Notice[]) {
    return withStorageLock(storageKey, () => {
      let added: Notice[] = []
      if (items.length) store.commit((current) => {
        const seen = expiredIds()
        current.forEach(({ id }) => seen.add(id))
        added = items.filter(({ id }) => {
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
        return added.length ? [...added, ...current] : current
      })
      return added
    })
  },
  prune(isExpired: (item: Notice) => boolean) {
    return withStorageLock(storageKey, () => {
      if (store.readIssue()) return
      store.commit(items => {
        const removed = items.filter(isExpired)
        if (!removed.length) return items
        const ids = expiredIds()
        removed.forEach(({ id }) => ids.add(id))
        window.localStorage.setItem(expiredKey, JSON.stringify([...ids]))
        const removing = new Set(removed)
        return items.filter(item => !removing.has(item))
      }, false)
    })
  },
  markAllRead() {
    return withStorageLock(storageKey, () => {
      store.commit((items) => items.some((item) => !item.read)
        ? items.map((item) => item.read ? item : { ...item, read: true }) : items)
    })
  },
}
