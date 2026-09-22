import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

const sql = String.raw`
BEGIN;
CREATE TEMP TABLE _c4(step text, detail text);
DO $do$
DECLARE
  aid uuid; sid uuid; pid uuid; oid uuid; nq1 int; title text;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  SELECT id INTO pid FROM persons LIMIT 1;
  INSERT INTO _c4 VALUES ('ids', coalesce(aid::text,'?')||' / '||coalesce(sid::text,'?')||' / '||coalesce(pid::text,'?'));
  IF aid IS NULL OR sid IS NULL OR pid IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO sales_interactions (id, kind, author_id, salesperson_id, person_id, body, status)
    VALUES (gen_random_uuid(), 'request', aid, aid, pid, '[TEST-9FIX-V] self-assign', 'open')
    RETURNING id INTO oid;
    INSERT INTO _c4 VALUES ('inserted', oid::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c4 VALUES ('insert_fail', SQLERRM);
    RETURN;
  END;
  BEGIN
    UPDATE sales_interactions SET salesperson_id = sid WHERE id = oid;
    INSERT INTO _c4 VALUES ('updated', 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c4 VALUES ('update_fail', SQLERRM);
  END;
  SELECT count(*), max(title) INTO nq1, title
  FROM notification_queue
  WHERE user_id=sid AND type='sales_interaction_assigned' AND reference_id=oid;
  INSERT INTO _c4 VALUES (
    'notify',
    'count='||nq1||' title='||coalesce(title,'null')||
    ' hex='||coalesce(encode(convert_to(coalesce(title,''),'UTF8'),'hex'),'')
  );
END
$do$;
SELECT * FROM _c4;
ROLLBACK;
`;

execFileSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", "cat > /tmp/c4.sql"], {
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
    "/tmp/c4.sql",
  ],
  { encoding: "utf8" },
).replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***");
writeFileSync("docs/missions/salesdesk-9-fixes/verify/raw/c4-notify.txt", out);
console.log(out);
