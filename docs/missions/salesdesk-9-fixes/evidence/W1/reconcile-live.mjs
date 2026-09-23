import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sql = `
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version LIKE '20260921%' OR version LIKE '2026092112%'
 ORDER BY version;

SELECT 'trig='||tgname FROM pg_trigger
 WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal ORDER BY 1;

SELECT 'fn='||p.proname FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname ILIKE '%work_item%event%'
    OR (n.nspname='public' AND p.proname ILIKE '%purchases%supplier%')
    OR (n.nspname='public' AND p.proname ILIKE '%require_supplier%')
 ORDER BY 1;

SELECT 'purch_trig='||tgname FROM pg_trigger
 WHERE tgrelid='public.purchases'::regclass AND NOT tgisinternal
   AND tgname ILIKE '%supplier%' ORDER BY 1;

SELECT substring(pg_get_functiondef('public.work_items_before_write'::regproc) from 1 for 800);
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
  "docs/missions/salesdesk-9-fixes/evidence/W1/reconcile-live.txt",
  out,
);
process.stdout.write(out);
