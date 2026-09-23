import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const sql = `
BEGIN;
DO $probe$
DECLARE
  v_product uuid;
BEGIN
  SELECT id INTO v_product FROM products LIMIT 1;
  IF v_product IS NULL THEN
    RAISE NOTICE 'PROBE_SKIP_NO_PRODUCT';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO purchases (product_id, quantity, purchase_price, purchase_date, supplier_id, currency)
    VALUES (v_product, 1, 1, CURRENT_DATE, NULL, 'toman');
    RAISE EXCEPTION 'UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE '%SUPPLIER_REQUIRED%' THEN
        RAISE NOTICE 'PROBE_FAIL_OK: %', SQLERRM;
      ELSE
        RAISE NOTICE 'PROBE_OTHER: %', SQLERRM;
        RAISE;
      END IF;
  END;
END
$probe$;
ROLLBACK;
`;

const local = join(tmpdir(), `a4-${randomUUID()}.sql`);
const remote = `/tmp/a4-${randomUUID()}.sql`;
writeFileSync(local, sql, "utf8");
spawnSync("docker", ["exec", "-i", "afrakala-lan-db", "sh", "-c", `cat > ${remote}`], {
  input: readFileSync(local),
});
const out = execFileSync(
  "docker",
  [
    "exec",
    "afrakala-lan-db",
    "bash",
    "-lc",
    `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f ${remote}`,
  ],
  { encoding: "utf8" },
);
console.log(out);
writeFileSync("docs/missions/salesdesk-9-fixes/evidence/W1/a4-probe-after.txt", out);
