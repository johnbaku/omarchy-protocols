// Run with: TZ=America/Vancouver node --test tests/
const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")

// Protocols.js is a QML library: drop its .pragma line so node can load it.
const source = fs.readFileSync(path.join(__dirname, "..", "Protocols.js"), "utf8").replace(/^\.pragma.*$/m, "")
const mod = { exports: {} }
new Function("module", source)(mod)
const P = mod.exports

const MINUTE = 60000
const near = (actual, expected, minutes) =>
  assert.ok(Math.abs(actual - expected) <= minutes * MINUTE,
    `${new Date(actual).toISOString()} not within ${minutes} min of ${new Date(expected).toISOString()}`)

test("sunrise and sunset match published tables", () => {
  // Victoria BC, 19 Nov 2026: 07:25 and 16:30 PST.
  let sun = P.sunTimes(48.4359, -123.35155, Date.parse("2026-11-19T20:00:00Z"))
  near(sun.riseMs, Date.parse("2026-11-19T15:25:00Z"), 3)
  near(sun.setMs, Date.parse("2026-11-20T00:30:00Z"), 3)

  // Sydney, 21 Jun 2026: 07:00 and 16:54 AEST.
  sun = P.sunTimes(-33.8688, 151.2093, Date.parse("2026-06-21T02:00:00Z"))
  near(sun.riseMs, Date.parse("2026-06-20T21:00:00Z"), 3)
  near(sun.setMs, Date.parse("2026-06-21T06:54:00Z"), 3)
})

test("polar day and night have no sunrise", () => {
  assert.strictEqual(P.sunTimes(78.22, 15.65, Date.parse("2026-06-21T11:00:00Z")).kind, "midnightSun")
  assert.strictEqual(P.sunTimes(78.22, 15.65, Date.parse("2026-12-21T11:00:00Z")).kind, "polarNight")
  assert.deepStrictEqual(P.windows(78.22, 15.65, Date.parse("2026-12-21T11:00:00Z")).map(p => p.id), ["morning-hydration"])
})

test("windows hang off sunrise and sunset", () => {
  const now = Date.parse("2026-11-19T18:00:00Z")
  const sun = P.sunTimes(48.4359, -123.35155, P.civilNoonMs(now))
  const [morning, evening] = P.windows(48.4359, -123.35155, now).filter(p => p.needsSky)
  assert.strictEqual(morning.id, "morning-light")
  assert.strictEqual(morning.startMs, sun.riseMs + 30 * MINUTE)
  assert.strictEqual(morning.idealMs, sun.riseMs + 60 * MINUTE)
  assert.strictEqual(morning.endMs, sun.riseMs + 180 * MINUTE)
  assert.strictEqual(evening.id, "evening-light")
  assert.strictEqual(evening.startMs, sun.setMs - 45 * MINUTE)
  assert.strictEqual(evening.endMs, sun.setMs)
})

test("status follows the window", () => {
  const win = { startMs: 1000, idealMs: 2000, endMs: 3000 }
  assert.strictEqual(P.statusOf(win, 999, null), "upcoming")
  assert.strictEqual(P.statusOf(win, 1000, null), "due")
  assert.strictEqual(P.statusOf(win, 2000, null), "late")
  assert.strictEqual(P.statusOf(win, 3000, null), "missed")
  assert.strictEqual(P.statusOf(win, 3000, 1500), "done")
  assert.ok(P.isActive("due") && P.isActive("late") && !P.isActive("missed"))
})

test("dose follows cloud cover", () => {
  assert.deepStrictEqual(P.dose(0), { sky: "clear", minutes: 10 })
  assert.deepStrictEqual(P.dose(50), { sky: "cloudy", minutes: 20 })
  assert.deepStrictEqual(P.dose(100), { sky: "overcast", minutes: 30 })
  assert.strictEqual(P.dose(101), null)
  assert.strictEqual(P.dose("50"), null)
  assert.strictEqual(P.parseCloudCover('{"current":{"cloud_cover":80}}'), 80)
  assert.strictEqual(P.parseCloudCover('{"current":{"cloud_cover":"<b>"}}'), null)
  assert.strictEqual(P.parseCloudCover("not json"), null)
})

test("locations are validated and their names made plain", () => {
  assert.deepStrictEqual(
    P.parseLocation('{"name":"Victoria","latitude":48.4359,"longitude":-123.35155,"country":"CA"}'),
    { name: "Victoria", latitude: 48.4359, longitude: -123.35155 })
  assert.strictEqual(P.parseLocation('{"name":"Malibu"}'), null)
  assert.strictEqual(P.parseLocation('{"latitude":91,"longitude":0}'), null)
  assert.strictEqual(P.parseLocation(""), null)

  const hostile = P.parseLocation({ name: '<img src="https://example.invalid/t">\n' + "x".repeat(200), latitude: 1, longitude: 2 })
  assert.ok(!/[<>\n]/.test(hostile.name))
  assert.ok(hostile.name.length <= 64)
})

test("state keeps today's marks and drops everything else", () => {
  const raw = JSON.stringify({
    day: "2026-11-19",
    done: { "morning-light": 123, "evening-light": "soon", "made-up": 5 },
    notified: { "morning-light": true, "evening-light": 1 },
    location: { name: "Victoria", latitude: 48.4, longitude: -123.3 }
  })
  const today = P.parseState(raw, "2026-11-19")
  assert.deepStrictEqual(today.done, { "morning-light": 123 })
  assert.deepStrictEqual(today.notified, { "morning-light": true })
  assert.strictEqual(today.location.name, "Victoria")

  const tomorrow = P.parseState(raw, "2026-11-20")
  assert.deepStrictEqual(tomorrow.done, {})
  assert.deepStrictEqual(tomorrow.notified, {})
  assert.strictEqual(tomorrow.location.name, "Victoria")

  assert.deepStrictEqual(P.parseState("garbage", "2026-11-20"), { day: "2026-11-20", done: {}, notified: {}, snoozed: {}, location: null })
})

test("the day key is the computer's own calendar day", () => {
  const ms = new Date(2026, 0, 5, 23, 59).getTime()
  assert.strictEqual(P.dayKey(ms), "2026-01-05")
  assert.strictEqual(P.dayKey(ms + 2 * MINUTE), "2026-01-06")
})


test("hydration works without location and uses local morning hours, including DST transitions", () => {
  for (const [month, day] of [[0, 5], [2, 8], [10, 1]]) {
    const now = new Date(2026, month, day, 8).getTime()
    const [water] = P.windows(null, null, now)
    assert.strictEqual(water.id, "morning-hydration")
    assert.strictEqual(water.needsSky, false)
    assert.strictEqual(water.startMs, new Date(2026, month, day, 6).getTime())
    assert.strictEqual(water.endMs, new Date(2026, month, day, 12).getTime())
    assert.strictEqual(P.statusOf(water, water.startMs - 1), "upcoming")
    assert.strictEqual(P.statusOf(water, water.startMs), "due")
    assert.strictEqual(P.statusOf(water, water.endMs - 1), "due")
    assert.strictEqual(P.statusOf(water, water.endMs), "missed")
    assert.strictEqual(P.statusOf(water, water.endMs, now), "done")
  }
})

test("hydration completion and notification marks survive restart and reset tomorrow", () => {
  const raw = JSON.stringify({day: "2026-11-19", done: {"morning-hydration": 123}, notified: {"morning-hydration": true}})
  const state = P.parseState(raw, "2026-11-19")
  assert.strictEqual(state.done["morning-hydration"], 123)
  assert.strictEqual(state.notified["morning-hydration"], true)
  const tomorrow = P.parseState(raw, "2026-11-20")
  assert.deepStrictEqual(tomorrow.done, {})
  assert.deepStrictEqual(tomorrow.notified, {})
})


test("hydration is announced immediately without sky advice while light waits for weather", () => {
  const service = fs.readFileSync(path.join(__dirname, "..", "Service.qml"), "utf8")
  const announce = service.slice(service.indexOf("  function announce("), service.indexOf("  function markDone("))
  const run = new Function("Protocols", `
    var awaitingSky = ["morning-hydration", "morning-light"]
    var onScreen = []
    var sent = []
    var dose = null
    var notificationApp = "Protocols", ipcTarget = "johnbaku.protocols"
    var strings = { t: function(key) { return { arg: function() { return key }, toString: function() { return key } } } }
    var Quickshell = { execDetached: function(args) { sent.push(args) } }
    var I18n = { formatNumber: String }
    function formatTime() { return "12:00" }
    function itemsAt() { return [
      { id: "morning-hydration", anchor: "morning", status: "due", needsSky: false },
      { id: "morning-light", anchor: "sunrise", status: "due", needsSky: true }
    ] }
    ${announce}
    announce(false)
    var pending = awaitingSky.slice()
    var immediate = sent.slice()
    announce()
    return {pending, immediate, sent, onScreen}
  `)
  const result = run(P)
  assert.deepStrictEqual(result.pending, ["morning-light"])
  assert.strictEqual(result.immediate.length, 1)
  assert.strictEqual(result.immediate[0][8], "morning-hydration.notify")
  assert.strictEqual(result.sent[1][8], "morning-light.notify\nsky.unknown")
  assert.deepStrictEqual(result.onScreen, ["morning-hydration", "morning-light"])
  assert.deepStrictEqual(result.sent[0].slice(-7), ["--action", "action.snooze", "omarchy-shell", "-q", "johnbaku.protocols", "snooze", "morning-hydration"])
})

test("a snoozed reminder comes back after five minutes", () => {
  assert.strictEqual(P.SNOOZE_MS, 5 * MINUTE)
  const until = 1000 + P.SNOOZE_MS
  assert.ok(P.shouldAnnounce(undefined, undefined, 1000))
  assert.ok(!P.shouldAnnounce(true, undefined, 1000))
  assert.ok(!P.shouldAnnounce(true, until, until - 1))
  assert.ok(P.shouldAnnounce(true, until, until))

  const raw = JSON.stringify({ day: "2026-11-19", snoozed: { "morning-light": until, "evening-light": "soon", "unknown": 5 } })
  assert.deepStrictEqual(P.parseState(raw, "2026-11-19").snoozed, { "morning-light": until })
  assert.deepStrictEqual(P.parseState(raw, "2026-11-20").snoozed, {})
})
