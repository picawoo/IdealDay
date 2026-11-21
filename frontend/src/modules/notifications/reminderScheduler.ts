import { addDays, dateInTimeZone } from '../../shared/lib/calendar'
import { getDayTransitions } from '../biorhythms/model'
import { defaultSettings, defaultTimeZone } from '../settings/preferences'
import { preferencesRepository } from '../settings/preferencesRepository'
import { isBreak } from '../tasks/model'
import { taskRepository, tasksStorageLock } from '../tasks/taskRepository'
import { withStorageLock } from '../../shared/lib/storageLock'
import { taskActivity } from '../tasks/taskActivity'
import type { Task } from '../tasks/model'
import { isTime } from '../tasks/timeIntervals'
import { taskReminderId } from './model'
import type { Notice } from './model'
import { notificationRepository } from './notificationRepository'
import { isExpiredNotice } from './retention'
import { showSystemReminder } from './systemNotifications'
import { instantForLocalTime } from './zonedTime'

const minute = 60_000
const advance = 15 * minute

async function reconcile(now: number) {
  const { profile, planner, settings = defaultSettings, timeZone = defaultTimeZone } = preferencesRepository.read()
  const today = dateInTimeZone(new Date(now), timeZone)
  const cutoff = now - (settings.notificationDays ?? 2) * 1440 * minute
  await withStorageLock(tasksStorageLock, () => {
    const tasks = new Map<string, Task>()
    for (const item of notificationRepository.read()) if (item.kind === 'task') {
      const task = taskRepository.lookup(item.taskId)
      if (task && !isBreak(task)) tasks.set(task.id, task)
    }
    const readable = !taskRepository.readIssue()
    return notificationRepository.prune(item => isExpiredNotice(item, tasks, cutoff, taskActivity.finishedAt, readable))
  }).catch(() => undefined)
  const known = new Set(notificationRepository.read().map(({ id }) => id))
  const pending: Notice[] = []
  let nextCheck = now + minute

  if (settings.taskReminders) {
    for (const task of taskRepository.query(today, addDays(today, 1))) {
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

  if (settings.cycleTransitions) {
    const day = getDayTransitions(profile?.birthDate ?? planner?.birthDate, today)
    const first = day.cycles[0]
    const id = JSON.stringify(['cycle-day', today])
    const alreadyShown = notificationRepository.read().some(item => item.kind === 'cycle' && item.date === today)
    if (first && !known.has(id) && !alreadyShown) {
      pending.push({ kind: 'cycle', id, createdAt: now, read: false, date: today, cycle: first.id, dayCycles: day.cycles.map(cycle => cycle.id) })
    }
  }

  const added = pending.length ? await withStorageLock(tasksStorageLock, () => notificationRepository.append(pending.filter(item => {
    if (item.kind === 'cycle') return true
    const task = taskRepository.lookup(item.taskId)
    return task && !isBreak(task) && task.status !== 'completed' && taskReminderId(task) === item.id
  }))) : []
  for (const item of added) {
    if (item.kind === 'task') showSystemReminder(item)
  }
  return nextCheck
}

export function startReminderScheduler() {
  let stopped = false
  let running = false
  let queued = false
  let timer: number | undefined

  function checkAgain(at: number) {
    window.clearTimeout(timer)
    if (!stopped) timer = window.setTimeout(run, Math.max(0, at - Date.now()))
  }

  function run() {
    if (stopped) return
    if (running) { queued = true; return }
    running = true
    void reconcile(Date.now()).then(checkAgain, () => checkAgain(Date.now() + minute)).finally(() => {
      running = false
      if (queued) { queued = false; run() }
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
