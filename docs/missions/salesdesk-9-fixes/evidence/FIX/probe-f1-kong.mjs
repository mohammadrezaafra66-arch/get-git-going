import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const envPath = "D:/AfraKalaTest/app/deploy/lan/.env.lan";
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const pw = env.POSTGRES_PASSWORD;

function sql(q) {
  const out = execFileSync(
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
      "-t",
      "-A",
      "-q",
      "-c",
      q,
    ],
    { encoding: "utf8" },
  );
  return out.trim().split(/\r?\n/).filter(Boolean);
}

function mintJwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    sub,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
  });
  const sig = createHmac("sha256", env.JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

// cleanup leftovers from prior runs
sql("DELETE FROM sales_interactions WHERE body LIKE '[TEST-9FIX]%f1%'");

const aid = sql("SELECT id FROM auth.users WHERE email='test.admin@afrakala.local'")[0];
const sid = sql("SELECT id FROM auth.users WHERE email='test.sales@afrakala.local'")[0];
const pid = sql("SELECT id FROM persons LIMIT 1")[0];
const atype = sql("SELECT id FROM sales_activity_types ORDER BY sort_order LIMIT 1")[0];

const oid = sql(`
INSERT INTO sales_interactions (
  id, kind, author_id, salesperson_id, person_id, body, status,
  activity_type_id, due_at, title
) VALUES (
  gen_random_uuid(), 'note', '${aid}'::uuid, '${sid}'::uuid, '${pid}'::uuid,
  '[TEST-9FIX] f1-kong-patch', 'open', '${atype}'::uuid, now(),
  '[TEST-9FIX] f1 kong'
) RETURNING id;
`)[0];

const uuidRe = /^[0-9a-f-]{36}$/i;
if (!uuidRe.test(oid)) {
  console.error("bad oid", JSON.stringify(oid));
  process.exit(1);
}

const beforeDone = sql(
  `SELECT count(*) FROM sales_interactions WHERE id='${oid}' AND done_at IS NULL AND result_note IS NULL`,
)[0];

const jwt = mintJwt(aid);
const url = `http://192.168.170.8:${env.SUPABASE_API_PORT}/rest/v1/sales_interactions?id=eq.${oid}`;
const res = await fetch(url, {
  method: "PATCH",
  headers: {
    apikey: env.ANON_KEY,
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    done_at: new Date().toISOString(),
    result_note: "kong-author-bypass",
    status: "done",
  }),
});
const text = await res.text();
const afterDoneNull = sql(
  `SELECT count(*) FROM sales_interactions WHERE id='${oid}' AND done_at IS NULL AND result_note IS NULL`,
)[0];
const afterNote = sql(
  `SELECT coalesce(result_note,'(null)') FROM sales_interactions WHERE id='${oid}'`,
)[0];

sql("DELETE FROM sales_interactions WHERE body LIKE '[TEST-9FIX]%f1%'");
const leftover = sql(
  "SELECT count(*) FROM sales_interactions WHERE body LIKE '[TEST-9FIX]%f1%'",
)[0];

const rejected = res.status >= 400 && /ACTIVITY_OWNER_ONLY/i.test(text);
const unchanged = beforeDone === "1" && afterDoneNull === "1" && afterNote === "(null)";

const report = {
  oid,
  status: res.status,
  body_snippet: text.slice(0, 400),
  rejected,
  before_done_null_count: beforeDone,
  after_done_null_count: afterDoneNull,
  after_result_note: afterNote,
  unchanged,
  leftover_marker_rows: leftover,
  pass: rejected && unchanged && leftover === "0",
};

writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/FIX/f1-kong-patch.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
