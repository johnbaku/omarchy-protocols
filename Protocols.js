.pragma library

// The protocols, when each is due, and how long to stay out. Pure functions,
// so tests/protocols.test.js can run them under node.

var DEG = Math.PI / 180
var MINUTE = 60000
var DAY = 86400000

// Each protocol's window, in minutes from its anchor (sunrise or sunset):
// it becomes due at `start`, is at its best until `ideal`, and can no longer
// be done after `end`. To add a protocol, add a row here and its strings in
// i18n/ (<id>.name, <id>.how, <id>.notify, <id>.notifyLate).
var PROTOCOLS = [
  { id: "morning-light", anchor: "sunrise", start: 30, ideal: 60, end: 180 },
  { id: "evening-light", anchor: "sunset", start: -45, ideal: 0, end: 0 }
]

// Nerd Font glyphs: the rising sun, the setting sun, and the plain one the bar
// shows when nothing is due.
var GLYPHS = {
  sunrise: String.fromCodePoint(0xF059C),
  sunset: String.fromCodePoint(0xF059B),
  idle: String.fromCodePoint(0xF05A8)
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

// Today's window for every protocol at a place, or [] where the sun does not
// rise or set today.
function windows(lat, lon, nowMs) {
  var sun = sunTimes(lat, lon, civilNoonMs(nowMs))
  if (sun.kind !== "normal") return []
  return PROTOCOLS.map(function(p) {
    var anchor = p.anchor === "sunrise" ? sun.riseMs : sun.setMs
    return {
      id: p.id,
      anchor: p.anchor,
      startMs: anchor + p.start * MINUTE,
      idealMs: anchor + p.ideal * MINUTE,
      endMs: anchor + p.end * MINUTE
    }
  })
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

function knownId(id) {
  for (var i = 0; i < PROTOCOLS.length; i++) if (PROTOCOLS[i].id === id) return true
  return false
}

// The saved state for `day`: when each protocol was done, which have been
// announced, and the last place the network was located. Another day's done
// and announced marks are dropped; anything malformed is too.
function parseState(raw, day) {
  var state = { day: day, done: {}, notified: {}, location: null }
  try {
    var data = JSON.parse(String(raw || ""))
    if (!data || typeof data !== "object") return state
    state.location = parseLocation(data.location)
    if (data.day !== day) return state
    PROTOCOLS.forEach(function(p) {
      var at = data.done ? data.done[p.id] : null
      if (typeof at === "number" && isFinite(at) && at > 0) state.done[p.id] = at
      if (data.notified && data.notified[p.id] === true) state.notified[p.id] = true
    })
  } catch (e) {}
  return state
}

if (typeof module !== "undefined") {
  module.exports = {
    PROTOCOLS: PROTOCOLS,
    GLYPHS: GLYPHS,
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
    parseState: parseState
  }
}
