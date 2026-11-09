import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths, taskPath } from '../../app/router/paths'
import { dateInTimeZone, formatDate } from '../../shared/lib/calendar'
import { Select } from '../../shared/ui/pickers/Select'
import { RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { demoProfile } from '../profile/demoProfile'
import { compareByDate, isTaskStatus, isTaskType, matchesScope, taskStatuses, taskStatusOptions, taskTypes } from './model'
import type { TaskScope, TaskType } from './model'
import { TaskDialog } from './TaskDialog'
import { taskRepository } from './taskRepository'
import { useTasks } from './useTasks'
import styles from './Tasks.module.css'

const scopes: { id: TaskScope; label: string }[] = [
  { id: 'all', label: 'Все задачи' },
  { id: 'today', label: 'Сегодня' },
  { id: 'upcoming', label: 'Предстоящие' },
  { id: 'completed', label: 'Выполнено' },
]

export function TasksPage() {
  const tasks = useTasks()
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<'search' | 'type' | null>(null)
  const [error, setError] = useState('')
  const today = dateInTimeZone(new Date(), demoProfile.timeZone)
  const query = params.get('q') ?? ''
  const scope = scopes.find((item) => item.id === params.get('scope'))?.id ?? 'all'
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

  function reset() {
    setParams({})
    setDialog(null)
  }

  function complete(id: string, checked: boolean) {
    try {
      taskRepository.update(id, { status: checked ? 'completed' : 'planned' })
      setError('')
    } catch {
      setError('Не удалось сохранить статус задачи.')
    }
  }

  return (
    <div className={styles.page}>
      <RhythmHeader title="Мои задачи" subtitle="Всё важное — в одном месте" backTo={paths.dashboard} />
      <div className={styles.summary}>
        {[
          { label: 'Всего задач', value: tasks.length },
          { label: 'На сегодня', value: counts.today, hint: formatDate(today, { dateStyle: 'long' }) },
          { label: 'В процессе', value: tasks.filter((task) => task.status === 'inProgress').length },
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
          <div className={styles.search}>
            <button type="button" aria-label="Поиск и фильтры" onClick={() => setDialog('search')}>⌕</button>
            <input type="search" aria-label="Поиск задачи" placeholder="Найти задачу…" value={query} onChange={(event) => filter('q', event.currentTarget.value, true)} />
          </div>
          <button className={styles.button} type="button" onClick={() => setDialog('search')}>Статус: {status ? taskStatuses[status] : 'все'} ▾</button>
          <button className={styles.button} type="button" onClick={() => setDialog('type')}>Тип: {type ? taskTypes[type] : 'все'} ▾</button>
          <Link className={styles.primary} to={paths.taskNew}>+ Новая задача</Link>
        </div>
        <div className={styles.scopes} role="group" aria-label="Период и выполнение">
          {scopes.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={scope === id} onClick={() => filter('scope', id === 'all' ? '' : id)}>{label} · {counts[id]}</button>
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
                <td><input type="checkbox" aria-label={'Выполнена: ' + task.title} checked={task.status === 'completed'} onChange={(event) => complete(task.id, event.currentTarget.checked)} /></td>
                <td><Link to={taskPath(task.id)}>{task.title}</Link></td>
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
            <h3>{tasks.length ? 'Ничего не найдено' : 'Пока нет задач'}</h3>
            <p>{tasks.length ? 'Попробуйте другой запрос или сбросьте фильтры.' : 'Создайте задачу, чтобы добавить её в список.'}</p>
            {tasks.length > 0 && <button type="button" className={styles.secondary} onClick={reset}>Сбросить фильтры</button>}
            <Link className={styles.primary} to={paths.taskNew}>+ Создать задачу</Link>
          </div>
        )}
      </section>
      <RhythmDisclaimer />

      {dialog === 'search' && (
        <TaskDialog title="Поиск и фильтры" onClose={() => setDialog(null)}>
          <label className={styles.field}>Поиск задачи
            <input type="search" value={query} onChange={(event) => filter('q', event.currentTarget.value, true)} />
          </label>
          <Select label="Статус" value={status ?? ''} options={[{ value: '', label: 'Все статусы' }, ...taskStatusOptions]}
            onChange={(value) => { filter('status', value); setDialog(null) }} />
          {scopes.map(({ id, label }) => <button key={id} className={styles.button} type="button" onClick={() => { filter('scope', id === 'all' ? '' : id); setDialog(null) }}>{label}</button>)}
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
