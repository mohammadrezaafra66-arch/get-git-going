"""Energy + modulation VAD for 8 kHz s16le mono.

Silence stays below the RMS floor. Stationary noise (flat frame energy)
is rejected even when loud — A4 requires 0 segments on noise clips.
"""

from __future__ import annotations

import audioop
import math


SPEECH_RMS = 350
MIN_SPEECH_BYTES = 8000 * 2  # 1 s of 8 kHz s16le
FRAME = 320  # 20 ms
MIN_CV = 0.22  # speech amplitude modulates; white/xorshift noise does not


def rms_s16le(pcm: bytes) -> int:
    if not pcm:
        return 0
    return audioop.rms(pcm, 2)


def is_speech(pcm: bytes, rms_floor: int = SPEECH_RMS) -> bool:
    return rms_s16le(pcm) >= rms_floor


def _frame_rms(pcm: bytes) -> list[int]:
    out: list[int] = []
    for i in range(0, len(pcm) - FRAME + 1, FRAME):
        out.append(rms_s16le(pcm[i : i + FRAME]))
    return out


def _coeff_var(values: list[int]) -> float:
    if not values:
        return 0.0
    mean = sum(values) / len(values)
    if mean <= 1e-6:
        return 0.0
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return math.sqrt(var) / mean


def has_enough_speech(pcm: bytes, rms_floor: int = SPEECH_RMS) -> bool:
    if len(pcm) < MIN_SPEECH_BYTES:
        return False
    frames = _frame_rms(pcm)
    if not frames:
        return False
    speech_bytes = sum(FRAME for r in frames if r >= rms_floor)
    if speech_bytes < MIN_SPEECH_BYTES:
        return False
    # Reject stationary noise: energy is high but almost constant across frames.
    return _coeff_var(frames) >= MIN_CV
