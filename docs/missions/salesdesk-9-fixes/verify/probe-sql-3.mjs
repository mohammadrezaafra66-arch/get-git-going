import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(/^POSTGRES_PASSWORD=(.+)$/m)[1].trim();

const sql = `
SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
WHERE t.typname = (SELECT udt_name FROM information_schema.columns WHERE table_name='work_items' AND column_name='status')
ORDER BY e.enumsortorder;

SELECT tgname FROM pg_trigger WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal;

SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_trigger t ON t.tgfoid=p.oid
WHERE t.tgrelid='public.work_items'::regclass AND t.tgname ILIKE '%complet%' OR t.tgname ILIKE '%closed%' OR t.tgname ILIKE '%before_write%'
LIMIT 1;

-- dump trigger names and function bodies related to completed
SELECT t.tgname, p.proname
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.work_items'::regclass AND NOT t.tgisinternal;

SELECT column_name FROM information_schema.columns
WHERE table_name='purchases' AND table_schema='public' ORDER BY ordinal_position;

SELECT module, role_name, can_view FROM role_permissions
WHERE module ILIKE '%sales%' OR module ILIKE '%deal%' OR module ILIKE '%activ%'
ORDER BY 1,2;

-- A2 retry with pending -> done if allowed
BEGIN;
CREATE TEMP TABLE _r(step text, detail text);
DO $$
DECLARE
  wid uuid;
  st text;
  c0 timestamptz; c1 timestamptz; c2 timestamptz;
BEGIN
  SELECT id, status::text, completed_at INTO wid, st, c0 FROM work_items LIMIT 1;
  INSERT INTO _r VALUES ('pick', wid::text || ' status=' || st || ' c0=' || coalesce(c0::text,'null'));
  BEGIN
    UPDATE work_items SET status = 'done' WHERE id = wid;
    SELECT completed_at INTO c1 FROM work_items WHERE id = wid;
    INSERT INTO _r VALUES ('to_done', 'c1=' || coalesce(c1::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('to_done_fail', SQLERRM);
  END;
  BEGIN
    UPDATE work_items SET status = 'completed' WHERE id = wid;
    SELECT completed_at INTO c1 FROM work_items WHERE id = wid;
    INSERT INTO _r VALUES ('to_completed', 'c1=' || coalesce(c1::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('to_completed_fail', SQLERRM);
  END;
  BEGIN
    UPDATE work_items SET status = 'closed' WHERE id = wid;
    SELECT completed_at INTO c1 FROM work_items WHERE id = wid;
    INSERT INTO _r VALUES ('to_closed', 'c1=' || coalesce(c1::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('to_closed_fail', SQLERRM);
  END;
  BEGIN
    UPDATE work_items SET status = 'pending' WHERE id = wid;
    SELECT completed_at INTO c2 FROM work_items WHERE id = wid;
    INSERT INTO _r VALUES ('back_pending', 'c2=' || coalesce(c2::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('back_pending_fail', SQLERRM);
  END;
END $$;
SELECT * FROM _r;
ROLLBACK;

-- A4 with correct columns: discover required cols
SELECT a.attname, a.attnotnull, pg_get_expr(d.adbin,d.adrelid) AS def
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.purchases'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;

BEGIN;
CREATE TEMP TABLE _a4(step text, ok boolean, err text);
DO $$
DECLARE
  cols text;
BEGIN
  BEGIN
    INSERT INTO purchases DEFAULT VALUES;
    INSERT INTO _a4 VALUES ('default_insert', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _a4 VALUES ('default_insert', false, SQLERRM);
  END;
END $$;
-- try minimal known fields from schema later
DO $$
BEGIN
  BEGIN
    EXECUTE $q$INSERT INTO purchases (supplier_id) VALUES (NULL)$q$;
    INSERT INTO _a4 VALUES ('supplier_null_only', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _a4 VALUES ('supplier_null_only', false, SQLERRM);
  END;
END $$;
SELECT * FROM _a4;
ROLLBACK;
`;

execFileSync("docker", ["exec","-i","afrakala-lan-db","sh","-c","cat > /tmp/v3.sql"], { input: Buffer.from(sql,"utf8") });
let out;
try {
  out = execFileSync("docker", ["exec","-e",`PGPASSWORD=${pw}`,"afrakala-lan-db","psql","-U","supabase_admin","-d","afrakala","-P","pager=off","-f","/tmp/v3.sql"], { encoding:"utf8", maxBuffer: 20<<20 });
} catch (e) {
  out = String(e.stdout||"")+String(e.stderr||"");
}
out = out.replace(/PGPASSWORD=[^\s"]+/g,"PGPASSWORD=***");
writeFileSync(resolve(here,"raw/schema-detail.txt"), out, "utf8");
console.log(out);
