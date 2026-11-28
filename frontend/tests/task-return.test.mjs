import assert from 'node:assert/strict'
import test from 'node:test'
import { readTaskScroll, taskDestination, taskOrigin } from '../src/app/router/taskReturn.ts'

test('task destinations preserve each supported origin and query', () => {
  for (const expected of ['/schedule?date=2035-01-08&view=day', '/schedule?date=2035-01-10&view=week',
    '/tasks?scope=all&q=%D0%A2%D0%B5%D1%81%D1%82+1&sort=desc&status=planned&type=routine&period=2035-01-08',
    '/dashboard?date=2035-01-08&period=month']) {
    const origin = new URLSearchParams({ from: expected })
    const taskOriginScroll = { to: expected, top: 480, left: 95 }
    assert.deepEqual(taskDestination(origin, { taskOriginScroll }).state, { restoreTaskScroll: taskOriginScroll })
    assert.equal(taskDestination(origin, undefined).to, expected)
  }
})

test('invalid origins and direct links safely return to tasks and still support prior list links', () => {
  for (const path of ['//other.example/tasks', 'https://other.example/tasks', '/tasks/new', '/settings', '/schedule/../tasks', '/tasks#other']) {
    assert.equal(taskOrigin(path), undefined)
    assert.deepEqual(taskDestination(new URLSearchParams({ from: path }), null),
      { to: '/tasks', label: 'К списку задач', state: undefined })
  }
  assert.equal(taskDestination(new URLSearchParams(), null).to, '/tasks')
  assert.equal(taskDestination(new URLSearchParams({ list: 'scope=all&sort=desc' }), null).to, '/tasks?scope=all&sort=desc')
})

test('only well-formed scroll coordinates for the exact destination are restored', () => {
  const to = '/schedule?date=2035-01-08&view=week'
  for (const invalid of [{ to: '/tasks', top: 100, left: 0 }, { to, top: -1, left: 0 }, { to, top: 5, left: Infinity }, { to, top: '2', left: 3 }]) {
    assert.equal(readTaskScroll({ restoreTaskScroll: invalid }, 'restoreTaskScroll', to), undefined)
  }
})
