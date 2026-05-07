import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var todos: []
    property bool focused: false
    property string fontFamily: "Inter"
    property var openTodos: todos.filter(function(todo) { return !todo.done })
    property int completed: todos.length - openTodos.length

    Rectangle {
        anchors.fill: parent
        radius: 22
        color: "#B30A0A0A"
        border.width: 1
        border.color: "#0DFFFFFF"
    }

    Text {
        x: 24
        y: 24
        text: "To-Do"
        color: "#FFFFFF"
        font.family: root.fontFamily
        font.pixelSize: 28
        font.weight: Font.Light
    }

    Text {
        anchors.right: parent.right
        anchors.rightMargin: 24
        y: 31
        text: "+ Add Task"
        color: "#9CA0A8"
        font.family: root.fontFamily
        font.pixelSize: 14
        font.weight: Font.Light
    }

    Column {
        x: 24
        y: 84
        width: parent.width - 48
        spacing: 18

        Repeater {
            model: root.openTodos.slice(0, 6)

            RowLayout {
                width: parent.width
                spacing: 12

                Rectangle {
                    Layout.alignment: Qt.AlignTop
                    Layout.topMargin: 3
                    width: 16
                    height: 16
                    radius: 4
                    color: "transparent"
                    border.width: 1
                    border.color: "#5E636E"
                }

                Column {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        width: parent.width
                        text: modelData.title || ""
                        color: "#FFFFFF"
                        font.family: root.fontFamily
                        font.pixelSize: 16
                        font.weight: Font.Light
                        maximumLineCount: 2
                        wrapMode: Text.WordWrap
                        elide: Text.ElideRight
                    }

                    RowLayout {
                        width: parent.width
                        spacing: 9

                        Rectangle {
                            visible: Boolean(modelData.tag)
                            width: tagText.contentWidth + 14
                            height: 20
                            radius: 10
                            color: "#0DFFFFFF"

                            Text {
                                id: tagText
                                anchors.centerIn: parent
                                text: modelData.tag || ""
                                color: modelData.tag === "School" ? "#8BE39B" : "#AAB7FF"
                                font.family: root.fontFamily
                                font.pixelSize: 11
                                font.weight: Font.Light
                            }
                        }

                        Text {
                            Layout.fillWidth: true
                            text: modelData.date || ""
                            color: "#7D828C"
                            font.family: root.fontFamily
                            font.pixelSize: 12
                            font.weight: Font.Light
                            elide: Text.ElideRight
                        }
                    }
                }
            }
        }

        Text {
            visible: root.openTodos.length === 0
            text: "All tasks completed"
            color: "#9CA0A8"
            font.family: root.fontFamily
            font.pixelSize: 16
            font.weight: Font.Light
        }
    }

    Text {
        x: 24
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 36
        text: root.completed + " of " + root.todos.length + " tasks completed"
        color: "#9CA0A8"
        font.family: root.fontFamily
        font.pixelSize: 13
        font.weight: Font.Light
    }

    Rectangle {
        x: 24
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 24
        width: parent.width - 48
        height: 2
        radius: 1
        color: "#18FFFFFF"

        Rectangle {
            width: root.todos.length ? parent.width * root.completed / root.todos.length : 0
            height: parent.height
            radius: 1
            color: "#FFFFFF"
            opacity: 0.72
            Behavior on width { NumberAnimation { duration: 420; easing.type: Easing.OutCubic } }
        }
    }
}
