.pragma library

// The protocols, when each is due, and how long to stay out. Pure functions,
// so tests/protocols.test.js can run them under node.

var DEG = Math.PI / 180
var MINUTE = 60000
var DAY = 86400000

// How long the Snooze button on a reminder puts it off.
var SNOOZE_MS = 5 * MINUTE

// When you get up and go to bed, in minutes after local midnight, unless you
// say otherwise: 7 a.m. and 11 p.m., about when most adults do. A bedtime at
// or before the wake time is tomorrow's.
var DEFAULT_SCHEDULE = { wake: 420, bed: 1380 }

// How far one press of the card's earlier and later buttons moves a time.
var SCHEDULE_STEP = 15

// Each protocol's window, in minutes from its anchor (sunrise, sunset, your
// wake time, your bedtime, or "clock" for local midnight):
// it becomes due at `start`, is at its best until `ideal`, and can no longer
// be done after `end`. `needsSky` marks the light protocols, which need a
// location and say how long to stay out. `ownStatus` marks a reminder rather
// than a task with a deadline: the card words its status from the protocol's
// own strings. To add a protocol, add a row here and its strings in i18n/
// (<id>.name, <id>.how, <id>.notify, <id>.notifyLate, and with ownStatus
// <id>.upcoming, <id>.due and <id>.ended).
var PROTOCOLS = [
  { id: "morning-hydration", anchor: "wake", start: 0, ideal: 360, end: 360, glyph: "water", ownStatus: true },
  { id: "morning-light", anchor: "sunrise", start: 30, ideal: 60, end: 180, glyph: "sunrise", needsSky: true },
  { id: "nsdr", anchor: "clock", start: 840, ideal: 1020, end: 1020, glyph: "rest" },
  { id: "evening-light", anchor: "sunset", start: -45, ideal: 0, end: 0, glyph: "sunset", needsSky: true },
  { id: "dim-lights", anchor: "bed", start: -120, ideal: 60, end: 60, glyph: "night", ownStatus: true }
]

// Nerd Font glyphs: one per protocol, the plain sun the bar shows when
// nothing is due and the check it shows once the day is done, a row's check
// empty and ticked, the chevrons that open and close a row, and the card's
// settings buttons.
var GLYPHS = {
  water: String.fromCodePoint(0xF058C),
  rest: String.fromCodePoint(0xF117B),
  night: String.fromCodePoint(0xF0594),
  earlier: String.fromCodePoint(0xF0374),
  later: String.fromCodePoint(0xF0415),
  settings: String.fromCodePoint(0xF0493),
  back: String.fromCodePoint(0xF004D),
  sunrise: String.fromCodePoint(0xF059C),
  sunset: String.fromCodePoint(0xF059B),
  idle: String.fromCodePoint(0xF05A8),
  allDone: String.fromCodePoint(0xF05E1),
  unchecked: String.fromCodePoint(0xF0130),
  checked: String.fromCodePoint(0xF05E0),
  more: String.fromCodePoint(0xF0140),
  less: String.fromCodePoint(0xF0143)
}

// Refraction plus the sun's radius, the figure published sunrise tables use.
var HORIZON = -0.833

function wrap180(deg) {
  return ((deg % 360) + 540) % 360 - 180
}

// The sun's declination (degrees) and the equation of time (minutes) at an
// instant, from the Astronomical Almanac's low-precision formulas.
function solar(ms) {
  var n = ms / DAY + 2440587.5 - 2451545.0
  var L = 280.460 + 0.9856474 * n
  var g = (357.528 + 0.9856003 * n) * DEG
  var lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG
  var eps = (23.439 - 0.0000004 * n) * DEG
  var ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG
  return {
    declination: Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG,
    equationOfTime: 4 * wrap180(L - ra)
  }
}

// The solar noon at `lon` nearest to `nearMs`.
function solarNoonMs(lon, nearMs) {
  var noon = nearMs
  for (var i = 0; i < 2; i++) {
    var minutesUtc = 720 - 4 * lon - solar(noon).equationOfTime
    var candidate = Math.floor(nearMs / DAY) * DAY + minutesUtc * MINUTE
    noon = candidate + Math.round((nearMs - candidate) / DAY) * DAY
  }
  return noon
}

// Sunrise and sunset around the solar noon nearest `nearMs` (pass the civil
// noon of the day wanted). `kind` is "normal", "midnightSun" or "polarNight";
// the last two have no rise or set.
function sunTimes(lat, lon, nearMs) {
  var noon = solarNoonMs(lon, nearMs)
  var dec = solar(noon).declination
  var cosH = (Math.sin(HORIZON * DEG) - Math.sin(lat * DEG) * Math.sin(dec * DEG))
           / (Math.cos(lat * DEG) * Math.cos(dec * DEG))
  if (cosH <= -1) return { kind: "midnightSun", riseMs: null, setMs: null }
  if (cosH >= 1) return { kind: "polarNight", riseMs: null, setMs: null }
  var halfDayMs = Math.acos(cosH) / DEG * 4 * MINUTE
  return { kind: "normal", riseMs: noon - halfDayMs, setMs: noon + halfDayMs }
}

// The computer's own calendar day, as "2026-11-19".
function dayKey(ms) {
  var d = new Date(ms)
  function pad(n) { return n < 10 ? "0" + n : String(n) }
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
}

function civilNoonMs(ms) {
  var d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

// A clock time today, `minutes` after local midnight. Built as a local date,
// so a DST change does not shift the schedule.
function clockMs(nowMs, minutes) {
  var d = new Date(nowMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime()
}

// "6:30" or "22:15" as minutes after midnight, or null.
function parseClock(text) {
  var m = /^([0-9]{1,2}):([0-9]{2})$/.exec(String(text === undefined || text === null ? "" : text).trim())
  if (!m) return null
  var hours = parseInt(m[1], 10), minutes = parseInt(m[2], 10)
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

// A saved {"wake", "bed"} schedule, with the default for anything unusable.
function parseSchedule(data) {
  function minutes(value, fallback) {
    return typeof value === "number" && Math.floor(value) === value && value >= 0 && value < 1440 ? value : fallback
  }
  var given = data && typeof data === "object" ? data : {}
  return { wake: minutes(given.wake, DEFAULT_SCHEDULE.wake), bed: minutes(given.bed, DEFAULT_SCHEDULE.bed) }
}

// A schedule with its wake or bed time moved by `minutes`, wrapping at
// midnight.
function shiftSchedule(schedule, which, minutes) {
  var next = parseSchedule(schedule)
  if (which === "wake" || which === "bed") next[which] = ((next[which] + minutes) % 1440 + 1440) % 1440
  return next
}

// Today's windows, earliest first. The light protocols need a location and a
// sun that rises and sets; the rest run off the clock and the schedule. The
// day's marks reset at midnight, so a bedtime window is held inside today: it
// opens by 11 p.m. and closes by midnight, however late the bedtime.
function windows(lat, lon, nowMs, schedule) {
  var sun = typeof lat === "number" && typeof lon === "number"
    ? sunTimes(lat, lon, civilNoonMs(nowMs)) : null
  var times = parseSchedule(schedule)
  var bed = times.bed <= times.wake ? times.bed + 1440 : times.bed
  function at(p, minutes) {
    if (p.anchor === "sunrise") return sun.riseMs + minutes * MINUTE
    if (p.anchor === "sunset") return sun.setMs + minutes * MINUTE
    if (p.anchor === "bed") return clockMs(nowMs, Math.min(bed + minutes, minutes === p.start ? 1380 : 1440))
    return clockMs(nowMs, (p.anchor === "wake" ? times.wake : 0) + minutes)
  }
  return PROTOCOLS.filter(function(p) {
    return (p.anchor !== "sunrise" && p.anchor !== "sunset") || (sun && sun.kind === "normal")
  }).map(function(p) {
    return {
      id: p.id,
      anchor: p.anchor,
      glyph: p.glyph,
      needsSky: p.needsSky === true,
      ownStatus: p.ownStatus === true,
      startMs: at(p, p.start),
      idealMs: at(p, p.ideal),
      endMs: at(p, p.end)
    }
  }).sort(function(a, b) { return a.startMs - b.startMs })
}

// "done", "upcoming", "due" (in its best stretch), "late" (still worth doing)
// or "missed".
function statusOf(win, nowMs, doneAt) {
  if (doneAt) return "done"
  if (nowMs < win.startMs) return "upcoming"
  if (nowMs >= win.endMs) return "missed"
  return nowMs < win.idealMs ? "due" : "late"
}

function isActive(status) {
  return status === "due" || status === "late"
}

// How long to stay out under a given cloud cover (percent): Huberman's 5-10
// minutes when clear, 15-20 when cloudy, 30 when overcast. null when unknown.
function dose(cloudCover) {
  if (typeof cloudCover !== "number" || !isFinite(cloudCover) || cloudCover < 0 || cloudCover > 100) return null
  if (cloudCover <= 25) return { sky: "clear", minutes: 10 }
  if (cloudCover <= 75) return { sky: "cloudy", minutes: 20 }
  return { sky: "overcast", minutes: 30 }
}

// Open-Meteo's answer to current=cloud_cover, as a percent or null.
function parseCloudCover(raw) {
  try {
    var data = JSON.parse(String(raw || ""))
    var cover = data && data.current ? data.current.cloud_cover : null
    return dose(cover) ? cover : null
  } catch (e) {
    return null
  }
}

// Text from the network or a file, cut down to one short plain line.
function cleanLabel(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64)
}

// A {"name", "latitude", "longitude"} location, the shape of both Omarchy's
// weather.json and geo.omarchy.org. null without usable coordinates.
function parseLocation(raw) {
  try {
    var data = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!data || typeof data !== "object") return null
    var lat = typeof data.latitude === "number" ? data.latitude : parseFloat(data.latitude)
    var lon = typeof data.longitude === "number" ? data.longitude : parseFloat(data.longitude)
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { name: cleanLabel(data.name), latitude: lat, longitude: lon }
  } catch (e) {
    return null
  }
}

// A string with its %1, if it has one, filled in.
function fill(text, value) {
  return String(text).replace("%1", value)
}

function knownId(id) {
  for (var i = 0; i < PROTOCOLS.length; i++) if (PROTOCOLS[i].id === id) return true
  return false
}

// Whether a protocol should be announced now: it never has been, or its
// snooze has run out.
function shouldAnnounce(notified, snoozedUntil, nowMs) {
  return !notified || (!!snoozedUntil && nowMs >= snoozedUntil)
}

// The saved state for `day`: when each protocol was done, which have been
// announced, when each snoozed one comes back, the last place the network
// was located, and the wake and bed times. Another day's marks are dropped;
// anything malformed is too.
function parseState(raw, day) {
  var state = { day: day, done: {}, notified: {}, snoozed: {}, location: null, schedule: parseSchedule(null) }
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return state
    state.location = parseLocation(data.location)
    state.schedule = parseSchedule(data.schedule)
    if (data.day !== day) return state
    PROTOCOLS.forEach(function(p) {
      var at = data.done ? data.done[p.id] : null
      if (typeof at === "number" && isFinite(at) && at > 0) state.done[p.id] = at
      if (data.notified && data.notified[p.id] === true) state.notified[p.id] = true
      var until = data.snoozed ? data.snoozed[p.id] : null
      if (typeof until === "number" && isFinite(until) && until > 0) state.snoozed[p.id] = until
    })
  } catch (e) {}
  return state
}

if (typeof module !== "undefined") {
  module.exports = {
    PROTOCOLS: PROTOCOLS,
    GLYPHS: GLYPHS,
    SNOOZE_MS: SNOOZE_MS,
    DEFAULT_SCHEDULE: DEFAULT_SCHEDULE,
    SCHEDULE_STEP: SCHEDULE_STEP,
    shiftSchedule: shiftSchedule,
    clockMs: clockMs,
    parseClock: parseClock,
    parseSchedule: parseSchedule,
    fill: fill,
    solar: solar,
    solarNoonMs: solarNoonMs,
    sunTimes: sunTimes,
    dayKey: dayKey,
    civilNoonMs: civilNoonMs,
    windows: windows,
    statusOf: statusOf,
    isActive: isActive,
    dose: dose,
    parseCloudCover: parseCloudCover,
    cleanLabel: cleanLabel,
    parseLocation: parseLocation,
    knownId: knownId,
    shouldAnnounce: shouldAnnounce,
    parseState: parseState
  }
}
