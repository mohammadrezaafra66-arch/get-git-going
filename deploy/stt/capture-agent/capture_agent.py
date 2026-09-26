#!/usr/bin/env python3
# Capture agent: stdlib only, Python 3.6 compatible (Rocky 8 platform-python).
# Read-only tail of growing Asterisk WAVs. Never writes recordings.

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

TEHRAN = timezone(timedelta(hours=3, minutes=30))
HEADER = 44
STATE_DEFAULT = "/var/lib/afrakala-stt/offsets.json"
SPOOL_DEFAULT = "/var/lib/afrakala-stt/spool"
MAX_SPOOL_BYTES = 32 * 1024 * 1024
ALLOWED = ("exten-", "out-", "q-")
SKIP_EXT = (".gsm",)


def tehran_now():
    return datetime.now(TEHRAN)


def monitor_dir(root):
    now = tehran_now()
    return os.path.join(root, now.strftime("%Y"), now.strftime("%m"), now.strftime("%d"))


def parse_name(basename):
    if basename.lower().endswith(".gsm"):
        return None
    if not basename.lower().endswith(".wav"):
        return None
    stem = basename[:-4]
    parts = stem.split("-")
    if len(parts) < 6:
        return None
    prefix = parts[0].lower()
    if prefix == "internal":
        return None
    if not basename.startswith(ALLOWED) and prefix not in ("exten", "out", "q"):
        return None
    uniqueid = parts[-1]
    extension = None
    if prefix == "exten" and len(parts) > 1:
        extension = parts[1]
    elif prefix == "out" and len(parts) > 2:
        extension = parts[2]
    return {
        "filename": basename,
        "uniqueid": uniqueid,
        "extension": extension,
        "prefix": prefix,
    }


def load_state(path):
    try:
        with open(path, "r") as fh:
            return json.load(fh)
    except (IOError, ValueError):
        return {"files": {}}


def save_state(path, state):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(state, fh)
    os.replace(tmp, path)


def post_chunk(url, token, meta, pcm, timeout=10):
    req = urllib.request.Request(url.rstrip("/") + "/ingest", data=pcm, method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("X-Recording-Filename", meta["filename"])
    req.add_header("X-Recording-Uniqueid", meta["uniqueid"])
    if meta.get("extension"):
        req.add_header("X-Extension", meta["extension"])
    if meta.get("prefix"):
        req.add_header("X-Prefix", meta["prefix"])
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode(), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError:
        return 0, b""


def post_eof(url, token, meta, timeout=10):
    body = json.dumps(
        {
            "recording_filename": meta["filename"],
            "recording_uniqueid": meta["uniqueid"],
        }
    ).encode("utf-8")
    req = urllib.request.Request(url.rstrip("/") + "/ingest/eof", data=body, method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode()
    except (urllib.error.HTTPError, urllib.error.URLError):
        return 0


def spool_write(spool_dir, name, pcm):
    if not os.path.isdir(spool_dir):
        os.makedirs(spool_dir)
    total = 0
    for fn in os.listdir(spool_dir):
        fp = os.path.join(spool_dir, fn)
        if os.path.isfile(fp):
            total += os.path.getsize(fp)
    if total + len(pcm) > MAX_SPOOL_BYTES:
        return
    with open(os.path.join(spool_dir, name + ".part"), "ab") as fh:
        fh.write(pcm)


def drain_spool(spool_dir, url, token):
    if not os.path.isdir(spool_dir):
        return
    for fn in sorted(os.listdir(spool_dir)):
        if not fn.endswith(".part"):
            continue
        path = os.path.join(spool_dir, fn)
        meta = parse_name(fn[:-5] + ".wav") or parse_name(fn[:-5])
        if not meta:
            try:
                os.remove(path)
            except OSError:
                pass
            continue
        with open(path, "rb") as fh:
            pcm = fh.read()
        code, _ = post_chunk(url, token, meta, pcm)
        if code and 200 <= code < 300:
            try:
                os.remove(path)
            except OSError:
                pass


def tail_once(watch_root, state, url, token, inactivity, spool_dir):
    folder = monitor_dir(watch_root)
    if not os.path.isdir(folder):
        return
    now = time.time()
    names = os.listdir(folder)
    for name in names:
        if name.lower().endswith(SKIP_EXT):
            continue
        meta = parse_name(name)
        if not meta:
            continue
        path = os.path.join(folder, name)
        try:
            st = os.stat(path)
        except OSError:
            continue
        rec = state["files"].get(name) or {"offset": HEADER, "closed": False, "mtime": st.st_mtime}
        if rec.get("closed"):
            continue
        offset = max(int(rec.get("offset") or HEADER), HEADER)
        if st.st_size > offset:
            try:
                with open(path, "rb") as fh:
                    fh.seek(offset)
                    pcm = fh.read()
            except OSError:
                continue
            if pcm:
                code, _ = post_chunk(url, token, meta, pcm)
                if code and 200 <= code < 300:
                    rec["offset"] = offset + len(pcm)
                else:
                    spool_write(spool_dir, name, pcm)
                    rec["offset"] = offset + len(pcm)
        elif now - st.st_mtime >= inactivity and st.st_size >= HEADER:
            post_eof(url, token, meta)
            rec["closed"] = True
        rec["mtime"] = st.st_mtime
        state["files"][name] = rec


def main(argv=None):
    p = argparse.ArgumentParser(description="AfraKala Phase A capture agent")
    p.add_argument("--watch", default="/var/spool/asterisk/monitor")
    p.add_argument("--url", default=os.environ.get("STT_URL", "http://192.168.170.8:8090"))
    # Token is read from the environment. --token exists only for local tests;
    # systemd ExecStart must not pass it (visible in ps).
    p.add_argument("--token", default="", help="optional; prefer STT_INGEST_TOKEN env")
    p.add_argument("--state", default=os.environ.get("STT_STATE", STATE_DEFAULT))
    p.add_argument("--spool", default=os.environ.get("STT_SPOOL", SPOOL_DEFAULT))
    p.add_argument("--interval", type=float, default=0.5)
    p.add_argument("--inactivity", type=float, default=20.0)
    args = p.parse_args(argv)
    if not args.token:
        args.token = os.environ.get("STT_INGEST_TOKEN", "")
    if not args.token:
        sys.stderr.write("STT_INGEST_TOKEN missing\n")
        return 2
    state = load_state(args.state)
    while True:
        try:
            drain_spool(args.spool, args.url, args.token)
            tail_once(args.watch, state, args.url, args.token, args.inactivity, args.spool)
            save_state(args.state, state)
        except Exception as exc:  # noqa: BLE001 — never crash the agent
            sys.stderr.write("agent error: %s\n" % exc)
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main() or 0)
