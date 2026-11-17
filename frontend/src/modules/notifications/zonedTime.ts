const hour = 3_600_000
const formatters = new Map<string, Intl.DateTimeFormat>()

function civilTimestamp(timestamp: number, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]))
  return Date.parse(`${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
}

export function instantForLocalTime(date: string, time: string, timeZone: string): number | null {
  const civil = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(civil)) return null

  // Sample both sides of an offset transition. A repeated time uses its first occurrence.
  const candidates = [-36, 0, 36].map((hours) => {
    const sample = civil + hours * hour
    return civil - (civilTimestamp(sample, timeZone) - sample)
  }).filter((candidate) => Number.isFinite(candidate) && civilTimestamp(candidate, timeZone) === civil)

  // A skipped clock time has no corresponding instant.
  return candidates.length ? Math.min(...candidates) : null
}
