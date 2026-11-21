import type { RepeatRule } from './recurrence.ts'
import { parseDate } from '../../shared/lib/calendar.ts'
import { isTime, minutesPerDay, minuteToTime, nextDaySuffix, timeToMinute } from './timeIntervals.ts'

export const taskTypes = {
  intellectual: 'Интеллектуальная',
  physical: 'Физическая',
  creative: 'Творческая',
  routine: 'Рутинная',
} as const

export const taskStatuses = {
  planned: 'Запланировано',
  inProgress: 'В процессе',
  completed: 'Выполнено',
} as const

export type TaskType = keyof typeof taskTypes
export type TaskStatus = keyof typeof taskStatuses
export type TaskScope = 'all' | 'today' | 'upcoming' | 'inProgress' | 'completed'

export const taskStatusOptions = (Object.keys(taskStatuses) as TaskStatus[])
  .map((value) => ({ value, label: taskStatuses[value] }))

export interface TaskDraft {
  title: string
  description: string
  type: TaskType
  date: string
  startTime: string
  duration: number | null
  status: TaskStatus
  pinned?: boolean
  plannerReasons?: string[]
}

export interface Task extends TaskDraft {
  id: string
  recurrence?: { seriesId: string; origin: string; version: number; rule?: RepeatRule }
}

export interface ScheduleBreak {
  id: string
  kind: 'break'
  date: string
  startTime: string
  duration: number
}

export type ScheduleEntry = Task | ScheduleBreak

export function isBreak(entry: ScheduleEntry): entry is ScheduleBreak {
  return 'kind' in entry && entry.kind === 'break'
}

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === 'string' && Object.hasOwn(taskTypes, value)
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && Object.hasOwn(taskStatuses, value)
}

function hasValidStart(entry: Partial<Pick<ScheduleEntry, 'date' | 'startTime'>>): boolean {
  return typeof entry.date === 'string' && parseDate(entry.date) !== null
    && isTime(entry.startTime)
}

export function isPositiveDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<Task>
  return typeof task.id === 'string'
    && typeof task.title === 'string' && task.title.trim().length > 0
    && typeof task.description === 'string'
    && isTaskType(task.type)
    && hasValidStart(task)
    && (task.duration === null || isPositiveDuration(task.duration))
    && (task.pinned === undefined || typeof task.pinned === 'boolean')
    && (task.plannerReasons === undefined || Array.isArray(task.plannerReasons) && task.plannerReasons.every(reason => typeof reason === 'string'))
    && isTaskStatus(task.status)
}

export function isScheduleEntry(value: unknown): value is ScheduleEntry {
  if (!value || typeof value !== 'object') return false
  if ('kind' in value && value.kind === 'break') {
    const entry = value as Partial<ScheduleBreak>
    return typeof entry.id === 'string' && hasValidStart(entry) && isPositiveDuration(entry.duration)
  }
  return isTask(value)
}

export function matchesScope(task: Task, scope: TaskScope, today: string): boolean {
  switch (scope) {
    case 'today': return task.date === today
    case 'upcoming': return task.date > today && task.status !== 'completed'
    case 'inProgress': return task.status === 'inProgress'
    case 'completed': return task.status === 'completed'
    case 'all': return true
  }
}

export function compareByDate(a: Task, b: Task): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
}

export function formatTaskRange(startTime: string, duration: number | null): string {
  if (!startTime) return 'Время не назначено'
  if (duration === null) return startTime
  const total = timeToMinute(startTime) + duration % minutesPerDay
  const days = Math.floor(duration / minutesPerDay) + Math.floor(total / minutesPerDay)
  return startTime + '–' + minuteToTime(total % minutesPerDay)
    + nextDaySuffix(days)
}
