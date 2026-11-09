import { cycleOnDate, cycles, formatPercent } from '../biorhythms/model'
import { demoProfile } from '../profile/demoProfile'
import { formatTaskRange, isPositiveDuration } from './model'
import styles from './Tasks.module.css'

export function TaskContext({ mode, startTime, duration, date, onChooseTime }: {
  mode: 'form' | 'detail'
  startTime: string
  duration: number | null
  date: string
  onChooseTime?: () => void
}) {
  const reading = date ? cycleOnDate(demoProfile.birthDate, date, cycles[2]) : null
  const formattedTime = startTime && (duration === null || isPositiveDuration(duration)) ? formatTaskRange(startTime, duration) : null

  return (
    <aside className={styles.context} aria-label="Контекст времени">
      {mode === 'form' && <span className={styles.badge}>Подходящее время</span>}
      <h2>{mode === 'form' ? 'Сложное — пока голова свежая' : 'Почему это время?'}</h2>
      <strong className={mode === 'form' ? styles.chronotype : styles.bigTime}>
        {mode === 'form' ? 'Жаворонок' : formattedTime}
      </strong>
      <p>{mode === 'form' ? 'Утреннее окно фокуса из демонстрационного профиля.' : 'Время, выбранное вручную при планировании задачи.'}</p>
      <div className={styles.contextCard}>
        <strong>Интеллектуальный цикл</strong>
        <p>{reading ? 'Значение модели: ' + formatPercent(reading.percent) : 'Выберите дату задачи.'}</p>
      </div>
      <div className={styles.contextCard}>
        <strong>Ваш хронотип</strong>
        <p>Демонстрационное окно фокуса · {demoProfile.focusWindow}</p>
      </div>
      {formattedTime && <div className={styles.contextCard}><strong>Длительность</strong><p>{duration === null ? 'Не указана' : duration + ' мин.'}</p></div>}
      <p>Биоритмы — условная модель. Выбирайте время по самочувствию.</p>
      {onChooseTime && <button className={styles.secondary} type="button" onClick={onChooseTime}>Выбрать другое время</button>}
    </aside>
  )
}
