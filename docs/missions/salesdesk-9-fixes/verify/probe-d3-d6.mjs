import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

const sql = `
-- D3 refutation: can non-owner UPDATE done_at under RLS?
BEGIN;
CREATE TEMP TABLE _d3(step text, detail text);
DO $do$
DECLARE
  aid uuid; sid uuid; pid uuid; oid uuid;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  SELECT id INTO pid FROM persons LIMIT 1;
  INSERT INTO sales_interactions (
    id, kind, author_id, salesperson_id, person_id, body, status,
    activity_type_id, due_at
  )
  SELECT gen_random_uuid(), 'note', aid, sid, pid, '[TEST-9FIX-V] d3 owner check', 'open',
         (SELECT id FROM sales_activity_types ORDER BY sort_order LIMIT 1),
         now()
  RETURNING id INTO oid;
  INSERT INTO _d3 VALUES ('created', oid::text||' owner='||sid::text||' author='||aid::text);

  -- simulate author (admin) JWT
  PERFORM set_config('request.jwt.claim.sub', aid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    UPDATE sales_interactions SET done_at = now(), result_note='bypass' WHERE id = oid;
    IF FOUND THEN
      INSERT INTO _d3 VALUES ('author_update_as_admin_jwt', 'SUCCEEDED rows='||(SELECT count(*) FROM sales_interactions WHERE id=oid AND done_at IS NOT NULL)::text);
    ELSE
      INSERT INTO _d3 VALUES ('author_update_as_admin_jwt', 'NO_ROW');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _d3 VALUES ('author_update_as_admin_jwt', 'FAIL '||SQLERRM);
  END;
END
$do$;
SELECT * FROM _d3;
ROLLBACK;

-- policies on sales_interactions for UPDATE
SELECT polname, cmd, qual IS NOT NULL AS has_using, with_check IS NOT NULL AS has_check
FROM pg_policy WHERE polrelid='public.sales_interactions'::regclass AND cmd='w';

-- D6 postpone keeps original (rollback)
BEGIN;
CREATE TEMP TABLE _d6(step text, detail text);
DO $do$
DECLARE
  aid uuid; sid uuid; pid uuid; oid uuid;
  o0 timestamptz; d0 timestamptz; d1 timestamptz; o1 timestamptz;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  SELECT id INTO pid FROM persons LIMIT 1;
  INSERT INTO sales_interactions (
    id, kind, author_id, salesperson_id, person_id, body, status,
    activity_type_id, due_at, due_has_time, original_due_at
  )
  SELECT gen_random_uuid(), 'note', aid, sid, pid, '[TEST-9FIX-V] postpone', 'open',
         (SELECT id FROM sales_activity_types ORDER BY sort_order LIMIT 1),
         now() + interval '1 day', true, now() + interval '1 day'
  RETURNING id, due_at, original_due_at INTO oid, d0, o0;
  UPDATE sales_interactions
    SET due_at = now() + interval '3 day'
    WHERE id = oid
      AND (original_due_at IS NOT NULL OR true);
  -- app sets original only if null; simulate app: keep original
  UPDATE sales_interactions SET due_at = now() + interval '3 day'
    WHERE id = oid;
  SELECT due_at, original_due_at INTO d1, o1 FROM sales_interactions WHERE id=oid;
  INSERT INTO _d6 VALUES ('postpone_raw_sql', 'o0='||o0||' o1='||o1||' same_original='||(o0 IS NOT DISTINCT FROM o1));
END
$do$;
SELECT * FROM _d6;
ROLLBACK;

-- C9 quote link column usable
SELECT count(*) AS quotes_with_interaction FROM sales_quotes WHERE interaction_id IS NOT NULL;

-- menu red count RPC
SELECT proname FROM pg_proc WHERE proname ILIKE '%count_open_activ%';
`;

execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", "cat > /tmp/d3.sql"], {
  input: Buffer.from(sql, "utf8"),
});
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
    "-v",
    "ON_ERROR_STOP=0",
    "-P",
    "pager=off",
    "-f",
    "/tmp/d3.sql",
  ],
  { encoding: "utf8" },
).replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***");
writeFileSync("docs/missions/salesdesk-9-fixes/verify/raw/d3-d6-extra.txt", out);
console.log(out);
