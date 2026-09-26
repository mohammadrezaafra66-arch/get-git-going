#!/bin/bash
# Rocky 8 retest: platform-python, env token (not argv), chown offsets, %CPU + RSS.
set -eu
PY=/usr/libexec/platform-python
"$PY" --version
if ! command -v ps >/dev/null 2>&1; then
  yum install -y procps-ng >/dev/null
fi
id asterisk >/dev/null 2>&1 || useradd -r -s /sbin/nologin asterisk
mkdir -p /var/lib/afrakala-stt /etc/afrakala-stt /tmp/spool/2026/09/26
chown -R asterisk:asterisk /var/lib/afrakala-stt
printf '%s\n' \
  'STT_INGEST_TOKEN=dummy-rocky-token-not-a-secret' \
  'STT_URL=http://127.0.0.1:8099' \
  'STT_STATE=/var/lib/afrakala-stt/offsets.json' \
  'STT_SPOOL=/var/lib/afrakala-stt/spool' \
  > /etc/afrakala-stt/capture.env
chmod 640 /etc/afrakala-stt/capture.env
chown asterisk:asterisk /etc/afrakala-stt/capture.env
"$PY" - <<'PY' &
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
# ExecStart equivalent: no token on argv. EnvironmentFile is sourced by the shell.
runuser -u asterisk -- /bin/bash -c 'set -a; . /etc/afrakala-stt/capture.env; set +a; exec /usr/libexec/platform-python /opt/capture_agent.py --watch /tmp/spool --url "$STT_URL" --state "$STT_STATE" --spool "$STT_SPOOL" --interval 0.2 --inactivity 8' &
sleep 1
AGENT=""
for p in /proc/[0-9]*; do
  if [ ! -f "$p/cmdline" ]; then
    continue
  fi
  cmd=$(tr '\0' ' ' < "$p/cmdline")
  case "$cmd" in
    /usr/libexec/platform-python\ /opt/capture_agent.py*)
      AGENT=${p#/proc/}
      break
      ;;
  esac
done
if [ -z "$AGENT" ] || [ ! -d /proc/$AGENT ]; then
  echo "AGENT_DIED"
  exit 1
fi
CMDLINE=$(tr '\0' ' ' < /proc/$AGENT/cmdline)
echo "AGENT_PID=$AGENT"
echo "CMDLINE=$CMDLINE"
if echo "$CMDLINE" | grep -q "dummy-rocky-token-not-a-secret"; then
  TOKEN_ON_CMDLINE=yes
else
  TOKEN_ON_CMDLINE=no
fi
echo "TOKEN_ON_CMDLINE=$TOKEN_ON_CMDLINE"
echo "PS_BEFORE=$(ps -p $AGENT -o pid,pcpu,rss,cmd --no-headers 2>/dev/null || true)"
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
        for _ in range(8):
            fh.write(b"\x00" * 32768)
            fh.flush()
            time.sleep(0.2)
time.sleep(1)
PY
HZ=$(getconf CLK_TCK)
read UT_A ST_A <<EOF
$(awk '{print $14, $15}' /proc/$AGENT/stat)
EOF
sleep 4
read UT_B ST_B <<EOF
$(awk '{print $14, $15}' /proc/$AGENT/stat)
EOF
TICKS=$((UT_B - UT_A + ST_B - ST_A))
CPU_PCT=$(awk -v t="$TICKS" -v hz="$HZ" -v e="4" 'BEGIN{printf "%.3f", (t/hz)/e*100}')
RSS_KB=$(awk '/VmRSS/ {print $2}' /proc/$AGENT/status)
RSS_MB=$(awk -v k="$RSS_KB" 'BEGIN{printf "%.2f", k/1024}')
echo "CPU_PCT=$CPU_PCT"
echo "RSS_KB=$RSS_KB"
echo "RSS_MB=$RSS_MB"
echo "PS_AFTER=$(ps -p $AGENT -o pid,pcpu,rss,cmd --no-headers 2>/dev/null || true)"
if [ -f /var/lib/afrakala-stt/offsets.json ]; then
  echo "OFFSET_WRITTEN=yes"
  echo "OFFSET_BYTES=$(wc -c < /var/lib/afrakala-stt/offsets.json)"
  ls -l /var/lib/afrakala-stt/offsets.json
else
  echo "OFFSET_WRITTEN=no"
fi
kill $AGENT || true
echo "TOKEN_ON_CMDLINE=$TOKEN_ON_CMDLINE"
echo ROCKY_RETEST_DONE
