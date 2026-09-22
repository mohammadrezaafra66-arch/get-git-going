import { execFileSync } from "node:child_process";

const sql = `
SET client_encoding='UTF8';
DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
DROP FUNCTION IF EXISTS public.work_items_log_events();
SELECT tgname FROM pg_trigger
 WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal
 ORDER BY tgname;
`;

const out = execFileSync(
  "docker",
  [
    "exec",
    "-i",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -Atv ON_ERROR_STOP=1 --single-transaction`,
  ],
  { input: Buffer.from(sql, "utf8") },
);
process.stdout.write(out);
