import QtQuick

Item {
    id: root

    property string mode: "idle"
    property string text: ""
    property real audioLevel: 0
    property string fontFamily: "Inter"
    property real phase: 0
    property bool active: mode !== "idle" && mode !== "done"
    property bool alert: mode === "offline" || mode === "error"
    property real baseSize: active ? 70 : 48
    property real pulse: 0.5 + Math.sin(phase) * 0.5
    property color teal: "#20F5E0"
    property color tealSoft: "#63FFF1"
    property color alertColor: "#FF7676"
    property real ringSize: root.baseSize + 86
    property real glowSize: root.active ? 230 : 188
    property real glowRadius: (root.active ? 86 : 68) + root.pulse * 8

    Timer {
        interval: 33
        repeat: true
        running: true
        onTriggered: {
            root.phase += root.active ? 0.055 : 0.028
            glow.requestPaint()
        }
    }

    Canvas {
        id: glow
        anchors.centerIn: outerRing
        width: root.glowSize
        height: root.glowSize
        opacity: root.alert ? 0.32 : root.active ? 0.62 : 0.34

        onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)

            var cx = width / 2
            var cy = height / 2
            var radius = root.glowRadius
            var gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius)
            var color = root.alert ? "255, 118, 118" : "32, 245, 224"

            gradient.addColorStop(0.00, "rgba(" + color + ", 0.82)")
            gradient.addColorStop(0.20, "rgba(" + color + ", 0.38)")
            gradient.addColorStop(0.52, "rgba(" + color + ", 0.12)")
            gradient.addColorStop(1.00, "rgba(" + color + ", 0.00)")

            ctx.fillStyle = gradient
            ctx.fillRect(0, 0, width, height)
        }

        Behavior on width { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }
        Behavior on height { NumberAnimation { duration: 320; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 420 } }
    }

    Rectangle {
        id: outerRing
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 18
        width: root.ringSize
        height: width
        radius: width / 2
        color: "transparent"
        border.width: 1
        border.color: root.alert ? "#55FF7676" : "#5520F5E0"
        opacity: root.active ? 0.55 + root.pulse * 0.18 : 0.22 + root.pulse * 0.08
        scale: 1 + root.pulse * 0.035

        Behavior on width { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 260 } }
    }

    Rectangle {
        id: middleRing
        anchors.centerIn: outerRing
        width: root.baseSize + 42
        height: width
        radius: width / 2
        color: root.alert ? "#11FF7676" : "#1420F5E0"
        border.width: 1
        border.color: root.alert ? "#77FF7676" : "#7720F5E0"
        opacity: root.active ? 0.80 : 0.42
        scale: 1 + Math.sin(root.phase + 1.6) * 0.025

        Behavior on width { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
    }

    Rectangle {
        id: orbShell
        anchors.centerIn: outerRing
        width: root.baseSize
        height: width
        radius: width / 2
        color: root.alert ? root.alertColor : root.teal
        opacity: root.active ? 0.84 : 0.48
        scale: 1 + Math.sin(root.phase + 0.8) * 0.018

        Behavior on width { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 260 } }

        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 0.58
            height: width
            radius: width / 2
            color: root.alert ? "#FFFFB3B3" : root.tealSoft
            opacity: root.active ? 0.24 : 0.14
        }
    }

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: outerRing.top
        anchors.bottomMargin: 12
        width: parent.width
        text: root.text
        color: "#FFFFFF"
        font.family: root.fontFamily
        font.pixelSize: 21
        font.weight: Font.Light
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        maximumLineCount: 2
        elide: Text.ElideRight
        opacity: root.text.length && root.active ? 0.92 : 0
        Behavior on opacity { NumberAnimation { duration: 240 } }
    }
}
