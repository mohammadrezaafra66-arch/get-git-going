/**
 * D1 baseline: activity_* columns absent; kind counts; sample unmapped.
 * Output → d1-baseline.txt (no secrets).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sql = `
\\echo === columns (activity_* / due_* / done_at / result_note) ===
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sales_interactions'
   AND (
     column_name LIKE 'activity_%'
     OR column_name IN (
       'due_at', 'due_has_time', 'original_due_at', 'done_at', 'result_note', 'deal_id'
     )
   )
 ORDER BY column_name;

\\echo === all sales_interactions columns ===
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sales_interactions'
 ORDER BY ordinal_position;

\\echo === kind counts ===
SELECT kind, count(*)::int AS n
  FROM public.sales_interactions
 GROUP BY kind
 ORDER BY kind;

\\echo === call/note with call_log direction (sample map preview) ===
SELECT si.kind,
       cl.direction AS call_log_direction,
       (si.next_follow_up_at IS NOT NULL) AS has_follow_up,
       count(*)::int AS n
  FROM public.sales_interactions si
  LEFT JOIN public.call_logs cl ON cl.id = si.call_log_id
 WHERE si.kind IN ('call', 'note')
 GROUP BY si.kind, cl.direction, (si.next_follow_up_at IS NOT NULL)
 ORDER BY si.kind, cl.direction NULLS FIRST;

\\echo === request rows (should stay unmapped) ===
SELECT count(*)::int AS request_n
  FROM public.sales_interactions
 WHERE kind = 'request';

\\echo === version 573 unused? ===
SELECT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
   WHERE version = '20260922050100'
) AS v573_used;

\\echo === activity types 0/1/2 hex ===
SELECT sort_order,
       encode(convert_to(title, 'UTF8'), 'hex') AS title_hex
  FROM public.sales_activity_types
 WHERE sort_order IN (0, 1, 2)
 ORDER BY sort_order;
`;

const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1`,
  ],
  { input: Buffer.from(sql, "utf8"), encoding: "utf8" },
);

writeFileSync(join(dir, "d1-baseline.txt"), out, "utf8");
console.log(out);
console.log("EXIT=0 wrote d1-baseline.txt");
