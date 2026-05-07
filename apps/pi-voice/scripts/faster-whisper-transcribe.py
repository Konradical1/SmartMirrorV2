#!/usr/bin/env python3
import argparse
import json
import os
import sys

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    sys.stderr.write(f"faster-whisper import failed: {exc}\n")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper")
    parser.add_argument("--audio", required=True, help="Path to audio file (wav)")
    parser.add_argument("--model", default=os.getenv("FASTER_WHISPER_MODEL", "small"), help="Model name")
    parser.add_argument("--device", default=os.getenv("FASTER_WHISPER_DEVICE", "auto"), help="Device (auto, cpu, cuda)")
    parser.add_argument("--compute-type", dest="compute_type", default=os.getenv("FASTER_WHISPER_COMPUTE_TYPE", ""), help="Compute type")
    parser.add_argument("--language", default=os.getenv("STT_LANGUAGE", "en"), help="Language code")
    return parser.parse_args()


def main():
    args = parse_args()
    compute_type = args.compute_type or None

    try:
        model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    except Exception as exc:
        sys.stderr.write(f"Failed to load model: {exc}\n")
        sys.exit(1)

    try:
        segments, info = model.transcribe(
            args.audio,
            language=args.language or None,
            vad_filter=True,
        )
        text = "".join(segment.text for segment in segments).strip()
        payload = {
            "text": text,
            "language": getattr(info, "language", ""),
            "duration": getattr(info, "duration", None),
            "segments": [
                {
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                }
                for segment in segments
            ],
        }
        print(json.dumps(payload))
    except Exception as exc:
        sys.stderr.write(f"Transcription failed: {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
