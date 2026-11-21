import type { ScheduleEntry } from './model'

const dayUnits = new Intl.NumberFormat('ru', { style: 'unit', unit: 'day', unitDisplay: 'long' })

export function nextDaySuffix(days: number) {
  return days === 1 ? ' следующего дня' : days > 1 ? ' через ' + dayUnits.format(days) : ''
}

export function formatPlannerReason(reason: string) {
  // Older saved explanations used a compact suffix for each endpoint.
  return reason.replace(/ \(\+1\)(?=–\d{2}:\d{2} \(\+1\))/g, '').replaceAll(' (+1)', nextDaySuffix(1))
}

export interface Interval {
  start: number
  end: number
}

export const minutesPerDay = 1440

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function dayOffset(date: string): number {
  // Calendar days use a civil 24-hour grid, independent of browser timezone/DST.
  return Date.parse(date) / 60_000
}

export function timeToMinute(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function minuteToTime(minute: number): string {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
}

export function toInterval(entry: Pick<ScheduleEntry, 'date' | 'startTime' | 'duration'>): Interval | null {
  if (entry.duration === null || !isTime(entry.startTime)) return null
  const start = dayOffset(entry.date) + timeToMinute(entry.startTime)
  return { start, end: start + entry.duration }
}

export function intersects(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}
