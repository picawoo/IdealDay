import { Link } from 'react-router'
import { taskPath } from '../../app/router/paths'
import { isBreak, taskStatuses, taskTypes } from '../tasks/model'
import { minuteToTime } from '../tasks/timeIntervals'
import { durationLabel } from './dayPlan'
import type { DaySegment } from './dayPlan'
import type { Task } from '../tasks/model'
import styles from './Schedule.module.css'

export const dragType = 'application/x-ideal-day-task'

export function ScheduleCard({ segment, onMove, onBreak }: {
  segment: DaySegment
  onMove: (task: Task) => void
  onBreak: (id: string) => void
}) {
  const { entry, start, end, conflict } = segment
  const time = minuteToTime(start) + (entry.duration === null ? '' : '–' + minuteToTime(end))
  if (isBreak(entry)) {
    return (
      <button type="button" className={styles.card} data-type="break" data-conflict={conflict} onClick={() => onBreak(entry.id)}>
        <span className={styles.cardHeading}><span className={styles.cardTime}>{time}</span><strong>Перерыв</strong></span>
        <small className={styles.cardDetails}>{durationLabel(end - start)}{conflict && ' · Пересечение'}</small>
      </button>
    )
  }

  const details = entry.duration === null ? 'Длительность не указана'
    : taskTypes[entry.type] + ' · ' + durationLabel(end - start) + ' · ' + taskStatuses[entry.status]
  return (
    <article className={styles.card} data-type={entry.type} data-conflict={conflict}
      title={time + ' · ' + entry.title + ' · ' + details + (conflict ? ' · Пересечение' : '')}>
      <Link className={styles.cardLink} to={taskPath(entry.id)}>
        <span className={styles.cardHeading}><span className={styles.cardTime}>{time}</span><strong>{entry.title}</strong></span>
        <small className={styles.cardDetails}>{details}{conflict && <> · <span className={styles.conflictLabel}>Пересечение</span></>}</small>
      </Link>
      <button
        type="button"
        className={styles.handle}
        draggable
        aria-label={'Перенести: ' + entry.title}
        onClick={() => onMove(entry)}
        onDragStart={(event) => {
          event.dataTransfer.setData(dragType, entry.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >⋮⋮</button>
    </article>
  )
}
