/**
 * F1 evidence: BEGIN…ROLLBACK owner-only trigger probes (a–d).
 * set_config JWT claims as admin, then SET LOCAL ROLE authenticated for UPDATE.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

function scalar(sql) {
  return execFileSync(
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
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

const aid = scalar("SELECT id FROM auth.users WHERE email='test.admin@afrakala.local'");
const sid = scalar("SELECT id FROM auth.users WHERE email='test.sales@afrakala.local'");
const pid = scalar("SELECT id FROM persons LIMIT 1");
const atype = scalar("SELECT id FROM sales_activity_types ORDER BY sort_order LIMIT 1");

const sql = `
BEGIN;
CREATE TEMP TABLE _f1(step text, ok boolean, detail text);
GRANT ALL ON TABLE _f1 TO authenticated;
GRANT ALL ON TABLE _f1 TO PUBLIC;

INSERT INTO sales_interactions (
  id, kind, author_id, salesperson_id, person_id, body, status,
  activity_type_id, due_at, title
) VALUES (
  gen_random_uuid(), 'note', '${aid}'::uuid, '${sid}'::uuid, '${pid}'::uuid,
  '[TEST-9FIX] f1-owner-only', 'open', '${atype}'::uuid, now(),
  '[TEST-9FIX] f1 activity'
);
INSERT INTO _f1 VALUES ('created', true,
  (SELECT id::text FROM sales_interactions WHERE body='[TEST-9FIX] f1-owner-only' LIMIT 1));

-- (a) author ≠ owner sets result → rejected
SELECT set_config('request.jwt.claim.sub', '${aid}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $do$
BEGIN
  BEGIN
    UPDATE sales_interactions
       SET done_at = now(), result_note = 'author-bypass', status = 'done'
     WHERE body = '[TEST-9FIX] f1-owner-only';
    INSERT INTO _f1 VALUES ('a_author_set_result', false, 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _f1 VALUES (
      'a_author_set_result',
      SQLERRM LIKE '%ACTIVITY_OWNER_ONLY%',
      SQLERRM
    );
  END;
END
$do$;
RESET ROLE;

-- (b) owner sets result → succeeds
SELECT set_config('request.jwt.claim.sub', '${sid}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $do$
BEGIN
  BEGIN
    UPDATE sales_interactions
       SET done_at = now(), result_note = 'owner-ok', status = 'done'
     WHERE body = '[TEST-9FIX] f1-owner-only';
    INSERT INTO _f1 VALUES ('b_owner_set_result', true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _f1 VALUES ('b_owner_set_result', false, SQLERRM);
  END;
END
$do$;

-- (c) owner reverts → succeeds
DO $do$
BEGIN
  BEGIN
    UPDATE sales_interactions
       SET done_at = NULL, result_note = NULL, status = 'open'
     WHERE body = '[TEST-9FIX] f1-owner-only';
    INSERT INTO _f1 VALUES ('c_owner_revert', true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _f1 VALUES ('c_owner_revert', false, SQLERRM);
  END;
END
$do$;
RESET ROLE;

-- system (uid NULL) marks done
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE sales_interactions
   SET done_at = now(), result_note = 'sys', status = 'done'
 WHERE body = '[TEST-9FIX] f1-owner-only';

-- (d) non-owner author reverts → rejected
SELECT set_config('request.jwt.claim.sub', '${aid}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
DO $do$
BEGIN
  BEGIN
    UPDATE sales_interactions
       SET done_at = NULL, result_note = NULL, status = 'open'
     WHERE body = '[TEST-9FIX] f1-owner-only';
    INSERT INTO _f1 VALUES ('d_author_revert', false, 'UPDATE unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _f1 VALUES (
      'd_author_revert',
      SQLERRM LIKE '%ACTIVITY_OWNER_ONLY%',
      SQLERRM
    );
  END;
END
$do$;
RESET ROLE;

SELECT * FROM _f1 ORDER BY step;
SELECT bool_and(ok) FILTER (WHERE step ~ '^[abcd]_') AS all_abcd_pass FROM _f1;

ROLLBACK;
`;

execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", "cat > /tmp/f1-abcd.sql"], {
  input: Buffer.from(sql, "utf8"),
});

let out;
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
      "ON_ERROR_STOP=0",
      "-P",
      "pager=off",
      "-f",
      "/tmp/f1-abcd.sql",
    ],
    { encoding: "utf8" },
  );
} catch (e) {
  out = String(e.stdout || "") + String(e.stderr || "");
}
writeFileSync("docs/missions/salesdesk-9-fixes/evidence/FIX/f1-abcd.txt", out);
console.log(out);
if (!/all_abcd_pass\s*\n\s*-+\s*\n\s*t\b/.test(out) && !/^\s*t\s*$/m.test(out.split("all_abcd_pass")[1] || "")) {
  // also accept table form where last value is t
  const lines = out.trim().split(/\r?\n/);
  const passLine = lines.find((l, i) => lines[i - 1]?.includes("all_abcd_pass") === false && false);
  const m = out.match(/all_abcd_pass[\s\S]*?\n\s*([tf])\s*\n/);
  if (!m || m[1] !== "t") {
    console.error("F1 abcd FAILED");
    process.exit(1);
  }
}
