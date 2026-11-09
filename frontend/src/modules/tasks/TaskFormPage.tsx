import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { paths, taskPath } from '../../app/router/paths'
import { dateInTimeZone, parseDate } from '../../shared/lib/calendar'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { demoProfile } from '../profile/demoProfile'
import { formatTaskRange, isPositiveDuration, taskStatusOptions, taskTypes } from './model'
import type { Task, TaskDraft, TaskType } from './model'
import { TaskContext } from './TaskContext'
import { TaskTimeDialog } from './TaskTimeDialog'
import { ScheduleConflictError, taskRepository } from './taskRepository'
import { isTime } from './timeIntervals'
import { useTasks } from './useTasks'
import styles from './Tasks.module.css'

type FormValues = Omit<TaskDraft, 'duration'> & { duration: string }

export function TaskFormPage() {
  const { taskId } = useParams()
  const [params] = useSearchParams()
  const tasks = useTasks()
  const task = tasks.find((item) => item.id === taskId)
  if (taskId && !task) return <TaskMissing />

  const initialDate = parseDate(params.get('date')) ?? dateInTimeZone(new Date(), demoProfile.timeZone)
  const proposedTime = params.get('time') ?? ''
  const initialTime = isTime(proposedTime) ? proposedTime : ''
  return <TaskForm key={taskId ?? 'new'} task={task} initialDate={initialDate} initialTime={initialTime} />
}

export function TaskMissing() {
  return (
    <div className={styles.page}>
      <RhythmHeader title="Задача не найдена" subtitle="Возможно, её уже удалили" backTo={paths.tasks} backLabel="К списку задач" />
      <Link className={styles.secondary} to={paths.tasks}>Мои задачи</Link>
    </div>
  )
}

function TaskForm({ task, initialDate, initialTime }: { task?: Task; initialDate: string; initialTime: string }) {
  const navigate = useNavigate()
  const [values, setValues] = useState<FormValues>(() => task
    ? { ...task, duration: task.duration === null ? '' : String(task.duration) }
    : { title: '', description: '', type: 'intellectual', date: initialDate, startTime: initialTime, duration: '', status: 'planned' })
  const [showTime, setShowTime] = useState(false)
  const [error, setError] = useState('')
  const returnTo = task ? taskPath(task.id) : paths.tasks
  const duration = values.duration === '' ? null : Number(values.duration)
  const range = values.startTime && (duration === null || isPositiveDuration(duration)) ? formatTaskRange(values.startTime, duration) : null

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }))
  }

  function save() {
    if (!values.title.trim()) {
      setError('Введите название задачи.')
      return
    }
    if (!isTime(values.startTime)) {
      setError('Выберите время начала задачи.')
      return
    }
    if (!parseDate(values.date) || (duration !== null && !isPositiveDuration(duration))) {
      setError('Укажите дату. Если задача занимает время, введите длительность в целых минутах.')
      return
    }
    const draft: TaskDraft = {
      title: values.title.trim(),
      description: values.description.trim(),
      type: values.type,
      date: values.date,
      startTime: values.startTime,
      duration,
      status: values.status,
    }
    try {
      if (task) taskRepository.update(task.id, draft)
      else taskRepository.create(draft)
      navigate(returnTo, { replace: true })
    } catch (error) {
      setError(error instanceof ScheduleConflictError ? error.message : 'Не удалось сохранить задачу. Проверьте доступность хранилища браузера.')
    }
  }

  return (
    <div className={styles.page}>
      <RhythmHeader title={task ? 'Редактирование задачи' : 'Новая задача'} subtitle="Укажите параметры задачи и время начала" backTo={returnTo} backLabel="Назад" />
      <div className={styles.columns}>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); save() }}>
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
          <div className={styles.formGrid}>
            <DatePicker label="Дата" value={values.date} onChange={(date) => change('date', date)} />
            <TimePicker label="Время начала" value={values.startTime} onChange={(time) => change('startTime', time)} />
            <label className={styles.field}>Длительность, мин.
              <input type="number" min="1" step="1" placeholder="Необязательно" value={values.duration} onChange={(event) => change('duration', event.currentTarget.value)} />
            </label>
            <Select label="Статус" value={values.status} options={taskStatusOptions} onChange={(status) => change('status', status)} />
          </div>
          {range && <div className={styles.interval}><strong>Выбрано {range}</strong><p>Время можно изменить.</p></div>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.formActions}>
            <Link className={styles.button} to={returnTo}>Отмена</Link>
            <button className={styles.primary} type="submit">Сохранить задачу</button>
          </div>
        </form>
        <TaskContext mode="form" date={parseDate(values.date) ?? ''} startTime={values.startTime} duration={duration} onChooseTime={() => setShowTime(true)} />
      </div>
      <RhythmDisclaimer />
      {showTime && <TaskTimeDialog startTime={values.startTime} duration={duration} onClose={() => setShowTime(false)} onConfirm={(value) => { change('startTime', value); setShowTime(false) }} />}
    </div>
  )
}
