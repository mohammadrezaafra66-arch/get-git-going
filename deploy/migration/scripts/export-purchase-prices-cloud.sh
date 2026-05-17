#!/usr/bin/env bash
# AfraKala — Phase 3/B2 / Task AFRA-20260517-PURCHASE-PRICES-U02-S02
# Export purchase-price bundle CSVs (suppliers, price_change_reasons,
# purchase_prices) from Cloud Postgres to a timestamped dump dir.
#
# Mirrors export-products-cloud.sh:
#   - Explicit column lists (no SELECT *).
#   - DRY_RUN=true by default (no IO).
#   - Output goes under deploy/migration/dumps/ which is gitignored.
#   - No secret is written to the repo; reads env from deploy/migration/.env.
#
# Tables exported (in this order):
#   public.suppliers
#   public.price_change_reasons
#   public.purchase_prices
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"
DUMP_DIR="${DUMP_DIR:-${SCRIPT_DIR}/../dumps}"
DRY_RUN="${DRY_RUN:-true}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${SOURCE_DB_HOST:?SOURCE_DB_HOST required}"
: "${SOURCE_DB_PORT:?SOURCE_DB_PORT required}"
: "${SOURCE_DB_NAME:?SOURCE_DB_NAME required}"
: "${SOURCE_DB_USER:?SOURCE_DB_USER required}"
: "${SOURCE_DB_PASSWORD:?SOURCE_DB_PASSWORD required}"

TS="$(date -u +%Y%m%d-%H%M%S)"
OUT_DIR="${DUMP_DIR}/pp-${TS}"
mkdir -p "${OUT_DIR}"
chmod 700 "${DUMP_DIR}" || true

SUPPLIERS_COLS="id,name,phone,email,address,contact_name,city,notes,trust_level,is_active,status,created_by,created_at,updated_at"
REASONS_COLS="id,title,description,is_active,created_at,updated_at"
# currency cast to text so the CSV stays portable; SQL casts back to enum on import.
PP_COLS="id,product_id,supplier_id,purchase_price,currency::text AS currency,effective_at,expires_at,reason_id,private_note,registered_by,is_active,created_at,updated_at"

run_copy() {
  local table="$1" cols="$2" out="$3"
  echo "[export] ${table} -> ${out}"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  (dry-run) skipped"
    return 0
  fi
  PGPASSWORD="${SOURCE_DB_PASSWORD}" psql \
    -h "${SOURCE_DB_HOST}" -p "${SOURCE_DB_PORT}" \
    -U "${SOURCE_DB_USER}" -d "${SOURCE_DB_NAME}" \
    --set ON_ERROR_STOP=1 \
    -c "\\COPY (SELECT ${cols} FROM ${table} ORDER BY id) TO '${out}' WITH (FORMAT csv, HEADER true)"
}

echo "Source : ${SOURCE_DB_USER}@${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME}"
echo "Output : ${OUT_DIR}"
echo "DryRun : ${DRY_RUN}"
echo

run_copy "public.suppliers"            "${SUPPLIERS_COLS}" "${OUT_DIR}/suppliers.csv"
run_copy "public.price_change_reasons" "${REASONS_COLS}"   "${OUT_DIR}/price_change_reasons.csv"
run_copy "public.purchase_prices"      "${PP_COLS}"        "${OUT_DIR}/purchase_prices.csv"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo
  echo "[dry-run] برای اجرای واقعی: DRY_RUN=false $0"
else
  # SHA-256 manifest for transfer integrity.
  ( cd "${OUT_DIR}" && sha256sum *.csv > SHA256SUMS.txt )
  echo
  echo "[done] CSVها در ${OUT_DIR}"
  cat "${OUT_DIR}/SHA256SUMS.txt"
  echo
  echo "گام بعدی: انتقال امن این پوشه به سرور LAN و اجرای import-purchase-prices-staged.ps1 در حالت dry-run"
fi