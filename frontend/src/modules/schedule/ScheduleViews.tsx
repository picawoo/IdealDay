import { Link } from 'react-router'
import type { DragEvent } from 'react'
import { paths } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { isBreak, taskTypes } from '../tasks/model'
import type { Task } from '../tasks/model'
import { minuteToTime } from '../tasks/timeIntervals'
import { durationLabel } from './dayPlan'
import type { DayPlan, DaySegment } from './dayPlan'
import type { Interval } from '../tasks/timeIntervals'
import { dragType, ScheduleCard } from './ScheduleCard'
import { layoutTimeline } from './timelineLayout'
import styles from './Schedule.module.css'

const minimumCardMinutes = 15

type Callout =
  | { key: string; minute: number; height: number; segment: DaySegment }
  | { key: string; minute: number; height: number; free: Interval }

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

function FreeWindow({ date, interval: { start, end }, compact, detached = false }: {
  date: string
  interval: Interval
  compact: boolean
  detached?: boolean
}) {
  return (
    <Link className={styles.free} data-compact={compact} data-callout={detached} to={newTaskLink(date, start)}>
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

export function DayTimeline({ day, onMove, onBreak, onDropTask }: CardActions & { day: CalendarDay }) {
  const { plan, date } = day
  const span = plan.end - plan.start
  const hours = Array.from({ length: span / 60 + 1 }, (_, index) => plan.start + 60 * index)
  const anchors: Callout[] = [
    ...plan.entries.filter(({ start, end }) => end - start < minimumCardMinutes)
      .map((segment) => ({ key: segment.entry.id, minute: segment.start, height: 48, segment })),
    ...plan.free.filter(({ start, end }) => end - start < minimumCardMinutes)
      .map((free) => ({ key: 'free:' + free.start, minute: (free.start + free.end) / 2, height: 28, free })),
  ]
  const { offset, height, callouts } = layoutTimeline(plan.start, plan.end, anchors)

  function drop(event: DragEvent<HTMLElement>) {
    const id = event.dataTransfer.getData(dragType)
    if (!id) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const minute = plan.start + ((event.clientY - rect.top) / rect.height) * span
    const snapped = Math.min(plan.end - 1, Math.max(plan.start, Math.round(minute)))
    onDropTask(id, date, snapped)
  }

  return (
    <>
      {plan.entries.length === 0 && <p className={styles.muted}>На этот день ничего не запланировано.</p>}
      <div className={styles.timelineFrame}>
        <div className={styles.timeline} data-rail={callouts.length > 0} style={{ blockSize: height }}
          onDragOver={allowDrop} onDrop={drop} aria-label="Почасовое расписание">
          <div className={styles.track}>
            {hours.map((hour) => (
              <div className={styles.hour} key={hour} style={{ top: offset(hour) }}><span>{minuteToTime(hour)}</span></div>
            ))}
            {plan.free.map((free) => (
              <div className={styles.freeSlot} key={free.start} style={{ top: offset(free.start), height: offset(free.end) - offset(free.start) }}>
                {free.end - free.start >= minimumCardMinutes && (
                  <FreeWindow interval={free} date={date} compact={free.end - free.start < 40} />
                )}
              </div>
            ))}
            {plan.entries.map((segment) => {
              const { entry, start, end, lane, lanes } = segment
              const minutes = end - start
              if (minutes === 0) return null
              return (
                <div className={styles.slot} key={entry.id} data-compact={minutes < 30} style={{
                  top: offset(start),
                  height: offset(end) - offset(start),
                  left: lane / lanes * 100 + '%',
                  width: 100 / lanes + '%',
                }}>
                  {minutes < minimumCardMinutes ? (
                    <div
                      className={styles.shortMarker}
                      data-type={isBreak(entry) ? 'break' : entry.type}
                      data-conflict={lanes > 1}
                      aria-hidden="true"
                    />
                  ) : <ScheduleCard segment={segment} onMove={onMove} onBreak={onBreak} />}
                </div>
              )
            })}
          </div>
          {callouts.length > 0 && (
            <>
              <svg className={styles.connectors} viewBox={'0 0 18 ' + height} preserveAspectRatio="none" aria-hidden="true">
                {callouts.map((callout) => {
                  const entry = 'segment' in callout ? callout.segment.entry : null
                  const type = !entry ? 'free' : isBreak(entry) ? 'break' : entry.type
                  return (
                    <g key={callout.key} data-type={type}>
                      <line x1="2" y1={callout.y} x2="18" y2={callout.top + callout.height / 2} />
                      <circle cx="3" cy={callout.y} r={entry?.duration === null ? 3 : 2} />
                    </g>
                  )
                })}
              </svg>
              <div className={styles.rail}>
                {callouts.map((callout) => (
                  <div key={callout.key} className={styles.callout} style={{ top: callout.top, height: callout.height }}>
                    {'segment' in callout
                      ? <ScheduleCard segment={callout.segment} onMove={onMove} onBreak={onBreak} />
                      : <FreeWindow interval={callout.free} date={date} compact detached />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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

  return (
    <>
      <div className={styles.weekStats}>
        <span>Задач: {tasks.size} · {durationLabel(workMinutes)}</span>
        {criticalDays > 0 && <span>Дней с переходом цикла: {criticalDays}</span>}
      </div>
      <div className={styles.week}>
        {days.map(({ date, plan, critical }) => (
          <section key={date} className={styles.weekDay} data-selected={date === selectedDate}
            onDragOver={allowDrop} onDrop={(event) => {
              const id = event.dataTransfer.getData(dragType)
              if (id) { event.preventDefault(); onDropTask(id, date) }
            }}
          >
            <button type="button" className={styles.weekDate} aria-label={'Открыть день: ' + formatDate(date, { dateStyle: 'long' })} onClick={() => onSelectDay(date)}>
              <small>{formatDate(date, { weekday: 'short' })}</small>
              <strong>{formatDate(date, { day: 'numeric' })}</strong>
              <span>{durationLabel(plan.taskMinutes)}</span>
            </button>
            <progress value={plan.taskMinutes} max={plan.end - plan.start} aria-label="Загрузка дня" />
            <p className={styles.muted}>{date === today ? 'Сегодня' : formatDate(date, { month: 'long' })}{critical && ' · △ Переход'}</p>
            {plan.entries.map((segment) => <ScheduleCard key={segment.entry.id} segment={segment} onMove={onMove} onBreak={onBreak} />)}
            {!plan.entries.length && <p className={styles.emptyDay}>Нет событий</p>}
            {plan.free.length > 0 && <Link className={styles.weekFree} to={newTaskLink(date, plan.free[0].start)}>+ Свободное время</Link>}
          </section>
        ))}
      </div>
      <ul className={styles.legend}>
        {Object.entries(taskTypes).map(([type, label]) => <li key={type} data-type={type}>● {label}</li>)}
      </ul>
      <p className={styles.muted}>Критический день — переход условного цикла через ноль.</p>
    </>
  )
}
