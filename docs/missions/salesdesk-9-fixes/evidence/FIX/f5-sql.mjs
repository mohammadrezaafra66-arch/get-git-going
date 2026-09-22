/**
 * F5 SQL — seed marked ticket; cleanup ALL [TEST-9FIX] leftovers
 * (tickets, suppliers, purchases, persons, customers, events).
 * node docs/missions/salesdesk-9-fixes/evidence/FIX/f5-sql.mjs <cmd>
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const MARKER = "[TEST-9FIX]";
const ADMIN_ID = "05098088-2849-43f4-8eb5-7c473c3832ec";
const PRODUCT_X287 = "0da6176f-5a45-4e27-a453-c62d0932ab43";

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function psql(sql) {
  const local = join(tmpdir(), `f5-sql-${randomUUID()}.sql`);
  const remote = `/tmp/f5-sql-${randomUUID()}.sql`;
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
const stamp = process.env.SEED_STAMP || String(Date.now());
const creatorId = process.env.CREATOR_ID || ADMIN_ID;

if (cmd === "seed-ticket") {
  const title = `${MARKER} F5 ticket ${stamp}`;
  const out = psql(`
INSERT INTO work_items (title, body, status, kind, priority, creator_id, assignee_id, work_mode, impact_level)
VALUES (
  '${esc(title)}',
  '${esc(MARKER)} F5 body',
  'pending',
  'note',
  'normal',
  '${creatorId}'::uuid,
  '${creatorId}'::uuid,
  'request',
  'none'
)
RETURNING json_build_object('ticket_id', id::text, 'title', title, 'stamp', '${esc(stamp)}')::text;
`);
  const line = out
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .pop();
  if (!line) {
    console.error(out);
    process.exit(1);
  }
  console.log(line);
} else if (cmd === "ticket-status") {
  const id = process.env.TICKET_ID;
  const row = scalar(`
SELECT json_build_object(
  'id', id::text,
  'status', status,
  'completed_at', completed_at,
  'title', title,
  'event_count', (SELECT count(*) FROM work_item_events e WHERE e.work_item_id = work_items.id)
)::text FROM work_items WHERE id = '${id}'::uuid
`);
  console.log(row);
} else if (cmd === "product") {
  console.log(JSON.stringify({ product_id: PRODUCT_X287 }));
} else if (cmd === "cleanup") {
  // User brief: clean ANY leftover [TEST-9FIX] rows (including stray F5 supplier).
  const m = `%${MARKER}%`;
  psql(`
DELETE FROM purchase_idempotency
 WHERE purchase_id IN (
   SELECT id FROM purchases
    WHERE notes ILIKE '${esc(m)}'
       OR supplier_id IN (SELECT id FROM suppliers WHERE name ILIKE '${esc(m)}')
 );

DELETE FROM purchase_request_fulfillments
 WHERE purchase_id IN (
   SELECT id FROM purchases
    WHERE notes ILIKE '${esc(m)}'
       OR supplier_id IN (SELECT id FROM suppliers WHERE name ILIKE '${esc(m)}')
 );

DELETE FROM purchase_items
 WHERE purchase_id IN (
   SELECT id FROM purchases
    WHERE notes ILIKE '${esc(m)}'
       OR supplier_id IN (SELECT id FROM suppliers WHERE name ILIKE '${esc(m)}')
 );

DELETE FROM purchases
 WHERE notes ILIKE '${esc(m)}'
    OR supplier_id IN (SELECT id FROM suppliers WHERE name ILIKE '${esc(m)}');

DELETE FROM suppliers WHERE name ILIKE '${esc(m)}';

DELETE FROM work_item_events
 WHERE work_item_id IN (SELECT id FROM work_items WHERE title ILIKE '${esc(m)}');

DELETE FROM work_items WHERE title ILIKE '${esc(m)}';

DELETE FROM customers
 WHERE name ILIKE '${esc(m)}'
    OR person_id IN (
         SELECT id FROM persons
          WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}'
       );

UPDATE public.persons SET is_active = false
 WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}';

DELETE FROM person_context_links
 WHERE person_id IN (
   SELECT id FROM persons
   WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}'
 );

DELETE FROM person_identifiers
 WHERE person_id IN (
   SELECT id FROM persons
   WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}'
 );

DELETE FROM persons
 WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}';
`);
  console.log(JSON.stringify({ cleaned: true, scope: MARKER }));
} else if (cmd === "marker-counts") {
  const m = `%${MARKER}%`;
  console.log(
    JSON.stringify({
      work_items: Number(
        scalar(`SELECT count(*)::text FROM work_items WHERE title ILIKE '${esc(m)}'`),
      ),
      suppliers: Number(
        scalar(`SELECT count(*)::text FROM suppliers WHERE name ILIKE '${esc(m)}'`),
      ),
      purchases: Number(
        scalar(`SELECT count(*)::text FROM purchases WHERE notes ILIKE '${esc(m)}'`),
      ),
      persons: Number(
        scalar(
          `SELECT count(*)::text FROM persons WHERE display_name ILIKE '${esc(m)}' OR notes ILIKE '${esc(m)}'`,
        ),
      ),
      customers: Number(
        scalar(`SELECT count(*)::text FROM customers WHERE name ILIKE '${esc(m)}'`),
      ),
    }),
  );
} else if (cmd === "purchase-by-supplier") {
  const sid = process.env.SUPPLIER_ID;
  const row = scalar(`
SELECT json_build_object(
  'purchase_id', id::text,
  'supplier_id', supplier_id::text,
  'notes', notes
)::text FROM purchases
 WHERE supplier_id = '${sid}'::uuid
 ORDER BY created_at DESC
 LIMIT 1
`);
  console.log(row || JSON.stringify({ purchase_id: null }));
} else {
  console.error("unknown", cmd);
  process.exit(1);
}
