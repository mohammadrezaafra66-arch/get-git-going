from __future__ import annotations

import json
import os
import time
import wave
from pathlib import Path

VOSK_DIR = Path(os.environ.get("VOSK_MODEL_DIR", "/models/vosk-model-fa-0.42"))
WHISPER_DIR = Path(os.environ.get("WHISPER_MODEL_DIR", "/models/farsi-faster-whisper-large-v3"))
WHISPER_FALLBACK = Path(os.environ.get("WHISPER_FALLBACK_DIR", "/models/faster-whisper-small"))

_vosk_model = None
_whisper = None


def vosk_ready() -> bool:
    return (VOSK_DIR / "am" / "final.mdl").exists() or (VOSK_DIR / "conf" / "model.conf").exists()


def whisper_dir() -> Path | None:
    if (WHISPER_DIR / "model.bin").exists() or (WHISPER_DIR / "config.json").exists():
        return WHISPER_DIR
    if (WHISPER_FALLBACK / "model.bin").exists() or (WHISPER_FALLBACK / "config.json").exists():
        return WHISPER_FALLBACK
    return None


def get_vosk_model():
    global _vosk_model
    if _vosk_model is None:
        if not vosk_ready():
            raise RuntimeError(f"vosk model missing under {VOSK_DIR}")
        from vosk import Model

        _vosk_model = Model(str(VOSK_DIR))
    return _vosk_model


def make_recognizer():
    from vosk import KaldiRecognizer, SetLogLevel

    SetLogLevel(-1)
    rec = KaldiRecognizer(get_vosk_model(), 8000)
    rec.SetWords(True)
    return rec


def vosk_accept(rec, pcm: bytes) -> tuple[str | None, str | None]:
    """Return (committed, partial)."""
    if rec.AcceptWaveform(pcm):
        data = json.loads(rec.Result())
        return (data.get("text") or "").strip() or None, None
    data = json.loads(rec.PartialResult())
    return None, (data.get("partial") or "").strip() or None


def vosk_final(rec) -> str:
    data = json.loads(rec.FinalResult())
    return (data.get("text") or "").strip()


def get_whisper():
    global _whisper
    if _whisper is None:
        d = whisper_dir()
        if d is None:
            raise RuntimeError("whisper ctranslate2 model missing")
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(str(d), device="cpu", compute_type="int8")
    return _whisper


def whisper_transcribe_wav(path: Path) -> tuple[str, float]:
    t0 = time.perf_counter()
    model = get_whisper()
    segments, info = model.transcribe(str(path), language="fa", vad_filter=True)
    text = " ".join(s.text.strip() for s in segments if s.text).strip()
    elapsed = time.perf_counter() - t0
    duration = float(getattr(info, "duration", 0) or 0)
    rtf = elapsed / duration if duration > 0 else 0.0
    return text, rtf


def write_wav_s16le(path: Path, pcm: bytes, rate: int = 8000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
