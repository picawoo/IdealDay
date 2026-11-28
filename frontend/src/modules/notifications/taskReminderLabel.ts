import type { Task } from '../tasks/model'
import { taskReminderId } from './model'
import type { TaskReminder } from './model'

export const minuteMs = 60_000
const minuteUnits = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'minute', unitDisplay: 'long' })

export function taskReminderLabel(item: TaskReminder, task: Task | undefined, now: number, start: number | null) {
  if (!task) return 'Задача удалена'
  if (task.status === 'completed') return `Задача выполнена: ${task.title}`
  if (taskReminderId(task) !== item.id) return `Задача перенесена: ${task.title}`

  if (start === null) return `Время начала недоступно: ${task.title}`
  const remaining = start - now
  if (remaining <= 0) return `Задача началась: ${task.title}`
  if (remaining <= minuteMs) return `Задача начинается: ${task.title}`
  return `Через ${minuteUnits.format(Math.ceil(remaining / minuteMs))}: ${task.title}`
}
