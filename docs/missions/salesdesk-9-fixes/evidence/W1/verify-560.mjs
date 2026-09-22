import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const sql = `
SELECT column_name||'|'||data_type||'|'||is_nullable||'|'||COALESCE(column_default,'')
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='work_item_events'
 ORDER BY ordinal_position;
SELECT 'trig='||tgname FROM pg_trigger
 WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal
 ORDER BY tgname;
SELECT 'pol='||polname FROM pg_policy
 WHERE polrelid='public.work_item_events'::regclass;
SELECT 'ledger='||count(*)::text FROM supabase_migrations.schema_migrations
 WHERE version='20260921120000';
SELECT 'idx='||indexname FROM pg_indexes
 WHERE tablename='work_item_events' ORDER BY indexname;
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
  "docs/missions/salesdesk-9-fixes/evidence/W1/verify-560.txt",
  out,
);
console.log(out.toString("utf8"));
console.log("EXIT_OK");
