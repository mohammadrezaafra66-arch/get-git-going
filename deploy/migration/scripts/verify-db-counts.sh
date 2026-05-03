#!/usr/bin/env bash
# AfraKala — مقایسه COUNT(*) جداول کلیدی بین source و target
# اگر جدول وجود نداشت warning می‌دهد و ادامه می‌دهد.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] env file not found: ${ENV_FILE}" >&2; exit 1
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${SOURCE_DB_HOST:?}"; : "${SOURCE_DB_PASSWORD:?}"
: "${TARGET_DB_HOST:?}"; : "${TARGET_DB_PASSWORD:?}"

TABLES=(
  profiles user_roles products purchase_prices currency_rates
  sale_price_types pricing_rules product_sale_price_history
  payment_receipts payment_receipt_documents audit_logs
)

count() {
  local host="$1" port="$2" user="$3" db="$4" pass="$5" table="$6"
  PGPASSWORD="${pass}" psql -At -h "${host}" -p "${port}" -U "${user}" -d "${db}" \
    -c "SELECT COUNT(*) FROM public.${table};" 2>/dev/null || echo "N/A"
}

printf "%-40s %12s %12s %s\n" "TABLE" "SOURCE" "TARGET" "STATUS"
printf -- "------------------------------------------------------------------------------\n"
for t in "${TABLES[@]}"; do
  s=$(count "${SOURCE_DB_HOST}" "${SOURCE_DB_PORT}" "${SOURCE_DB_USER}" "${SOURCE_DB_NAME}" "${SOURCE_DB_PASSWORD}" "$t")
  d=$(count "${TARGET_DB_HOST}" "${TARGET_DB_PORT}" "${TARGET_DB_USER}" "${TARGET_DB_NAME}" "${TARGET_DB_PASSWORD}" "$t")
  status="OK"
  if [[ "$s" == "N/A" || "$d" == "N/A" ]]; then status="WARN(missing)"
  elif [[ "$s" != "$d" ]]; then status="MISMATCH"; fi
  printf "%-40s %12s %12s %s\n" "$t" "$s" "$d" "$status"
done