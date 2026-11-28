import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry } from '../tasks/model.ts'
import type { DayPlan } from '../schedule/dayPlan.ts'
import { durationLabel } from '../schedule/dayPlan.ts'
import { loadRules } from './config.ts'

export interface LoadAdvice { id: string; text: string; breakAt?: number }

export function analyzeLoad(plan: DayPlan): LoadAdvice[] {
  const advice: LoadAdvice[] = []
  const { start, end } = plan.window
  if (plan.taskMinutes > (end - start) * loadRules.maxOccupancy) {
    advice.push({ id: 'capacity', text: 'Задачи занимают более 85% периода бодрствования. Оставьте резерв или перенесите гибкую задачу.' })
  }
  const tasks = plan.entries.filter(({ entry, start: from, end: to }) => !isBreak(entry) && to > from && from < end && to > start)
  let focusStart = -1
  let focusEnd = -1
  let warned = false
  let previous: ScheduleEntry | undefined
  let previousEnd = -1
  let same = 0
  for (const { entry, start: from, end: to } of tasks) {
    if (isBreak(entry)) continue
    const a = Math.max(start, from)
    const b = Math.min(end, to)
    if (entry.type === 'intellectual') {
      if (a > focusEnd) { focusStart = a; focusEnd = a; warned = false }
      focusEnd = Math.max(focusEnd, b)
      if (focusEnd - focusStart >= loadRules.focusMinutes && !warned) {
        warned = true
        const gap = plan.free.find(slot => slot.end - Math.max(slot.start, focusEnd) >= loadRules.breakMinutes)
        advice.push({ id: 'focus-' + entry.id, text: 'После ' + durationLabel(focusEnd - focusStart) + ' непрерывной интеллектуальной работы запланируйте паузу на 10–15 минут.',
          breakAt: gap && Math.max(gap.start, focusEnd) })
      }
    } else if (a >= focusEnd) {
      focusStart = -1; focusEnd = -1; warned = false
    }
    same = previous && !isBreak(previous) && previous.type === entry.type && a - previousEnd < loadRules.breakMinutes
      && b - a >= loadRules.longTaskMinutes ? same + 1 : Number(b - a >= loadRules.longTaskMinutes)
    if (same === 2) advice.push({ id: 'variety-' + entry.id, text: 'Две длительные однотипные задачи идут подряд. Между ними можно сменить вид деятельности или сделать паузу.' })
    previous = entry
    previousEnd = b
  }
  return advice
}
