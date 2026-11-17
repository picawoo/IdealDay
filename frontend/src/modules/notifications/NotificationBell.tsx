import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { paths, taskPath } from '../../app/router/paths'
import bellIcon from '../../assets/icons/bell.svg'
import { dateInTimeZone, formatDate } from '../../shared/lib/calendar'
import { cycles } from '../biorhythms/model'
import { usePreferences } from '../settings/usePreferences'
import { taskActivity } from '../tasks/taskActivity'
import { TaskDialog } from '../tasks/TaskDialog'
import { useTasks } from '../tasks/useTasks'
import { notificationRepository } from './notificationRepository'
import { orderNotifications } from './orderNotifications'
import { minuteMs, taskReminderLabel } from './taskReminderLabel'
import styles from './Notifications.module.css'

function timestampLabel(timestamp: number, timeZone: string, today: string) {
  const date = dateInTimeZone(new Date(timestamp), timeZone)
  const label = date === today ? 'Сегодня' : formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(timestamp)
  return `${label}, ${time}`
}

function NotificationDialog({ onClose }: { onClose: () => void }) {
  const items = useSyncExternalStore(notificationRepository.subscribe, notificationRepository.read)
  const entries = useTasks()
  useSyncExternalStore(taskActivity.subscribe, taskActivity.revision)
  const { timeZone } = usePreferences()
  const [now, setNow] = useState(Date.now)
  const today = dateInTimeZone(new Date(now), timeZone)
  const rows = orderNotifications(items, new Map(entries.map((task) => [task.id, task])), now, timeZone)

  useEffect(() => {
    let timer: number
    function refresh() {
      window.clearTimeout(timer)
      const current = Date.now()
      setNow(current)
      timer = window.setTimeout(refresh, minuteMs - (current % minuteMs))
    }

    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    if (items.some(({ read }) => !read)) void notificationRepository.markAllRead().catch(() => undefined)
  }, [items])

  return (
    <TaskDialog title="Уведомления" onClose={onClose} className={styles.dialog} hideCloseButton>
      <p>Всё, что помогает не забыть важное.</p>
      {items.length === 0 ? <p role="status">Пока нет уведомлений</p> : (
        <ul className={styles.history} aria-label="История уведомлений" tabIndex={0}>
          {rows.map((row) => (
            <li key={row.item.id} className={styles.card} data-inactive={row.group === 'inactive' || undefined}>
              {row.group !== 'cycle' ? (
                <>
                  <time className={styles.timestamp} dateTime={new Date(row.item.createdAt).toISOString()}>
                    {timestampLabel(row.item.createdAt, timeZone, today)}
                  </time>
                  <p className={styles.title}>{taskReminderLabel(row.item, row.task, now, row.start)}</p>
                  {!row.task && <p className={styles.detail}>{row.item.title}</p>}
                  {row.task?.status === 'completed' && (
                    <span className={styles.completed}><span aria-hidden="true">✓</span> Выполнено</span>
                  )}
                  {row.task && row.group !== 'inactive' && (
                    <Link className={`${styles.action} ${styles.openTask}`} to={taskPath(row.task.id)} onClick={onClose}>Открыть задачу</Link>
                  )}
                </>
              ) : (
                <>
                  <time className={styles.timestamp} dateTime={row.item.date}>
                    {formatDate(row.item.date, { day: 'numeric', month: 'long' })}
                  </time>
                  <p className={styles.title}>{cycles.find(({ id }) => id === row.item.cycle)?.label} цикл около нуля.</p>
                  <p className={styles.detail}>Это переход математической модели.</p>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link className={styles.action} to={paths.settings} onClick={onClose}>Настроить уведомления</Link>
    </TaskDialog>
  )
}

export function NotificationBell({ className }: { className: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useSyncExternalStore(notificationRepository.subscribe, notificationRepository.read)
  const hasUnread = items.some(({ read }) => !read)

  function close() {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }

  return (
    <>
      <button ref={trigger} className={`${className} ${styles.bell}`} type="button" aria-haspopup="dialog"
        aria-expanded={open} aria-label={hasUnread ? 'Уведомления, есть непрочитанные' : 'Уведомления'} onClick={() => setOpen(true)}>
        <img src={bellIcon} alt="" width="22" height="22" />
        {hasUnread && <span className={styles.unread} aria-hidden="true" />}
      </button>
      {open && <NotificationDialog onClose={close} />}
    </>
  )
}
