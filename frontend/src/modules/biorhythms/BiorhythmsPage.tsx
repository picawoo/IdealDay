import { Link } from 'react-router'
import { paths } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { usePreferences } from '../settings/usePreferences'
import { CycleCards } from './CycleCards'
import { upcomingTransitions } from './model'
import { RhythmCalendar } from './RhythmCalendar'
import { RhythmChart } from './RhythmChart'
import { RhythmDisclaimer, RhythmHeader } from './RhythmControls'
import { useRhythmDate } from './useRhythmDate'
import styles from './Rhythm.module.css'

export function BiorhythmsPage() {
  const { date, period, tab, setDate, setPeriod, setTab } = useRhythmDate('month')
  const calendar = tab === 'calendar'
  const { profile: { birthDate } } = usePreferences()
  const dateLabel = formatDate(date, calendar ? { month: 'long', year: 'numeric' } : { dateStyle: 'long' }).replace(/ г\.$/, '')

  return (
    <div className={styles.page}>
      <RhythmHeader
        title={calendar ? 'Календарь ритмов' : 'Ваши биоритмы'}
        subtitle={(calendar ? dateLabel + ' · Планируйте с запасом' : 'Условная модель циклов · ' + dateLabel)}
        backTo={paths.dashboard + '?date=' + date}
      />
      <div className={styles.viewTabs} role="group" aria-label="Разделы биоритмов">
        <button type="button" aria-pressed={!calendar} onClick={() => setTab('cycles')}>Мои биоритмы</button>
        <button type="button" aria-pressed={calendar} onClick={() => setTab('calendar')}>Календарь ритмов</button>
        <Link className={styles.plainLink} to={paths.schedule + '?date=' + date}>Расписание →</Link>
      </div>
      {calendar ? (
        <RhythmCalendar date={date} birthDate={birthDate} period={period} onDate={setDate} onPeriod={setPeriod} />
      ) : (
        <>
          <CycleCards date={date} birthDate={birthDate} />
          <RhythmChart title="Динамика трёх циклов" date={date} birthDate={birthDate} period={period} onDate={setDate} onPeriod={setPeriod} showMonth />
          <div className={styles.explanationColumns}>
            <section className={styles.explanation}>
              <h2>Как читать график</h2>
              <p className={styles.formula}>Значение = sin(2π × дней с рождения / период) × 100%.</p>
              <p>Выше нуля — положительная фаза модели. Ниже нуля — отрицательная. Точка перехода через ноль условно называется критическим днём.</p>
              <p>Планируйте по реальному самочувствию и обязательствам.</p>
            </section>
            <section className={styles.explanation}>
              <h2>Ближайшие критические дни</h2>
              <ul className={styles.transitions}>
                {upcomingTransitions(birthDate, date).map(({ date: day, cycle }) => (
                  <li key={day + cycle.id}>
                    <button type="button" onClick={() => setDate(day)}>{formatDate(day, { day: 'numeric', month: 'long' })}</button>
                    <strong data-cycle={cycle.id}>{cycle.label} · переход</strong>
                  </li>
                ))}
              </ul>
              <div className={styles.gentleNote}><strong>Не обязательно отменять планы</strong><p>Переходы модели — повод оставить гибкость.</p></div>
            </section>
          </div>
        </>
      )}
      <RhythmDisclaimer />
    </div>
  )
}
