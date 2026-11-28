import { useRef, useState } from 'react'
import { usePendingAction } from '../../shared/lib/usePendingAction'
import { useUnsavedChanges } from '../../app/pwa/unsavedChanges'
import { paths } from '../../app/router/paths'
import { dateInTimeZone, formatDate } from '../../shared/lib/calendar'
import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { cycles } from '../biorhythms/model'
import { RhythmHeader } from '../biorhythms/RhythmControls'
import { chronotypes, isProfile } from '../settings/preferences'
import type { Chronotype, LocalProfile } from '../settings/preferences'
import { preferencesRepository } from '../settings/preferencesRepository'
import { SaveConfirmation } from '../settings/SaveConfirmation'
import { usePreferences } from '../settings/usePreferences'
import { ChronotypeIcon } from './ChronotypeIcon'
import { ProfileAvatar } from './ProfileAvatar'
import styles from '../settings/Preferences.module.css'

const chronotypeOptions = (Object.keys(chronotypes) as Chronotype[]).map((value) => ({
  value, label: chronotypes[value].label,
}))

function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid photo'))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ProfilePage() {
  const { profile, timeZone, isDemo, isLocalSetup } = usePreferences()
  const { pending, run } = usePendingAction()
  const [changes, setChanges] = useState<Partial<LocalProfile>>({})
  const [reading, setReading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const values = { ...profile, ...changes }
  const rhythm = chronotypes[values.chronotype]
  useUnsavedChanges(reading || (Object.keys(changes) as Array<keyof LocalProfile>)
    .some((key) => values[key] !== profile[key]))

  function change<K extends keyof LocalProfile>(key: K, value: LocalProfile[K]) {
    setChanges((previous) => ({ ...previous, [key]: value }))
  }

  async function choosePhoto(photo: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 1024 * 1024) {
      setPhotoError('Выберите изображение PNG, JPEG или WebP до 1 МБ.')
      return
    }
    setReading(true)
    setPhotoError('')
    try {
      const avatar = await readPhoto(photo)
      const image = new Image()
      image.src = avatar
      await image.decode()
      change('avatar', avatar)
    } catch {
      setPhotoError('Не удалось открыть это изображение.')
    } finally {
      setReading(false)
    }
  }

  function reset() {
    setChanges({})
    setError('')
    setPhotoError('')
  }

  function save() { void run(async () => {
    const next = { ...values, name: values.name.trim(), email: values.email.trim() }
    if (!isProfile(next)) {
      setError('Проверьте имя, email и дату рождения.')
      return
    }
    if (next.birthDate > dateInTimeZone(new Date(), timeZone)) {
      setError('Дата рождения не может быть в будущем.')
      return
    }
    try {
      await preferencesRepository.saveProfile(next)
      reset()
      setSaved(true)
    } catch {
      setError('Не удалось сохранить профиль в этом браузере.')
    }
  }) }

  return (
    <div className={styles.page}>
      <RhythmHeader title="Мой профиль" subtitle="Ваши данные и персональные предпочтения" backTo={paths.dashboard} />
      <div className={styles.columns}>
        <form className={styles.panel} inert={pending} onSubmit={(event) => { event.preventDefault(); save() }}>
          <div className={styles.identity}>
            <ProfileAvatar src={values.avatar} large />
            <div>
              <h2>{values.name.trim() || 'Мой профиль'}</h2>
              <p className={styles.muted}>{isLocalSetup ? 'Локальные настройки' : isDemo ? 'Демонстрационный профиль' : 'Личный профиль'}</p>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => {
                const photo = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (photo) void choosePhoto(photo)
              }} />
              <button className={styles.photoButton} type="button" disabled={reading} onClick={() => file.current?.click()}>
                {reading ? 'Открываем фото…' : 'Изменить фото'}
              </button>
            </div>
          </div>
          {photoError && <p className={styles.error} role="alert">{photoError}</p>}
          <h3>Личные данные</h3>
          <label className={styles.field}>Имя и фамилия
            <input value={values.name} autoComplete="name" required onChange={(event) => change('name', event.currentTarget.value)} />
          </label>
          <label className={styles.field}>Email
            <input type="email" value={values.email} autoComplete="email" required onChange={(event) => change('email', event.currentTarget.value)} />
          </label>
          <div className={styles.fields}>
            <DatePicker timeZone={timeZone} label="Дата рождения" value={values.birthDate} displayValue={formatDate(values.birthDate, { dateStyle: 'short' })}
              maxDate={dateInTimeZone(new Date(), timeZone)}
              onChange={(value) => change('birthDate', value)} />
            <Select label="Хронотип" value={values.chronotype} options={chronotypeOptions} onChange={(value) => change('chronotype', value)} />
          </div>
          <div className={styles.hint}>
            <strong>Изменили дату рождения или хронотип?</strong>
            <p>После сохранения рекомендации будут пересчитаны.<br />Уже запланированные задачи сохранят свои дату и время.</p>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.profileActions}>
            <button className={styles.button} type="button" disabled={reading} onClick={reset}>Отменить изменения</button>
            <button className={styles.primary} type="submit" disabled={reading}>Сохранить изменения</button>
          </div>
        </form>
        <aside className={styles.aside}>
          <h2>Ваш ритм</h2>
          <span className={styles.badge}><ChronotypeIcon chronotype={values.chronotype} />{rhythm.label}</span>
          <p>{rhythm.description}</p>
          <div className={styles.focus}><span>Окно фокуса</span><strong>{rhythm.focusWindow}</strong></div>
          {cycles.map((cycle) => (
            <div className={styles.cycle} key={cycle.id} data-cycle={cycle.id}>
              <span>{cycle.label}</span><strong>{cycle.period} {cycle.period === 28 ? 'дней' : 'дня'}</strong>
            </div>
          ))}
          <div className={styles.hint}>
            <strong>Вы управляете данными</strong>
            <p>Дата рождения используется для формулы циклов. Выгрузить сохранённые данные можно в настройках.</p>
          </div>
        </aside>
      </div>
      {saved && <SaveConfirmation title="Профиль сохранён" onClose={() => setSaved(false)} />}
    </div>
  )
}
