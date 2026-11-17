import { dateInTimeZone } from '../../shared/lib/calendar'
import { cycleOnDate, cycles } from '../biorhythms/model'
import { defaultSettings, defaultTimeZone } from '../settings/preferences'
import { preferencesRepository } from '../settings/preferencesRepository'
import { isBreak } from '../tasks/model'
import { taskRepository } from '../tasks/taskRepository'
import { isTime } from '../tasks/timeIntervals'
import { taskReminderId } from './model'
import type { Notice } from './model'
import { notificationRepository, withNotificationLock } from './notificationRepository'
import { showSystemReminder } from './systemNotifications'
import { instantForLocalTime } from './zonedTime'

const minute = 60_000
const advance = 15 * minute

function reconcile(now: number) {
  const { profile, settings = defaultSettings, timeZone = defaultTimeZone } = preferencesRepository.read()
  const today = dateInTimeZone(new Date(now), timeZone)
  const known = new Set(notificationRepository.read().map(({ id }) => id))
  const pending: Notice[] = []
  let nextCheck = now + minute

  if (settings.taskReminders) {
    for (const task of taskRepository.read()) {
      if (isBreak(task) || task.status === 'completed' || !isTime(task.startTime) || task.date < today) continue
      const id = taskReminderId(task)
      if (known.has(id)) continue
      const start = instantForLocalTime(task.date, task.startTime, timeZone)
      if (start === null || start <= now) continue
      const remindAt = start - advance
      if (remindAt > now) {
        nextCheck = Math.min(nextCheck, remindAt)
        continue
      }
      pending.push({
        kind: 'task', id, createdAt: now, read: false, taskId: task.id,
        title: task.title, startTime: task.startTime, onTime: now - remindAt < minute,
      })
    }
  }

  if (settings.cycleTransitions && profile) {
    for (const cycle of cycles) {
      const id = JSON.stringify(['cycle', cycle.id, today])
      if (today >= profile.birthDate && !known.has(id) && cycleOnDate(profile.birthDate, today, cycle).critical) {
        pending.push({ kind: 'cycle', id, createdAt: now, read: false, date: today, cycle: cycle.id })
      }
    }
  }

  notificationRepository.append(pending)
  for (const item of pending) {
    if (item.kind === 'task') showSystemReminder(item)
  }
  return nextCheck
}

export function startReminderScheduler() {
  let stopped = false
  let timer: number | undefined

  function checkAgain(at: number) {
    window.clearTimeout(timer)
    if (!stopped) timer = window.setTimeout(run, Math.max(0, at - Date.now()))
  }

  function run() {
    void withNotificationLock(() => {
      if (!stopped) checkAgain(reconcile(Date.now()))
    }).catch(() => {
      // A failed write leaves the reminder eligible for the next check.
      checkAgain(Date.now() + minute)
    })
  }

  const unsubscribeTasks = taskRepository.subscribe(run)
  const unsubscribePreferences = preferencesRepository.subscribe(run)
  window.addEventListener('focus', run)
  window.addEventListener('pageshow', run)
  document.addEventListener('visibilitychange', run)
  run()

  return () => {
    stopped = true
    window.clearTimeout(timer)
    unsubscribeTasks()
    unsubscribePreferences()
    window.removeEventListener('focus', run)
    window.removeEventListener('pageshow', run)
    document.removeEventListener('visibilitychange', run)
  }
}
