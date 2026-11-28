import { useState } from 'react'
import { TaskDialog } from './TaskDialog'
import type { Scope } from './recurrence'
import styles from './Tasks.module.css'

const choices: { id: Scope; label: string }[] = [
  { id: 'one', label: 'Только эта задача' }, { id: 'following', label: 'Эта и все последующие' }, { id: 'all', label: 'Вся серия' },
]

export function RecurrenceScopeDialog({ action, pending, error, close, confirm, ruleChanged = false, onlyOne = false, detach = false, affected = [] }: {
  action: 'edit' | 'delete'; pending: boolean; error: string; close: () => void; confirm: (scope: Scope) => void
  ruleChanged?: boolean; onlyOne?: boolean; detach?: boolean; affected?: string[]
}) {
  const [scope, setScope] = useState<Scope>(ruleChanged ? 'following' : 'one')
  return <TaskDialog title={action === 'edit' ? 'Какие задачи изменить?' : 'Какие задачи удалить?'} onClose={() => { if (!pending) close() }}>
    <div className={styles.recurrence} role="group" aria-label="Область изменения">
      {choices.map(({ id, label }) => <button key={id} className={styles.secondary} type="button" aria-pressed={scope === id}
        disabled={pending || ruleChanged && id === 'one' || onlyOne && id !== 'one'} onClick={() => setScope(id)}>{label}</button>)}
    </div>
    {detach && <p>Выбранная задача станет обычной. Область изменения определяет, какие повторы будут отключены.</p>}
    {action === 'edit' && !detach && scope !== 'one' && <p>Дата отдельного экземпляра меняется действием «Только эта задача».</p>}
    {scope !== 'one' && <p>Выполненные экземпляры останутся в истории.</p>}
    {scope !== 'one' && affected.length > 0 && <p>Затронутые ручные назначения: {affected.join(', ')}.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.dialogActions}>
      <button className={styles.button} type="button" disabled={pending} onClick={close}>Отмена</button>
      <button className={action === 'delete' ? styles.danger : styles.primary} type="button" disabled={pending}
        onClick={() => confirm(scope)}>{action === 'delete' ? 'Удалить' : 'Сохранить изменения'}</button>
    </div>
  </TaskDialog>
}
