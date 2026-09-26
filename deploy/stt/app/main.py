from __future__ import annotations

import os
import shutil
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

from . import engines, forward, vad

app = FastAPI(title="afrakala-stt", version="0.1.0")

DATA = Path(os.environ.get("STT_DATA_DIR", "/data"))
EVAL = Path(os.environ.get("STT_EVAL_DIR", "/eval"))
INGEST_TOKEN = os.environ.get("STT_INGEST_TOKEN", "")

SESSIONS: dict[str, dict[str, Any]] = {}
MET_CHUNKS = Counter("stt_chunks_total", "PCM chunks accepted")
MET_SEGMENTS = Counter("stt_segments_forwarded_total", "Segments posted", ["kind"])
MET_RTF = Histogram("stt_rtf", "Real-time factor", ["engine"])
MET_LIVE = Gauge("stt_live_sessions", "Open sessions")
LAT_MS = Histogram("stt_chunk_to_store_ms", "Chunk to forward latency")


def _check_ingest(authorization: str | None) -> None:
    if not INGEST_TOKEN:
        raise HTTPException(status_code=500, detail="STT_INGEST_TOKEN is not configured")
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if token != INGEST_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _session(filename: str, uniqueid: str, meta: dict[str, Any]) -> dict[str, Any]:
    key = Path(filename).name
    s = SESSIONS.get(key)
    if s is None:
        rec = None
        try:
            rec = engines.make_recognizer()
        except Exception:
            rec = None
        s = {
            "filename": key,
            "uniqueid": uniqueid,
            "pcm": bytearray(),
            "seq": 0,
            "rec": rec,
            "meta": meta,
            "t0": time.perf_counter(),
            "chunk_t0": None,
        }
        SESSIONS[key] = s
        MET_LIVE.set(len(SESSIONS))
    return s


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "vosk": engines.vosk_ready(),
        "whisper": engines.whisper_dir() is not None,
        "sessions": len(SESSIONS),
    }


@app.get("/metrics")
def metrics() -> PlainTextResponse:
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/ingest")
async def ingest(request: Request, authorization: str | None = Header(default=None)) -> JSONResponse:
    _check_ingest(authorization)
    ctype = request.headers.get("content-type", "")
    meta: dict[str, Any]
    pcm = b""
    if "application/json" in ctype:
        body = await request.json()
        meta = body if isinstance(body, dict) else {}
        raw = meta.pop("pcm_b64", None)
        if isinstance(raw, str):
            import base64

            pcm = base64.b64decode(raw)
    else:
        filename = request.headers.get("x-recording-filename", "")
        uniqueid = request.headers.get("x-recording-uniqueid", "")
        meta = {
            "recording_filename": filename,
            "recording_uniqueid": uniqueid,
            "extension": request.headers.get("x-extension"),
            "prefix": request.headers.get("x-prefix"),
            "started_at": request.headers.get("x-started-at"),
        }
        pcm = await request.body()

    filename = str(meta.get("recording_filename") or "")
    uniqueid = str(meta.get("recording_uniqueid") or "")
    if not filename or not uniqueid:
        raise HTTPException(status_code=400, detail="recording_filename and recording_uniqueid required")
    if len(pcm) == 0:
        raise HTTPException(status_code=400, detail="empty pcm")

    s = _session(filename, uniqueid, meta)
    s["pcm"].extend(pcm)
    s["chunk_t0"] = time.perf_counter()
    MET_CHUNKS.inc()

    forwarded: list[dict[str, Any]] = []
    if s["rec"] is not None and vad.has_enough_speech(bytes(s["pcm"][-16000:])):
        committed, partial = engines.vosk_accept(s["rec"], pcm)
        text = committed or partial
        kind = "committed" if committed else "partial"
        if text:
            payload = {
                "recording_filename": s["filename"],
                "recording_uniqueid": s["uniqueid"],
                "kind": kind,
                "segment_seq": s["seq"],
                "text": text,
                "engine": "vosk-fa-0.42",
                "latency_ms": int((time.perf_counter() - s["chunk_t0"]) * 1000),
                "extension": s["meta"].get("extension"),
                "prefix": s["meta"].get("prefix"),
                "started_at": s["meta"].get("started_at"),
            }
            if committed:
                s["seq"] += 1
            forwarded = await forward.post_segment(payload)
            MET_SEGMENTS.labels(kind).inc()
            LAT_MS.observe(payload["latency_ms"])

    return JSONResponse({"ok": True, "bytes": len(s["pcm"]), "forwarded": forwarded})


@app.post("/ingest/eof")
async def ingest_eof(request: Request, authorization: str | None = Header(default=None)) -> JSONResponse:
    _check_ingest(authorization)
    body = await request.json()
    filename = Path(str(body.get("recording_filename") or "")).name
    s = SESSIONS.get(filename)
    if s is None:
        raise HTTPException(status_code=404, detail="unknown session")

    pcm = bytes(s["pcm"])
    scratch = DATA / "scratch" / f"{filename}.wav"
    engines.write_wav_s16le(scratch, pcm)

    texts: list[str] = []
    if s["rec"] is not None:
        final_live = engines.vosk_final(s["rec"])
        if final_live:
            texts.append(final_live)

    rtf = 0.0
    engine = "vosk-fa-0.42"
    try:
        if engines.whisper_dir() is not None and vad.has_enough_speech(pcm):
            wtext, rtf = engines.whisper_transcribe_wav(scratch)
            if wtext:
                texts = [wtext]
                engine = "faster-whisper-int8"
            MET_RTF.labels("whisper").observe(rtf)
    except Exception as exc:  # noqa: BLE001
        wtext = ""
        engine = f"whisper_error:{type(exc).__name__}"

    text = " ".join(t for t in texts if t).strip()
    forwarded: list[dict[str, Any]] = []
    if text:
        payload = {
            "recording_filename": s["filename"],
            "recording_uniqueid": s["uniqueid"],
            "kind": "final",
            "segment_seq": 0,
            "text": text,
            "engine": engine,
            "eof": True,
            "extension": s["meta"].get("extension"),
            "prefix": s["meta"].get("prefix"),
            "started_at": s["meta"].get("started_at"),
        }
        forwarded = await forward.post_segment(payload)
        MET_SEGMENTS.labels("final").inc()

    if scratch.exists() and EVAL.resolve() not in scratch.resolve().parents:
        scratch.unlink(missing_ok=True)
    SESSIONS.pop(filename, None)
    MET_LIVE.set(len(SESSIONS))
    return JSONResponse({"ok": True, "text_len": len(text), "rtf": rtf, "forwarded": forwarded})


@app.post("/v1/audio/transcriptions")
async def openai_compat(request: Request) -> JSONResponse:
    """OpenAI-compatible stub used by messenger when WHISPER_API_URL is set."""
    form = await request.form()
    upload = form.get("file")
    if upload is None:
        raise HTTPException(status_code=400, detail="file required")
    data = await upload.read()  # type: ignore[union-attr]
    tmp = DATA / "scratch" / f"openai-{int(time.time() * 1000)}.bin"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(data)
    wav = tmp.with_suffix(".wav")
    if not str(tmp).endswith(".wav"):
        # leave as-is; faster-whisper accepts many containers via ffmpeg
        wav = tmp
    try:
        text, rtf = engines.whisper_transcribe_wav(Path(wav))
    finally:
        tmp.unlink(missing_ok=True)
        if wav != tmp:
            Path(wav).unlink(missing_ok=True)
    return JSONResponse({"text": text, "rtf": rtf})
