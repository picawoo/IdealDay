import assert from 'node:assert/strict'
import test from 'node:test'
import { taskRepository } from '../src/modules/tasks/taskRepository.ts'
import { instanceId, project, seriesConflict, isTaskSeries } from '../src/modules/tasks/recurrence.ts'
import { getAnalytics } from '../src/modules/analytics/model.ts'
import { getDayPlan } from '../src/modules/schedule/dayPlan.ts'
import { buildPlan } from '../src/modules/planner/model.ts'
import { instantForLocalTime } from '../src/modules/notifications/zonedTime.ts'
import { taskReminderId } from '../src/modules/notifications/model.ts'

const legacy = 'ideal-day.tasks.v1'
const v2 = 'ideal-day.schedule.v2'
const monday = '2035-01-08'
const tuesday = '2035-01-09'
const wednesday = '2035-01-10'
const sunday = '2035-01-14'
const base = { title: 'Работа', description: '', type: 'intellectual', startTime: '10:00', duration: 400, pinned: true }
const regular = (id, date = monday, startTime = '08:00') => ({ ...base, id, date, startTime, duration: 30, status: 'planned' })
const locks = new Map()
Object.defineProperty(navigator, 'locks', { configurable: true, value: {
  request(key, fn) {
    const next = (locks.get(key) ?? Promise.resolve()).then(fn)
    locks.set(key, next.catch(() => undefined))
    return next
  },
} })
function storage(original) {
  const values = new Map(original === undefined ? [] : [[legacy, JSON.stringify(original)]])
  const target = new EventTarget()
  target.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  globalThis.window = target
  return values
}
function rule(frequency, extra = {}) { return { frequency, ...extra } }
function dateList(items) { return items.map(item => item.date).sort() }

test('daily, weekday and custom rules with inclusive termination and no persisted expansion', async () => {
  for (const [repeat, expected] of [
    [rule('daily', { until: wednesday }), [monday, tuesday, wednesday]],
    [rule('weekdays'), [monday, tuesday, wednesday, '2035-01-11', '2035-01-12']],
    [rule('custom', { days: [0, 2, 6] }), [monday, wednesday, sunday]],
  ]) {
    const values = storage()
    const series = await taskRepository.createSeries(monday, { ...base, rule: repeat })
    const before = values.get(v2)
    const list = taskRepository.query(monday, sunday)
    assert.deepEqual(dateList(list), expected)
    assert.deepEqual(taskRepository.query(monday, sunday), list)
    assert.equal(values.get(v2), before)
    assert.equal(JSON.parse(before).length, 2)
    assert.equal(list[0].id, instanceId(series.id, monday))
    assert.equal(isTaskSeries(series), true)
  }
})

test('one-off moves, completion, return to plan and deletion stay isolated', async () => {
  storage()
  const series = await taskRepository.createSeries(monday, { ...base, rule: rule('weekdays') })
  const id = instanceId(series.id, monday)
  const next = instanceId(series.id, tuesday)
  await taskRepository.update(id, { date: tuesday, startTime: '18:00', pinned: false })
  assert.equal(taskRepository.lookup(id).date, tuesday)
  assert.equal(taskRepository.lookup(id).pinned, false)
  assert.equal(taskRepository.lookup(next).pinned, true)
  assert.deepEqual(taskRepository.query(tuesday, tuesday).map(item => item.id).sort(), [id, next].sort())
  await taskRepository.update(id, { status: 'completed' })
  assert.equal(taskRepository.lookup(next).status, 'planned')
  await taskRepository.update(id, { status: 'planned' })
  assert.equal(taskRepository.lookup(id).startTime, '18:00')
  await taskRepository.remove(id)
  assert.equal(taskRepository.lookup(id), undefined)
  assert.ok(taskRepository.lookup(next))
})

test('series changes from a boundary retain completed history; stale concurrent edits fail', async () => {
  storage()
  const series = await taskRepository.createSeries(monday, { ...base, rule: rule('daily') })
  const id = instanceId(series.id, monday)
  const after = instanceId(series.id, tuesday)
  await taskRepository.update(id, { status: 'completed' })
  const observed = taskRepository.lookup(after)
  const good = taskRepository.changeSeries(observed, 'following', { ...base, title: 'Новая работа', pinned: false, rule: rule('daily') })
  const stale = assert.rejects(taskRepository.changeSeries(observed, 'all'), /Пересчитайте/)
  await Promise.all([good, stale])
  assert.equal(taskRepository.lookup(id).title, 'Работа')
  assert.equal(taskRepository.lookup(after).title, 'Новая работа')
  assert.equal(taskRepository.lookup(after).pinned, false)
  const two = taskRepository.lookup(instanceId(series.id, wednesday))
  await taskRepository.changeSeries(two, 'following')
  assert.equal(taskRepository.lookup(two.id), undefined)
  await taskRepository.changeSeries(taskRepository.lookup(after), 'all')
  assert.equal(taskRepository.lookup(after), undefined)
  assert.equal(taskRepository.lookup(id).status, 'completed')
})

test('future and midnight conflicts are checked without materializing the series', async () => {
  storage([regular('future', '2040-02-06', '10:00')])
  await assert.rejects(taskRepository.createSeries(monday, { ...base, rule: rule('daily') }), /2040-02-06/)
  const s = await taskRepository.createSeries(monday, { ...base, startTime: '23:30', duration: 60, rule: rule('custom', { days: [0] }) })
  await assert.rejects(taskRepository.create(regular('collide', tuesday, '00:00')), /Пересечение/)
  const touch = await taskRepository.create(regular('touch', tuesday, '00:30'))
  const plan = getDayPlan(taskRepository.query(tuesday, tuesday), tuesday)
  assert.equal(plan.entries.find(x => x.entry.id === instanceId(s.id, monday)).end, 30)
  assert.equal(seriesConflict(touch, taskRepository.read()), undefined)
})

test('week analytics, reminder identity/time zone and planner share the same virtual occurrence', async () => {
  storage([regular('ordinary')])
  const series = await taskRepository.createSeries(monday, { ...base, rule: rule('weekdays') })
  const records = taskRepository.read()
  const id = instanceId(series.id, monday)
  const task = taskRepository.lookup(id)
  assert.equal(taskReminderId(task), taskReminderId(taskRepository.lookup(id)))
  assert.notEqual(instantForLocalTime(task.date, task.startTime, 'UTC'), instantForLocalTime(task.date, task.startTime, 'Asia/Yekaterinburg'))
  const entries = project(records, monday, sunday)
  const analytics = getAnalytics(entries, monday)
  assert.equal(analytics.count, 6)
  assert.equal(analytics.total, 6)
  const proposal = buildPlan({ date: monday, now: Date.parse('2035-01-08T09:50Z'), timeZone: 'UTC', planning: { wakeTime: '06:00', sleepTime: '23:00' },
    chronotype: 'lark', entries, tasks: [{ id: 'other', title: 'Other', description: '', type: 'routine', duration: 60 }] })
  assert.ok(proposal.placements[0].minute >= 1000)
})

test('automatic time is stored only for the confirmed occurrence and a stale batch cannot write', async () => {
  storage()
  const series = await taskRepository.createSeries(monday, { ...base, pinned: false, startTime: null, rule: rule('daily') })
  const id = instanceId(series.id, monday)
  const records = taskRepository.read()
  assert.equal(taskRepository.lookup(id).startTime, '')
  const task = taskRepository.lookup(id)
  const result = buildPlan({ date: monday, now: Date.parse('2035-01-07T10:00Z'), timeZone: 'UTC',
    planning: { wakeTime: '06:00', sleepTime: '23:00' }, chronotype: 'lark', entries: project(records, monday, monday),
    tasks: [{ ...task, existingId: id }] })
  const at = result.placements[0]
  assert.ok(at)
  const batch = { snapshot: records, preferences: '{}', date: monday, window: { start: 360, end: 1380 }, breaks: [], timeZone: 'UTC',
    updates: [{ existingId: id, draft: { ...task, startTime: at.startTime } }] }
  await taskRepository.applyPlan(batch)
  assert.equal(taskRepository.lookup(id).startTime, at.startTime)
  assert.equal(taskRepository.lookup(instanceId(series.id, tuesday)).startTime, '')
  await assert.rejects(taskRepository.applyPlan(batch), /Пересчитайте/)
})


test('partial damage in v2 keeps valid tasks and backs up original bytes before writing', async () => {
  const values = storage([regular('original')])
  await taskRepository.createSeries(monday, { ...base, rule: rule('weekdays') })
  const good = JSON.parse(values.get(v2))
  const damaged = JSON.stringify([...good, { id: 'broken', kind: 'series', periods: 'invalid' }])
  values.set(v2, damaged)
  assert.equal(taskRepository.readIssue(), 'partial')
  assert.equal(taskRepository.query(monday, monday).length, 2)
  await taskRepository.update('original', { title: 'Сохранено' })
  assert.equal(values.get(v2 + '.recovery.0'), damaged)
  assert.equal(taskRepository.lookup('original').title, 'Сохранено')
  assert.equal(taskRepository.readIssue(), null)
})
test('legacy source is preserved; compatible updates recover and incompatible updates block writes', async () => {
  const original = regular('old')
  const values = storage([original])
  await taskRepository.createSeries(monday, { ...base, rule: rule('weekdays') })
  assert.deepEqual(JSON.parse(values.get(legacy)), [original])
  const legacyChange = { ...original, title: 'Из старой вкладки' }
  const snapshot = values.get(v2)
  values.set(legacy, JSON.stringify([legacyChange]))
  assert.equal(taskRepository.readIssue(), 'legacy')
  await assert.rejects(taskRepository.create(regular('new')), /Старая вкладка/)
  assert.equal(values.get(v2), snapshot)
  await taskRepository.recoverLegacy()
  assert.equal(taskRepository.lookup('old').title, legacyChange.title)
  assert.equal(taskRepository.readIssue(), null)
  await taskRepository.update('old', { title: 'Новая вкладка' })
  values.set(legacy, JSON.stringify([{ ...original, title: 'Вторая старая правка' }]))
  await assert.rejects(taskRepository.recoverLegacy(), /обеих/)
  assert.equal(taskRepository.lookup('old').title, 'Новая вкладка')
  assert.equal(taskRepository.backup().original, JSON.stringify([original]))
  assert.equal(taskRepository.readIssue(), 'legacy')
  await taskRepository.deferLegacy()
  assert.equal(taskRepository.readIssue(), null)
  assert.equal(taskRepository.lookup('old').title, 'Новая вкладка')
  assert.equal(JSON.parse(taskRepository.backup().schedule)[0].deferred.at(-1), values.get(legacy))
})
