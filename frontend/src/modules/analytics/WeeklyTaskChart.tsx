import { formatDate } from '../../shared/lib/calendar'
import { taskCountLabel } from './model'
import styles from './Analytics.module.css'

export function WeeklyTaskChart({ days, date, onSelect }: {
  days: readonly { date: string; count: number }[]
  date: string
  onSelect: (date: string) => void
}) {
  const max = Math.max(1, ...days.map(({ count }) => count))

  return (
    <div className={styles.chart} role="group" aria-label="Количество задач по дням недели">
      {days.map((day) => {
        const label = `${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${taskCountLabel(day.count)}`

        return (
          <button className={styles.column} key={day.date} type="button" aria-label={label}
            aria-pressed={day.date === date} onClick={() => onSelect(day.date)}>
            <span className={styles.stack} aria-hidden="true">
              <span className={styles.count}>{day.count}</span>
              <span className={styles.bar} style={{ blockSize: day.count / max * 152 }} />
              <span className={styles.tooltip}>{label}</span>
            </span>
            <span className={styles.day} aria-hidden="true">
              {formatDate(day.date, { weekday: 'short' })} {Number(day.date.slice(-2))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
