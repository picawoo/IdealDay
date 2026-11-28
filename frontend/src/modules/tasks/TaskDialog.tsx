import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './Tasks.module.css'

export function TaskDialog({ title, children, onClose, compact = false, hideCloseButton = false, className }: {
  title: string
  children: ReactNode
  onClose: () => void
  compact?: boolean
  hideCloseButton?: boolean
  className?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={className ? `${styles.dialog} ${className}` : styles.dialog}
      data-compact={compact || undefined}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id={titleId}>{title}</h2>
          {!compact && !hideCloseButton && <button className={styles.button} aria-label="Закрыть" type="button" onClick={onClose}>×</button>}
        </div>
        {children}
      </div>
    </dialog>
  )
}
