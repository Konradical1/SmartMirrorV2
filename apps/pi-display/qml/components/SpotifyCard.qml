import QtQuick

Item {
    id: root

    property var spotify
    property string fontFamily: "Inter"
    property bool focused: false
    property real progress: Math.max(0, Math.min(100, spotify ? (spotify.progress || 0) : 0))
    property int pad: focused ? 22 : 16
    property int artSize: focused
        ? Math.min(root.width - 56, root.height - 220)
        : Math.min(root.width - 32, root.height - 166)

    Rectangle {
        anchors.fill: parent
        radius: 14
        color: "#660A0A0A"
        border.width: 0
    }

    Text {
        x: root.pad
        y: root.focused ? 18 : 12
        text: spotify ? (spotify.service || "Spotify") : "Spotify"
        color: "#1ED760"
        font.family: root.fontFamily
        font.pixelSize: root.focused ? 16 : 12
        font.weight: Font.Light
    }

    Rectangle {
        id: artShell
        anchors.horizontalCenter: parent.horizontalCenter
        y: root.focused ? 48 : 34
        width: root.artSize
        height: root.artSize
        radius: root.focused ? 12 : 8
        color: "#101010"
        clip: true

        Image {
            anchors.fill: parent
            source: spotify ? (spotify.albumArt || "") : ""
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            cache: true
            visible: source !== ""
        }

        Rectangle {
            anchors.fill: parent
            color: "#101010"
            visible: spotify ? !(spotify.albumArt || "") : true
        }
    }

    Text {
        x: root.pad
        y: artShell.y + artShell.height + (root.focused ? 18 : 14)
        width: parent.width - root.pad * 2
        text: spotify ? (spotify.title || "Nothing playing") : "Nothing playing"
        color: "#FFFFFF"
        font.family: root.fontFamily
        font.pixelSize: root.focused ? 25 : 17
        font.weight: Font.Light
        maximumLineCount: 1
        elide: Text.ElideRight
    }

    Text {
        x: root.pad
        y: artShell.y + artShell.height + (root.focused ? 52 : 39)
        width: parent.width - root.pad * 2
        text: spotify ? (spotify.artist || "") : ""
        color: "#9CA0A8"
        font.family: root.fontFamily
        font.pixelSize: root.focused ? 17 : 13
        font.weight: Font.Light
        maximumLineCount: 1
        elide: Text.ElideRight
    }

    Rectangle {
        x: root.pad
        y: parent.height - (root.focused ? 72 : 52)
        width: parent.width - root.pad * 2
        height: 2
        radius: 2
        color: "#18FFFFFF"

        Rectangle {
            width: parent.width * root.progress / 100
            height: parent.height
            radius: 2
            color: "#1ED760"
            Behavior on width { NumberAnimation { duration: 400; easing.type: Easing.OutCubic } }
        }
    }

    Row {
        anchors.horizontalCenter: parent.horizontalCenter
        y: parent.height - (root.focused ? 40 : 28)
        spacing: root.focused ? 28 : 22

        Repeater {
            model: ["prev", "play", "next"]

            Rectangle {
                width: modelData === "play" ? (root.focused ? 24 : 18) : (root.focused ? 16 : 13)
                height: root.focused ? 18 : 14
                color: "transparent"

                Text {
                    anchors.centerIn: parent
                    text: modelData === "prev" ? "<<" : modelData === "next" ? ">>" : (spotify && spotify.isPlaying ? "II" : ">")
                    color: "#D9DBDF"
                    font.family: root.fontFamily
                    font.pixelSize: modelData === "play" ? (root.focused ? 17 : 13) : (root.focused ? 13 : 10)
                    font.weight: Font.Light
                }
            }
        }
    }
}
