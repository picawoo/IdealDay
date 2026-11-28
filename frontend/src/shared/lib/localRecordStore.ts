type StorageIssue = 'partial' | 'invalid' | 'unavailable' | 'quota' | 'write'

export function createLocalRecordStore<T extends { id: string }>(key: string, isRecord: (value: unknown) => value is T) {
  const empty: readonly T[] = []
  const listeners = new Set<() => void>()
  let records = empty
  let cachedRaw: string | null | undefined
  let issue: StorageIssue | null = null

  function parse(raw: string | null) {
    if (raw === null) return { records: empty, partial: false }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Invalid local data format')
    const result: T[] = []
    const seen = new Set<string>()
    for (const item of parsed as unknown[]) {
      if (!isRecord(item) || seen.has(item.id)) continue
      seen.add(item.id)
      result.push(item)
    }
    return { records: result, partial: result.length !== parsed.length }
  }

  function read() {
    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      issue = 'unavailable'
      return records
    }
    if (raw === cachedRaw && issue !== 'unavailable') return records
    try {
      const current = parse(raw)
      records = current.records
      issue = current.partial ? 'partial' : null
      cachedRaw = raw
    } catch {
      issue = 'invalid'
      cachedRaw = raw
    }
    return records
  }

  function notify() {
    listeners.forEach((listener) => listener())
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    function onStorage(event: StorageEvent) {
      if (event.key === key || event.key === null) listener()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  function preserve(storage: Storage, raw: string) {
    // Keep the first snapshot and never replace it with a later damaged value.
    for (let index = 0; ; index++) {
      const backup = `${key}.recovery.${index}`
      const previous = storage.getItem(backup)
      if (previous === raw) return
      if (previous === null) {
        storage.setItem(backup, raw)
        return
      }
    }
  }

  function commit(change: (current: readonly T[]) => readonly T[], recover = true) {
    let storage: Storage
    let raw: string | null
    try {
      storage = window.localStorage
      raw = storage.getItem(key)
    } catch (error) {
      issue = 'unavailable'
      notify()
      throw error
    }

    let current: ReturnType<typeof parse>
    try {
      current = parse(raw)
    } catch (error) {
      issue = 'invalid'
      notify()
      throw error
    }
    const next = !recover && current.partial ? current.records : change(current.records)
    if (next === current.records) return { previous: current.records, next }
    if (!next.every(isRecord)) throw new Error('Invalid local records')
    try {
      if (current.partial && raw !== null) preserve(storage, raw)
      const value = JSON.stringify(next)
      storage.setItem(key, value)
      records = next
      cachedRaw = value
      issue = null
    } catch (error) {
      // Retain the current raw value in the cache so subscribers can read the write error.
      records = current.records
      cachedRaw = raw
      issue = error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota' : 'write'
      notify()
      throw error
    }
    notify()
    return { previous: current.records, next }
  }

  return {
    read, subscribe, commit,
    readSaved: () => parse(window.localStorage.getItem(key)).records,
    readIssue() { read(); return issue },
  }
}
