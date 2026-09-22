import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

const sql = `
SELECT pol.polname, pol.polcmd::text AS cmd,
       pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
FROM pg_policy pol
WHERE pol.polrelid = 'public.sales_interactions'::regclass
ORDER BY 1;

-- Force RLS as authenticated author who is NOT salesperson
BEGIN;
CREATE TEMP TABLE _r(step text, detail text);
DO $do$
DECLARE
  aid uuid; sid uuid; pid uuid; oid uuid; n int;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  SELECT id INTO pid FROM persons LIMIT 1;
  INSERT INTO sales_interactions (
    id, kind, author_id, salesperson_id, person_id, body, status,
    activity_type_id, due_at
  )
  SELECT gen_random_uuid(), 'note', aid, sid, pid, '[TEST-9FIX-V] rls-d3', 'open',
         (SELECT id FROM sales_activity_types ORDER BY sort_order LIMIT 1), now()
  RETURNING id INTO oid;
  INSERT INTO _r VALUES ('created', oid::text);
END
$do$;

-- switch to authenticated + jwt sub=author inside same txn via SET LOCAL
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email='test.admin@afrakala.local'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

UPDATE sales_interactions
SET done_at = now(), result_note = 'author-bypass'
WHERE body = '[TEST-9FIX-V] rls-d3';

INSERT INTO _r SELECT 'author_update_after_role',
  (SELECT count(*)::text FROM sales_interactions WHERE body='[TEST-9FIX-V] rls-d3' AND done_at IS NOT NULL);

RESET ROLE;
SELECT * FROM _r;
ROLLBACK;
`;

execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", "cat > /tmp/rls.sql"], {
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
      "/tmp/rls.sql",
    ],
    { encoding: "utf8" },
  );
} catch (e) {
  out = String(e.stdout || "") + String(e.stderr || "");
}
out = out.replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***");
writeFileSync("docs/missions/salesdesk-9-fixes/verify/raw/d3-rls.txt", out);
console.log(out);
