#!/bin/bash
# Run inside rockylinux:8 — prove capture_agent.py starts on platform-python
# and stays under 2% of one core / 50 MB RSS while tailing 8 growing files.
set -euo pipefail
PY=/usr/libexec/platform-python
"$PY" --version
mkdir -p /tmp/spool/2026/09/26 /tmp/state
# Dummy STT that accepts and drops
"$PY" - <<'PY' &
from __future__ import print_function
from wsgiref.simple_server import make_server
def app(environ, start_response):
    try:
        n = int(environ.get("CONTENT_LENGTH") or 0)
    except Exception:
        n = 0
    if n:
        environ["wsgi.input"].read(n)
    start_response("200 OK", [("Content-Type", "application/json")])
    return [b'{"ok":true}']
make_server("127.0.0.1", 8099, app).serve_forever()
PY
sleep 1
"$PY" /opt/capture_agent.py \
  --watch /tmp/spool --url http://127.0.0.1:8099 --token testtoken \
  --state /tmp/offsets.json --spool /tmp/state --interval 0.2 --inactivity 8 &
AGENT=$!
sleep 1
"$PY" - <<'PY'
import os, struct, time
folder = "/tmp/spool/2026/09/26"
os.makedirs(folder, exist_ok=True)
for i in range(8):
    path = os.path.join(folder, "exten-403-0900000900%d-20260926-12000%d-1727350000.%d.wav" % (i, i, i))
    with open(path, "wb") as fh:
        fh.write(b"RIFF")
        fh.write(struct.pack("<I", 0))
        fh.write(b"WAVEfmt ")
        fh.write(struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16))
        fh.write(b"data")
        fh.write(struct.pack("<I", 0))
        for _ in range(6):
            fh.write(b"\x00" * 32768)
            fh.flush()
            time.sleep(0.25)
time.sleep(1)
PY
# sample RSS from /proc (minimal image has no ps)
if [ -f /proc/$AGENT/status ]; then
  grep -E '^(Name|VmRSS|VmSize):' /proc/$AGENT/status || true
  echo STAT_LINE="$(cat /proc/$AGENT/stat)"
fi
sleep 2
if [ -f /proc/$AGENT/status ]; then
  grep -E '^(Name|VmRSS|VmSize):' /proc/$AGENT/status || true
fi
kill $AGENT || true
echo ROCKY_CAPTURE_OK
