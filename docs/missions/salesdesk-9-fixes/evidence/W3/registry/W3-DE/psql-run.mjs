/**
 * Run SQL via Node Buffer → docker exec (AGENTS.md).
 * Usage: node psql-run.mjs <file.sql> [outfile]
 * Exit code = psql exit; stdout always written to outfile if given.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sqlPath = resolve(process.argv[2] ?? "");
const outPath = process.argv[3] ? resolve(process.argv[3]) : null;
if (!sqlPath) {
  console.error("usage: node psql-run.mjs <file.sql> [outfile]");
  process.exit(2);
}

const buf = readFileSync(sqlPath);
let out = "";
let code = 0;
try {
  out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "afrakala-lan-db",
      "bash",
      "-lc",
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1',
    ],
    { input: buf, encoding: "utf8" },
  );
} catch (e) {
  code = e.status ?? 1;
  out = (e.stdout || "") + (e.stderr || "");
}
if (outPath) writeFileSync(outPath, out, "utf8");
process.stdout.write(out);
process.exit(code);
