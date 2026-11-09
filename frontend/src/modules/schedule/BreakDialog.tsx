import { useState } from 'react'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { TaskDialog } from '../tasks/TaskDialog'
import type { ScheduleBreak } from '../tasks/model'
import { ScheduleConflictError, taskRepository } from '../tasks/taskRepository'
import { formatTaskRange } from '../tasks/model'
import styles from './Schedule.module.css'

export function BreakDialog({ date, startTime, entry, onClose }: {
  date: string
  startTime: string
  entry?: ScheduleBreak
  onClose: () => void
}) {
  const [time, setTime] = useState(startTime)
  const [duration, setDuration] = useState('15')
  const [error, setError] = useState('')

  function save() {
    try {
      if (entry) taskRepository.remove(entry.id)
      else taskRepository.createBreak({ date, startTime: time, duration: Number(duration) })
      onClose()
    } catch (error) {
      setError(error instanceof ScheduleConflictError ? error.message : 'Не удалось сохранить изменение перерыва.')
    }
  }

  return (
    <TaskDialog title={entry ? 'Удалить перерыв?' : 'Добавить перерыв'} onClose={onClose}>
      <form className={styles.breakForm} onSubmit={(event) => { event.preventDefault(); save() }}>
        {entry ? <p>{formatTaskRange(entry.startTime, entry.duration)}</p> : (
          <>
            <TimePicker label="Время начала" value={time} onChange={setTime} />
            <label>Длительность, мин. <input type="number" min="1" step="1" required value={duration} onChange={(event) => setDuration(event.currentTarget.value)} /></label>
          </>
        )}
        {error && <p className={styles.conflictLabel} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button className={styles.button} type="button" onClick={onClose}>Отмена</button>
          <button className={styles.primary} type="submit">{entry ? 'Удалить перерыв' : 'Сохранить перерыв'}</button>
        </div>
      </form>
    </TaskDialog>
  )
}
