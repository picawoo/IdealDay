import { withStorageLock } from '../../shared/lib/storageLock.ts'
import { isPlannerPreferences, isPlanning, isProfile, isSettings, isTimeZone } from './preferences.ts'
import type { LocalProfile, LocalSettings, PlannerPreferences, PlanningHours, SavedPreferences } from './preferences.ts'

export const preferencesStorageLock = 'ideal-day.preferences.v1'
const listeners = new Set<() => void>()
const empty: SavedPreferences = {}
let cachedRaw: string | null = null
let snapshot = empty

function readSaved(raw = window.localStorage.getItem(preferencesStorageLock)): SavedPreferences {
  if (raw === null) return empty
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid preferences')
  const record = data as Record<string, unknown>
  const { profile, settings, timeZone, planning, planner } = record
  if (profile !== undefined && !isProfile(profile)
    || settings !== undefined && !isSettings(settings)
    || timeZone !== undefined && !isTimeZone(timeZone)
    || planning !== undefined && !isPlanning(planning)
    || planner !== undefined && !isPlannerPreferences(planner)) throw new Error('Invalid preferences')
  return { profile, settings, timeZone, planning, planner } as SavedPreferences
}

function read(): SavedPreferences {
  try {
    const raw = window.localStorage.getItem(preferencesStorageLock)
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
    if (event.key === preferencesStorageLock || event.key === null) listener()
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
  window.localStorage.setItem(preferencesStorageLock, raw)
  cachedRaw = raw
  snapshot = next
  listeners.forEach((listener) => listener())
}

export const preferencesRepository = {
  read,
  readSaved,
  subscribe,
  saveProfile(profile: LocalProfile) {
    if (!isProfile(profile)) throw new Error('Invalid profile')
    return withStorageLock(preferencesStorageLock, () => save({ profile }))
  },
  saveSettings(settings: LocalSettings, timeZone: string, planning: PlanningHours, planner?: PlannerPreferences) {
    if (!isSettings(settings) || !isTimeZone(timeZone) || !isPlanning(planning)) throw new Error('Invalid settings')
    if (planner !== undefined && !isPlannerPreferences(planner)) throw new Error('Invalid planner preferences')
    return withStorageLock(preferencesStorageLock, () => save({ settings, timeZone, planning, ...(planner && { planner }) }))
  },
  savePlanner(planning: PlanningHours, planner: PlannerPreferences) {
    if (!isPlanning(planning) || !isPlannerPreferences(planner)) throw new Error('Invalid planner preferences')
    return withStorageLock(preferencesStorageLock, () => save({ planning, planner: { ...readSaved().planner, ...planner } }))
  },
}
