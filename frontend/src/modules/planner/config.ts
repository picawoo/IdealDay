import type { Chronotype } from '../settings/preferences.ts'
import type { TaskType } from '../tasks/model.ts'
import { timeToMinute } from '../tasks/timeIntervals.ts'

export interface PreferredWindow { start: string; end: string }
export type PreferredWindows = Partial<Record<TaskType, PreferredWindow[]>>

function windows(...ranges: string[]): PreferredWindow[] {
  return ranges.map(range => {
    const [start, end] = range.split('–')
    return { start, end }
  })
}

export const preferredWindows: Record<Chronotype, Required<PreferredWindows>> = {
  lark: { intellectual: windows('09:00–11:00'), physical: windows('14:00–17:00'),
    creative: windows('11:00–14:00'), routine: windows('07:00–09:00', '17:00–21:00') },
  pigeon: { intellectual: windows('11:00–14:00'), physical: windows('16:00–19:00'),
    creative: windows('14:00–16:00'), routine: windows('08:00–11:00', '19:00–22:00') },
  owl: { intellectual: windows('16:00–19:00'), physical: windows('12:00–15:00'),
    creative: windows('19:00–22:00'), routine: windows('10:00–12:00', '22:00–00:00') },
}

export const planningModes = {
  compact: { label: 'Компактный', finishPerHour: 13, gapPerHour: 20, gapAllowance: 15, pause: 10, nightPenalty: 10 },
  balanced: { label: 'Сбалансированный', finishPerHour: 7, gapPerHour: 12, gapAllowance: 30, pause: 10, nightPenalty: 6 },
  free: { label: 'Свободный', finishPerHour: 1, gapPerHour: 2, gapAllowance: 90, pause: 25, nightPenalty: 2 },
} as const

export type PlanningMode = keyof typeof planningModes
export const defaultPlanningMode: PlanningMode = 'balanced'
export const longGapMinutes = 120

export const loadRules = { focusMinutes: 90, breakMinutes: 10, longTaskMinutes: 45, maxOccupancy: .85, transitionReserve: 15 }

export function windowMinutes({ start, end }: PreferredWindow) {
  const from = timeToMinute(start)
  const to = timeToMinute(end)
  return { start: from, end: to <= from ? to + 1440 : to }
}
