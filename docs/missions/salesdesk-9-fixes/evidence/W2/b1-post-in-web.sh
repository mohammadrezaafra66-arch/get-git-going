#!/bin/sh
# In-container B1 POST helper — token stays in web container env; never echoed.
# Usage: docker cp ... && docker exec afrakala-lan-web sh /tmp/b1-post-in-web.sh
set -eu
BASE="${HOOK_BASE:-http://127.0.0.1:3100}"
PHONE="${PHONE:-09000000101}"
EXT_A="${EXT_A:-401}"
EXT_B="${EXT_B:-412}"
TS="$(date +%s)000"
LINKEDID="${LINKEDID:-TEST-9FIX-B1-$TS}"
EVENT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -z "${ISSABEL_IMPORT_WORKER_TOKEN:-}" ]; then
  echo "ERR=token_missing"
  exit 2
fi
echo "TOKEN_SET=yes TOKEN_LEN=${#ISSABEL_IMPORT_WORKER_TOKEN}"
echo "LINKEDID=$LINKEDID EXT_A=$EXT_A EXT_B=$EXT_B PHONE=$PHONE BASE=$BASE"

# Map check
curl -sS -o /tmp/b1-map.json -w "MAP_HTTP=%{http_code}\n" \
  -H "Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}" \
  "$BASE/api/public/hooks/issabel-ami-ring"
node -e 'const j=require("/tmp/b1-map.json"); const e=j.extensions||[]; console.log(JSON.stringify({ok:j.ok,ext_count:e.length,has_401:e.includes("401"),has_412:e.includes("412"),sample:e.slice(0,20)}));'

post_one() {
  EXT="$1"
  UID="$2"
  BODY=$(node -e "console.log(JSON.stringify({extension:process.argv[1],callerNumber:process.argv[2],linkedid:process.argv[3],uniqueid:process.argv[4],eventAt:process.argv[5],source:'manual',direction:'inbound',raw:{marker:'[TEST-9FIX]',probe:'B1',ext:process.argv[1]}}))" "$EXT" "$PHONE" "$LINKEDID" "$UID" "$EVENT_AT")
  OUT="/tmp/b1-post-$EXT.json"
  CODE=$(curl -sS -o "$OUT" -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${ISSABEL_IMPORT_WORKER_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    "$BASE/api/public/hooks/issabel-ami-ring")
  node -e 'const j=require(process.argv[1]); console.log(JSON.stringify({extension:process.argv[2],http:Number(process.argv[3]),ok:j.ok,id:j.id||null,duplicate:!!j.duplicate,employee_present:!!j.employee_id,error:j.error||null,message:j.message||null}))' "$OUT" "$EXT" "$CODE"
}

post_one "$EXT_A" "${LINKEDID}-a"
post_one "$EXT_B" "${LINKEDID}-b"

# Persist linkedid for host-side group/cleanup
printf '%s\n' "$LINKEDID" > /tmp/b1-linkedid.txt
echo "WROTE_LINKEDID_FILE=/tmp/b1-linkedid.txt"
