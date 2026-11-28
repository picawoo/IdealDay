import { useMemo, useSyncExternalStore } from 'react'
import { taskRepository } from './taskRepository'
import { lookup, project } from './recurrence'
import { isBreak } from './model'
import type { Task } from './model'

export function useTaskRecords() {
  return useSyncExternalStore(taskRepository.subscribe, taskRepository.read)
}

export function useTask(id?: string) {
  const records = useTaskRecords()
  const entry = id && lookup(records, id)
  return entry && !isBreak(entry) ? entry : undefined
}

export function useTasks(from: string, through: string) {
  const records = useTaskRecords()
  return useMemo(() => {
    const singles = records.filter((entry): entry is Task => 'title' in entry)
    const recurring = project(records, from, through, true).filter((entry): entry is Task => !isBreak(entry) && !!entry.recurrence)
    return [...singles, ...recurring]
  }, [records, from, through])
}

export function useScheduleEntries(from: string, through = from) {
  const records = useTaskRecords()
  return useMemo(() => project(records, from, through), [records, from, through])
}
