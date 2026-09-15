const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const pw = process.env.PGPASSWORD;
if (!pw) {
  console.error("PGPASSWORD not set");
  process.exit(1);
}

function deliver(abs, remote) {
  const buf = fs.readFileSync(abs);
  const b64 = buf.toString("base64");
  execFileSync(
    "docker",
    ["exec", "-i", "afrakala-lan-db", "sh", "-c", `base64 -d > ${remote}`],
    { input: Buffer.from(b64, "utf8") }
  );
  const md5 = crypto.createHash("md5").update(buf).digest("hex");
  const remoteMd5 = execFileSync("docker", [
    "exec",
    "afrakala-lan-db",
    "sh",
    "-c",
    `md5sum ${remote}`,
  ])
    .toString()
    .trim()
    .split(/\s+/)[0];
  if (md5 !== remoteMd5) throw new Error(`MD5_MISMATCH ${abs}`);
  return md5;
}

function psqlFile(remote) {
  let out = "",
    err = "",
    code = 0;
  try {
    out = execFileSync(
      "docker",
      [
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
        "--single-transaction",
        "-f",
        remote,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    ).toString("utf8");
  } catch (e) {
    code = e.status || 1;
    out = (e.stdout || Buffer.alloc(0)).toString("utf8");
    err = (e.stderr || Buffer.alloc(0)).toString("utf8");
  }
  return { code, text: out + (err ? "\nSTDERR:\n" + err : "") };
}

function psqlC(sql) {
  let out = "",
    err = "",
    code = 0;
  try {
    out = execFileSync(
      "docker",
      [
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
        "-c",
        sql,
      ],
      { maxBuffer: 20 * 1024 * 1024 }
    ).toString("utf8");
  } catch (e) {
    code = e.status || 1;
    out = (e.stdout || Buffer.alloc(0)).toString("utf8");
    err = (e.stderr || Buffer.alloc(0)).toString("utf8");
  }
  return { code, text: out + (err ? "\nSTDERR:\n" + err : "") };
}

const lines = [];
const root = path.resolve("docs/research/sales-desk-9-needs/orchestration");

let md5 = deliver(path.join(root, "548-down.sql"), "/tmp/548-down.sql");
let r = psqlFile("/tmp/548-down.sql");
lines.push(`DOWN md5=${md5} rc=${r.code}\n${r.text}`);
if (r.code !== 0) {
  fs.writeFileSync(path.join(root, "_reverse_548.out"), lines.join("\n---\n"));
  process.exit(r.code);
}

const stealAfterDown = `BEGIN;
CREATE TEMP TABLE _s1_ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id LIMIT 1) AS sales_a,
  (SELECT user_id FROM public.user_roles WHERE role::text = 'sales' ORDER BY user_id OFFSET 1 LIMIT 1) AS sales_b,
  (SELECT id FROM public.persons LIMIT 1) AS person_id,
  (SELECT id FROM public.customers LIMIT 1) AS customer_id;
DO $$
DECLARE a uuid; b uuid; p uuid; c uuid; rid uuid; author_after uuid; escalated boolean := false; steal_err text := NULL;
BEGIN
  SELECT sales_a, sales_b, person_id, customer_id INTO a, b, p, c FROM _s1_ctx;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  INSERT INTO public.sales_interactions (person_id, customer_id, kind, body, author_id, salesperson_id, status, source)
  VALUES (p, c, 'note', '548-down-steal', a, NULL, 'open', 'manual') RETURNING id INTO rid;
  UPDATE public.sales_interactions SET salesperson_id = b WHERE id = rid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.sales_interactions SET author_id = b WHERE id = rid;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
    escalated := (author_after = b);
  EXCEPTION WHEN OTHERS THEN
    steal_err := SQLERRM; escalated := false;
    SELECT author_id INTO author_after FROM public.sales_interactions WHERE id = rid;
  END;
  RAISE NOTICE 'AFTER_DOWN assignee_can_steal_author=% author_after=% steal_err=%', escalated, author_after, steal_err;
END $$;
ROLLBACK;
`;
fs.writeFileSync(path.join(root, "_probe_548_after_down.sql"), stealAfterDown);
md5 = deliver(path.join(root, "_probe_548_after_down.sql"), "/tmp/_probe_548_after_down.sql");
r = psqlFile("/tmp/_probe_548_after_down.sql");
lines.push(`AFTER_DOWN_PROBE md5=${md5} rc=${r.code}\n${r.text}`);
if (r.code !== 0) {
  fs.writeFileSync(path.join(root, "_reverse_548.out"), lines.join("\n---\n"));
  process.exit(r.code);
}

md5 = deliver(
  path.resolve(
    "supabase/migrations/20260916033000_548_sales_interactions_lock_author_id.sql"
  ),
  "/tmp/548_up.sql"
);
r = psqlFile("/tmp/548_up.sql");
lines.push(`UP_REAPPLY md5=${md5} rc=${r.code}\n${r.text}`);
if (r.code !== 0) {
  fs.writeFileSync(path.join(root, "_reverse_548.out"), lines.join("\n---\n"));
  process.exit(r.code);
}

const lr = psqlC(
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260916033000') ON CONFLICT DO NOTHING;"
);
lines.push(`LEDGER rc=${lr.code} ${lr.text.trim()}`);

md5 = deliver(path.join(root, "_probe_548_steal.sql"), "/tmp/_probe_548_steal.sql");
r = psqlFile("/tmp/_probe_548_steal.sql");
lines.push(`AFTER_UP_PROBE md5=${md5} rc=${r.code}\n${r.text}`);

fs.writeFileSync(path.join(root, "_reverse_548.out"), lines.join("\n---\n"));
console.log(lines.join("\n---\n"));
process.exit(r.code);
