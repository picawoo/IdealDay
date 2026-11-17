import { useSearchParams } from 'react-router'
import { dateInTimeZone, parseDate } from '../../shared/lib/calendar'
import { demoDate } from '../profile/demoProfile'
import { usePreferences } from '../settings/usePreferences'
import type { Period } from './model'

export function useRhythmDate(defaultPeriod: Period) {
  const [params, setParams] = useSearchParams()
  const { isDemo, timeZone } = usePreferences()
  const date = parseDate(params.get('date')) ?? (isDemo ? demoDate : dateInTimeZone(new Date(), timeZone))
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
