#!/usr/bin/env python3
"""Extract FLEURS fa_ir test clips, resample to 8 kHz mono, write wav+txt pairs."""

from __future__ import annotations

import subprocess
import tarfile
from pathlib import Path

SRC = Path(r"D:\afrakala-stt\eval\_fleurs_src")
EVAL = Path(r"D:\afrakala-stt\eval")
N_CLIPS = 40


def main() -> int:
    tsv = SRC / "data" / "fa_ir" / "test.tsv"
    tar = SRC / "data" / "fa_ir" / "audio" / "test.tar.gz"
    if not tsv.exists() or not tar.exists():
        print("FLEURS_SRC_MISSING", tsv.exists(), tar.exists())
        return 2
    extract = SRC / "extracted"
    extract.mkdir(parents=True, exist_ok=True)
    if not any(extract.rglob("*.wav")):
        print("EXTRACT", tar)
        with tarfile.open(tar, "r:gz") as tf:
            tf.extractall(extract)
    wavs = {p.name: p for p in extract.rglob("*.wav")}
    print("WAVS", len(wavs))
    seen = set()
    rows = []
    for line in tsv.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        name = Path(parts[1].strip()).name
        transcript = parts[3].strip()
        if not name.endswith(".wav") or not transcript:
            continue
        if transcript in seen:
            continue
        if name not in wavs:
            continue
        seen.add(transcript)
        rows.append((name, transcript, wavs[name]))
    print("UNIQUE_ROWS", len(rows))
    EVAL.mkdir(parents=True, exist_ok=True)
    written = 0
    for name, transcript, src in rows:
        if written >= N_CLIPS:
            break
        dest_name = f"fa_{written:03d}.wav"
        txt = EVAL / f"fa_{written:03d}.txt"
        rel = src.relative_to(extract).as_posix()
        cmd = [
            "docker",
            "run",
            "--rm",
            "-v",
            "D:/afrakala-stt/eval/_fleurs_src/extracted:/src",
            "-v",
            "D:/afrakala-stt/eval:/eval",
            "afrakala-stt:local",
            "ffmpeg",
            "-y",
            "-i",
            f"/src/{rel}",
            "-ac",
            "1",
            "-ar",
            "8000",
            "-c:a",
            "pcm_s16le",
            f"/eval/{dest_name}",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        txt.write_text(transcript + "\n", encoding="utf-8")
        written += 1
        print("WROTE", dest_name, "src", name, "words", len(transcript.split()))
    print("EVAL_CLIPS", written)
    return 0 if written >= 10 else 1


if __name__ == "__main__":
    raise SystemExit(main())
