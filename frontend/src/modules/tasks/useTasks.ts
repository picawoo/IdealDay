import { useSyncExternalStore } from 'react'
import { taskRepository } from './taskRepository'
import { isBreak } from './model'
import type { Task } from './model'

export function useTasks() {
  return useScheduleEntries().filter((entry): entry is Task => !isBreak(entry))
}

export function useScheduleEntries() {
  return useSyncExternalStore(taskRepository.subscribe, taskRepository.read)
}
