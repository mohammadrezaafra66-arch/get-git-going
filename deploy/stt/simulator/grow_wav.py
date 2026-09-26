#!/usr/bin/env python3
"""Write a growing WAV the way Asterisk 18 does: 44-byte header with zero sizes,
then 32 KiB PCM bursts, then fix the header on close."""

from __future__ import annotations

import argparse
import os
import struct
import time
from pathlib import Path


HEADER_LEN = 44
BURST = 32 * 1024
RATE = 8000
BYTES_PER_SEC = RATE * 2


def write_header(fh, data_size: int = 0) -> None:
    riff_size = 36 + data_size if data_size else 0
    fh.seek(0)
    fh.write(b"RIFF")
    fh.write(struct.pack("<I", riff_size))
    fh.write(b"WAVEfmt ")
    fh.write(struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE * 2, 2, 16))
    fh.write(b"data")
    fh.write(struct.pack("<I", data_size))


def grow(path: Path, pcm: bytes, realtime: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        write_header(fh, 0)
        offset = 0
        while offset < len(pcm):
            chunk = pcm[offset : offset + BURST]
            fh.write(chunk)
            fh.flush()
            os.fsync(fh.fileno())
            offset += len(chunk)
            if realtime:
                time.sleep(len(chunk) / BYTES_PER_SEC)
        write_header(fh, len(pcm))
        fh.flush()
        os.fsync(fh.fileno())


def silence(seconds: float) -> bytes:
    return b"\x00" * int(seconds * BYTES_PER_SEC)


def noise(seconds: float, seed: int = 1) -> bytes:
    # xorshift16-ish deterministic noise, not speech-like formants
    n = int(seconds * RATE)
    out = bytearray(n * 2)
    x = seed & 0xFFFF
    for i in range(n):
        x ^= (x << 7) & 0xFFFF
        x ^= x >> 9
        x ^= (x << 8) & 0xFFFF
        sample = (x % 2000) - 1000
        struct.pack_into("<h", out, i * 2, sample)
    return bytes(out)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--seconds", type=float, default=4.0)
    p.add_argument("--kind", choices=["silence", "noise"], default="silence")
    p.add_argument("--fast", action="store_true", help="do not sleep for real-time pace")
    args = p.parse_args()
    pcm = silence(args.seconds) if args.kind == "silence" else noise(args.seconds)
    grow(Path(args.out), pcm, realtime=not args.fast)


if __name__ == "__main__":
    main()
