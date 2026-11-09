import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { paths, taskPath } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { formatTaskRange, taskStatuses, taskTypes } from './model'
import type { Task, TaskDraft } from './model'
import { TaskContext } from './TaskContext'
import { TaskDialog } from './TaskDialog'
import { TaskMissing } from './TaskFormPage'
import { TaskTimeDialog } from './TaskTimeDialog'
import { ScheduleConflictError, taskRepository } from './taskRepository'
import { useTasks } from './useTasks'
import styles from './Tasks.module.css'

export function TaskDetailPage() {
  const { taskId } = useParams()
  const task = useTasks().find((item) => item.id === taskId)
  return task ? <TaskDetail task={task} key={task.id} /> : <TaskMissing />
}

function TaskDetail({ task }: { task: Task }) {
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'delete' | 'time' | null>(null)
  const [error, setError] = useState('')
  const dateLabel = formatDate(task.date, { dateStyle: 'long' })
  const completed = task.status === 'completed'

  function update(patch: Partial<TaskDraft>) {
    try {
      taskRepository.update(task.id, patch)
      setError('')
      setDialog(null)
    } catch (error) {
      setError(error instanceof ScheduleConflictError ? error.message : 'Не удалось сохранить изменения задачи.')
    }
  }

  function remove() {
    try {
      taskRepository.remove(task.id)
      navigate(paths.tasks, { replace: true })
    } catch {
      setError('Не удалось удалить задачу.')
    }
  }

  return (
    <div className={styles.page}>
      <RhythmHeader title={task.title} subtitle={taskTypes[task.type] + ' · ' + dateLabel} backTo={paths.tasks} backLabel="К списку задач" />
      <div className={styles.columns}>
        <section className={styles.detail}>
          <div className={styles.badges}>
            <span className={styles.badge}>{taskStatuses[task.status]}</span>
            <span className={styles.badge} data-type={task.type}>{taskTypes[task.type]}</span>
          </div>
          <h2>{task.title}</h2>
          <dl className={styles.metrics}>
            <div><dt>Дата</dt><dd>{dateLabel}</dd></div>
            <div><dt>Время</dt><dd>{formatTaskRange(task.startTime, task.duration)}</dd></div>
            <div><dt>Длительность</dt><dd>{task.duration === null ? 'Не указана' : task.duration + ' мин.'}</dd></div>
          </dl>
          <h3>Описание</h3>
          {task.description && <p className={styles.detailDescription}>{task.description}</p>}
          <div className={styles.interval}><strong>Планы изменились? Это нормально.</strong><p>Можно вручную изменить время начала задачи.</p></div>
          {!dialog && error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.detailActions}>
            <Link className={styles.secondary} to={taskPath(task.id) + '/edit'}>Изменить</Link>
            <button className={styles.button} type="button" onClick={() => { setError(''); setDialog('time') }}>Перенести</button>
            <button className={styles.primary} type="button" onClick={() => update({ status: completed ? 'planned' : 'completed' })}>{completed ? 'Вернуть в план' : '✓ Выполнить'}</button>
            <button className={styles.danger} type="button" onClick={() => { setError(''); setDialog('delete') }}>Удалить</button>
          </div>
        </section>
        <TaskContext mode="detail" date={task.date} startTime={task.startTime} duration={task.duration} />
      </div>
      <RhythmDisclaimer />
      {dialog === 'delete' && (
        <TaskDialog title="Удалить задачу?" onClose={() => setDialog(null)}>
          <p>Задача исчезнет из списка и с главной страницы.</p>
          <strong>{task.title}</strong>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button className={styles.button} type="button" onClick={() => setDialog(null)}>Отмена</button>
            <button className={styles.danger} type="button" onClick={remove}>Удалить задачу</button>
          </div>
        </TaskDialog>
      )}
      {dialog === 'time' && (
        <TaskTimeDialog date={task.date} startTime={task.startTime} duration={task.duration} error={error} onClose={() => setDialog(null)} onConfirm={(startTime, date) => update({ startTime, date })} />
      )}
    </div>
  )
}
