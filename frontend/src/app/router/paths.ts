export const paths = {
  register: '/register',
  login: '/login',
  onboarding: '/onboarding',
  dashboard: '/dashboard',
  biorhythms: '/biorhythms',
  tasks: '/tasks',
  taskNew: '/tasks/new',
  taskDetail: '/tasks/:taskId',
  taskEdit: '/tasks/:taskId/edit',
  schedule: '/schedule',
  analytics: '/analytics',
  profile: '/profile',
  settings: '/settings',
} as const

export function taskPath(id: string) {
  return paths.tasks + '/' + encodeURIComponent(id)
}

export function taskListLink(params: URLSearchParams) {
  const query = params.get('list')
  return query ? `${paths.tasks}?${new URLSearchParams(query)}` : paths.tasks
}

export function taskListContext(params: URLSearchParams) {
  const list = params.toString()
  return list ? `?${new URLSearchParams({ list })}` : ''
}
