import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { dateInTimeZone, parseDate } from '../../shared/lib/calendar'
import { usePreferences } from '../settings/usePreferences'
import type { Period } from './model'

export function useRhythmDate(defaultPeriod: Period) {
  const [params, setParams] = useSearchParams()
  const { timeZone } = usePreferences()
  const explicitDate = parseDate(params.get('date'))
  const [now, setNow] = useState(Date.now)
  const date = explicitDate ?? dateInTimeZone(new Date(now), timeZone)

  useEffect(() => {
    if (explicitDate) return
    const refresh = () => setNow(Date.now())
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [explicitDate])
  const periodValue = params.get('period')
  const period = periodValue === 'week' || periodValue === 'month' ? periodValue : defaultPeriod
  const tab = params.get('tab') === 'calendar' ? 'calendar' : 'cycles'

  function update(key: 'date' | 'period' | 'tab', value: string) {
    if (key === 'date' && !parseDate(value)) return
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next)
  }

  return {
    date,
    period,
    tab,
    setDate: (value: string) => update('date', value),
    setPeriod: (value: Period) => update('period', value),
    setTab: (value: 'cycles' | 'calendar') => update('tab', value),
  }
}
