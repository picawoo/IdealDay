import { taskReminderId } from './model.ts'
import type { Notice } from './model.ts'
import type { Task } from '../tasks/model.ts'

export function isExpiredNotice(notice: Notice, tasks: ReadonlyMap<string, Task>, cutoff: number,
  finishedAt: (id: string) => number | undefined, tasksReadable: boolean) {
  if (notice.kind === 'cycle') return notice.createdAt <= cutoff
  if (!tasksReadable) return false
  const task = tasks.get(notice.taskId)
  if (task && task.status !== 'completed') {
    return taskReminderId(task) !== notice.id && notice.createdAt <= cutoff
  }
  return (finishedAt(notice.taskId) ?? notice.createdAt) <= cutoff
}
