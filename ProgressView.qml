import QtQuick
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "History.js" as History
import "Protocols.js" as Protocols

Column {
  id: root
  required property var service
  readonly property var history: service ? service.history : ({})
  readonly property string today: service ? service.day : History.dayKey(new Date())
  readonly property var summary: History.summary(history, today)
  property string month: today.slice(0, 7) + "-01"
  property string selectedDay: today
  readonly property var selectedRecord: history[selectedDay] || null
  readonly property var locale: Qt.locale(Commons.I18n.formatLocale)
  readonly property int weekStart: locale.firstDayOfWeek % 7
  spacing: Style.space(10)

  Translations { id: strings; directory: Qt.resolvedUrl("i18n") }

  function displayDate(key) { return History.date(key).toLocaleDateString(root.locale, Locale.ShortFormat) }
  function moveMonth(amount) {
    var d = History.date(month)
    d.setMonth(d.getMonth() + amount)
    month = History.dayKey(d)
  }
  function detailStatus(id) {
    var at = selectedRecord.done[id]
    if (at) return strings.t("status.done").arg(service.formatTime(at))
    if (selectedDay === today) {
      var item = service.items.filter(function(item) { return item.id === id })[0]
      if (item && item.status !== "missed") return strings.t("progress.notYet")
    }
    return strings.t("progress.notDone")
  }

  component Label: Text {
    textFormat: Text.PlainText
    color: Commons.Color.popups.text
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    wrapMode: Text.WordWrap
  }

  Label {
    width: parent.width
    text: strings.t("progress.started").arg(root.displayDate(root.summary.started))
    opacity: 0.7
  }

  Row {
    width: parent.width
    spacing: Style.space(6)
    Repeater {
      model: [
        { value: root.summary.consistency === null ? "—" : strings.t("progress.percent").arg(Commons.I18n.formatNumber(root.summary.consistency)), label: strings.t("progress.consistency") },
        { value: Commons.I18n.formatNumber(root.summary.streak), label: strings.t("progress.streak") },
        { value: Commons.I18n.formatNumber(root.summary.completed), label: strings.t("progress.completed") }
      ]
      Rectangle {
        required property var modelData
        width: (root.width - Style.space(12)) / 3
        height: stats.implicitHeight + Style.space(16)
        radius: Style.cornerRadius
        color: Qt.alpha(Commons.Color.accent, 0.08)
        Column {
          id: stats
          anchors.centerIn: parent
          width: parent.width - Style.space(12)
          spacing: Style.space(4)
          Label {
            width: parent.width
            text: modelData.value
            color: Commons.Color.accent
            font.pixelSize: Style.font.subtitle
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
          }
          Label {
            width: parent.width
            text: modelData.label
            horizontalAlignment: Text.AlignHCenter
          }
        }
      }
    }
  }

  Label {
    width: parent.width
    text: root.summary.recorded ? strings.t("progress.basis") : strings.t("progress.firstDay")
    opacity: 0.6
  }

  Row {
    width: parent.width
    spacing: Style.space(6)
    Button {
      id: previous
      text: Commons.I18n.rightToLeft ? "›" : "‹"
      tooltipText: strings.t("progress.previous")
      focusable: true
      enabled: root.month.slice(0, 7) > root.summary.started.slice(0, 7)
      opacity: enabled ? 1 : 0.4
      onClicked: root.moveMonth(-1)
    }
    Label {
      width: parent.width - previous.width - next.width - Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      text: History.date(root.month).toLocaleDateString(root.locale, "MMMM yyyy")
      horizontalAlignment: Text.AlignHCenter
      font.pixelSize: Style.font.body
      font.bold: true
    }
    Button {
      id: next
      text: Commons.I18n.rightToLeft ? "‹" : "›"
      tooltipText: strings.t("progress.next")
      focusable: true
      enabled: root.month.slice(0, 7) < root.today.slice(0, 7)
      opacity: enabled ? 1 : 0.4
      onClicked: root.moveMonth(1)
    }
  }

  Grid {
    width: parent.width
    columns: 7
    spacing: Style.space(4)
    Repeater {
      model: 7
      Label {
        required property int index
        width: (root.width - Style.space(24)) / 7
        horizontalAlignment: Text.AlignHCenter
        text: root.locale.standaloneDayName((root.weekStart + index) % 7, Locale.NarrowFormat)
        opacity: 0.6
      }
    }
    Repeater {
      model: History.monthDays(root.month, root.history, root.today, root.weekStart)
      Button {
        required property var modelData
        width: (root.width - Style.space(24)) / 7
        height: Style.space(32)
        horizontalPadding: 0
        verticalPadding: 0
        focusable: true
        text: Commons.I18n.formatNumber(modelData.number)
        enabled: modelData.inMonth && !modelData.future
        opacity: !modelData.inMonth ? 0 : modelData.future ? 0.25 : 1
        selected: modelData.day === root.selectedDay
        bordered: modelData.day === root.today
        background: modelData.tracked
          ? Qt.alpha(Commons.Color.accent, modelData.total ? 0.08 + 0.55 * modelData.done / modelData.total : 0.08)
          : "transparent"
        tooltipText: root.displayDate(modelData.day) + " · " + (modelData.tracked
          ? strings.t("progress.count").arg(Commons.I18n.formatNumber(modelData.done)).arg(Commons.I18n.formatNumber(modelData.total))
          : strings.t("progress.noRecord"))
        onClicked: root.selectedDay = modelData.day
        // A completion underline preserves the heatmap reading on selection.
        Rectangle {
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.space(3)
          anchors.horizontalCenter: parent.horizontalCenter
          width: parent.width - Style.space(12)
          height: Style.space(2)
          radius: height / 2
          visible: modelData.tracked
          color: Qt.alpha(Commons.Color.popups.text, 0.2)
          Rectangle {
            width: parent.width * (modelData.total ? modelData.done / modelData.total : 0)
            height: parent.height
            radius: parent.radius
            color: Commons.Color.accent
          }
        }
      }
    }
  }

  Label {
    width: parent.width
    text: strings.t("progress.legend")
    opacity: 0.6
  }

  Rectangle { width: parent.width; height: 1; color: Qt.alpha(Commons.Color.popups.text, 0.12) }

  Label {
    width: parent.width
    text: root.displayDate(root.selectedDay)
    font.pixelSize: Style.font.body
    font.bold: true
  }
  Label {
    width: parent.width
    visible: !root.selectedRecord
    text: strings.t("progress.noRecordDetail")
    opacity: 0.6
  }
  Repeater {
    model: root.selectedRecord ? Protocols.PROTOCOLS.filter(function(p) { return root.selectedRecord.available.indexOf(p.id) !== -1 }).map(function(p) { return p.id }) : []
    Row {
      required property string modelData
      width: root.width
      spacing: Style.space(8)
      Label {
        text: root.selectedRecord.done[modelData] ? Protocols.GLYPHS.checked : Protocols.GLYPHS.unchecked
        font.pixelSize: Style.font.icon
        color: root.selectedRecord.done[modelData] ? Commons.Color.accent : Commons.Color.popups.text
      }
      Column {
        width: parent.width - Style.space(32)
        Label { width: parent.width; text: strings.t(modelData + ".name"); font.bold: true }
        Label { width: parent.width; text: root.detailStatus(modelData); opacity: 0.7 }
      }
    }
  }
}
