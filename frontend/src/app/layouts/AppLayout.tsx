import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { startReminderScheduler } from '../../modules/notifications/reminderScheduler'
import { PwaStatus } from '../pwa/PwaStatus'
import { Sidebar } from './Sidebar'
import styles from './AppLayout.module.css'

export function AppLayout() {
  useEffect(startReminderScheduler, [])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main} id="main-content">
        <PwaStatus />
        <Outlet />
      </main>
    </div>
  )
}
