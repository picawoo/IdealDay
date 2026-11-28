type DemoTask = {
  title: string
  category: string
  time: string
  done?: boolean
}

const demoPlans: Record<string, readonly DemoTask[]> = {
  '2026-11-11': [
    { title: 'План встречи', category: 'Интеллектуальная', time: '09:00–10:00' },
    { title: 'Обновить портфолио', category: 'Творческая', time: '13:00–14:00', done: true },
  ],
  '2026-11-12': [
    { title: 'Подготовить презентацию', category: 'Интеллектуальная', time: '09:00–10:30' },
    { title: 'Тренировка', category: 'Физическая', time: '11:00–11:45' },
    { title: 'Концепция проекта', category: 'Творческая', time: '13:00–14:00' },
    { title: 'Проверить почту', category: 'Рутинная', time: '15:00–15:30' },
  ],
  '2026-11-13': [
    { title: 'Прочитать исследование', category: 'Интеллектуальная', time: '09:00–10:00' },
    { title: 'Почта и итоги', category: 'Рутинная', time: '14:00–14:30' },
  ],
  '2027-03-11': [
    { title: 'Проверить почту', category: 'Рутинная', time: '09:30–10:00' },
    { title: 'Спокойная прогулка', category: 'Физическая', time: '12:00–12:30' },
  ],
}

export function getDemoPlan(date: string): readonly DemoTask[] {
  return demoPlans[date] ?? []
}
