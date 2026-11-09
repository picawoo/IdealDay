import { addDays, dateRange, daysBetween, formatDate, shiftMonth, startOfMonth, startOfWeek } from '../../shared/lib/calendar'
import { cycleOnDate, cycles } from './model'
import type { Period } from './model'
import { CycleLegend } from './RhythmChart'
import { PeriodSwitch } from './RhythmControls'
import styles from './Rhythm.module.css'

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function RhythmCalendar({ date, period, birthDate, onDate, onPeriod }: {
  date: string
  birthDate: string
  period: Period
  onDate: (date: string) => void
  onPeriod: (period: Period) => void
}) {
  const monthStart = startOfMonth(date)
  const first = startOfWeek(period === 'month' ? monthStart : date)
  const nextMonth = shiftMonth(monthStart, 1)
  const lastMonthDay = addDays(nextMonth, -1)
  const calendarDays = period === 'week' ? 7 : daysBetween(first, startOfWeek(lastMonthDay)) + 7
  const dates = dateRange(first, calendarDays)
  const month = formatDate(date, { month: 'long', year: 'numeric' }).replace(/ г\.$/, '')
  const shortDay = (day: string) => formatDate(day, { day: 'numeric', month: 'short' })
  const heading = period === 'month' ? month : shortDay(first) + ' — ' + shortDay(dates[6])

  function move(direction: number) {
    onDate(period === 'month' ? shiftMonth(date, direction) : addDays(date, direction * 7))
  }

  return (
    <section className={styles.calendar} aria-label="Календарь ритмов">
      <div className={styles.chartHeader}>
        <div className={styles.calendarNavigation}>
          <button type="button" onClick={() => move(-1)} aria-label="Предыдущий период">‹</button>
          <h2>{heading}</h2>
          <button type="button" onClick={() => move(1)} aria-label="Следующий период">›</button>
        </div>
        <PeriodSwitch period={period} onChange={onPeriod} />
      </div>
      <div className={styles.calendarGrid}>
        {weekdays.map((day) => <span key={day} className={styles.weekday}>{day}</span>)}
        {dates.map((day) => {
          const readings = cycles.map((cycle) => cycleOnDate(birthDate, day, cycle))
          const marks = readings.filter((cycle) => cycle.critical || cycle.percent === 100)
          const otherMonth = period === 'month' && (day < monthStart || day >= nextMonth)
          return (
            <button
              key={day}
              type="button"
              className={styles.calendarDay}
              data-outside={otherMonth}
              data-critical={readings.some((cycle) => cycle.critical)}
              aria-pressed={day === date}
              aria-label={[formatDate(day, { dateStyle: 'long' }), ...marks.map((mark) => mark.label + ' · ' + (mark.critical ? 'переход' : 'пик'))].join(', ')}
              onClick={() => onDate(day)}
            >
              <span>{Number(day.slice(-2))}</span>
              {marks.map((mark) => <small key={mark.id} data-cycle={mark.id}>{mark.critical ? '△ переход' : '↑ пик'}</small>)}
            </button>
          )
        })}
      </div>
      <div className={styles.calendarLegend}><CycleLegend /><span>△ Переход</span><span>↑ Пик</span></div>
    </section>
  )
}
