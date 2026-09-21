import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const outPath = process.argv[2];
if (!outPath) {
  console.error("usage: node dump-notify-to.mjs <outfile>");
  process.exit(2);
}

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
writeFileSync(outPath, out);
console.log("wrote", outPath, "bytes", Buffer.byteLength(out));
