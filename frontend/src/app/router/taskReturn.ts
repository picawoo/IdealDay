import { paths, taskListLink } from './paths.ts'

const origins = [paths.dashboard, paths.schedule, paths.tasks] as const

export function taskOrigin(value: string | null) {
  if (!value) return undefined
  const [pathname] = value.split('?')
  if (!origins.some(path => path === pathname)) return undefined
  const query = value.slice(pathname.length + 1)
  const params = new URLSearchParams(query).toString()
  return pathname + (params ? '?' + params : '')
}

export interface TaskScroll {
  to: string
  top: number
  left: number
}

export function readTaskScroll(state: unknown, key: 'taskOriginScroll' | 'restoreTaskScroll', to: string): TaskScroll | undefined {
  if (!state || typeof state !== 'object') return
  const value = (state as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object') return
  const { to: target, top, left } = value as Partial<TaskScroll>
  if (target !== to || typeof top !== 'number' || !Number.isFinite(top) || top < 0
    || typeof left !== 'number' || !Number.isFinite(left) || left < 0) return
  return { to, top, left }
}

export function taskDestination(params: URLSearchParams, state: unknown) {
  const origin = taskOrigin(params.get('from'))
  const to = origin ?? taskListLink(params)
  const scroll = origin ? readTaskScroll(state, 'taskOriginScroll', to) : undefined
  const label = to.startsWith(paths.schedule) ? 'Вернуться в расписание'
    : to.startsWith(paths.dashboard) ? 'На главную' : 'К списку задач'
  return { to, label, state: scroll ? { restoreTaskScroll: scroll } : undefined }
}
