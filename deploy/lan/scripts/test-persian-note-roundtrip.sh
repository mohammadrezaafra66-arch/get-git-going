#!/usr/bin/env bash
# AfraKala — UTF-8 regression test for product_suppliers.notes
#
# WHY THIS EXISTS
#   The live DB accumulated 22 product_suppliers rows whose Persian `notes`
#   were stored as literal '?' bytes (0x3F) — Persian text destroyed at write
#   time. Investigation showed the corrupting writer was a CLOUD-side path
#   (decommissioned at the LAN cutover on 2026-07-18); every corrupted row was
#   created on or before 2026-07-13 and carried into LAN by pg_restore (which
#   preserves created_at). The current LAN write path (browser -> Kong ->
#   PostgREST -> Postgres) is UTF-8-clean. This test proves that, and guards
#   against a regression if anyone re-introduces a non-UTF-8 import path.
#
# WHAT IT DOES (self-cleaning, safe to run against the live LAN DB)
#   1. INSERTs a product_supplier row with a Persian note through the EXACT
#      server chain the app uses (PostgREST via Kong on :9000).
#   2. Reads the STORED value back and checks: octet_length > char length
#      (i.e. real multibyte UTF-8) AND no literal '?' run.
#   3. DELETEs the test row it created (always, via a trap).
#
# USAGE
#   ./test-persian-note-roundtrip.sh
#   (reads ../.env.lan for SUPABASE_SERVICE_ROLE_KEY, POSTGRES_PASSWORD;
#    override KONG_URL / DB_CONTAINER / ENV_FILE via env vars if needed.)
#
# EXIT: 0 = note survived intact, 1 = corruption detected or setup failed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env.lan}"
KONG_URL="${KONG_URL:-http://192.168.170.8:9000}"
DB_CONTAINER="${DB_CONTAINER:-afrakala-lan-db}"
DB_USER="${DB_USER:-supabase_admin}"
DB_NAME="${DB_NAME:-afrakala}"

# A note that MUST survive: Persian letters + Persian digits + emoji.
PERSIAN_NOTE="یادداشت تست فارسی ۱۴۰۵ ✅ کولر گازی"

[[ -f "$ENV_FILE" ]] || { echo "[ERROR] env file not found: $ENV_FILE" >&2; exit 1; }
KEY="$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)"
PW="$(grep '^POSTGRES_PASSWORD='          "$ENV_FILE" | cut -d= -f2-)"
[[ -n "$KEY" && -n "$PW" ]] || { echo "[ERROR] missing keys in $ENV_FILE" >&2; exit 1; }

psql_q() { docker exec -e PGPASSWORD="$PW" "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }

# Pick any real product + supplier to satisfy the FKs.
PID="$(psql_q "SELECT id FROM products  WHERE name NOT LIKE '%???%' LIMIT 1;")"
SID="$(psql_q "SELECT id FROM suppliers WHERE name NOT LIKE '%???%' LIMIT 1;")"
[[ -n "$PID" && -n "$SID" ]] || { echo "[ERROR] could not find a product/supplier for the test" >&2; exit 1; }

NEWID=""
cleanup() {
  if [[ -n "$NEWID" ]]; then
    curl -s -o /dev/null -X DELETE \
      "$KONG_URL/rest/v1/product_suppliers?id=eq.$NEWID" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" || true
  fi
  rm -f "${BODY:-}" 2>/dev/null || true
}
trap cleanup EXIT

BODY="$(mktemp)"
printf '{"product_id":"%s","supplier_id":"%s","is_primary":false,"notes":"%s"}' \
  "$PID" "$SID" "$PERSIAN_NOTE" > "$BODY"

echo "[1/3] INSERT via PostgREST ($KONG_URL) …"
RESP="$(curl -s -X POST "$KONG_URL/rest/v1/product_suppliers" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Prefer: return=representation" \
  --data-binary @"$BODY")"
NEWID="$(printf '%s' "$RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
[[ -n "$NEWID" ]] || { echo "[FAIL] insert did not return an id. Response: $RESP" >&2; exit 1; }
echo "      inserted id=$NEWID"

echo "[2/3] Read STORED bytes back …"
ROW="$(psql_q "SELECT length(notes)||'|'||octet_length(notes)||'|'||(notes LIKE '%???%')||'|'||notes
               FROM product_suppliers WHERE id='$NEWID';")"
CHARS="${ROW%%|*}"; REST="${ROW#*|}"; BYTES="${REST%%|*}"; REST="${REST#*|}"; BAD="${REST%%|*}"; STORED="${REST#*|}"
echo "      stored='$STORED'  chars=$CHARS bytes=$BYTES qmark_corruption=$BAD"

echo "[3/3] Verdict:"
if [[ "$BAD" == "t" ]]; then
  echo "      ❌ FAIL — stored note contains a '???' run (encoding corruption)."; exit 1
elif [[ "$BYTES" -le "$CHARS" ]]; then
  echo "      ❌ FAIL — no multibyte bytes (Persian was flattened to single-byte)."; exit 1
elif [[ "$STORED" != "$PERSIAN_NOTE" ]]; then
  echo "      ❌ FAIL — stored note differs from what was sent."; exit 1
else
  echo "      ✅ PASS — Persian note round-tripped intact through the live app path."
fi
