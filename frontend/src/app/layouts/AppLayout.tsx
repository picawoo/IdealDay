import { useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { startReminderScheduler } from '../../modules/notifications/reminderScheduler'
import { taskScrollSelector } from '../router/TaskOriginLink'
import { readTaskScroll, taskOrigin } from '../router/taskReturn'
import { PwaStatus } from '../pwa/PwaStatus'
import { Sidebar } from './Sidebar'
import { LocalStorageStatus } from './LocalStorageStatus'
import styles from './AppLayout.module.css'

export function AppLayout() {
  useEffect(startReminderScheduler, [])
  const location = useLocation()
  useLayoutEffect(() => {
    const to = taskOrigin(location.pathname + location.search)
    const scroll = to && readTaskScroll(location.state, 'restoreTaskScroll', to)
    if (!scroll) return
    const { top, left } = scroll
    // Layout and browser scroll restoration may finish in successive frames.
    function restore() {
      window.scrollTo({ top, behavior: 'instant' })
      const grid = document.querySelector(taskScrollSelector)
      if (grid) grid.scrollLeft = left
    }
    restore()
    const frame = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(frame)
  }, [location])

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main} id="main-content">
        <PwaStatus />
        <LocalStorageStatus />
        <Outlet />
      </main>
    </div>
  )
}
