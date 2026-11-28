import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { TaskOriginLink } from '../../app/router/TaskOriginLink'
import { paths, taskListContext } from '../../app/router/paths'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { addDays, dateInTimeZone, formatDate, parseDate } from '../../shared/lib/calendar'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { usePreferences } from '../settings/usePreferences'
import { compareByDate, isTaskStatus, isTaskType, matchesScope, taskStatuses, taskTypes } from './model'
import type { TaskScope, TaskType } from './model'
import { TaskSearch } from './TaskSearch'
import { TaskMarkers } from './TaskMarkers'
import { TaskDialog } from './TaskDialog'
import { taskRepository, taskWriteError } from './taskRepository'
import { useTasks } from './useTasks'
import styles from './Tasks.module.css'

const scopes: { id: TaskScope; label: string }[] = [
  { id: 'all', label: 'Все задачи' },
  { id: 'today', label: 'Сегодня' },
  { id: 'upcoming', label: 'Предстоящие' },
  { id: 'inProgress', label: 'В процессе' },
  { id: 'completed', label: 'Выполнено' },
]

export function TasksPage() {
  const { timeZone } = usePreferences()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<'search' | 'type' | null>(null)
  const [error, setError] = useState('')
  const today = dateInTimeZone(new Date(), timeZone)
  const range = parseDate(params.get('period')) ?? today
  const tasks = useTasks(addDays(range, -30), addDays(range, 30))
  const query = params.get('q') ?? ''
  const scope = scopes.find((item) => item.id === params.get('scope'))?.id ?? 'today'
  const context = taskListContext(params)
  const { pending, run } = usePendingAction()
  const statusParam = params.get('status')
  const status = isTaskStatus(statusParam) ? statusParam : null
  const typeParam = params.get('type')
  const type = isTaskType(typeParam) ? typeParam : null
  const descending = params.get('sort') === 'desc'
  const search = query.trim().toLocaleLowerCase('ru')
  const counts = Object.fromEntries(scopes.map(({ id }) => [id, tasks.filter((task) => matchesScope(task, id, today)).length]))
  const visible = tasks
    .filter((task) => matchesScope(task, scope, today)
      && (!type || task.type === type)
      && (!status || task.status === status)
      && task.title.toLocaleLowerCase('ru').includes(search))
    .sort((a, b) => descending ? compareByDate(b, a) : compareByDate(a, b))

  function filter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace })
  }

  function setScope(value: TaskScope) {
    const next = new URLSearchParams(params)
    next.set('scope', value)
    next.delete('status')
    setParams(next)
    setDialog(null)
  }

  function togglePlanned() {
    const next = new URLSearchParams(params)
    if (status === 'planned') next.delete('status')
    else {
      next.set('status', 'planned')
      next.set('scope', 'all')
    }
    setParams(next)
    setDialog(null)
  }

  function reset() {
    setParams({})
    setDialog(null)
  }

  function complete(id: string, checked: boolean) { void run(async () => {
    try {
      await taskRepository.update(id, { status: checked ? 'completed' : 'planned' })
      setError('')
    } catch (error) {
      setError(taskWriteError(error, 'Не удалось сохранить статус задачи.'))
    }
  }) }

  return (
    <div className={styles.page}>
      <RhythmHeader title="Мои задачи" subtitle="Всё важное — в одном месте" backTo={paths.dashboard} />
      <div className={styles.summary}>
        {[
          { label: 'Всего задач', value: tasks.length },
          { label: 'На сегодня', value: counts.today, hint: formatDate(today, { dateStyle: 'long' }) },
          { label: 'В процессе', value: counts.inProgress },
          { label: 'Выполнено', value: counts.completed },
        ].map(({ label, value, hint }) => (
          <div className={styles.stat} key={label}>
            <strong>{value}</strong><span>{label}</span>
            <small>{hint ?? 'В текущем списке'}</small>
          </div>
        ))}
      </div>

      <section className={styles.filters} aria-label="Фильтры задач">
        <div className={styles.filterBar}>
          <TaskSearch value={query} onChange={value => filter('q', value, true)} onFilters={() => setDialog('search')} />
          <button className={styles.button} type="button" onClick={() => setDialog('type')}>Тип: {type ? taskTypes[type] : 'все'} ▾</button>
          <Link className={styles.primary} to={paths.taskNew + context}>+ Новая задача</Link>
        </div>
        {status && <div className={styles.activeFilters}><button className={styles.secondary} type="button"
          aria-label={'Сбросить фильтр: ' + taskStatuses[status]} onClick={() => filter('status', '')}>{taskStatuses[status]} · ×</button></div>}
        {scope === 'all' && <div className={styles.seriesRange}>
          <button className={styles.button} type="button" onClick={() => filter('period', addDays(range, -61))}>Раньше</button>
          <span>Повторения: {addDays(range, -30)} — {addDays(range, 30)}</span>
          <button className={styles.button} type="button" onClick={() => filter('period', addDays(range, 61))}>Позже</button>
        </div>}
        <div className={styles.scopes} role="group" aria-label="Период и выполнение">
          {scopes.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>{label} · {counts[id]}</button>
          ))}
        </div>
      </section>

      <section className={styles.list} aria-label="Ваши задачи">
        <header className={styles.listHeader}>
          <h2>Ваши задачи</h2>
          <button type="button" aria-label={descending ? 'По дате: сначала поздние' : 'По дате: сначала ранние'} onClick={() => filter('sort', descending ? '' : 'desc')}>
            По дате {descending ? '↓' : '↑'}
          </button>
        </header>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <table className={styles.table}>
          <colgroup><col /><col /><col /><col /><col /></colgroup>
          <thead><tr><th scope="col" aria-label="Выполнение" /><th scope="col">Название</th><th scope="col">Тип</th><th scope="col" aria-sort={descending ? 'descending' : 'ascending'}>Время</th><th scope="col">Статус</th></tr></thead>
          <tbody>
            {visible.map((task) => (
              <tr key={task.id}>
                <td><input type="checkbox" aria-label={'Выполнена: ' + task.title} checked={task.status === 'completed'} disabled={pending} onChange={(event) => complete(task.id, event.currentTarget.checked)} /></td>
                <td><TaskOriginLink id={task.id}>{task.title}</TaskOriginLink> <TaskMarkers task={task} /></td>
                <td><span data-type={task.type}>{taskTypes[task.type]}</span></td>
                <td>
                  {formatDate(task.date, { day: 'numeric', month: 'short' })} · {task.startTime}
                  <small className={styles.taskDuration}>{task.duration === null ? 'Длительность не указана' : task.duration + ' мин.'}</small>
                </td>
                <td>{taskStatuses[task.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className={styles.empty}>
            <h3>{scope === 'today' && counts.today === 0 ? 'На сегодня пока нет задач' : tasks.length ? 'Ничего не найдено' : 'Пока нет задач'}</h3>
            <p>{tasks.length ? 'Попробуйте другой запрос или сбросьте фильтры.' : 'Создайте задачу, чтобы добавить её в список.'}</p>
            {tasks.length > 0 && <button type="button" className={styles.secondary} onClick={reset}>Сбросить фильтры</button>}
            <Link className={styles.primary} to={paths.taskNew + context}>+ Создать задачу</Link>
          </div>
        )}
      </section>

      {dialog === 'search' && (
        <TaskDialog title="Поиск и фильтры" onClose={() => setDialog(null)}>
          <TaskSearch value={query} onChange={value => filter('q', value, true)} />
          <button className={status === 'planned' ? styles.secondary : styles.button} type="button"
            aria-pressed={status === 'planned'} onClick={togglePlanned}>Только запланированные</button>
          <button className={styles.secondary} type="button" onClick={reset}>Сбросить фильтры</button>
        </TaskDialog>
      )}
      {dialog === 'type' && (
        <TaskDialog title="Фильтр по типу задачи" onClose={() => setDialog(null)}>
          <p>Выберите тип, чтобы увидеть подходящие задачи.</p>
          {(Object.keys(taskTypes) as TaskType[]).map((id) => (
            <button key={id} type="button" className={type === id ? styles.secondary : styles.button} onClick={() => { filter('type', id); setDialog(null) }}>{taskTypes[id]}</button>
          ))}
          {type && <button type="button" className={styles.secondary} onClick={() => { filter('type', ''); setDialog(null) }}>Все типы</button>}
        </TaskDialog>
      )}
    </div>
  )
}
