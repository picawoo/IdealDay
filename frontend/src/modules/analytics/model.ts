import { dateRange, startOfWeek } from '../../shared/lib/calendar.ts'
import { getDayPlan } from '../schedule/dayPlan.ts'
import { isBreak } from '../tasks/model.ts'
import type { ScheduleEntry, Task, TaskType } from '../tasks/model.ts'
import type { PlanningHours } from '../settings/preferences.ts'
import { defaultPlanning } from '../settings/preferences.ts'

const plural = new Intl.PluralRules('ru')

export function taskCountLabel(count: number) {
  const form = plural.select(count)
  return `${count} ${form === 'one' ? 'задача' : form === 'few' ? 'задачи' : 'задач'}`
}

export function getAnalytics(entries: readonly ScheduleEntry[], date: string, planning: PlanningHours = defaultPlanning) {
  const tasks = entries.filter((entry): entry is Task => !isBreak(entry))
  const days = dateRange(startOfWeek(date), 7).map((day) => {
    const calendar = getDayPlan(entries, day)
    const plan = getDayPlan(entries, day, planning)
    const minutesByType: Record<TaskType, number> = { intellectual: 0, physical: 0, creative: 0, routine: 0 }
    let unknownDuration = 0
    let breaks = 0
    let breakMinutes = 0

    for (const { entry, start, end } of calendar.entries) {
      if (!isBreak(entry)) {
        minutesByType[entry.type] += end - start
        if (entry.duration === null) unknownDuration++
      }
    }
    for (const { entry, start, end } of plan.entries) {
      const minutes = Math.min(end, plan.window.end) - Math.max(start, plan.window.start)
      if (isBreak(entry) && minutes > 0) { breaks++; breakMinutes += minutes }
    }

    return {
      date: day, plan, minutesByType, unknownDuration, breaks, breakMinutes,
      count: tasks.filter((task) => task.date === day).length,
      minutes: Object.values(minutesByType).reduce((sum, minutes) => sum + minutes, 0),
    }
  })
  const selected = days.find((day) => day.date === date) ?? days[0]
  const weekTasks = tasks.filter(task => task.date >= days[0].date && task.date <= days[6].date)
  const max = Math.max(...days.map(({ count }) => count))

  return {
    days, selected,
    busiest: max ? days.filter(({ count }) => count === max) : [],
    count: days.reduce((sum, day) => sum + day.count, 0),
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    unknownDuration: days.reduce((sum, day) => sum + day.unknownDuration, 0),
    completed: weekTasks.filter(({ status }) => status === 'completed').length,
    total: weekTasks.length,
  }
}
