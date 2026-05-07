#!/usr/bin/env python3
import glob
import json
import os
import struct
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL.*")

import numpy as np
import openwakeword
from openwakeword.model import Model

SAMPLE_RATE = 16000
SAMPLE_WIDTH_BYTES = 2


def resolve_wake_model_path():
    wake_model = os.getenv("VOICE_WAKE_MODEL", "hey_jarvis")
    wake_model_path = os.getenv("VOICE_WAKE_MODEL_PATH", "")

    if wake_model_path:
        return wake_model_path
    if os.path.exists(wake_model):
        return wake_model

    model_dir = Path(openwakeword.__file__).resolve().parent / "resources" / "models"
    matches = sorted(glob.glob(str(model_dir / f"{wake_model}*.onnx")))
    if matches:
        return matches[0]

    raise RuntimeError(f"Could not find openWakeWord model for {wake_model}. Set VOICE_WAKE_MODEL_PATH.")


def emit(payload):
    print(json.dumps(payload), flush=True)


def read_exact(size):
    data = sys.stdin.buffer.read(size)
    if len(data) != size:
        return None
    return data


def main():
    frame_ms = int(os.getenv("VOICE_FRAME_MS", "80"))
    threshold = float(os.getenv("VOICE_WAKE_THRESHOLD", "0.45"))
    cooldown_ms = int(os.getenv("VOICE_WAKE_COOLDOWN_MS", "1500"))
    frame_bytes = SAMPLE_RATE * frame_ms // 1000 * SAMPLE_WIDTH_BYTES

    model_path = resolve_wake_model_path()
    try:
        model = Model(wakeword_models=[model_path], inference_framework="onnx")
    except TypeError:
        model = Model(wakeword_model_paths=[model_path])
    wake_label = next(iter(model.models.keys()))
    emit({"type": "ready", "model": wake_label, "threshold": threshold, "frameMs": frame_ms})

    frame_index = 0
    cooldown_frames = max(1, cooldown_ms // frame_ms)
    last_wake_frame = -cooldown_frames

    while True:
        raw = read_exact(frame_bytes)
        if raw is None:
            return

        frame = np.frombuffer(raw, dtype=np.int16)
        predictions = model.predict(frame)
        score = float(predictions.get(wake_label, 0.0))
        frame_index += 1

        if score >= threshold and frame_index - last_wake_frame >= cooldown_frames:
            last_wake_frame = frame_index
            emit({"type": "wake", "model": wake_label, "score": score})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit({"type": "error", "error": str(error)})
        sys.exit(1)
