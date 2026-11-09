import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry } from '../tasks/model.ts'
import { dayOffset, intersects, minutesPerDay, timeToMinute, toInterval } from '../tasks/timeIntervals.ts'
import type { Interval } from '../tasks/timeIntervals.ts'

interface Segment extends Interval {
  entry: ScheduleEntry
}

interface PositionedSegment extends Segment {
  lane: number
  lanes: number
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

function positionSegments(segments: readonly Segment[]): PositionedSegment[] {
  const positioned: PositionedSegment[] = []
  let group: Array<Segment & { lane: number }> = []
  let laneEnds: number[] = []
  let groupEnd = 0

  function appendGroup() {
    positioned.push(...group.map((segment) => ({ ...segment, lanes: laneEnds.length })))
    group = []
    laneEnds = []
  }

  for (const segment of segments) {
    if (segment.start >= groupEnd) appendGroup()
    const available = laneEnds.findIndex((end) => end <= segment.start)
    const lane = available < 0 ? laneEnds.length : available
    laneEnds[lane] = segment.end
    group.push({ ...segment, lane })
    groupEnd = Math.max(groupEnd, segment.end)
  }
  appendGroup()
  return positioned
}

export function getDayPlan(entries: readonly ScheduleEntry[], date: string) {
  const offset = dayOffset(date)
  const day = { start: offset, end: offset + minutesPerDay }
  const points: PositionedSegment[] = []
  const segments = entries.flatMap((entry) => {
    const interval = toInterval(entry)
    if (!interval) {
      if (entry.date === date) {
        const minute = timeToMinute(entry.startTime)
        points.push({ entry, start: minute, end: minute, lane: 0, lanes: 1 })
      }
      return []
    }
    return intersects(day, interval) ? [{
      entry,
      start: Math.max(0, interval.start - offset),
      end: Math.min(minutesPerDay, interval.end - offset),
    }] : []
  }).sort((a, b) => a.start - b.start || a.end - b.end)

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
  const positioned = [...positionSegments(segments), ...points].sort((a, b) => a.start - b.start || a.end - b.end)
  return { start, end, free, taskMinutes, freeMinutes, taskCount: tasks.length + points.length, entries: positioned }
}

export type DayPlan = ReturnType<typeof getDayPlan>
export type DaySegment = DayPlan['entries'][number]

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return hours ? hours + ' ч' + (remainder ? ' ' + remainder + ' мин' : '') : remainder + ' мин'
}
