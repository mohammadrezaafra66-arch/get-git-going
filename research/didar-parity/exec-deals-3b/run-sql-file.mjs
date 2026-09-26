import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const local = process.argv[2];
const remote = process.argv[3] || "/tmp/q.sql";
const buf = readFileSync(local);
execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`], { input: buf });
const localMd5 = createHash("md5").update(buf).digest("hex");
const remoteMd5 = execFileSync("docker", ["exec", "afrakala-lan-db", "md5sum", remote], {
  encoding: "utf8",
}).split(/\s+/)[0];
if (localMd5 !== remoteMd5) throw new Error(`md5 ${localMd5} ${remoteMd5}`);
process.stdout.write(
  execFileSync(
    "docker",
    [
      "exec",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f ${remote}`,
    ],
    { encoding: "utf8" },
  ),
);
