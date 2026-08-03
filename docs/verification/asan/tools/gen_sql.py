import json, os, sys, collections

sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"

plan = json.load(open(os.path.join(ROOT, "docs/verification/asan/repair-plan.json"), encoding="utf-8"))
resolved = plan["resolved"]

ctid_map = {}
for line in open(os.path.join(ROOT, "docs/verification/asan/kdb-ctid-map.txt"), encoding="utf-8"):
    line = line.strip()
    if "|" in line:
        c, i = line.split("|", 1)
        ctid_map[c] = i


def q(s):
    assert "$fa$" not in s
    return "$fa$" + s + "$fa$"


up, down = [], []
for o in sorted(resolved, key=lambda r: (r["table"], r["column"], r["pk"])):
    tbl, col, pk = o["table"], o["column"], o["pk"]
    if tbl == "knowledge_documents_backup_20260722":
        pk = ctid_map[pk]
    where = f"id = '{pk}'::uuid"
    up.append(f"UPDATE public.{tbl} SET {col} = {q(o['chosen'])} "
              f"WHERE {where} AND {col} = {q(o['corrupt'])};")
    down.append(f"UPDATE public.{tbl} SET {col} = {q(o['corrupt'])} "
                f"WHERE {where} AND {col} = {q(o['chosen'])};")

# --- the generator of the corruption, and the rows it produced -------------------
live = open(os.path.join(ROOT, "docs/verification/pre-279/sync_product_price_observatory_rows.sql"),
            encoding="utf-8").read().strip()
assert live.count("'?? '") == 1, live.count("'?? '")
fixed_fn = live.replace("'?? '", "'، '")

fn_block = f"""
-- sync_product_price_observatory_rows() joins product labels with string_agg. Its separator
-- literal was corrupted from '، ' (U+060C + space) to '?? ', so every label cell it wrote
-- carries the broken separator. Taken from the live pg_get_functiondef snapshot in
-- docs/verification/pre-279/, with that one literal changed and nothing else.
{fixed_fn};

-- and the 266 cells it already produced (every '?' in this table is that separator)
UPDATE public.dynamic_table_cells
   SET value_text = replace(value_text, '?? ', '، ')
 WHERE value_text LIKE '%?? %';
"""

fn_down = f"""
{live};

UPDATE public.dynamic_table_cells
   SET value_text = replace(value_text, '، ', '?? ')
 WHERE value_text LIKE '%، %'
   AND column_id = (SELECT id FROM public.dynamic_table_columns WHERE column_key = 'product_labels');
"""

hdr = """-- 279: repair Persian text corrupted by the 2026-07-11 encoding incident.
--
-- The incident replaced every UTF-8 *byte* of each non-ASCII character with a literal '?'.
-- Every value below was recovered by proving byte-mask identity, mask(new) = old, against
-- the original string still present in supabase/migrations or src/. No wording was invented.
-- Discovery scan: docs/verification/asan/scan-corrupted-text.sql
-- Classification:  docs/asan/corrupted-labels-scan.md
-- Rollback:        docs/verification/279-down.sql
--
-- Each statement is guarded on the current corrupted value, so re-running is a no-op.
SET client_encoding='UTF8';

"""

tail = """
DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.gamification_kpis  WHERE label_fa  ~ '[?]{2,}';
  IF n > 0 THEN RAISE EXCEPTION 'gamification_kpis.label_fa still corrupted: %', n; END IF;
  SELECT count(*) INTO n FROM public.achievements       WHERE title_fa  ~ '[?]{2,}';
  IF n > 0 THEN RAISE EXCEPTION 'achievements.title_fa still corrupted: %', n; END IF;
  SELECT count(*) INTO n FROM public.market_indicators  WHERE title_fa  ~ '[?]{2,}';
  IF n > 0 THEN RAISE EXCEPTION 'market_indicators.title_fa still corrupted: %', n; END IF;
  SELECT count(*) INTO n FROM public.dynamic_table_cells WHERE value_text ~ '[?]{2,}';
  IF n > 0 THEN RAISE EXCEPTION 'dynamic_table_cells.value_text still corrupted: %', n; END IF;
  SELECT count(*) INTO n FROM public.daily_mood_questions WHERE question_text ~ '[?]{2,}';
  IF n > 0 THEN RAISE EXCEPTION 'daily_mood_questions still corrupted: %', n; END IF;
END
$chk$;
"""

open(os.path.join(ROOT, "supabase/migrations/20260804233000_279_repair_corrupted_persian_labels.sql"),
     "w", encoding="utf-8", newline="\n").write(hdr + "\n".join(up) + "\n" + fn_block + tail)

dhdr = """-- Down script for migration 279. No BEGIN/COMMIT: the caller owns the transaction.
SET client_encoding='UTF8';

"""
open(os.path.join(ROOT, "docs/verification/279-down.sql"),
     "w", encoding="utf-8", newline="\n").write(dhdr + "\n".join(down) + "\n" + fn_down)

print(f"row statements={len(up)}", file=sys.stderr)
