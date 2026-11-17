import { taskPath } from '../../app/router/paths'
import type { TaskReminder } from './model'

const storageKey = 'ideal-day.system-notifications.v1'

export function systemPermission(): NotificationPermission | 'unsupported' {
  return window.isSecureContext && typeof window.Notification === 'function'
    ? window.Notification.permission
    : 'unsupported'
}

export function systemNotificationsEnabled() {
  try {
    return window.localStorage.getItem(storageKey) === 'true'
  } catch {
    return false
  }
}

export function setSystemNotificationsEnabled(value: boolean) {
  if (value) window.localStorage.setItem(storageKey, 'true')
  else window.localStorage.removeItem(storageKey)
}

export function reminderText(item: TaskReminder) {
  return item.onTime ? `Через 15 минут: ${item.title}` : `Начало в ${item.startTime}: ${item.title}`
}

export function showSystemReminder(item: TaskReminder) {
  if (!systemNotificationsEnabled() || systemPermission() !== 'granted') return
  try {
    const notification = new Notification('Идеальный День', { body: reminderText(item), tag: item.id })
    notification.onclick = () => {
      window.focus()
      window.location.assign(taskPath(item.taskId))
    }
  } catch {
    // The reminder is already available in the in-app history.
  }
}
