import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { TaskOriginLink } from '../../app/router/TaskOriginLink'
import { paths } from '../../app/router/paths'
import { addDays, dateInTimeZone, formatDate } from '../../shared/lib/calendar'
import { CycleCards } from '../biorhythms/CycleCards'
import { cycleOnDate, cycles, formatPercent, getDayTransitions, transitionLabels } from '../biorhythms/model'
import { RhythmChart } from '../biorhythms/RhythmChart'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { useRhythmDate } from '../biorhythms/useRhythmDate'
import { usePreferences } from '../settings/usePreferences'
import { compareByDate, formatTaskRange, taskStatuses, taskTypes } from '../tasks/model'
import { PlannerDialog } from '../planner/PlannerDialog'
import { LoadRecommendations } from '../planner/LoadRecommendations'
import { getDayPlan } from '../schedule/dayPlan'
import type { Task } from '../tasks/model'
import { isBreak } from '../tasks/model'
import { useScheduleEntries } from '../tasks/useTasks'
import { getDemoPlan } from './demoPlan'
import styles from '../biorhythms/Rhythm.module.css'

export function DashboardPage() {
  const { search } = useLocation()
  const { date, period, setDate, setPeriod } = useRhythmDate('week')
  const { profile, firstName, rhythm, isDemo, timeZone, planning, birthDate } = usePreferences()
  const [plannerOpen, setPlannerOpen] = useState(false)
  const entries = useScheduleEntries(date, addDays(date, 1))
  const plan = getDayPlan(entries, date, planning)
  const readings = cycles.map((cycle) => cycleOnDate(profile.birthDate, date, cycle))
  const transitions = getDayTransitions(profile.birthDate, date)
  const critical = transitions.count > 0
  const demoPlan = getDemoPlan(date)
  const tasks = entries.filter((task): task is Task => !isBreak(task)).filter((task) => task.date === date).sort(compareByDate)
  const taskOrigin = paths.dashboard + '?' + new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), date, period })
  const dayLabel = formatDate(date, { day: 'numeric', month: 'long' })
  const weekday = formatDate(date, { weekday: 'long' })

  return (
    <div className={styles.page}>
      <RhythmHeader
        title={firstName ? 'Доброе утро, ' + firstName : 'Ваш день'}
        subtitle={weekday.charAt(0).toUpperCase() + weekday.slice(1) + (isDemo && !birthDate ? ' · Демонстрационный профиль' : '')}
      >
        <div className={styles.dateNavigation} role="group" aria-label="Выбор дня">
          <button type="button" aria-label="Предыдущий день" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <DatePicker label="Выбрать дату" value={date} timeZone={timeZone} variant="toolbar" onChange={setDate} />
          <button type="button" aria-label="Следующий день" onClick={() => setDate(addDays(date, 1))}>›</button>
          <button type="button" className={styles.softButton} onClick={() => setDate(dateInTimeZone(new Date(), timeZone))}>Сегодня</button>
        </div>
      </RhythmHeader>

      {critical && (
        <section className={styles.criticalNotice} aria-label="Критический день модели">
          <h2>{transitionLabels[transitions.count]} в модели</h2>
          <p>{transitions.cycles.map((cycle) => cycle.label).join(', ')} · переход через ноль.</p>
        </section>
      )}

      <CycleCards birthDate={profile.birthDate} date={date} />

      <div className={styles.dashboardColumns} data-critical={critical}>
        <RhythmChart
          title={critical ? 'Переходы циклов' : 'Ваш ритм'}
          date={date}
          birthDate={profile.birthDate}
          period={period}
          onPeriod={setPeriod}
          onDate={setDate}
        />
        <aside className={critical ? styles.gentleAdvice : styles.advice} aria-label="Рекомендация">
          {!critical && (
            <>
              <span className={styles.focusLabel}>Сегодня в фокусе</span>
              <h2>Важное —<br />{rhythm.headline}</h2>
              <strong>{rhythm.focusWindow}</strong>
              <p>Окно фокуса по вашему хронотипу. Интеллектуальный цикл модели: {formatPercent(readings[2].percent)}.</p>
            </>
          )}
          <LoadRecommendations plan={plan} date={date} />
          <button className={styles.primaryButton} type="button" onClick={() => setPlannerOpen(true)}>Пересобрать мой день</button>
          {!birthDate && <Link className={styles.plainLink} to={paths.onboarding}>Настроить первый план</Link>}
        </aside>
      </div>

      <section className={styles.plan} data-critical={critical} aria-label="Задачи дня">
        <div className={styles.planHeader}>
          <h2>{dayLabel} · Задачи дня</h2>
          <Link className={styles.softButton} to={paths.taskNew + '?date=' + date}>+ Добавить задачу</Link>
          <Link className={styles.plainLink} to={paths.schedule + '?date=' + date}>Расписание →</Link>
        </div>
        <div className={styles.planRows}>
          {tasks.map((task) => (
            <div className={styles.planRow} key={task.id}>
              <TaskOriginLink id={task.id} origin={taskOrigin} className={styles.taskName}>{task.title}</TaskOriginLink>
              <span className={styles.taskCategory} data-category={taskTypes[task.type]}>{taskTypes[task.type]}</span>
              <span>{formatTaskRange(task.startTime, task.duration)}</span>
              <span>{taskStatuses[task.status]}</span>
            </div>
          ))}
          {!tasks.length && <p className={styles.subtitle}>На этот день нет ваших задач.</p>}
        </div>
        {demoPlan.length > 0 && <div className={styles.planRows} role="group" aria-label="Демонстрационные задачи">
          <h3 className={styles.demoPlanHeading}>
            Демонстрационные задачи
            
          </h3>
          {demoPlan.map((task) => (
            <div className={styles.planRow} key={task.title}>
              <span className={styles.taskName}><input type="checkbox" aria-label={task.title} checked={Boolean(task.done)} disabled />{task.title}</span>
              <span className={styles.taskCategory} data-category={task.category}>{task.category}</span>
              <span>{task.time}</span>
              <span>{task.done ? 'Выполнено' : 'Запланировано'}</span>
            </div>
          ))}
        </div>}
      </section>
      {plannerOpen && <PlannerDialog date={date} onClose={() => setPlannerOpen(false)} />}
    </div>
  )
}
