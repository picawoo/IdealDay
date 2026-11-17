import { Link } from 'react-router'
import type { DragEvent } from 'react'
import { paths } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { isBreak, taskTypes } from '../tasks/model'
import type { Task } from '../tasks/model'
import { minuteToTime } from '../tasks/timeIntervals'
import { durationLabel } from './dayPlan'
import type { DayPlan } from './dayPlan'
import type { Interval } from '../tasks/timeIntervals'
import { dragType, ScheduleCard } from './ScheduleCard'
import { createTimeScale, layoutTimeline } from './timelineLayout'
import type { TimelineLayout, TimeScale } from './timelineLayout'
import styles from './Schedule.module.css'

const minimumFreeLabelMinutes = 15

interface CardActions {
  onMove: (task: Task) => void
  onBreak: (id: string) => void
  onDropTask: (id: string, date: string, minute?: number) => void
}

export interface CalendarDay {
  date: string
  plan: DayPlan
  critical: boolean
}

function newTaskLink(date: string, minute: number): string {
  const query = new URLSearchParams({ date, time: minuteToTime(minute) })
  return paths.taskNew + '?' + query
}

function FreeWindow({ date, interval: { start, end }, compact }: {
  date: string
  interval: Interval
  compact: boolean
}) {
  return (
    <Link className={styles.free} data-compact={compact} to={newTaskLink(date, start)}>
      <span className={styles.freeTime}>{minuteToTime(start)}–{minuteToTime(end)}</span>
      <span>Свободно · {durationLabel(end - start)}</span>
    </Link>
  )
}

function allowDrop(event: DragEvent<HTMLElement>) {
  if (event.dataTransfer.types.includes(dragType)) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
}

function HourLines({ scale: { start, end, offset }, labels }: {
  scale: TimeScale
  labels: boolean
}) {
  return Array.from({ length: (end - start) / 60 + 1 }, (_, index) => {
    const hour = start + 60 * index
    return <div className={styles.hour} key={hour} style={{ top: offset(hour) }}>{labels && <span>{minuteToTime(hour)}</span>}</div>
  })
}

function Timeline({ day: { plan, date }, onMove, onBreak, onDropTask, scale, layout, height = layout.height, week = false }: CardActions & {
  day: CalendarDay
  scale: TimeScale
  layout: TimelineLayout
  height?: number
  week?: boolean
}) {
  const { offset } = scale

  function drop(event: DragEvent<HTMLElement>) {
    const id = event.dataTransfer.getData(dragType)
    if (!id) return
    event.preventDefault()
    event.stopPropagation()
    const top = event.currentTarget.getBoundingClientRect().top
    onDropTask(id, date, scale.minuteAt(event.clientY - top))
  }

  return (
    <div className={`${styles.timeline} ${week ? styles.weekTimeline : styles.dayTimeline}`}
      style={{ blockSize: height, minInlineSize: layout.minWidth }} onDragOver={allowDrop} onDrop={drop}
      aria-label={week ? `Почасовое расписание: ${formatDate(date, { dateStyle: 'long' })}` : 'Почасовое расписание'}>
      <HourLines scale={scale} labels={!week} />
      {plan.free.map((free) => (
        <div className={styles.freeSlot} key={free.start} style={{ top: offset(free.start), height: offset(free.end) - offset(free.start) }}>
          {!week && free.end - free.start >= minimumFreeLabelMinutes && (
            <FreeWindow interval={free} date={date} compact={free.end - free.start < 40} />
          )}
        </div>
      ))}
      {layout.slots.map(({ segment, start, end, lane, lanes, laneSpan }) => (
        <div className={styles.slot} key={segment.entry.id} data-compact={end - start < 56}
          data-point={segment.entry.duration === null} data-gutter={lane + laneSpan < lanes} style={{
            top: start,
            height: end - start,
            insetInlineStart: lane / lanes * 100 + '%',
            width: laneSpan / lanes * 100 + '%',
          }}>
          <ScheduleCard segment={segment} onMove={onMove} onBreak={onBreak} />
        </div>
      ))}
    </div>
  )
}

export function DayTimeline({ day, ...actions }: CardActions & { day: CalendarDay }) {
  const scale = createTimeScale(day.plan.start, day.plan.end)
  const layout = layoutTimeline(day.plan.entries, scale)

  return (
    <>
      {day.plan.entries.length === 0 && <p className={styles.muted}>На этот день ничего не запланировано.</p>}
      <div className={styles.timelineFrame}>
        <Timeline day={day} scale={scale} layout={layout} {...actions} />
      </div>
      <p className={styles.muted}>Цвет задачи обозначает её тип. Откройте перенос кнопкой ⋮⋮ или перетащите её на новое время.</p>
    </>
  )
}

export function WeekCalendar({ days, selectedDate, today, onSelectDay, onMove, onBreak, onDropTask }: CardActions & {
  days: CalendarDay[]
  selectedDate: string
  today: string
  onSelectDay: (value: string) => void
}) {
  const tasks = new Set(days.flatMap(({ plan }) => plan.entries.filter(({ entry }) => !isBreak(entry)).map(({ entry }) => entry.id)))
  const workMinutes = days.reduce((sum, day) => sum + day.plan.taskMinutes, 0)
  const criticalDays = days.filter((day) => day.critical).length
  const start = Math.min(...days.map(({ plan }) => plan.start))
  const end = Math.max(...days.map(({ plan }) => plan.end))
  const scale = createTimeScale(start, end)
  const layouts = days.map(({ plan }) => layoutTimeline(plan.entries, scale))
  const height = Math.max(...layouts.map((layout) => layout.height))
  const columns = layouts.map(({ minWidth }) => `minmax(${minWidth}px, 1fr)`)

  return (
    <>
      <div className={styles.weekStats}>
        <span>Задач: {tasks.size} · {durationLabel(workMinutes)}</span>
        {criticalDays > 0 && <span>Дней с переходом цикла: {criticalDays}</span>}
      </div>
      <div className={styles.weekScroll} tabIndex={0} aria-label="Недельная сетка">
        <div className={styles.week} style={{ gridTemplateColumns: `44px ${columns.join(' ')}` }}>
          <div className={styles.weekHours} aria-hidden="true">
            <HourLines scale={scale} labels />
          </div>
          {days.map((day, index) => {
            const { date, plan, critical } = day
            return <section key={date} className={styles.weekDay} data-selected={date === selectedDate} style={{ gridColumn: index + 2 }}
              onDragOver={allowDrop} onDrop={(event) => {
                const id = event.dataTransfer.getData(dragType)
                if (id) { event.preventDefault(); onDropTask(id, date) }
              }}
            >
              <header className={styles.weekHeader}>
                <button type="button" className={styles.weekDate} aria-label={'Открыть день: ' + formatDate(date, { dateStyle: 'long' })} onClick={() => onSelectDay(date)}>
                  <small>{formatDate(date, { weekday: 'short' })}</small>
                  <strong>{formatDate(date, { day: 'numeric' })}</strong>
                  <span>{durationLabel(plan.taskMinutes)}</span>
                </button>
                <progress value={plan.taskMinutes} max={plan.end - plan.start} aria-label="Загрузка дня" />
                <p className={styles.muted}>{date === today ? 'Сегодня' : formatDate(date, { month: 'long' })}{critical && ' · △ Переход'}</p>
                {!plan.entries.length && <p className={styles.emptyDay}>Нет событий</p>}
              </header>
              <Timeline day={day} scale={scale} layout={layouts[index]} height={height} week onMove={onMove} onBreak={onBreak} onDropTask={onDropTask} />
              <div className={styles.weekFooter}>
                {plan.free.length > 0 && <Link className={styles.weekFree} to={newTaskLink(date, plan.free[0].start)}>+ Свободное время</Link>}
              </div>
            </section>
          })}
        </div>
      </div>
      <ul className={styles.legend}>
        {Object.entries(taskTypes).map(([type, label]) => <li key={type} data-type={type}>● {label}</li>)}
      </ul>
      <p className={styles.muted}>Критический день — переход условного цикла через ноль.</p>
    </>
  )
}
