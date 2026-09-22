/**
 * F3 SQL helpers — seed deal/customer/item + marker cleanup + KPI/score probes.
 * Persian-safe: Node Buffer → docker exec -i (never PowerShell pipe).
 *
 * node docs/missions/salesdesk-9-fixes/evidence/FIX/f3-sql.mjs <cmd>
 * cmds:
 *   discover | seed-c9 | seed-c5-deal | kpi-score | c5-count | cleanup | marker-counts
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";

const SALES2_ID = "00ebe9d3-b467-453c-89d6-08bab46335c2"; // test.sales2 — author
const SALES_ID = "ea9b35dd-fd57-4905-9355-50ca8646d4d1"; // test.sales — responsible
const PRODUCT_X287 = "0da6176f-5a45-4e27-a453-c62d0932ab43"; // آئوولی — used in live quotes

const MARKER = "[TEST-9FIX]";

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function psql(sql) {
  const local = join(tmpdir(), `f3-sql-${randomUUID()}.sql`);
  const remote = `/tmp/f3-sql-${randomUUID()}.sql`;
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
  console.log(
    JSON.stringify(
      {
        sales2: SALES2_ID,
        sales: SALES_ID,
        product: PRODUCT_X287,
        tehran_today: scalar(`SELECT public.tehran_today()::text`),
      },
      null,
      2,
    ),
  );
} else if (cmd === "kpi-score") {
  const tag = process.env.KPI_TAG || "probe";
  const employeeId = process.env.SCORE_EMPLOYEE_ID || SALES_ID;
  const kpi = scalar(`
SELECT coalesce(sum(final_amount),0)::text || '|' || count(*)::text
FROM sales_quotes
WHERE status = 'accepted'
  AND accepted_at IS NOT NULL
  AND (accepted_at AT TIME ZONE 'Asia/Tehran')::date = public.tehran_today()
`);
  const scoreAccepted = scalar(`
SELECT coalesce(sum(final_amount),0)::text || '|' || count(*)::text
FROM sales_quotes
WHERE status = 'accepted'
  AND salesperson_id IS NOT NULL
`);
  const scoreFn = scalar(`
SELECT coalesce(
  (public.compute_employee_score('${employeeId}'::uuid, '{}'::jsonb)::jsonb
    -> 'breakdown' -> 'total_sales' ->> 'value'),
  'null'
)
`);
  const scoreTotal = scalar(`
SELECT coalesce(
  (public.compute_employee_score('${employeeId}'::uuid, '{}'::jsonb)::jsonb ->> 'total'),
  (public.compute_employee_score('${employeeId}'::uuid, '{}'::jsonb)::jsonb ->> 'normalized'),
  'null'
)
`);
  const payload = {
    tag,
    employee_id: employeeId,
    kpi_today_sum_count: kpi,
    score_accepted_sum_count: scoreAccepted,
    score_total_sales_value: scoreFn,
    score_fn_total_or_normalized: scoreTotal,
    tehran_today: scalar(`SELECT public.tehran_today()::text`),
  };
  console.log(JSON.stringify(payload));
} else if (cmd === "c5-count") {
  const authorId = process.env.AUTHOR_ID || SALES2_ID;
  const n = scalar(`
SELECT count(*)::text
FROM sales_interactions
WHERE kind = 'request'
  AND author_id = '${authorId}'::uuid
  AND salesperson_id IS NOT NULL
  AND author_id <> salesperson_id
  AND (created_at AT TIME ZONE 'Asia/Tehran')::date = public.tehran_today()
`);
  console.log(
    JSON.stringify({
      author_id: authorId,
      tehran_today: scalar(`SELECT public.tehran_today()::text`),
      count: Number(n),
    }),
  );
} else if (cmd === "seed-c9") {
  const phone = process.env.PERSON_PHONE || "09000000201";
  const name = process.env.PERSON_NAME || `${MARKER} C9 Customer`;
  const title = process.env.DEAL_TITLE || `${MARKER} C9 deal ${Date.now()}`;
  const code = process.env.PERSON_CODE || `T9FC9${Date.now().toString().slice(-6)}`;
  const authorId = process.env.AUTHOR_ID || SALES2_ID;
  const salespersonId = process.env.SALESPERSON_ID || SALES_ID;
  const productId = process.env.PRODUCT_ID || PRODUCT_X287;

  const out = psql(`
WITH p AS (
  INSERT INTO public.persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(name)}', 'internal_general', '${esc(MARKER)} F3-C9')
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
),
d AS (
  INSERT INTO public.sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body
  )
  SELECT
    'request',
    'open',
    c.person_id,
    c.id,
    '${authorId}'::uuid,
    '${salespersonId}'::uuid,
    '${esc(title)}',
    '${esc(MARKER)} C9 request body'
  FROM c
  RETURNING id, customer_id, person_id, author_id, salesperson_id
),
it AS (
  INSERT INTO public.sales_interaction_items (interaction_id, product_id, quantity, note)
  SELECT d.id, '${productId}'::uuid, 1, '${esc(MARKER)} C9 item'
  FROM d
  RETURNING id, interaction_id, product_id
)
SELECT json_build_object(
  'deal_id', d.id::text,
  'customer_id', d.customer_id::text,
  'person_id', d.person_id::text,
  'author_id', d.author_id::text,
  'salesperson_id', d.salesperson_id::text,
  'item_id', it.id::text,
  'product_id', it.product_id::text,
  'title', '${esc(title)}',
  'phone', '${esc(phone)}',
  'name', '${esc(name)}'
)::text
FROM d, it;
`);
  console.log(out);
  const dealId = scalar(
    `SELECT id::text FROM sales_interactions WHERE title = '${esc(title)}' ORDER BY created_at DESC LIMIT 1`,
  );
  console.log(JSON.stringify({ deal_id: dealId, title, phone, name, author_id: authorId, salesperson_id: salespersonId }));
} else if (cmd === "seed-c5-deal") {
  const phone = process.env.PERSON_PHONE || "09000000202";
  const name = process.env.PERSON_NAME || `${MARKER} C5 Customer`;
  const title = process.env.DEAL_TITLE || `${MARKER} C5 deal ${Date.now()}`;
  const code = process.env.PERSON_CODE || `T9FC5${Date.now().toString().slice(-6)}`;
  const authorId = process.env.AUTHOR_ID || SALES2_ID;
  const salespersonId = process.env.SALESPERSON_ID || SALES_ID;

  const out = psql(`
WITH p AS (
  INSERT INTO public.persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(name)}', 'internal_general', '${esc(MARKER)} F3-C5')
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
),
d AS (
  INSERT INTO public.sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body
  )
  SELECT
    'request',
    'open',
    c.person_id,
    c.id,
    '${authorId}'::uuid,
    '${salespersonId}'::uuid,
    '${esc(title)}',
    '${esc(MARKER)} C5 request body'
  FROM c
  RETURNING id, author_id, salesperson_id
)
SELECT json_build_object(
  'deal_id', d.id::text,
  'author_id', d.author_id::text,
  'salesperson_id', d.salesperson_id::text,
  'title', '${esc(title)}'
)::text
FROM d;
`);
  console.log(out);
  const dealId = scalar(
    `SELECT id::text FROM sales_interactions WHERE title = '${esc(title)}' ORDER BY created_at DESC LIMIT 1`,
  );
  console.log(JSON.stringify({ deal_id: dealId, title, author_id: authorId, salesperson_id: salespersonId }));
} else if (cmd === "cleanup") {
  const out = [];
  // Quotes linked to marked deals OR marked customer_name
  out.push(
    psql(`
DELETE FROM sales_quote_items WHERE quote_id IN (
  SELECT id FROM sales_quotes
  WHERE customer_name ILIKE '%[TEST-9FIX]%'
     OR customer_note ILIKE '%[TEST-9FIX]%'
     OR interaction_id IN (
       SELECT id FROM sales_interactions
       WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
     )
);
DELETE FROM sales_quotes
 WHERE customer_name ILIKE '%[TEST-9FIX]%'
    OR customer_note ILIKE '%[TEST-9FIX]%'
    OR interaction_id IN (
      SELECT id FROM sales_interactions
      WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
    );
`),
  );
  out.push(
    psql(`
DELETE FROM sales_interaction_items WHERE interaction_id IN (
  SELECT id FROM sales_interactions
  WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
     OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%'
) OR note ILIKE '%[TEST-9FIX]%';
`),
  );
  out.push(
    psql(`
DELETE FROM sales_interactions
 WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
    OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%';
`),
  );
  out.push(
    psql(`
UPDATE public.persons SET is_active = false
 WHERE display_name ILIKE '%[TEST-9FIX]%' OR notes ILIKE '%[TEST-9FIX]%';
DELETE FROM public.customers WHERE name ILIKE '%[TEST-9FIX]%';
DELETE FROM public.person_identifiers WHERE person_id IN (
  SELECT id FROM public.persons
  WHERE display_name ILIKE '%[TEST-9FIX]%' OR notes ILIKE '%[TEST-9FIX]%'
);
DELETE FROM public.persons
 WHERE display_name ILIKE '%[TEST-9FIX]%' OR notes ILIKE '%[TEST-9FIX]%';
`),
  );
  console.log(out.join("\n"));
  console.log("CLEANUP_DONE");
} else if (cmd === "marker-counts") {
  const quotes = scalar(
    `SELECT count(*)::text FROM sales_quotes
     WHERE customer_name ILIKE '%[TEST-9FIX]%'
        OR customer_note ILIKE '%[TEST-9FIX]%'
        OR interaction_id IN (
          SELECT id FROM sales_interactions
          WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
        )`,
  );
  const items = scalar(
    `SELECT count(*)::text FROM sales_interaction_items
     WHERE note ILIKE '%[TEST-9FIX]%'
        OR interaction_id IN (
          SELECT id FROM sales_interactions
          WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
        )`,
  );
  const si = scalar(
    `SELECT count(*)::text FROM sales_interactions
     WHERE title ILIKE '%[TEST-9FIX]%' OR body ILIKE '%[TEST-9FIX]%'
        OR title ILIKE '%TEST9FIX%' OR body ILIKE '%TEST9FIX%'`,
  );
  const persons = scalar(
    `SELECT count(*)::text FROM persons
     WHERE display_name ILIKE '%[TEST-9FIX]%' OR notes ILIKE '%[TEST-9FIX]%'`,
  );
  const customers = scalar(
    `SELECT count(*)::text FROM customers WHERE name ILIKE '%[TEST-9FIX]%'`,
  );
  console.log(
    JSON.stringify({
      sales_quotes: Number(quotes),
      sales_interaction_items: Number(items),
      sales_interactions: Number(si),
      persons: Number(persons),
      customers: Number(customers),
    }),
  );
} else if (cmd === "quote-assert") {
  const dealId = process.env.DEAL_ID;
  if (!dealId) {
    console.error("DEAL_ID required");
    process.exit(2);
  }
  const row = scalar(`
SELECT coalesce(
  (SELECT json_build_object(
     'quote_id', q.id::text,
     'status', q.status::text,
     'salesperson_id', q.salesperson_id::text,
     'interaction_id', q.interaction_id::text,
     'quote_number', q.quote_number
   )::text
   FROM sales_quotes q
   WHERE q.interaction_id = '${dealId}'::uuid
   ORDER BY q.created_at DESC LIMIT 1),
  ''
)
`);
  console.log(row || JSON.stringify({ error: "no_quote" }));
} else {
  console.error("unknown cmd", cmd);
  process.exit(1);
}
