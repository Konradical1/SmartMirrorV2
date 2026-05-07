import QtQuick

Item {
    id: root

    property date now: new Date()

    function greeting() {
        var hour = now.getHours()
        if (hour < 12) return "Good morning"
        if (hour < 18) return "Good afternoon"
        return "Good evening"
    }

    function clockText() {
        return now.toLocaleTimeString(Qt.locale(), "h:mm")
    }

    function periodText() {
        return now.getHours() >= 12 ? "PM" : "AM"
    }

    Timer {
        interval: 30000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.now = new Date()
    }

    Text {
        x: 0
        y: 0
        text: root.greeting()
        color: "#adffffff"
        font.pixelSize: 18
        font.weight: Font.Light
    }

    Text {
        x: 0
        y: 30
        text: root.clockText()
        color: "white"
        font.pixelSize: 92
        font.weight: Font.Thin
    }

    Text {
        x: 246
        y: 92
        text: root.periodText()
        color: "#66ffffff"
        font.pixelSize: 26
        font.weight: Font.Light
    }

    Text {
        x: 0
        y: 126
        width: parent.width
        text: root.now.toLocaleDateString(Qt.locale(), "dddd, MMMM d, yyyy")
        color: "#f0ffffff"
        font.pixelSize: 17
        font.weight: Font.Light
        elide: Text.ElideRight
    }
}
