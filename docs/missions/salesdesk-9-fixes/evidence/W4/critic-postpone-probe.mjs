import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = readFileSync(process.env.AFRAKALA_LAN_ENV, "utf8");
const pw = (env.match(/^\s*POSTGRES_PASSWORD=(.+)$/m) || [])[1]
  .trim()
  .replace(/^["']|["']$/g, "");

const sql = `
SET client_min_messages TO NOTICE;
BEGIN;
DO $$
DECLARE
  v_author uuid; v_person uuid; v_type uuid; v_id uuid;
  v_orig timestamptz; v_due timestamptz; v_orig2 timestamptz; v_due2 timestamptz;
BEGIN
  SELECT id INTO v_author FROM profiles LIMIT 1;
  SELECT id INTO v_person FROM persons LIMIT 1;
  SELECT id INTO v_type FROM sales_activity_types WHERE sort_order = 0;
  IF v_author IS NULL OR v_person IS NULL OR v_type IS NULL THEN
    RAISE EXCEPTION 'missing fixtures';
  END IF;
  INSERT INTO sales_interactions (
    person_id, kind, title, body, status, author_id, salesperson_id,
    activity_type_id, due_at, due_has_time, original_due_at
  ) VALUES (
    v_person, 'note', '[TEST-9FIX-CRITIC] postpone', 'probe', 'open', v_author, v_author,
    v_type, '2026-09-20 10:00:00+03:30', true, '2026-09-20 10:00:00+03:30'
  ) RETURNING id, original_due_at, due_at INTO v_id, v_orig, v_due;

  UPDATE sales_interactions
     SET due_at = '2026-09-25 12:00:00+03:30', due_has_time = true
   WHERE id = v_id;

  SELECT original_due_at, due_at INTO v_orig2, v_due2 FROM sales_interactions WHERE id = v_id;
  RAISE NOTICE 'POSTPONE_KEEP keep=% orig_eq=% due_changed=%',
    (v_orig2 = v_orig AND v_due2 IS DISTINCT FROM v_due),
    (v_orig2 = v_orig),
    (v_due2 IS DISTINCT FROM v_due);
END $$;
ROLLBACK;
`;

const out = execFileSync(
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
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W4/critic-postpone-probe.txt",
  out,
);
console.log(out);
