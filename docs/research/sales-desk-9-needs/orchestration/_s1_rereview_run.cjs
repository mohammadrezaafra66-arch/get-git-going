// Independent S1 re-review runner: catalog + rolled-back steal probe on LAN.
// Does NOT apply migrations or touch ledger. Read-only / ROLLBACK only.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const pw = process.env.PGPASSWORD;
if (!pw) {
  console.error("PGPASSWORD not set");
  process.exit(1);
}

const orch = __dirname;

function run(args, input) {
  const opts = {
    input,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  };
  try {
    const out = execFileSync("docker", args, opts);
    return { code: 0, out: out.toString("utf8"), err: "" };
  } catch (e) {
    return {
      code: e.status ?? 1,
      out: (e.stdout || Buffer.alloc(0)).toString("utf8"),
      err: (e.stderr || Buffer.alloc(0)).toString("utf8"),
    };
  }
}

function deliverAndPsql(localAbs, remoteName, outAbs) {
  const buf = fs.readFileSync(localAbs);
  const b64 = buf.toString("base64");
  let r = run(
    ["exec", "-i", "afrakala-lan-db", "sh", "-c", `base64 -d > /tmp/${remoteName}`],
    Buffer.from(b64, "utf8")
  );
  if (r.code !== 0) {
    fs.writeFileSync(outAbs, `DELIVER_FAIL rc=${r.code}\n${r.out}\n${r.err}`);
    return r.code || 1;
  }
  r = run([
    "exec",
    "-e",
    `PGPASSWORD=${pw}`,
    "afrakala-lan-db",
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "afrakala",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    `/tmp/${remoteName}`,
  ]);
  fs.writeFileSync(outAbs, r.out + (r.err ? "\nSTDERR:\n" + r.err : ""));
  console.log("PSQL", path.basename(localAbs), "rc=", r.code);
  return r.code;
}

const catalogSql = `SELECT current_database() AS db, current_user;
SELECT version FROM supabase_migrations.schema_migrations WHERE version = '20260916033000';
SELECT tgname, tgenabled::text
  FROM pg_trigger
 WHERE tgrelid = 'public.sales_interactions'::regclass
   AND tgname = 'trg_sales_interactions_lock_author_id'
   AND NOT tgisinternal;
SELECT pg_get_functiondef('public.tg_sales_interactions_lock_author_id'::regproc) AS fndef;
SELECT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE') AS authenticated_has_delete;
`;

const catalogPath = path.join(orch, "_s1_rereview_catalog.sql");
fs.writeFileSync(catalogPath, catalogSql, "utf8");

let rc = deliverAndPsql(
  catalogPath,
  "_s1_rereview_catalog.sql",
  path.join(orch, "_s1_rereview_catalog.out")
);
if (rc !== 0) process.exit(rc);

rc = deliverAndPsql(
  path.join(orch, "_s1_rereview_steal.sql"),
  "_s1_rereview_steal.sql",
  path.join(orch, "_s1_rereview_steal.out")
);
process.exit(rc);
