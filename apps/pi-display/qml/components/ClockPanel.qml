import QtQuick

Item {
    id: root

    property date now: new Date()
    property string fontFamily: "Inter"

    function greeting() {
        var hour = now.getHours()
        if (hour < 12) return "Good morning"
        if (hour < 18) return "Good afternoon"
        return "Good evening"
    }

    function clockText() {
        var hour = now.getHours() % 12
        if (hour === 0) hour = 12
        var minutes = now.getMinutes()
        return hour + ":" + (minutes < 10 ? "0" : "") + minutes
    }

    function periodText() {
        return now.getHours() >= 12 ? "PM" : "AM"
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.now = new Date()
    }

    Text {
        x: 0
        y: 0
        text: root.greeting()
        color: "#9CA0A8"
        font.family: root.fontFamily
        font.pixelSize: 25
        font.weight: Font.Light
    }

    Text {
        id: time
        x: 0
        y: 38
        text: root.clockText()
        color: "#FFFFFF"
        font.family: root.fontFamily
        font.pixelSize: 132
        font.weight: Font.Thin
    }

    Text {
        x: time.contentWidth + 16
        y: 128
        text: root.periodText()
        color: "#7D828C"
        font.family: root.fontFamily
        font.pixelSize: 31
        font.weight: Font.Light
    }

    Text {
        x: 0
        y: 188
        width: parent.width
        text: root.now.toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
        color: "#D9DBDF"
        font.family: root.fontFamily
        font.pixelSize: 24
        font.weight: Font.Light
        elide: Text.ElideRight
    }
}
