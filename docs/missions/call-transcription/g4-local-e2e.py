#!/usr/bin/env python3
"""G4 local: grow 8 Asterisk-like WAVs and tail them with capture_agent.py."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AGENT = ROOT / "deploy/stt/capture-agent/capture_agent.py"
SIM = ROOT / "deploy/stt/simulator"
sys.path.insert(0, str(SIM))
from grow_wav import grow, noise, silence  # noqa: E402

TEHRAN = timezone(timedelta(hours=3, minutes=30))


def tehran_parts():
    now = datetime.now(TEHRAN)
    return now.strftime("%Y"), now.strftime("%m"), now.strftime("%d")


def main() -> int:
    watch = Path(os.environ.get("G4_WATCH", "D:/afrakala-stt/data/g4-watch"))
    y, m, d = tehran_parts()
    day = watch / y / m / d
    day.mkdir(parents=True, exist_ok=True)
    state = Path("D:/afrakala-stt/data/g4-offsets.json")
    spool = Path("D:/afrakala-stt/data/g4-spool")
    spool.mkdir(parents=True, exist_ok=True)
    url = os.environ.get("STT_URL", "http://192.168.170.8:8090")
    token = os.environ.get("STT_INGEST_TOKEN", "")
    if not token:
        envp = Path("D:/afrakala-stt/.env")
        for line in envp.read_text(encoding="utf-8").splitlines():
            if line.startswith("STT_INGEST_TOKEN="):
                token = line.split("=", 1)[1]
    if not token:
        print("NO_STT_INGEST_TOKEN", file=sys.stderr)
        return 2

    files = []
    stamp = int(time.time())
    for i in range(8):
        ext = "403" if i % 2 == 0 else "412"
        name = f"exten-{ext}-0900000900{i}-{y}{m}{d}-150000-{stamp}.{i}.wav"
        files.append(day / name)

    env = os.environ.copy()
    env["STT_INGEST_TOKEN"] = token
    agent = subprocess.Popen(
        [
            sys.executable,
            str(AGENT),
            "--watch",
            str(watch),
            "--url",
            url,
            "--token",
            token,
            "--state",
            str(state),
            "--spool",
            str(spool),
            "--interval",
            "0.2",
            "--inactivity",
            "4",
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    def writer(path: Path, idx: int) -> None:
        pcm = silence(1.0) + noise(3.0, seed=idx + 3)
        grow(path, pcm, realtime=False)

    threads = [threading.Thread(target=writer, args=(p, i)) for i, p in enumerate(files)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    time.sleep(6)
    agent.terminate()
    try:
        agent.wait(timeout=5)
    except subprocess.TimeoutExpired:
        agent.kill()

    offsets = {}
    if state.is_file():
        offsets = json.loads(state.read_text(encoding="utf-8"))
    n = len((offsets.get("files") or {}))
    report = {"files": len(files), "offset_entries": n, "agent_rc": agent.returncode}
    print(json.dumps(report))
    return 0 if n >= 8 else 1


if __name__ == "__main__":
    raise SystemExit(main())
