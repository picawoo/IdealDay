import { useEffect, useState, useSyncExternalStore } from 'react'
import { applyPwaUpdate, readPwaUpdate, subscribeToPwaUpdate } from './pwaRegistration'
import styles from './PwaStatus.module.css'

export function PwaStatus() {
  const update = useSyncExternalStore(subscribeToPwaUpdate, readPwaUpdate)
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [postponed, setPostponed] = useState(false)
  const [draftWarning, setDraftWarning] = useState(false)

  useEffect(() => {
    const refresh = () => setOffline(!navigator.onLine)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    refresh()
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  if (!offline && update === 'idle') return null
  const applying = update === 'applying'

  return (
    <div className={styles.status}>
      {offline && <p className={styles.offline} role="status">Нет подключения к сети</p>}
      {update !== 'idle' && (postponed ? (
        <button type="button" className={styles.later} onClick={() => setPostponed(false)}>Новая версия</button>
      ) : (
        <section className={styles.update} aria-label="Обновление приложения">
          <div>
            <p className={styles.title} role="status">{applying ? 'Обновляем приложение…' : 'Доступна новая версия'}</p>
            {draftWarning && <p className={styles.hint} role="alert">Сохраните или отмените изменения перед обновлением.</p>}
            {update === 'retry' && <p className={styles.hint} role="status">Не удалось применить обновление. Попробуйте ещё раз.</p>}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={applying}
              onClick={() => setDraftWarning(applyPwaUpdate() === 'draft')}>Обновить</button>
            <button type="button" className={styles.secondary} disabled={applying}
              onClick={() => { setDraftWarning(false); setPostponed(true) }}>Позже</button>
          </div>
        </section>
      ))}
    </div>
  )
}
