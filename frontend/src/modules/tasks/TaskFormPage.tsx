import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { useUnsavedChanges } from '../../app/pwa/unsavedChanges'
import { taskDestination } from '../../app/router/taskReturn'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { dateInTimeZone, parseDate } from '../../shared/lib/calendar'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { PlannerDialog } from '../planner/PlannerDialog'
import { usePreferences } from '../settings/usePreferences'
import { formatTaskRange, isPositiveDuration, taskStatusOptions, taskTypes } from './model'
import type { Task, TaskDraft, TaskType } from './model'
import { TaskContext } from './TaskContext'
import { TaskTimeDialog } from './TaskTimeDialog'
import { taskRepository, taskWriteError } from './taskRepository'
import { RecurrenceFields } from './RecurrenceFields'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { isRepeatRule, isSeries, periodOn } from './recurrence'
import type { RepeatRule, Scope, SeriesDraft } from './recurrence'
import { isTime } from './timeIntervals'
import { useTask, useTaskRecords } from './useTasks'
import styles from './Tasks.module.css'

type FormValues = Omit<TaskDraft, 'duration'> & { duration: string }

export function TaskFormPage() {
  const { taskId } = useParams()
  return <TaskFormRoute key={taskId ?? 'new'} taskId={taskId} />
}

function TaskFormRoute({ taskId }: { taskId?: string }) {
  const [params] = useSearchParams()
  const { timeZone } = usePreferences()
  const current = useTask(taskId)
  const [initialTask] = useState(current)
  const task = current ?? initialTask
  if (taskId && !task) return <TaskMissing />

  const initialDate = parseDate(params.get('date')) ?? dateInTimeZone(new Date(), timeZone)
  const proposedTime = params.get('time') ?? ''
  const initialTime = isTime(proposedTime) ? proposedTime : ''
  return <TaskForm task={task} initialDate={initialDate} initialTime={initialTime} />
}

export function TaskMissing() {
  const [params] = useSearchParams()
  const { state } = useLocation()
  const back = taskDestination(params, state)
  return (
    <div className={styles.page}>
      <RhythmHeader title="Задача не найдена" subtitle="Возможно, её уже удалили" backTo={back.to} backState={back.state} backLabel={back.label} />
      <Link className={styles.secondary} to={back.to} state={back.state}>{back.label}</Link>
    </div>
  )
}

function TaskForm({ task, initialDate, initialTime }: { task?: Task; initialDate: string; initialTime: string }) {
  const navigate = useNavigate()
  const { timeZone } = usePreferences()
  const [params] = useSearchParams()
  const { pending, run } = usePendingAction()
  const [initialValues] = useState<FormValues>(() => task
    ? { ...task, pinned: task.pinned ?? false, duration: task.duration === null ? '' : String(task.duration) }
    : { title: '', description: '', type: 'intellectual', date: initialDate, startTime: initialTime, duration: '', status: 'planned', pinned: false })
  const [values, setValues] = useState(initialValues)
  const [showTime, setShowTime] = useState(false)
  const [automatic, setAutomatic] = useState(!!task?.recurrence && !task.startTime)
  const [rule, setRule] = useState<RepeatRule | undefined>(task?.recurrence?.rule)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [initialRule] = useState(task?.recurrence?.rule)
  const [version] = useState(task?.recurrence?.version)
  const records = useTaskRecords()
  const series = records.find(record => isSeries(record) && record.id === task?.recurrence?.seriesId)
  const ruleChanged = JSON.stringify(rule) !== JSON.stringify(initialRule)
  const [showPlanner, setShowPlanner] = useState(false)
  const [error, setError] = useState('')
  const { state } = useLocation()
  const back = taskDestination(params, state)
  const returnTo = back.to
  function returnToOrigin() { navigate(returnTo, { replace: true, state: back.state }) }
  const duration = values.duration === '' ? null : Number(values.duration)
  const range = values.startTime && (duration === null || isPositiveDuration(duration)) ? formatTaskRange(values.startTime, duration) : null
  useUnsavedChanges(showTime || showPlanner || automatic || ruleChanged || (Object.keys(initialValues) as Array<keyof FormValues>)
    .some((key) => values[key] !== initialValues[key]))

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  function save(scope?: Scope) { void run(async () => {
    if (!values.title.trim()) {
      setError('Введите название задачи.')
      return
    }
    if ((!automatic || task?.recurrence && !rule) && !isTime(values.startTime)) {
      setError('Выберите время начала задачи.')
      return
    }
    if (!parseDate(values.date) || (duration !== null && !isPositiveDuration(duration))) {
      setError('Укажите дату. Если задача занимает время, введите длительность в целых минутах.')
      return
    }
    if (rule && (!isRepeatRule(rule) || rule.until && rule.until < (task?.recurrence?.origin ?? values.date))) {
      setError('Выберите дни повторения и допустимую дату окончания.'); return
    }
    if (automatic && !isPositiveDuration(duration)) {
      setError('Для автоматического подбора укажите длительность.'); return
    }
    if (automatic && !rule && !task) {
      setError(''); setShowPlanner(true); return
    }
    const draft: TaskDraft = {
      title: values.title.trim(),
      description: values.description.trim(),
      type: values.type,
      date: values.date,
      startTime: values.startTime,
      duration,
      status: values.status,
      pinned: values.pinned,
    }
    let seriesDraft: SeriesDraft | undefined = rule && {
      title: draft.title, description: draft.description, type: draft.type, duration,
      pinned: !automatic && draft.pinned, startTime: automatic ? null : draft.startTime, rule,
    }
    if (task?.recurrence && !scope) { setError(''); setScopeOpen(true); return }
    try {
      if (task?.recurrence && !rule && initialRule && scope) {
        await taskRepository.detachOccurrence({ ...task, recurrence: { ...task.recurrence, version: version! } }, scope, draft)
        returnToOrigin()
        return
      }
      if (task?.recurrence && scope && scope !== 'one') {
        if (!seriesDraft) throw new Error('Missing recurrence rule')
        const basis = series && isSeries(series) ? periodOn(series, task.recurrence.origin) : undefined
        if (basis) {
          const fields = ['title', 'description', 'type', 'duration', 'pinned', 'startTime'] as const
          const changes = Object.fromEntries(fields.filter(field => values[field] !== initialValues[field]
            || field === 'startTime' && automatic !== !initialValues.startTime).map(field => [field, seriesDraft![field]]))
          seriesDraft = { title: basis.title, description: basis.description, type: basis.type, duration: basis.duration,
            pinned: basis.pinned, startTime: basis.startTime, rule: seriesDraft.rule, ...changes }
          if (seriesDraft.startTime === null) seriesDraft.pinned = false
        }
        await taskRepository.changeSeries({ ...task, recurrence: { ...task.recurrence, version: version! } }, scope, seriesDraft)
        returnToOrigin()
        return
      }
      if (seriesDraft && !task?.recurrence) {
        if (task) await taskRepository.convertToSeries(task.id, values.date, seriesDraft)
        else await taskRepository.createSeries(values.date, seriesDraft)
        returnToOrigin()
        return
      }
      if (task) {
        if (automatic && task.recurrence) { draft.startTime = ''; draft.pinned = false }
        const changes = (Object.keys(draft) as Array<keyof TaskDraft>)
          .filter((field) => field === 'startTime' ? draft.startTime !== initialValues.startTime : values[field] !== initialValues[field])
          .map((field) => [field, draft[field]])
        await taskRepository.update(task.id, Object.fromEntries(changes), version)
      } else {
        await taskRepository.create(draft)
      }
      returnToOrigin()
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось сохранить задачу. Проверьте доступность хранилища браузера.'))
    }
  }) }

  return (
    <div className={styles.page}>
      <RhythmHeader title={task ? 'Редактирование задачи' : 'Новая задача'} subtitle="Укажите параметры задачи и время начала" backTo={returnTo} backState={back.state} backLabel={back.label} />
      <div className={styles.columns}>
        <form className={styles.form} inert={pending} onSubmit={(event) => { event.preventDefault(); save() }}>
          <h2>Что хотите сделать?</h2>
          <label className={styles.field}>Название задачи
            <input required value={values.title} onChange={(event) => change('title', event.currentTarget.value)} />
          </label>
          <label className={styles.description}>Описание
            <textarea value={values.description} onChange={(event) => change('description', event.currentTarget.value)} />
          </label>
          <fieldset className={styles.typeField}>
            <legend>Тип задачи</legend>
            <div className={styles.typeChoices}>
              {(Object.keys(taskTypes) as TaskType[]).map((id) => (
                <label key={id} data-type={id}>
                  <input type="radio" name="type" value={id} checked={values.type === id} onChange={() => change('type', id)} />
                  {taskTypes[id]}
                </label>
              ))}
            </div>
          </fieldset>
          {(!task || task.recurrence) && <fieldset className={styles.typeField}><legend>Способ планирования</legend>
            <label><input type="radio" name="planning-method" checked={!automatic} onChange={() => setAutomatic(false)} /> Указать время самостоятельно</label>
            {' '}<label><input type="radio" name="planning-method" checked={automatic} onChange={() => { setAutomatic(true); change('pinned', false) }} /> Подобрать подходящее время автоматически</label>
          </fieldset>}
          <div className={styles.formGrid}>
            <DatePicker timeZone={timeZone} label="Дата" value={values.date} onChange={(date) => change('date', date)} />
            {!automatic && <TimePicker label="Время начала" value={values.startTime} onChange={(time) => change('startTime', time)} />}
            <label className={styles.field}>Длительность, мин.
              <input type="number" min="1" step="1" required={automatic} placeholder={automatic ? 'Укажите длительность' : 'Необязательно'} value={values.duration} onChange={(event) => change('duration', event.currentTarget.value)} />
            </label>
            {!automatic && !task?.recurrence && <Select label="Статус" value={values.status} options={taskStatusOptions} onChange={(status) => change('status', status)} />}
          </div>
          <RecurrenceFields date={values.date} timeZone={timeZone} value={rule} onChange={setRule} pinned={!!values.pinned}
            canPin={!automatic} onPin={pinned => change('pinned', pinned)} />
          {!automatic && range && <div className={styles.interval}><strong>Выбрано {range}</strong><p>Время можно изменить.</p></div>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.formActions}>
            <Link className={styles.button} to={returnTo} state={back.state}>Отмена</Link>
            <button className={styles.primary} type="submit" disabled={pending}>{automatic && !rule && !task ? 'Подобрать время' : 'Сохранить задачу'}</button>
          </div>
        </form>
        <TaskContext mode="form" date={parseDate(values.date) ?? ''} startTime={values.startTime} duration={duration} onChooseTime={automatic ? undefined : () => setShowTime(true)} />
      </div>
      {scopeOpen && <RecurrenceScopeDialog action="edit" pending={pending} error={error} ruleChanged={ruleChanged && !!rule} onlyOne={!initialRule} detach={!!initialRule && !rule}
        affected={series && isSeries(series) ? Object.entries(series.exceptions).filter(([, item]) => !('cancelled' in item) && item.patch
          && (item.patch.date !== undefined || item.patch.startTime !== undefined || item.patch.pinned !== undefined)).map(([date]) => date) : []}
        close={() => { setScopeOpen(false); setError('') }} confirm={save} />}
      {showPlanner && <PlannerDialog date={values.date} single onClose={() => setShowPlanner(false)} onApplied={() => returnToOrigin()}
        seed={[{ id: 'new-task', title: values.title.trim(), description: values.description.trim(), type: values.type, duration, calendarDate: values.date }]} />}
      {showTime && <TaskTimeDialog startTime={values.startTime} duration={duration} onClose={() => setShowTime(false)} onConfirm={(value) => { change('startTime', value); setShowTime(false) }} />}
    </div>
  )
}
