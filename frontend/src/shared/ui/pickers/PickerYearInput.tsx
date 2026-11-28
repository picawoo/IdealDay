import styles from './Pickers.module.css'

export function PickerYearInput({ value, onChange, onApply, valid, action }: {
  value: string
  onChange: (value: string) => void
  onApply: () => void
  valid: boolean
  action: string
}) {
  return <div className={styles.yearPicker}>
    <label>Год
      <input type="text" inputMode="numeric" maxLength={4} value={value} data-picker-focus=""
        onChange={event => onChange(event.currentTarget.value)} onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (valid) onApply()
          }
        }} />
    </label>
    <button type="button" className={styles.apply} disabled={!valid} onClick={onApply}>{action}</button>
  </div>
}
