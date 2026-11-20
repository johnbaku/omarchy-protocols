const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
function load(file) {
  const mod = { exports: {} }
  new Function('module', fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^\.pragma.*$/m, ''))(mod)
  return mod.exports
}
const H = load('History.js')
const P = load('Protocols.js')
const ids = P.PROTOCOLS.map(p => p.id)
const water = 'morning-hydration', light = 'morning-light'
const record = (available, done = {}) => ({ available, done })

test('migrates only proven legacy records and preserves prior days on restart', () => {
  const raw = JSON.stringify({day: '2026-11-19', done: {[water]: 123}, notified: {[light]: true}})
  const history = H.restore(raw, '2026-11-20', ids)
  assert.deepEqual(history, {'2026-11-19': record([water, light], {[water]: 123})})
  assert.deepEqual(H.restore(JSON.stringify({history}), '2026-11-21', ids), history)
  assert.deepEqual(H.restore('{', '2026-11-20', ids), {})
  assert.deepEqual(H.restore(JSON.stringify({day: '2026-11-19'}), '2026-11-20', ids), {})
})

test('rejects malformed dates, records, unknown IDs and completion values', () => {
  assert.equal(H.validDay('2026-02-30'), false)
  assert.equal(H.validDay('2024-02-29'), true)
  const history = H.restore(JSON.stringify({history: {
    '2026-02-30': record([water]),
    '<img src=x>': record([water]),
    '2026-11-19': {available: 'all'},
    '2026-11-20': record([water, water, light, '<b>'], {[water]: -1, [light]: '123'})
  }}), '2026-11-20', ids)
  assert.deepEqual(history, {'2026-11-20': record([water, light])})
})

test('records availability, completion and undo without mutating prior history', () => {
  let history = H.record({}, '2026-11-19', [{id: water}], {[water]: 123})
  const before = JSON.stringify(history)
  const today = H.record(history, '2026-11-20', [{id: water}, {id: light}], {[water]: 456})
  assert.equal(JSON.stringify(history), before)
  assert.equal(today['2026-11-19'].done[water], 123)
  const undone = H.record(today, '2026-11-20', [{id: water}], {})
  assert.deepEqual(undone['2026-11-20'].available, [water, light])
  assert.deepEqual(undone['2026-11-20'].done, {})
  assert.equal(H.record(undone, '2026-11-20', [{id: water}], {}), undone)
})

test('consistency excludes today and gaps and uses historical availability', () => {
  const history = {
    '2026-11-16': record([light], {[light]: 123}),
    '2026-11-18': record([light, water], {[water]: 234}),
    '2026-11-20': record(ids)
  }
  const summary = H.summary(history, '2026-11-20')
  assert.equal(summary.started, '2026-11-16')
  assert.equal(summary.consistency, 67)
  assert.equal(summary.completed, 2)
  assert.equal(summary.recorded, 2)
  assert.equal(H.summary({'2026-11-20': record(ids)}, '2026-11-20').consistency, null)
})

test('streak tolerates an unfinished today but breaks on missed or unknown days', () => {
  const full = record([water], {[water]: 1})
  const history = {'2026-11-17': full, '2026-11-18': full, '2026-11-19': full, '2026-11-20': record([water])}
  assert.equal(H.summary(history, '2026-11-20').streak, 3)
  history['2026-11-20'] = full
  assert.equal(H.summary(history, '2026-11-20').streak, 4)
  delete history['2026-11-18']
  assert.equal(H.summary(history, '2026-11-20').streak, 2)
  history['2026-11-19'] = record([water])
  assert.equal(H.summary(history, '2026-11-20').streak, 1)
})

test('calendar follows locale week starts, month boundaries, leap days and DST', () => {
  const monday = H.monthDays('2026-11-01', {}, '2026-11-20', 1)
  assert.equal(monday.length, 42)
  assert.equal(monday[0].day, '2026-10-26')
  assert.equal(monday[6].day, '2026-11-01')
  assert.equal(monday.find(d => d.day === '2026-11-21').future, true)
  const sunday = H.monthDays('2026-11-01', {}, '2026-11-20', 0)
  assert.equal(sunday[0].day, '2026-11-01')
  assert.equal(H.shiftDay('2024-02-28', 1), '2024-02-29')
  assert.equal(H.shiftDay('2026-03-08', 1), '2026-03-09')
  assert.equal(H.shiftDay('2026-11-01', -1), '2026-10-31')
  assert.equal(H.shiftDay('2026-01-01', -1), '2025-12-31')
})

test('service rollover and a first click after midnight retain yesterday and write today', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Service.qml'), 'utf8')
  function functions(from, to) { return source.slice(source.indexOf('  function ' + from), source.indexOf('  function ' + to)) }
  const code = functions('itemsAt(', 'firstWhere(') + functions('save(', 'applyState(')
    + functions('tick(', 'announce(') + functions('markDone(', 'detectLocation(')
  const now = new Date(2026, 10, 20, 0, 0, 1).getTime()
  const Clock = class extends Date { static now() { return now } }
  const run = new Function('Protocols', 'History', 'Date', `
    var day = '2026-11-19', done = {'morning-light': 123}, notified = {}, stateLoaded = true
    var history = {'2026-11-19': {available: ['morning-light'], done: {'morning-light': 123}}}
    var nowMs = Date.now() - 60000, resumeGapMs = 300000, detectedLocation = null, location = null
    var onScreen = [], awaitingSky = [], dose = null, writes = []
    var stateFile = {setText: text => writes.push(JSON.parse(text))}
    function detectLocation() {}
    function announce() {}
    function refreshSky() { return false }
    ${code}
    markDone('morning-hydration')
    var marked = writes[writes.length - 1]
    markUndone('morning-hydration')
    return {marked, undone: writes[writes.length - 1]}
  `)
  const result = run(P, H, Clock)
  assert.equal(result.marked.day, '2026-11-20')
  assert.deepEqual(result.marked.done, {[water]: now})
  assert.deepEqual(result.marked.history['2026-11-19'].done, {[light]: 123})
  assert.equal(result.marked.history['2026-11-20'].done[water], now)
  assert.deepEqual(result.undone.history['2026-11-20'].done, {})
})
