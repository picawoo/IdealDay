import { addDays, dateRange, daysBetween, shiftMonth, startOfMonth, startOfWeek } from '../../shared/lib/calendar.ts'

export const cycles = [
  { id: 'physical', label: 'Физический', period: 23 },
  { id: 'emotional', label: 'Эмоциональный', period: 28 },
  { id: 'intellectual', label: 'Интеллектуальный', period: 33 },
] as const

export type Cycle = (typeof cycles)[number]
export type Period = 'week' | 'month'

const zeroTolerance = 1e-10

export function cycleValue(days: number, period: number): number {
  const value = Math.sin((2 * Math.PI * (days % period)) / period)
  return Math.abs(value) < zeroTolerance ? 0 : value
}

export function cycleOnDate(birthDate: string, date: string, cycle: Cycle) {
  const days = daysBetween(birthDate, date)
  const value = cycleValue(days, cycle.period)
  const previous = cycleValue(days - 1, cycle.period)
  // An exact zero belongs to its own date. An in-between crossing belongs to the later date.
  const critical = value === 0 || (previous * value < 0)
  return { ...cycle, value, percent: Math.round(value * 100), critical }
}

export function forecastDates(date: string, period: Period): string[] {
  if (period === 'week') return dateRange(startOfWeek(date), 7)

  const start = startOfMonth(date)
  return dateRange(start, daysBetween(start, shiftMonth(start, 1)))
}

export function upcomingTransitions(birthDate: string, date: string) {
  return dateRange(addDays(date, 1), 33).flatMap((day) =>
    cycles
      .map((cycle) => cycleOnDate(birthDate, day, cycle))
      .filter((cycle) => cycle.critical)
      .map((cycle) => ({ date: day, cycle })),
  ).slice(0, 3)
}

export function formatPercent(percent: number): string {
  if (percent === 0) return '0%'
  return (percent > 0 ? '+' : '−') + Math.abs(percent) + '%'
}
