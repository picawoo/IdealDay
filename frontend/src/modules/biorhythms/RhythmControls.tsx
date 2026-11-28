import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { PageHeading } from '../../shared/ui/PageHeading'
import { NotificationBell } from '../notifications/NotificationBell'
import type { Period } from './model'
import styles from './Rhythm.module.css'

export function RhythmHeader({ title, subtitle, children, backTo, backState, backLabel = 'На главную' }: {
  title: string
  subtitle: string
  children?: ReactNode
  backTo?: string
  backState?: unknown
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
        {backTo && <Link className={styles.back} to={backTo} state={backState} aria-label={backLabel}>←</Link>}
        <NotificationBell className={styles.bell} />
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
