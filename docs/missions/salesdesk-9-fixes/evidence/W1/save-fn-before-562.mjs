import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const outPath =
  "docs/missions/salesdesk-9-fixes/evidence/W1/work_items_before_write-before-562.sql";
const sql = "SELECT pg_get_functiondef('public.work_items_before_write'::regproc);";
const out = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -Atc ${JSON.stringify(sql)}`,
  ],
);
writeFileSync(outPath, out);
console.log(
  JSON.stringify({
    bytes: out.length,
    md5: createHash("md5").update(out).digest("hex"),
    path: outPath,
  }),
);
