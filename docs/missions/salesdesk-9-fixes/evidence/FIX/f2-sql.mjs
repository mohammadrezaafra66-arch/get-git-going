/**
 * F2 SQL helpers — settings backup/restore + marker cleanup.
 * Persian-safe: Node Buffer → docker exec -i (never PowerShell pipe).
 *
 * node docs/missions/salesdesk-9-fixes/evidence/FIX/f2-sql.mjs <cmd>
 * cmds: discover | settings-backup | settings-enable | settings-restore | cleanup | marker-counts
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const BACKUP = join(__dirname, "f2-settings-backup.json");

const SALES2_ID = "00ebe9d3-b467-453c-89d6-08bab46335c2";

function psql(sql) {
  const local = join(tmpdir(), `f2-sql-${randomUUID()}.sql`);
  const remote = `/tmp/f2-sql-${randomUUID()}.sql`;
  writeFileSync(local, `SET client_encoding = 'UTF8';\n\\set ON_ERROR_STOP on\n${sql}\n`, {
    encoding: "utf8",
  });
  try {
    execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "sh", "-c", `cat > ${remote}`],
      { input: readFileSync(local) },
    );
    return execFileSync(
      "docker",
      [
        "exec",
        CONTAINER,
        "bash",
        "-lc",
        `psql -U postgres -d afrakala -v ON_ERROR_STOP=1 -f ${remote}`,
      ],
      { encoding: "utf8" },
    );
  } finally {
    try {
      unlinkSync(local);
    } catch {
      /* */
    }
    try {
      execFileSync("docker", ["exec", CONTAINER, "rm", "-f", remote], {
        encoding: "utf8",
      });
    } catch {
      /* */
    }
  }
}

function scalar(sql) {
  return execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "afrakala", "-A", "-t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

const cmd = process.argv[2] || "marker-counts";

if (cmd === "discover") {
  const exts = scalar(
    `SELECT string_agg(extension || '=' || coalesce(u.email,'?'), ',' ORDER BY extension)
     FROM call_log_extensions e
     LEFT JOIN auth.users u ON u.id = e.employee_id
     WHERE e.employee_id IS NOT NULL`,
  );
  console.log(JSON.stringify({ mapped: exts, sales2: SALES2_ID }));
} else if (cmd === "settings-backup") {
  // Keep the first (pre-enable) backup if it already recorded no-row.
  if (existsSync(BACKUP)) {
    try {
      const prev = JSON.parse(readFileSync(BACKUP, "utf8"));
      if (prev && prev.existed === false) {
        console.log(JSON.stringify({ backed_up: false, kept_original_empty: true, path: BACKUP }));
        process.exit(0);
      }
    } catch {
      /* rewrite */
    }
  }
  const row = scalar(
    `SELECT coalesce(row_to_json(s)::text, '')
     FROM (SELECT * FROM user_caller_id_settings WHERE user_id = '${SALES2_ID}') s`,
  );
  const existed = Boolean(row && row !== "null" && row.startsWith("{"));
  writeFileSync(
    BACKUP,
    JSON.stringify(
      { user_id: SALES2_ID, existed, row: existed ? JSON.parse(row) : null },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ backed_up: true, existed, path: BACKUP }));
} else if (cmd === "settings-enable") {
  psql(`
INSERT INTO user_caller_id_settings (
  user_id, enabled, show_inbound, show_outbound, show_others_outbound,
  display_seconds, only_my_extension, only_my_customers, updated_at
) VALUES (
  '${SALES2_ID}', true, true, true, false,
  90, false, false, now()
)
ON CONFLICT (user_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  show_inbound = EXCLUDED.show_inbound,
  show_outbound = EXCLUDED.show_outbound,
  show_others_outbound = EXCLUDED.show_others_outbound,
  display_seconds = EXCLUDED.display_seconds,
  only_my_extension = EXCLUDED.only_my_extension,
  only_my_customers = EXCLUDED.only_my_customers,
  updated_at = now();
`);
  const after = scalar(
    `SELECT enabled::text || ',' || show_inbound::text || ',' || display_seconds::text
     FROM user_caller_id_settings WHERE user_id = '${SALES2_ID}'`,
  );
  console.log(JSON.stringify({ enabled_row: after }));
} else if (cmd === "settings-restore") {
  if (!existsSync(BACKUP)) {
    console.error("ERR=no_backup");
    process.exit(2);
  }
  const bak = JSON.parse(readFileSync(BACKUP, "utf8"));
  if (!bak.existed) {
    psql(`DELETE FROM user_caller_id_settings WHERE user_id = '${SALES2_ID}';`);
    console.log(JSON.stringify({ restored: "deleted_row" }));
  } else {
    const r = bak.row;
    psql(`
INSERT INTO user_caller_id_settings (
  user_id, enabled, show_inbound, show_outbound, show_others_outbound,
  display_seconds, only_my_extension, only_my_customers, updated_at
) VALUES (
  '${SALES2_ID}',
  ${r.enabled}, ${r.show_inbound}, ${r.show_outbound}, ${r.show_others_outbound},
  ${r.display_seconds ?? 15}, ${r.only_my_extension ?? false}, ${r.only_my_customers ?? false},
  now()
)
ON CONFLICT (user_id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  show_inbound = EXCLUDED.show_inbound,
  show_outbound = EXCLUDED.show_outbound,
  show_others_outbound = EXCLUDED.show_others_outbound,
  display_seconds = EXCLUDED.display_seconds,
  only_my_extension = EXCLUDED.only_my_extension,
  only_my_customers = EXCLUDED.only_my_customers,
  updated_at = now();
`);
    console.log(JSON.stringify({ restored: "previous_row" }));
  }
} else if (cmd === "seed-person") {
  const name = process.env.PERSON_NAME || "[TEST-9FIX] seeded";
  const phone = process.env.PERSON_PHONE || "09000000150";
  const code = process.env.PERSON_CODE || `T9F${Date.now().toString().slice(-8)}`;
  const esc = (s) => s.replace(/'/g, "''");
  const out = psql(`
WITH p AS (
  INSERT INTO public.persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(name)}', 'internal_general', '[TEST-9FIX]')
  RETURNING id
),
i AS (
  INSERT INTO public.person_identifiers (
    person_id, kind, value_raw, value_normalized, status, is_primary
  )
  SELECT
    p.id,
    'mobile_e164',
    '${esc(phone)}',
    public.normalize_identifier('mobile_e164', '${esc(phone)}', false),
    'confirmed',
    true
  FROM p
  RETURNING person_id
),
c AS (
  INSERT INTO public.customers (name, phone, person_id, accounting_code)
  SELECT '${esc(name)}', '${esc(phone)}', p.id, '${esc(code)}'
  FROM p
  RETURNING id, person_id
)
SELECT c.person_id::text || '|' || c.id::text FROM c;
`);
  console.log(out);
  const pid = scalar(
    `SELECT id::text FROM persons WHERE display_name = '${esc(name)}' ORDER BY created_at DESC LIMIT 1`,
  );
  console.log(JSON.stringify({ person_id: pid, phone, name }));
} else if (cmd === "cleanup") {
  const out = [];
  out.push(
    psql(`
DELETE FROM sales_interaction_items WHERE interaction_id IN (
  SELECT id FROM sales_interactions
  WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
     OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%'
);
`),
  );
  out.push(
    psql(`
DELETE FROM sales_interactions
 WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
    OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%'
    OR deal_id IN (
      SELECT id FROM sales_interactions
      WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
    );
`),
  );
  // second pass for notes linked to deals already deleted
  out.push(
    psql(`
DELETE FROM sales_interactions
 WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
    OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%';
`),
  );
  out.push(
    psql(`
DELETE FROM call_ring_events WHERE linkedid LIKE 'TEST9FIX-%';
`),
  );
  // persons/customers created via UI/seed with marker name
  out.push(
    psql(`
UPDATE public.persons SET is_active = false
 WHERE display_name ILIKE '%[TEST-9FIX]%';
DELETE FROM public.customers WHERE name ILIKE '%[TEST-9FIX]%';
DELETE FROM public.person_identifiers WHERE person_id IN (
  SELECT id FROM public.persons WHERE display_name ILIKE '%[TEST-9FIX]%'
);
DELETE FROM public.persons WHERE display_name ILIKE '%[TEST-9FIX]%';
`),
  );
  console.log(out.join("\n"));
  console.log("CLEANUP_DONE");
} else if (cmd === "marker-counts") {
  const rings = scalar(`SELECT count(*)::text FROM call_ring_events WHERE linkedid LIKE 'TEST9FIX-%'`);
  const si = scalar(
    `SELECT count(*)::text FROM sales_interactions
     WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
        OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%'`,
  );
  const persons = scalar(
    `SELECT count(*)::text FROM persons WHERE display_name ILIKE '%[TEST-9FIX]%'`,
  );
  const customers = scalar(
    `SELECT count(*)::text FROM customers WHERE name ILIKE '%[TEST-9FIX]%'`,
  );
  console.log(
    JSON.stringify({
      call_ring_events: Number(rings),
      sales_interactions: Number(si),
      persons: Number(persons),
      customers: Number(customers),
    }),
  );
} else {
  console.error("unknown cmd", cmd);
  process.exit(1);
}
