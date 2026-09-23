import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("docs/missions/salesdesk-9-fixes/evidence/W2");
const local = resolve(dir, "orch-verify.sql");
const buf = readFileSync(local);
const remote = "/tmp/orch-verify.sql";

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

writeFileSync(resolve(dir, "orch-db-verify.txt"), out);
console.log(out);
console.log("EXIT=0");
