import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

const sql = `
SELECT count(*) AS hits FROM products
WHERE code ILIKE '%287%' OR name ILIKE '%X287%' OR name ILIKE '%287%';
SELECT id::text, code, left(coalesce(name,''),80) AS name
FROM products
WHERE code ILIKE '%287%' OR name ILIKE '%X287%' OR name ILIKE '%287%'
LIMIT 8;

-- title hex for من مسئول شدم from live function source
SELECT encode(convert_to(U&'\\0645\\0646\\0020\\0645\\0633\\0626\\0648\\0644\\0020\\0634\\062F\\0645','UTF8'),'hex') AS expected_title_hex;

-- confirm function contains the unicode escapes / title
SELECT position(U&'\\0645\\0646\\0020\\0645\\0633\\0626\\0648\\0644\\0020\\0634\\062F\\0645' in pg_get_functiondef(oid)) > 0 AS title_in_fn
FROM pg_proc WHERE proname='notify_sales_interaction_assigned';

-- C4 fire on update change of salesperson (rollback) with person_id
BEGIN;
CREATE TEMP TABLE _c4(step text, detail text);
DO $$
DECLARE
  aid uuid; sid uuid; pid uuid; oid uuid; nq0 int; nq1 int; title text;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  SELECT id INTO pid FROM persons LIMIT 1;
  IF aid IS NULL OR sid IS NULL OR pid IS NULL THEN
    INSERT INTO _c4 VALUES ('skip', 'missing aid/sid/pid'); RETURN;
  END IF;
  SELECT count(*) INTO nq0 FROM notification_queue WHERE user_id=sid AND type='sales_interaction_assigned';
  INSERT INTO sales_interactions (id, kind, author_id, salesperson_id, person_id, body, status)
  VALUES (gen_random_uuid(), 'request', aid, aid, pid, '[TEST-9FIX-V] self-assign', 'open')
  RETURNING id INTO oid;
  -- change responsible to sales (should notify)
  UPDATE sales_interactions SET salesperson_id = sid WHERE id = oid;
  SELECT count(*), max(title) INTO nq1, title
  FROM notification_queue WHERE user_id=sid AND type='sales_interaction_assigned' AND reference_id=oid;
  INSERT INTO _c4 VALUES ('notify_on_change', 'count='||nq1||' title='||coalesce(title,'null')||
    ' hex='||coalesce(encode(convert_to(title,'UTF8'),'hex'),'null'));
END $$;
SELECT * FROM _c4;
ROLLBACK;
`;

execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", "cat > /tmp/v5.sql"], {
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
    "-P",
    "pager=off",
    "-f",
    "/tmp/v5.sql",
  ],
  { encoding: "utf8" },
).replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***");

writeFileSync("docs/missions/salesdesk-9-fixes/verify/raw/sql-probes-5.txt", out);
console.log(out);
