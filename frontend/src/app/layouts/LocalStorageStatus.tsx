import { useState, useSyncExternalStore } from 'react'
import { notificationRepository } from '../../modules/notifications/notificationRepository'
import { TaskDialog } from '../../modules/tasks/TaskDialog'
import controls from '../../modules/tasks/Tasks.module.css'
import { taskRepository } from '../../modules/tasks/taskRepository'
import styles from './AppLayout.module.css'

const messages = {
  legacy: 'Старая вкладка изменила задачи. Запись приостановлена. Сохраните открытый черновик в старой вкладке, затем закройте или обновите её. После этого восстановите правки здесь.',
  partial: 'Часть записей повреждена. Доступные записи отображаются. Перед изменениями исходные данные будут сохранены копией.',
  invalid: 'Формат локальных данных не распознан. Изменения заблокированы, исходные данные сохранены.',
  unavailable: 'Браузер не предоставил доступ к локальному хранилищу. Проверьте разрешения сайта.',
  quota: 'Локальное хранилище заполнено. Изменение не сохранено.',
  write: 'Не удалось записать изменение в локальное хранилище. Попробуйте снова.',
}

export function LocalStorageStatus() {
  const tasks = useSyncExternalStore(taskRepository.subscribe, taskRepository.readIssue)
  const notifications = useSyncExternalStore(notificationRepository.subscribe, notificationRepository.readIssue)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  async function recover() {
    setPending(true)
    try { await taskRepository.recoverLegacy(); setError('') }
    catch { setError('Автоматическое восстановление остановлено: версии пересекаются или данные повреждены. Скачайте обе версии, чтобы сохранить и сверить изменения.') }
    finally { setPending(false) }
  }
  async function defer() {
    setPending(true)
    try { await taskRepository.deferLegacy(); setConfirm(false); setError('') }
    catch { setError('Не удалось отложить старые правки. Обе версии остаются в хранилище.') }
    finally { setPending(false) }
  }
  function download() {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(taskRepository.backup(), null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'ideal-day-schedule-recovery.json'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Не удалось прочитать данные для резервной копии.') }
  }
  if (!tasks && !notifications) return null

  return (
    <div className={styles.storageStatus} role="status">
      {tasks && <p><strong>Задачи.</strong> {messages[tasks]}</p>}
      {tasks === 'legacy' && <div className={styles.storageActions}>
        <button type="button" disabled={pending} onClick={() => { void recover() }}>Восстановить совместимые правки</button>
        <button type="button" onClick={download}>Скачать обе версии</button>
        {error && <><p role="alert">{error}</p><button type="button" onClick={() => setConfirm(true)}>Отложить старые правки</button></>}
        {confirm && <TaskDialog title="Продолжить с текущим расписанием?" onClose={() => { if (!pending) setConfirm(false) }}>
          <p>Старые правки сохранятся в резервной копии. Текущее расписание останется доступным для редактирования. Скачайте обе версии, если хотите сверить записи вручную.</p>
          <div className={controls.dialogActions}>
            <button type="button" className={controls.secondary} disabled={pending} onClick={() => setConfirm(false)}>Отмена</button>
            <button type="button" className={controls.primary} disabled={pending} onClick={() => { void defer() }}>Отложить и продолжить</button>
          </div>
        </TaskDialog>}
      </div>}
      {notifications && <p><strong>Уведомления.</strong> {messages[notifications]}</p>}
    </div>
  )
}
