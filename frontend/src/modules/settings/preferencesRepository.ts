import { isProfile, isSettings, isTimeZone } from './preferences.ts'
import type { LocalProfile, LocalSettings, SavedPreferences } from './preferences.ts'

const storageKey = 'ideal-day.preferences.v1'
const listeners = new Set<() => void>()
const empty: SavedPreferences = {}
let cachedRaw: string | null = null
let snapshot = empty

function readSaved(raw = window.localStorage.getItem(storageKey)): SavedPreferences {
  if (raw === null) return empty
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid preferences')
  const record = data as Record<string, unknown>
  const { profile, settings, timeZone } = record
  if (profile !== undefined && !isProfile(profile)
    || settings !== undefined && !isSettings(settings)
    || timeZone !== undefined && !isTimeZone(timeZone)) throw new Error('Invalid preferences')
  return { profile, settings, timeZone } as SavedPreferences
}

function read(): SavedPreferences {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw !== cachedRaw) {
      snapshot = readSaved(raw)
      cachedRaw = raw
    }
  } catch {
    // Keep the last valid snapshot. A failed read must not replace saved data.
  }
  return snapshot
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function save(patch: SavedPreferences) {
  const next = { ...readSaved(), ...patch }
  const raw = JSON.stringify(next)
  window.localStorage.setItem(storageKey, raw)
  cachedRaw = raw
  snapshot = next
  listeners.forEach((listener) => listener())
}

export const preferencesRepository = {
  read,
  readSaved,
  subscribe,
  saveProfile(profile: LocalProfile, timeZone: string) {
    if (!isProfile(profile) || !isTimeZone(timeZone)) throw new Error('Invalid profile')
    save({ profile, timeZone })
  },
  saveSettings(settings: LocalSettings, timeZone: string) {
    if (!isSettings(settings) || !isTimeZone(timeZone)) throw new Error('Invalid settings')
    save({ settings, timeZone })
  },
}
