import { Link } from 'react-router'
import type { ReactNode } from 'react'
import bellIcon from '../../assets/icons/bell.svg'
import { PageHeading } from '../../shared/ui/PageHeading'
import { formatDate } from '../../shared/lib/calendar'
import type { Period } from './model'
import styles from './Rhythm.module.css'

export function RhythmHeader({ title, subtitle, children, backTo, backLabel = 'На главную' }: {
  title: string
  subtitle: string
  children?: ReactNode
  backTo?: string
  backLabel?: string
}) {
  return (
    <header className={styles.header}>
      <div>
        <PageHeading>{title}</PageHeading>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.headerActions}>
        {children}
        {backTo && <Link className={styles.back} to={backTo} aria-label={backLabel}>←</Link>}
        <button className={styles.bell} type="button" disabled title="Уведомления пока недоступны" aria-label="Уведомления">
          <img src={bellIcon} alt="" width="22" height="22" />
        </button>
      </div>
    </header>
  )
}

export function PeriodSwitch({ period, onChange }: { period: Period; onChange: (period: Period) => void }) {
  return (
    <div className={styles.period} role="group" aria-label="Период прогноза">
      <button type="button" aria-pressed={period === 'week'} onClick={() => onChange('week')}>Неделя</button>
      <button type="button" aria-pressed={period === 'month'} onClick={() => onChange('month')}>Месяц</button>
    </div>
  )
}

export function DateField({ date, onChange, month = false, label }: {
  date: string
  onChange: (date: string) => void
  month?: boolean
  label?: string
}) {
  const dateLabel = label ?? formatDate(date, month
    ? { month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'long', year: 'numeric' }).replace(/ г\.$/, '')
  return (
    <label className={styles.dateField}>
      <span aria-hidden="true">{dateLabel}{month && ' ▾'}</span>
      <input
        aria-label={month ? 'Выбрать месяц' : 'Выбрать дату'}
        type={month ? 'month' : 'date'}
        value={month ? date.slice(0, 7) : date}
        onChange={(event) => {
          const value = event.currentTarget.value
          if (value) onChange(month ? value + '-01' : value)
        }}
      />
    </label>
  )
}

export function RhythmDisclaimer() {
  return <p className={styles.disclaimer}>Биоритмы — условная математическая модель, не медицинский прогноз. Ориентируйтесь на самочувствие.</p>
}
