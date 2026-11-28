import { useState } from 'react'
import { ChoiceList } from './ChoiceList'
import { PickerPopover } from './PickerPopover'
import styles from './Pickers.module.css'

function timeOptions(length: number) {
  return Array.from({ length }, (_, index) => {
    const value = String(index).padStart(2, '0')
    return { value, label: value }
  })
}

const hours = timeOptions(24)
const minutes = timeOptions(60)

export function TimePicker({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value || '00:00')
  const [hour, minute] = draft.split(':')

  return (
    <PickerPopover label={label} value={value || 'Выберите время'} icon="time" onOpen={() => setDraft(value || '00:00')}>
      {(close) => (
        <>
          <div className={styles.timeColumns}>
            <div>
              <p className={styles.listLabel}>Часы</p>
              <ChoiceList label="Часы" options={hours} value={hour} initialFocus scrollable
                onChange={(next) => setDraft((current) => next + ':' + current.slice(3))} />
            </div>
            <div>
              <p className={styles.listLabel}>Минуты</p>
              <ChoiceList label="Минуты" options={minutes} value={minute} scrollable
                onChange={(next) => setDraft((current) => current.slice(0, 2) + ':' + next)} />
            </div>
          </div>
          <button className={styles.apply} type="button" onClick={() => { close(); onChange(draft) }}>Выбрать {draft}</button>
        </>
      )}
    </PickerPopover>
  )
}
