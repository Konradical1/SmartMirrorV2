cmake_minimum_required(VERSION 3.21)

project(SmartMirrorPiDisplay VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.4 REQUIRED COMPONENTS Quick WebSockets)

qt_standard_project_setup(REQUIRES 6.4)

qt_add_executable(smartmirror-pi-display
  src/main.cpp
)

qt_add_qml_module(smartmirror-pi-display
  URI SmartMirrorV2
  VERSION 1.0
  QML_FILES
    qml/Main.qml
    qml/components/CalendarStrip.qml
    qml/components/ClockPanel.qml
    qml/components/SpotifyCard.qml
    qml/components/TodoPanel.qml
    qml/components/VoiceOrb.qml
    qml/components/WeatherPanel.qml
)

target_link_libraries(smartmirror-pi-display
  PRIVATE
    Qt6::Quick
    Qt6::WebSockets
)

install(TARGETS smartmirror-pi-display
  BUNDLE DESTINATION .
  RUNTIME DESTINATION bin
)
