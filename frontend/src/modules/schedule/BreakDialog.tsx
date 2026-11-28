import { useState } from 'react'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { TaskDialog } from '../tasks/TaskDialog'
import type { ScheduleBreak } from '../tasks/model'
import { taskRepository, taskWriteError } from '../tasks/taskRepository'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { formatDate } from '../../shared/lib/calendar'
import type { PlanningHours } from '../settings/preferences'
import { entryDate } from './dayPlan'
import { formatTaskRange } from '../tasks/model'
import styles from './Schedule.module.css'

export function BreakDialog({ date, startTime, entry, planning, onClose }: {
  date: string
  startTime: string
  entry?: ScheduleBreak
  planning: PlanningHours
  onClose: () => void
}) {
  const [time, setTime] = useState(startTime)
  const [duration, setDuration] = useState('15')
  const [error, setError] = useState('')
  const { pending, run } = usePendingAction()
  const scheduledDate = entryDate(date, time, planning)

  function save() { void run(async () => {
    try {
      if (entry) await taskRepository.remove(entry.id)
      else await taskRepository.createBreak({ date: scheduledDate, startTime: time, duration: Number(duration) })
      onClose()
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось сохранить изменение перерыва.'))
    }
  }) }

  return (
    <TaskDialog title={entry ? 'Удалить перерыв?' : 'Добавить перерыв'} onClose={() => { if (!pending) onClose() }}>
      <form className={styles.breakForm} inert={pending} onSubmit={(event) => { event.preventDefault(); save() }}>
        {entry ? <p>{formatTaskRange(entry.startTime, entry.duration)}</p> : (
          <>
            <TimePicker label="Время начала" value={time} onChange={setTime} />
            {scheduledDate !== date && <p>{formatDate(scheduledDate, { dateStyle: 'long' })}</p>}
            <label>Длительность, мин. <input type="number" min="1" step="1" required value={duration} onChange={(event) => setDuration(event.currentTarget.value)} /></label>
          </>
        )}
        {error && <p className={styles.conflictLabel} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <button className={styles.button} type="button" onClick={onClose}>Отмена</button>
          <button className={styles.primary} type="submit" disabled={pending}>{entry ? 'Удалить перерыв' : 'Сохранить перерыв'}</button>
        </div>
      </form>
    </TaskDialog>
  )
}
