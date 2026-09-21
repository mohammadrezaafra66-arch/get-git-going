/**
 * Apply revert SQL via Node Buffer → docker (same path as apply-migration.mjs).
 * Does NOT insert ledger (revert SQL deletes version). Restarts REST.
 * Usage: node d1-apply-revert.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const local = resolve(
  dir,
  "../../revert/573_sales_interactions_activity_fields.sql",
);
const buf = readFileSync(local);
const localMd5 = createHash("md5").update(buf).digest("hex");
const remote = "/tmp/mig-573-revert.sql";

execFileSync(
  "docker",
  ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
  { input: buf },
);

const remoteMd5 = execFileSync(
  "docker",
  ["exec", "afrakala-lan-db", "md5sum", remote],
  { encoding: "utf8" },
)
  .trim()
  .split(/\s+/)[0];

if (localMd5 !== remoteMd5) {
  console.error(`md5 mismatch local=${localMd5} remote=${remoteMd5}`);
  process.exit(1);
}
console.log(`md5_ok ${localMd5}`);

const applyOut = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f ${remote}`,
  ],
  { encoding: "utf8" },
);
console.log(applyOut);

const probeSql = `
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_interactions'
   AND column_name IN ('activity_type_id','due_at','due_has_time','original_due_at','done_at','result_note')
 ORDER BY 1;
SELECT kind, count(*)::int AS n FROM public.sales_interactions GROUP BY kind ORDER BY 1;
SELECT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260922050100'
) AS v573_used;
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_interactions' AND column_name='deal_id';
`;

const probe = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1`,
  ],
  { input: Buffer.from(probeSql, "utf8"), encoding: "utf8" },
);
console.log(probe);

const activityGone = !/activity_type_id/.test(probe.split("deal_id")[0] ?? probe);
const kindOk = /note\s+\|\s+2/.test(probe) && /request\s+\|\s+4/.test(probe);
const v573Gone = /v573_used[\s\S]*?\bf\b/.test(probe) || /\n\s+f\s*\n/.test(probe);
const dealKept = /deal_id/.test(probe);

const report = [
  `md5=${localMd5}`,
  `activity_cols_gone=${activityGone}`,
  `kind_unchanged=${kindOk}`,
  `v573_gone=${v573Gone}`,
  `deal_id_kept=${dealKept}`,
  "",
  applyOut,
  probe,
].join("\n");

writeFileSync(join(dir, "d1-revert-probe.txt"), report, "utf8");

const ok = activityGone && kindOk && v573Gone && dealKept;
console.log(`all_ok=${ok}`);
process.exit(ok ? 0 : 1);
