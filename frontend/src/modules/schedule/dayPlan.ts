import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry } from '../tasks/model.ts'
import { dayOffset, intersects, isTime, minutesPerDay, minuteToTime, nextDaySuffix, timeToMinute, toInterval } from '../tasks/timeIntervals.ts'
import type { Interval } from '../tasks/timeIntervals.ts'
import { addDays } from '../../shared/lib/calendar.ts'
import { defaultPlanning } from '../settings/preferences.ts'
import type { PlanningHours } from '../settings/preferences.ts'

interface Segment extends Interval {
  entry: ScheduleEntry
}

export interface DaySegment extends Segment {
  conflict: boolean
}

export function planningInterval({ wakeTime, sleepTime }: PlanningHours) {
  const start = timeToMinute(wakeTime)
  const sleep = timeToMinute(sleepTime)
  return { start, end: sleep < start ? sleep + minutesPerDay : sleep }
}

export function dateAndTime(date: string, minute: number) {
  return { date: addDays(date, Math.floor(minute / minutesPerDay)), time: minuteToTime(minute % minutesPerDay) }
}

export function planningDate(date: string, time: string, planning: PlanningHours) {
  const { end } = planningInterval(planning)
  return timeToMinute(time) < end - minutesPerDay ? addDays(date, -1) : date
}

export function entryDate(date: string, time: string, planning: PlanningHours) {
  return planningDate(date, time, planning) === date ? date : addDays(date, 1)
}

export function timelineTime(minute: number) {
  return minuteToTime(minute % minutesPerDay)
}

export function timelineMoment(minute: number) {
  return timelineTime(minute) + nextDaySuffix(Math.floor(minute / minutesPerDay))
}

export function timelineRange(start: number, end: number) {
  return timelineTime(start) + '–' + timelineMoment(end)
}

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

export function getDayPlan(entries: readonly ScheduleEntry[], date: string, planning?: PlanningHours) {
  const offset = dayOffset(date)
  const window = planningInterval(planning ?? defaultPlanning)
  // Hours before an overnight window ends belong to the previous planning day.
  const boundary = planning ? Math.max(0, window.end - minutesPerDay) : 0
  const day = { start: offset + boundary, end: offset + boundary + minutesPerDay }
  const points: DaySegment[] = []
  const segments = entries.flatMap((entry) => {
    if (!isTime(entry.startTime)) return []
    const interval = toInterval(entry)
    if (!interval) {
      const instant = dayOffset(entry.date) + timeToMinute(entry.startTime)
      if (day.start <= instant && instant < day.end) {
        const minute = instant - offset
        points.push({ entry, start: minute, end: minute, conflict: false })
      }
      return []
    }
    return intersects(day, interval) ? [{
      entry,
      start: Math.max(boundary, interval.start - offset),
      end: Math.min(boundary + minutesPerDay, interval.end - offset),
    }] : []
  }).sort((a, b) => a.start - b.start || b.end - a.end)

  // Keep the same hours each day, extending only to show entries outside the base range.
  const startMinute = points.reduce((min, point) => Math.min(min, point.start),
    Math.min(window.start, segments[0]?.start ?? window.start))
  const endMinute = points.reduce((max, point) => Math.max(max, point.start + 1),
    segments.reduce((max, segment) => Math.max(max, segment.end), window.end))
  const start = startMinute < window.start ? Math.max(boundary, Math.floor(startMinute / 60) * 60) : window.start
  const end = endMinute > window.end ? Math.min(boundary + minutesPerDay, Math.ceil(endMinute / 60) * 60) : window.end
  const free: Interval[] = []
  const withinWindow = segments.filter(interval => intersects(interval, window)).map(interval => ({
    ...interval, start: Math.max(window.start, interval.start), end: Math.min(window.end, interval.end),
  }))
  let next = window.start
  for (const interval of mergeIntervals(withinWindow)) {
    if (interval.start > next) free.push({ start: next, end: interval.start })
    next = interval.end
  }
  if (next < window.end) free.push({ start: next, end: window.end })

  const tasks = segments.filter(({ entry }) => !isBreak(entry))
  const taskMinutes = mergeIntervals(withinWindow.filter(({ entry }) => !isBreak(entry))).reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const freeMinutes = free.reduce((sum, interval) => sum + interval.end - interval.start, 0)
  const visibleEntries = [...markConflicts(segments), ...points].sort((a, b) => a.start - b.start || a.end - b.end)
  return { start, end, boundary, window, free, taskMinutes, freeMinutes, taskCount: tasks.length + points.length, entries: visibleEntries }
}

export type DayPlan = ReturnType<typeof getDayPlan>

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? hours + ' ч' + (remainder ? ' ' + remainder + ' мин' : '') : remainder + ' мин'
}
