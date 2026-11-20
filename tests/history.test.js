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

test('each protocol has an independent streak', () => {
  const history = {
    '2026-11-17': record(ids, {[water]: 1}),
    '2026-11-18': record(ids, {[water]: 2, [light]: 2}),
    '2026-11-19': record(ids, {[water]: 3, [light]: 3}),
    '2026-11-20': record(ids, {[water]: 4})
  }
  assert.equal(H.streak(history, '2026-11-20', water, false), 4)
  assert.equal(H.streak(history, '2026-11-20', light, false), 2)
  assert.equal(H.streak(history, '2026-11-20', 'evening-light', false), 0)
  assert.deepEqual(H.summary(history, '2026-11-20', [
    {id: water, status: 'done'}, {id: light, status: 'missed'}
  ]), {started: '2026-11-17', streaks: {[water]: 4, [light]: 0}})
})

test('pending today preserves the streak; missing its window resets only that routine', () => {
  const full = record(ids, {[water]: 1, [light]: 1})
  const history = {'2026-11-18': full, '2026-11-19': full, '2026-11-20': record(ids)}
  assert.equal(H.streak(history, '2026-11-20', water, false), 2)
  assert.equal(H.streak(history, '2026-11-20', water, true), 0)
  history['2026-11-20'].done[water] = 2
  assert.equal(H.streak(history, '2026-11-20', water, true), 3)
  assert.equal(H.streak(history, '2026-11-20', light, false), 2)
  delete history['2026-11-20'].done[water]
  assert.equal(H.streak(history, '2026-11-20', water, false), 2)
  assert.equal(H.streak(history, '2026-11-20', water, true), 0)
})

test('missing, unavailable and incomplete past days break individual streaks', () => {
  const full = record(ids, {[water]: 1})
  const history = {'2026-11-17': full, '2026-11-19': full, '2026-11-20': full}
  assert.equal(H.streak(history, '2026-11-20', water, false), 2)
  history['2026-11-18'] = record([light], {[light]: 1})
  assert.equal(H.streak(history, '2026-11-20', water, false), 2)
  history['2026-11-19'] = record(ids)
  assert.equal(H.streak(history, '2026-11-20', water, false), 1)
  assert.equal(H.streak({}, '2026-11-20', water, false), 0)
})

test('streaks survive restart and follow calendar days over DST and year boundaries', () => {
  for (const today of ['2026-03-09', '2026-11-02', '2026-01-01', '2024-03-01']) {
    const history = {}
    for (let offset = -3; offset <= 0; offset++) history[H.shiftDay(today, offset)] = record([water], {[water]: 123})
    assert.equal(H.streak(H.restore(JSON.stringify({history}), today, ids), today, water, false), 4)
  }
  assert.equal(H.shiftDay('2024-02-28', 1), '2024-02-29')
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
