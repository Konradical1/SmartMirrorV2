import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var weather
    property bool focused: false
    property int tempSize: focused ? 116 : 76
    property var forecast: weather && weather.forecast ? weather.forecast : []

    Text {
        id: location
        anchors.right: parent.right
        y: 0
        width: parent.width
        horizontalAlignment: Text.AlignRight
        text: weather ? (weather.location || "") : ""
        color: "#adffffff"
        font.pixelSize: 14
        elide: Text.ElideRight
    }

    Text {
        id: condition
        anchors.right: temp.left
        anchors.rightMargin: focused ? 28 : 20
        y: focused ? 82 : 72
        text: weather ? (weather.condition || "") : ""
        color: "#f5ffffff"
        font.pixelSize: focused ? 22 : 16
        font.weight: Font.Light
    }

    Text {
        id: temp
        anchors.right: degree.left
        y: focused ? 46 : 42
        text: weather && weather.temperature !== undefined ? weather.temperature : "--"
        color: "white"
        font.pixelSize: root.tempSize
        font.weight: Font.Thin
    }

    Text {
        id: degree
        anchors.right: parent.right
        y: focused ? 52 : 48
        text: "deg"
        color: "white"
        font.pixelSize: focused ? 28 : 20
        font.weight: Font.Light
    }

    Text {
        id: highLow
        anchors.right: parent.right
        y: focused ? 178 : 150
        text: forecast.length ? ("High " + forecast[0].high + "  Low " + forecast[0].low) : ""
        color: "#adffffff"
        font.pixelSize: focused ? 20 : 16
        font.weight: Font.Light
    }

    Rectangle {
        anchors.right: parent.right
        y: focused ? 226 : 194
        width: parent.width
        height: 1
        color: "#26ffffff"
    }

    Column {
        anchors.right: parent.right
        y: focused ? 260 : 226
        width: parent.width
        spacing: focused ? 18 : 14

        Repeater {
            model: forecast.slice(0, 3)

            RowLayout {
                width: parent.width
                spacing: 12

                Text {
                    Layout.fillWidth: true
                    text: modelData.day || ""
                    color: "#f5ffffff"
                    font.pixelSize: focused ? 18 : 16
                    elide: Text.ElideRight
                }

                Text {
                    text: modelData.condition || ""
                    color: "#99ffffff"
                    font.pixelSize: focused ? 15 : 13
                }

                Text {
                    text: (modelData.high !== undefined ? modelData.high : "--") + " / " + (modelData.low !== undefined ? modelData.low : "--")
                    color: "#f5ffffff"
                    font.pixelSize: focused ? 18 : 16
                }
            }
        }
    }
}
