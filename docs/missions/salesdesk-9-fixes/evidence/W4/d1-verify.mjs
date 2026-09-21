/**
 * D1 verify after 573: columns present; mapped counts; kind unchanged; hex match.
 * Output → d1-verify.txt
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

const EXPECTED_HEX = {
  0: "db8cd8a7d8afd8afd8a7d8b4d8aa20d8b3d8a7d8afd987",
  1: "d8aad985d8a7d8b320d988d8b1d988d8afdb8c",
  2: "d8aad985d8a7d8b320d8aed8b1d988d8acdb8c",
};

const sql = `
\\echo === new columns ===
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'sales_interactions'
   AND column_name IN (
     'activity_type_id', 'due_at', 'due_has_time', 'original_due_at',
     'done_at', 'result_note', 'deal_id'
   )
 ORDER BY column_name;

\\echo === FK activity_type_id ===
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.sales_interactions'::regclass
   AND conname = 'sales_interactions_activity_type_id_fkey';

\\echo === indexes ===
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'sales_interactions'
   AND indexname IN (
     'sales_interactions_salesperson_due_open_idx',
     'sales_interactions_activity_type_id_idx',
     'sales_interactions_deal_id_idx'
   )
 ORDER BY indexname;

\\echo === kind counts (must match baseline note=2 request=4) ===
SELECT kind, count(*)::int AS n
  FROM public.sales_interactions
 GROUP BY kind
 ORDER BY kind;

\\echo === mapped counts by type title hex + sort_order ===
SELECT t.sort_order,
       encode(convert_to(t.title, 'UTF8'), 'hex') AS title_hex,
       count(*)::int AS n
  FROM public.sales_interactions si
  JOIN public.sales_activity_types t ON t.id = si.activity_type_id
 GROUP BY t.sort_order, t.title
 ORDER BY t.sort_order;

\\echo === unmapped by kind ===
SELECT kind, count(*)::int AS n
  FROM public.sales_interactions
 WHERE activity_type_id IS NULL
 GROUP BY kind
 ORDER BY kind;

\\echo === due_* backfill from next_follow_up_at ===
SELECT count(*)::int AS due_copied
  FROM public.sales_interactions
 WHERE kind IN ('call', 'note')
   AND next_follow_up_at IS NOT NULL
   AND due_at IS NOT DISTINCT FROM next_follow_up_at
   AND original_due_at IS NOT DISTINCT FROM next_follow_up_at
   AND due_has_time = true;

\\echo === version 573 present ===
SELECT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
   WHERE version = '20260922050100'
) AS v573_used;

\\echo === type hex 0/1/2 ===
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

const checks = [];
let ok = true;

const colNeed = [
  "activity_type_id",
  "due_at",
  "due_has_time",
  "original_due_at",
  "done_at",
  "result_note",
  "deal_id",
];
for (const c of colNeed) {
  const present = out.includes(c);
  checks.push(`col_${c}=${present}`);
  if (!present) ok = false;
}

const kindNote = /note\s+\|\s+2/.test(out);
const kindReq = /request\s+\|\s+4/.test(out);
checks.push(`kind_note_2=${kindNote}`);
checks.push(`kind_request_4=${kindReq}`);
if (!kindNote || !kindReq) ok = false;

// mapped: sort 0 should have n=2 (notes); no call rows
const map0 = /0\s+\|\s+db8cd8a7d8afd8afd8a7d8b4d8aa20d8b3d8a7d8afd987\s+\|\s+2/.test(out);
checks.push(`mapped_note_sort0_n2=${map0}`);
if (!map0) ok = false;

const unmappedReq = /request\s+\|\s+4/.test(
  out.split("=== unmapped by kind ===")[1] ?? "",
);
checks.push(`unmapped_request_4=${unmappedReq}`);
if (!unmappedReq) ok = false;

for (const [so, hex] of Object.entries(EXPECTED_HEX)) {
  const hit = out.includes(hex);
  checks.push(`hex_sort_${so}=${hit}`);
  if (!hit) ok = false;
}

const v573 = /v573_used\s+\n-+\n\s+t/.test(out) || /\bt\b/.test(
  (out.split("=== version 573 present ===")[1] ?? "").slice(0, 80),
);
checks.push(`v573_used=${v573}`);
if (!v573) ok = false;

const summary = [
  `all_ok=${ok}`,
  ...checks,
  "",
  "DECISION: legacy next_follow_up_at → due_at + original_due_at with due_has_time=true when due_at null (call/note). Owner=salesperson_id, creator=author_id. deal_id already from 564.",
  "",
  out,
].join("\n");

writeFileSync(join(dir, "d1-verify.txt"), summary, "utf8");
console.log(summary);
process.exit(ok ? 0 : 1);
