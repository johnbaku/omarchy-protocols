.pragma library

// Daily records store the protocols actually available that day. Missing days
// are unknown, not failures; today's unfinished work is not a consistency loss.
function validDay(key) {
  if (typeof key !== "string" || !/^20\d\d-\d\d-\d\d$/.test(key)) return false
  var d = date(key)
  return dayKey(d) === key
}

function date(key) {
  var parts = key.split("-")
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12)
}

function dayKey(d) {
  function pad(n) { return n < 10 ? "0" + n : String(n) }
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
}

function shiftDay(key, offset) {
  var d = date(key)
  d.setDate(d.getDate() + offset)
  return dayKey(d)
}

function cleanRecord(record, ids) {
  if (!record || !Array.isArray(record.available)) return null
  var available = ids.filter(function(id) { return record.available.indexOf(id) !== -1 })
  if (!available.length) return null
  var done = {}
  available.forEach(function(id) {
    var at = record.done && record.done[id]
    if (typeof at === "number" && isFinite(at) && at > 0) done[id] = at
  })
  return { available: available, done: done }
}

function restore(raw, today, ids) {
  var history = {}
  try {
    var state = JSON.parse(String(raw || ""))
    if (!state || typeof state !== "object") return history
    if (state.history && typeof state.history === "object") {
      Object.keys(state.history).filter(validDay).sort().slice(-36600).forEach(function(key) {
        var record = cleanRecord(state.history[key], ids)
        if (record) history[key] = record
      })
    }
    // The old format only proves a protocol existed if it was marked or
    // announced. Never infer missed protocols from today's catalog.
    if (validDay(state.day) && state.day <= today && !history[state.day]) {
      var available = ids.filter(function(id) {
        return (state.done && typeof state.done[id] === "number" && state.done[id] > 0)
          || (state.notified && state.notified[id] === true)
      })
      var legacy = cleanRecord({ available: available, done: state.done }, ids)
      if (legacy) history[state.day] = legacy
    }
  } catch (e) {}
  return history
}

function record(history, day, items, done) {
  var old = history[day]
  var available = old ? old.available.slice() : []
  items.forEach(function(item) { if (available.indexOf(item.id) === -1) available.push(item.id) })
  Object.keys(done).forEach(function(id) { if (available.indexOf(id) === -1) available.push(id) })
  available.sort()
  var next = { available: available, done: Object.assign({}, done) }
  if (old && JSON.stringify(old) === JSON.stringify(next)) return history
  var result = Object.assign({}, history)
  result[day] = next
  return result
}

function counts(record) {
  if (!record) return { done: 0, total: 0, complete: false }
  var done = record.available.filter(function(id) { return !!record.done[id] }).length
  return { done: done, total: record.available.length, complete: record.available.length > 0 && done === record.available.length }
}

function summary(history, today) {
  var days = Object.keys(history).filter(function(key) { return key <= today }).sort()
  var done = 0, total = 0, completed = 0, recorded = 0
  days.forEach(function(key) {
    var count = counts(history[key])
    completed += count.done
    if (key < today) { done += count.done; total += count.total; recorded++ }
  })
  // An unfinished today doesn't break yesterday's streak. An unrecorded day
  // does: we cannot claim consecutive completion across a gap.
  var cursor = counts(history[today]).complete ? today : shiftDay(today, -1)
  var streak = 0
  while (counts(history[cursor]).complete) { streak++; cursor = shiftDay(cursor, -1) }
  return { started: days.length ? days[0] : today, consistency: total ? Math.round(100 * done / total) : null,
    completed: completed, streak: streak, recorded: recorded }
}

function monthDays(month, history, today, firstDayOfWeek) {
  var first = date(month)
  first.setDate(1)
  var offset = (first.getDay() - firstDayOfWeek + 7) % 7
  var start = shiftDay(dayKey(first), -offset)
  var result = []
  for (var i = 0; i < 42; i++) {
    var key = shiftDay(start, i)
    var count = counts(history[key])
    result.push({ day: key, number: date(key).getDate(), inMonth: key.slice(0, 7) === month.slice(0, 7),
      future: key > today, tracked: !!history[key], done: count.done, total: count.total, complete: count.complete })
  }
  return result
}

if (typeof module !== "undefined") module.exports = {
  validDay: validDay, date: date, dayKey: dayKey, shiftDay: shiftDay, restore: restore,
  record: record, counts: counts, summary: summary, monthDays: monthDays
}
