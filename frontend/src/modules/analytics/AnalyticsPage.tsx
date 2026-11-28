import { Link, useSearchParams } from 'react-router'
import { paths } from '../../app/router/paths'
import { addDays, dateInTimeZone, formatDate, parseDate, startOfWeek } from '../../shared/lib/calendar'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { durationLabel, timelineRange } from '../schedule/dayPlan'
import { LoadRecommendations } from '../planner/LoadRecommendations'
import { usePreferences } from '../settings/usePreferences'
import type { TaskType } from '../tasks/model'
import { useScheduleEntries } from '../tasks/useTasks'
import { getAnalytics, taskCountLabel } from './model'
import { WeeklyTaskChart } from './WeeklyTaskChart'
import styles from './Analytics.module.css'

const dayAndMonth = { day: 'numeric', month: 'long' } as const
const taskLabels = {
  intellectual: 'Интеллектуальные', physical: 'Физические', creative: 'Творческие', routine: 'Рутинные',
} satisfies Record<TaskType, string>
const taskTypes = Object.keys(taskLabels) as TaskType[]
const minutesLabel = new Intl.NumberFormat('ru', { style: 'unit', unit: 'minute', unitDisplay: 'long' })
const dates = new Intl.ListFormat('ru')

function weekLabel(start: string, end: string) {
  if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(-2))}–${formatDate(end, dayAndMonth)}`
  const options = start.slice(0, 4) === end.slice(0, 4) ? dayAndMonth : { ...dayAndMonth, year: 'numeric' as const }
  return `${formatDate(start, options)} — ${formatDate(end, options)}`
}

function Observations({ report }: { report: ReturnType<typeof getAnalytics> }) {
  const { busiest, selected } = report
  const day = busiest.length === 1 ? busiest[0] : selected
  const { plan } = day
  const occupancy = Math.round(100 * plan.taskMinutes / (plan.window.end - plan.window.start))
  const count = busiest.length ? taskCountLabel(busiest[0].count) : ''
  const busiestDates = dates.format(busiest.map(({ date }) => formatDate(date, dayAndMonth)))
  const hasDayEntries = plan.entries.length > 0

  return (
    <aside className={styles.observations} aria-labelledby="analytics-observations">
      <h2 id="analytics-observations">Сохраняйте гибкость</h2>
      <p>{busiest.length === 1 ? `Самый плотный день — ${busiestDates}: ${count}.`
        : busiest.length > 1 ? `Больше всего задач (${count}) в эти дни: ${busiestDates}.`
        : 'На этой неделе нет новых стартов задач.'}</p>
      {hasDayEntries && <>
        <p>Период бодрствования с {formatDate(day.date, dayAndMonth)} · {timelineRange(plan.window.start, plan.window.end)}. Занято задачами: {occupancy}%.</p>
        <p>Перерывы: {day.breaks}{day.breaks > 0 && ` · ${durationLabel(day.breakMinutes)}`}. Свободное время: {durationLabel(plan.freeMinutes)}.</p>
      </>}
      <LoadRecommendations plan={selected.plan} date={selected.date} />
      <Link className={styles.openWeek} to={`${paths.schedule}?view=week&date=${selected.date}`}>Открыть неделю →</Link>
    </aside>
  )
}

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams()
  const { timeZone, planning } = usePreferences()
  const date = parseDate(params.get('date')) ?? dateInTimeZone(new Date(), timeZone)
  const entries = useScheduleEntries(startOfWeek(date), addDays(startOfWeek(date), 7))
  const report = getAnalytics(entries, date, planning)
  const { days, selected } = report
  const label = weekLabel(days[0].date, days[6].date)
  const previous = parseDate(addDays(date, -7))
  const next = parseDate(addDays(date, 7))

  function select(value: string | null) {
    if (value) setParams({ date: value })
  }

  return (
    <div className={styles.page}>
      <RhythmHeader title="Аналитика планирования" subtitle="Задачи и нагрузка · Без оценки здоровья" backTo={paths.dashboard} />
      <dl className={styles.metrics} aria-label="Ключевые показатели">
        <div><dt>Задач на неделе</dt><dd>{report.count}</dd></div>
        <div><dt>Запланировано</dt><dd>{durationLabel(report.minutes)}</dd></div>
        <div><dt>Задачи {formatDate(date, dayAndMonth)}</dt><dd>{durationLabel(selected.minutes)}</dd></div>
        <div><dt>Выполнено за неделю</dt><dd>{report.completed} из {report.total}</dd></div>
      </dl>

      <div className={styles.week}>
        <section className={styles.load} aria-labelledby="analytics-week">
          <header className={styles.weekHeader}>
            <h2 id="analytics-week">Загрузка недели · {label}</h2>
            <div className={styles.navigation} role="group" aria-label="Выбор недели">
              <button type="button" className={styles.arrow} aria-label="Предыдущая неделя" disabled={!previous} onClick={() => select(previous)}>‹</button>
              <DatePicker timeZone={timeZone} label="Выбрать дату" value={date} onChange={select} variant="toolbar" displayValue={formatDate(date, { dateStyle: 'short' })} />
              <button type="button" className={styles.arrow} aria-label="Следующая неделя" disabled={!next} onClick={() => select(next)}>›</button>
            </div>
          </header>
          <p>{!report.count && !report.minutes ? 'На этой неделе нет задач.' : 'Столбцы показывают количество задач по дате начала.'}</p>
          <WeeklyTaskChart days={days} date={date} onSelect={select} />
        </section>
        <Observations report={report} />
      </div>

      <section className={styles.distribution} aria-labelledby="analytics-types">
        <h2 id="analytics-types">Разные задачи — разный ритм</h2>
        <dl className={styles.types} aria-label={`Запланированное время по типам задач, ${formatDate(date, dayAndMonth)}`}>
          {taskTypes.map((type) => <div key={type} data-type={type}>
            <dt>{taskLabels[type]}</dt><dd>{minutesLabel.format(selected.minutesByType[type])}</dd>
          </div>)}
        </dl>
        <p>Запланированное время на {formatDate(date, dayAndMonth)}.
          {report.unknownDuration > 0 && ' В суммы времени входят только задачи с указанной длительностью.'}</p>
        <Link className={styles.openTasks} to={paths.tasks}>Перейти к задачам →</Link>
      </section>
    </div>
  )
}
