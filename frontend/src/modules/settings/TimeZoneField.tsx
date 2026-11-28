import { useMemo } from 'react'
import { Select } from '../../shared/ui/pickers/Select'
import { defaultTimeZone } from './preferences'

const cityNames: Record<string, string> = {
  'Europe/Moscow': 'Москва',
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Samara': 'Самара',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Omsk': 'Омск',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Krasnoyarsk': 'Красноярск',
  'Asia/Irkutsk': 'Иркутск',
  'Asia/Yakutsk': 'Якутск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Magadan': 'Магадан',
  'Asia/Kamchatka': 'Камчатка',
}

export function TimeZoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = useMemo(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone
    const zones = new Set([defaultTimeZone, ...Object.keys(cityNames), 'UTC', local, value, ...Intl.supportedValuesOf('timeZone')])
    const now = new Date()
    return [...zones].map((zone) => {
      const parts = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now)
      const offset = parts.find((part) => part.type === 'timeZoneName')?.value.replace('GMT', 'UTC') ?? ''
      const label = zone === 'UTC' ? 'UTC' : (cityNames[zone] ?? zone.replaceAll('_', ' ')) + ' · ' + offset
      return { value: zone, label }
    })
  }, [value])
  return <Select label="Часовой пояс" value={value} options={options} onChange={onChange} />
}
