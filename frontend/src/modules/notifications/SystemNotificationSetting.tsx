import { useEffect, useState } from 'react'
import { setSystemNotificationsEnabled, systemNotificationsEnabled, systemPermission } from './systemNotifications'
import styles from './Notifications.module.css'

export function SystemNotificationSetting({ buttonClassName }: { buttonClassName: string }) {
  const [permission, setPermission] = useState(systemPermission)
  const [enabled, setEnabled] = useState(systemNotificationsEnabled)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const active = permission === 'granted' && enabled

  useEffect(() => {
    function refresh() {
      setPermission(systemPermission())
      setEnabled(systemNotificationsEnabled())
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  async function toggle() {
    setPending(true)
    setError('')
    try {
      const current = systemPermission()
      const result = current === 'default' ? await Notification.requestPermission() : current
      if (result === 'granted') {
        setSystemNotificationsEnabled(!active)
        setEnabled(!active)
      }
    } catch {
      setError('Не удалось изменить системные уведомления в этом браузере.')
    } finally {
      setPermission(systemPermission())
      setPending(false)
    }
  }

  return (
    <section className={styles.system} aria-labelledby="system-notifications-title">
      <h3 id="system-notifications-title">Системные уведомления</h3>
      <p>Напоминания о задачах могут появляться на рабочем столе, пока приложение открыто.</p>
      {permission === 'denied' && <p role="status">Разрешение заблокировано. Его можно изменить в настройках сайта в браузере.</p>}
      {permission === 'unsupported' && <p role="status">Системные уведомления недоступны в этом браузере или при этом подключении.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" className={buttonClassName} disabled={pending || permission === 'denied' || permission === 'unsupported'}
        onClick={() => void toggle()}>{active ? 'Выключить системные уведомления' : 'Включить системные уведомления'}</button>
    </section>
  )
}
