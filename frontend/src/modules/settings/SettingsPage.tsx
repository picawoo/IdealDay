import { useState } from 'react'
import { Link } from 'react-router'
import { useUnsavedChanges } from '../../app/pwa/unsavedChanges'
import { paths } from '../../app/router/paths'
import { RhythmDisclaimer, RhythmHeader } from '../biorhythms/RhythmControls'
import { SystemNotificationSetting } from '../notifications/SystemNotificationSetting'
import { exportPreferences } from './exportPreferences'
import { preferencesRepository } from './preferencesRepository'
import { SaveConfirmation } from './SaveConfirmation'
import { TimeZoneField } from './TimeZoneField'
import { usePreferences } from './usePreferences'
import type { LocalSettings } from './preferences'
import styles from './Preferences.module.css'

const notifications = [
  { key: 'taskReminders', title: 'Напоминать о задачах', description: 'За 15 минут до начала' },
  { key: 'cycleTransitions', title: 'Переходы циклов', description: 'Нейтральное напоминание без тревожных формулировок' },
  { key: 'weeklyEmail', title: 'Еженедельное письмо', description: 'Краткий обзор плана по воскресеньям' },
] as const

export function SettingsPage() {
  const { settings, timeZone } = usePreferences()
  const [changes, setChanges] = useState<Partial<LocalSettings>>({})
  const [zone, setZone] = useState<string>()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const values = { ...settings, ...changes }
  const selectedTimeZone = zone ?? timeZone
  useUnsavedChanges(selectedTimeZone !== timeZone || notifications.some(({ key }) => values[key] !== settings[key]))

  function save() {
    try {
      preferencesRepository.saveSettings(values, selectedTimeZone)
      setChanges({})
      setZone(undefined)
      setError('')
      setSaved(true)
    } catch {
      setError('Не удалось сохранить настройки в этом браузере.')
    }
  }

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
        <form className={`${styles.panel} ${styles.settingsPanel}`} onSubmit={(event) => { event.preventDefault(); save() }}>
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
          <h3>Язык и время</h3>
          <div className={styles.fields}>
            <label className={styles.field}>Язык<input value="Русский" readOnly /></label>
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
          <button className={styles.secondary} type="button" onClick={download}>Выгрузить мои данные</button>
          {exportError && <p className={styles.error} role="alert">{exportError}</p>}
          <h3>О модели биоритмов</h3>
          <p>Три синусоиды с периодами 23, 28 и 33 дня. Прогностическая ценность модели научно не подтверждена.</p>
          <p>Не используйте расчёт для медицинских решений, оценки рисков и отмены лечения.</p>
          <Link className={styles.button} to={paths.profile}>Открыть профиль →</Link>
          <SystemNotificationSetting buttonClassName={styles.secondary} />
          <p className={styles.footnote}>Предпочтения хранятся в этом браузере. Еженедельное письмо, смена пароля, выход и удаление аккаунта пока недоступны.</p>
        </aside>
      </div>
      <RhythmDisclaimer />
      {saved && <SaveConfirmation title="Настройки сохранены" onClose={() => setSaved(false)} />}
    </div>
  )
}
