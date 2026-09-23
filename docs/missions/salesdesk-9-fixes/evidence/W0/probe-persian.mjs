import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Harmless round-trip: Unicode-escape literal vs expected UTF-8 hex of «سایر»
const expectedHex = Buffer.from("سایر", "utf8").toString("hex");
const sql = [
  "SET client_encoding='UTF8';",
  "SELECT encode(convert_to(U&'\\0633\\0627\\06CC\\0631', 'UTF8'), 'hex') AS got;",
].join("\n");

const local = join(tmpdir(), `probe-9fix-${Date.now()}.sql`);
writeFileSync(local, sql, { encoding: "utf8" });
const remote = "/tmp/probe-9fix-persian.sql";
const buf = readFileSync(local);

const put = spawnSync(
  "docker",
  ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
  { input: buf },
);
if (put.status !== 0) {
  console.error(String(put.stderr || put.stdout));
  process.exit(1);
}

const md5Local = createHash("md5").update(buf).digest("hex");
const md5Remote = execFileSync("docker", ["exec", "afrakala-lan-db", "md5sum", remote], {
  encoding: "utf8",
})
  .trim()
  .split(/\s+/)[0];

const out = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -At -f ${remote}`,
  ],
  { encoding: "utf8" },
);

const got = out.trim().split(/\r?\n/).filter(Boolean).pop();
const result = {
  method: "Node Buffer stdin -> docker exec (AGENTS.md)",
  md5_local: md5Local,
  md5_remote: md5Remote,
  md5_match: md5Local === md5Remote,
  got_hex: got,
  expected_hex: expectedHex,
  hex_match: got === expectedHex,
};
console.log(JSON.stringify(result, null, 2));
try {
  unlinkSync(local);
} catch {
  /* ignore */
}
process.exit(result.md5_match && result.hex_match ? 0 : 2);
