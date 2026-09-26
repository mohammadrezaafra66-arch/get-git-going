from __future__ import annotations

import json
import os
import threading
import time
import wave
from pathlib import Path
from typing import Any

VOSK_DIR = Path(os.environ.get("VOSK_MODEL_DIR", "/models/vosk-model-fa-0.42"))
WHISPER_DIR = Path(os.environ.get("WHISPER_MODEL_DIR", "/models/farsi-faster-whisper-large-v3"))
WHISPER_FALLBACK = Path(os.environ.get("WHISPER_FALLBACK_DIR", "/models/faster-whisper-small"))

_vosk_model = None
_whisper = None
_whisper_name = ""
_lock = threading.Lock()
_ready = {"vosk": False, "whisper": False, "error": None, "loading": False}


def vosk_on_disk() -> bool:
    return (VOSK_DIR / "am" / "final.mdl").exists() or (VOSK_DIR / "conf" / "model.conf").exists()


def vosk_ready() -> bool:
    return vosk_on_disk()


def whisper_dir() -> Path | None:
    if (WHISPER_DIR / "model.bin").exists() or (WHISPER_DIR / "config.json").exists():
        return WHISPER_DIR
    if (WHISPER_FALLBACK / "model.bin").exists() or (WHISPER_FALLBACK / "config.json").exists():
        return WHISPER_FALLBACK
    return None


def models_ready() -> bool:
    return bool(_ready["vosk"] and _ready["whisper"] and _vosk_model is not None and _whisper is not None)


def health_payload() -> dict[str, Any]:
    ready = models_ready()
    return {
        "ok": ready,
        "ready": ready,
        "status": "ready" if ready else "not-ready",
        "vosk": vosk_on_disk(),
        "vosk_loaded": bool(_ready["vosk"]),
        "whisper": whisper_dir() is not None,
        "whisper_loaded": bool(_ready["whisper"]),
        "whisper_name": _whisper_name or (str(whisper_dir()) if whisper_dir() else ""),
        "loading": bool(_ready["loading"]),
        "error": _ready["error"],
    }


def get_vosk_model():
    global _vosk_model
    if _vosk_model is None:
        if not vosk_on_disk():
            raise RuntimeError(f"vosk model missing under {VOSK_DIR}")
        from vosk import Model

        _vosk_model = Model(str(VOSK_DIR))
        _ready["vosk"] = True
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
    global _whisper, _whisper_name
    if _whisper is None:
        d = whisper_dir()
        if d is None:
            raise RuntimeError("whisper ctranslate2 model missing")
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(str(d), device="cpu", compute_type="int8")
        _whisper_name = d.name
        _ready["whisper"] = True
    return _whisper


def load_whisper_path(path: Path, compute_type: str = "int8"):
    from faster_whisper import WhisperModel

    return WhisperModel(str(path), device="cpu", compute_type=compute_type)


def whisper_transcribe_wav(path: Path) -> tuple[str, float]:
    t0 = time.perf_counter()
    model = get_whisper()
    segments, info = model.transcribe(str(path), language="fa", vad_filter=True)
    text = " ".join(s.text.strip() for s in segments if s.text).strip()
    elapsed = time.perf_counter() - t0
    duration = float(getattr(info, "duration", 0) or 0)
    rtf = elapsed / duration if duration > 0 else 0.0
    return text, rtf


def whisper_transcribe_wav_with(model, path: Path) -> tuple[str, float]:
    t0 = time.perf_counter()
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


def preload_all() -> None:
    """Load every production model into RAM. Safe to call more than once."""
    with _lock:
        if models_ready() or _ready["loading"]:
            return
        _ready["loading"] = True
        _ready["error"] = None
    try:
        get_vosk_model()
        get_whisper()
    except Exception as exc:  # noqa: BLE001
        _ready["error"] = f"{type(exc).__name__}: {exc}"
        raise
    finally:
        _ready["loading"] = False


def start_preload_thread() -> None:
    threading.Thread(target=preload_all, name="stt-preload", daemon=True).start()
