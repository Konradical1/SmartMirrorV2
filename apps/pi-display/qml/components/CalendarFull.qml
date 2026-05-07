import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var days: []

    Text {
        x: 0
        y: 0
        text: "Calendar"
        color: "#adffffff"
        font.pixelSize: 15
    }

    Text {
        x: 0
        y: 28
        text: "Seven-day summary"
        color: "white"
        font.pixelSize: 42
        font.weight: Font.Thin
    }

    Rectangle {
        x: 0
        y: 86
        width: parent.width
        height: 1
        color: "#24ffffff"
    }

    RowLayout {
        x: 0
        y: 100
        width: parent.width
        height: parent.height - 100
        spacing: 0

        Repeater {
            model: days

            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true

                Rectangle {
                    anchors.left: parent.left
                    anchors.top: parent.top
                    anchors.bottom: parent.bottom
                    width: 1
                    color: index === 0 ? "transparent" : "#18ffffff"
                }

                Text {
                    x: 10
                    y: 8
                    width: parent.width - 20
                    text: modelData.day || ""
                    color: "#80ffffff"
                    font.pixelSize: 12
                    elide: Text.ElideRight
                }

                Text {
                    x: 10
                    y: 34
                    width: parent.width - 20
                    text: modelData.date || ""
                    color: "white"
                    font.pixelSize: 22
                    font.weight: Font.Light
                    elide: Text.ElideRight
                }

                Column {
                    x: 10
                    y: 78
                    width: parent.width - 20
                    spacing: 10

                    Repeater {
                        model: (modelData.events || []).slice(0, 4)

                        Rectangle {
                            width: parent.width
                            height: 50
                            radius: 7
                            color: "#08ffffff"
                            border.color: "#18ffffff"
                            border.width: 1

                            Rectangle {
                                x: 10
                                y: 12
                                width: 7
                                height: 7
                                radius: 4
                                color: modelData.color || "#00e5ff"
                            }

                            Text {
                                x: 24
                                y: 8
                                width: parent.width - 34
                                text: modelData.title || ""
                                color: "white"
                                font.pixelSize: 13
                                elide: Text.ElideRight
                            }

                            Text {
                                x: 24
                                y: 28
                                width: parent.width - 34
                                text: modelData.time || ""
                                color: "#adffffff"
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
