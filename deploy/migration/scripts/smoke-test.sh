#!/usr/bin/env bash
# AfraKala — smoke test پس از مهاجرت
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"
if [[ -f "${ENV_FILE}" ]]; then set -a; source "${ENV_FILE}"; set +a; fi

APP_URL="${APP_URL:-https://app.afrakala.ir}"
API_URL="${TARGET_SUPABASE_URL:-https://api.afrakala.ir}"
TIMEOUT="${TIMEOUT:-15}"

check() {
  local name="$1" url="$2" expect="${3:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT}" "${url}" || echo 000)
  if [[ "${code}" == "${expect}" || ( "${expect}" == "2xx" && "${code}" =~ ^2 ) ]]; then
    echo "[OK]   ${name}: ${url} → ${code}"
  else
    echo "[FAIL] ${name}: ${url} → ${code}"; FAIL=1
  fi
}

FAIL=0
check "app health"     "${APP_URL}/api/healthz"            "2xx"
check "auth health"    "${API_URL}/auth/v1/health"         "2xx"
check "rest root"      "${API_URL}/rest/v1/"               "2xx"
check "storage health" "${API_URL}/storage/v1/health"      "2xx"

exit "${FAIL}"