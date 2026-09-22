import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sql =
  "select column_name from information_schema.columns where table_schema='public' and table_name='work_items' order by 1";
const out = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -At -c ${JSON.stringify(sql)}`,
  ],
  { encoding: "utf8" },
);
const cols = out.trim().split(/\r?\n/).filter(Boolean);
const hasClosedAt = cols.includes("closed_at");
const hasCompletedAt = cols.includes("completed_at");
const hasDoneAt = cols.includes("done_at");
const summary = {
  columns: cols,
  closed_at_equivalent: hasClosedAt
    ? "closed_at"
    : hasCompletedAt
      ? "completed_at"
      : hasDoneAt
        ? "done_at"
        : null,
  need_closed_at_column: !hasClosedAt && !hasCompletedAt && !hasDoneAt,
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(
  new URL("./work_items-columns.json", import.meta.url),
  JSON.stringify(summary, null, 2),
  "utf8",
);
