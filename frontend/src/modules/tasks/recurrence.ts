import { addDays, dateRange, parseDate } from '../../shared/lib/calendar.ts'
import { isPositiveDuration, isTask, isTaskType } from './model.ts'
import type { ScheduleEntry, Task, TaskDraft } from './model.ts'
import { dayOffset, intersects, isTime, timeToMinute, toInterval } from './timeIntervals.ts'

export type Scope = 'one' | 'following' | 'all'
export type RepeatRule = { frequency: 'daily' | 'weekdays' | 'custom'; days?: number[]; until?: string }
export type SeriesDraft = Pick<TaskDraft, 'title' | 'description' | 'type' | 'duration' | 'pinned'> & { startTime: string | null; rule: RepeatRule }
export type SeriesPeriod = SeriesDraft & { from: string; through?: string }
type Instance = Omit<TaskDraft, 'startTime'> & { startTime: string | null }
type Exception = { cancelled: true } | { patch?: Partial<Instance>; frozen?: Instance }
export interface TaskSeries {
  kind: 'series'
  id: string
  version: number
  periods: SeriesPeriod[]
  exceptions: Record<string, Exception>
}
export type TaskRecord = ScheduleEntry | TaskSeries

export const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const endOfCalendar = '9999-12-31'
const weekMinutes = 7 * 1440

export function isSeries(record: TaskRecord): record is TaskSeries {
  return 'kind' in record && record.kind === 'series'
}

export function ruleLabel(rule: RepeatRule) {
  if (rule.frequency === 'daily') return 'Каждый день'
  if (rule.frequency === 'weekdays') return 'По будням'
  return (rule.days ?? []).map(day => weekDays[day]).join(', ')
}

function daysFor(rule: RepeatRule) {
  return rule.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : rule.frequency === 'weekdays' ? [0, 1, 2, 3, 4] : rule.days ?? []
}

function weekday(date: string) { return (new Date(date).getUTCDay() + 6) % 7 }
function dateValue(value: unknown): value is string { return typeof value === 'string' && !!parseDate(value) }

export function isRepeatRule(rule: unknown): rule is RepeatRule {
  if (!rule || typeof rule !== 'object') return false
  const { frequency, days, until } = rule as Partial<RepeatRule>
  return (until === undefined || dateValue(until)) && (frequency === 'daily' || frequency === 'weekdays'
    || frequency === 'custom' && Array.isArray(days) && days.length > 0 && new Set(days).size === days.length
    && days.every(day => Number.isInteger(day) && day >= 0 && day < 7))
}

export function isSeriesDraft(draft: SeriesDraft) {
  return !!draft.title?.trim() && typeof draft.description === 'string' && isTaskType(draft.type)
    && (draft.pinned === undefined || typeof draft.pinned === 'boolean')
    && (draft.startTime === null ? !draft.pinned && isPositiveDuration(draft.duration) : isTime(draft.startTime)
      && (draft.duration === null || isPositiveDuration(draft.duration)))
    && isRepeatRule(draft.rule)
}

export function isTaskSeries(value: unknown): value is TaskSeries {
  if (!value || typeof value !== 'object') return false
  const series = value as TaskSeries
  if (series.kind !== 'series' || typeof series.id !== 'string' || !Number.isSafeInteger(series.version)
    || !Array.isArray(series.periods) || !series.exceptions || typeof series.exceptions !== 'object' || Array.isArray(series.exceptions)) return false
  if (!series.periods.every((period, index) => period && typeof period.title === 'string' && isSeriesDraft(period)
    && dateValue(period.from) && (period.through === undefined || dateValue(period.through) && period.through >= period.from)
    && (period.rule.until === undefined || period.rule.until >= period.from)
    && (!index || !!series.periods[index - 1].through && series.periods[index - 1].through! < period.from))) return false
  return Object.entries(series.exceptions).every(([day, item]) => {
    if (!dateValue(day) || !item || typeof item !== 'object') return false
    if ('cancelled' in item) return item.cancelled === true
    if (item.frozen && !isTask({ ...item.frozen, id: '-', startTime: item.frozen.startTime ?? '00:00' })) return false
    const patch = item.patch
    return patch === undefined ? !!item.frozen : !!patch && typeof patch === 'object' && !Array.isArray(patch)
      && Object.keys(patch).every(key => ['title', 'description', 'type', 'duration', 'pinned', 'startTime', 'date', 'status', 'plannerReasons'].includes(key))
      && isTask({ id: '-', title: '-', description: '', type: 'routine', status: 'planned', duration: null, date: day, ...patch,
        startTime: patch.startTime === null || patch.startTime === undefined ? '00:00' : patch.startTime })
  })
}

export function instanceId(seriesId: string, day: string) { return 'repeat~' + seriesId + '~' + day }

function effectiveEnd(period: SeriesPeriod) {
  return [period.through, period.rule.until, endOfCalendar].filter((value): value is string => !!value).sort()[0]
}

export function periodOn(series: TaskSeries, day: string) {
  return series.periods.find(period => day >= period.from && day <= effectiveEnd(period) && daysFor(period.rule).includes(weekday(day)))
}

export function occurrence(series: TaskSeries, day: string): Task | undefined {
  const period = periodOn(series, day)
  const exception = series.exceptions[day]
  if (exception && 'cancelled' in exception) return
  if (!period && !exception?.frozen) return
  const base = exception?.frozen ?? {
    title: period!.title, description: period!.description, type: period!.type, pinned: period!.pinned,
    startTime: period!.startTime, duration: period!.duration, date: day, status: 'planned' as const,
  }
  const value = { ...base, ...exception?.patch }
  return { ...value, startTime: value.startTime ?? '', id: instanceId(series.id, day),
    recurrence: { seriesId: series.id, origin: day, version: series.version, rule: period?.rule } }
}

export function lookup(records: readonly TaskRecord[], id: string): ScheduleEntry | undefined {
  const plain = records.find(record => !isSeries(record) && record.id === id)
  if (plain && !isSeries(plain)) return plain
  const [prefix, seriesId, day] = id.split('~')
  if (prefix !== 'repeat' || !dateValue(day) || id !== instanceId(seriesId, day)) return
  const series = records.find((record): record is TaskSeries => isSeries(record) && record.id === seriesId)
  return series && occurrence(series, day)
}

export function project(records: readonly TaskRecord[], from: string, through: string, includeCompleted = false): ScheduleEntry[] {
  const result: ScheduleEntry[] = []
  const lower = dayOffset(from)
  function visible(entry: ScheduleEntry) {
    return (entry.date >= from || (toInterval(entry)?.end ?? -Infinity) > lower) && entry.date <= through
  }
  for (const record of records) {
    if (!isSeries(record)) { if (visible(record)) result.push(record); continue }
    const found = new Set<string>()
    function append(origin: string) {
      if (found.has(origin)) return
      found.add(origin)
      const task = occurrence(record as TaskSeries, origin)
      if (task && (visible(task) || includeCompleted && task.status === 'completed')) result.push(task)
    }
    Object.keys(record.exceptions).forEach(append)
    for (const period of record.periods) {
      const first = Math.max(dayOffset(period.from), lower - (period.duration ?? 0))
      const last = Math.min(dayOffset(through), dayOffset(effectiveEnd(period)))
      if (last < first) continue
      const start = addDays(from, Math.floor((first - lower) / 1440))
      dateRange(start, Math.floor((last - dayOffset(start)) / 1440) + 1).forEach(append)
    }
  }
  return result
}

function serialInstance(task: Task): Instance {
  const { title, description, type, date, startTime, duration, status, pinned, plannerReasons } = task
  return { title, description, type, date, startTime: startTime || null, duration, status, pinned, plannerReasons }
}

export function changeOccurrence(series: TaskSeries, task: Task, patch: Partial<Instance> | null): TaskSeries {
  const day = task.recurrence!.origin
  const old = series.exceptions[day]
  let change: Exception = { cancelled: true }
  if (patch) {
    const prior = old && !('cancelled' in old) ? old : undefined
    const next = { ...serialInstance(task), ...patch }
    change = next.status === 'completed' || prior?.frozen ? { frozen: next }
      : { patch: { ...prior?.patch, ...patch } }
  }
  return { ...series, version: series.version + 1, exceptions: { ...series.exceptions, [day]: change } }
}

export function changePeriods(series: TaskSeries, origin: string, scope: Exclude<Scope, 'one'>, draft?: SeriesDraft): TaskSeries {
  const from = scope === 'all' ? series.periods[0]?.from ?? origin : origin
  const before = series.periods.filter(period => period.from < from).map(period => ({ ...period,
    through: effectiveEnd(period) < from ? effectiveEnd(period) : addDays(from, -1),
  }))
  // Completed occurrences are frozen in exceptions and remain addressable.
  return { ...series, version: series.version + 1, periods: draft ? [...before, { ...draft, from }] : before }
}

interface Pattern { first: number; last: number; duration: number; title: string; recordId: string; series?: TaskSeries; start?: number }
function patterns(record: TaskRecord): Pattern[] {
  function concrete(entry: ScheduleEntry): Pattern[] {
    const at = toInterval(entry)
    return at ? [{ first: at.start, last: at.start, duration: at.end - at.start,
      title: 'title' in entry ? entry.title : 'Перерыв', recordId: record.id }] : []
  }
  if (!isSeries(record)) return concrete(record)
  const fixed = Object.keys(record.exceptions).flatMap(day => {
    const task = occurrence(record, day)
    return task ? concrete(task) : []
  })
  for (const period of record.periods) {
    if (!period.duration || !period.startTime) continue
    const start = timeToMinute(period.startTime)
    const end = effectiveEnd(period)
    for (const day of daysFor(period.rule)) {
      const first = dayOffset(period.from) + ((day - weekday(period.from) + 7) % 7) * 1440 + start
      const last = dayOffset(end) - ((weekday(end) - day + 7) % 7) * 1440 + start
      if (first <= last) fixed.push({ first, last, duration: period.duration, title: period.title, series: record, start, recordId: record.id })
    }
  }
  return fixed
}

function excepted(pattern: Pattern, minute: number) {
  if (!pattern.series) return false
  const day = new Date((minute - pattern.start!) * 60_000).toISOString().slice(0, 10)
  return Object.hasOwn(pattern.series.exceptions, day)
}

function conflict(a: Pattern, b: Pattern, same: boolean) {
  // Starts in each pattern are seven days apart. Compare the congruent distances
  // that can overlap, then skip only overridden occurrences.
  const min = Math.max(1 - b.duration, b.first - a.last, same ? 1 : -Infinity)
  const max = Math.min(a.duration - 1, b.last - a.first)
  const residue = ((b.first - a.first - min) % weekMinutes + weekMinutes) % weekMinutes
  for (let distance = min + residue; distance <= max; distance += weekMinutes) {
    const last = Math.min(a.last, b.last - distance)
    for (let start = Math.max(a.first, b.first - distance); start <= last; start += weekMinutes) {
      if (!excepted(a, start) && !excepted(b, start + distance)) return Math.max(start, start + distance)
    }
  }
}

export function seriesConflict(affected: TaskRecord, records: readonly TaskRecord[]) {
  const candidates = patterns(affected)
  let first: { minute: number; title: string } | undefined
  function consider(a: Pattern, b: Pattern, same = false) {
    const minute = conflict(a, b, same)
    if (minute !== undefined && (!first || minute < first.minute)) first = { minute, title: b.title }
  }
  if (isSeries(affected)) candidates.forEach((a, index) => candidates.slice(index).forEach(b => consider(a, b, a === b)))
  for (const record of records) {
    if (record.id === affected.id || !isSeries(affected) && !isSeries(record)) continue
    for (const a of candidates) for (const b of patterns(record)) consider(a, b)
  }
  return first
}

export function intervalConflict(entry: ScheduleEntry, entries: readonly ScheduleEntry[]) {
  const interval = toInterval(entry)
  return interval ? entries.filter(other => {
    const at = toInterval(other)
    return other.id !== entry.id && at && intersects(interval, at)
  }) : []
}
