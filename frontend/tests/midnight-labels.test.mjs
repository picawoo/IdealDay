import assert from 'node:assert/strict'
import test from 'node:test'
import { timelineMoment, timelineRange, timelineTime } from '../src/modules/schedule/dayPlan.ts'
import { formatTaskRange } from '../src/modules/tasks/model.ts'
import { formatPlannerReason } from '../src/modules/tasks/timeIntervals.ts'

test('timeline ticks show regular time and overnight ranges label the next day', () => {
  assert.equal(timelineTime(1440), '00:00')
  assert.equal(timelineTime(1500), '01:00')
  assert.equal(timelineRange(600, 1560), '10:00–02:00 следующего дня')
  assert.equal(timelineRange(1445, 1500), '00:05–01:00 следующего дня')
  assert.equal(timelineMoment(1560), '02:00 следующего дня')
  assert.equal(timelineRange(600, 660), '10:00–11:00')
})

test('task ranges and existing planner explanations display the next day without rewriting records', () => {
  assert.equal(formatTaskRange('23:30', 90), '23:30–01:00 следующего дня')
  assert.equal(formatTaskRange('23:30', 1500), '23:30–00:30 через 2 дня')
  assert.equal(formatPlannerReason('Ваше окно 00:30 (+1)–01:00 (+1).'), 'Ваше окно 00:30–01:00 следующего дня.')
  assert.equal(formatPlannerReason('Окно хронотипа 23:15–02:00 (+1).'), 'Окно хронотипа 23:15–02:00 следующего дня.')
})
