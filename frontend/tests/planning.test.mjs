import assert from 'node:assert/strict'
import test from 'node:test'
import { getAnalytics } from '../src/modules/analytics/model.ts'
import { dateAndTime, getDayPlan, planningDate, planningInterval } from '../src/modules/schedule/dayPlan.ts'
import { createTimeScale, layoutTimeline } from '../src/modules/schedule/timelineLayout.ts'
import { isPlanning } from '../src/modules/settings/preferences.ts'

const date = '2026-11-26'
const next = '2026-11-27'
const task = (id, startTime, duration, day = date) => ({ id, title: id, startTime, duration, date: day, type: 'physical', status: 'planned', description: '' })
const night = { wakeTime: '10:00', sleepTime: '02:00' }

test('same-day, overnight and midnight planning windows', () => {
  for (const [wakeTime, sleepTime, duration] of [['08:00', '23:00', 15], ['10:00', '02:00', 16], ['09:00', '00:00', 15]]) {
    const hours = { wakeTime, sleepTime }
    const { start, end } = planningInterval(hours)
    assert.equal(end - start, duration * 60)
    assert.equal(getDayPlan([], date, hours).freeMinutes, duration * 60)
  }
  assert.equal(isPlanning({ wakeTime: '08:00', sleepTime: '08:00' }), false)
})

test('night segments use real dates without duplicating nighttime cards', () => {
  const entries = [task('early', '06:00', 10), task('night', '01:05', 30, next), { id: 'rest', kind: 'break', date: next, startTime: '00:15', duration: 15 }]
  const report = getDayPlan(entries, date, night)
  assert.deepEqual(report.entries.map(x => x.entry.id), ['early', 'rest', 'night'])
  assert.deepEqual(getDayPlan(entries, next, night).entries, [])
  assert.equal(report.start, 360)
  assert.equal(report.taskMinutes, 30)
  assert.equal(report.freeMinutes, 915)
  assert.deepEqual(dateAndTime(date, 1505), { date: next, time: '01:05' })
  assert.equal(planningDate(next, '01:05', night), date)
})

test('calendar analytics includes all planned minutes while occupancy unites overlaps', () => {
  const entries = [task('early', '06:00', 30), task('a', '23:30', 90), task('b', '00:00', 30, next)]
  const a = getAnalytics(entries, date, night)
  assert.equal(a.selected.minutes, 60)
  assert.equal(a.minutes, 150)
  assert.equal(a.selected.plan.taskMinutes, 90)
  assert.equal(a.selected.plan.freeMinutes, 870)
})

test('reported adjacent pairs use full width and genuinely overlapping cards have separate lanes', () => {
  const entries = [task('dinner', '22:52', 20), task('walk', '23:18', 30), task('pear', '18:30', 5), task('gym', '18:50', 120)]
  function slots(tasks) {
    const plan = getDayPlan(tasks, date, night)
    return layoutTimeline(plan.entries, createTimeScale(plan.start, plan.end)).slots
  }
  assert.ok(slots(entries).every(s => s.lanes === 1 && s.end - s.start >= 48))
  const crowded = slots([...entries, task('overlap', '18:52', 10)])
  assert.ok(crowded.filter(s => ['gym', 'overlap'].includes(s.segment.entry.id)).every(s => s.lanes === 2 && s.segment.conflict))
})
