import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TaskOriginLink } from '../../app/router/TaskOriginLink'
import { paths } from '../../app/router/paths'
import { addDays, dateInTimeZone, dateRange, formatDate, parseDate, startOfWeek } from '../../shared/lib/calendar'
import { getDayTransitions, transitionLabels, upcomingTransitions } from '../biorhythms/model'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { usePreferences } from '../settings/usePreferences'
import { TaskMarkers } from '../tasks/TaskMarkers'
import { isBreak } from '../tasks/model'
import { minutesPerDay } from '../tasks/timeIntervals'
import type { ScheduleBreak, Task } from '../tasks/model'
import { taskRepository, taskWriteError } from '../tasks/taskRepository'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { TaskTimeDialog } from '../tasks/TaskTimeDialog'
import { useScheduleEntries } from '../tasks/useTasks'
import { PlannerDialog } from '../planner/PlannerDialog'
import { LoadRecommendations } from '../planner/LoadRecommendations'
import { BreakDialog } from './BreakDialog'
import { dateAndTime, durationLabel, entryDate, getDayPlan, planningDate, timelineMoment, timelineRange } from './dayPlan'
import { DayTimeline, WeekCalendar } from './ScheduleViews'
import styles from './Schedule.module.css'

type View = 'day' | 'week'
type Modal = { type: 'move'; task: Task; date: string; time: string } | { type: 'break'; entry?: ScheduleBreak }

export function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const { profile, timeZone, planning } = usePreferences()
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const { pending, run } = usePendingAction()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const today = dateInTimeZone(new Date(), timeZone)
  const view: View = params.get('view') === 'week' ? 'week' : 'day'
  const localTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date())
  const date = parseDate(params.get('date')) ?? planningDate(today, localTime, planning)
  const first = startOfWeek(date)
  const dates = view === 'day' ? [date] : dateRange(first, 7)
  const entries = useScheduleEntries(dates[0], addDays(dates[dates.length - 1], 1))
  const days = dates.map((day) => ({
    date: day,
    plan: getDayPlan(entries, day, planning),
    unscheduled: entries.filter((entry): entry is Task => !isBreak(entry) && !entry.startTime && entry.date === day),
    critical: getDayTransitions(profile.birthDate, day).count > 0,
  }))
  const selected = days.find((day) => day.date === date) ?? days[0]
  const plan = selected.plan
  const { unscheduled } = selected
  const breakStart = plan.free[0] ? dateAndTime(date, plan.free[0].start) : { date, time: planning.wakeTime }
  const longDate = formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, '')
  const shortDate = formatDate(date, { day: 'numeric', month: 'long' })
  const last = addDays(first, 6)
  const sameMonth = first.slice(0, 7) === last.slice(0, 7)
  const fromLabel = formatDate(first, sameMonth ? { day: 'numeric' } : {
    day: 'numeric', month: 'short', year: first.slice(0, 4) !== last.slice(0, 4) ? 'numeric' : undefined,
  })
  const weekLabel = fromLabel + (sameMonth ? '–' : ' — ') + formatDate(last, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, '')
  const hasConflicts = days.some((day) => day.plan.entries.some(({ conflict }) => conflict))
  const followingTransition = view === 'day' ? upcomingTransitions(profile.birthDate, date)[0] : undefined

  function select(nextDate: string, nextView = view) {
    if (!parseDate(nextDate)) return
    setNotice('')
    setParams({ date: nextDate, view: nextView })
  }

  function close() {
    setModal(null)
    setError('')
  }

  function openMove(task: Task, nextDate = task.date, nextTime = task.startTime) {
    setError('')
    setModal({ type: 'move', task, date: nextDate, time: nextTime })
  }

  function drop(id: string, nextDate: string, minute?: number) {
    const task = entries.find((entry) => entry.id === id)
    if (!task || isBreak(task)) return
    const target = minute === undefined ? { date: entryDate(nextDate, task.startTime, planning), time: task.startTime } : dateAndTime(nextDate, minute)
    openMove(task, target.date, target.time)
  }

  function move(task: Task, nextDate: string, startTime: string) { void run(async () => {
    try {
      await taskRepository.update(task.id, { date: nextDate, startTime }, task.recurrence?.version)
      close()
      select(planningDate(nextDate, startTime, planning))
      setNotice('Задача перенесена. Свободные окна и загрузка пересчитаны.')
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось сохранить перенос.'))
    }
  }) }

  function openBreak(id: string) {
    const entry = entries.find((value) => value.id === id)
    if (entry && isBreak(entry)) setModal({ type: 'break', entry })
  }

  const taskOrigin = paths.schedule + '?' + new URLSearchParams({ ...Object.fromEntries(params), date, view })
  const actions = { taskOrigin, onMove: openMove, onBreak: openBreak, onDropTask: drop }

  return (
    <div className={styles.page}>
      <RhythmHeader
        title={view === 'day' ? 'Расписание дня' : 'Ваша неделя'}
        subtitle={view === 'day' ? formatDate(date, { weekday: 'long' }) + ', ' + longDate : weekLabel + ' · 7 дней в вашем ритме'}
        backTo={paths.dashboard + '?date=' + date}
      />
      <div className={view === 'day' ? styles.dayLayout : styles.weekLayout}>
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.arrows}>
              <button type="button" className={styles.dateArrow} data-direction="previous"
                aria-label={view === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}
                onClick={() => select(addDays(date, view === 'day' ? -1 : -7))} />
              <DatePicker timeZone={timeZone} label="Выбрать дату" value={date} onChange={select} variant="toolbar"
                displayValue={view === 'day' ? shortDate + ', ' + formatDate(date, { weekday: 'long' }) : weekLabel} />
              <button type="button" className={styles.dateArrow} data-direction="next"
                aria-label={view === 'day' ? 'Следующий день' : 'Следующая неделя'}
                onClick={() => select(addDays(date, view === 'day' ? 1 : 7))} />
            </div>
            <div className={styles.switch} role="group" aria-label="Вид расписания">
              <button type="button" className={styles.button} aria-pressed={view === 'day'} onClick={() => select(date, 'day')}>День</button>
              <button type="button" className={styles.button} aria-pressed={view === 'week'} onClick={() => select(date, 'week')}>Неделя</button>
            </div>
          </div>
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          {hasConflicts && <p role="status" className={styles.conflict}>В расписании есть пересечения. Отмеченные интервалы можно скорректировать вручную.</p>}
          {view === 'day' ? <DayTimeline day={selected} {...actions} />
            : <WeekCalendar days={days} selectedDate={date} today={today} onSelectDay={(value) => select(value, 'day')} {...actions} />}
        </section>
        {
          <aside className={styles.summary}>
            <h2>{date === today ? 'Сегодня' : shortDate}</h2>
            <dl>
              <div><dt>Задач</dt><dd>{plan.taskCount + unscheduled.length}</dd></div>
              <div><dt>Занято задачами</dt><dd>{durationLabel(plan.taskMinutes)}</dd></div>
              <div><dt>Свободно{plan.window.end < minutesPerDay && ', ' + timelineRange(plan.window.start, plan.window.end)}</dt><dd>{durationLabel(plan.freeMinutes)}</dd></div>
            </dl>
            <section className={styles.smartPlan}>
              <h3><span aria-hidden="true">✧</span> Ваш идеальный день</h3>
              <p>Подберите удобное время для задач с учётом ваших предпочтений и хронотипа.</p>
              {view === 'week' && <p>План на {shortDate}</p>}
              <button className={styles.primary} type="button" onClick={() => setPlannerOpen(true)}>Составить план дня</button>
            </section>
            {unscheduled.length > 0 && <section className={styles.tip}>
              <h3>Время не назначено</h3>
              <ul>{unscheduled.map(task => <li key={task.id}><TaskOriginLink id={task.id} origin={taskOrigin}>{task.title}</TaskOriginLink> <TaskMarkers task={task} /></li>)}</ul>
            </section>}
            {plan.window.end >= minutesPerDay && <p className={styles.muted}>До {timelineMoment(plan.window.end)}</p>}
            <LoadRecommendations plan={plan} date={date} />
            <Link className={styles.secondary} to={paths.taskNew + '?date=' + date}>+ Добавить задачу</Link>
            <button type="button" className={styles.secondary} onClick={() => setModal({ type: 'break' })}>+ Добавить перерыв</button>
            {followingTransition && (
              <section className={styles.transition}>
                <h3>{formatDate(followingTransition.date, { day: 'numeric', month: 'long' })}</h3>
                <p>{transitionLabels[followingTransition.count]} · {followingTransition.cycles.map(cycle => cycle.label).join(', ')}.</p>
              </section>
            )}
          </aside>
        }
      </div>
      {plannerOpen && <PlannerDialog date={date} onClose={() => setPlannerOpen(false)} onApplied={() => setNotice('План дня применён.')} />}
      {modal?.type === 'move' && (
        <TaskTimeDialog date={modal.date} startTime={modal.time} duration={modal.task.duration} error={error} pending={pending}
          onClose={close} onConfirm={(time, day) => move(modal.task, day, time)} />
      )}
      {modal?.type === 'break' && (
        <BreakDialog date={date} planning={planning} startTime={breakStart.time} entry={modal.entry} onClose={close} />
      )}
    </div>
  )
}
