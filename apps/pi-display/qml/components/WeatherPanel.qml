import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var weather
    property bool focused: false
    property string fontFamily: "Inter"
    property var forecast: weather && weather.forecast ? weather.forecast : []
    property int unit: focused ? 2 : 1
    property color white: "#F5F7FA"
    property color gray: "#9AA0A8"
    property color dim: "#666C74"

    function valueOrDash(value) {
        return value === undefined || value === null || value === "" ? "--" : value
    }

    function degrees(value) {
        return valueOrDash(value) + "\u00B0"
    }

    function shortLocation(value) {
        var text = String(value || "Anderson Township, OH").trim()
        text = text.replace(", Ohio", ", OH")
        if (text === "Anderson Township, OH") return text
        return text || "Anderson Township, OH"
    }

    function iconFor(condition) {
        var text = String(condition || "").toLowerCase()
        if (text.indexOf("clear") >= 0 || text.indexOf("sun") >= 0) return "sun"
        return "partly"
    }

    component LineIcon: Canvas {
        id: icon

        property string kind: "partly"
        property string lineColor: "#F5F7FA"
        property real stroke: Math.max(1.4, width / 22)

        onKindChanged: requestPaint()
        onLineColorChanged: requestPaint()
        onStrokeChanged: requestPaint()
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()

        function setup(ctx) {
            ctx.clearRect(0, 0, width, height)
            ctx.strokeStyle = lineColor
            ctx.lineWidth = stroke
            ctx.lineCap = "round"
            ctx.lineJoin = "round"
            ctx.fillStyle = "transparent"
        }

        function drawSun(ctx, cx, cy, r) {
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2, false)
            ctx.stroke()

            for (var i = 0; i < 8; i++) {
                var angle = i * Math.PI / 4
                var inner = r + width * 0.10
                var outer = r + width * 0.20
                ctx.beginPath()
                ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
                ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
                ctx.stroke()
            }
        }

        function drawCloud(ctx, ox, oy, scale) {
            ctx.beginPath()
            ctx.moveTo(ox + 0.16 * scale, oy + 0.66 * scale)
            ctx.bezierCurveTo(ox + 0.15 * scale, oy + 0.52 * scale, ox + 0.26 * scale, oy + 0.43 * scale, ox + 0.39 * scale, oy + 0.46 * scale)
            ctx.bezierCurveTo(ox + 0.44 * scale, oy + 0.33 * scale, ox + 0.58 * scale, oy + 0.27 * scale, ox + 0.71 * scale, oy + 0.35 * scale)
            ctx.bezierCurveTo(ox + 0.83 * scale, oy + 0.36 * scale, ox + 0.91 * scale, oy + 0.47 * scale, ox + 0.90 * scale, oy + 0.59 * scale)
            ctx.bezierCurveTo(ox + 0.90 * scale, oy + 0.70 * scale, ox + 0.81 * scale, oy + 0.78 * scale, ox + 0.69 * scale, oy + 0.78 * scale)
            ctx.lineTo(ox + 0.27 * scale, oy + 0.78 * scale)
            ctx.bezierCurveTo(ox + 0.20 * scale, oy + 0.78 * scale, ox + 0.16 * scale, oy + 0.73 * scale, ox + 0.16 * scale, oy + 0.66 * scale)
            ctx.stroke()
        }

        onPaint: {
            var ctx = getContext("2d")
            setup(ctx)

            if (kind === "pin") {
                ctx.beginPath()
                ctx.arc(width * 0.50, height * 0.40, width * 0.22, 0, Math.PI * 2, false)
                ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(width * 0.50, height * 0.90)
                ctx.bezierCurveTo(width * 0.20, height * 0.55, width * 0.18, height * 0.25, width * 0.50, height * 0.10)
                ctx.bezierCurveTo(width * 0.82, height * 0.25, width * 0.80, height * 0.55, width * 0.50, height * 0.90)
                ctx.stroke()
                return
            }

            if (kind === "wind") {
                ctx.beginPath()
                ctx.moveTo(width * 0.10, height * 0.34)
                ctx.lineTo(width * 0.72, height * 0.34)
                ctx.bezierCurveTo(width * 0.92, height * 0.34, width * 0.92, height * 0.15, width * 0.74, height * 0.15)
                ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(width * 0.18, height * 0.56)
                ctx.lineTo(width * 0.84, height * 0.56)
                ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(width * 0.10, height * 0.76)
                ctx.lineTo(width * 0.56, height * 0.76)
                ctx.bezierCurveTo(width * 0.76, height * 0.76, width * 0.76, height * 0.94, width * 0.58, height * 0.94)
                ctx.stroke()
                return
            }

            if (kind === "drop") {
                ctx.beginPath()
                ctx.moveTo(width * 0.50, height * 0.08)
                ctx.bezierCurveTo(width * 0.25, height * 0.38, width * 0.18, height * 0.56, width * 0.18, height * 0.70)
                ctx.bezierCurveTo(width * 0.18, height * 0.88, width * 0.32, height * 0.98, width * 0.50, height * 0.98)
                ctx.bezierCurveTo(width * 0.68, height * 0.98, width * 0.82, height * 0.88, width * 0.82, height * 0.70)
                ctx.bezierCurveTo(width * 0.82, height * 0.56, width * 0.75, height * 0.38, width * 0.50, height * 0.08)
                ctx.stroke()
                return
            }

            if (kind === "sun") {
                drawSun(ctx, width * 0.50, height * 0.50, width * 0.18)
                return
            }

            drawSun(ctx, width * 0.38, height * 0.34, width * 0.14)
            drawCloud(ctx, width * 0.02, height * 0.10, width * 0.96)
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: root.focused ? 30 : 8
        anchors.bottomMargin: root.focused ? 34 : 10
        spacing: root.focused ? 38 : 22

        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: 8

            LineIcon {
                width: root.focused ? 22 : 15
                height: width
                kind: "pin"
                lineColor: root.gray
                stroke: root.focused ? 1.8 : 1.3
                anchors.verticalCenter: parent.verticalCenter
            }

            Text {
                text: root.shortLocation(weather ? weather.location : "")
                color: root.gray
                font.family: root.fontFamily
                font.pixelSize: root.focused ? 22 : 15
                font.weight: Font.Light
                elide: Text.ElideRight
            }
        }

        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: root.focused ? 44 : 24

            LineIcon {
                width: root.focused ? 168 : 84
                height: width
                kind: "partly"
                lineColor: root.white
                stroke: root.focused ? 3.2 : 2.0
                anchors.verticalCenter: parent.verticalCenter
            }

            Column {
                anchors.verticalCenter: parent.verticalCenter
                spacing: root.focused ? 8 : 3

                Text {
                    text: root.degrees(weather ? weather.temperature : null)
                    color: root.white
                    font.family: root.fontFamily
                    font.pixelSize: root.focused ? 142 : 76
                    font.weight: Font.Thin
                    lineHeight: 0.86
                }

                Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: "Feels like " + root.degrees(weather ? weather.feelsLike : null)
                    color: root.gray
                    font.family: root.fontFamily
                    font.pixelSize: root.focused ? 24 : 15
                    font.weight: Font.Light
                }
            }
        }

        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: root.focused ? 42 : 24

            Row {
                spacing: 8
                anchors.verticalCenter: parent.verticalCenter

                LineIcon {
                    width: root.focused ? 25 : 17
                    height: width
                    kind: "wind"
                    lineColor: root.dim
                    stroke: root.focused ? 1.9 : 1.35
                    anchors.verticalCenter: parent.verticalCenter
                }

                Text {
                    text: root.valueOrDash(weather ? weather.wind : null)
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: root.focused ? 22 : 14
                    font.weight: Font.Light
                }
            }

            Row {
                spacing: 8
                anchors.verticalCenter: parent.verticalCenter

                LineIcon {
                    width: root.focused ? 23 : 16
                    height: width
                    kind: "drop"
                    lineColor: root.dim
                    stroke: root.focused ? 1.9 : 1.35
                    anchors.verticalCenter: parent.verticalCenter
                }

                Text {
                    text: root.valueOrDash(weather ? weather.humidity : null)
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: root.focused ? 22 : 14
                    font.weight: Font.Light
                }
            }
        }

        Column {
            Layout.alignment: Qt.AlignHCenter
            width: Math.min(parent.width, root.focused ? 520 : 300)
            spacing: root.focused ? 24 : 15

            Repeater {
                model: root.forecast.slice(0, 3)

                Item {
                    width: parent.width
                    height: root.focused ? 40 : 25

                    Text {
                        anchors.left: parent.left
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width * 0.36
                        text: modelData.day || ""
                        color: root.white
                        font.family: root.fontFamily
                        font.pixelSize: root.focused ? 23 : 15
                        font.weight: Font.Light
                        elide: Text.ElideRight
                    }

                    LineIcon {
                        anchors.centerIn: parent
                        width: root.focused ? 36 : 22
                        height: width
                        kind: root.iconFor(modelData.condition)
                        lineColor: root.gray
                        stroke: root.focused ? 1.9 : 1.25
                    }

                    Row {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: root.focused ? 12 : 8

                        Text {
                            text: root.degrees(modelData.high)
                            color: root.white
                            font.family: root.fontFamily
                            font.pixelSize: root.focused ? 23 : 15
                            font.weight: Font.Light
                        }

                        Text {
                            text: root.degrees(modelData.low)
                            color: root.dim
                            font.family: root.fontFamily
                            font.pixelSize: root.focused ? 23 : 15
                            font.weight: Font.Light
                        }
                    }
                }
            }
        }

        Item {
            width: 1
            height: 1
            Layout.fillHeight: true
        }
    }
}
