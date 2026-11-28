import { Select } from '../../shared/ui/pickers/Select'
import { TimePicker } from '../../shared/ui/pickers/TimePicker'
import workIcon from '../../assets/icons/tasks.svg'
import activityIcon from '../../assets/icons/wave.svg'
import creativeIcon from '../../assets/icons/creative.svg'
import routineIcon from '../../assets/icons/home.svg'
import type { PlannerPreferences } from '../settings/preferences'
import switchStyles from '../settings/Preferences.module.css'
import type { TaskType } from '../tasks/model'
import { defaultPlanningMode, planningModes } from './config'
import type { PlanningMode } from './config'
import styles from './Planner.module.css'

const modes = (Object.keys(planningModes) as PlanningMode[]).map(value => ({ value, label: planningModes[value].label }))
const modeDescriptions: Record<PlanningMode, string> = {
  compact: 'Планировщик старается закончить дела раньше и оставлять меньше пустых промежутков.',
  balanced: 'Планировщик сочетает удобные окна, перерывы и равномерную загрузку.',
  free: 'Планировщик допускает больше свободного времени между делами.',
}
const types: Record<TaskType, { title: string; examples: string; icon: string }> = {
  intellectual: { title: 'Интеллектуальные', examples: 'Работа, учёба, чтение', icon: workIcon },
  physical: { title: 'Физические', examples: 'Спорт, прогулки, тренировки', icon: activityIcon },
  creative: { title: 'Творческие', examples: 'Рисование, музыка, создание идей', icon: creativeIcon },
  routine: { title: 'Рутинные', examples: 'Уборка, покупки, домашние дела', icon: routineIcon },
}

export function PlannerPreferencesFields({ value, onChange }: { value: PlannerPreferences; onChange: (value: PlannerPreferences) => void }) {
  const mode = value.mode ?? defaultPlanningMode
  return <section className={styles.section}>
    <Select label="Стиль планирования" options={modes} value={mode} onChange={mode => onChange({ ...value, mode })} />
    <p className={styles.planningHint}>{modeDescriptions[mode]}</p>
    <label className={styles.check}><input type="checkbox" checked={!!value.transitionReserve}
      onChange={event => onChange({ ...value, transitionReserve: event.currentTarget.checked })} />
      Оставлять 15 минут резерва в дни переходов модели
    </label>
    <h3>Удобное время для разных задач</h3>
    <p className={styles.planningHint}>Укажите, в какое время вам удобнее заниматься определёнными делами. Планировщик будет стараться размещать задачи в этих интервалах.</p>
    <div className={styles.windowList}>
      {(Object.keys(types) as TaskType[]).map(type => {
        const { title, examples, icon } = types[type]
        const windows = value.windows?.[type]
        const window = windows?.[0]
        function change(start: string, end: string) {
          onChange({ ...value, windows: { ...value.windows, [type]: [{ start, end }, ...(windows?.slice(1) ?? [])] } })
        }
        return <div key={type} className={styles.windowRow} data-type={type}>
          <label className={styles.windowLabel}>
            <span className={styles.windowIcon} style={{ maskImage: 'url("' + icon + '")' }} aria-hidden="true" />
            <span className={styles.windowDescription}>
              <strong>{title}</strong>
              <span>{examples}</span>
              {!window && <span>Автоматически, по хронотипу</span>}
            </span>
            <span className={switchStyles.switch}>
              <input type="checkbox" role="switch" checked={!!window} aria-label={'Свой интервал: ' + title} onChange={event => {
                if (event.currentTarget.checked) change('09:00', '11:00')
                else { const nextWindows = { ...value.windows }; delete nextWindows[type]; onChange({ ...value, windows: nextWindows }) }
              }} />
              <span className={switchStyles.track} aria-hidden="true" />
            </span>
          </label>
          {window && <div className={styles.onboardingFields}>
            <TimePicker label={title + ' · начало'} value={window.start} onChange={start => change(start, window.end)} />
            <TimePicker label={title + ' · окончание'} value={window.end} onChange={end => change(window.start, end)} />
            {window.end < window.start && <span className={styles.planningHint}>Окончание на следующий день</span>}
          </div>}
        </div>
      })}
    </div>
    <p className={styles.planningHint}>Если удобный интервал занят, планировщик может предложить другое время.</p>
  </section>
}
