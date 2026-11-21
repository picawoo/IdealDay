import { useState } from 'react'
import { usePreferences } from '../settings/usePreferences'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { formatTaskRange, isPositiveDuration } from './model'
import { TaskDialog } from './TaskDialog'
import { isTime } from './timeIntervals'
import styles from './Tasks.module.css'

export function TaskTimeDialog({ startTime, date, duration, onConfirm, onClose, error, pending }: {
  startTime: string
  date?: string
  duration: number | null
  onConfirm: (time: string, date: string) => void
  onClose: () => void
  error?: string
  pending?: boolean
}) {
  const { timeZone } = usePreferences()
  const [time, setTime] = useState(startTime)
  const [day, setDay] = useState(date ?? '')
  const [validation, setValidation] = useState('')

  return (
    <TaskDialog title="Выберите новое время" onClose={() => { if (!pending) onClose() }}>
      <form className={styles.dialogForm} inert={pending} onSubmit={(event) => {
        event.preventDefault()
        if (isTime(time)) onConfirm(time, day)
        else setValidation('Выберите время начала задачи.')
      }}>
        <p>{duration === null ? 'Длительность не указана.' : 'Длительность задачи сохраняется.'}</p>
        {date && <DatePicker timeZone={timeZone} label="Дата" value={day} onChange={setDay} />}
        <TimePicker label="Время начала" value={time} onChange={(value) => { setTime(value); setValidation('') }} />
        {time && (duration === null || isPositiveDuration(duration)) && (
          <p className={styles.interval}>{formatTaskRange(time, duration)}</p>
        )}
        {(validation || error) && <p className={styles.error} role="alert">{validation || error}</p>}
        <div className={styles.dialogActions}>
          <button className={styles.button} type="button" onClick={onClose}>Отмена</button>
          <button className={styles.primary} type="submit" disabled={pending}>Подтвердить перенос</button>
        </div>
      </form>
    </TaskDialog>
  )
}
