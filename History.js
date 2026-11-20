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

// Each protocol has its own streak. Pending work keeps yesterday's streak;
// a closed, unfinished window resets it. Gaps and unavailable days cannot
// establish consecutive daily completion, so they end the count.
function streak(history, today, id, missedToday) {
  function completed(key) {
    var entry = history[key]
    return entry && entry.available.indexOf(id) !== -1 && !!entry.done[id]
  }
  if (!completed(today) && missedToday) return 0
  var cursor = completed(today) ? today : shiftDay(today, -1)
  var count = 0
  while (completed(cursor)) { count++; cursor = shiftDay(cursor, -1) }
  return count
}

function summary(history, today, items) {
  var days = Object.keys(history).filter(function(key) { return key <= today }).sort()
  var streaks = {}
  items.forEach(function(item) {
    streaks[item.id] = streak(history, today, item.id, item.status === "missed")
  })
  return { started: days.length ? days[0] : today, streaks: streaks }
}

if (typeof module !== "undefined") module.exports = {
  validDay: validDay, date: date, dayKey: dayKey, shiftDay: shiftDay, restore: restore,
  record: record, streak: streak, summary: summary
}
