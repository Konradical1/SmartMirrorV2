import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var days: []

    RowLayout {
        anchors.fill: parent
        spacing: 14

        Repeater {
            model: days

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 8
                color: "#05ffffff"
                border.color: "#1cffffff"
                border.width: 1

                Text {
                    x: 18
                    y: 18
                    width: parent.width - 36
                    text: modelData.day || ""
                    color: "#adffffff"
                    font.pixelSize: 12
                    elide: Text.ElideRight
                }

                Text {
                    x: 18
                    y: 44
                    width: parent.width - 36
                    text: modelData.date || ""
                    color: "white"
                    font.pixelSize: 18
                    font.weight: Font.Light
                    elide: Text.ElideRight
                }

                Column {
                    x: 18
                    y: 86
                    width: parent.width - 36
                    spacing: 10

                    Repeater {
                        model: (modelData.events || []).slice(0, 3)
                        RowLayout {
                            width: parent.width
                            spacing: 8

                            Rectangle {
                                width: 8
                                height: 8
                                radius: 4
                                color: modelData.color || "#00e5ff"
                            }

                            Text {
                                text: modelData.time || ""
                                color: "#99ffffff"
                                font.pixelSize: 11
                            }

                            Text {
                                Layout.fillWidth: true
                                text: modelData.title || ""
                                color: "#f0ffffff"
                                font.pixelSize: 11
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }
    }
}
