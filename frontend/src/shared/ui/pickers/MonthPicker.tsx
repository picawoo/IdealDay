import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { dateInTimeZone, formatDate, startOfMonth } from '../../lib/calendar'
import { PickerYearInput } from './PickerYearInput'
import { PickerPopover } from './PickerPopover'
import styles from './Pickers.module.css'

const names = Array.from({ length: 12 }, (_, index) =>
  formatDate('2000-' + String(index + 1).padStart(2, '0') + '-01', { month: 'long' }))

export function MonthPicker({ date, timeZone, onChange }: {
  date: string
  timeZone: string
  onChange: (date: string) => void
}) {
  const selectedYear = Number(date.slice(0, 4))
  const selectedMonth = Number(date.slice(5, 7)) - 1
  const [year, setYear] = useState(selectedYear)
  const [active, setActive] = useState(selectedMonth)
  const [editingYear, setEditingYear] = useState(false)
  const [yearInput, setYearInput] = useState('')
  const content = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const yearText = String(year).padStart(4, '0')

  function changeYear(delta: number) {
    setYear(current => Math.max(1, Math.min(9999, current + delta)))
  }

  const requestedYear = Number(yearInput.trim())
  const validYear = /^\d{1,4}$/.test(yearInput.trim()) && requestedYear > 0
  function toggleYear() {
    setYearInput(yearText)
    setEditingYear(!editingYear)
    requestAnimationFrame(() => {
      const target = content.current?.querySelector<HTMLElement>('[data-picker-focus]')
      target?.focus()
      if (target instanceof HTMLInputElement) target.select()
    })
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    let next = active
    switch (event.key) {
      case 'ArrowLeft': next--; break
      case 'ArrowRight': next++; break
      case 'ArrowUp': next -= 3; break
      case 'ArrowDown': next += 3; break
      case 'Home': next = 0; break
      case 'End': next = 11; break
      case 'PageUp': changeYear(-1); break
      case 'PageDown': changeYear(1); break
      default: return
    }
    event.preventDefault()
    const index = Math.max(0, Math.min(11, next))
    setActive(index)
    grid.current?.querySelectorAll('button')[index]?.focus()
  }

  return <PickerPopover label="Выбрать месяц" value={formatDate(date, { month: 'long', year: 'numeric' }).replace(/ г\.$/, '')}
    icon="date" variant="toolbar" layoutKey={editingYear ? 'year' : 'months'} restoreFocusOnDismiss onOpen={() => { setYear(selectedYear); setActive(selectedMonth); setEditingYear(false) }}>
    {close => <div ref={content}>
      <div className={styles.calendarHeader}>
        <button className={styles.monthArrow} type="button" aria-label="Предыдущий год" disabled={editingYear || year === 1} onClick={() => changeYear(-1)}>‹</button>
        <div className={styles.calendarHeading} aria-live="polite"><button type="button" className={styles.monthYear}
          aria-label={'Выбрать год: ' + yearText} aria-expanded={editingYear} onClick={toggleYear}>{yearText}<span className={styles.chevron} aria-hidden="true" /></button></div>
        <button className={styles.monthArrow} type="button" aria-label="Следующий год" disabled={editingYear || year === 9999} onClick={() => changeYear(1)}>›</button>
      </div>
      {editingYear ? <PickerYearInput value={yearInput} onChange={setYearInput} valid={validYear} action="Выбрать год"
        onApply={() => { setYear(requestedYear); toggleYear() }} /> : <div className={styles.monthPicker + ' ' + styles.monthGrid} role="group" aria-label={`Месяцы ${yearText} года`} ref={grid} onKeyDown={moveFocus}>
        {names.map((name, index) => <button key={name} type="button" tabIndex={index === active ? 0 : -1}
          aria-pressed={year === selectedYear && index === selectedMonth}
          data-picker-focus={index === active ? '' : undefined}
          onFocus={() => setActive(index)}
          onClick={() => { close(); onChange(yearText + '-' + String(index + 1).padStart(2, '0') + '-01') }}>{name}</button>)}
      </div>}
      <button className={styles.apply} type="button" onClick={() => { close(); onChange(startOfMonth(dateInTimeZone(new Date(), timeZone))) }}>Текущий месяц</button>
    </div>}
  </PickerPopover>
}
