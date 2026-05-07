import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var days: []
    property bool focused: false
    property string fontFamily: "Inter"

    RowLayout {
        anchors.fill: parent
        spacing: 16
        visible: !root.focused

        Repeater {
            model: root.days

            Rectangle {
                Layout.fillWidth: true
                Layout.fillHeight: true
                radius: 20
                color: "#99101010"
                border.width: 1
                border.color: "#0DFFFFFF"

                Text {
                    x: 20
                    y: 20
                    width: parent.width - 40
                    text: modelData.day || ""
                    color: "#9CA0A8"
                    font.family: root.fontFamily
                    font.pixelSize: 15
                    font.weight: Font.Light
                    maximumLineCount: 1
                    elide: Text.ElideRight
                }

                Text {
                    x: 20
                    y: 48
                    width: parent.width - 40
                    text: modelData.date || ""
                    color: "#FFFFFF"
                    font.family: root.fontFamily
                    font.pixelSize: 25
                    font.weight: Font.Light
                    maximumLineCount: 1
                    elide: Text.ElideRight
                }

                Column {
                    x: 20
                    y: 100
                    width: parent.width - 40
                    spacing: 16

                    Repeater {
                        model: (modelData.events || []).slice(0, 4)

                        RowLayout {
                            width: parent.width
                            spacing: 9

                            Rectangle {
                                Layout.alignment: Qt.AlignTop
                                Layout.topMargin: 7
                                width: 7
                                height: 7
                                radius: 4
                                color: modelData.color || "#7CB7FF"
                            }

                            Column {
                                Layout.fillWidth: true
                                spacing: 3

                                Text {
                                    width: parent.width
                                    text: modelData.title || ""
                                    color: "#FFFFFF"
                                    font.family: root.fontFamily
                                    font.pixelSize: 15
                                    font.weight: Font.Light
                                    maximumLineCount: 2
                                    wrapMode: Text.WordWrap
                                    elide: Text.ElideRight
                                }

                                Text {
                                    width: parent.width
                                    text: modelData.time || ""
                                    color: "#7D828C"
                                    font.family: root.fontFamily
                                    font.pixelSize: 12
                                    font.weight: Font.Light
                                    maximumLineCount: 1
                                    elide: Text.ElideRight
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Column {
        anchors.fill: parent
        spacing: 18
        visible: root.focused

        Text {
            width: parent.width
            text: "Calendar"
            color: "#9CA0A8"
            font.family: root.fontFamily
            font.pixelSize: 22
            font.weight: Font.Light
        }

        Text {
            width: parent.width
            text: "Seven-day week view"
            color: "#FFFFFF"
            font.family: root.fontFamily
            font.pixelSize: 64
            font.weight: Font.Thin
        }

        Rectangle {
            width: parent.width
            height: 1
            color: "#0DFFFFFF"
        }

        Repeater {
            model: root.days

            Rectangle {
                width: parent.width
                height: 136
                radius: 20
                color: "#99101010"
                border.width: 1
                border.color: "#0DFFFFFF"

                Column {
                    x: 24
                    y: 22
                    width: 154
                    spacing: 8

                    Text {
                        width: parent.width
                        text: modelData.day || ""
                        color: "#9CA0A8"
                        font.family: root.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Light
                        maximumLineCount: 1
                        elide: Text.ElideRight
                    }

                    Text {
                        width: parent.width
                        text: modelData.date || ""
                        color: "#FFFFFF"
                        font.family: root.fontFamily
                        font.pixelSize: 27
                        font.weight: Font.Light
                        maximumLineCount: 1
                        elide: Text.ElideRight
                    }
                }

                Column {
                    x: 210
                    y: 24
                    width: parent.width - 242
                    spacing: 12

                    Repeater {
                        model: (modelData.events || []).slice(0, 3)

                        RowLayout {
                            width: parent.width
                            spacing: 12

                            Rectangle {
                                width: 8
                                height: 8
                                radius: 4
                                color: modelData.color || "#7CB7FF"
                            }

                            Text {
                                Layout.preferredWidth: 92
                                text: modelData.time || ""
                                color: "#7D828C"
                                font.family: root.fontFamily
                                font.pixelSize: 14
                                font.weight: Font.Light
                                maximumLineCount: 1
                                elide: Text.ElideRight
                            }

                            Text {
                                Layout.fillWidth: true
                                text: modelData.title || ""
                                color: "#FFFFFF"
                                font.family: root.fontFamily
                                font.pixelSize: 17
                                font.weight: Font.Light
                                maximumLineCount: 1
                                elide: Text.ElideRight
                            }
                        }
                    }

                    Text {
                        visible: !(modelData.events || []).length
                        text: "No events"
                        color: "#5E636E"
                        font.family: root.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Light
                    }
                }
            }
        }
    }
}
