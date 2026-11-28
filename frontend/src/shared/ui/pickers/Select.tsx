import { PickerPopover } from './PickerPopover'
import { ChoiceList } from './ChoiceList'
import type { PickerOption } from './ChoiceList'

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: readonly PickerOption<T>[]
  onChange: (value: T) => void
}) {
  return (
    <PickerPopover label={label} value={options.find((item) => item.value === value)?.label ?? 'Выберите значение'} icon="select" kind="listbox">
      {(close) => <ChoiceList options={options} value={value} initialFocus
        onChange={(next) => { close(); onChange(next) }} />}
    </PickerPopover>
  )
}
