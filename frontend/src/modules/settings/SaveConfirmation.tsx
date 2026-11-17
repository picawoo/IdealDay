import { TaskDialog } from '../tasks/TaskDialog'
import styles from './Preferences.module.css'

export function SaveConfirmation({ title, onClose }: {
  title: string
  onClose: () => void
}) {
  return (
    <TaskDialog title={title} onClose={onClose} compact>
      <button className={styles.primary} type="button" onClick={onClose}>ОК</button>
    </TaskDialog>
  )
}
