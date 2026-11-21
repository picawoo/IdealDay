import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/router/paths'
import { formatDate } from '../../shared/lib/calendar'
import { TaskDialog } from '../tasks/TaskDialog'
import buttonStyles from '../tasks/Tasks.module.css'
import { formatCyclePeriod } from './cycleInfo'
import { CycleGuide, PlannerCycleExplanation } from './CycleGuide'
import { cycles, formatPercent, transitionLabels } from './model'
import type { Cycle } from './model'
import styles from './Rhythm.module.css'

const colors = { physical: 'зелёный', emotional: 'розовый', intellectual: 'синий' } as const
const note = 'Биоритмы — условная математическая модель. Их влияние на здоровье и продуктивность научно не подтверждено. Используйте приложение для самоорганизации, ориентируясь на собственное самочувствие'

export function CalendarHelpButton() {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  function close() {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }
  return <>
    <button ref={trigger} type="button" className={styles.calendarHelp} title="Как читать биоритмы?"
      aria-haspopup="dialog" onClick={() => setOpen(true)}><span aria-hidden="true">?</span> Справка</button>
    {open && <CalendarHelp close={close} />}
  </>
}

function CalendarHelp({ close }: { close: () => void }) {
  return <TaskDialog title="Как читать биоритмы?" onClose={close} className={styles.calendarDialog}>
    <p>У каждого цикла своя цветная линия и свой период. Выберите дату, чтобы посмотреть значение каждого цикла.</p>
    <ul className={styles.calendarDialogList}>{cycles.map(cycle => <li key={cycle.id} data-cycle={cycle.id}>
      <strong>{cycle.label} цикл</strong><span>{formatCyclePeriod(cycle.period)} · {colors[cycle.id]}</span>
    </li>)}</ul>
    <CycleGuide />
    <p>В календаре цвет метки обозначает цикл, а цвет фона выделяет день с переходом. Двойной и тройной переход означают, что отметки совпали у двух или трёх циклов.</p>
    <h3>Как это влияет на расписание</h3>
    <PlannerCycleExplanation />
    <p>{note}</p>
    <button className={buttonStyles.primary} onClick={close} type="button">Понятно</button>
  </TaskDialog>
}

export function CalendarDayDetails({ date, reads, count, close }: {
  date: string
  reads: readonly (Cycle & { percent: number; critical: boolean })[]
  count: 0 | 1 | 2 | 3
  close: () => void
}) {
  const peaks = reads.filter(value => value.percent === 100 && !value.critical)
  return <TaskDialog title={formatDate(date, { dateStyle: 'full' })} onClose={close} className={styles.calendarDialog}>
    {reads.length ? <ul className={styles.calendarDialogList}>{reads.map(cycle => <li key={cycle.id} data-cycle={cycle.id}>
      <strong>{cycle.label}</strong><span>{formatPercent(cycle.percent)}{cycle.critical ? ' · △ переход' : cycle.percent === 100 ? ' · ↑ пик' : ''}</span>
    </li>)}</ul> : <p>Эта дата раньше даты рождения. Значения циклов для неё не показываются.</p>}
    {count > 0 && <p><strong>{transitionLabels[count]}.</strong> {count === 1 ? 'Один цикл пересекает' : 'Отмеченные циклы пересекают'} нулевую отметку модели.</p>}
    {peaks.length > 0 && <p>Пик означает верхнюю точку модели для отмеченного цикла.</p>}
    <Link className={buttonStyles.primary} to={paths.schedule + '?date=' + date}>Открыть расписание дня</Link>
  </TaskDialog>
}
