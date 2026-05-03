#!/usr/bin/env bash
# AfraKala — توابع مشترک backup/restore
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"

load_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ERROR] env file not found: ${ENV_FILE}" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a; source "${ENV_FILE}"; set +a
}

ts() { date -u +%Y%m%d-%H%M%S; }
today() { date -u +%Y-%m-%d; }

ensure_dir() { mkdir -p "$1"; chmod 700 "$1" || true; }

is_dry() { [[ "${DRY_RUN:-true}" == "true" ]]; }

log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[ERROR] required env missing: ${name}" >&2
    exit 1
  fi
}

# جلوگیری از حذف خطرناک
safe_under() {
  local root="$1" path="$2"
  case "${root}" in /|""|"/ ") echo "[ERROR] unsafe BACKUP_ROOT: '${root}'" >&2; exit 1 ;; esac
  case "${path}" in "${root}"/*) return 0 ;; *) echo "[ERROR] path '${path}' not under '${root}'" >&2; exit 1 ;; esac
}