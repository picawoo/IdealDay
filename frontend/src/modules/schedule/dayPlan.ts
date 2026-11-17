import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry } from '../tasks/model.ts'
import { dayOffset, intersects, minutesPerDay, timeToMinute, toInterval } from '../tasks/timeIntervals.ts'
import type { Interval } from '../tasks/timeIntervals.ts'

interface Segment extends Interval {
  entry: ScheduleEntry
}

export interface DaySegment extends Segment {
  conflict: boolean
}

const baseDayStart = 6 * 60
const baseDayEnd = 23 * 60

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const merged: Interval[] = []
  for (const interval of intervals) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ start: interval.start, end: interval.end })
  }
  return merged
}

function markConflicts(segments: readonly Segment[]): DaySegment[] {
  let latestEnd = 0
  return segments.map((segment, index) => {
    const next = segments[index + 1]
    const conflict = segment.start < latestEnd || (next !== undefined && next.start < segment.end)
    latestEnd = Math.max(latestEnd, segment.end)
    return { ...segment, conflict }
  })
}

export function getDayPlan(entries: readonly ScheduleEntry[], date: string) {
  const offset = dayOffset(date)
  const day = { start: offset, end: offset + minutesPerDay }
  const points: DaySegment[] = []
  const segments = entries.flatMap((entry) => {
    const interval = toInterval(entry)
    if (!interval) {
      if (entry.date === date) {
        const minute = timeToMinute(entry.startTime)
        points.push({ entry, start: minute, end: minute, conflict: false })
      }
      return []
    }
    return intersects(day, interval) ? [{
      entry,
      start: Math.max(0, interval.start - offset),
      end: Math.min(minutesPerDay, interval.end - offset),
    }] : []
  }).sort((a, b) => a.start - b.start || b.end - a.end)

  // Keep the same hours each day, extending only to show entries outside the base range.
  const startMinute = points.reduce((min, point) => Math.min(min, point.start),
    Math.min(baseDayStart, segments[0]?.start ?? baseDayStart))
  const endMinute = points.reduce((max, point) => Math.max(max, point.start),
    segments.reduce((max, segment) => Math.max(max, segment.end), baseDayEnd))
  const start = Math.floor(startMinute / 60) * 60
  const end = Math.ceil(endMinute / 60) * 60
  const free: Interval[] = []
  let next = start
  for (const interval of mergeIntervals(segments)) {
    if (interval.start > next) free.push({ start: next, end: interval.start })
    next = interval.end
  }
  if (next < end) free.push({ start: next, end })

  const tasks = segments.filter(({ entry }) => !isBreak(entry))
  const taskMinutes = mergeIntervals(tasks).reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const freeMinutes = free.reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const visibleEntries = [...markConflicts(segments), ...points].sort((a, b) => a.start - b.start || a.end - b.end)
  return { start, end, free, taskMinutes, freeMinutes, taskCount: tasks.length + points.length, entries: visibleEntries }
}

export type DayPlan = ReturnType<typeof getDayPlan>

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? hours + ' ч' + (remainder ? ' ' + remainder + ' мин' : '') : remainder + ' мин'
}
