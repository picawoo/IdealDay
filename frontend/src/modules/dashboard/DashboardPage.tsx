import { Link } from 'react-router'
import { paths, taskPath } from '../../app/router/paths'
import { addDays, dateInTimeZone, formatDate } from '../../shared/lib/calendar'
import { CycleCards } from '../biorhythms/CycleCards'
import { cycleOnDate, cycles, formatPercent } from '../biorhythms/model'
import { RhythmChart } from '../biorhythms/RhythmChart'
import { DateField, RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { useRhythmDate } from '../biorhythms/useRhythmDate'
import { demoProfile } from '../profile/demoProfile'
import { compareByDate, formatTaskRange, taskStatuses, taskTypes } from '../tasks/model'
import { useTasks } from '../tasks/useTasks'
import { getDemoPlan } from './demoPlan'
import styles from '../biorhythms/Rhythm.module.css'

export function DashboardPage() {
  const { date, period, setDate, setPeriod } = useRhythmDate('week')
  const readings = cycles.map((cycle) => cycleOnDate(demoProfile.birthDate, date, cycle))
  const transitions = readings.filter((reading) => reading.critical)
  const critical = transitions.length > 0
  const demoPlan = getDemoPlan(date)
  const tasks = useTasks().filter((task) => task.date === date).sort(compareByDate)
  const dayLabel = formatDate(date, { day: 'numeric', month: 'long' })
  const weekday = formatDate(date, { weekday: 'long' })

  return (
    <div className={styles.page}>
      <RhythmHeader
        title={critical ? 'День в бережном режиме' : 'Доброе утро, ' + demoProfile.firstName}
        subtitle={weekday.charAt(0).toUpperCase() + weekday.slice(1) + ' · Демонстрационный профиль'}
      >
        <div className={styles.dateNavigation} role="group" aria-label="Выбор дня">
          <button type="button" aria-label="Предыдущий день" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <DateField date={date} onChange={setDate} />
          <button type="button" aria-label="Следующий день" onClick={() => setDate(addDays(date, 1))}>›</button>
          <button type="button" className={styles.softButton} onClick={() => setDate(dateInTimeZone(new Date(), demoProfile.timeZone))}>Сегодня</button>
        </div>
      </RhythmHeader>

      {critical && (
        <section className={styles.criticalNotice} aria-label="Критический день модели">
          <h2>△ Критический день модели: выберите щадящий темп</h2>
          <p>{transitions.map((cycle) => cycle.label).join(', ')} · переход через ноль. Это математический переход, без прогноза состояния здоровья.</p>
        </section>
      )}

      <CycleCards birthDate={demoProfile.birthDate} date={date} />

      <div className={styles.dashboardColumns} data-critical={critical}>
        <RhythmChart
          title={critical ? 'Переходы циклов' : 'Ваш ритм'}
          date={date}
          birthDate={demoProfile.birthDate}
          period={period}
          onPeriod={setPeriod}
          onDate={setDate}
        />
        <aside className={critical ? styles.gentleAdvice : styles.advice} aria-label="Рекомендация">
          {critical ? (
            <>
              <h2>План без перегрузки</h2>
              <p>Выбранный день: {dayLabel}. Сохраняйте запас времени. Циклы не определяют ваше самочувствие.</p>
              <dl><div><dt>Фокус-сессия</dt><dd>до 45 минут</dd></div><div><dt>Перерывы</dt><dd>каждые 45 минут</dd></div></dl>
              <button className={styles.primaryButton} type="button" disabled title="Автоплан пока недоступен">Пересобрать мой день</button>
            </>
          ) : (
            <>
              <span className={styles.focusLabel}>Сегодня в фокусе</span>
              <h2>Важное —<br />в первой половине дня</h2>
              <strong>{demoProfile.focusWindow}</strong>
              <p>Утреннее окно из демонстрационного профиля. Интеллектуальный цикл модели: {formatPercent(readings[2].percent)}. Ориентируйтесь на самочувствие.</p>
              <p className={styles.breakAdvice}>Оставьте 15 минут на перерыв.</p>
            </>
          )}
        </aside>
      </div>

      <section className={styles.plan} data-critical={critical} aria-label="Задачи дня">
        <div className={styles.planHeader}>
          <h2>{dayLabel} · {critical ? 'Бережный план' : 'Задачи дня'}</h2>
          <Link className={styles.softButton} to={paths.taskNew + '?date=' + date}>+ Добавить задачу</Link>
          <Link className={styles.plainLink} to={paths.schedule + '?date=' + date}>Расписание →</Link>
        </div>
        <div className={styles.planRows}>
          {tasks.map((task) => (
            <div className={styles.planRow} key={task.id}>
              <Link className={styles.taskName} to={taskPath(task.id)}>{task.title}</Link>
              <span className={styles.taskCategory} data-category={taskTypes[task.type]}>{taskTypes[task.type]}</span>
              <span>{formatTaskRange(task.startTime, task.duration)}</span>
              <span>{taskStatuses[task.status]}</span>
            </div>
          ))}
          {!tasks.length && <p className={styles.subtitle}>На этот день нет ваших задач.</p>}
        </div>
        {demoPlan.length > 0 && <div className={styles.planRows} role="group" aria-label="Демонстрационные задачи">
          <h3 className={styles.demoPlanHeading}>
            Демонстрационные задачи
            {critical && <span className={styles.lightLoad}>Низкая нагрузка</span>}
          </h3>
          {demoPlan.map((task) => (
            <div className={styles.planRow} key={task.title}>
              <span className={styles.taskName}><input type="checkbox" aria-label={task.title} checked={Boolean(task.done)} disabled />{task.title}</span>
              <span className={styles.taskCategory} data-category={task.category}>{task.category}</span>
              <span>{task.time}</span>
              <span>{task.done ? 'Выполнено' : 'Запланировано'}</span>
            </div>
          ))}
        </div>}
      </section>
      <RhythmDisclaimer />
    </div>
  )
}
