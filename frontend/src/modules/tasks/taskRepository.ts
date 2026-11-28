import { legacyKey, taskStorage as store, LegacyWriteError } from './taskStorage.ts'
import { addDays, parseDate } from '../../shared/lib/calendar.ts'
import { changeOccurrence, changePeriods, isSeries, isSeriesDraft, lookup, project, seriesConflict } from './recurrence.ts'
import type { Scope, SeriesDraft, TaskRecord, TaskSeries } from './recurrence.ts'
import { withStorageLock, StorageLockUnavailableError } from '../../shared/lib/storageLock.ts'
import { isBreak, isScheduleEntry, taskStatuses } from './model.ts'
import type { ScheduleBreak, ScheduleEntry, Task, TaskDraft } from './model.ts'
import { taskActivity } from './taskActivity.ts'
import { preferencesRepository, preferencesStorageLock } from '../settings/preferencesRepository.ts'
import { dateAndTime } from '../schedule/dayPlan.ts'
import { instantForLocalTime } from '../notifications/zonedTime.ts'
import { dayOffset, intersects, toInterval } from './timeIntervals.ts'

export const tasksStorageLock = legacyKey

function commit(change: (entries: readonly TaskRecord[]) => readonly TaskRecord[], taskId?: string) {
  let previous: ScheduleEntry | undefined
  let updated: ScheduleEntry | undefined
  store.commit(entries => {
    const next = change(entries)
    if (taskId) { previous = lookup(entries, taskId); updated = lookup(next, taskId) }
    return next
  })
  if (taskId && previous && !isBreak(previous)
    && (!updated || !isBreak(updated) && updated.status === 'completed' && previous.status !== 'completed')) taskActivity.record(taskId, true)
}

class SeriesConflictError extends Error {
  constructor(title: string, minute: number) {
    const date = new Date(minute * 60_000).toISOString().slice(0, 10)
    super('Пересечение ' + date + ' с «' + title + '». Измените время или правило повторения.')
  }
}
function ensureSeriesFree(entry: TaskRecord, records: readonly TaskRecord[]) {
  const hit = seriesConflict(entry, records)
  if (hit) throw new SeriesConflictError(hit.title, hit.minute)
}

function updateRecord(records: readonly TaskRecord[], task: Task, updated: Task) {
  if (!task.recurrence) return records.map(entry => entry.id === task.id ? updated : entry)
  const patch = Object.fromEntries(Object.keys(updated).filter(key => key !== 'recurrence' && key !== 'id'
    && updated[key as keyof Task] !== task[key as keyof Task]).map(key => [key, updated[key as keyof Task]]))
  if (Object.hasOwn(patch, 'plannerReasons') && patch.plannerReasons === undefined) patch.plannerReasons = []
  if (patch.startTime === '') patch.startTime = null
  return records.map(entry => isSeries(entry) && entry.id === task.recurrence?.seriesId ? changeOccurrence(entry, task, patch) : entry)
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

class MissingTaskError extends Error {
  constructor() { super('Задача уже удалена в другой вкладке. Черновик остаётся в форме.') }
}

export function taskWriteError(error: unknown, fallback: string) {
  return error instanceof LegacyWriteError || error instanceof StalePlanError || error instanceof SeriesConflictError || error instanceof ScheduleConflictError || error instanceof MissingTaskError || error instanceof StorageLockUnavailableError ? error.message : fallback
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

export class StalePlanError extends Error {
  constructor() { super('Расписание или настройки изменились. Пересчитайте план перед применением.') }
}

interface PlanUpdate {
  existingId?: string
  draft: TaskDraft
}

interface PlanBatch {
  snapshot: readonly TaskRecord[]
  preferences: string
  updates: readonly PlanUpdate[]
  breaks: readonly Omit<ScheduleBreak, 'id' | 'kind'>[]
  timeZone: string
  date: string
  window: { start: number; end: number }
}

export const taskRepository = {
  applyPlan(batch: PlanBatch) {
    return withStorageLock(preferencesStorageLock, () => withStorageLock(tasksStorageLock, () => {
      if (JSON.stringify(preferencesRepository.readSaved()) !== batch.preferences) throw new StalePlanError()
      const issue = store.readIssue()
      if (issue === 'legacy') throw new LegacyWriteError()
      if (issue === 'partial' || issue === 'invalid' || issue === 'unavailable') {
        throw new Error('Unsafe task storage')
      }
      store.commit(entries => {
        if (JSON.stringify(entries) !== JSON.stringify(batch.snapshot)) throw new StalePlanError()
        const now = Date.now()
        const changed = new Map<string, ScheduleEntry>()
        const additions: ScheduleEntry[] = batch.breaks.map(rest => ({ ...rest, id: crypto.randomUUID(), kind: 'break' }))
        for (const { existingId, draft } of batch.updates) {
          if (!existingId) {
            additions.push({ ...draft, id: crypto.randomUUID() })
            continue
          }
          const current = lookup(entries, existingId)
          if (!current || isBreak(current) || current.pinned || current.status !== 'planned' || changed.has(existingId)
            || current.startTime && (instantForLocalTime(current.date, current.startTime, batch.timeZone) ?? -Infinity) <= now
            || draft.date !== current.date || draft.duration !== current.duration) throw new StalePlanError()
          changed.set(existingId, { ...current, startTime: draft.startTime, pinned: draft.pinned, plannerReasons: draft.plannerReasons })
        }
        let next: readonly TaskRecord[] = entries
        for (const [id, entry] of changed) {
          const old = lookup(next, id)
          if (!old || isBreak(old) || isBreak(entry)) throw new StalePlanError()
          next = updateRecord(next, old, entry)
        }
        next = [...next, ...additions]
        const view = project(next, batch.date, addDays(batch.date, 1))
        const offset = dayOffset(batch.date)
        for (const entry of [...changed.values(), ...additions]) {
          const interval = toInterval(entry)
          if (!interval || interval.start < offset + batch.window.start || interval.end > offset + batch.window.end) throw new StalePlanError()
          const end = dateAndTime(batch.date, interval.end - offset)
          const startInstant = instantForLocalTime(entry.date, entry.startTime, batch.timeZone)
          const endInstant = instantForLocalTime(end.date, end.time, batch.timeZone)
          if (startInstant === null || startInstant <= now || endInstant === null || endInstant - startInstant !== (interval.end - interval.start) * 60_000) throw new StalePlanError()
          ensureFree(entry, view)
          const record = next.find(item => item.id === ('recurrence' in entry ? entry.recurrence?.seriesId : entry.id))
          if (record) ensureSeriesFree(record, next)
        }
        return changed.size || additions.length ? next : entries
      })
    }))
  },
  read: store.read,
  lookup(id: string) { return lookup(store.read(), id) },
  query(from: string, through: string) { return project(store.read(), from, through) },
  backup: store.legacyBackup,
  deferLegacy() { return withStorageLock(tasksStorageLock, store.deferLegacy) },
  recoverLegacy() { return withStorageLock(tasksStorageLock, () => store.recover((changed, next) => {
    for (const entry of changed) {
      ensureSeriesFree(entry, next)
      if (!isSeries(entry)) ensureFree(entry, next.filter((item): item is ScheduleEntry => !isSeries(item)))
    }
  })) },
  readSaved: store.readSaved,
  subscribe: store.subscribe,
  readIssue: store.readIssue,
  async create(draft: TaskDraft) {
    const task = { ...draft, id: crypto.randomUUID() }
    await withStorageLock(tasksStorageLock, () => commit((tasks) => { ensureSeriesFree(task, tasks); return [...tasks, task] }, task.id))
    return task
  },
  async createSeries(from: string, draft: SeriesDraft) {
    if (!parseDate(from) || !isSeriesDraft(draft) || draft.rule.until && draft.rule.until < from) throw new Error('Invalid series')
    const series: TaskSeries = { kind: 'series', id: crypto.randomUUID(), version: 0, periods: [{ ...draft, from }], exceptions: {} }
    await withStorageLock(tasksStorageLock, () => commit(records => { ensureSeriesFree(series, records); return [...records, series] }))
    return series
  },
  changeSeries(task: Task, scope: Exclude<Scope, 'one'>, draft?: SeriesDraft) {
    return withStorageLock(tasksStorageLock, () => commit(records => {
      const series = records.find((record): record is TaskSeries => isSeries(record) && record.id === task.recurrence?.seriesId)
      if (!series || !task.recurrence || series.version !== task.recurrence.version) throw new StalePlanError()
      if (draft && !isSeriesDraft(draft)) throw new Error('Invalid series')
      const changed = changePeriods(series, task.recurrence.origin, scope, draft)
      if (draft && changed.periods.some(period => period.rule.until && period.rule.until < period.from)) throw new Error('Invalid end date')
      if (draft) ensureSeriesFree(changed, records)
      return records.map(record => record.id === series.id ? changed : record)
    }))
  },
  detachOccurrence(task: Task, scope: Scope, draft: TaskDraft) {
    return withStorageLock(tasksStorageLock, () => commit(records => {
      const meta = task.recurrence
      const series = records.find((entry): entry is TaskSeries => isSeries(entry) && entry.id === meta?.seriesId)
      if (!meta || !series || meta.version !== series.version || !lookup(records, task.id)) throw new StalePlanError()
      const changed = scope === 'one' ? series : changePeriods(series, meta.origin, scope)
      const updated = changeOccurrence(changed, task, null)
      const single = { ...draft, id: task.id }
      const next = [...records.map(record => record.id === series.id ? updated : record), single]
      ensureFree(single, next.filter((item): item is ScheduleEntry => !isSeries(item)))
      ensureSeriesFree(single, next)
      return next
    }))
  },
  async convertToSeries(id: string, from: string, draft: SeriesDraft) {
    if (!parseDate(from) || !isSeriesDraft(draft) || draft.rule.until && draft.rule.until < from) throw new Error('Invalid series')
    const series: TaskSeries = { kind: 'series', id: crypto.randomUUID(), version: 0, periods: [{ ...draft, from }], exceptions: {} }
    await withStorageLock(tasksStorageLock, () => commit(records => {
      const old = lookup(records, id)
      if (!old || isBreak(old) || old.recurrence) throw new MissingTaskError()
      const next = old.status === 'completed' ? records : records.filter(record => record.id !== id)
      ensureSeriesFree(series, next)
      return [...next, series]
    }))
  },
  update(id: string, patch: Partial<TaskDraft>, expectedVersion?: number) {
    return withStorageLock(tasksStorageLock, () => commit((entries) => {
      const task = lookup(entries, id)
      if (!task || isBreak(task)) throw new MissingTaskError()
      if (expectedVersion !== undefined && task.recurrence?.version !== expectedVersion) throw new StalePlanError()
      const updated = { ...task, ...patch }
      if (updated.date !== task.date || updated.startTime !== task.startTime || updated.duration !== task.duration || updated.type !== task.type) updated.plannerReasons = undefined
      if ((Object.keys(patch) as Array<keyof TaskDraft>).every((field) => task[field] === updated[field])) return entries
      const next = updateRecord(entries, task, updated)
      if (updated.date !== task.date || updated.startTime !== task.startTime || updated.duration !== task.duration) {
        if (updated.startTime) ensureFree(updated, next.filter((item): item is ScheduleEntry => !isSeries(item)))
        const record = next.find(item => item.id === (task.recurrence?.seriesId ?? id))
        if (record) ensureSeriesFree(record, next)
      }
      return next
    }, id))
  },
  createBreak(draft: Pick<ScheduleBreak, 'date' | 'startTime' | 'duration'>) {
    const entry: ScheduleBreak = { ...draft, id: crypto.randomUUID(), kind: 'break' }
    return withStorageLock(tasksStorageLock, () => commit((entries) => {
      ensureFree(entry, entries.filter((item): item is ScheduleEntry => !isSeries(item)))
      ensureSeriesFree(entry, entries)
      return [...entries, entry]
    }))
  },
  remove(id: string, expectedVersion?: number) {
    return withStorageLock(tasksStorageLock, () => commit(records => {
      const task = lookup(records, id)
      if (!task) return records
      if (isBreak(task) || !task.recurrence) return records.filter(record => record.id !== id)
      if (expectedVersion !== undefined && task.recurrence.version !== expectedVersion) throw new StalePlanError()
      return records.map(record => isSeries(record) && record.id === task.recurrence?.seriesId ? changeOccurrence(record, task, null) : record)
    }, id))
  },
}
