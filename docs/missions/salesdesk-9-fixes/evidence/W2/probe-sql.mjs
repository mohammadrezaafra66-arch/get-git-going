/**
 * Run a SQL file against afrakala-lan-db via Node Buffer (no PowerShell pipe).
 * Usage: node probe-sql.mjs <local.sql> [out.txt]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const local = resolve(process.argv[2] ?? "");
const outPath = process.argv[3] ? resolve(process.argv[3]) : null;
if (!local) {
  console.error("usage: node probe-sql.mjs <file.sql> [out.txt]");
  process.exit(2);
}

const buf = readFileSync(local);
const remote = `/tmp/probe-${basename(local)}`;

execFileSync(
  "docker",
  ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
  { input: buf },
);

const out = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f ${remote}`,
  ],
  { encoding: "utf8" },
);

if (outPath) writeFileSync(outPath, out, "utf8");
process.stdout.write(out);
