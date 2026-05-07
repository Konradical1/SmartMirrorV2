import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var todos: []
    property bool focused: false
    property var visibleTodos: todos.filter(function(todo) { return !todo.done })
    property int completed: todos.length - visibleTodos.length

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: "#07ffffff"
        border.color: "#1cffffff"
        border.width: 1
    }

    Text {
        x: 24
        y: 22
        text: "To-Do"
        color: "white"
        font.pixelSize: focused ? 31 : 19
        font.weight: focused ? Font.Thin : Font.Light
    }

    Column {
        x: 24
        y: focused ? 82 : 68
        width: parent.width - 48
        spacing: focused ? 16 : 12

        Repeater {
            model: visibleTodos.slice(0, focused ? 7 : 5)

            RowLayout {
                width: parent.width
                spacing: 10

                Rectangle {
                    width: focused ? 16 : 14
                    height: width
                    radius: 3
                    color: "transparent"
                    border.color: "#66ffffff"
                    border.width: 1
                }

                Text {
                    Layout.fillWidth: true
                    text: modelData.title || ""
                    color: "white"
                    font.pixelSize: focused ? 18 : 14
                    elide: Text.ElideRight
                }

                Text {
                    text: modelData.tag || ""
                    color: modelData.tag === "School" ? "#68e083" : "#b99aff"
                    font.pixelSize: 11
                }

                Text {
                    text: modelData.date || ""
                    color: "#adffffff"
                    font.pixelSize: 12
                }
            }
        }

        Text {
            visible: visibleTodos.length === 0
            text: "All tasks completed"
            color: "#adffffff"
            font.pixelSize: focused ? 17 : 14
        }
    }

    Text {
        x: 24
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 20
        text: completed + " of " + todos.length + " tasks completed"
        color: "#adffffff"
        font.pixelSize: 13
    }

    Rectangle {
        x: 190
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 27
        width: parent.width - 214
        height: 3
        radius: 2
        color: "#26ffffff"

        Rectangle {
            width: todos.length ? parent.width * completed / todos.length : 0
            height: parent.height
            radius: 2
            color: "#00e5ff"
            Behavior on width { NumberAnimation { duration: 360 } }
        }
    }
}
