/**
 * Independent verify SQL probes — all mutations inside BEGIN…ROLLBACK.
 * Usage: node docs/missions/salesdesk-9-fixes/verify/probe-sql.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "raw");
mkdirSync(outDir, { recursive: true });

function loadPw() {
  const envPath = "D:/AfraKalaTest/app/deploy/lan/.env.lan";
  const text = readFileSync(envPath, "utf8");
  const m = text.match(/^POSTGRES_PASSWORD=(.+)$/m);
  if (!m) throw new Error("POSTGRES_PASSWORD not found");
  return m[1].trim();
}

function psql(sql, pw) {
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
      "-c",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
}

const pw = loadPw();
const sections = [];

function run(title, sql) {
  let out;
  try {
    out = psql(sql, pw);
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "") + String(e.message);
  }
  sections.push(`\n===== ${title} =====\n${out}`);
  return out;
}

// --- Wave 1 ---
run(
  "A2 schema closed_at / completed_at",
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='work_items'
     AND column_name IN ('closed_at','completed_at','creator_id','assignee_id','created_at')
   ORDER BY 1;`
);

run(
  "A2 trigger closed_at maintenance (rollback)",
  `BEGIN;
   DO $$
   DECLARE
     wid uuid;
     before_closed timestamptz;
     after_close timestamptz;
     after_reopen timestamptz;
     st text;
   BEGIN
     SELECT id, closed_at, status::text INTO wid, before_closed, st
       FROM work_items WHERE status::text NOT IN ('done','cancelled','closed')
       LIMIT 1;
     IF wid IS NULL THEN
       RAISE NOTICE 'NO_OPEN_TICKET';
       RETURN;
     END IF;
     UPDATE work_items SET status = 'done' WHERE id = wid;
     SELECT closed_at INTO after_close FROM work_items WHERE id = wid;
     UPDATE work_items SET status = 'open' WHERE id = wid;
     SELECT closed_at INTO after_reopen FROM work_items WHERE id = wid;
     RAISE NOTICE 'wid=% before=% after_close=% after_reopen=%', wid, before_closed, after_close, after_reopen;
   END $$;
   ROLLBACK;`
);

run(
  "A3 work_item_events exists + trigger fires (rollback)",
  `BEGIN;
   SELECT to_regclass('public.work_item_events') AS events_table;
   DO $$
   DECLARE
     wid uuid;
     cnt0 int;
     cnt1 int;
   BEGIN
     SELECT id INTO wid FROM work_items LIMIT 1;
     IF wid IS NULL THEN RAISE NOTICE 'NO_TICKET'; RETURN; END IF;
     SELECT count(*) INTO cnt0 FROM work_item_events WHERE work_item_id = wid;
     UPDATE work_items SET title = coalesce(title,'') || ' [TEST-9FIX-V]' WHERE id = wid;
     SELECT count(*) INTO cnt1 FROM work_item_events WHERE work_item_id = wid;
     RAISE NOTICE 'events before=% after=% delta=%', cnt0, cnt1, cnt1-cnt0;
   END $$;
   ROLLBACK;`
);

run(
  "A4 SUPPLIER_REQUIRED insert null (rollback)",
  `BEGIN;
   DO $$
   BEGIN
     INSERT INTO purchases (id, purchased_at, supplier_id)
       VALUES (gen_random_uuid(), now(), NULL);
     RAISE NOTICE 'NULL_INSERT_SUCCEEDED';
   EXCEPTION WHEN OTHERS THEN
     RAISE NOTICE 'NULL_INSERT_FAILED sqlstate=% msg=%', SQLSTATE, SQLERRM;
   END $$;
   ROLLBACK;`
);

run(
  "A4 UPDATE non-null to null (rollback)",
  `BEGIN;
   DO $$
   DECLARE
     pid uuid;
     sid uuid;
   BEGIN
     SELECT p.id, p.supplier_id INTO pid, sid FROM purchases p
       WHERE p.supplier_id IS NOT NULL LIMIT 1;
     IF pid IS NULL THEN RAISE NOTICE 'NO_PURCHASE_WITH_SUPPLIER'; RETURN; END IF;
     BEGIN
       UPDATE purchases SET supplier_id = NULL WHERE id = pid;
       RAISE NOTICE 'NULL_UPDATE_SUCCEEDED';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'NULL_UPDATE_FAILED sqlstate=% msg=%', SQLSTATE, SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "A4 legacy NULL row other-field update (rollback)",
  `BEGIN;
   DO $$
   DECLARE
     pid uuid;
   BEGIN
     SELECT id INTO pid FROM purchases WHERE supplier_id IS NULL LIMIT 1;
     IF pid IS NULL THEN RAISE NOTICE 'NO_LEGACY_NULL'; RETURN; END IF;
     BEGIN
       UPDATE purchases SET notes = coalesce(notes,'') || '' WHERE id = pid;
       RAISE NOTICE 'LEGACY_UPDATE_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'LEGACY_UPDATE_FAILED sqlstate=% msg=%', SQLSTATE, SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "A6 SQL counts without supplier",
  `SELECT
     (SELECT count(*) FROM purchases WHERE supplier_id IS NULL) AS purchases_null_supplier,
     (SELECT count(*) FROM purchases) AS purchases_total;`
);

// --- Wave 2 ---
run(
  "B3 caller_id settings columns + check",
  `SELECT column_name, column_default, data_type
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='user_caller_id_settings'
     AND column_name IN ('display_seconds','only_my_extension','only_my_customers',
                         'enabled','show_inbound','show_outbound','show_others_outbound')
   ORDER BY 1;
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conrelid = 'public.user_caller_id_settings'::regclass
     AND contype='c';`
);

run(
  "B3 display_seconds bounds (rollback)",
  `BEGIN;
   DO $$
   DECLARE uid uuid;
   BEGIN
     SELECT id INTO uid FROM auth.users LIMIT 1;
     BEGIN
       INSERT INTO user_caller_id_settings (user_id, display_seconds)
         VALUES (uid, 3)
         ON CONFLICT (user_id) DO UPDATE SET display_seconds = 3;
       RAISE NOTICE 'DISPLAY_3_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'DISPLAY_3_FAIL msg=%', SQLERRM;
     END;
     BEGIN
       INSERT INTO user_caller_id_settings (user_id, display_seconds)
         VALUES (uid, 15)
         ON CONFLICT (user_id) DO UPDATE SET display_seconds = 15;
       RAISE NOTICE 'DISPLAY_15_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'DISPLAY_15_FAIL msg=%', SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "B1 ring storage uniqueness still per extension",
  `SELECT indexname, indexdef FROM pg_indexes
   WHERE tablename='call_ring_events' AND schemaname='public';`
);

run(
  "B5 deal_id column",
  `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sales_interactions'
     AND column_name='deal_id';`
);

// --- Wave 3 ---
run(
  "C2 RESPONSIBLE_REQUIRED insert (rollback)",
  `BEGIN;
   DO $$
   DECLARE aid uuid;
   BEGIN
     SELECT id INTO aid FROM auth.users LIMIT 1;
     BEGIN
       INSERT INTO sales_interactions (id, kind, author_id, salesperson_id, body, status)
         VALUES (gen_random_uuid(), 'request', aid, NULL, '[TEST-9FIX-V] null responsible', 'open');
       RAISE NOTICE 'NULL_RESP_INSERT_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'NULL_RESP_INSERT_FAIL msg=%', SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "C2 UPDATE responsible to null (rollback)",
  `BEGIN;
   DO $$
   DECLARE rid uuid; sid uuid;
   BEGIN
     SELECT id, salesperson_id INTO rid, sid FROM sales_interactions
       WHERE kind='request' AND salesperson_id IS NOT NULL LIMIT 1;
     IF rid IS NULL THEN RAISE NOTICE 'NO_REQUEST'; RETURN; END IF;
     BEGIN
       UPDATE sales_interactions SET salesperson_id = NULL WHERE id = rid;
       RAISE NOTICE 'NULL_RESP_UPDATE_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'NULL_RESP_UPDATE_FAIL msg=%', SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "C2 backfill leftover nulls",
  `SELECT count(*) AS null_salesperson_requests
   FROM sales_interactions WHERE kind='request' AND salesperson_id IS NULL;`
);

run(
  "C7 won_at lost_at columns + status check",
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sales_interactions'
     AND column_name IN ('won_at','lost_at','lost_reason_id','lost_reason_note','lost_reason_other')
   ORDER BY 1;
   SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='public.sales_interactions'::regclass AND contype='c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';`
);

run(
  "C7 won_at set on won (rollback)",
  `BEGIN;
   DO $$
   DECLARE rid uuid; w0 timestamptz; w1 timestamptz;
   BEGIN
     SELECT id, won_at INTO rid, w0 FROM sales_interactions
       WHERE kind='request' AND status='open' AND salesperson_id IS NOT NULL LIMIT 1;
     IF rid IS NULL THEN RAISE NOTICE 'NO_OPEN_DEAL'; RETURN; END IF;
     UPDATE sales_interactions SET status='won' WHERE id=rid;
     SELECT won_at INTO w1 FROM sales_interactions WHERE id=rid;
     RAISE NOTICE 'won before=% after=%', w0, w1;
     UPDATE sales_interactions SET status='open' WHERE id=rid;
     SELECT won_at INTO w1 FROM sales_interactions WHERE id=rid;
     RAISE NOTICE 'reopen won_at=%', w1;
   END $$;
   ROLLBACK;`
);

run(
  "C8 lost without reason (rollback)",
  `BEGIN;
   DO $$
   DECLARE rid uuid;
   BEGIN
     SELECT id INTO rid FROM sales_interactions
       WHERE kind='request' AND status='open' AND salesperson_id IS NOT NULL LIMIT 1;
     IF rid IS NULL THEN RAISE NOTICE 'NO_OPEN_DEAL'; RETURN; END IF;
     BEGIN
       UPDATE sales_interactions SET status='lost', lost_reason_id=NULL WHERE id=rid;
       RAISE NOTICE 'LOST_NO_REASON_OK';
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'LOST_NO_REASON_FAIL msg=%', SQLERRM;
     END;
   END $$;
   ROLLBACK;`
);

run(
  "C8 seed ساير hex",
  `SELECT title, sort_order, is_active,
          encode(convert_to(title,'UTF8'),'hex') AS title_hex
   FROM deal_lost_reasons ORDER BY sort_order, title;`
);

run(
  "C6 sales_interaction_items",
  `SELECT to_regclass('public.sales_interaction_items') AS items;
   SELECT column_name FROM information_schema.columns
   WHERE table_name='sales_interaction_items' ORDER BY ordinal_position;`
);

run(
  "C9 sales_quotes.interaction_id",
  `SELECT column_name FROM information_schema.columns
   WHERE table_name='sales_quotes' AND column_name='interaction_id';`
);

run(
  "C5 role_permissions deals-for-others / lost / activities",
  `SELECT module_key, role
   FROM role_permissions
   WHERE module_key ILIKE '%deal%' OR module_key ILIKE '%sales%' OR module_key ILIKE '%activit%'
   ORDER BY 1,2;`
);

// --- Wave 4 ---
run(
  "D2 activity types order+hex",
  `SELECT sort_order, title, encode(convert_to(title,'UTF8'),'hex') AS hex
   FROM sales_activity_types ORDER BY sort_order;`
);

run(
  "D1 activity columns",
  `SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='sales_interactions'
     AND column_name IN (
       'activity_type_id','due_at','due_has_time','original_due_at',
       'done_at','result_note','deal_id','reminder_at','reminder_sent_at'
     )
   ORDER BY 1;`
);

run(
  "D1 legacy kinds unchanged sample",
  `SELECT kind, count(*) FROM sales_interactions
   WHERE kind IN ('call','note','request') GROUP BY 1 ORDER BY 1;`
);

run(
  "D4 open overdue/today count via tehran_today",
  `SELECT public.tehran_today() AS tehran_today;
   SELECT count(*) AS open_due_today_or_overdue
   FROM sales_interactions si
   WHERE si.done_at IS NULL
     AND si.due_at IS NOT NULL
     AND (si.due_at::date <= public.tehran_today());`
);

run(
  "D6 no new pg_cron in afrakala (list jobs in postgres db note)",
  `SELECT 1 AS skip_cron_here;`
);

run(
  "Scope: tasks table still exists; score fn fingerprint",
  `SELECT to_regclass('public.tasks') AS tasks;
   SELECT proname, length(prosrc) AS src_len
   FROM pg_proc WHERE proname='compute_employee_score';`
);

const report = sections.join("\n");
writeFileSync(resolve(outDir, "sql-probes.txt"), report, "utf8");
console.log("Wrote verify/raw/sql-probes.txt");
console.log(report);
