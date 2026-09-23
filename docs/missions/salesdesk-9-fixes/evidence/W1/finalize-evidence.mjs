import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -At`,
    ],
    { input: Buffer.from(sql, "utf8") },
  ).toString("utf8");
}

// Clean orphan ledger from concurrent apply
const clean = psql(`
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260921120000';
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260921220000','20260921220100','20260921220200')
 ORDER BY version;
`);
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/ledger-clean.txt",
  clean,
);

// A4 probe — must fail with SUPPLIER_REQUIRED inside ROLLBACK
const a4 = `
BEGIN;
DO $$
DECLARE
  v_term uuid;
  v_err text;
BEGIN
  SELECT id INTO v_term FROM public.payment_terms LIMIT 1;
  IF v_term IS NULL THEN
    RAISE EXCEPTION 'NO_PAYMENT_TERM_FOR_PROBE';
  END IF;
  BEGIN
    INSERT INTO public.purchases (supplier_id, payment_term_id, total_amount, quantity, purchase_date, notes, status)
    VALUES (NULL, v_term, 0, 1, CURRENT_DATE, '[TEST-9FIX] A4 null supplier probe', 'draft');
    RAISE EXCEPTION 'PROBE_UNEXPECTED_SUCCESS';
  EXCEPTION WHEN others THEN
    v_err := SQLERRM;
    IF v_err NOT LIKE '%SUPPLIER_REQUIRED%' THEN
      RAISE EXCEPTION 'PROBE_WRONG_ERROR: %', v_err;
    END IF;
    RAISE NOTICE 'A4_PROBE_OK err=%', v_err;
  END;
END $$;
ROLLBACK;
`;
let a4Out = "";
let a4Rc = 0;
try {
  a4Out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1`,
    ],
    { input: Buffer.from(a4, "utf8"), encoding: "utf8" },
  );
} catch (e) {
  a4Rc = e.status ?? 1;
  a4Out = (e.stdout || "") + (e.stderr || "") + String(e.message || "");
}
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/a4-probe-after.txt",
  `rc=${a4Rc}\n${a4Out}\n`,
);

// A2 completed_at for cancelled — synthetic row in ROLLBACK
const a2 = `
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_ca timestamptz;
  v_creator uuid;
BEGIN
  SELECT id INTO v_creator FROM public.profiles LIMIT 1;
  INSERT INTO public.work_items (title, body, status, creator_id)
  VALUES ('[TEST-9FIX] completed_at cancelled', 'probe', 'pending', v_creator)
  RETURNING id INTO v_id;
  UPDATE public.work_items SET status = 'cancelled' WHERE id = v_id
  RETURNING completed_at INTO v_ca;
  IF v_ca IS NULL THEN
    RAISE EXCEPTION 'A2_PROBE_FAIL completed_at still null after cancelled';
  END IF;
  RAISE NOTICE 'A2_PROBE_OK completed_at=%', v_ca;
END $$;
ROLLBACK;
`;
let a2Out = "";
let a2Rc = 0;
try {
  a2Out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "afrakala-lan-db",
      "bash",
      "-lc",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1`,
    ],
    { input: Buffer.from(a2, "utf8"), encoding: "utf8" },
  );
} catch (e) {
  a2Rc = e.status ?? 1;
  a2Out = (e.stdout || "") + (e.stderr || "") + String(e.message || "");
}
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/a2-probe-completed-at.txt",
  `rc=${a2Rc}\n${a2Out}\n`,
);

// Verify objects
const verify = psql(`
SELECT 'trig='||tgname FROM pg_trigger
 WHERE tgrelid='public.work_items'::regclass AND NOT tgisinternal ORDER BY 1;
SELECT 'purch='||tgname FROM pg_trigger
 WHERE tgrelid='public.purchases'::regclass AND NOT tgisinternal AND tgname ILIKE '%supplier%';
SELECT 'cols='||string_agg(column_name, ',' ORDER BY ordinal_position)
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='work_item_events';
SELECT CASE WHEN pg_get_functiondef('public.work_items_before_write'::regproc)
              LIKE '%cancelled%' THEN 'fn_has_cancelled=yes' ELSE 'fn_has_cancelled=no' END;
SELECT 'persist_test9fix='||count(*)::text FROM public.purchases WHERE notes LIKE '%[TEST-9FIX]%';
SELECT 'persist_wi_test9fix='||count(*)::text FROM public.work_items WHERE title LIKE '%[TEST-9FIX]%';
`);
writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/verify-all.txt",
  verify,
);

const files = [
  ["20260921220000_560_work_item_events.sql", "20260921220000"],
  ["20260921220100_561_purchases_require_supplier.sql", "20260921220100"],
  ["20260921220200_562_work_items_completed_at_closed.sql", "20260921220200"],
];
const md5s = files.map(([f, v]) => {
  const buf = readFileSync(`supabase/migrations/${f}`);
  return {
    file: f,
    version: v,
    md5: createHash("md5").update(buf).digest("hex"),
    bytes: buf.length,
  };
});

const report = `# migrations-applied — Wave 1 (560/561/562)

Date: ${new Date().toISOString()}
DB: afrakala (afrakala-lan-db) — staging/test computer only
Apply path: Node Buffer → docker exec -i (AGENTS.md)

## Versions

| NNN | File | version | md5 | bytes |
|-----|------|---------|-----|------|
${md5s.map((r) => `| ${r.file.match(/_(\\d{3})_/)?.[1] ?? "?"} | \`${r.file}\` | ${r.version} | \`${r.md5}\` | ${r.bytes} |`).join("\n")}

Ledger: see \`ledger-clean.txt\` (orphan \`20260921120000\` removed if present).

## Reverts

- \`docs/missions/salesdesk-9-fixes/revert/560_work_item_events.sql\`
- \`docs/missions/salesdesk-9-fixes/revert/561_purchases_require_supplier.sql\`
- \`docs/missions/salesdesk-9-fixes/revert/562_work_items_completed_at_closed.sql\`

## Verify queries (live)

\`\`\`
${verify.trim()}
\`\`\`

## A4 probe (BEGIN…ROLLBACK)

\`\`\`
rc=${a4Rc}
${a4Out.trim()}
\`\`\`

Expect: exception containing \`SUPPLIER_REQUIRED\`, transaction rolled back.
No persistent \`[TEST-9FIX]\` purchase rows.

## A2 probe completed_at on cancelled (BEGIN…ROLLBACK)

\`\`\`
rc=${a2Rc}
${a2Out.trim()}
\`\`\`

## Pre-562 function dump

\`evidence/W1/before-work_items_before_write.sql\` (saved before replace).

## Notes

- Concurrent apply left both \`tg_work_item_events_from_update\` and \`work_items_log_events\`; final 560 keeps a single writer \`trg_work_items_log_events\` / \`work_items_log_events\` with field \`assignee_id\`.
- UI \`history.ts\` may still label \`assignee\` — map \`assignee_id\` in UI (out of migration scope).
`;

writeFileSync(
  "docs/missions/salesdesk-9-fixes/evidence/W1/migrations-applied.md",
  report,
);
console.log(report);
console.log("A4_RC", a4Rc, "A2_RC", a2Rc);
