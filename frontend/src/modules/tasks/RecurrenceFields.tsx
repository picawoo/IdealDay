import { DatePicker } from '../../shared/ui/pickers/DatePicker'
import { Select } from '../../shared/ui/pickers/Select'
import { weekDays } from './recurrence'
import type { RepeatRule } from './recurrence'
import styles from './Tasks.module.css'

const frequencies = [
  { value: 'none', label: 'Не повторять' },
  { value: 'daily', label: 'Каждый день' },
  { value: 'weekdays', label: 'По будням' },
  { value: 'custom', label: 'По выбранным дням недели' },
] as const

export function RecurrenceFields({ date, timeZone, value, onChange, pinned, canPin, onPin }: {
  date: string; timeZone: string; value?: RepeatRule; onChange: (rule?: RepeatRule) => void
  pinned: boolean; canPin: boolean; onPin: (pinned: boolean) => void
}) {
  return <fieldset className={styles.recurrence}>
    <legend>Повторение и планирование</legend>
    <Select label="Повторение" value={value?.frequency ?? 'none'} options={frequencies} onChange={frequency =>
      onChange(frequency === 'none' ? undefined : { frequency, days: frequency === 'custom' ? [] : undefined, until: value?.until })} />
    {value?.frequency === 'custom' && <div className={styles.weekdayChoices} role="group" aria-label="Дни повторения">
      {weekDays.map((label, day) => <button className={styles.secondary} key={label} type="button" aria-pressed={value.days?.includes(day) ?? false}
        onClick={() => onChange({ ...value, days: value.days?.includes(day)
          ? value.days.filter(item => item !== day) : [...value.days ?? [], day].sort() })}>{label}</button>)}
    </div>}
    {value && <div className={styles.formGrid}>
      <Select label="Окончание повторения" value={value.until ? 'until' : 'none'} options={[
        { value: 'none', label: 'Без даты окончания' }, { value: 'until', label: 'До даты включительно' },
      ]} onChange={choice => onChange({ ...value, until: choice === 'until' ? date : undefined })} />
      {value.until && <DatePicker timeZone={timeZone} label="Последняя дата" value={value.until} onChange={until => onChange({ ...value, until })} />}
    </div>}
    <button className={styles.secondary} type="button" aria-pressed={pinned} disabled={!canPin}
      onClick={() => onPin(!pinned)}>{pinned ? 'Время закреплено' : 'Закрепить время задачи'}</button>
    <p>Автоплан сохраняет закреплённое время. Его можно изменить вручную.{!canPin && ' Сначала назначьте время.'}</p>
  </fieldset>
}
