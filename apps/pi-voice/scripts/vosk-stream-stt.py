#!/usr/bin/env python3
import json
import os
import sys
import warnings
from pathlib import Path


SAMPLE_RATE = int(os.getenv("VOICE_FAST_STT_SAMPLE_RATE", "16000"))
DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "vosk-model-small-en-us-0.15"


def emit(payload):
    print(json.dumps(payload), flush=True)


def main():
    warnings.filterwarnings("ignore")
    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except Exception as error:
        emit({"type": "error", "error": f"vosk unavailable: {error}"})
        return 1

    model_path = os.getenv("VOSK_MODEL_PATH") or os.getenv("VOICE_FAST_STT_MODEL_PATH") or str(DEFAULT_MODEL_PATH)
    if not model_path:
        emit({"type": "error", "error": "Set VOSK_MODEL_PATH to a Vosk model directory."})
        return 1
    if not os.path.isdir(model_path):
        emit({"type": "error", "error": f"Vosk model not found: {model_path}"})
        return 1

    SetLogLevel(int(os.getenv("VOSK_LOG_LEVEL", "-1")))
    model = Model(model_path)
    recognizer = KaldiRecognizer(model, SAMPLE_RATE)
    recognizer.SetWords(True)
    emit({"type": "ready", "model": model_path})

    last_partial = ""
    while True:
        data = sys.stdin.buffer.read(4096)
        if not data:
            break

        if recognizer.AcceptWaveform(data):
            result = json.loads(recognizer.Result() or "{}")
            text = (result.get("text") or "").strip()
            if text:
                emit({"type": "final", "text": text})
                last_partial = ""
        else:
            result = json.loads(recognizer.PartialResult() or "{}")
            partial = (result.get("partial") or "").strip()
            if partial and partial != last_partial:
                emit({"type": "partial", "text": partial})
                last_partial = partial

    final = json.loads(recognizer.FinalResult() or "{}")
    text = (final.get("text") or "").strip()
    if text:
        emit({"type": "final", "text": text})
    return 0


if __name__ == "__main__":
    sys.exit(main())
