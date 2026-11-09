import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import styles from './Pickers.module.css'

export interface PickerOption<T extends string> {
  value: T
  label: string
}

export function ChoiceList<T extends string>({ label, options, value, onChange, initialFocus = false, scrollable = false }: {
  label?: string
  options: readonly PickerOption<T>[]
  value: T
  onChange: (value: T) => void
  initialFocus?: boolean
  scrollable?: boolean
}) {
  const [focused, setFocused] = useState<T | null>(null)
  const search = useRef({ text: '', time: 0 })
  const selected = options.find((option) => option.value === value) ?? options[0]
  const tabStop = focused ?? selected?.value

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (event.key) {
      case 'ArrowDown': next = Math.min(index + 1, buttons.length - 1); break
      case 'ArrowUp': next = Math.max(0, index - 1); break
      case 'Home': next = 0; break
      case 'End': next = buttons.length - 1; break
      default: {
        if (event.key.length !== 1 || event.key === ' ' || event.ctrlKey || event.metaKey || event.altKey) return
        const now = Date.now()
        const letter = event.key.toLocaleLowerCase('ru')
        const prefix = (now - search.current.time <= 650 ? search.current.text : '') + letter
        const found = options.findIndex(({ label }) => label.toLocaleLowerCase('ru').startsWith(prefix))
        search.current = { text: found < 0 ? letter : prefix, time: now }
        next = found < 0 ? options.findIndex(({ label }) => label.toLocaleLowerCase('ru').startsWith(letter)) : found
        if (next < 0) return
      }
    }
    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    <div className={styles.list} data-scroll={scrollable} role={label ? 'listbox' : undefined} aria-label={label} onKeyDown={navigate}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          className={styles.option}
          aria-selected={option.value === value}
          tabIndex={option.value === tabStop ? 0 : -1}
          data-picker-focus={initialFocus && option.value === selected?.value ? '' : undefined}
          onFocus={() => setFocused(option.value)}
          onClick={() => onChange(option.value)}
        >{option.label}</button>
      ))}
    </div>
  )
}
