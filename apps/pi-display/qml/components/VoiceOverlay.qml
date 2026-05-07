import QtQuick

Item {
    id: root

    property string mode: "idle"
    property string text: ""
    property bool active: mode !== "idle" && mode !== "done"
    height: active ? 132 : 0
    opacity: active ? 1 : 0

    Behavior on opacity { NumberAnimation { duration: 260 } }
    Behavior on height { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }

    Timer {
        id: pulse
        interval: 140
        repeat: true
        running: root.active
        onTriggered: rail.phase = (rail.phase + 1) % 1000
    }

    Rectangle {
        id: capsule
        anchors.horizontalCenter: parent.horizontalCenter
        y: 0
        width: mode === "thinking" ? 128 : mode === "listening" || mode === "wake_detected" ? 172 : mode === "offline" || mode === "error" ? 180 : 150
        height: 42
        radius: 21
        color: "#52000000"
        border.width: 1
        border.color: mode === "offline" || mode === "error" ? "#70ff7676" : mode === "speaking" ? "#6082ffd6" : "#6600e5ff"

        Behavior on width { NumberAnimation { duration: 360; easing.type: Easing.OutCubic } }

        Row {
            id: rail
            property int phase: 0
            anchors.centerIn: parent
            spacing: 5

            Repeater {
                model: mode === "thinking" ? 5 : 9

                Rectangle {
                    width: 3
                    height: {
                        var offset = (index * 17 + rail.phase) / 12
                        var wave = Math.abs(Math.sin(offset))
                        if (mode === "offline" || mode === "error") return 6
                        if (mode === "thinking") return 8 + wave * 20
                        if (mode === "speaking") return 8 + wave * 24
                        return 8 + wave * 16
                    }
                    radius: 2
                    color: mode === "offline" || mode === "error" ? "#ff7676" : mode === "speaking" ? "#82ffd6" : "#00e5ff"
                    opacity: mode === "offline" || mode === "error" ? 0.85 : 0.45 + Math.abs(Math.sin((index * 13 + rail.phase) / 15)) * 0.5
                    Behavior on height { NumberAnimation { duration: 130 } }
                }
            }
        }
    }

    Text {
        anchors.top: capsule.bottom
        anchors.topMargin: 18
        anchors.horizontalCenter: parent.horizontalCenter
        width: parent.width
        text: root.text
        color: "white"
        font.pixelSize: 24
        font.weight: Font.Light
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        maximumLineCount: 2
        elide: Text.ElideRight
        opacity: text.length ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 220 } }
    }
}
