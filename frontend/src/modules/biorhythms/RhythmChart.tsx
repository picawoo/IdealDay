import { useState } from 'react'
import { daysBetween, formatDate } from '../../shared/lib/calendar'
import { cycleOnDate, cycleValue, cycles, forecastDates, formatPercent } from './model'
import type { Period } from './model'
import { DateField, PeriodSwitch } from './RhythmControls'
import styles from './Rhythm.module.css'

const sampleCount = 168

export function CycleLegend() {
  return (
    <ul className={styles.legend} aria-label="Легенда циклов">
      {cycles.map((cycle) => <li key={cycle.id} data-cycle={cycle.id}>{cycle.label}</li>)}
    </ul>
  )
}

export function RhythmChart({ date, birthDate, period, onPeriod, onDate, title, showMonth = false }: {
  date: string
  birthDate: string
  period: Period
  onPeriod: (period: Period) => void
  onDate: (date: string) => void
  title: string
  showMonth?: boolean
}) {
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const dates = forecastDates(date, period)
  const firstDay = daysBetween(birthDate, dates[0])
  const span = dates.length - 1
  const selectedIndex = dates.indexOf(date)
  const hoverIndex = hoverDate ? dates.indexOf(hoverDate) : -1
  const position = (index: number) => (index / span) * 100
  const ticks = Array.from({ length: 5 }, (_, index) => Math.round((span * index) / 4))

  return (
    <section className={styles.chartCard} aria-label={title}>
      <div className={styles.chartHeader}>
        <h2>{title}</h2>
        <div className={styles.chartActions}>
          <PeriodSwitch period={period} onChange={onPeriod} />
          {showMonth && <DateField date={date} month onChange={onDate} />}
        </div>
      </div>
      <div className={styles.plotFrame}>
        <div className={styles.axis} aria-hidden="true"><span>+100</span><span>0</span><span>−100</span></div>
        <div
          className={styles.plot}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            const index = Math.max(0, Math.min(span, Math.round(((event.clientX - box.left) / box.width) * span)))
            setHoverDate(dates[index])
          }}
          onPointerLeave={() => setHoverDate(null)}
          onClick={() => hoverIndex >= 0 && onDate(dates[hoverIndex])}
        >
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
            {[1, 100, 199].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className={y === 100 ? styles.zeroLine : styles.gridLine} />)}
            <line className={styles.selectedLine} x1={selectedIndex / span * 1000} x2={selectedIndex / span * 1000} y1="0" y2="200" />
            {hoverIndex >= 0 && <line className={styles.hoverLine} x1={hoverIndex / span * 1000} x2={hoverIndex / span * 1000} y1="0" y2="200" />}
            {cycles.map((cycle) => {
              const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
                const fraction = index / sampleCount
                return (fraction * 1000).toFixed(2) + ',' + (100 - 98 * cycleValue(firstDay + span * fraction, cycle.period)).toFixed(2)
              }).join(' ')
              return <polyline key={cycle.id} data-cycle={cycle.id} className={styles.curve} points={points} />
            })}
          </svg>
          {hoverIndex >= 0 && (
            <div className={styles.tooltip} style={{ insetInlineStart: position(hoverIndex) > 64 ? undefined : position(hoverIndex) + '%', insetInlineEnd: position(hoverIndex) > 64 ? 100 - position(hoverIndex) + '%' : undefined }}>
              <strong>{formatDate(dates[hoverIndex], { day: 'numeric', month: 'long' })}</strong>
              {cycles.map((cycle) => <span key={cycle.id} data-cycle={cycle.id}>{cycle.label} {formatPercent(cycleOnDate(birthDate, dates[hoverIndex], cycle).percent)}</span>)}
            </div>
          )}
        </div>
        <div className={styles.ticks}>
          {ticks.map((index) => (
            <button key={index} type="button" aria-pressed={date === dates[index]} onClick={() => onDate(dates[index])}>
              {formatDate(dates[index], { day: 'numeric', month: 'short' }).replace(/\.$/, '')}
            </button>
          ))}
        </div>
      </div>
      <CycleLegend />
    </section>
  )
}
