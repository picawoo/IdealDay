import { useState } from 'react'
import { Link } from 'react-router'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { useUnsavedChanges } from '../../app/pwa/unsavedChanges'
import { paths } from '../../app/router/paths'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { SystemNotificationSetting } from '../notifications/SystemNotificationSetting'
import { durationLabel, planningInterval } from '../schedule/dayPlan'
import { exportPreferences } from './exportPreferences'
import { preferencesRepository } from './preferencesRepository'
import { SaveConfirmation } from './SaveConfirmation'
import { TimeZoneField } from './TimeZoneField'
import { usePreferences } from './usePreferences'
import { isPlannerPreferences, isPlanning, notificationDays } from './preferences'
import type { LocalSettings, NotificationDays } from './preferences'
import { PlannerPreferencesFields } from '../planner/PlannerPreferencesFields'
import type { PlannerPreferences } from './preferences'
import styles from './Preferences.module.css'

const notifications = [
  { key: 'taskReminders', title: 'Напоминать о задачах', description: 'За 15 минут до начала' },
  { key: 'cycleTransitions', title: 'Переходы циклов', description: 'Нейтральное напоминание без тревожных формулировок' },
  { key: 'weeklyEmail', title: 'Еженедельное письмо', description: 'Краткий обзор плана по воскресеньям' },
] as const

export function SettingsPage() {
  const { settings, timeZone, planning, planner } = usePreferences()
  const [plannerChanges, setPlannerChanges] = useState<PlannerPreferences>()
  const { pending, run } = usePendingAction()
  const [wakeTime, setWakeTime] = useState<string>()
  const [sleepTime, setSleepTime] = useState<string>()
  const [changes, setChanges] = useState<Partial<LocalSettings>>({})
  const [zone, setZone] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const values = { ...settings, ...changes }
  const selectedTimeZone = zone ?? timeZone
  const hours = { wakeTime: wakeTime ?? planning.wakeTime, sleepTime: sleepTime ?? planning.sleepTime }
  const range = planningInterval(hours)
  const keepDays = values.notificationDays ?? 2
  useUnsavedChanges(!!plannerChanges || selectedTimeZone !== timeZone || notifications.some(({ key }) => values[key] !== settings[key])
    || keepDays !== (settings.notificationDays ?? 2) || hours.wakeTime !== planning.wakeTime || hours.sleepTime !== planning.sleepTime)

  function save() { void run(async () => {
    if (!isPlanning(hours)) { setError('Время пробуждения и отхода ко сну должно различаться.'); return }
    try {
      if (plannerChanges && !isPlannerPreferences(plannerChanges)) { setError('Укажите разные границы для предпочтительных окон.'); return }
      await preferencesRepository.saveSettings({ ...values, notificationDays: keepDays }, selectedTimeZone, hours, plannerChanges)
      setPlannerChanges(undefined)
      setChanges({})
      setZone(undefined)
      setWakeTime(undefined)
      setSleepTime(undefined)
      setError('')
      setSaved(true)
    } catch {
      setError('Не удалось сохранить настройки в этом браузере.')
    }
  }) }

  function download() {
    try {
      exportPreferences()
      setExportError('')
    } catch {
      setExportError('Не удалось прочитать локальные данные для выгрузки.')
    }
  }

  return (
    <div className={styles.page}>
      <RhythmHeader title="Настройки" subtitle="Уведомления, приватность и аккаунт" backTo={paths.dashboard} />
      <div className={styles.columns}>
        <form className={`${styles.panel} ${styles.settingsPanel}`} inert={pending} onSubmit={(event) => { event.preventDefault(); save() }}>
          <h2>Уведомления</h2>
          {notifications.map(({ key, title, description }) => (
            <label key={key} className={styles.notification}>
              <strong id={key}>{title}</strong>
              <span id={key + '-description'} className={styles.muted}>{description}</span>
              <span className={styles.switch}>
                <input type="checkbox" role="switch" checked={values[key]} aria-labelledby={key} aria-describedby={key + '-description'}
                  onChange={(event) => { const checked = event.currentTarget.checked; setChanges((previous) => ({ ...previous, [key]: checked })) }} />
                <span aria-hidden="true" className={styles.track} />
              </span>
            </label>
          ))}
          <Select label="Хранить историю уведомлений" value={String(keepDays)}
            options={notificationDays.map(day => ({ value: String(day), label: `${day} ${day === 1 ? 'день' : day === 2 ? 'дня' : 'дней'}` }))}
            onChange={value => setChanges(previous => ({ ...previous, notificationDays: Number(value) as NotificationDays }))} />
          <section className={styles.account}>
            <h3>Настройки планирования</h3>
            <div className={styles.fields}>
              <TimePicker label="Время пробуждения" value={hours.wakeTime} onChange={setWakeTime} />
              <TimePicker label="Время отхода ко сну" value={hours.sleepTime} onChange={setSleepTime} />
            </div>
            <p className={styles.muted}>Время для планирования: {isPlanning(hours) ? durationLabel(range.end - range.start) : '—'}{range.end >= 1440 && isPlanning(hours) ? ' · до следующего дня' : ''}. Эти настройки задают основной диапазон расписания.</p>
          </section>
          <PlannerPreferencesFields value={plannerChanges ?? planner ?? {}} onChange={setPlannerChanges} />
          <div className={styles.timeZone}>
            <TimeZoneField value={selectedTimeZone} onChange={setZone} />
          </div>
          <section className={styles.account}>
            <h3>Аккаунт</h3>
            <div className={styles.accountActions}>
              <button className={styles.secondary} type="button" disabled>Изменить пароль</button>
              <button className={styles.button} type="button" disabled>Выйти из аккаунта</button>
              <button className={styles.danger} type="button" disabled>Удалить аккаунт</button>
            </div>
          </section>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.settingsFooter}>
            <button className={styles.save} type="submit">Сохранить настройки</button>
          </div>
        </form>
        <aside className={styles.aside}>
          <h2>Ваши данные —<br />под вашим контролем</h2>
          <p>Дата рождения используется в формуле циклов. Хронотип — для удобных временных окон.</p>
          <button className={styles.primary} type="button" onClick={download}>Выгрузить мои данные</button>
          {exportError && <p className={styles.error} role="alert">{exportError}</p>}
          <Link className={styles.button} to={paths.profile}>Открыть профиль →</Link>
          <SystemNotificationSetting buttonClassName={styles.secondary} />
          <p className={styles.footnote}>Предпочтения хранятся в этом браузере. Еженедельное письмо, смена пароля, выход и удаление аккаунта пока недоступны.</p>
        </aside>
      </div>
      {saved && <SaveConfirmation title="Настройки сохранены" onClose={() => setSaved(false)} />}
    </div>
  )
}
