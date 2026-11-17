import { isBreak } from '../tasks/model'
import { taskRepository } from '../tasks/taskRepository'
import { preferencesRepository } from './preferencesRepository'

export function exportPreferences() {
  const preferences = preferencesRepository.readSaved()
  const entries = taskRepository.readSaved()
  const data = {
    ...preferences,
    tasks: entries.filter((entry) => !isBreak(entry)),
    breaks: entries.filter(isBreak),
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'ideal-day-data.json'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
