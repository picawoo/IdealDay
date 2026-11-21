import { cycleOnDate, cycles, getDayTransitions } from '../biorhythms/model.ts'
import { instantForLocalTime } from '../notifications/zonedTime.ts'
import { dateAndTime, getDayPlan, planningInterval, timelineRange } from '../schedule/dayPlan.ts'
import { addDays, dateInTimeZone, timeInTimeZone } from '../../shared/lib/calendar.ts'
import type { Chronotype, PlanningHours } from '../settings/preferences.ts'
import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry, TaskDraft, TaskType } from '../tasks/model.ts'
import { dayOffset, intersects, toInterval } from '../tasks/timeIntervals.ts'
import type { Interval } from '../tasks/timeIntervals.ts'
import { defaultPlanningMode, loadRules, longGapMinutes, planningModes, preferredWindows, windowMinutes } from './config.ts'
import type { PlanningMode, PreferredWindows } from './config.ts'

export type PlanningTask = Pick<TaskDraft, 'title' | 'description' | 'type' | 'duration'> & { id: string; existingId?: string; calendarDate?: string; manual?: { minute: number; pinned: boolean; edited?: boolean } }
export interface PlannerInput {
  date: string
  now: number
  timeZone: string
  planning: PlanningHours
  chronotype: Chronotype
  birthDate?: string
  windows?: PreferredWindows
  transitionReserve?: boolean
  mode?: PlanningMode
  entries: readonly ScheduleEntry[]
  tasks: readonly PlanningTask[]
}
export interface PlanPlacement {
  task: PlanningTask
  minute: number
  date: string
  startTime: string
  reasons: string[]
}

const phaseIndex = { intellectual: 2, physical: 0, creative: 1, routine: -1 } as const
interface Busy extends Interval { type?: TaskType; id: string }

export function remainingWindow({ date, now, timeZone, planning }: PlannerInput) {
  const window = planningInterval(planning)
  const at = new Date(now)
  const today = dateInTimeZone(at, timeZone)
  const [hours, minutes] = timeInTimeZone(at, timeZone).split(':').map(Number)
  return { start: Math.max(window.start, dayOffset(today) - dayOffset(date) + hours * 60 + minutes + 1), end: window.end }
}

export function mayMove(entry: ScheduleEntry, date: string, now: number, timeZone: string) {
  if (isBreak(entry) || entry.pinned || entry.status !== 'planned' || entry.duration === null || entry.date !== date) return false
  if (!entry.startTime) return !!entry.recurrence
  const instant = instantForLocalTime(entry.date, entry.startTime, timeZone)
  return instant !== null && instant > now
}

export function buildPlan(input: PlannerInput) {
  const { date, birthDate, entries, tasks, chronotype, timeZone } = input
  const window = remainingWindow(input)
  const mode = planningModes[input.mode ?? defaultPlanningMode]
  const offset = dayOffset(date)
  const phases = [date, addDays(date, 1)].map(day => cycles.map(cycle => birthDate && day >= birthDate ? cycleOnDate(birthDate, day, cycle).value : 0))
  const reserves = input.transitionReserve ? [date, addDays(date, 1)].flatMap((day, index) => {
    const end = Math.min(window.end, (index + 1) * 1440)
    return getDayTransitions(birthDate, day).count ? [{ start: Math.max(index * 1440, end - loadRules.transitionReserve), end }] : []
  }) : []
  const busy: Busy[] = entries.flatMap(entry => {
    const interval = toInterval(entry)
    return interval ? [{ id: entry.id, type: isBreak(entry) ? undefined : entry.type, start: interval.start - offset, end: interval.end - offset }]
      .filter(item => intersects(item, window)) : []
  })
  const clock = new Map<number, number | null>()
  function instant(minute: number) {
    if (!clock.has(minute)) {
      const at = dateAndTime(date, minute)
      clock.set(minute, instantForLocalTime(at.date, at.time, timeZone))
    }
    return clock.get(minute) ?? null
  }
  function validClock(slot: Interval) {
    const at = instant(slot.start)
    const end = instant(slot.end)
    return at !== null && end !== null && at > input.now && end - at === (slot.end - slot.start) * 60_000
  }
  function phase(task: PlanningTask, day: number) { return phases[day][phaseIndex[task.type]] ?? 0 }
  const windowsByType = Object.fromEntries(Object.keys(preferredWindows[chronotype]).map(key => {
    const type = key as TaskType
    const windows = input.windows?.[type] ?? preferredWindows[chronotype][type]
    return [type, windows.flatMap(w => {
      const interval = windowMinutes(w)
      return [-1440, 0, 1440].map(shift => ({ start: interval.start + shift, end: interval.end + shift }))
    })]
  })) as Record<TaskType, Interval[]>

  function calculate(usePhases: boolean) {
    let occupied = busy.slice()
    const placements: PlanPlacement[] = []
    const unplaced: { task: PlanningTask; reason: string }[] = []
    const order = tasks.slice().sort((a, b) => Number(!!b.manual) - Number(!!a.manual)
      || (usePhases ? phase(b, Number(window.start >= 1440)) - phase(a, Number(window.start >= 1440)) : 0)
      || (b.duration ?? 0) - (a.duration ?? 0) || a.id.localeCompare(b.id))
    for (const task of order) {
      const duration = task.duration
      if (!duration || !Number.isSafeInteger(duration)) {
        unplaced.push({ task, reason: 'Укажите длительность задачи.' })
        continue
      }
      const original = entries.find(entry => entry.id === task.existingId)
      if (task.existingId && (!original || isBreak(original) || !mayMove(original, original.date, input.now, timeZone)
        || original.duration !== duration)) {
        unplaced.push({ task, reason: 'Исходную задачу уже нельзя переносить.' })
        continue
      }
      const available = occupied.filter(slot => slot.id !== task.existingId)
      const requiredDate = original?.date ?? task.calendarDate
      const requiredOffset = requiredDate ? dayOffset(requiredDate) - offset : null
      const windowWeight = input.windows?.[task.type] ? 190 : 100
      const candidates = []
      const first = task.manual?.minute ?? window.start
      const last = task.manual?.minute ?? window.end - duration
      for (let start = first; start <= last; start++) {
        const end = start + duration
        if (start < window.start || end > window.end) continue
        const interval = { start, end }
        let previousEnd = -Infinity
        let conflict = false
        let close = false
        let sameType = false
        for (const slot of available) {
          if (intersects(slot, interval)) { conflict = true; break }
          if (slot.end <= start) previousEnd = Math.max(previousEnd, slot.end)
          if (slot.type && (start - slot.end >= 0 && start - slot.end < mode.pause
            || slot.start - end >= 0 && slot.start - end < mode.pause)) {
            close = true
            sameType ||= slot.type === task.type
          }
        }
        if (conflict) continue
        const overlap = Math.max(0, ...windowsByType[task.type].map(w => Math.min(end, w.end) - Math.max(start, w.start)))
        const day = Number(start >= 1440)
        if (requiredOffset !== null && requiredOffset !== day * 1440) continue
        if (!task.manual && reserves.some(reserve => intersects(reserve, interval))) continue
        // Civil minutes continue across midnight. The date change only changes the daily phase.
        const gap = Number.isFinite(previousEnd) ? Math.max(0, start - previousEnd - mode.gapAllowance) : 0
        const nightShare = Math.max(0, end - Math.max(start, 1440)) / duration
        const score = windowWeight * overlap / duration + (usePhases ? 8 * phase(task, day) * (overlap / duration + .25) : 0)
          - (sameType ? 14 : close ? 4 : 0) - (start - window.start) * mode.finishPerHour / 60
          - gap * mode.gapPerHour / 60 - nightShare * mode.nightPenalty
        candidates.push({ start, end, overlap, close, previousEnd, score })
      }
      candidates.sort((a, b) => b.score - a.score || a.start - b.start)
      const choice = candidates.find(validClock)
      if (!choice) {
        unplaced.push({ task, reason: task.manual ? 'Выбранное время недоступно или пересекается с другим интервалом.'
          : duration > window.end - window.start ? 'Длительность превышает оставшееся время бодрствования.'
            : 'В оставшемся времени бодрствования нет подходящего непрерывного окна.' })
        continue
      }
      occupied = [...available, { id: task.existingId ?? task.id, type: task.type, start: choice.start, end: choice.end }]
      const at = dateAndTime(date, choice.start)
      const matching = windowsByType[task.type].find(w => Math.min(choice.end, w.end) - Math.max(choice.start, w.start) === choice.overlap)
      const reasons = task.manual ? [task.manual.edited ? 'Время выбрано вручную.' : 'Время закреплено в черновике.']
        : [choice.overlap && matching
          ? (input.windows?.[task.type] ? 'Ваше окно ' : 'Окно хронотипа ') + timelineRange(Math.max(matching.start, window.start), Math.min(matching.end, window.end)) + '.'
          : 'Подходящее свободное окно.']
      if (!task.manual && Number.isFinite(choice.previousEnd) && choice.start - choice.previousEnd >= longGapMinutes) {
        const earlier = candidates.find(slot => slot.start < choice.start && validClock(slot))
        if (!earlier) reasons.push('Раньше не было подходящего интервала в пределах ограничений.')
        else if (!choice.close && earlier.close) reasons.push('Поздний слот оставляет паузу между задачами.')
      }
      placements.push({ task, minute: choice.start, date: at.date, startTime: at.time, reasons })
    }
    return { placements: placements.sort((a, b) => a.minute - b.minute), unplaced }
  }

  const result = calculate(true)
  if (birthDate) {
    const baseline = new Map(calculate(false).placements.map(item => [item.task.id, item.minute]))
    for (const item of result.placements) {
      if (!item.task.manual && baseline.get(item.task.id) !== item.minute) {
        item.reasons.push('Дневные фазы изменили выбор времени.')
      }
    }
  }
  const changed = new Set(result.placements.map(({ task }) => task.existingId).filter(Boolean))
  const projected: ScheduleEntry[] = [...entries.filter(entry => !changed.has(entry.id)), ...result.placements.map(item => ({
    id: item.task.existingId ?? item.task.id, title: item.task.title, description: item.task.description, type: item.task.type,
    duration: item.task.duration, date: item.date, startTime: item.startTime, status: 'planned' as const,
  }))]
  return { ...result, plan: getDayPlan(projected, date, input.planning), projected }
}
