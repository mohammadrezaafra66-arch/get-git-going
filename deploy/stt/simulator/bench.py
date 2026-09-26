#!/usr/bin/env python3
"""G3 bench: A4 silence/noise, RTF at 1/6/8 streams, optional WER from eval pairs."""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from grow_wav import noise, silence  # noqa: E402


def _env_token() -> str:
    return os.environ.get("STT_INGEST_TOKEN", "")


def post_json(url: str, token: str, payload: dict, timeout: float = 120) -> tuple[int, dict]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.getcode(), json.loads(raw.decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            parsed = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            parsed = {"error": "http"}
        return exc.code, parsed


def ingest_pcm(base: str, token: str, filename: str, uniqueid: str, pcm: bytes) -> dict:
    payload = {
        "recording_filename": filename,
        "recording_uniqueid": uniqueid,
        "pcm_b64": base64.b64encode(pcm).decode("ascii"),
        "extension": "403",
        "prefix": "exten",
    }
    code, body = post_json(base.rstrip("/") + "/ingest", token, payload)
    return {"http": code, "body": body}


def ingest_eof(base: str, token: str, filename: str, uniqueid: str) -> dict:
    code, body = post_json(
        base.rstrip("/") + "/ingest/eof",
        token,
        {"recording_filename": filename, "recording_uniqueid": uniqueid},
        timeout=300,
    )
    return {"http": code, "body": body}


def one_stream(base: str, token: str, kind: str, seconds: float, idx: int) -> dict:
    pcm = silence(seconds) if kind == "silence" else noise(seconds, seed=idx + 1)
    stamp = int(time.time() * 1000)
    filename = f"exten-403-09{idx:02d}-{time.strftime('%Y%m%d')}-000000-{stamp}.{idx}.wav"
    uniqueid = f"{stamp}.{idx}"
    t0 = time.perf_counter()
    live = ingest_pcm(base, token, filename, uniqueid, pcm)
    eof = ingest_eof(base, token, filename, uniqueid)
    elapsed = time.perf_counter() - t0
    forwarded = []
    if isinstance(live.get("body"), dict):
        forwarded.extend(live["body"].get("forwarded") or [])
    if isinstance(eof.get("body"), dict):
        forwarded.extend(eof["body"].get("forwarded") or [])
    rtf = None
    if isinstance(eof.get("body"), dict) and eof["body"].get("rtf") is not None:
        rtf = float(eof["body"]["rtf"])
    return {
        "kind": kind,
        "idx": idx,
        "seconds": seconds,
        "elapsed": round(elapsed, 3),
        "rtf": rtf,
        "live_http": live["http"],
        "eof_http": eof["http"],
        "forwarded_n": len(forwarded),
        "text_len": (eof.get("body") or {}).get("text_len"),
    }


def wer(ref: str, hyp: str) -> float:
    r = ref.split()
    h = hyp.split()
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


def eval_pairs(eval_dir: Path) -> list[tuple[Path, str]]:
    pairs = []
    if not eval_dir.is_dir():
        return pairs
    for wav in sorted(eval_dir.glob("*.wav")):
        txt = wav.with_suffix(".txt")
        if txt.is_file():
            pairs.append((wav, txt.read_text(encoding="utf-8").strip()))
    return pairs


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=os.environ.get("STT_URL", "http://192.168.170.8:8090"))
    p.add_argument("--token", default=_env_token())
    p.add_argument("--eval", default="D:/afrakala-stt/eval")
    p.add_argument("--out", default="D:/AfraKalaTest/wt-call-transcription/docs/missions/call-transcription/g3-bench.json")
    args = p.parse_args()
    if not args.token:
        print("STT_INGEST_TOKEN missing", file=sys.stderr)
        return 2

    health = urllib.request.urlopen(args.url.rstrip("/") + "/health", timeout=10).read()
    health_j = json.loads(health.decode("utf-8"))

    a4 = {
        "silence": one_stream(args.url, args.token, "silence", 4.0, 1),
        "noise": one_stream(args.url, args.token, "noise", 4.0, 2),
    }

    rtf_rows = {}
    for conc in (1, 6, 8):
        t0 = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=conc) as ex:
            futs = [
                ex.submit(one_stream, args.url, args.token, "noise", 6.0, 100 + i)
                for i in range(conc)
            ]
            rows = [f.result() for f in futs]
        wall = time.perf_counter() - t0
        rtfs = [r["rtf"] for r in rows if isinstance(r.get("rtf"), (int, float))]
        rtf_rows[str(conc)] = {
            "wall_s": round(wall, 3),
            "rtf_mean": round(statistics.mean(rtfs), 3) if rtfs else None,
            "rtf_max": round(max(rtfs), 3) if rtfs else None,
            "rows": rows,
        }

    wers = []
    for wav, ref in eval_pairs(Path(args.eval)):
        pcm = wav.read_bytes()
        if pcm[:4] == b"RIFF" and len(pcm) > 44:
            pcm = pcm[44:]
        stamp = int(time.time() * 1000)
        filename = f"eval-{wav.stem}-{stamp}.wav"
        uniqueid = f"eval.{stamp}"
        ingest_pcm(args.url, args.token, filename, uniqueid, pcm)
        eof = ingest_eof(args.url, args.token, filename, uniqueid)
        hyp = ""
        body = eof.get("body") or {}
        # text itself is not returned; WER needs eval-side transcript file from hook later
        wers.append(
            {
                "wav": wav.name,
                "ref_words": len(ref.split()),
                "eof_http": eof["http"],
                "text_len": body.get("text_len"),
                "rtf": body.get("rtf"),
                "note": "hypothesis text stays in DB; pair txt is reference only",
                "wer": None,
            }
        )

    report = {
        "health": health_j,
        "a4": a4,
        "a4_pass": a4["silence"]["forwarded_n"] == 0 and a4["noise"]["forwarded_n"] == 0,
        "rtf": rtf_rows,
        "wer": wers,
        "engine_rule": {
            "live": "vosk if whisper RTF at 8 streams > 0.5 else whisper",
            "final": "whisper if present else vosk",
        },
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": args.out, "a4_pass": report["a4_pass"], "health": health_j}, ensure_ascii=False))
    return 0 if report["a4_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
