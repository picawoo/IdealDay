import { useId, useRef, useState } from 'react'
import { useUnsavedChanges } from '../../app/pwa/unsavedChanges'
import { addDays, formatDate } from '../../shared/lib/calendar'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { Select } from '../../shared/ui/pickers/Select'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { instantForLocalTime } from '../notifications/zonedTime'
import { dateAndTime, durationLabel, getDayPlan, planningDate, planningInterval, timelineMoment, timelineRange } from '../schedule/dayPlan'
import { preferencesRepository } from '../settings/preferencesRepository'
import { resolvePreferences, usePreferences } from '../settings/usePreferences'
import { project } from '../tasks/recurrence'
import type { TaskRecord } from '../tasks/recurrence'
import { formatTaskRange, isBreak, isPositiveDuration, taskTypes } from '../tasks/model'
import type { Task, TaskType } from '../tasks/model'
import { TaskDialog } from '../tasks/TaskDialog'
import { StalePlanError, taskRepository, taskWriteError } from '../tasks/taskRepository'
import { dayOffset, formatPlannerReason, timeToMinute } from '../tasks/timeIntervals'
import { loadRules } from './config'
import { analyzeLoad } from './load'
import { buildPlan, mayMove, remainingWindow } from './model'
import type { PlannerInput, PlanningTask } from './model'
import taskStyles from '../tasks/Tasks.module.css'
import styles from './Planner.module.css'

const primary = taskStyles.primary + ' ' + styles.primary
const secondary = taskStyles.secondary + ' ' + styles.secondary
const cardButton = taskStyles.secondary + ' ' + styles.cardButton

const typeOptions = (Object.entries(taskTypes) as [TaskType, string][]).map(([value, label]) => ({ value, label }))
const emptyTask = (): PlanningTask => ({ id: crypto.randomUUID(), title: '', description: '', type: 'intellectual', duration: null })

function asCandidate(task: Task): PlanningTask {
  return { ...task, existingId: task.id }
}

interface Preview {
  input: PlannerInput
  preferences: string
  snapshot: readonly TaskRecord[]
  result: ReturnType<typeof buildPlan>
}

export function PlannerDialog({ date, seed = [], single = false, onClose, onApplied }: {
  date: string; seed?: readonly PlanningTask[]; single?: boolean; onClose: () => void; onApplied?: () => void
}) {
  const editId = useId()
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const { planning, timeZone, birthDate } = usePreferences()
  const [tasks, setTasks] = useState<PlanningTask[]>(() => seed.length ? [...seed] : [emptyTask()])
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(() => single ? calculate([...seed], Date.now()) : null)
  const [editing, setEditing] = useState<{ id: string; date: string; time: string }>()
  const [rests, setRests] = useState<number[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)
  const { pending, run } = usePendingAction()
  useUnsavedChanges(true)

  function calculate(candidates: PlanningTask[], now: number): Preview {
    const stored = preferencesRepository.read()
    const { timeZone, planning, chronotype, birthDate, planner } = resolvePreferences(stored)
    const snapshot = taskRepository.read()
    const input = { date, now, entries: project(snapshot, date, addDays(date, 1)), timeZone, planning, chronotype, birthDate,
      windows: planner?.windows, transitionReserve: planner?.transitionReserve, mode: planner?.mode, tasks: candidates }
    return { input, preferences: JSON.stringify(stored), snapshot, result: buildPlan(input) }
  }
  const original = taskRepository.query(date, addDays(date, 1))
  const dayEntries = getDayPlan(original, date, planning).entries
  const today = Date.now()
  const available = original.filter((entry): entry is Task => !isBreak(entry)
    && (entry.startTime ? planningDate(entry.date, entry.startTime, planning) : entry.date) === date && mayMove(entry, entry.date, today, timeZone))

  function changed() { setDirty(true); setError('') }
  function recalculate() {
    const entered = tasks.filter(task => task.title.trim() || task.duration !== null)
    if (entered.some(task => !task.title.trim() || (task.duration !== null && !isPositiveDuration(task.duration)))) {
      setError('Проверьте название и длительность задач.'); return
    }
    const candidates = [...entered, ...available.filter(task => (selected.includes(task.id) || !task.startTime)).map(asCandidate)]
    if (!candidates.length) { setError('Добавьте задачу или выберите задачи, время которых можно пересмотреть.'); return }
    const manual = new Map(preview?.input.tasks.filter(task => task.manual).map(task => [task.id, task.manual]))
    setPreview(calculate(candidates.map(task => ({ ...task, title: task.title.trim(), manual: manual.get(task.id) })), Date.now()))
    setEditing(undefined); setRests([]); setDirty(false); setError(''); setNotice('')
    requestAnimationFrame(() => {
      previewHeading.current?.scrollIntoView({ block: 'start' })
      previewHeading.current?.focus({ preventScroll: true })
    })
  }

  function saveEdit() {
    if (!preview || !editing) return
    const minute = dayOffset(editing.date) - dayOffset(date) + timeToMinute(editing.time)
    const candidates = preview.input.tasks.map(task => task.id === editing.id ? { ...task, manual: { minute, pinned: true, edited: true } } : task)
    const attempted = { ...preview.input, now: Date.now(), tasks: candidates }
    const result = buildPlan(attempted)
    if (!result.placements.some(({ task }) => task.id === editing.id)
      || result.unplaced.some(({ task }) => task.manual && task.id !== editing.id)) {
      setError('Это время недоступно. Проверьте границы дня и пересечения с закреплёнными задачами.'); return
    }
    setPreview({ ...preview, input: attempted, result })
    closeEdit(); setRests([]); setError('')
  }

  function closeEdit() {
    const id = editing?.id
    setEditing(undefined)
    if (id) requestAnimationFrame(() => document.getElementById(editId + id)?.focus())
  }

  function togglePin(id: string, minute: number, pinned: boolean) {
    if (!preview) return
    const update = (task: PlanningTask) => task.id === id ? {
      ...task, manual: pinned || task.manual?.edited ? { minute, pinned, edited: task.manual?.edited } : undefined,
    } : task
    const input = { ...preview.input, tasks: preview.input.tasks.map(update) }
    const placements = preview.result.placements.map(item => {
      if (item.task.id !== id) return item
      const reasons = item.reasons.filter(reason => reason !== 'Интервал закреплён в предпросмотре.'
        && reason !== 'Время закреплено в черновике.')
      if (pinned) reasons.push('Интервал закреплён в предпросмотре.')
      if (!reasons.length) reasons.push('Время сохранено из предыдущего расчёта.')
      return { ...item, task: update(item.task), reasons }
    })
    setPreview({ ...preview, input, result: { ...preview.result, placements } })
  }

  function apply() { void run(async () => {
    if (!preview || dirty || editing) return
    try {
      await taskRepository.applyPlan({
        snapshot: preview.snapshot,
        preferences: preview.preferences,
        date,
        timeZone: preview.input.timeZone,
        window: planningInterval(preview.input.planning),
        updates: preview.result.placements.map(({ task, date, startTime, reasons }) => ({
          existingId: task.existingId, draft: { title: task.title, description: task.description, type: task.type, duration: task.duration,
            date, startTime, status: 'planned', pinned: task.manual?.pinned, plannerReasons: reasons },
        })),
        breaks: rests.map(minute => {
          const at = dateAndTime(date, minute)
          return { date: at.date, startTime: at.time, duration: loadRules.breakMinutes }
        }),
      })
      const remaining = preview.result.unplaced.map(({ task }) => task)
      if (remaining.length) {
        setTasks(remaining.filter(task => !task.existingId))
        setSelected(remaining.flatMap(task => task.existingId ? [task.existingId] : []))
        setPreview(calculate(remaining, Date.now()))
        setRests([]); setError(''); setNotice('Размещённая часть плана сохранена. Остальные задачи остались в черновике.')
      } else {
        onClose()
        onApplied?.()
      }
    } catch (failure) {
      setError(failure instanceof StalePlanError ? failure.message : taskWriteError(failure, 'Не удалось применить план. Проверьте локальное хранилище.'))
    }
  }) }

  const result = preview?.result
  const advice = result ? analyzeLoad(result.plan) : []
  const earliestBreak = preview ? remainingWindow(preview.input).start : Infinity
  const suggested = [...new Set(advice.flatMap(item => item.breakAt === undefined || item.breakAt < earliestBreak ? [] : [item.breakAt]))]
    .sort((a, b) => a - b).filter((minute, i, all) => {
      if (i > 0 && minute - all[i - 1] < loadRules.breakMinutes) return false
      const start = dateAndTime(date, minute)
      const end = dateAndTime(date, minute + loadRules.breakMinutes)
      const from = instantForLocalTime(start.date, start.time, timeZone)
      const to = instantForLocalTime(end.date, end.time, timeZone)
      return from !== null && to !== null && to - from === loadRules.breakMinutes * 60_000
    })
  const addDay = planningInterval(planning).end > 1440
  return (
    <TaskDialog title="План дня" className={styles.dialog} onClose={() => { if (!pending) onClose() }}>
      <div className={styles.body} inert={pending}>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Содержимое плана">
        <p className={styles.intro}>{formatDate(date, { dateStyle: 'long' })} · Окна по хронотипу и предпочтениям.</p>
        {!birthDate && <p>Для учёта фаз укажите дату рождения в профиле или в быстром старте.</p>}
        {!single && <section className={styles.section}>
          <h3>Новые задачи</h3>
          {tasks.map((task, index) => <div className={styles.taskInput} key={task.id}>
            <label className={taskStyles.field}>Название задачи {index + 1}<input value={task.title} onChange={event => {
              const title = event.currentTarget.value
              setTasks(items => items.map(item => item.id === task.id ? { ...item, title } : item)); changed()
            }} /></label>
            <Select label="Тип" value={task.type} options={typeOptions} onChange={type => {
              setTasks(items => items.map(item => item.id === task.id ? { ...item, type } : item)); changed()
            }} />
            <label className={taskStyles.field}>Минуты<input type="number" min={1} value={task.duration ?? ''} onChange={event => {
              const duration = event.currentTarget.value ? event.currentTarget.valueAsNumber : null
              setTasks(items => items.map(item => item.id === task.id ? { ...item, duration } : item)); changed()
            }} /></label>
            <button type="button" className={secondary} aria-label={`Убрать задачу ${index + 1} из черновика`}
              onClick={() => { setTasks(items => items.filter(item => item.id !== task.id)); changed() }}>×</button>
          </div>)}
          <button type="button" className={secondary} onClick={() => { setTasks(items => [...items, emptyTask()]); changed() }}>Добавить задачу в черновик</button>
        </section>}
        {!single && available.some(task => task.startTime) && <section className={styles.section}>
          <h3>Какие задачи можно перенести?</h3>
          {available.filter(task => task.startTime).map(task => <label className={styles.check} key={task.id}>
            <input type="checkbox" checked={selected.includes(task.id)} onChange={event => {
              const checked = event.currentTarget.checked
              setSelected(ids => checked ? [...ids, task.id] : ids.filter(id => id !== task.id)); changed()
            }} />{task.startTime} · {task.title}
          </label>)}
        </section>}
        {!single && available.some(task => !task.startTime) && <section className={styles.section}>
          <h3>Повторения без назначенного времени</h3>
          <ul>{available.filter(task => !task.startTime).map(task => <li key={task.id}>{task.title}</li>)}</ul>
        </section>}
        {dayEntries.some(({ entry }) => !selected.includes(entry.id)) && <section className={styles.section}>
          <h3>Фиксированные интервалы</h3>
          <ul>{dayEntries.filter(({ entry }) => !selected.includes(entry.id)).map(({ entry }) =>
            <li key={entry.id}>{formatTaskRange(entry.startTime, entry.duration)} · {isBreak(entry) ? 'Перерыв' : entry.title + (entry.pinned ? ' · Закреплено' : '')}</li>)}</ul>
        </section>}
        {result && <section className={styles.section} aria-label="Предпросмотр плана">
          <h3 ref={previewHeading} className={styles.previewHeading} tabIndex={-1}>Предложенное расписание</h3>
          <dl className={styles.metrics}>
            <div><dt>Период</dt><dd>{timelineRange(result.plan.window.start, result.plan.window.end)}</dd></div>
            <div><dt>Новые назначения</dt><dd>{durationLabel(result.placements.reduce((sum, item) => sum + (item.task.duration ?? 0), 0))}</dd></div>
            <div><dt>Занято задачами</dt><dd>{durationLabel(result.plan.taskMinutes)}</dd></div>
            <div><dt>Свободно</dt><dd>{durationLabel(result.plan.freeMinutes - rests.length * loadRules.breakMinutes)}</dd></div>
          </dl>
          {dirty && <p>Состав черновика изменился. Пересчитайте план.</p>}
          <ul className={styles.placements}>{result.placements.map(item => {
            const old = preview.input.entries.find(entry => entry.id === item.task.existingId)
            const current = editing?.id === item.task.id ? editing : undefined
            const pinned = !!item.task.manual?.pinned
            const actionId = editId + item.task.id
            return <li key={item.task.id} className={styles.placement} data-type={item.task.type}>
              <div className={styles.cardHead}>
                <time dateTime={item.date + 'T' + item.startTime}>{formatTaskRange(item.startTime, item.task.duration)}{item.date !== date && ' · начало ' + formatDate(item.date, { day: 'numeric', month: 'short' })}</time>
                <strong>{item.task.title}</strong>
                <span className={styles.typeBadge}>{taskTypes[item.task.type]}</span>
              </div>
              {old && (old.date !== item.date || old.startTime !== item.startTime) && <p className={styles.reason}>Было {formatTaskRange(old.startTime, old.duration)}</p>}
              <p className={styles.reason}>{item.reasons.map(formatPlannerReason).join(' ')}</p>
              <div className={styles.cardActions}>
                <button id={actionId} type="button" className={cardButton} disabled={dirty}
                  aria-expanded={!!current} aria-controls={current ? actionId + '-panel' : undefined}
                  onClick={() => current ? closeEdit() : setEditing({ id: item.task.id, date: item.date, time: item.startTime })}>
                  <span className={styles.clockIcon} aria-hidden="true" />Изменить время
                </button>
                <button type="button" className={cardButton} aria-pressed={pinned} disabled={dirty || !!current}
                  onClick={() => togglePin(item.task.id, item.minute, !pinned)}>
                  <span className={styles.lockIcon} data-locked={pinned} aria-hidden="true" />{pinned ? 'Закреплено' : 'Закрепить'}
                </button>
              </div>
              {current && <div className={styles.editor} id={actionId + '-panel'}>
                {addDay && !item.task.calendarDate && !item.task.existingId && <Select label="Дата" value={current.date}
                  options={[date, addDays(date, 1)].map(value => ({ value, label: formatDate(value, { dateStyle: 'short' }) }))}
                  onChange={value => setEditing({ ...current, date: value })} />}
                <TimePicker label="Новое время" value={current.time} onChange={time => setEditing({ ...current, time })} />
                <div className={styles.actions}>
                  <button type="button" className={primary} onClick={saveEdit}>Зафиксировать время</button>
                  <button type="button" className={secondary} onClick={closeEdit}>Отменить правку</button>
                </div>
              </div>}
            </li>
          })}</ul>
          {result.unplaced.length > 0 && <><h3>Не удалось разместить</h3><ul>{result.unplaced.map(({ task, reason }) =>
            <li key={task.id}>{task.title} · {reason}{task.existingId && ' Исходное время сохранено.'}</li>)}</ul></>}
          {advice.length > 0 && <><h3>Нагрузка и паузы</h3><ul>{advice.map(item => <li key={item.id}>{item.text}</li>)}</ul></>}
          {suggested.length > 0 && <><h3>Предложенные перерывы</h3>{suggested.map(minute => <label key={minute} className={styles.check}>
            <input type="checkbox" checked={rests.includes(minute)} onChange={event => {
              const checked = event.currentTarget.checked
              setRests(items => checked ? [...items, minute] : items.filter(value => value !== minute))
            }} />Добавить перерыв · {timelineMoment(minute)} · {loadRules.breakMinutes} мин.
          </label>)}</>}
        </section>}
        </div>
        <div className={styles.footer}>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={secondary} onClick={onClose}>Отмена</button>
          <button type="button" className={secondary} disabled={!!editing} onClick={recalculate}>{preview ? 'Пересчитать оставшиеся' : 'Рассчитать план'}</button>
          {preview && <button type="button" className={primary} onClick={apply}
            disabled={dirty || !!editing || (!result?.placements.length && !rests.length)}>Применить план</button>}
        </div>
        </div>
      </div>
    </TaskDialog>
  )
}
