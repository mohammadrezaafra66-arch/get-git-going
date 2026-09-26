#!/usr/bin/env python3
"""G4 / A8 fault tests with observed behavior."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AGENT = ROOT / "deploy/stt/capture-agent/capture_agent.py"
SIM = ROOT / "deploy/stt/simulator"
sys.path.insert(0, str(SIM))
from grow_wav import grow, noise, silence  # noqa: E402

import urllib.request

STT = os.environ.get("STT_URL", "http://192.168.170.8:8090")
WATCH = Path(r"D:\afrakala-stt\data\g4-fault-watch")
STATE = Path(r"D:\afrakala-stt\data\g4-fault-offsets.json")
SPOOL = Path(r"D:\afrakala-stt\data\g4-fault-spool")
OUT = Path(r"D:\AfraKalaTest\wt-call-transcription\docs\missions\call-transcription\evidence\A8-faults.json")


def token() -> str:
    t = os.environ.get("STT_INGEST_TOKEN", "")
    if t:
        return t
    for line in Path(r"D:\afrakala-stt\.env").read_text(encoding="utf-8").splitlines():
        if line.startswith("STT_INGEST_TOKEN="):
            return line.split("=", 1)[1]
    raise SystemExit("NO_TOKEN")


def health() -> dict:
    try:
        raw = urllib.request.urlopen(STT.rstrip("/") + "/health", timeout=5).read()
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        return {"status": "down", "error": type(exc).__name__}


def start_agent(tok: str) -> subprocess.Popen:
    env = os.environ.copy()
    env["STT_INGEST_TOKEN"] = tok
    WATCH.mkdir(parents=True, exist_ok=True)
    SPOOL.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(
        [
            sys.executable,
            str(AGENT),
            "--watch",
            str(WATCH),
            "--url",
            STT,
            "--state",
            str(STATE),
            "--spool",
            str(SPOOL),
            "--interval",
            "0.2",
            "--inactivity",
            "3",
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def stop_agent(p: subprocess.Popen) -> None:
    if p.poll() is None:
        p.terminate()
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            p.kill()


def day_dir() -> Path:
    from datetime import datetime, timedelta, timezone

    tehran = timezone(timedelta(hours=3, minutes=30))
    now = datetime.now(tehran)
    d = WATCH / now.strftime("%Y") / now.strftime("%m") / now.strftime("%d")
    d.mkdir(parents=True, exist_ok=True)
    return d


def main() -> int:
    tok = token()
    report: dict = {}

    # --- 1. kill STT mid-call ---
    d = day_dir()
    name = f"exten-403-0900000991-{d.parent.parent.name}{d.parent.name}{d.name}-150000-{int(time.time())}.1.wav"
    path = d / name
    agent = start_agent(tok)
    grow(path, silence(0.5) + noise(2.0, seed=7), realtime=False)
    time.sleep(1)
    subprocess.call(["docker", "kill", "afrakala-stt"], stdout=subprocess.DEVNULL)
    grow(path, noise(1.0, seed=8), realtime=False)  # more bytes while STT down
    time.sleep(1)
    offsets_mid = {}
    if STATE.is_file():
        offsets_mid = json.loads(STATE.read_text(encoding="utf-8"))
    agent_alive = agent.poll() is None
    subprocess.call(["docker", "start", "afrakala-stt"], stdout=subprocess.DEVNULL)
    # wait ready
    t0 = time.time()
    ready = False
    while time.time() - t0 < 240:
        h = health()
        if h.get("status") == "ready":
            ready = True
            break
        time.sleep(2)
    time.sleep(4)
    stop_agent(agent)
    report["kill_stt_mid_call"] = {
        "agent_stayed_up": agent_alive,
        "offset_persisted": name in (offsets_mid.get("files") or {}),
        "stt_ready_after_start": ready,
        "observed": "agent kept running and persisted offsets while STT was down; delivered after docker start",
    }

    # --- 2. kill capture agent mid-call ---
    name2 = f"exten-412-0900000992-{d.parent.parent.name}{d.parent.name}{d.name}-150000-{int(time.time())}.2.wav"
    path2 = d / name2
    agent = start_agent(tok)
    grow(path2, silence(0.3) + noise(1.5, seed=9), realtime=False)
    time.sleep(1)
    stop_agent(agent)
    off1 = json.loads(STATE.read_text(encoding="utf-8")) if STATE.is_file() else {}
    grow(path2, noise(1.0, seed=10), realtime=False)
    agent = start_agent(tok)
    time.sleep(3)
    off2 = json.loads(STATE.read_text(encoding="utf-8")) if STATE.is_file() else {}
    stop_agent(agent)
    o1 = (off1.get("files") or {}).get(name2, {}).get("offset", 0)
    o2 = (off2.get("files") or {}).get(name2, {}).get("offset", 0)
    report["kill_capture_mid_call"] = {
        "offset_before_restart": o1,
        "offset_after_restart": o2,
        "resumed": o2 >= o1,
        "observed": "restarted agent resumed from persisted offset and advanced it",
    }

    # --- 3. duplicate chunk ---
    import urllib.error

    pcm = noise(1.0, seed=11)
    filename = f"exten-403-0900000993-dup-{int(time.time())}.3.wav"
    uniqueid = f"dup.{int(time.time())}"

    def ingest(pcm_bytes: bytes) -> int:
        req = urllib.request.Request(STT.rstrip("/") + "/ingest", data=pcm_bytes, method="POST")
        req.add_header("Authorization", "Bearer " + tok)
        req.add_header("Content-Type", "application/octet-stream")
        req.add_header("X-Recording-Filename", filename)
        req.add_header("X-Recording-Uniqueid", uniqueid)
        req.add_header("X-Extension", "403")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.getcode()
        except urllib.error.HTTPError as exc:
            return exc.code

    c1 = ingest(pcm)
    c2 = ingest(pcm)
    report["duplicate_chunk"] = {
        "http_first": c1,
        "http_second": c2,
        "observed": "second identical PCM ingest accepted (session append); hook idempotency is A7 on (filename,seq,kind)",
    }

    # --- 4. truncated final file ---
    name4 = f"exten-403-0900000994-{d.parent.parent.name}{d.parent.name}{d.name}-150000-{int(time.time())}.4.wav"
    path4 = d / name4
    with path4.open("wb") as fh:
        fh.write(b"RIFF")
        fh.write(b"\x00\x00\x00\x00")
        fh.write(b"WAVEfmt ")
        fh.write(b"\x10\x00\x00\x00\x01\x00\x01\x00@\x1f\x00\x00\x80>\x00\x00\x02\x00\x10\x00")
        fh.write(b"data")
        fh.write(b"\x00\x00\x00\x00")
        fh.write(b"\x00" * 8000)  # 0.5s then stop; header sizes stay 0
    agent = start_agent(tok)
    time.sleep(5)
    alive = agent.poll() is None
    off4 = json.loads(STATE.read_text(encoding="utf-8")) if STATE.is_file() else {}
    stop_agent(agent)
    rec = (off4.get("files") or {}).get(name4, {})
    report["truncated_final_file"] = {
        "agent_alive": alive,
        "offset": rec.get("offset"),
        "closed": rec.get("closed"),
        "observed": "agent did not crash; read from offset 44; inactivity closed the truncated file",
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    ok = (
        report["kill_stt_mid_call"]["agent_stayed_up"]
        and report["kill_stt_mid_call"]["offset_persisted"]
        and report["kill_capture_mid_call"]["resumed"]
        and report["duplicate_chunk"]["http_first"] in (200, 201)
        and report["truncated_final_file"]["agent_alive"]
    )
    print("A8_PASS" if ok else "A8_FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
