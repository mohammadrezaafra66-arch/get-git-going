/**
 * D6 reminder path: insert due+reminder row, call materialize, assert queue row, ROLLBACK.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = readFileSync(process.env.AFRAKALA_LAN_ENV, "utf8");
const pw = (env.match(/^\s*POSTGRES_PASSWORD=(.+)$/m) || [])[1]
  .trim()
  .replace(/^["']|["']$/g, "");

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-e",
      "PGPASSWORD=" + pw,
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
    { encoding: "utf8" },
  );
}

const sql = `
SET client_min_messages TO NOTICE;
BEGIN;
DO $$
DECLARE
  v_author uuid; v_person uuid; v_type uuid; v_id uuid;
  v_n int; v_fired timestamptz; v_q int;
BEGIN
  SELECT id INTO v_author FROM profiles LIMIT 1;
  SELECT id INTO v_person FROM persons LIMIT 1;
  SELECT id INTO v_type FROM sales_activity_types WHERE sort_order = 0;
  INSERT INTO sales_interactions (
    person_id, kind, title, body, status, author_id, salesperson_id,
    activity_type_id, due_at, due_has_time, original_due_at,
    reminder_enabled, reminder_fired_at, done_at
  ) VALUES (
    v_person, 'note', '[TEST-9FIX-CRITIC] reminder', 'probe', 'open', v_author, v_author,
    v_type, now() - interval '1 minute', true, now() - interval '1 minute',
    true, NULL, NULL
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claim.sub', v_author::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_n := public.materialize_due_activity_reminders();
  SELECT reminder_fired_at INTO v_fired FROM sales_interactions WHERE id = v_id;
  SELECT count(*) INTO v_q FROM notification_queue
   WHERE type = 'sales_activity_reminder' AND reference_id = v_id;

  RAISE NOTICE 'REMINDER n=% fired=% queue=% uid=%', v_n, (v_fired IS NOT NULL), v_q, auth.uid();
END $$;
ROLLBACK;
`;

let out;
try {
  out = psql(sql);
} catch (e) {
  out =
    "FAIL: " +
    String(e.stderr || e.message || e).replace(/PGPASSWORD=\S+/g, "PGPASSWORD=***");
}
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W4/critic-reminder-probe.txt",
  out,
);
console.log(out);
