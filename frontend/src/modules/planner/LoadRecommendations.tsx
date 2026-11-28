import { dateAndTime, timelineMoment } from '../schedule/dayPlan'
import type { DayPlan } from '../schedule/dayPlan'
import { analyzeLoad } from './load'
import styles from './Planner.module.css'

export function LoadRecommendations({ plan, date }: { plan: DayPlan; date: string }) {
  const advice = analyzeLoad(plan)
  return advice.length > 0 && <ul className={styles.advice} aria-label="Рекомендации по нагрузке">
    {advice.map(item => <li key={item.id}>{item.text}{item.breakAt !== undefined
      && <> Возможная пауза в <time dateTime={dateAndTime(date, item.breakAt).date + 'T' + dateAndTime(date, item.breakAt).time}>{timelineMoment(item.breakAt)}</time>.</>}</li>)}
  </ul>
}
