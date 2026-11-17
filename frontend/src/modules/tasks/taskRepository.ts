import { isBreak, isScheduleEntry, taskStatuses } from './model'
import type { ScheduleBreak, ScheduleEntry, TaskDraft } from './model'
import { taskActivity } from './taskActivity'
import { intersects, toInterval } from './timeIntervals'

const storageKey = 'ideal-day.tasks.v1'
const listeners = new Set<() => void>()
const empty: readonly ScheduleEntry[] = []
let rawSnapshot: string | null = null
let snapshot: readonly ScheduleEntry[] = empty

function parseTasks(raw: string | null): readonly ScheduleEntry[] {
  if (raw === null) return empty
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data) || !data.every(isScheduleEntry)) throw new Error('Invalid task storage')
  return data
}

function read(): readonly ScheduleEntry[] {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw !== rawSnapshot) {
      snapshot = parseTasks(raw)
      rawSnapshot = raw
    }
    return snapshot
  } catch {
    return snapshot
  }
}

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function commit(change: (entries: readonly ScheduleEntry[]) => readonly ScheduleEntry[], taskId?: string) {
  const current = parseTasks(window.localStorage.getItem(storageKey))
  const next = change(current)
  if (!next.every(isScheduleEntry)) throw new Error('Invalid task data')
  const raw = JSON.stringify(next)
  window.localStorage.setItem(storageKey, raw)
  rawSnapshot = raw
  snapshot = next
  if (taskId !== undefined) {
    const previous = current.find((entry) => entry.id === taskId)
    const updated = next.find((entry) => entry.id === taskId)
    if ((!updated && previous && !isBreak(previous))
      || (updated && !isBreak(updated) && updated.status === 'completed' && updated !== previous)) {
      taskActivity.record(taskId)
    }
  }
  notify()
}

export class ScheduleConflictError extends Error {
  constructor(conflicts: readonly ScheduleEntry[]) {
    const labels = conflicts.map((entry) => isBreak(entry)
      ? 'перерыв ' + entry.startTime
      : '«' + entry.title + '» (' + taskStatuses[entry.status].toLowerCase() + ')')
    super('Пересечение: ' + labels.join(', ') + '. Выберите другое время.')
    this.name = 'ScheduleConflictError'
  }
}

function ensureFree(entry: ScheduleEntry, entries: readonly ScheduleEntry[]) {
  if (!isScheduleEntry(entry)) throw new Error('Invalid interval')
  const proposed = toInterval(entry)
  if (!proposed) return
  const conflicts = entries.filter((other) => {
    if (other.id === entry.id) return false
    const interval = toInterval(other)
    return interval !== null && intersects(proposed, interval)
  })
  if (conflicts.length) throw new ScheduleConflictError(conflicts)
}

export const taskRepository = {
  read,
  readSaved: () => parseTasks(window.localStorage.getItem(storageKey)),
  subscribe,
  create(draft: TaskDraft) {
    const task = { ...draft, id: crypto.randomUUID() }
    commit((tasks) => [...tasks, task], task.id)
    return task
  },
  update(id: string, patch: Partial<TaskDraft>) {
    commit((entries) => {
      const task = entries.find((entry) => entry.id === id)
      if (!task || isBreak(task)) throw new Error('Task is missing')
      const updated = { ...task, ...patch }
      if ((Object.keys(patch) as Array<keyof TaskDraft>).every((field) => task[field] === updated[field])) return entries
      if (updated.date !== task.date || updated.startTime !== task.startTime || updated.duration !== task.duration) {
        ensureFree(updated, entries)
      }
      return entries.map((entry) => entry.id === id ? updated : entry)
    }, id)
  },
  createBreak(draft: Pick<ScheduleBreak, 'date' | 'startTime' | 'duration'>) {
    const entry: ScheduleBreak = { ...draft, id: crypto.randomUUID(), kind: 'break' }
    commit((entries) => {
      ensureFree(entry, entries)
      return [...entries, entry]
    })
  },
  remove(id: string) {
    commit((tasks) => tasks.filter((task) => task.id !== id), id)
  },
}
