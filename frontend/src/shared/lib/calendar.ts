const millisecondsPerDay = 86_400_000

export function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp).toISOString().slice(0, 10) === value ? value : null
}

export function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / millisecondsPerDay
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * millisecondsPerDay).toISOString().split('T')[0]
}

export function startOfWeek(date: string): string {
  const weekday = new Date(date).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

export function startOfMonth(date: string): string {
  return date.slice(0, 7) + '-01'
}

export function shiftMonth(date: string, offset: number): string {
  const first = new Date(startOfMonth(date))
  first.setUTCMonth(first.getUTCMonth() + offset)
  const last = new Date(first)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  first.setUTCDate(Math.min(Number(date.slice(8)), last.getUTCDate()))
  return first.toISOString().split('T')[0]
}

export function dateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, offset) => addDays(start, offset))
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' }).format(new Date(date))
}

export function timeInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  return [value('year'), value('month'), value('day')].join('-')
}
