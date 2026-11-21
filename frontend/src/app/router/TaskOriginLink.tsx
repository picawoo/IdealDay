import { Link, useLocation, useNavigate } from 'react-router'
import type { MouseEvent, ReactNode } from 'react'
import { taskPath } from './paths'
import { taskOrigin } from './taskReturn'

export const taskScrollSelector = '[data-task-return-scroll]'

export function TaskOriginLink({ id, origin, className, children, onClick, title }: {
  id: string
  origin?: string
  className?: string
  children: ReactNode
  onClick?: () => void
  title?: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const from = taskOrigin(origin ?? location.pathname + location.search)
  const to = taskPath(id) + (from ? '?' + new URLSearchParams({ from }) : '')

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
    onClick?.()
    if (!from) return
    event.preventDefault()
    navigate(to, { state: { taskOriginScroll: {
      to: from, top: window.scrollY, left: document.querySelector(taskScrollSelector)?.scrollLeft ?? 0,
    } } })
  }
  return <Link className={className} title={title} to={to} onClick={open}>{children}</Link>
}
