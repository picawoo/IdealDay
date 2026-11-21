import assert from 'node:assert/strict'
import test from 'node:test'
import { notificationRepository } from '../src/modules/notifications/notificationRepository.ts'
import { taskRepository } from '../src/modules/tasks/taskRepository.ts'
import { isExpiredNotice } from '../src/modules/notifications/retention.ts'
import { taskReminderId } from '../src/modules/notifications/model.ts'

test('batch plan swaps intervals atomically and rejects stale, conflicting or failed writes', async () => {
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const a = { ...task, id: 'a', date, startTime: '09:00' }
  const b = { ...task, id: 'b', date, startTime: '10:00' }
  const { values, storage } = testStorage(tasksKey, JSON.stringify([a, b]))
  const updates = [
    { existingId: 'a', draft: { ...a, startTime: b.startTime, plannerReasons: ['Auto'] } },
    { existingId: 'b', draft: { ...b, startTime: a.startTime } },
  ]
  const batch = { snapshot: [a, b], preferences: '{}', window: { start: 360, end: 1380 }, date, timeZone: 'UTC', breaks: [], updates }
  await assert.rejects(taskRepository.applyPlan({ ...batch, updates: [updates[0]] }), /Пересечение/)
  assert.deepEqual(JSON.parse(values.get(tasksKey)), [a, b])
  const set = storage.setItem
  storage.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError') }
  await assert.rejects(taskRepository.applyPlan(batch), /Quota/)
  assert.deepEqual(JSON.parse(values.get(tasksKey)), [a, b])
  storage.setItem = set
  await taskRepository.applyPlan(batch)
  assert.deepEqual(JSON.parse(values.get(tasksKey)), [a, b])
  assert.deepEqual(taskRepository.read().map(x => x.startTime), ['10:00', '09:00'])
  await assert.rejects(taskRepository.applyPlan(batch), /Пересчитайте/)
  await taskRepository.update('a', { startTime: '11:00' })
  assert.equal(taskRepository.read().find(x => x.id === 'a').plannerReasons, undefined)
})

test('a competing tab update or new preference invalidates the preview before any batch writes', async () => {
  const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const a = { ...task, date }
  const { values } = testStorage(tasksKey, JSON.stringify([a]))
  const batch = { snapshot: [a], preferences: '{}', window: { start: 360, end: 1380 }, date, timeZone: 'UTC', breaks: [],
    updates: [{ existingId: a.id, draft: { ...a, startTime: '11:00' } }] }
  const edit = taskRepository.update(a.id, { title: 'Other tab' })
  await assert.rejects(taskRepository.applyPlan(batch), /Пересчитайте/)
  await edit
  assert.equal(taskRepository.read()[0].title, 'Other tab')
  values.set('ideal-day.preferences.v1', JSON.stringify({ planning: { wakeTime: '12:00', sleepTime: '23:00' } }))
  await assert.rejects(taskRepository.applyPlan({ ...batch, snapshot: taskRepository.read() }), /Пересчитайте/)
  assert.equal(taskRepository.read()[0].startTime, a.startTime)
})

const locks = new Map()
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {
  request(key, action) {
    const current = (locks.get(key) ?? Promise.resolve()).then(action)
    locks.set(key, current.catch(() => undefined))
    return current
  },
} })

const tasksKey = 'ideal-day.tasks.v1'
const noticesKey = 'ideal-day.notifications.v1'
const task = { id: 'existing', title: 'Existing task', type: 'physical', status: 'planned', description: '', date: '2026-11-26', startTime: '12:00', duration: 30 }
const notice = { id: 'first', kind: 'cycle', cycle: 'physical', date: '2026-11-26', createdAt: 1, read: false }

function testStorage(key, raw) {
  const values = new Map(raw === null ? [] : [[key, raw]])
  const target = new EventTarget()
  target.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  globalThis.window = target
  return { values, storage: target.localStorage }
}

test('mixed legacy task data remains readable and the original is preserved during migration', async () => {
  const raw = JSON.stringify([task, { id: 'damaged' }])
  const { values } = testStorage(tasksKey, raw)
  assert.deepEqual(taskRepository.read(), [task])
  assert.equal(taskRepository.readIssue(), 'partial')
  const added = await taskRepository.create({ ...task, title: 'New task' })
  await taskRepository.update(task.id, { status: 'completed' })
  await taskRepository.remove(added.id)
  assert.deepEqual(taskRepository.read(), [{ ...task, status: 'completed' }])
  assert.equal(values.get(tasksKey), raw)
  assert.equal(taskRepository.backup().original, raw)
})

test('mixed notification data retains history, read state and deduplication', async () => {
  const raw = JSON.stringify([notice, { id: 'damaged' }])
  const { values } = testStorage(noticesKey, raw)
  assert.deepEqual(notificationRepository.read(), [notice])
  await notificationRepository.append([{ ...notice, id: 'second' }])
  await notificationRepository.append([notice])
  await notificationRepository.markAllRead()
  assert.deepEqual(notificationRepository.read().map(({ id, read }) => [id, read]), [['second', true], ['first', true]])
  assert.equal(values.get(`${noticesKey}.recovery.0`), raw)
})

for (const [key, repository, write, record] of [
  [tasksKey, taskRepository, () => taskRepository.create(task), task],
  [noticesKey, notificationRepository, () => notificationRepository.append([{ ...notice, id: 'new' }]), notice],
]) {
  test(`${key} blocks writes on malformed JSON and unknown formats`, async () => {
    for (const raw of ['{', '{"records":[]}', 'null']) {
      const { values } = testStorage(key, raw)
      assert.equal(repository.readIssue(), 'invalid')
      await assert.rejects(write)
      assert.equal(values.get(key), raw)
    }
  })

  test(`${key} supports a missing key and rejects writes on denied reads`, async () => {
    const { values, storage } = testStorage(key, null)
    assert.deepEqual(repository.read(), [])
    assert.equal(repository.readIssue(), null)
    await write()
    assert.equal(repository.read().length, 1)
    const saved = values.get(key)
    storage.getItem = () => { throw new DOMException('Denied', 'SecurityError') }
    assert.equal(repository.readIssue(), 'unavailable')
    await assert.rejects(write)
    assert.equal(values.get(key), saved)
  })

  test(`${key} preserves primary data when backup or primary write fails`, async () => {
    const raw = JSON.stringify([record, { id: 'damaged' }])
    const { values, storage } = testStorage(key, raw)
    const setItem = storage.setItem
    storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError') }
    await assert.rejects(write)
    assert.equal(repository.readIssue(), 'quota')
    assert.equal(values.get(key), raw)
    assert.equal(values.has(`${key}.recovery.0`), false)
    storage.setItem = (name, value) => {
      if (name === key || name === 'ideal-day.schedule.v2') throw new Error('Write rejected')
      setItem(name, value)
    }
    await assert.rejects(write)
    assert.equal(repository.readIssue(), 'write')
    assert.equal(values.get(key), raw)
    if (key !== tasksKey) assert.equal(values.get(`${key}.recovery.0`), raw)
    else assert.equal(values.has('ideal-day.schedule.v2'), false)
    storage.setItem = setItem
    await write()
    assert.equal(repository.readIssue(), null)
    assert.equal(values.size, 2)
  })
}

test('parallel creates and edits survive; a stale editor cannot restore a deletion', async () => {
  testStorage(tasksKey, null)
  const [a, b] = await Promise.all([taskRepository.create(task), taskRepository.create({ ...task, title: 'Another' })])
  await Promise.all([taskRepository.update(a.id, { title: 'A' }), taskRepository.update(b.id, { title: 'B' })])
  assert.deepEqual(taskRepository.read().map(({ title }) => title), ['A', 'B'])
  await Promise.all([taskRepository.remove(a.id), assert.rejects(taskRepository.update(a.id, { title: 'stale' }), /удалена/)] )
  assert.deepEqual(taskRepository.read().map(({ title }) => title), ['B'])
})

test('without Web Locks local tasks are available in read-only mode', async () => {
  testStorage(tasksKey, JSON.stringify([task]))
  const original = navigator.locks
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  try {
    assert.deepEqual(taskRepository.read(), [task])
    await assert.rejects(taskRepository.create(task), /браузер не поддерживает/)
    assert.deepEqual(taskRepository.read(), [task])
  } finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: original }) }
})

test('retention uses completion time and keeps current active reminders for every setting', () => {
  const reminder = { ...notice, kind: 'task', id: taskReminderId(task), taskId: task.id }
  const day = 86_400_000
  for (const keep of [1, 2, 7, 30]) {
    const now = 40 * day
    assert.equal(isExpiredNotice(reminder, new Map([[task.id, task]]), now - keep * day, () => undefined, true), false)
    assert.equal(isExpiredNotice(reminder, new Map([[task.id, { ...task, status: 'completed' }]]), now - keep * day, () => now - day / 2, true), false)
    assert.equal(isExpiredNotice(reminder, new Map(), now - keep * day, () => undefined, true), true)
    assert.equal(isExpiredNotice(reminder, new Map(), now - keep * day, () => undefined, false), false)
  }
})

test('append and prune are serialized; expired IDs cannot reappear; damaged history is not cleaned', async () => {
  testStorage(noticesKey, JSON.stringify([notice]))
  const next = { ...notice, id: 'retained' }
  await Promise.all([notificationRepository.prune(item => item.id === notice.id), notificationRepository.append([next])])
  await notificationRepository.append([notice])
  assert.deepEqual(notificationRepository.read(), [next])
  const raw = JSON.stringify([notice, { id: 'damaged' }])
  const { values } = testStorage(noticesKey, raw)
  await notificationRepository.prune(() => true)
  assert.equal(values.get(noticesKey), raw)
  assert.equal(values.has(`${noticesKey}.recovery.0`), false)
})
