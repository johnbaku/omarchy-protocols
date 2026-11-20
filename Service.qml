import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Protocols.js" as Protocols
import "History.js" as History

// Works out when each protocol is due and announces it once. One copy runs for
// the whole shell, whatever the number of bars; BarWidget.qml only draws it.
Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null

  readonly property string ipcTarget: "johnbaku.protocols"
  readonly property string notificationApp: "Protocols"
  // Open-Meteo answers curl's default User-Agent with 403 Forbidden.
  readonly property string userAgent: "omarchy-protocols-plugin"
  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/omarchy-protocols"

  // ---- Time. A gap between ticks far longer than the interval means the
  //      computer slept, so it may have travelled.
  property real nowMs: Date.now()
  readonly property int resumeGapMs: 5 * 60000

  // ---- Location: the one stored for Omarchy's weather panel, or with none
  //      stored, where geo.omarchy.org places this network. The last detected
  //      place is saved, so a start without a network still has one.
  property var configuredLocation: null
  property var detectedLocation: null
  readonly property var location: configuredLocation || detectedLocation

  // ---- Today's marks, saved so a shell restart neither forgets what was
  //      done nor announces it twice.
  property bool stateLoaded: false
  property string day: ""
  property var done: ({})
  property var notified: ({})
  property var history: ({})

  // ---- Cloud cover, fetched when a protocol comes due or the card opens.
  property var cloudCover: null
  property real cloudAtMs: 0
  readonly property int cloudFreshMs: 15 * 60000
  readonly property var dose: cloudCover !== null && nowMs - cloudAtMs < cloudFreshMs ? Protocols.dose(cloudCover) : null

  // Announced and waiting for the cloud cover, and those now on screen.
  property var awaitingSky: []
  property var onScreen: []

  readonly property var sun: location
    ? Protocols.sunTimes(location.latitude, location.longitude, Protocols.civilNoonMs(nowMs)) : null
  readonly property var items: itemsAt(nowMs)
  readonly property var activeItem: firstWhere(function(item) { return Protocols.isActive(item.status) })
  readonly property var nextItem: firstWhere(function(item) { return item.status === "upcoming" })

  Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function itemsAt(ms) {
    return Protocols.windows(location ? location.latitude : null, location ? location.longitude : null, ms).map(function(win) {
      var doneAt = done[win.id] || 0
      return {
        id: win.id, anchor: win.anchor, needsSky: win.needsSky, startMs: win.startMs, idealMs: win.idealMs, endMs: win.endMs,
        doneAt: doneAt, status: Protocols.statusOf(win, ms, doneAt)
      }
    })
  }

  function firstWhere(test) {
    for (var i = 0; i < items.length; i++) if (test(items[i])) return items[i]
    return null
  }

  function formatTime(ms) {
    return new Date(ms).toLocaleTimeString(Qt.locale(I18n.formatLocale), Locale.ShortFormat)
  }

  function save() {
    if (!stateLoaded) return
    history = History.record(history, day, itemsAt(nowMs), done)
    stateFile.setText(JSON.stringify({ day: day, done: done, notified: notified, location: detectedLocation, history: history }, null, 2) + "\n")
  }

  function applyState(raw) {
    var state = Protocols.parseState(raw, Protocols.dayKey(Date.now()))
    history = History.restore(raw, state.day, Protocols.PROTOCOLS.map(function(p) { return p.id }))
    day = state.day
    done = state.done
    notified = state.notified
    if (!detectedLocation) detectedLocation = state.location
    stateLoaded = true
    detectLocation()
    tick()
  }

  function tick() {
    var now = Date.now()
    var resumed = now - nowMs > resumeGapMs
    nowMs = now
    if (!stateLoaded) return

    var today = Protocols.dayKey(now)
    if (today !== day) {
      day = today
      done = ({})
      notified = ({})
      save()
    }
    if (resumed) detectLocation()

    var current = itemsAt(now)
    var recorded = History.record(history, day, current, done)
    if (recorded !== history) { history = recorded; save() }
    var due = []
    var active = {}
    current.forEach(function(item) {
      if (!Protocols.isActive(item.status)) return
      active[item.id] = true
      if (!notified[item.id]) due.push(item.id)
    })

    // Take down the reminder for anything done or no longer possible.
    onScreen = onScreen.filter(function(id) {
      if (active[id]) return true
      Quickshell.execDetached(["omarchy-notification-dismiss", strings.t(id + ".name")])
      return false
    })

    if (due.length === 0) return
    var marks = Object.assign({}, notified)
    due.forEach(function(id) { marks[id] = true })
    notified = marks
    save()
    awaitingSky = awaitingSky.concat(due)
    // Clock reminders should never wait for a weather request.
    announce(false)
    if (awaitingSky.length === 0) return
    if (dose) announce()
    else if (!refreshSky()) announce()
  }

  // Send the waiting reminders, with the dose if the cloud cover is known.
  function announce(includeSky) {
    var current = itemsAt(Date.now())
    var waiting = awaitingSky.filter(function(id) {
      return includeSky !== false || current.some(function(item) { return item.id === id && !item.needsSky })
    })
    awaitingSky = awaitingSky.filter(function(id) { return waiting.indexOf(id) === -1 })
    current.forEach(function(item) {
      if (waiting.indexOf(item.id) === -1 || !Protocols.isActive(item.status)) return
      var late = item.status === "late"
      var sky = dose
        ? strings.t("sky." + dose.sky).arg(I18n.formatNumber(dose.minutes))
        : strings.t("sky.unknown")
      var body = strings.t(item.id + (late ? ".notifyLate" : ".notify")).arg(formatTime(late ? item.endMs : item.idealMs))
      // Critical keeps it on screen until it is dismissed or marked done, so
      // it is still there when you sit down after the window has opened.
      Quickshell.execDetached([
        "omarchy-notification-send", "--app-name", notificationApp, "-g", Protocols.GLYPHS[item.anchor],
        "-u", "critical", strings.t(item.id + ".name"), body + (item.needsSky ? "\n" + sky : ""),
        "--action", strings.t("action.done"), "omarchy-shell", "-q", ipcTarget, "done", item.id
      ])
      if (onScreen.indexOf(item.id) === -1) onScreen = onScreen.concat([item.id])
    })
  }

  function markDone(id) {
    tick()
    if (!stateLoaded || !Protocols.knownId(id) || done[id]) return
    var marks = Object.assign({}, done)
    marks[id] = Date.now()
    done = marks
    save()
    tick()
  }

  function markUndone(id) {
    tick()
    if (!stateLoaded || !done[id]) return
    var marks = Object.assign({}, done)
    delete marks[id]
    done = marks
    save()
    tick()
  }

  function detectLocation() {
    if (configuredLocation || geoProc.running) return
    geoProc.running = true
  }

  // Fetch the cloud cover unless it is fresh. False when there is nothing to
  // wait for.
  function refreshSky() {
    if (cloudProc.running) return true
    if (!location || dose) return false
    cloudProc.command = ["curl", "-fsS", "--max-time", "5", "--max-filesize", "65536", "-A", userAgent,
      "https://api.open-meteo.com/v1/forecast?current=cloud_cover"
        + "&latitude=" + encodeURIComponent(location.latitude.toFixed(2))
        + "&longitude=" + encodeURIComponent(location.longitude.toFixed(2))]
    cloudProc.running = true
    return true
  }

  // FileView won't create parent directories when saving.
  Component.onCompleted: Quickshell.execDetached(["mkdir", "-p", stateDir])

  Timer {
    interval: 30000
    repeat: true
    running: true
    onTriggered: root.tick()
  }

  FileView {
    id: stateFile
    path: root.stateDir + "/state.json"
    atomicWrites: true
    printErrors: false
    onLoaded: if (!root.stateLoaded) root.applyState(text())
    onLoadFailed: if (!root.stateLoaded) root.applyState("")
  }

  // Owned by omarchy-weather-location. Watched, so a location set in the
  // weather panel takes effect here at once.
  FileView {
    id: weatherLocationFile
    path: Quickshell.env("HOME") + "/.local/state/omarchy/settings/weather.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      // A stored name without coordinates can't place the sun: detect instead.
      root.configuredLocation = Protocols.parseLocation(text())
      if (root.stateLoaded) root.detectLocation()
      root.tick()
    }
    onLoadFailed: {
      root.configuredLocation = null
      if (root.stateLoaded) root.detectLocation()
    }
  }

  Process {
    id: geoProc
    command: ["curl", "-fsS", "--max-time", "4", "--max-filesize", "4096", "https://geo.omarchy.org/"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var detected = Protocols.parseLocation(text)
        if (!detected) return
        root.detectedLocation = detected
        if (root.stateLoaded) {
          root.save()
          root.tick()
        }
      }
    }
  }

  Process {
    id: cloudProc
    stdout: StdioCollector {
      id: cloudOut
      waitForEnd: true
    }
    onExited: {
      var cover = Protocols.parseCloudCover(cloudOut.text)
      if (cover !== null) {
        root.cloudCover = cover
        root.cloudAtMs = Date.now()
        root.nowMs = root.cloudAtMs
      }
      if (root.awaitingSky.length > 0) root.announce()
    }
  }

  ShellIpc {
    target: root.ipcTarget

    function done(id: string): void { root.markDone(id) }
    function undo(id: string): void { root.markUndone(id) }
    function progress(): string {
      return JSON.stringify({ summary: History.summary(root.history, root.day, root.items), history: root.history })
    }
    function status(): string {
      return JSON.stringify({ location: root.location, sun: root.sun, items: root.items, dose: root.dose })
    }
  }
}
