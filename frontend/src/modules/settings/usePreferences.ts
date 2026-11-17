import { useSyncExternalStore } from 'react'
import { chronotypes, defaultProfile, defaultSettings, defaultTimeZone } from './preferences'
import { preferencesRepository } from './preferencesRepository'

export function usePreferences() {
  const saved = useSyncExternalStore(preferencesRepository.subscribe, preferencesRepository.read)
  const profile = saved.profile ?? defaultProfile
  return {
    profile,
    settings: saved.settings ?? defaultSettings,
    timeZone: saved.timeZone ?? defaultTimeZone,
    isDemo: saved.profile === undefined,
    firstName: profile.name.trim().split(/\s+/)[0],
    rhythm: chronotypes[profile.chronotype],
  }
}
