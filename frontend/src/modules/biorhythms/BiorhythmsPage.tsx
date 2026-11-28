import { paths } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { usePreferences } from '../settings/usePreferences'
import { CycleGuide } from './CycleGuide'
import { CycleCards } from './CycleCards'
import { transitionLabels, upcomingTransitions } from './model'
import { CalendarHelpButton } from './RhythmCalendarDialogs'
import { RhythmCalendar } from './RhythmCalendar'
import { RhythmChart } from './RhythmChart'
import { RhythmHeader } from './RhythmControls'
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
        subtitle={dateLabel}
        backTo={paths.dashboard + '?date=' + date}
      />
      <div className={styles.viewTabs} role="group" aria-label="Разделы биоритмов">
        <button type="button" aria-pressed={!calendar} onClick={() => setTab('cycles')}>Мои биоритмы</button>
        <button type="button" aria-pressed={calendar} onClick={() => setTab('calendar')}>Календарь ритмов</button>
        <CalendarHelpButton />
      </div>
      {calendar ? (
        <RhythmCalendar date={date} birthDate={birthDate} period={period} onDate={setDate} onPeriod={setPeriod} />
      ) : (
        <>
          <CycleCards date={date} birthDate={birthDate} showDetails />
          <RhythmChart title="Динамика трёх циклов" date={date} birthDate={birthDate} period={period} onDate={setDate} onPeriod={setPeriod} showMonth />
          <div className={styles.explanationColumns}>
            <section className={styles.explanation}>
              <h2>Как читать график</h2>
              <CycleGuide />
              <p>Дневные значения могут немного менять порядок задач и выбор свободного окна. Подробности есть в справке.</p>
            </section>
            <section className={styles.explanation}>
              <h2>Ближайшие переходы модели</h2>
              <ul className={styles.transitions}>
                {upcomingTransitions(birthDate, date).map(({ date: day, cycles, count }) => (
                  <li key={day}>
                    <button type="button" onClick={() => setDate(day)}>{formatDate(day, { day: 'numeric', month: 'long' })}</button>
                    <strong>{transitionLabels[count]} · {cycles.map(cycle => cycle.label).join(', ')}</strong>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
