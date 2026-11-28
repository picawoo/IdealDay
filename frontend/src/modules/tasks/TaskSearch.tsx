import { useRef } from 'react'
import styles from './Tasks.module.css'

export function TaskSearch({ value, onChange, onFilters }: {
  value: string
  onChange: (value: string) => void
  onFilters?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className={styles.search}>
    {onFilters
      ? <button type="button" aria-label="Поиск и фильтры" onClick={onFilters}>⌕</button>
      : <span className={styles.searchIcon} aria-hidden="true">⌕</span>}
    <input ref={input} type="search" aria-label="Поиск задачи" placeholder="Найти задачу…" value={value}
      spellCheck={false} onChange={event => onChange(event.currentTarget.value)} />
    {value && <button type="button" className={styles.searchClear} aria-label="Очистить поиск" title="Очистить поиск"
      onClick={() => { onChange(''); input.current?.focus() }}>×</button>}
  </div>
}
