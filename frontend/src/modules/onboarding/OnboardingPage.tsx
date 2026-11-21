import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../app/router/paths'
import { addDays, dateInTimeZone, timeInTimeZone } from '../../shared/lib/calendar'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { PlannerDialog } from '../planner/PlannerDialog'
import styles from '../planner/Planner.module.css'
import taskStyles from '../tasks/Tasks.module.css'
import { planningDate, planningInterval } from '../schedule/dayPlan'
import { chronotypes, isPlanning } from '../settings/preferences'
import type { Chronotype } from '../settings/preferences'
import { preferencesRepository } from '../settings/preferencesRepository'
import { timeToMinute } from '../tasks/timeIntervals'
import { usePreferences } from '../settings/usePreferences'

const options = (Object.entries(chronotypes) as [Chronotype, typeof chronotypes[Chronotype]][])
  .map(([value, data]) => ({ value, label: data.label }))

export function OnboardingPage() {
  const preferences = usePreferences()
  const { timeZone } = preferences
  const [birthDate, setBirthDate] = useState(preferences.birthDate ?? '')
  const [chronotype, setChronotype] = useState(preferences.chronotype)
  const [hours, setHours] = useState(preferences.planning)
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const { pending, run } = usePendingAction()
  const navigate = useNavigate()
  const today = dateInTimeZone(new Date(), timeZone)

  function start() { void run(async () => {
    if (!birthDate || birthDate > today || !isPlanning(hours)) {
      setError('Укажите дату рождения и разные границы времени бодрствования.'); return
    }
    try {
      if (preferences.isDemo) await preferencesRepository.savePlanner(hours, { birthDate, chronotype })
      else await preferencesRepository.saveSettings(preferences.settings, timeZone, hours)
      const now = new Date()
      const civilDate = dateInTimeZone(now, timeZone)
      const time = timeInTimeZone(now, timeZone)
      const target = planningDate(civilDate, time, hours)
      const { end } = planningInterval(hours)
      const minute = timeToMinute(time) + (target === civilDate ? 0 : 1440)
      setDate(minute + 1 >= end ? addDays(target, 1) : target)
      setError('')
    } catch {
      setError('Не удалось сохранить параметры в этом браузере.')
    }
  }) }

  return <main className={styles.onboarding}>
    <h1>Первый план дня</h1>
    <p>Настройте период бодрствования, затем добавьте задачи. Параметры сохраняются в этом браузере.</p>
    <form className={styles.body} inert={pending} onSubmit={event => { event.preventDefault(); start() }}>
      {preferences.isDemo && <div className={styles.onboardingFields}>
        <DatePicker timeZone={timeZone} label="Дата рождения" value={birthDate || today} displayValue={birthDate ? undefined : 'Выберите дату рождения'} maxDate={today} onChange={setBirthDate} />
        <Select label="Хронотип" value={chronotype} options={options} onChange={setChronotype} />
      </div>}
      <div className={styles.onboardingFields}>
        <TimePicker label="Время пробуждения" value={hours.wakeTime} onChange={wakeTime => setHours({ ...hours, wakeTime })} />
        <TimePicker label="Время отхода ко сну" value={hours.sleepTime} onChange={sleepTime => setHours({ ...hours, sleepTime })} />
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button className={taskStyles.primary + ' ' + styles.primary} type="submit" disabled={pending}>Сохранить параметры и добавить задачи</button>
        <Link className={taskStyles.button} to={paths.dashboard}>Пропустить</Link>
      </div>
    </form>
    {date && <PlannerDialog date={date} onClose={() => setDate('')} onApplied={() => navigate(paths.schedule + '?date=' + date)} />}
  </main>
}
