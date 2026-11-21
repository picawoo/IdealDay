import { useRef, useState } from 'react'
import { CalendarDayDetails } from './RhythmCalendarDialogs'
import { addDays, dateRange, daysBetween, formatDate, shiftMonth, startOfMonth, startOfWeek } from '../../shared/lib/calendar'
import { cycleOnDate, cycles, getDayTransitions, transitionLabels } from './model'
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
  const [dialog, setDialog] = useState<string>()
  const trigger = useRef<HTMLButtonElement>(null)
  function close() {
    setDialog(undefined)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  const monthStart = startOfMonth(date)
  const first = startOfWeek(period === 'month' ? monthStart : date)
  const nextMonth = shiftMonth(monthStart, 1)
  const lastMonthDay = addDays(nextMonth, -1)
  const calendarDays = period === 'week' ? 7 : daysBetween(first, startOfWeek(lastMonthDay)) + 7
  const dates = dateRange(first, calendarDays)
  const month = formatDate(date, { month: 'long', year: 'numeric' }).replace(/ г\.$/, '')
  const shortDay = (day: string) => formatDate(day, { day: 'numeric', month: 'short' })
  const heading = period === 'month' ? month : shortDay(first) + ' — ' + shortDay(dates[6])

  const readings = dates.map(day => {
    const values = day < birthDate ? [] : cycles.map(cycle => cycleOnDate(birthDate, day, cycle))
    const { count } = getDayTransitions(birthDate, day, values)
    return { date: day, count, values }
  })
  const selected = readings.find(item => item.date === dialog)

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
        {readings.map(({ date: day, count, values }) => {
          const marks = values.filter(cycle => cycle.critical || cycle.percent === 100)
          const otherMonth = period === 'month' && (day < monthStart || day >= nextMonth)
          return (
            <button
              key={day}
              type="button"
              className={styles.calendarDay}
              data-outside={otherMonth}
              data-critical={count > 0}
              aria-pressed={day === date}
              aria-label={[formatDate(day, { dateStyle: 'long' }), transitionLabels[count], ...marks.map((mark) => mark.label + ' · ' + (mark.critical ? 'переход' : 'пик'))].join(', ')}
              aria-haspopup="dialog"
              onClick={event => { trigger.current = event.currentTarget; setDialog(day) }}
            >
              <span>{Number(day.slice(-2))}</span>
              {marks.map((mark) => <small key={mark.id} data-cycle={mark.id}>{mark.critical ? '△ переход' : '↑ пик'}</small>)}
            </button>
          )
        })}
      </div>
      <div className={styles.calendarLegend}><CycleLegend /><span>△ Переход</span><span>↑ Пик</span></div>
      {selected && <CalendarDayDetails date={selected.date} reads={selected.values} count={selected.count} close={close} />}
    </section>
  )
}
