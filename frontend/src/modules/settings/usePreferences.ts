import { useSyncExternalStore } from 'react'
import { chronotypes, defaultPlanning, defaultProfile, defaultSettings, defaultTimeZone } from './preferences'
import type { SavedPreferences } from './preferences'
import { preferencesRepository } from './preferencesRepository'

export function resolvePreferences(saved: SavedPreferences) {
  const birthDate = saved.profile?.birthDate ?? saved.planner?.birthDate
  const chronotype = saved.profile?.chronotype ?? saved.planner?.chronotype ?? defaultProfile.chronotype
  const profile = saved.profile ?? (birthDate ? { ...defaultProfile, name: '', email: '', birthDate, chronotype } : defaultProfile)
  const wakeTime = saved.profile?.wakeTime ?? defaultPlanning.wakeTime
  return {
    profile, birthDate, chronotype, planner: saved.planner,
    settings: saved.settings ?? defaultSettings,
    timeZone: saved.timeZone ?? defaultTimeZone,
    planning: saved.planning ?? { wakeTime, sleepTime: wakeTime === defaultPlanning.sleepTime ? '06:00' : defaultPlanning.sleepTime },
    isDemo: saved.profile === undefined,
    isLocalSetup: !saved.profile && !!birthDate,
    firstName: saved.profile || !birthDate ? profile.name.trim().split(/\s+/)[0] : '',
    rhythm: chronotypes[profile.chronotype],
  }
}

export function usePreferences() {
  return resolvePreferences(useSyncExternalStore(preferencesRepository.subscribe, preferencesRepository.read))
}
