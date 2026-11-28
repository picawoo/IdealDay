import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesScope } from '../src/modules/tasks/model.ts'
import { project } from '../src/modules/tasks/recurrence.ts'

const today = '2035-01-08'
const tomorrow = '2035-01-09'
const base = { title: 'Работа', description: '', type: 'routine', startTime: '10:00', duration: 45 }

test('in-progress and completed tabs filter ordinary and recurring tasks by status', () => {
  const records = [
    { ...base, id: 'a', date: today, status: 'inProgress' },
    { ...base, id: 'b', date: today, status: 'completed' },
    { ...base, id: 'c', date: tomorrow, status: 'planned' },
    { id: 'series', kind: 'series', version: 0, periods: [{ ...base, from: today, rule: { frequency: 'daily' } }],
      exceptions: { [today]: { patch: { status: 'inProgress' } } } },
  ]
  const tasks = project(records, today, tomorrow)
  function ids(scope) { return tasks.filter(task => matchesScope(task, scope, today)).map(task => task.id) }
  assert.deepEqual(ids('inProgress'), ['a', 'repeat~series~2035-01-08'])
  assert.deepEqual(ids('completed'), ['b'])
  assert.deepEqual(ids('today'), ['a', 'b', 'repeat~series~2035-01-08'])
  assert.deepEqual(ids('upcoming'), ['c', 'repeat~series~2035-01-09'])
  assert.equal(ids('all').length, 5)
})
