import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths } from '../../app/router/paths'
import { addDays, dateInTimeZone, dateRange, formatDate, parseDate, startOfWeek } from '../../shared/lib/calendar'
import { cycleOnDate, cycles, upcomingTransitions } from '../biorhythms/model'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { usePreferences } from '../settings/usePreferences'
import { isBreak } from '../tasks/model'
import type { ScheduleBreak, Task } from '../tasks/model'
import { ScheduleConflictError, taskRepository } from '../tasks/taskRepository'
import { TaskTimeDialog } from '../tasks/TaskTimeDialog'
import { minuteToTime } from '../tasks/timeIntervals'
import { useScheduleEntries } from '../tasks/useTasks'
import { BreakDialog } from './BreakDialog'
import { durationLabel, getDayPlan } from './dayPlan'
import { DayTimeline, WeekCalendar } from './ScheduleViews'
import styles from './Schedule.module.css'

type View = 'day' | 'week'
type Modal = { type: 'move'; id: string; date: string; time: string } | { type: 'break'; entry?: ScheduleBreak }

export function SchedulePage() {
  const [params, setParams] = useSearchParams()
  const entries = useScheduleEntries()
  const { profile, timeZone } = usePreferences()
  const [modal, setModal] = useState<Modal | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const today = dateInTimeZone(new Date(), timeZone)
  const date = parseDate(params.get('date')) ?? today
  const view: View = params.get('view') === 'week' ? 'week' : 'day'
  const first = startOfWeek(date)
  const dates = view === 'day' ? [date] : dateRange(first, 7)
  const days = dates.map((day) => ({
    date: day,
    plan: getDayPlan(entries, day),
    critical: cycles.some((cycle) => cycleOnDate(profile.birthDate, day, cycle).critical),
  }))
  const selected = days.find((day) => day.date === date) ?? days[0]
  const plan = selected.plan
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
  const moving = modal?.type === 'move' ? entries.find((entry) => entry.id === modal.id && !isBreak(entry)) : undefined

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
    setModal({ type: 'move', id: task.id, date: nextDate, time: nextTime })
  }

  function drop(id: string, nextDate: string, minute?: number) {
    const task = entries.find((entry) => entry.id === id)
    if (task && !isBreak(task)) openMove(task, nextDate, minute === undefined ? task.startTime : minuteToTime(minute))
  }

  function move(task: Task, nextDate: string, startTime: string) {
    if (nextDate === task.date && startTime === task.startTime) {
      close()
      return
    }
    try {
      taskRepository.update(task.id, { date: nextDate, startTime })
      close()
      select(nextDate)
      setNotice('Задача перенесена. Свободные окна и загрузка пересчитаны.')
    } catch (error) {
      setError(error instanceof ScheduleConflictError ? error.message : 'Не удалось сохранить перенос.')
    }
  }

  function openBreak(id: string) {
    const entry = entries.find((value) => value.id === id)
    if (entry && isBreak(entry)) setModal({ type: 'break', entry })
  }

  const actions = { onMove: openMove, onBreak: openBreak, onDropTask: drop }

  return (
    <div className={styles.page}>
      <RhythmHeader
        title={view === 'day' ? 'Расписание дня' : 'Ваша неделя'}
        subtitle={view === 'day' ? formatDate(date, { weekday: 'long' }) + ', ' + longDate : weekLabel + ' · 7 дней в вашем ритме'}
        backTo={paths.dashboard + '?date=' + date}
      />
      <div className={view === 'day' ? styles.dayLayout : undefined}>
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className={styles.arrows}>
              <button type="button" className={styles.dateArrow} data-direction="previous"
                aria-label={view === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}
                onClick={() => select(addDays(date, view === 'day' ? -1 : -7))} />
              <DatePicker label="Выбрать дату" value={date} onChange={select} variant="toolbar"
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
        {view === 'day' && (
          <aside className={styles.summary}>
            <h2>{date === today ? 'Сегодня' : shortDate}</h2>
            <dl>
              <div><dt>Задач</dt><dd>{plan.taskCount}</dd></div>
              <div><dt>Занято задачами</dt><dd>{durationLabel(plan.taskMinutes)}</dd></div>
              <div><dt>Свободно, {minuteToTime(plan.start)}–{minuteToTime(plan.end)}</dt><dd>{durationLabel(plan.freeMinutes)}</dd></div>
            </dl>
            <section className={styles.tip}>
              <h3>Планируйте гибко</h3>
              <p>Перенесите задачу в свободное окно. Загрузка дня пересчитается после подтверждения.</p>
            </section>
            <Link className={styles.primary} to={paths.taskNew + '?date=' + date}>+ Добавить задачу</Link>
            <button type="button" className={styles.secondary} onClick={() => setModal({ type: 'break' })}>+ Добавить перерыв</button>
            {followingTransition && (
              <section className={styles.transition}>
                <h3>{formatDate(followingTransition.date, { day: 'numeric', month: 'long' })}</h3>
                <p>{followingTransition.cycle.label} цикл проходит через ноль в условной модели.</p>
              </section>
            )}
          </aside>
        )}
      </div>
      <RhythmDisclaimer />
      {modal?.type === 'move' && moving && !isBreak(moving) && (
        <TaskTimeDialog date={modal.date} startTime={modal.time} duration={moving.duration} error={error}
          onClose={close} onConfirm={(time, day) => move(moving, day, time)} />
      )}
      {modal?.type === 'break' && (
        <BreakDialog date={date} startTime={plan.free.length ? minuteToTime(plan.free[0].start) : '12:00'} entry={modal.entry} onClose={close} />
      )}
    </div>
  )
}
