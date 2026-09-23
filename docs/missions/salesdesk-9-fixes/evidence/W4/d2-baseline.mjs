/**
 * D2 baseline: table absent + versions ≥571 / 572 unused.
 * Output → d2-baseline.txt (no secrets).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sql = `
SELECT to_regclass('public.sales_activity_types') AS reg;
SELECT version
  FROM supabase_migrations.schema_migrations
 WHERE version >= '20260922040000'
 ORDER BY version;
SELECT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
   WHERE version = '20260922050000'
) AS v572_used;
SELECT MAX(version) AS highest
  FROM supabase_migrations.schema_migrations;
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

writeFileSync(join(dir, "d2-baseline.txt"), out, "utf8");
console.log(out);
console.log("EXIT=0 wrote d2-baseline.txt");
