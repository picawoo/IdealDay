import { useRef, useState } from 'react'
import { CycleDetails } from './CycleGuide'
import { cycleInfo } from './cycleInfo'
import type { Cycle } from './model'
import physicalIcon from '../../assets/icons/wave-physical.svg'
import emotionalIcon from '../../assets/icons/wave-emotional.svg'
import intellectualIcon from '../../assets/icons/wave-intellectual.svg'
import { cycleOnDate, cycles, formatPercent } from './model'
import styles from './Rhythm.module.css'

const icons = { physical: physicalIcon, emotional: emotionalIcon, intellectual: intellectualIcon }

export function CycleCards({ birthDate, date, showDetails = false }: { birthDate: string; date: string; showDetails?: boolean }) {
  const [selected, setSelected] = useState<Cycle>()
  const trigger = useRef<HTMLButtonElement>(null)
  function close() {
    setSelected(undefined)
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
  }
  return (
    <>
    <div className={styles.cycles} aria-label="Значения трёх циклов">
      {cycles.map((cycle) => {
        const reading = cycleOnDate(birthDate, date, cycle)
        const phase = reading.critical ? 'Переход через ноль'
          : reading.percent === 100 ? 'Пик модели'
          : reading.value > 0 ? 'Положительная фаза' : 'Отрицательная фаза'
        return (
          <section className={styles.cycle} key={cycle.id} data-cycle={cycle.id}>
            <h2><img src={icons[cycle.id]} alt="" width="20" height="20" />{cycle.label}</h2>
            <strong>{formatPercent(reading.percent)}</strong>
            <p>{phase} · {cycle.period} дн.</p>
            {showDetails && <>
              <p className={styles.cycleSummary}>{cycleInfo[cycle.id].short}</p>
              <button type="button" className={styles.cycleDetails} aria-haspopup="dialog" aria-label={'Подробнее: ' + cycle.label.toLowerCase() + ' цикл'}
                onClick={event => { trigger.current = event.currentTarget; setSelected(cycle) }}>Подробнее</button>
            </>}
          </section>
        )
      })}
    </div>
    {selected && <CycleDetails cycle={selected} close={close} />}
    </>
  )
}
