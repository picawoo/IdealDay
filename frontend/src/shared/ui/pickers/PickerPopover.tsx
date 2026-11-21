import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import calendarIcon from '../../../assets/icons/calendar.svg'
import styles from './Pickers.module.css'

export function PickerPopover({ label, value, icon, kind = 'dialog', variant = 'field', onOpen, layoutKey, restoreFocusOnDismiss, children }: {
  label: string
  value: string
  icon: 'date' | 'time' | 'select'
  kind?: 'dialog' | 'listbox'
  variant?: 'field' | 'toolbar'
  onOpen?: () => void
  layoutKey?: string
  restoreFocusOnDismiss?: boolean
  children: (close: () => void) => ReactNode
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const place = useCallback(() => {
    const button = trigger.current
    const menu = panel.current
    if (!button || !menu) return
    const edge = 12
    const gap = 8
    const box = button.getBoundingClientRect()
    if (box.bottom <= 0 || box.top >= window.innerHeight) {
      menu.hidePopover()
      return
    }
    const minWidth = icon === 'date' ? 328 : icon === 'time' ? 258 : 0
    const width = Math.min(window.innerWidth - edge * 2, Math.max(box.width, minWidth))
    menu.style.width = width + 'px'
    menu.style.left = Math.max(edge, Math.min(box.left, window.innerWidth - width - edge)) + 'px'
    menu.style.maxHeight = 'none'
    const wanted = menu.getBoundingClientRect().height
    const below = window.innerHeight - box.bottom - gap - edge
    const above = box.top - gap - edge
    const useAbove = below < wanted && above > below
    const height = Math.min(wanted, Math.max(0, useAbove ? above : below))
    menu.style.maxHeight = height + 'px'
    menu.style.top = (useAbove ? box.top - gap - height : box.bottom + gap) + 'px'
  }, [icon])

  useLayoutEffect(() => {
    if (open && layoutKey !== undefined) place()
  }, [layoutKey, open, place])

  useEffect(() => {
    if (!open) return
    function updateOnScroll(event: Event) {
      if (!(event.target instanceof Node && panel.current?.contains(event.target))) place()
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', updateOnScroll, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', updateOnScroll, true)
    }
  }, [open, place])

  function close() {
    document.getElementById(id)?.hidePopover()
    document.getElementById(id + '-button')?.focus({ preventScroll: true })
  }

  return (
    <div className={styles.control} data-variant={variant}>
      {variant === 'field' && <span id={id + '-label'} className={styles.label}>{label}</span>}
      <button ref={trigger} id={id + '-button'} type="button" className={styles.trigger}
        aria-label={variant === 'toolbar' ? label + ': ' + value : undefined}
        aria-labelledby={variant === 'field' ? id + '-label ' + id + '-value' : undefined}
        aria-haspopup={kind} aria-expanded={open} aria-controls={id} popoverTarget={id}
        onKeyDown={(event) => {
          if (kind === 'listbox' && !open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            event.currentTarget.click()
          }
        }}
      >
        <span id={id + '-value'} className={styles.value}>{value}</span>
        <span className={styles.icon} aria-hidden="true">
          {icon === 'date' ? <img src={calendarIcon} alt="" width="18" height="18" />
            : <span className={icon === 'time' ? styles.clock : styles.chevron} />}
        </span>
      </button>
      <div
        ref={panel}
        id={id}
        className={styles.popover}
        popover="auto"
        role={kind}
        aria-label={label}
        onBeforeToggle={(event) => { if (event.newState === 'open') onOpen?.() }}
        onToggle={(event) => {
          const shown = event.newState === 'open'
          setOpen(shown)
          if (!shown && restoreFocusOnDismiss && (document.activeElement === document.body || panel.current?.contains(document.activeElement))) {
            trigger.current?.focus({ preventScroll: true })
          }
          if (shown) {
            place()
            requestAnimationFrame(() => {
              if (!panel.current?.matches(':popover-open')) return
              const active = panel.current.querySelector<HTMLElement>('[data-picker-focus]')
              active?.focus({ preventScroll: true })
              active?.scrollIntoView({ block: 'nearest' })
            })
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
        }}
      >{children(close)}</div>
    </div>
  )
}
