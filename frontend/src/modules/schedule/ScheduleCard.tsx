import { TaskOriginLink } from '../../app/router/TaskOriginLink'
import { TaskMarkers } from '../tasks/TaskMarkers'
import { isBreak, taskStatuses, taskTypes } from '../tasks/model'
import { durationLabel, timelineTime } from './dayPlan'
import type { DaySegment } from './dayPlan'
import type { Task } from '../tasks/model'
import styles from './Schedule.module.css'

export const dragType = 'application/x-ideal-day-task'

export function ScheduleCard({ segment, taskOrigin, onMove, onBreak }: {
  segment: DaySegment
  taskOrigin: string
  onMove: (task: Task) => void
  onBreak: (id: string) => void
}) {
  const { entry, start, end, conflict } = segment
  const time = timelineTime(start) + (entry.duration === null ? '' : '–' + timelineTime(end))
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
      <TaskOriginLink className={styles.cardLink} id={entry.id} origin={taskOrigin}>
        <span className={styles.cardHeading}><span className={styles.cardTime}>{time}</span><span className={styles.cardTitle}><strong>{entry.title}</strong><TaskMarkers task={entry} /></span></span>
        <small className={styles.cardDetails}>{details}{conflict && <> · <span className={styles.conflictLabel}>Пересечение</span></>}</small>
      </TaskOriginLink>
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
