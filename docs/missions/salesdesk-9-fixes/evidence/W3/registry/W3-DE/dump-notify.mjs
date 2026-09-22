import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sql = Buffer.from(
  "SELECT pg_get_functiondef('public.notify_sales_interaction_assigned()'::regprocedure);\n",
);
const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -At -v ON_ERROR_STOP=1',
  ],
  { input: sql, encoding: "utf8" },
);
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W3/notify_assigned_before.sql",
  out,
);
console.log("bytes", Buffer.byteLength(out), "lines", out.split("\n").length);
