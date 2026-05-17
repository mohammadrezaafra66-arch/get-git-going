#!/usr/bin/env bash
# AfraKala — Phase 3 / Task AFRA-20260517-PRODUCTS-U02-S02
# Export فقط چهار جدول اول bundle محصولات از Cloud به یک dump امن.
# هیچ secret یا داده‌ای داخل ریپو commit نمی‌شود؛ خروجی در dumps/ که gitignored است.
#
# جدول‌های exported (ستون‌ها صریح):
#   public.brands
#   public.categories
#   public.products
#   public.product_computed_prices
#
# نکته مهم:
#   - sale_price_types صادر نمی‌شود (LAN canonical است).
#   - purchase_prices / pricing_rules / sale_lists / product_suppliers صادر نمی‌شوند.
#   - این فقط export است. import در LAN با اسکریپت جداگانه و پس از تأیید U01 انجام می‌شود.
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
OUT_DIR="${DUMP_DIR}/products-${TS}"
mkdir -p "${OUT_DIR}"
chmod 700 "${DUMP_DIR}" || true

# ستون‌های صریح (مطابق schema Cloud در زمان نگارش این task).
BRANDS_COLS="id,name,slug,description,is_active,created_at,updated_at"
CATEGORIES_COLS="id,name,slug,parent_id,description,is_active,created_at,updated_at,naming_template,primary_spec_label"
PRODUCTS_COLS="id,sku,name,description,unit,category,is_active,created_by,created_at,updated_at,brand_id,category_id,product_type,base_currency,stock_status,status,technical_notes,updated_by,color,capacity,model,primary_spec,dedup_key"
PCP_COLS="id,product_id,sale_price_type_id,purchase_price_id,pricing_rule_id,input_purchase_price,input_currency,currency_rate,purchase_price_toman,shipping_cost,margin_amount,final_sale_price,rounded_sale_price,computed_at,computed_by,source"

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
    -c "\\COPY (SELECT ${cols} FROM ${table}) TO '${out}' WITH (FORMAT csv, HEADER true)"
}

echo "Source : ${SOURCE_DB_USER}@${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME}"
echo "Output : ${OUT_DIR}"
echo "DryRun : ${DRY_RUN}"
echo

run_copy "public.brands"                 "${BRANDS_COLS}"     "${OUT_DIR}/brands.csv"
run_copy "public.categories"             "${CATEGORIES_COLS}" "${OUT_DIR}/categories.csv"
run_copy "public.products"               "${PRODUCTS_COLS}"   "${OUT_DIR}/products.csv"
run_copy "public.product_computed_prices" "${PCP_COLS}"        "${OUT_DIR}/product_computed_prices.csv"

if [[ "${DRY_RUN}" == "true" ]]; then
  echo
  echo "[dry-run] برای اجرای واقعی: DRY_RUN=false $0"
else
  echo
  echo "[done] CSVها در ${OUT_DIR}"
  echo "گام بعدی: انتقال امن این پوشه به سرور LAN و اجرای import-products-staged.ps1"
fi