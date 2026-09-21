/**
 * Apply one SQL migration via Node Buffer → docker exec -i (AGENTS.md).
 * Usage: node apply-migration.mjs <local.sql> <version_timestamp>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const local = resolve(process.argv[2] ?? "");
const version = process.argv[3] ?? "";
if (!local || !version) {
  console.error("usage: node apply-migration.mjs <file.sql> <version>");
  process.exit(2);
}

const buf = readFileSync(local);
const localMd5 = createHash("md5").update(buf).digest("hex");
const remote = `/tmp/mig-${basename(local)}`;

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

const ledgerOut = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;"`,
  ],
  { encoding: "utf8" },
);
console.log(ledgerOut);

execFileSync("docker", ["restart", "afrakala-lan-rest"], { encoding: "utf8" });
console.log("rest_restarted");

console.log(
  "DONE",
  JSON.stringify({
    file: basename(local),
    version,
    md5: localMd5,
    applied_at: new Date().toISOString(),
  }),
);
