import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

mkdirSync("docs/missions/salesdesk-9-fixes/evidence/W1", { recursive: true });

function psqlFile(sql, label) {
  const local = join(tmpdir(), `w1-${randomUUID()}.sql`);
  const remote = `/tmp/w1-${randomUUID()}.sql`;
  writeFileSync(local, sql, "utf8");
  const put = spawnSync(
    "docker",
    ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
    { input: require("fs").readFileSync(local) },
  );
  if (put.status !== 0) throw new Error(String(put.stderr));
  return execFileSync(
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
}

const def = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -At -c "select pg_get_functiondef('public.work_items_before_write()'::regprocedure);"`,
  ],
  { encoding: "utf8" },
);
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/before-work_items_before_write.sql",
  def,
);
console.log("saved before def", def.length);
