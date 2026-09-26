#!/usr/bin/env python3
"""WER + RTF for every R3 candidate. Run inside afrakala-stt after models exist."""

from __future__ import annotations

import json
import re
import sys
import time
import wave
from pathlib import Path

EVAL = Path("/eval")
OUT = Path("/eval/wer-bench.json")


def norm(text: str) -> list[str]:
    t = text.replace("\u200c", " ").replace("\u0640", "")
    t = re.sub(r"[^\w\s\u0600-\u06FF]", " ", t, flags=re.UNICODE)
    return [w for w in t.split() if w]


def wer(ref: str, hyp: str) -> float:
    r = norm(ref)
    h = norm(hyp)
    if not r:
        return 0.0 if not h else 1.0
    dp = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1):
        dp[i][0] = i
    for j in range(len(h) + 1):
        dp[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            cost = 0 if r[i - 1] == h[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    return dp[-1][-1] / len(r)


def pairs() -> list[tuple[Path, str]]:
    out = []
    for wav in sorted(EVAL.glob("fa_*.wav")):
        txt = wav.with_suffix(".txt")
        if not txt.is_file():
            continue
        try:
            with wave.open(str(wav), "rb") as w:
                dur = w.getnframes() / float(w.getframerate() or 8000)
        except Exception:
            continue
        if dur > 16.0:
            continue
        out.append((wav, txt.read_text(encoding="utf-8").strip()))
        if len(out) >= 20:
            break
    return out


def vosk_hyp(model, wav: Path) -> str:
    from vosk import KaldiRecognizer, SetLogLevel

    SetLogLevel(-1)
    rec = KaldiRecognizer(model, 8000)
    rec.SetWords(True)
    with wave.open(str(wav), "rb") as w:
        pcm = w.readframes(w.getnframes())
    rec.AcceptWaveform(pcm)
    data = json.loads(rec.FinalResult())
    return (data.get("text") or "").strip()


def whisper_hyp(model, wav: Path) -> tuple[str, float]:
    t0 = time.perf_counter()
    segments, info = model.transcribe(str(wav), language="fa", vad_filter=True)
    text = " ".join(s.text.strip() for s in segments if s.text).strip()
    elapsed = time.perf_counter() - t0
    duration = float(getattr(info, "duration", 0) or 0)
    rtf = elapsed / duration if duration > 0 else 0.0
    return text, rtf


def main() -> int:
    clips = pairs()
    if len(clips) < 5:
        print("NEED_EVAL_CLIPS", len(clips))
        return 2
    results = []

    # live path
    from vosk import Model

    t0 = time.perf_counter()
    vmodel = Model("/models/vosk-model-fa-0.42")
    load_s = time.perf_counter() - t0
    wers = []
    for wav, ref in clips:
        t1 = time.perf_counter()
        hyp = vosk_hyp(vmodel, wav)
        elapsed = time.perf_counter() - t1
        with wave.open(str(wav), "rb") as w:
            dur = w.getnframes() / float(w.getframerate() or 8000)
        wval = wer(ref, hyp)
        wers.append(wval)
        results.append(
            {
                "engine": "vosk-model-fa-0.42",
                "path": "live",
                "wav": wav.name,
                "wer": round(wval, 4),
                "rtf": round(elapsed / dur, 4) if dur else None,
                "hyp": hyp,
                "ref": ref,
            }
        )
    report = {
        "n_clips": len(clips),
        "candidates": [
            {
                "name": "vosk-model-fa-0.42",
                "path": "live",
                "load_s": round(load_s, 3),
                "wer_mean": round(sum(wers) / len(wers), 4),
            }
        ],
        "rows": results,
    }

    from faster_whisper import WhisperModel

    whisper_dirs = [
        ("oi-uae/farsi-faster-whisper-large-v3", Path("/models/farsi-faster-whisper-large-v3"), "final"),
        ("AmirMohseni/whisper-small-persian-ct2", Path("/models/whisper-small-persian-ct2"), "final"),
        ("Systran/faster-whisper-small", Path("/models/faster-whisper-small"), "final"),
    ]
    for name, d, role in whisper_dirs:
        if not ((d / "model.bin").exists() or (d / "config.json").exists()):
            report["candidates"].append({"name": name, "missing": True, "dir": str(d)})
            continue
        t0 = time.perf_counter()
        model = WhisperModel(str(d), device="cpu", compute_type="int8")
        load_s = time.perf_counter() - t0
        wers = []
        rtfs = []
        for wav, ref in clips:
            hyp, rtf = whisper_hyp(model, wav)
            wval = wer(ref, hyp)
            wers.append(wval)
            rtfs.append(rtf)
            results.append(
                {
                    "engine": name,
                    "path": role,
                    "wav": wav.name,
                    "wer": round(wval, 4),
                    "rtf": round(rtf, 4),
                    "hyp": hyp,
                    "ref": ref,
                }
            )
        report["candidates"].append(
            {
                "name": name,
                "path": role,
                "dir": str(d),
                "load_s": round(load_s, 3),
                "wer_mean": round(sum(wers) / len(wers), 4),
                "rtf_mean": round(sum(rtfs) / len(rtfs), 4) if rtfs else None,
                "rtf_max": round(max(rtfs), 4) if rtfs else None,
            }
        )
        del model

    finals = [c for c in report["candidates"] if c.get("path") == "final" and "wer_mean" in c]
    finals_sorted = sorted(finals, key=lambda c: c["wer_mean"])
    report["final_rank_by_wer"] = [c["name"] for c in finals_sorted]
    report["live_choice"] = "vosk-model-fa-0.42"
    report["note"] = "final = most accurate that meets A3 (measured separately); live = most accurate with RTF<=0.5 at 8 streams"
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(OUT), "candidates": report["candidates"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
