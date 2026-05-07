import QtQuick
import QtQuick.Window
import QtWebSockets
import "components"

Window {
    id: root
    visible: true
    visibility: Window.FullScreen
    color: "#000000"
    title: "SmartMirrorV2"

    property string scene: "idle"
    property bool backendOnline: false
    property string uiFont: "Cantarell"
    property var weather: ({
        location: "Anderson Township, OH",
        temperature: 61,
        feelsLike: 61,
        condition: "Partly cloudy",
        wind: "11 mph",
        humidity: "64%",
        forecast: [
            { day: "Today", high: 63, low: 51, condition: "partly" },
            { day: "Tomorrow", high: 55, low: 41, condition: "partly" },
            { day: "Friday", high: 60, low: 44, condition: "clear" }
        ],
        hourly: []
    })
    property var calendar: []
    property var spotify: ({ isPlaying: false, service: "Spotify", title: "", artist: "", progress: 0 })
    property var todos: []
    property string voiceStatus: "idle"
    property string voiceText: ""
    property real audioLevel: 0
    property bool speaking: voiceStatus === "speaking"
    property bool detailScene: scene === "weather" || scene === "spotify" || scene === "calendar"

    function applyAction(payload) {
        if (!payload) return
        var intentScene = {
            "SHOW_WEATHER": "weather",
            "SHOW_CALENDAR": "calendar",
            "SHOW_SPOTIFY": "spotify",
            "SHOW_TODO": "todo",
            "ADD_TODO": "todo",
            "CHECK_TODO": "todo",
            "SPOTIFY_NEXT": "spotify",
            "SPOTIFY_PREVIOUS": "spotify",
            "SPOTIFY_PAUSE": "spotify",
            "SPOTIFY_PLAY": "spotify",
            "IDLE": "idle"
        }
        scene = intentScene[payload.intent] || "idle"
        if (payload.data) applyData(payload.data)
        if (payload.speech) {
            voiceStatus = "speaking"
            voiceText = payload.speech
            overlayClearTimer.interval = payload.displayMs || (payload.ui ? payload.ui.speechDisplayMs : 0) || 6000
            overlayClearTimer.restart()
        }
        if (scene !== "idle") {
            sceneCloseTimer.interval = payload.displayMs || (payload.ui ? payload.ui.displayMs : 0) || 12000
            sceneCloseTimer.restart()
        }
    }

    function applyData(payload) {
        if (!payload) return
        if (payload.weather) weather = payload.weather
        if (payload.calendar) calendar = payload.calendar
        if (payload.spotify) spotify = payload.spotify || spotify
        if (payload.todos) todos = payload.todos
    }

    function applyVoice(payload) {
        voiceStatus = payload.status || "idle"
        voiceText = payload.text || ""
        if (typeof payload.audioLevel === "number") audioLevel = Math.max(0, Math.min(1, payload.audioLevel))
        if (voiceStatus === "idle" || voiceStatus === "done") audioLevel = 0
        if (voiceStatus === "speaking" && voiceText) {
            overlayClearTimer.interval = payload.displayMs || 6000
            overlayClearTimer.restart()
        }
    }

    WebSocket {
        id: socket
        url: backendWsUrl
        active: true

        onStatusChanged: {
            backendOnline = socket.status === WebSocket.Open
            if (socket.status === WebSocket.Error || socket.status === WebSocket.Closed) reconnectTimer.restart()
        }

        onTextMessageReceived: function(message) {
            try {
                var parsed = JSON.parse(message)
                if (parsed.type === "ACTION") applyAction(parsed.payload)
                if (parsed.type === "DATA_UPDATE") applyData(parsed.payload)
                if (parsed.type === "OVERLAY") {
                    voiceStatus = "speaking"
                    voiceText = parsed.payload ? (parsed.payload.speech || parsed.payload.text || "") : ""
                    overlayClearTimer.interval = parsed.payload ? (parsed.payload.displayMs || 6000) : 6000
                    overlayClearTimer.restart()
                }
                if (parsed.type === "VOICE_STATUS") applyVoice(parsed.payload)
            } catch (error) {
            }
        }
    }

    Timer {
        id: reconnectTimer
        interval: 2500
        repeat: false
        onTriggered: {
            socket.active = false
            socket.active = true
        }
    }

    Timer {
        id: sceneCloseTimer
        repeat: false
        onTriggered: scene = "idle"
    }

    Timer {
        id: overlayClearTimer
        repeat: false
        onTriggered: {
            voiceStatus = "idle"
            voiceText = ""
            audioLevel = 0
        }
    }

    Item {
        id: stage
        property bool rotateForLandscape: root.width > root.height
        width: 1080
        height: 1920
        anchors.centerIn: parent
        rotation: rotateForLandscape ? 90 : 0
        scale: rotateForLandscape
            ? Math.min(root.width / 1920, root.height / 1080)
            : Math.min(root.width / 1080, root.height / 1920)

        Rectangle {
            anchors.fill: parent
            color: "#000000"
        }

        ClockPanel {
            id: clockPanel
            x: 72
            y: 78
            width: 510
            height: 250
            fontFamily: root.uiFont
            opacity: root.detailScene ? 0 : scene === "idle" ? 1 : 0.42
            Behavior on opacity { NumberAnimation { duration: 360 } }
        }

        WeatherPanel {
            id: weatherPanel
            x: scene === "weather" ? 150 : 678
            y: scene === "weather" ? 250 : 80
            width: scene === "weather" ? 780 : 330
            height: scene === "weather" ? 1120 : 600
            weather: root.weather
            fontFamily: root.uiFont
            focused: scene === "weather"
            opacity: scene === "idle" || scene === "weather" ? 1 : 0
            Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on opacity { NumberAnimation { duration: 360 } }
        }

        SpotifyCard {
            id: spotifyCard
            x: scene === "spotify" ? 325 : 72
            y: scene === "spotify" ? 300 : 690
            width: scene === "spotify" ? 430 : 300
            height: scene === "spotify" ? 600 : 390
            spotify: root.spotify
            fontFamily: root.uiFont
            focused: scene === "spotify"
            opacity: (spotify && spotify.isPlaying && (scene === "spotify" || scene === "idle")) ? 1 : 0
            Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on opacity { NumberAnimation { duration: 420 } }
        }

        CalendarStrip {
            id: calendarStrip
            x: scene === "calendar" ? 72 : 72
            y: scene === "calendar" ? 270 : 1410
            width: scene === "calendar" ? 936 : 560
            height: scene === "calendar" ? 1240 : 360
            days: root.calendar.slice(0, scene === "calendar" ? 7 : 3)
            fontFamily: root.uiFont
            focused: scene === "calendar"
            opacity: scene === "calendar" || scene === "idle" ? 1 : 0
            Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
            Behavior on opacity { NumberAnimation { duration: 360 } }
        }

        TodoPanel {
            id: todoPanel
            x: 670
            y: 1320
            width: 338
            height: 452
            todos: root.todos
            fontFamily: root.uiFont
            focused: scene === "todo"
            opacity: root.detailScene ? 0 : 1
            Behavior on opacity { NumberAnimation { duration: 360 } }
        }

        VoiceOrb {
            id: voiceOrb
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            width: 540
            height: 260
            mode: !backendOnline ? "offline" : root.voiceStatus
            text: !backendOnline ? "Backend offline" : root.voiceText
            audioLevel: root.audioLevel
            fontFamily: root.uiFont
            opacity: root.detailScene && !voiceOrb.active ? 0 : 1
            Behavior on opacity { NumberAnimation { duration: 300 } }
        }
    }
}
