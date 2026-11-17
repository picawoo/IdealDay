import type { Task } from '../tasks/model'
import { taskActivity } from '../tasks/taskActivity'
import type { CycleNotice, Notice, TaskReminder } from './model'
import { instantForLocalTime } from './zonedTime'

const rank = { upcoming: 0, started: 1, cycle: 2, inactive: 3 } as const

type NotificationRow =
  | { item: CycleNotice; group: 'cycle'; time: number }
  | { item: TaskReminder; group: 'upcoming' | 'started' | 'inactive'; time: number; task: Task | undefined; start: number | null }

export function orderNotifications(items: readonly Notice[], tasks: ReadonlyMap<string, Task>, now: number, timeZone: string) {
  const rows = items.map((item): NotificationRow => {
    if (item.kind === 'cycle') return { item, group: 'cycle', time: Date.parse(item.date) }

    const task = tasks.get(item.taskId)
    if (!task || task.status === 'completed') {
      return { item, task, start: null, group: 'inactive', time: taskActivity.lastChanged(item.taskId) ?? item.createdAt }
    }

    const start = instantForLocalTime(task.date, task.startTime, timeZone)
    const group = start !== null && start > now ? 'upcoming' : 'started'
    return { item, task, start, group, time: start ?? Number.MIN_SAFE_INTEGER }
  })

  // Array.sort is stable, so entries with the same time keep their order in history.
  return rows.sort((a, b) => rank[a.group] - rank[b.group]
    || (a.group === 'upcoming' ? a.time - b.time : b.time - a.time))
}
