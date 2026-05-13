#!/usr/bin/env bash
# AfraKala — local self-host: healthcheck سرویس‌های لپ‌تاپ
set -uo pipefail

pass=0; fail=0
check() {
  local label="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$url" || echo "000")
  if [ "$code" = "$expect" ] || { [ "$expect" = "2xx" ] && [[ "$code" =~ ^2 ]]; }; then
    printf "  [OK]   %-22s %s (HTTP %s)\n" "$label" "$url" "$code"
    pass=$((pass+1))
  else
    printf "  [FAIL] %-22s %s (HTTP %s)\n" "$label" "$url" "$code"
    fail=$((fail+1))
  fi
}

echo "[healthcheck] بررسی local stack..."
check "web /api/healthz"  "http://localhost:3000/api/healthz" "200"
check "web /"             "http://localhost:3000/"            "2xx"
check "kong (API root)"   "http://localhost:8000/"            "2xx"
check "auth health"       "http://localhost:8000/auth/v1/health" "200"
check "rest root"         "http://localhost:8000/rest/v1/"    "2xx"
check "studio"            "http://localhost:3001/"            "2xx"

echo "[healthcheck] passed=$pass failed=$fail"
# توجه: برخی endpointها بدون apikey ممکن است 401 برگردانند که در local طبیعی است.
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)