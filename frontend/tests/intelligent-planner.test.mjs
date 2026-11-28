import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlan, mayMove } from '../src/modules/planner/model.ts'
import { getDayTransitions, upcomingTransitions } from '../src/modules/biorhythms/model.ts'
import { getDayPlan } from '../src/modules/schedule/dayPlan.ts'
import { analyzeLoad } from '../src/modules/planner/load.ts'

const date = '2030-01-02'
const task = (id, type, duration) => ({ id, title: id, description: '', type, duration })
const entry = (id, type, duration, startTime, extra = {}) => ({ ...task(id, type, duration), date, startTime, status: 'planned', ...extra })
const input = (extra = {}) => ({ date, now: Date.parse('2030-01-01T12:00Z'), timeZone: 'UTC',
  chronotype: 'lark', planning: { wakeTime: '06:00', sleepTime: '23:00' }, entries: [], tasks: [], ...extra })

function overnightGapFixture(extra = {}) {
  return input({ chronotype: 'pigeon', birthDate: '1995-02-12', planning: { wakeTime: '10:00', sleepTime: '02:00' },
    entries: [
      entry('work', 'intellectual', 400, '10:00', { pinned: true }),
      entry('yoga', 'physical', 30, '16:40', { pinned: true }),
      entry('preserves', 'routine', 60, '17:10', { pinned: true }),
      entry('dog', 'physical', 20, '18:20', { pinned: true }),
    ],
    tasks: [task('read', 'intellectual', 40), task('draw', 'creative', 60)], ...extra,
  })
}

test('compact and balanced avoid the reported 18:40 to midnight gap without removing pauses', () => {
  const base = overnightGapFixture()
  for (const mode of ['compact', 'balanced']) {
    const { placements, projected } = buildPlan({ ...base, mode })
    assert.deepEqual(placements.map(item => [item.date, item.startTime]), [[date, '18:50'], [date, '19:40']])
    assert.deepEqual(projected.slice(0, 4), base.entries)
  }
  assert.deepEqual(buildPlan(base), buildPlan({ ...base, mode: 'balanced' }))
  assert.equal(buildPlan({ ...base, mode: 'free' }).placements[0].startTime, '19:05')
})

test('mode weights make compact give up a distant default window that balanced still prefers', () => {
  const base = input({ tasks: [task('draw', 'creative', 60)],
    entries: [entry('work', 'routine', 30, '06:00', { pinned: true })] })
  assert.equal(buildPlan({ ...base, mode: 'compact' }).placements[0].startTime, '06:40')
  assert.equal(buildPlan({ ...base, mode: 'balanced' }).placements[0].startTime, '11:00')
})

test('late choices explain explicit windows, fixed edits and unavailable earlier slots', () => {
  const base = overnightGapFixture()
  for (const mode of ['compact', 'balanced', 'free']) {
    const preferred = buildPlan({ ...base, mode, windows: { intellectual: [{ start: '00:00', end: '00:40' }] } })
    const read = preferred.placements.find(item => item.task.id === 'read')
    assert.equal(read.date, '2030-01-03')
    assert.equal(read.startTime, '00:00')
    assert.match(read.reasons.join(' '), /Ваше окно 00:00/)
    const adjusted = { ...base.tasks[0], manual: { minute: 1440, pinned: false, edited: true } }
    const recalculated = buildPlan({ ...base, mode, tasks: [adjusted, base.tasks[1]] })
    assert.equal(recalculated.placements.find(item => item.task.id === 'read').startTime, '00:00')
    assert.match(recalculated.placements.find(item => item.task.id === 'read').reasons.join(' '), /вручную/)
    const constrained = buildPlan({ ...base, mode, tasks: [base.tasks[0]], entries: [...base.entries,
      ...Array.from({ length: 5 }, (_, i) => ({ id: 'break-' + i, kind: 'break', date, startTime: (19 + i) + ':00', duration: 30 })),
      { id: 'late-rest', kind: 'break', date, startTime: '23:45', duration: 15 },
    ] })
    assert.equal(constrained.placements[0].startTime, '00:00')
    const dateRestricted = buildPlan({ ...base, mode, tasks: [{ ...base.tasks[0], calendarDate: '2030-01-03' }] })
    assert.equal(dateRestricted.placements[0].startTime, '00:00')
    assert.match(dateRestricted.placements[0].reasons.join(' '), /Раньше не было подходящего интервала/)
  }
})

test('all chronotypes and task types choose preferred windows', () => {
  const types = ['intellectual', 'physical', 'creative', 'routine']
  for (const [chronotype, ...starts] of [['lark', '09:00', '14:00', '11:00', '07:00'],
    ['pigeon', '11:00', '16:00', '14:00', '08:00'], ['owl', '16:00', '12:00', '19:00', '10:00']]) {
    const { placements } = buildPlan(input({ chronotype, tasks: types.map(type => task(type, type, 40)) }))
    assert.deepEqual(types.map(type => placements.find(p => p.task.type === type)?.startTime), starts)
  }
  const result = buildPlan(input({ tasks: [task('focus', 'intellectual', 30)], windows: { intellectual: [{ start: '20:00', end: '21:00' }] } }))
  assert.equal(result.placements[0].startTime, '20:00')
})

test('actual daytime phases affect competition and are disclosed only if allocation changes', () => {
  const base = input({ planning: { wakeTime: '09:00', sleepTime: '10:00' },
    tasks: [task('a', 'intellectual', 60), task('b', 'physical', 60)],
    windows: { physical: [{ start: '09:00', end: '10:00' }] } })
  assert.equal(buildPlan(base).placements[0].task.id, 'a')
  const winner = d => buildPlan({ ...base, birthDate: d }).placements[0]
  assert.equal(winner('2029-12-20').task.id, 'a')
  assert.equal(winner('2029-12-28').task.id, 'b')
  assert.match(winner('2029-12-28').reasons.join(' '), /фазы/)
  assert.doesNotMatch(winner('2029-12-20').reasons.join(' '), /фазы/)
})

test('night planning uses next calendar date and excludes the elapsed portion, busy intervals and gaps without duration', () => {
  const result = buildPlan(input({ now: Date.parse('2030-01-02T23:40Z'), planning: { wakeTime: '22:00', sleepTime: '02:00' },
    entries: [{ id: 'rest', kind: 'break', date, startTime: '23:30', duration: 30 }, entry('point', 'routine', null, '00:00', { date: '2030-01-03' })],
    tasks: [task('long', 'routine', 60), task('unknown', 'creative', null), task('oversize', 'physical', 300)] }))
  assert.equal(result.placements[0].date, '2030-01-03')
  assert.equal(result.placements[0].startTime, '00:00')
  assert.equal(result.unplaced.length, 2)
})

test('manual placement has precedence and existing pinned, finished or started tasks are immutable', () => {
  const fixed = entry('fixed', 'routine', 60, '09:00', { pinned: true })
  const finished = entry('done', 'routine', 60, '10:00', { status: 'completed' })
  const old = entry('old', 'creative', 60, '08:00')
  const now = Date.parse('2030-01-02T08:30Z')
  for (const item of [fixed, finished, old]) assert.equal(mayMove(item, date, now, 'UTC'), false)
  const args = input({ now, entries: [fixed, finished, old], tasks: [
    { ...task('manual', 'intellectual', 60), manual: { minute: 11 * 60, pinned: true } }, task('later', 'physical', 60),
  ] })
  const result = buildPlan(args)
  assert.equal(result.placements[0].startTime, '11:00')
  assert.equal(result.projected.find(x => x.id === 'fixed'), fixed)
  assert.equal(buildPlan({ ...args, tasks: args.tasks.slice().reverse() }).placements[0].task.id, 'manual')
})

test('counts and groups all transitions; load advice uses actual time and real pause window', () => {
  const birth = '1995-01-01'
  for (const [day, count] of [['1995-01-02', 0], ['1995-01-13', 1], ['1995-07-02', 2], ['1996-10-06', 3]]) {
    assert.equal(getDayTransitions(birth, day).count, count)
  }
  assert.equal(upcomingTransitions(birth, '1996-10-05')[0].cycles.length, 3)
  const plan = getDayPlan([entry('first', 'intellectual', 45, '09:00'), entry('second', 'intellectual', 50, '09:45')],
    date, { wakeTime: '09:00', sleepTime: '10:50' })
  const advice = analyzeLoad(plan)
  assert.equal(advice.find(item => item.breakAt)?.breakAt, 635)
  assert.ok(advice.some(item => item.id === 'capacity'))
  assert.ok(advice.some(item => item.id.startsWith('variety')))
})

test('invalid DST hours are skipped and optional transition reserve can prevent placement', () => {
  const gap = buildPlan(input({ date: '2030-03-10', planning: { wakeTime: '02:00', sleepTime: '04:00' },
    timeZone: 'America/New_York', tasks: [task('a', 'routine', 60)] }))
  assert.equal(gap.placements[0].startTime, '03:00')
  const reserved = buildPlan(input({ date: '1996-10-06', now: Date.parse('1996-10-05T12:00Z'), birthDate: '1995-01-01',
    planning: { wakeTime: '09:00', sleepTime: '10:00' }, transitionReserve: true, tasks: [task('a', 'routine', 50)] }))
  assert.equal(reserved.placements.length, 0)
})
