import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { addDays, dateRange, formatDate, parseDate, shiftMonth, startOfMonth, startOfWeek } from '../../lib/calendar'
import { PickerPopover } from './PickerPopover'
import styles from './Pickers.module.css'

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function DatePicker({ label, value, onChange, displayValue, variant }: {
  label: string
  value: string
  onChange: (value: string) => void
  displayValue?: string
  variant?: 'field' | 'toolbar'
}) {
  const [active, setActive] = useState(value)
  const grid = useRef<HTMLDivElement>(null)
  const heading = useId()
  const month = startOfMonth(active)
  const first = startOfWeek(month)
  const dateLabel = displayValue ?? formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, '')

  function showMonth(next: string) {
    if (parseDate(next)) setActive(next)
  }

  function handleDayKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    let next: string
    switch (event.key) {
      case 'ArrowLeft': next = addDays(date, -1); break
      case 'ArrowRight': next = addDays(date, 1); break
      case 'ArrowUp': next = addDays(date, -7); break
      case 'ArrowDown': next = addDays(date, 7); break
      case 'Home': next = startOfWeek(date); break
      case 'End': next = addDays(startOfWeek(date), 6); break
      case 'PageUp': next = shiftMonth(date, event.shiftKey ? -12 : -1); break
      case 'PageDown': next = shiftMonth(date, event.shiftKey ? 12 : 1); break
      default: return
    }
    event.preventDefault()
    if (!parseDate(next)) return
    setActive(next)
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>('[data-day="' + next + '"]')?.focus())
  }

  return (
    <PickerPopover label={label} value={dateLabel} icon="date" variant={variant} onOpen={() => setActive(value)}>
      {(close) => (
        <>
          <div className={styles.calendarHeader}>
            <button type="button" aria-label="Предыдущий месяц" onClick={() => showMonth(shiftMonth(active, -1))}>‹</button>
            <strong id={heading} aria-live="polite">{formatDate(month, { month: 'long', year: 'numeric' }).replace(/ г\.$/, '')}</strong>
            <button type="button" aria-label="Следующий месяц" onClick={() => showMonth(shiftMonth(active, 1))}>›</button>
          </div>
          <div ref={grid} role="grid" aria-labelledby={heading} className={styles.calendar}>
            <div role="row" className={styles.calendarRow}>
              {weekdays.map((day) => <span role="columnheader" key={day}>{day}</span>)}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" className={styles.calendarRow} key={week}>
                {dateRange(addDays(first, week * 7), 7).map((date) => (
                  <div role="gridcell" aria-selected={date === value} key={date}>
                    <button type="button" data-day={date} data-outside={startOfMonth(date) !== month}
                      data-picker-focus={date === active ? '' : undefined} tabIndex={date === active ? 0 : -1}
                      disabled={!parseDate(date)} aria-label={formatDate(date, { dateStyle: 'full' })}
                      onKeyDown={(event) => handleDayKey(event, date)} onClick={() => { close(); onChange(date) }}
                    >{Number(date.slice(-2))}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </PickerPopover>
  )
}
