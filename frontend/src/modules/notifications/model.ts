import type { Cycle } from '../biorhythms/model'
import type { Task } from '../tasks/model'

interface NotificationEntry {
  id: string
  createdAt: number
  read: boolean
}

export interface TaskReminder extends NotificationEntry {
  kind: 'task'
  taskId: string
  title: string
  startTime: string
  onTime: boolean
}

export interface CycleNotice extends NotificationEntry {
  kind: 'cycle'
  date: string
  cycle: Cycle['id']
}

export type Notice = TaskReminder | CycleNotice

export function taskReminderId({ id, date, startTime }: Pick<Task, 'id' | 'date' | 'startTime'>) {
  return JSON.stringify(['task', id, date, startTime])
}
