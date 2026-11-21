import { TaskDialog } from '../tasks/TaskDialog'
import buttons from '../tasks/Tasks.module.css'
import { cycleInfo, formatCyclePeriod } from './cycleInfo'
import type { Cycle } from './model'
import styles from './Rhythm.module.css'

const phases = [
  { sign: '+', style: 'positive', title: 'Положительная фаза', text: 'Линия выше нуля.' },
  { sign: '−', style: 'negative', title: 'Отрицательная фаза', text: 'Линия ниже нуля. Это не ограничение для работы или спорта.' },
  { sign: '↑', style: 'peak', title: 'Пик', text: 'Линия у самой верхней точки.' },
  { sign: '△', style: 'crossing', title: 'Переход через ноль', text: 'Линия достигает нуля или меняет знак между днями.' },
] as const

export function CycleGuide() {
  return <dl className={styles.phaseGuide}>
    {phases.map(({ sign, style, title, text }) => <div key={style}>
      <dt><span data-phase={style} aria-hidden="true">{sign}</span>{title}</dt>
      <dd>{text}</dd>
    </div>)}
  </dl>
}

export function PlannerCycleExplanation() {
  return <p>Дата рождения задаёт отправную точку циклов. Планировщик учитывает дневные значения для физических,
    интеллектуальных и творческих задач. Они могут изменить приоритет задачи или выбор свободного окна.
    Удобное время, занятость и закреплённые интервалы тоже учитываются. Для рутинных задач отдельного цикла нет.</p>
}

export function CycleDetails({ cycle, close }: { cycle: Cycle; close: () => void }) {
  const info = cycleInfo[cycle.id]
  return <TaskDialog title={cycle.label + ' цикл'} onClose={close} className={styles.calendarDialog}>
    <p><strong>{formatCyclePeriod(cycle.period)}</strong> · {info.short}</p>
    <p>{info.detail}</p>
    <p>{info.planner}</p>
    <button type="button" className={buttons.primary} onClick={close}>Понятно</button>
  </TaskDialog>
}
