import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { addDays, dateInTimeZone, dateRange, formatDate, parseDate, shiftMonth, startOfMonth, startOfWeek } from '../../lib/calendar'
import { PickerYearInput } from './PickerYearInput'
import { PickerPopover } from './PickerPopover'
import styles from './Pickers.module.css'

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const monthOffsets = Array.from({ length: 12 }, (_, index) => index)

export function DatePicker({ label, value, onChange, displayValue, variant, maxDate, timeZone }: {
  label: string
  value: string
  onChange: (value: string) => void
  displayValue?: string
  variant?: 'field' | 'toolbar'
  maxDate?: string
  timeZone: string
}) {
  const [active, setActive] = useState(maxDate && value > maxDate ? maxDate : value)
  const [view, setView] = useState<'days' | 'months' | 'years'>('days')
  const [yearInput, setYearInput] = useState('')
  const calendar = useRef<HTMLDivElement>(null)
  const heading = useId()
  const month = startOfMonth(active)
  const first = startOfWeek(month)
  const year = active.slice(0, 4)
  const yearStart = year + '-01-01'
  const yearText = yearInput.trim()
  const requestedYear = yearText.padStart(4, '0')
  const validYear = /^\d{1,4}$/.test(yearText) && Number(requestedYear) >= 1 && (!maxDate || requestedYear <= maxDate.slice(0, 4))
  const today = dateInTimeZone(new Date(), timeZone)
  const dateLabel = displayValue ?? formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, '')

  function monthAllowed(date: string) {
    return Boolean(parseDate(date)) && (!maxDate || startOfMonth(date) <= maxDate)
  }

  function showMonth(next: string) {
    if (monthAllowed(next)) setActive(maxDate && next > maxDate ? maxDate : next)
  }

  function showView(next: 'days' | 'months' | 'years') {
    if (next === 'years') setYearInput(year)
    setView(next)
    requestAnimationFrame(() => {
      const target = calendar.current?.querySelector<HTMLElement>('[data-picker-focus]')
      target?.focus({ preventScroll: true })
      if (target instanceof HTMLInputElement) target.select()
      target?.scrollIntoView({ block: 'nearest' })
    })
  }

  function chooseYear() {
    if (!validYear) return
    const next = shiftMonth(active, (Number(requestedYear) - Number(year)) * 12)
    setActive(maxDate && next > maxDate ? maxDate : next)
    showView('months')
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
    const target = maxDate && next > maxDate ? maxDate : next
    setActive(target)
    requestAnimationFrame(() => calendar.current?.querySelector<HTMLButtonElement>('[data-day="' + target + '"]')?.focus())
  }

  return (
    <PickerPopover label={label} value={dateLabel} icon="date" variant={variant} layoutKey={view} restoreFocusOnDismiss onOpen={() => {
      setActive(maxDate && value > maxDate ? maxDate : value)
      setView('days')
    }}>
      {(close) => (
        <div ref={calendar}>
          <div className={styles.calendarHeader}>
            <button className={styles.monthArrow} type="button" aria-label="Предыдущий месяц"
              disabled={view !== 'days' || !monthAllowed(shiftMonth(active, -1))} onClick={() => showMonth(shiftMonth(active, -1))}>‹</button>
            <div id={heading} className={styles.calendarHeading} aria-live="polite">
              <button type="button" aria-label={`Выбрать месяц: ${formatDate(month, { month: 'long' })}`}
                aria-expanded={view === 'months'} onClick={() => showView(view === 'months' ? 'days' : 'months')}>
                {formatDate(month, { month: 'long' })}
              </button>
              <button type="button" aria-label={`Выбрать год: ${year}`} aria-expanded={view === 'years'}
                onClick={() => showView(view === 'years' ? 'days' : 'years')}>{year}<span className={styles.chevron} aria-hidden="true" /></button>
            </div>
            <button className={styles.monthArrow} type="button" aria-label="Следующий месяц"
              disabled={view !== 'days' || !monthAllowed(shiftMonth(active, 1))} onClick={() => showMonth(shiftMonth(active, 1))}>›</button>
          </div>
          {view === 'years' && <PickerYearInput value={yearInput} onChange={setYearInput} onApply={chooseYear} valid={validYear} action="Выбрать месяц" />}
          {view === 'months' && <div className={styles.monthPicker} role="group" aria-label={`Месяцы ${year} года`}>
            {monthOffsets.map((offset) => {
              const date = shiftMonth(yearStart, offset)
              const current = date === month
              return <button key={date} type="button" aria-pressed={current} disabled={!monthAllowed(date)}
                data-picker-focus={current ? '' : undefined} onClick={() => {
                  showMonth(shiftMonth(active, offset - Number(active.slice(5, 7)) + 1))
                  showView('days')
                }}>{formatDate(date, { month: 'long' })}</button>
            })}
          </div>}
          {view === 'days' && <div role="grid" aria-labelledby={heading} className={styles.calendar}>
            <div role="row" className={styles.calendarRow}>
              {weekdays.map((day) => <span role="columnheader" key={day}>{day}</span>)}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div role="row" className={styles.calendarRow} key={week}>
                {dateRange(addDays(first, week * 7), 7).map((date) => (
                  <div role="gridcell" aria-selected={date === value} key={date}>
                    <button type="button" data-day={date} data-outside={startOfMonth(date) !== month}
                      data-picker-focus={date === active ? '' : undefined} tabIndex={date === active ? 0 : -1}
                      disabled={!parseDate(date) || (maxDate !== undefined && date > maxDate)} aria-label={formatDate(date, { dateStyle: 'full' })}
                      onKeyDown={(event) => handleDayKey(event, date)} onClick={() => { close(); onChange(date) }}
                    >{Number(date.slice(-2))}</button>
                  </div>
                ))}
              </div>
            ))}
          </div>}
          <button type="button" className={styles.apply} disabled={!!maxDate && today > maxDate} onClick={() => {
            const current = dateInTimeZone(new Date(), timeZone)
            if (maxDate && current > maxDate) return
            close()
            onChange(current)
          }}>Сегодня</button>
        </div>
      )}
    </PickerPopover>
  )
}
