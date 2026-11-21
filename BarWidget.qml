import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Protocols.js" as Protocols

// The bar icon and its card. All the timing lives in Service.qml.
BarWidget {
  id: root
  moduleName: "johnbaku.protocols"
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  readonly property var service: bar && bar.shell ? bar.shell.serviceFor("johnbaku.protocols") : null
  readonly property var items: service ? service.items : []
  readonly property var activeItem: service ? service.activeItem : null
  readonly property var nextItem: service ? service.nextItem : null
  readonly property var sun: service ? service.sun : null
  readonly property var dose: service ? service.dose : null
  readonly property string placeName: service && service.location ? service.location.name : ""

  property bool popupOpen: false
  // The card's second screen, reached from the gear in its corner.
  property bool showSettings: false
  function close() { popupOpen = false }
  onPopupOpenChanged: {
    if (popupOpen && service) service.refreshSky()
    if (!popupOpen) {
      expanded = ({})
      showSettings = false
    }
  }

  readonly property int doneCount: items.filter(function(item) { return item.status === "done" }).length
  readonly property bool allDone: items.length > 0 && doneCount === items.length

  // The protocol just checked off in the card, so its rebuilt row can confirm it.
  property string justDone: ""

  // Rows showing their detail (the window and how to do it), by protocol id.
  // Kept here because the rows are rebuilt on every tick.
  property var expanded: ({})
  function toggleExpanded(id) {
    var next = Object.assign({}, expanded)
    if (next[id]) delete next[id]
    else next[id] = true
    expanded = next
  }

  Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function time(ms) {
    return service ? service.formatTime(ms) : ""
  }

  function statusText(item) {
    if (item.ownStatus && item.status === "upcoming") return Protocols.fill(strings.t(item.id + ".upcoming"), time(item.startMs))
    if (item.ownStatus && Protocols.isActive(item.status)) return Protocols.fill(strings.t(item.id + ".due"), time(item.idealMs))
    if (item.ownStatus && item.status === "missed") return strings.t(item.id + ".ended")
    if (item.status === "upcoming") return strings.t("status.upcoming").arg(time(item.startMs))
    if (item.status === "due") return strings.t("status.due").arg(time(item.idealMs))
    if (item.status === "late") return strings.t("status.late").arg(time(item.endMs))
    if (item.status === "done") return strings.t("status.done").arg(time(item.doneAt))
    return strings.t("status.missed")
  }

  readonly property string tooltip: activeItem
    ? strings.t("tooltip.active").arg(strings.t(activeItem.id + ".name"))
    : nextItem
      ? strings.t("tooltip.upcoming").arg(strings.t(nextItem.id + ".name")).arg(time(nextItem.startMs))
      : allDone ? strings.t("tooltip.allDone") : strings.t("tooltip.finished")

  readonly property string emptyText: !service || !service.stateLoaded ? strings.t("popup.starting")
    : !service.location ? strings.t("popup.noLocation")
    : sun && sun.kind !== "normal" ? strings.t("popup.noSun")
    : ""


  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // A check for the rest of the day once everything is done; dimmed only
    // when the day ran out with something missed.
    text: root.activeItem ? Protocols.GLYPHS[root.activeItem.glyph]
      : root.allDone ? Protocols.GLYPHS.allDone : Protocols.GLYPHS.idle
    active: root.activeItem !== null
    dimmed: root.activeItem === null && root.nextItem === null && !root.allDone
    tooltipText: root.popupOpen ? "" : root.tooltip
    // Left click opens the card; right click marks what is due as done.
    onPressed: function(mouseButton) {
      if (mouseButton === Qt.RightButton) {
        if (root.activeItem) root.service.markDone(root.activeItem.id)
      } else {
        root.popupOpen = !root.popupOpen
      }
    }
  }

  component Label: Text {
    textFormat: Text.PlainText
    color: Commons.Color.popups.text
    font.family: Style.font.family
    font.pixelSize: Style.font.body
    wrapMode: Text.WordWrap
  }

  // One time in the settings: what it is, what it moves, and a button either
  // side to shift it a step.
  component SettingRow: Item {
    id: setting
    required property string which
    width: parent.width
    implicitHeight: Math.max(about.implicitHeight, later.implicitHeight)

    Column {
      id: about
      anchors.left: parent.left
      anchors.right: earlier.left
      anchors.rightMargin: Style.space(10)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(2)

      Label {
        width: parent.width
        text: strings.t("settings." + setting.which)
        font.bold: true
      }
      Label {
        width: parent.width
        opacity: 0.7
        font.pixelSize: Style.font.bodySmall
        text: strings.t("settings." + setting.which + "Help")
      }
    }
    PanelActionButton {
      id: earlier
      anchors.right: value.left
      anchors.verticalCenter: parent.verticalCenter
      iconText: Protocols.GLYPHS.earlier
      foreground: Commons.Color.popups.text
      hoverColor: Commons.Color.accent
      tooltipText: strings.t("settings.earlier")
      onClicked: root.service.shiftScheduleTime(setting.which, -Protocols.SCHEDULE_STEP)
    }
    Label {
      id: value
      anchors.right: later.left
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(76)
      horizontalAlignment: Text.AlignHCenter
      wrapMode: Text.NoWrap
      text: root.service ? root.time(Protocols.clockMs(root.service.nowMs, root.service.schedule[setting.which])) : ""
    }
    PanelActionButton {
      id: later
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      iconText: Protocols.GLYPHS.later
      foreground: Commons.Color.popups.text
      hoverColor: Commons.Color.accent
      tooltipText: strings.t("settings.later")
      onClicked: root.service.shiftScheduleTime(setting.which, Protocols.SCHEDULE_STEP)
    }
  }

  PopupCard {
    id: popup
    anchorItem: root
    bar: root.bar
    owner: root
    open: root.popupOpen
    contentWidth: popup.fittedContentWidth(Style.space(340))
    contentHeight: popup.fittedContentHeight(root.showSettings ? settings.implicitHeight : column.implicitHeight)

    // Settings: the wake and bed times.
    Column {
      id: settings
      width: parent.width
      visible: root.showSettings
      spacing: Style.space(12)

      Item {
        width: parent.width
        implicitHeight: back.implicitHeight

        PanelActionButton {
          id: back
          anchors.left: parent.left
          iconText: Protocols.GLYPHS.back
          foreground: Commons.Color.popups.text
          hoverColor: Commons.Color.accent
          tooltipText: strings.t("settings.back")
          onClicked: root.showSettings = false
        }
        Label {
          anchors.left: back.right
          anchors.leftMargin: Style.space(6)
          anchors.verticalCenter: back.verticalCenter
          text: strings.t("settings.title")
          font.pixelSize: Style.font.subtitle
          font.bold: true
        }
      }

      SettingRow { which: "wake" }
      SettingRow { which: "bed" }
    }

    Column {
      id: column
      width: parent.width
      visible: !root.showSettings
      spacing: Style.space(12)

      Column {
        width: parent.width
        spacing: Style.space(2)

        Item {
          width: parent.width
          implicitHeight: Math.max(title.implicitHeight, gear.implicitHeight)

          Label {
            id: title
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: strings.t("title")
            font.pixelSize: Style.font.subtitle
            font.bold: true
          }
          PanelActionButton {
            id: gear
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            visible: root.service !== null && root.service.stateLoaded
            iconText: Protocols.GLYPHS.settings
            foreground: Commons.Color.popups.text
            hoverColor: Commons.Color.accent
            opacity: 0.7
            tooltipText: strings.t("settings.title")
            onClicked: root.showSettings = true
          }
        }
        Label {
          width: parent.width
          visible: text !== ""
          opacity: 0.7
          font.pixelSize: Style.font.bodySmall
          text: root.emptyText !== "" ? root.emptyText
            : !root.sun || root.sun.kind !== "normal" ? ""
            : root.placeName !== ""
              ? strings.t("popup.sun").arg(root.placeName).arg(root.time(root.sun.riseMs)).arg(root.time(root.sun.setMs))
              : strings.t("popup.sunNoName").arg(root.time(root.sun.riseMs)).arg(root.time(root.sun.setMs))
        }
      }

      Repeater {
        model: root.items

        Item {
          id: row
          required property var modelData
          readonly property bool current: Protocols.isActive(modelData.status)
          readonly property bool finished: modelData.status === "done"
          readonly property bool missed: modelData.status === "missed"
          readonly property bool expanded: root.expanded[modelData.id] === true
          width: column.width
          implicitHeight: Math.max(details.implicitHeight, action.implicitHeight)

          Label {
            id: glyph
            anchors.left: parent.left
            text: Protocols.GLYPHS[row.modelData.glyph]
            font.pixelSize: Style.font.iconLarge
            color: row.current ? Commons.Color.urgent : Commons.Color.popups.text
            opacity: row.missed ? 0.5 : 1
          }

          Column {
            id: details
            anchors.left: glyph.right
            anchors.leftMargin: Style.space(10)
            anchors.right: action.left
            anchors.rightMargin: Style.space(10)
            spacing: Style.space(2)
            opacity: row.missed ? 0.6 : 1

            Item {
              width: parent.width
              implicitHeight: name.implicitHeight

              Label {
                id: name
                text: strings.t(row.modelData.id + ".name")
                font.bold: true
              }
              Label {
                anchors.left: name.right
                anchors.leftMargin: Style.space(6)
                anchors.verticalCenter: name.verticalCenter
                opacity: 0.6
                text: row.expanded ? Protocols.GLYPHS.less : Protocols.GLYPHS.more
              }
            }
            Label {
              width: parent.width
              text: root.statusText(row.modelData)
              color: row.current ? Commons.Color.urgent
                : row.finished ? Commons.Color.accent : Commons.Color.popups.text
            }
            Label {
              width: parent.width
              visible: row.expanded
              opacity: 0.7
              font.pixelSize: Style.font.bodySmall
              text: strings.t(row.modelData.ownStatus ? "reminder.window" : "window").arg(root.time(row.modelData.startMs)).arg(root.time(row.modelData.endMs))
            }
            Label {
              width: parent.width
              visible: row.expanded
              opacity: 0.7
              font.pixelSize: Style.font.bodySmall
              text: strings.t(row.modelData.id + ".how")
            }
          }

          // Click the row, anywhere but its check, for the detail.
          MouseArea {
            anchors.left: parent.left
            anchors.right: action.left
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            cursorShape: Qt.PointingHandCursor
            onClicked: root.toggleExpanded(row.modelData.id)
          }

          // The check: an empty circle to tick off, a filled one once done.
          // Clicking a filled one unticks it.
          PanelActionButton {
            id: action
            anchors.right: parent.right
            anchors.verticalCenter: details.top
            anchors.verticalCenterOffset: name.implicitHeight
            iconText: row.finished ? Protocols.GLYPHS.checked : Protocols.GLYPHS.unchecked
            fontSize: Style.font.display
            foreground: row.finished ? Commons.Color.accent : Commons.Color.popups.text
            hoverColor: Commons.Color.accent
            opacity: row.finished || row.current ? 1 : 0.6
            tooltipText: row.finished ? strings.t("check.unmark") : strings.t("check.mark")
            onClicked: {
              if (row.finished) {
                root.service.markUndone(row.modelData.id)
              } else {
                root.justDone = row.modelData.id
                root.service.markDone(row.modelData.id)
              }
            }

            // The tick lands: marking done rebuilds the row, so the new row
            // plays it once.
            NumberAnimation on scale {
              id: land
              running: false
              from: 0.9
              to: 1
              duration: Style.duration(180)
              easing.type: Easing.Bezier
              easing.bezierCurve: Style.easeOut
            }
            Component.onCompleted: {
              if (root.justDone !== row.modelData.id) return
              root.justDone = ""
              if (row.finished) land.start()
            }
          }
        }
      }

      Label {
        width: parent.width
        visible: root.items.some(function(item) { return item.needsSky })
        opacity: 0.7
        font.pixelSize: Style.font.bodySmall
        text: root.dose
          ? strings.t("sky." + root.dose.sky).arg(Commons.I18n.formatNumber(root.dose.minutes))
          : strings.t("sky.unknown")
      }

    }
  }
}
