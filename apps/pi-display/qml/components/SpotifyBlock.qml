import QtQuick

Item {
    id: root

    property var spotify
    property bool focused: false

    Rectangle {
        anchors.fill: parent
        radius: 8
        color: "#07ffffff"
        border.color: "#1cffffff"
        border.width: 1
    }

    Text {
        x: 20
        y: 18
        text: spotify ? (spotify.service || "Spotify") : "Spotify"
        color: "#adffffff"
        font.pixelSize: focused ? 17 : 15
    }

    Image {
        id: album
        x: 20
        y: 56
        width: parent.width - 40
        height: width
        source: spotify ? (spotify.albumArt || "") : ""
        fillMode: Image.PreserveAspectCrop
        visible: source !== ""
        asynchronous: true
        cache: true
    }

    Rectangle {
        x: 20
        y: 56
        width: parent.width - 40
        height: width
        color: "#0bffffff"
        radius: 8
        visible: !album.visible
    }

    Text {
        x: 20
        y: 76 + parent.width - 40
        width: parent.width - 40
        text: spotify ? (spotify.title || "") : ""
        color: "white"
        font.pixelSize: focused ? 28 : 19
        font.weight: Font.Light
        elide: Text.ElideRight
    }

    Text {
        x: 20
        y: 112 + parent.width - 40
        width: parent.width - 40
        text: spotify ? (spotify.artist || "") : ""
        color: "#adffffff"
        font.pixelSize: focused ? 18 : 15
        elide: Text.ElideRight
    }

    Rectangle {
        x: 20
        y: 154 + parent.width - 40
        width: parent.width - 40
        height: 3
        radius: 2
        color: "#26ffffff"

        Rectangle {
            width: parent.width * Math.max(0, Math.min(100, spotify ? (spotify.progress || 0) : 0)) / 100
            height: parent.height
            radius: 2
            color: "#00e5ff"
        }
    }
}
