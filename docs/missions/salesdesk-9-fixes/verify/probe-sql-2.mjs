/**
 * Follow-up SQL probes with visible SELECT results (no RAISE NOTICE).
 * All mutations in BEGIN…ROLLBACK. Never prints password.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "raw");
mkdirSync(outDir, { recursive: true });

function loadPw() {
  const text = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8");
  const m = text.match(/^POSTGRES_PASSWORD=(.+)$/m);
  if (!m) throw new Error("POSTGRES_PASSWORD not found");
  return m[1].trim();
}

function psqlFile(sql, pw) {
  // Write SQL into container via stdin Buffer; run with ON_ERROR_STOP=0
  const remote = "/tmp/verify9fix.sql";
  execFileSync(
    "docker",
    ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`],
    { input: Buffer.from(sql, "utf8") }
  );
  try {
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
        "-v",
        "ON_ERROR_STOP=0",
        "-P",
        "pager=off",
        "-f",
        remote,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (e) {
    const s = String(e.stdout || "") + String(e.stderr || "") + String(e.message || "");
    return s.replace(/PGPASSWORD=[^\s"]+/g, "PGPASSWORD=***");
  }
}

const pw = loadPw();

const sql = `
SET client_min_messages TO NOTICE;

-- A2: completed_at as closed_at equivalent
\\echo ===== A2 completed_at on close/reopen =====
BEGIN;
CREATE TEMP TABLE _a2 AS
SELECT id, status::text AS st0, completed_at AS c0
FROM work_items
WHERE status::text NOT IN ('done','cancelled')
LIMIT 1;

UPDATE work_items w
SET status = 'done'
FROM _a2 a WHERE w.id = a.id;

CREATE TEMP TABLE _a2b AS
SELECT w.id, w.status::text AS st1, w.completed_at AS c1, a.c0
FROM work_items w JOIN _a2 a ON a.id = w.id;

UPDATE work_items w
SET status = 'open'
FROM _a2 a WHERE w.id = a.id;

SELECT b.id, b.st0, b.c0 AS completed_before,
       b.st1, b.c1 AS completed_after_close,
       w.completed_at AS completed_after_reopen,
       (b.c1 IS NOT NULL) AS close_sets_completed,
       (w.completed_at IS NULL) AS reopen_clears_completed
FROM _a2b b
JOIN work_items w ON w.id = b.id
JOIN _a2 a ON a.id = b.id;
ROLLBACK;

-- A3: history delta
\\echo ===== A3 history delta =====
BEGIN;
CREATE TEMP TABLE _a3 AS SELECT id, title FROM work_items LIMIT 1;
CREATE TEMP TABLE _a3c0 AS
SELECT count(*)::int AS c FROM work_item_events e JOIN _a3 a ON a.id = e.work_item_id;
UPDATE work_items w SET title = coalesce(w.title,'') || ' V' FROM _a3 a WHERE w.id = a.id;
CREATE TEMP TABLE _a3c1 AS
SELECT count(*)::int AS c FROM work_item_events e JOIN _a3 a ON a.id = e.work_item_id;
SELECT c0.c AS before_cnt, c1.c AS after_cnt, (c1.c - c0.c) AS delta
FROM _a3c0 c0, _a3c1 c1;
SELECT field, old_value, new_value FROM work_item_events e
JOIN _a3 a ON a.id = e.work_item_id
ORDER BY event_at DESC LIMIT 3;
ROLLBACK;

-- A4 probes via exception capture table
\\echo ===== A4 supplier probes =====
BEGIN;
CREATE TEMP TABLE _a4(step text, ok boolean, err text);
DO $$
BEGIN
  BEGIN
    INSERT INTO purchases (id, purchased_at, supplier_id)
    VALUES (gen_random_uuid(), now(), NULL);
    INSERT INTO _a4 VALUES ('null_insert', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _a4 VALUES ('null_insert', false, SQLERRM);
  END;
END $$;
DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM purchases WHERE supplier_id IS NOT NULL LIMIT 1;
  BEGIN
    UPDATE purchases SET supplier_id = NULL WHERE id = pid;
    INSERT INTO _a4 VALUES ('null_update', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _a4 VALUES ('null_update', false, SQLERRM);
  END;
END $$;
DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM purchases WHERE supplier_id IS NULL LIMIT 1;
  BEGIN
    UPDATE purchases SET purchased_at = purchased_at WHERE id = pid;
    INSERT INTO _a4 VALUES ('legacy_touch', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _a4 VALUES ('legacy_touch', false, SQLERRM);
  END;
END $$;
SELECT * FROM _a4;
ROLLBACK;

-- B3 bounds
\\echo ===== B3 display_seconds bounds =====
BEGIN;
CREATE TEMP TABLE _b3(step text, ok boolean, err text);
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users LIMIT 1;
  BEGIN
    INSERT INTO user_caller_id_settings (user_id, display_seconds)
    VALUES (uid, 3)
    ON CONFLICT (user_id) DO UPDATE SET display_seconds = 3;
    INSERT INTO _b3 VALUES ('set_3', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _b3 VALUES ('set_3', false, SQLERRM);
  END;
  BEGIN
    INSERT INTO user_caller_id_settings (user_id, display_seconds)
    VALUES (uid, 15)
    ON CONFLICT (user_id) DO UPDATE SET display_seconds = 15;
    INSERT INTO _b3 VALUES ('set_15', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _b3 VALUES ('set_15', false, SQLERRM);
  END;
END $$;
SELECT * FROM _b3;
ROLLBACK;

-- C2 responsible
\\echo ===== C2 responsible required =====
BEGIN;
CREATE TEMP TABLE _c2(step text, ok boolean, err text);
DO $$
DECLARE aid uuid;
BEGIN
  SELECT id INTO aid FROM auth.users LIMIT 1;
  BEGIN
    INSERT INTO sales_interactions (id, kind, author_id, salesperson_id, body, status)
    VALUES (gen_random_uuid(), 'request', aid, NULL, '[TEST-9FIX-V]', 'open');
    INSERT INTO _c2 VALUES ('null_insert', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c2 VALUES ('null_insert', false, SQLERRM);
  END;
END $$;
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM sales_interactions WHERE kind='request' AND salesperson_id IS NOT NULL LIMIT 1;
  BEGIN
    UPDATE sales_interactions SET salesperson_id = NULL WHERE id = rid;
    INSERT INTO _c2 VALUES ('null_update', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c2 VALUES ('null_update', false, SQLERRM);
  END;
END $$;
SELECT * FROM _c2;
ROLLBACK;

-- C7 won_at
\\echo ===== C7 won_at =====
BEGIN;
CREATE TEMP TABLE _c7 AS
SELECT id, won_at AS w0 FROM sales_interactions
WHERE kind='request' AND status='open' AND salesperson_id IS NOT NULL LIMIT 1;
UPDATE sales_interactions s SET status='won' FROM _c7 c WHERE s.id=c.id;
CREATE TEMP TABLE _c7b AS SELECT s.id, c.w0, s.won_at AS w1 FROM sales_interactions s JOIN _c7 c ON c.id=s.id;
UPDATE sales_interactions s SET status='open' FROM _c7 c WHERE s.id=c.id;
SELECT b.id, b.w0, b.w1 AS won_at_after_won, s.won_at AS won_at_after_reopen,
       (b.w1 IS NOT NULL) AS set_on_won, (s.won_at IS NULL) AS cleared_on_reopen
FROM _c7b b JOIN sales_interactions s ON s.id=b.id;
ROLLBACK;

-- C8 lost without reason
\\echo ===== C8 lost reason required =====
BEGIN;
CREATE TEMP TABLE _c8(step text, ok boolean, err text);
DO $$
DECLARE rid uuid;
BEGIN
  SELECT id INTO rid FROM sales_interactions
  WHERE kind='request' AND status='open' AND salesperson_id IS NOT NULL LIMIT 1;
  BEGIN
    UPDATE sales_interactions SET status='lost', lost_reason_id=NULL WHERE id=rid;
    INSERT INTO _c8 VALUES ('lost_no_reason', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c8 VALUES ('lost_no_reason', false, SQLERRM);
  END;
END $$;
-- valid lost with seed reason
DO $$
DECLARE rid uuid; lid uuid;
BEGIN
  SELECT id INTO rid FROM sales_interactions
  WHERE kind='request' AND status='open' AND salesperson_id IS NOT NULL LIMIT 1;
  SELECT id INTO lid FROM deal_lost_reasons WHERE is_active LIMIT 1;
  BEGIN
    UPDATE sales_interactions
      SET status='lost', lost_reason_id=lid, lost_reason_other='[TEST-9FIX-V]'
    WHERE id=rid;
    INSERT INTO _c8 VALUES ('lost_with_reason', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _c8 VALUES ('lost_with_reason', false, SQLERRM);
  END;
END $$;
SELECT * FROM _c8;
ROLLBACK;

-- role_permissions schema + rows
\\echo ===== role_permissions cols + salesdesk rows =====
SELECT column_name FROM information_schema.columns
WHERE table_name='role_permissions' ORDER BY ordinal_position;
SELECT * FROM role_permissions
WHERE coalesce(module::text,'') ILIKE '%sales%'
   OR coalesce(module::text,'') ILIKE '%deal%'
   OR coalesce(module::text,'') ILIKE '%activ%'
   OR coalesce(page_key::text,'') ILIKE '%sales%'
   OR coalesce(page_key::text,'') ILIKE '%deal%'
   OR coalesce(page_key::text,'') ILIKE '%activ%'
LIMIT 50;

-- D6 reminder columns
\\echo ===== D6 reminder columns =====
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions'
  AND column_name ILIKE '%remind%';

-- A2 work_items status values sample
\\echo ===== work_items status distinct =====
SELECT status::text, count(*), count(completed_at) AS with_completed
FROM work_items GROUP BY 1 ORDER BY 1;
`;

const out = psqlFile(sql, pw).replace(/PGPASSWORD=[^\s"]+/g, "PGPASSWORD=***");
writeFileSync(resolve(outDir, "sql-probes-2.txt"), out, "utf8");
console.log("Wrote sql-probes-2.txt length=" + out.length);
console.log(out);
