import type { Task } from './model'
import styles from './Tasks.module.css'

export function TaskMarkers({ task }: { task: Task }) {
  if (!task.recurrence && !task.pinned) return null
  return <span className={styles.taskMarkers} data-type={task.type}>
    {task.recurrence && <span title="Повторяющаяся задача" role="img" aria-label="Повторяющаяся задача">↻</span>}
    {task.pinned && <span title="Время закреплено" role="img" aria-label="Время закреплено" className={styles.markerLock} />}
  </span>
}
