/**
 * F4 SQL helpers — seed traffic-light deals + reminder activity; cleanup markers.
 * node docs/missions/salesdesk-9-fixes/evidence/FIX/f4-sql.mjs <cmd>
 * cmds: seed | rpc-count | cleanup | marker-counts | get-original | set-due-past
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";

const SALES_ID = "ea9b35dd-fd57-4905-9355-50ca8646d4d1"; // test.sales
const SALES2_ID = "00ebe9d3-b467-453c-89d6-08bab46335c2"; // test.sales2 — preferred owner
const MARKER = "[TEST-9FIX]";
const F4_MARK = `${MARKER} F4`;

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function psql(sql) {
  const local = join(tmpdir(), `f4-sql-${randomUUID()}.sql`);
  const remote = `/tmp/f4-sql-${randomUUID()}.sql`;
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
// Prefer sales2 as responsible so badge/lights/reminder show for that session.
const salespersonId = process.env.SALESPERSON_ID || SALES2_ID;
const authorId = process.env.AUTHOR_ID || SALES2_ID;
const stamp = process.env.SEED_STAMP || String(Date.now());

if (cmd === "seed") {
  const phoneBase = process.env.PHONE_BASE || "090000003";
  const atype = scalar(
    `SELECT id::text FROM sales_activity_types ORDER BY sort_order LIMIT 1`,
  );
  const remindSecs = Number(process.env.REMIND_AHEAD_SECS || "120");

  const out = psql(`
DO $seed$
DECLARE
  atype uuid := '${atype}'::uuid;
  sid uuid := '${salespersonId}'::uuid;
  aid uuid := '${authorId}'::uuid;
  p_red uuid; p_green uuid; p_grey uuid; p_yel uuid; p_rem uuid;
  c_red uuid; c_green uuid; c_grey uuid; c_yel uuid;
  d_red uuid; d_green uuid; d_grey uuid; d_yel uuid;
  a_red uuid; a_green uuid; a_grey uuid; a_rem uuid;
  a_post uuid;
  phone text;
BEGIN
  -- overdue (red)
  phone := '${phoneBase}01';
  INSERT INTO persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(MARKER)} F4 red ${stamp}', 'internal_general', '${esc(MARKER)} F4')
  RETURNING id INTO p_red;
  INSERT INTO person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p_red, 'mobile_e164', phone, public.normalize_identifier('mobile_e164', phone, false), 'confirmed', true);
  INSERT INTO customers (name, phone, person_id, accounting_code)
  VALUES ('${esc(MARKER)} F4 red ${stamp}', phone, p_red, 'T9FR${stamp}'::text)
  RETURNING id INTO c_red;
  INSERT INTO sales_interactions (kind, status, person_id, customer_id, author_id, salesperson_id, title, body)
  VALUES ('request', 'open', p_red, c_red, aid, sid, '${esc(MARKER)} F4 deal-red ${stamp}', '${esc(MARKER)} F4 red body')
  RETURNING id INTO d_red;
  INSERT INTO sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body,
    activity_type_id, deal_id, due_at, due_has_time, original_due_at
  ) VALUES (
    'note', 'open', p_red, c_red, aid, sid, '${esc(MARKER)} F4 act-red ${stamp}', '${esc(MARKER)} overdue',
    atype, d_red, now() - interval '2 days', true, now() - interval '2 days'
  ) RETURNING id INTO a_red;

  -- today (green)
  phone := '${phoneBase}02';
  INSERT INTO persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(MARKER)} F4 green ${stamp}', 'internal_general', '${esc(MARKER)} F4')
  RETURNING id INTO p_green;
  INSERT INTO person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p_green, 'mobile_e164', phone, public.normalize_identifier('mobile_e164', phone, false), 'confirmed', true);
  INSERT INTO customers (name, phone, person_id, accounting_code)
  VALUES ('${esc(MARKER)} F4 green ${stamp}', phone, p_green, 'T9FG${stamp}'::text)
  RETURNING id INTO c_green;
  INSERT INTO sales_interactions (kind, status, person_id, customer_id, author_id, salesperson_id, title, body)
  VALUES ('request', 'open', p_green, c_green, aid, sid, '${esc(MARKER)} F4 deal-green ${stamp}', '${esc(MARKER)} F4 green body')
  RETURNING id INTO d_green;
  INSERT INTO sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body,
    activity_type_id, deal_id, due_at, due_has_time, original_due_at
  ) VALUES (
    'note', 'open', p_green, c_green, aid, sid, '${esc(MARKER)} F4 act-green ${stamp}', '${esc(MARKER)} today',
    atype, d_green,
    (public.tehran_today()::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Tehran',
    true,
    (public.tehran_today()::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Tehran'
  ) RETURNING id INTO a_green;

  -- future (grey)
  phone := '${phoneBase}03';
  INSERT INTO persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(MARKER)} F4 grey ${stamp}', 'internal_general', '${esc(MARKER)} F4')
  RETURNING id INTO p_grey;
  INSERT INTO person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p_grey, 'mobile_e164', phone, public.normalize_identifier('mobile_e164', phone, false), 'confirmed', true);
  INSERT INTO customers (name, phone, person_id, accounting_code)
  VALUES ('${esc(MARKER)} F4 grey ${stamp}', phone, p_grey, 'T9FY${stamp}'::text)
  RETURNING id INTO c_grey;
  INSERT INTO sales_interactions (kind, status, person_id, customer_id, author_id, salesperson_id, title, body)
  VALUES ('request', 'open', p_grey, c_grey, aid, sid, '${esc(MARKER)} F4 deal-grey ${stamp}', '${esc(MARKER)} F4 grey body')
  RETURNING id INTO d_grey;
  INSERT INTO sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body,
    activity_type_id, deal_id, due_at, due_has_time, original_due_at
  ) VALUES (
    'note', 'open', p_grey, c_grey, aid, sid, '${esc(MARKER)} F4 act-grey ${stamp}', '${esc(MARKER)} future',
    atype, d_grey, now() + interval '7 days', true, now() + interval '7 days'
  ) RETURNING id INTO a_grey;

  -- yellow (no activity)
  phone := '${phoneBase}04';
  INSERT INTO persons (kind, display_name, visibility_scope, notes)
  VALUES ('individual', '${esc(MARKER)} F4 yellow ${stamp}', 'internal_general', '${esc(MARKER)} F4')
  RETURNING id INTO p_yel;
  INSERT INTO person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p_yel, 'mobile_e164', phone, public.normalize_identifier('mobile_e164', phone, false), 'confirmed', true);
  INSERT INTO customers (name, phone, person_id, accounting_code)
  VALUES ('${esc(MARKER)} F4 yellow ${stamp}', phone, p_yel, 'T9FL${stamp}'::text)
  RETURNING id INTO c_yel;
  INSERT INTO sales_interactions (kind, status, person_id, customer_id, author_id, salesperson_id, title, body)
  VALUES ('request', 'open', p_yel, c_yel, aid, sid, '${esc(MARKER)} F4 deal-yellow ${stamp}', '${esc(MARKER)} F4 yellow body')
  RETURNING id INTO d_yel;

  -- D6 reminder + postpone target (on red deal, separate activity)
  INSERT INTO sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body,
    activity_type_id, deal_id, due_at, due_has_time, original_due_at,
    reminder_enabled, reminder_fired_at
  ) VALUES (
    'note', 'open', p_red, c_red, aid, sid,
    '${esc(MARKER)} F4 remind ${stamp}', '${esc(MARKER)} reminder body',
    atype, d_red, now() + (interval '1 second' * ${remindSecs}), true,
    now() + (interval '1 second' * ${remindSecs}),
    true, NULL
  ) RETURNING id INTO a_rem;

  -- postpone target: alone on grey deal so UI has one postpone control
  INSERT INTO sales_interactions (
    kind, status, person_id, customer_id, author_id, salesperson_id, title, body,
    activity_type_id, deal_id, due_at, due_has_time, original_due_at
  ) VALUES (
    'note', 'open', p_grey, c_grey, aid, sid,
    '${esc(MARKER)} F4 postpone ${stamp}', '${esc(MARKER)} postpone body',
    atype, d_grey, now() + interval '1 day', true, now() + interval '1 day'
  ) RETURNING id INTO a_post;

  CREATE TEMP TABLE _f4_seed_out (payload text);
  INSERT INTO _f4_seed_out VALUES (
    json_build_object(
      'stamp', '${esc(stamp)}',
      'salesperson_id', sid,
      'deal_red', d_red,
      'deal_green', d_green,
      'deal_grey', d_grey,
      'deal_yellow', d_yel,
      'act_red', a_red,
      'act_green', a_green,
      'act_grey', a_grey,
      'act_remind', a_rem,
      'act_postpone', a_post,
      'remind_due_at', (SELECT due_at FROM sales_interactions WHERE id = a_rem),
      'postpone_original', (SELECT original_due_at FROM sales_interactions WHERE id = a_post)
    )::text
  );
END
$seed$;
SELECT payload FROM _f4_seed_out;
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
} else if (cmd === "rpc-count") {
  const n = scalar(
    `SELECT public.count_open_activities_due_today_or_overdue('${salespersonId}'::uuid)::text`,
  );
  console.log(JSON.stringify({ salesperson_id: salespersonId, count: Number(n) }));
} else if (cmd === "get-original") {
  const id = process.argv[3] || process.env.ACTIVITY_ID;
  if (!id) {
    console.error("ACTIVITY_ID required");
    process.exit(2);
  }
  const row = scalar(`
SELECT json_build_object(
  'id', id::text,
  'due_at', due_at,
  'original_due_at', original_due_at,
  'reminder_enabled', reminder_enabled,
  'reminder_fired_at', reminder_fired_at
)::text
FROM sales_interactions WHERE id = '${id}'::uuid
`);
  console.log(row || JSON.stringify({ error: "not_found", id }));
} else if (cmd === "set-due-past") {
  // Accelerate D6: force remind due_at to past (does NOT seed reminder_fired_at).
  const id = process.argv[3] || process.env.ACTIVITY_ID;
  if (!id) {
    console.error("ACTIVITY_ID required");
    process.exit(2);
  }
  psql(`
UPDATE sales_interactions
   SET due_at = now() - interval '5 seconds'
 WHERE id = '${id}'::uuid
   AND title LIKE '${esc(F4_MARK)} remind%';
`);
  const row = scalar(`
SELECT json_build_object(
  'id', id::text,
  'due_at', due_at,
  'reminder_fired_at', reminder_fired_at,
  'reminder_enabled', reminder_enabled
)::text
FROM sales_interactions WHERE id = '${id}'::uuid
`);
  console.log(row || JSON.stringify({ error: "not_found", id }));
} else if (cmd === "fired-status") {
  const id = process.argv[3] || process.env.ACTIVITY_ID;
  if (!id) {
    console.error("ACTIVITY_ID required");
    process.exit(2);
  }
  const row = scalar(`
SELECT coalesce(
  (SELECT json_build_object(
    'id', id::text,
    'due_at', due_at,
    'original_due_at', original_due_at,
    'reminder_enabled', reminder_enabled,
    'reminder_fired_at', reminder_fired_at,
    'queue_count', (
      SELECT count(*)::int FROM notification_queue
       WHERE type = 'sales_activity_reminder'
         AND reference_id = '${id}'::uuid
    )
  )::text
  FROM sales_interactions WHERE id = '${id}'::uuid),
  '{"error":"not_found"}'
)
`);
  console.log(row);
} else if (cmd === "cleanup") {
  psql(`
DELETE FROM notification_queue
 WHERE position('${esc(MARKER)}' in title) > 0
    OR position('${esc(MARKER)}' in body) > 0
    OR (
      type = 'sales_activity_reminder'
      AND reference_id IN (
        SELECT id FROM sales_interactions
         WHERE position('${esc(MARKER)}' in title) > 0
            OR position('${esc(MARKER)}' in body) > 0
      )
    );

DELETE FROM sales_interaction_items
 WHERE position('${esc(MARKER)}' in coalesce(note,'')) > 0
    OR interaction_id IN (
         SELECT id FROM sales_interactions
          WHERE position('${esc(MARKER)}' in title) > 0
             OR position('${esc(MARKER)}' in body) > 0
       );

DELETE FROM sales_interactions
 WHERE position('${esc(MARKER)}' in title) > 0
    OR position('${esc(MARKER)}' in body) > 0;

UPDATE public.persons SET is_active = false
 WHERE position('${esc(MARKER)}' in display_name) > 0
    OR position('${esc(MARKER)}' in coalesce(notes,'')) > 0;

DELETE FROM customers
 WHERE position('${esc(MARKER)}' in name) > 0
    OR accounting_code LIKE 'T9F%';

DELETE FROM person_identifiers
 WHERE person_id IN (
   SELECT id FROM persons
   WHERE position('${esc(MARKER)}' in display_name) > 0
      OR position('${esc(MARKER)}' in coalesce(notes,'')) > 0
 );

DELETE FROM persons
 WHERE position('${esc(MARKER)}' in display_name) > 0
    OR position('${esc(MARKER)}' in coalesce(notes,'')) > 0;
`);
  console.log(JSON.stringify({ cleaned: true, scope: MARKER }));
} else if (cmd === "marker-counts") {
  const payload = {
    sales_interactions: Number(
      scalar(
        `SELECT count(*)::text FROM sales_interactions WHERE position('${esc(MARKER)}' in title) > 0 OR position('${esc(MARKER)}' in body) > 0`,
      ),
    ),
    persons: Number(
      scalar(
        `SELECT count(*)::text FROM persons WHERE position('${esc(MARKER)}' in display_name) > 0 OR position('${esc(MARKER)}' in coalesce(notes,'')) > 0`,
      ),
    ),
    customers: Number(
      scalar(`SELECT count(*)::text FROM customers WHERE position('${esc(MARKER)}' in name) > 0`),
    ),
    notification_queue: Number(
      scalar(
        `SELECT count(*)::text FROM notification_queue WHERE position('${esc(MARKER)}' in title) > 0 OR position('${esc(MARKER)}' in body) > 0`,
      ),
    ),
  };
  console.log(JSON.stringify(payload));
} else {
  console.error("unknown cmd", cmd);
  process.exit(1);
}
