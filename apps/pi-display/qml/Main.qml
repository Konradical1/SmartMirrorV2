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
    property bool screenOn: true
    property string voiceStatus: "idle"
    property string voiceText: ""
    property real audioLevel: 0
    property bool speaking: voiceStatus === "speaking"
    property bool detailScene: scene === "weather" || scene === "spotify" || scene === "calendar" || scene === "todo"
    property bool conversationEngaged: voiceStatus === "wake_detected"
        || voiceStatus === "listening"
        || voiceStatus === "thinking"
        || voiceStatus === "speaking"
        || voiceStatus === "error"
        || audioLevel > 0.02

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
        if (payload.data) applyData(payload.data)
        if (payload.ui) applyUiState(payload.ui)

        if (payload.intent === "SCREEN_ON" || payload.intent === "MIRROR_SCREEN_ON") {
            screenOn = true
            scene = "idle"
        } else if (payload.intent === "SCREEN_OFF" || payload.intent === "MIRROR_SCREEN_OFF" || payload.intent === "GOODNIGHT" || payload.intent === "GOOD_NIGHT") {
            screenOn = false
            scene = "idle"
        } else {
            scene = intentScene[payload.intent] || "idle"
        }

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
        if (payload.ui) applyUiState(payload.ui)
    }

    function applyUiState(payload) {
        if (!payload) return
        if (typeof payload.screenOn === "boolean") screenOn = payload.screenOn
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
                if (parsed.type === "UI_STATE") applyUiState(parsed.payload)
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
        width: rotateForLandscape ? root.height : root.width
        height: rotateForLandscape ? root.width : root.height
        anchors.centerIn: parent
        rotation: rotateForLandscape ? 90 : 0
        transformOrigin: Item.Center

        Rectangle {
            anchors.fill: parent
            color: "#000000"
        }

        Item {
            id: mirrorContent
            anchors.fill: parent
            opacity: root.screenOn ? 1 : 0
            visible: opacity > 0.01

            property real uiScale: Math.max(0.1, Math.min(0.88, width / 1080, height / 1920))
            property real weatherPreviewWidth: 330
            property real weatherPreviewHeight: 600
            property real calendarPreviewWidth: 560
            property real calendarPreviewHeight: 360
            property real spotifyPreviewWidth: 300
            property real spotifyPreviewHeight: 390
            property real todoPreviewWidth: 338
            property real todoPreviewHeight: 452
            property real weatherPreviewX: width - weatherPreviewWidth * uiScale
            property real weatherPreviewY: 0
            property real spotifyPreviewX: 0
            property real spotifyPreviewY: Math.max((250 + 20) * uiScale, Math.min(690 * uiScale, height - (spotifyPreviewHeight + calendarPreviewHeight + 24) * uiScale))
            property real calendarPreviewX: 0
            property real calendarPreviewY: height - calendarPreviewHeight * uiScale
            property real todoPreviewX: width - todoPreviewWidth * uiScale
            property real todoPreviewY: height - todoPreviewHeight * uiScale

            Behavior on opacity { NumberAnimation { duration: 420; easing.type: Easing.OutCubic } }

            ClockPanel {
                id: clockPanel
                x: 0
                y: 0
                width: 510
                height: 250
                scale: mirrorContent.uiScale
                transformOrigin: Item.TopLeft
                fontFamily: root.uiFont
                opacity: root.detailScene ? 0 : scene === "idle" ? 1 : 0.42
                Behavior on opacity { NumberAnimation { duration: 360 } }
            }

            WeatherPanel {
                id: weatherPanel
                x: scene === "weather" ? 0 : mirrorContent.weatherPreviewX
                y: scene === "weather" ? 0 : mirrorContent.weatherPreviewY
                width: scene === "weather" ? parent.width / scale : mirrorContent.weatherPreviewWidth
                height: scene === "weather" ? parent.height / scale : mirrorContent.weatherPreviewHeight
                scale: mirrorContent.uiScale
                transformOrigin: Item.TopLeft
                weather: root.weather
                fontFamily: root.uiFont
                focused: scene === "weather"
                opacity: scene === "idle" || scene === "weather" ? 1 : 0
                Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on scale { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on opacity { NumberAnimation { duration: 360 } }
            }

            SpotifyCard {
                id: spotifyCard
                x: scene === "spotify" ? 0 : mirrorContent.spotifyPreviewX
                y: scene === "spotify" ? 0 : mirrorContent.spotifyPreviewY
                width: scene === "spotify" ? parent.width / scale : mirrorContent.spotifyPreviewWidth
                height: scene === "spotify" ? parent.height / scale : mirrorContent.spotifyPreviewHeight
                scale: mirrorContent.uiScale
                transformOrigin: Item.TopLeft
                spotify: root.spotify
                fontFamily: root.uiFont
                focused: scene === "spotify"
                opacity: (spotify && spotify.isPlaying && (scene === "spotify" || scene === "idle")) ? 1 : 0
                Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on scale { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on opacity { NumberAnimation { duration: 420 } }
            }

            CalendarStrip {
                id: calendarStrip
                x: scene === "calendar" ? 0 : mirrorContent.calendarPreviewX
                y: scene === "calendar" ? 0 : mirrorContent.calendarPreviewY
                width: scene === "calendar" ? parent.width / scale : mirrorContent.calendarPreviewWidth
                height: scene === "calendar" ? parent.height / scale : mirrorContent.calendarPreviewHeight
                scale: mirrorContent.uiScale
                transformOrigin: Item.TopLeft
                days: root.calendar.slice(0, scene === "calendar" ? 7 : 3)
                fontFamily: root.uiFont
                focused: scene === "calendar"
                opacity: scene === "calendar" || scene === "idle" ? 1 : 0
                Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on scale { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on opacity { NumberAnimation { duration: 360 } }
            }

            TodoPanel {
                id: todoPanel
                x: scene === "todo" ? 0 : mirrorContent.todoPreviewX
                y: scene === "todo" ? 0 : mirrorContent.todoPreviewY
                width: scene === "todo" ? parent.width / scale : mirrorContent.todoPreviewWidth
                height: scene === "todo" ? parent.height / scale : mirrorContent.todoPreviewHeight
                scale: mirrorContent.uiScale
                transformOrigin: Item.TopLeft
                todos: root.todos
                fontFamily: root.uiFont
                focused: scene === "todo"
                opacity: scene === "todo" || scene === "idle" ? 1 : 0
                Behavior on x { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on y { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on width { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on height { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on scale { NumberAnimation { duration: 520; easing.type: Easing.OutCubic } }
                Behavior on opacity { NumberAnimation { duration: 360 } }
            }

            VoiceOrb {
                id: voiceOrb
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                width: 540
                height: 360
                mode: !backendOnline && root.conversationEngaged ? "offline" : root.voiceStatus
                text: !backendOnline && root.voiceText.length === 0 ? "Backend offline" : root.voiceText
                audioLevel: root.audioLevel
                fontFamily: root.uiFont
                opacity: root.conversationEngaged ? 1 : 0
                scale: mirrorContent.uiScale * (root.conversationEngaged ? 1 : 0.76)
                transformOrigin: Item.Bottom
                visible: opacity > 0.01
                Behavior on opacity { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
                Behavior on scale { NumberAnimation { duration: 300; easing.type: Easing.OutBack } }
            }
        }
    }
}
