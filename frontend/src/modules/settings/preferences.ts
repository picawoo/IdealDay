import { parseDate } from '../../shared/lib/calendar.ts'
import { demoProfile } from '../profile/demoProfile.ts'
import { isTime } from '../tasks/timeIntervals.ts'

export const chronotypes = {
  lark: { label: 'Жаворонок', focusWindow: '09:00–11:00', headline: 'в первой половине дня', description: 'Утро — привычное время для вашего старта.' },
  pigeon: { label: 'Голубь', focusWindow: '11:00–14:00', headline: 'в середине дня', description: 'Середина дня — привычное время для фокуса.' },
  owl: { label: 'Сова', focusWindow: '16:00–19:00', headline: 'во второй половине дня', description: 'Вторая половина дня — привычное время для фокуса.' },
} as const

export type Chronotype = keyof typeof chronotypes

export interface LocalProfile {
  name: string
  email: string
  birthDate: string
  chronotype: Chronotype
  wakeTime: string
  avatar: string | null
}

export interface LocalSettings {
  language: 'ru'
  taskReminders: boolean
  cycleTransitions: boolean
  weeklyEmail: boolean
}

export interface SavedPreferences {
  profile?: LocalProfile
  settings?: LocalSettings
  timeZone?: string
}

export const defaultProfile: LocalProfile = {
  name: demoProfile.name,
  email: 'anna@example.com',
  birthDate: demoProfile.birthDate,
  chronotype: 'lark',
  wakeTime: '07:00',
  avatar: null,
}

export const defaultTimeZone = demoProfile.timeZone

export const defaultSettings: LocalSettings = {
  language: 'ru',
  taskReminders: true,
  cycleTransitions: true,
  weeklyEmail: false,
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function isProfile(value: unknown): value is LocalProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<LocalProfile>
  return typeof profile.name === 'string' && Boolean(profile.name.trim())
    && typeof profile.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(profile.email)
    && typeof profile.birthDate === 'string' && parseDate(profile.birthDate) !== null
    && typeof profile.chronotype === 'string' && Object.hasOwn(chronotypes, profile.chronotype)
    && isTime(profile.wakeTime)
    && (profile.avatar === null || (typeof profile.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(profile.avatar)))
}

export function isSettings(value: unknown): value is LocalSettings {
  if (!value || typeof value !== 'object') return false
  const settings = value as Partial<LocalSettings>
  return settings.language === 'ru' && typeof settings.taskReminders === 'boolean'
    && typeof settings.cycleTransitions === 'boolean' && typeof settings.weeklyEmail === 'boolean'
}
