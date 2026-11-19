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
  function close() { popupOpen = false }
  onPopupOpenChanged: if (popupOpen && service) service.refreshSky()

  Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function time(ms) {
    return service ? service.formatTime(ms) : ""
  }

  function statusText(item) {
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
      : strings.t("tooltip.finished")

  readonly property string emptyText: !service || !service.stateLoaded ? strings.t("popup.starting")
    : !service.location ? strings.t("popup.noLocation")
    : items.length === 0 ? strings.t("popup.noSun")
    : ""

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.activeItem ? Protocols.GLYPHS[root.activeItem.anchor] : Protocols.GLYPHS.idle
    active: root.activeItem !== null
    dimmed: root.activeItem === null && root.nextItem === null
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

  PopupCard {
    id: popup
    anchorItem: root
    bar: root.bar
    owner: root
    open: root.popupOpen
    contentWidth: popup.fittedContentWidth(Style.space(340))
    contentHeight: popup.fittedContentHeight(column.implicitHeight)

    Column {
      id: column
      width: parent.width
      spacing: Style.space(12)

      Column {
        width: parent.width
        spacing: Style.space(2)

        Label {
          width: parent.width
          text: strings.t("title")
          font.pixelSize: Style.font.subtitle
          font.bold: true
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
          readonly property bool over: modelData.status === "done" || modelData.status === "missed"
          width: column.width
          implicitHeight: Math.max(details.implicitHeight, action.implicitHeight)

          Label {
            id: glyph
            anchors.left: parent.left
            text: Protocols.GLYPHS[row.modelData.anchor]
            font.pixelSize: Style.font.iconLarge
            color: row.current ? Commons.Color.urgent : Commons.Color.popups.text
            opacity: row.over ? 0.5 : 1
          }

          Column {
            id: details
            anchors.left: glyph.right
            anchors.leftMargin: Style.space(10)
            anchors.right: action.left
            anchors.rightMargin: Style.space(10)
            spacing: Style.space(2)
            opacity: row.over ? 0.6 : 1

            Label {
              width: parent.width
              text: strings.t(row.modelData.id + ".name")
              font.bold: true
            }
            Label {
              width: parent.width
              text: root.statusText(row.modelData)
              color: row.current ? Commons.Color.urgent : Commons.Color.popups.text
            }
            Label {
              width: parent.width
              opacity: 0.7
              font.pixelSize: Style.font.bodySmall
              text: strings.t("window").arg(root.time(row.modelData.startMs)).arg(root.time(row.modelData.endMs))
            }
            Label {
              width: parent.width
              visible: !row.over
              opacity: 0.7
              font.pixelSize: Style.font.bodySmall
              text: strings.t(row.modelData.id + ".how")
            }
          }

          Button {
            id: action
            anchors.right: parent.right
            bordered: true
            text: row.modelData.status === "done" ? strings.t("action.undo") : strings.t("action.done")
            onClicked: {
              if (row.modelData.status === "done") root.service.markUndone(row.modelData.id)
              else root.service.markDone(row.modelData.id)
            }
          }
        }
      }

      Label {
        width: parent.width
        visible: root.items.length > 0
        opacity: 0.7
        font.pixelSize: Style.font.bodySmall
        text: root.dose
          ? strings.t("sky." + root.dose.sky).arg(Commons.I18n.formatNumber(root.dose.minutes))
          : strings.t("sky.unknown")
      }
    }
  }
}
