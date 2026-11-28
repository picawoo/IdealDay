import { createLocalRecordStore } from '../../shared/lib/localRecordStore.ts'
import { isScheduleEntry } from './model.ts'
import { isTaskSeries } from './recurrence.ts'
import type { TaskRecord } from './recurrence.ts'

export const legacyKey = 'ideal-day.tasks.v1'
export const scheduleKey = 'ideal-day.schedule.v2'
type Migration = { id: 'migration-v2'; kind: 'migration'; source: string | null; original?: string | null; deferred?: (string | null)[] }
type RecordV2 = TaskRecord | Migration
const legacy = createLocalRecordStore(legacyKey, isScheduleEntry)
function isMigration(record: RecordV2): record is Migration { return 'kind' in record && record.kind === 'migration' }
const current = createLocalRecordStore<RecordV2>(scheduleKey, (record): record is RecordV2 => {
  if (!record || typeof record !== 'object') return false
  const item = record as Migration
  return item.kind === 'migration' ? item.id === 'migration-v2' && (item.source === null || typeof item.source === 'string')
    && (item.original === undefined || item.original === null || typeof item.original === 'string')
    && (item.deferred === undefined || Array.isArray(item.deferred) && item.deferred.every(raw => raw === null || typeof raw === 'string'))
    : isScheduleEntry(record) || isTaskSeries(record)
})

export class LegacyWriteError extends Error {
  constructor() { super('Старая вкладка изменила задачи. Обновите её и восстановите правки через сообщение вверху страницы.') }
}

let sourceSnapshot: readonly RecordV2[] | undefined
let view: readonly TaskRecord[] = []
let issue: 'quota' | 'write' | null = null

function hasCurrent() { return window.localStorage.getItem(scheduleKey) !== null }
function strip(records: readonly RecordV2[]) {
  if (sourceSnapshot !== records) { sourceSnapshot = records; view = records.filter((record): record is TaskRecord => !isMigration(record)) }
  return view
}

function read() {
  try { return hasCurrent() ? strip(current.read()) : legacy.read() }
  catch { return view }
}

function readIssue() {
  try {
    if (!hasCurrent()) {
      const problem = legacy.readIssue()
      return problem === 'invalid' || problem === 'unavailable' ? problem : issue ?? problem
    }
    const records = current.read()
    const problem = current.readIssue()
    if (problem === 'invalid' || problem === 'unavailable') return problem
    const migration = records.find(isMigration)
    if (!migration) return 'invalid'
    return migration.source !== window.localStorage.getItem(legacyKey) ? 'legacy' : problem
  } catch { return 'unavailable' }
}

const listeners = new Set<() => void>()
function emit() { listeners.forEach(listener => listener()) }

export const taskStorage = {
  read, readIssue,
  readSaved() { return hasCurrent() ? current.readSaved().filter((record): record is TaskRecord => !isMigration(record)) : legacy.readSaved() },
  subscribe(listener: () => void) {
    listeners.add(listener)
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === legacyKey || event.key === scheduleKey) listener()
    }
    window.addEventListener('storage', onStorage)
    return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage) }
  },
  commit(change: (records: readonly TaskRecord[]) => readonly TaskRecord[]) {
    const source = window.localStorage.getItem(legacyKey)
    if (!hasCurrent()) {
      const original = legacy.readSaved()
      const next = change(original)
      if (original === next) return
      try {
        current.commit(() => [{ id: 'migration-v2', kind: 'migration', source }, ...next])
        issue = null
      } catch (error) {
        issue = error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'write'
        throw error
      } finally { emit() }
      return
    }
    try {
      current.commit(records => {
        const migration = records.find(isMigration)
        if (!migration) throw new Error('Missing migration marker')
        if (migration.source !== source) throw new LegacyWriteError()
        const original = records.filter((record): record is TaskRecord => !isMigration(record))
        const next = change(original)
        return next === original ? records : [migration, ...next]
      })
    } finally { emit() }
  },
  recover(validate: (changed: readonly TaskRecord[], next: readonly TaskRecord[]) => void) {
    try {
      if (readIssue() !== 'legacy') return
      if (current.readIssue() === 'partial') throw new Error('Damaged current data')
      const source = window.localStorage.getItem(legacyKey)
      const incoming = legacy.readSaved()
      if (legacy.readIssue() === 'partial') throw new Error('Damaged legacy data')
      current.commit(records => {
        const migration = records.find(isMigration)!
        if (migration.source === source) return records
        const previous: unknown = migration.source === null ? [] : JSON.parse(migration.source)
        if (!Array.isArray(previous)) throw new Error('Invalid migration source')
        const base = new Map(previous.filter(isScheduleEntry).map(entry => [entry.id, entry]))
        const latest = new Map(incoming.map(entry => [entry.id, entry]))
        const merged = new Map(records.filter((record): record is TaskRecord => !isMigration(record)).map(entry => [entry.id, entry]))
        const changed: TaskRecord[] = []
        for (const id of new Set([...base.keys(), ...latest.keys()])) {
          const old = base.get(id)
          const next = latest.get(id)
          if (JSON.stringify(old) === JSON.stringify(next)) continue
          const target = merged.get(id)
          if (JSON.stringify(next) === JSON.stringify(target)) continue
          if (JSON.stringify(old) !== JSON.stringify(target)) throw new Error('Одна задача изменена в обеих версиях.')
          if (next) { merged.set(id, next); changed.push(next) }
          else merged.delete(id)
        }
        const next = [...merged.values()]
        validate(changed, next)
        return [{ ...migration, original: migration.original === undefined ? migration.source : migration.original, source }, ...next]
      })
    } finally { emit() }
  },
  deferLegacy() {
    try {
      if (readIssue() !== 'legacy' || current.readIssue()) throw new Error('Unsafe recovery')
      const source = window.localStorage.getItem(legacyKey)
      current.commit(records => {
        const marker = records.find(isMigration)
        if (!marker || marker.source === source) return records
        return records.map(record => isMigration(record) ? { ...record,
          original: marker.original === undefined ? marker.source : marker.original,
          source, deferred: [...(marker.deferred ?? []), source],
        } : record)
      })
    } finally { emit() }
  },
  legacyBackup() {
    const records = current.read()
    const marker = records.find(isMigration)
    return { original: marker?.original === undefined ? marker?.source : marker.original, legacy: window.localStorage.getItem(legacyKey),
      schedule: window.localStorage.getItem(scheduleKey) }
  },
}
