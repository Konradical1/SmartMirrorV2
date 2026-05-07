#include <QGuiApplication>
#include <QCursor>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QByteArray>
#include <QUrl>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setOverrideCursor(QCursor(Qt::BlankCursor));

    const QByteArray backendWs = qgetenv("SMARTMIRROR_BACKEND_WS").isEmpty()
        ? QByteArray("ws://192.168.4.41:3001")
        : qgetenv("SMARTMIRROR_BACKEND_WS");

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty("backendWsUrl", QString::fromUtf8(backendWs));
    engine.loadFromModule("SmartMirrorV2", "Main");

    if (engine.rootObjects().isEmpty()) {
        return -1;
    }

    return app.exec();
}
