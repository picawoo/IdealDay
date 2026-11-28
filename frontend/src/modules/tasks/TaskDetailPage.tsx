import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { taskDestination } from '../../app/router/taskReturn'
import { taskPath } from '../../app/router/paths'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { formatDate } from '../../shared/lib/calendar'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { formatTaskRange, taskStatuses, taskTypes } from './model'
import type { Task, TaskDraft } from './model'
import { TaskMarkers } from './TaskMarkers'
import { ruleLabel } from './recurrence'
import type { Scope } from './recurrence'
import { RecurrenceScopeDialog } from './RecurrenceScopeDialog'
import { TaskContext } from './TaskContext'
import { TaskDialog } from './TaskDialog'
import { TaskMissing } from './TaskFormPage'
import { TaskTimeDialog } from './TaskTimeDialog'
import { taskRepository, taskWriteError } from './taskRepository'
import { useTask } from './useTasks'
import styles from './Tasks.module.css'

export function TaskDetailPage() {
  const { taskId } = useParams()
  return <TaskDetailRoute key={taskId} taskId={taskId} />
}

function TaskDetailRoute({ taskId }: { taskId?: string }) {
  const task = useTask(taskId)
  const [initial] = useState(task)
  const displayed = task ?? initial
  return displayed ? <TaskDetail task={displayed} removed={!task} /> : <TaskMissing />
}

function TaskDetail({ task, removed }: { task: Task; removed: boolean }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { state } = useLocation()
  const back = taskDestination(params, state)
  const { pending, run } = usePendingAction()
  const [dialog, setDialog] = useState<'delete' | 'time' | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState<number>()
  const dateLabel = formatDate(task.date, { dateStyle: 'long' })
  const completed = task.status === 'completed'

  function update(patch: Partial<TaskDraft>) { void run(async () => {
    try {
      await taskRepository.update(task.id, patch, dialog === 'time' ? version : undefined)
      setError('')
      setDialog(null)
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось сохранить изменения задачи.'))
    }
  }) }

  function remove(scope: Scope = 'one') { void run(async () => {
    try {
      if (scope !== 'one' && task.recurrence) {
        await taskRepository.changeSeries({ ...task, recurrence: { ...task.recurrence, version: version ?? task.recurrence.version } }, scope)
      } else await taskRepository.remove(task.id, version)
      navigate(back.to, { replace: true, state: back.state })
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось удалить задачу.'))
    }
  }) }

  if (removed && !dialog && !pending) return <TaskMissing />

  return (
    <div className={styles.page}>
      <RhythmHeader title={task.title} subtitle={taskTypes[task.type] + ' · ' + dateLabel} backTo={back.to} backState={back.state} backLabel={back.label} />
      <div className={styles.columns}>
        <section className={styles.detail}>
          <div className={styles.badges}>
            <span className={styles.badge}>{taskStatuses[task.status]}</span>
            <span className={styles.badge} data-type={task.type}>{taskTypes[task.type]}</span>
          </div>
          <h2>{task.title} <TaskMarkers task={task} /></h2>
          {task.recurrence && <p>{task.recurrence.rule ? ruleLabel(task.recurrence.rule) : 'История повторения'}{task.recurrence.rule?.until && ' · до ' + formatDate(task.recurrence.rule.until, { dateStyle: 'short' })}</p>}
          <dl className={styles.metrics}>
            <div><dt>Дата</dt><dd>{dateLabel}</dd></div>
            <div><dt>Время</dt><dd>{formatTaskRange(task.startTime, task.duration)}</dd></div>
            <div><dt>Длительность</dt><dd>{task.duration === null ? 'Не указана' : task.duration + ' мин.'}</dd></div>
          </dl>
          <h3>Описание</h3>
          {task.description && <p className={styles.detailDescription}>{task.description}</p>}
          {!dialog && error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.detailActions}>
            <Link className={styles.secondary} to={taskPath(task.id) + '/edit' + (params.size ? `?${params}` : '')} state={state}>Изменить</Link>
            <button className={styles.button} type="button" disabled={pending} onClick={() => { setError(''); setVersion(task.recurrence?.version); setDialog('time') }}>Перенести</button>
            <button className={styles.primary} type="button" disabled={pending} onClick={() => update({ status: completed ? 'planned' : 'completed' })}>{completed ? 'Вернуть в план' : '✓ Выполнить'}</button>
            <button className={styles.danger} type="button" disabled={pending} onClick={() => { setError(''); setVersion(task.recurrence?.version); setDialog('delete') }}>Удалить</button>
          </div>
        </section>
        <TaskContext mode="detail" date={task.date} startTime={task.startTime} duration={task.duration} reasons={task.plannerReasons} />
      </div>
      {dialog === 'delete' && task.recurrence && <RecurrenceScopeDialog action="delete" pending={pending} error={error} close={() => setDialog(null)} confirm={remove} />}
      {dialog === 'delete' && !task.recurrence && (
        <TaskDialog title="Удалить задачу?" onClose={() => { if (!pending) setDialog(null) }}>
          <p>Задача исчезнет из списка и с главной страницы.</p>
          <strong>{task.title}</strong>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.dialogActions}>
            <button className={styles.button} type="button" disabled={pending} onClick={() => setDialog(null)}>Отмена</button>
            <button className={styles.danger} type="button" disabled={pending} onClick={() => remove()}>Удалить задачу</button>
          </div>
        </TaskDialog>
      )}
      {dialog === 'time' && (
        <TaskTimeDialog date={task.date} startTime={task.startTime} duration={task.duration} error={error} pending={pending} onClose={() => setDialog(null)} onConfirm={(startTime, date) => update({ startTime, date })} />
      )}
    </div>
  )
}
