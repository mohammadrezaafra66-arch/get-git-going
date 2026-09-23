import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sql = `
SELECT tgname, pg_get_triggerdef(oid, true)
  FROM pg_trigger
 WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal
 ORDER BY tgname;

SELECT p.proname, pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('tg_work_item_events_from_update','work_items_log_events','tg_work_items_log_events')
 ORDER BY p.proname;
`;

const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -Atv ON_ERROR_STOP=1`,
  ],
  { input: Buffer.from(sql, "utf8") },
);
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/existing-log-events.txt",
  out,
);
process.stdout.write(out);
