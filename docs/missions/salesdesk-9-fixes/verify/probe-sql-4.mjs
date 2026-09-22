import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pw = readFileSync("D:/AfraKalaTest/app/deploy/lan/.env.lan", "utf8").match(
  /^POSTGRES_PASSWORD=(.+)$/m,
)[1].trim();

const expected = [
  "یادداشت ساده",
  "تماس ورودی",
  "تماس خروجی",
  "اعلام قیمت",
  "پیگیری و فعالیت یا حساب رسانی",
  "ویدئو چک",
  "تماس خروجی نا موفق",
  "وظیفه",
  "فیش چک",
  "پیام واتس اپ یا sms",
  "برسی اعتبار و مانده معوق مشتری برای اعلام قیمت",
  "خرید و چک کالا",
  "ارسال فاکتور در گروه مشتری و فاکتور دستی",
  "اکسل اجناس ارسال نشده",
  "ارسال نهایی",
  "ارسال بیجک یا رسید در گروه مشتری",
  "ثبت حسابداری",
  "فاکتورلاین",
];

const sql = `
-- A4 legacy NULL supplier update other cols
BEGIN;
CREATE TEMP TABLE _leg(ok boolean, err text);
DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM purchases WHERE supplier_id IS NULL LIMIT 1;
  BEGIN
    UPDATE purchases SET notes = coalesce(notes,'') WHERE id = pid;
    INSERT INTO _leg VALUES (true, NULL);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _leg VALUES (false, SQLERRM);
  END;
END $$;
SELECT * FROM _leg;
ROLLBACK;

-- D2 exact match
SELECT sort_order, title, encode(convert_to(title,'UTF8'),'hex') AS hex
FROM sales_activity_types ORDER BY sort_order;

-- assigned notification title probe (rollback)
BEGIN;
CREATE TEMP TABLE _n(step text, detail text);
DO $$
DECLARE
  aid uuid; sid uuid; oid uuid; before_c int; after_c int;
BEGIN
  SELECT id INTO aid FROM auth.users WHERE email='test.admin@afrakala.local';
  SELECT id INTO sid FROM auth.users WHERE email='test.sales@afrakala.local';
  IF aid IS NULL OR sid IS NULL THEN
    INSERT INTO _n VALUES ('skip', 'missing users');
    RETURN;
  END IF;
  SELECT count(*) INTO before_c FROM notification_queue
    WHERE user_id = sid AND created_at > now() - interval '1 minute';
  BEGIN
    INSERT INTO sales_interactions (id, kind, author_id, salesperson_id, body, status)
    VALUES (gen_random_uuid(), 'request', aid, sid, '[TEST-9FIX-V] assign', 'open')
    RETURNING id INTO oid;
    INSERT INTO _n VALUES ('inserted', oid::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _n VALUES ('insert_fail', SQLERRM);
    RETURN;
  END;
  SELECT count(*) INTO after_c FROM notification_queue WHERE user_id = sid;
  INSERT INTO _n VALUES ('nq_count', 'before_min_window_ignored after_total=' || after_c::text);
  PERFORM 1 FROM notification_queue n
    WHERE n.user_id = sid
    ORDER BY created_at DESC LIMIT 5;
  INSERT INTO _n VALUES (
    'latest_titles',
    coalesce((SELECT string_agg(coalesce(title, body, type::text), ' | ')
              FROM (SELECT title, body, type FROM notification_queue
                    WHERE user_id = sid ORDER BY created_at DESC LIMIT 5) x), 'none')
  );
END $$;
SELECT * FROM _n;
ROLLBACK;

-- product search X287 existence
SELECT id, code, name FROM products
WHERE code ILIKE '%287%' OR name ILIKE '%X287%' OR name ILIKE '%287%'
LIMIT 10;

-- pg_cron in postgres db
`;

execFileSync("docker", ["exec","-i","afrakala-lan-db","sh","-c","cat > /tmp/v4.sql"], {
  input: Buffer.from(sql, "utf8"),
});
let out = execFileSync(
  "docker",
  [
    "exec",
    "-e",
    `PGPASSWORD=${pw}`,
    "afrakala-lan-db",
    "psql",
    "-U",
    "supabase_admin",
    "-d",
    "afrakala",
    "-P",
    "pager=off",
    "-f",
    "/tmp/v4.sql",
  ],
  { encoding: "utf8" },
).replace(/PGPASSWORD=[^\s"]+/g, "PGPASSWORD=***");

// cron
let cron = "";
try {
  cron = execFileSync(
    "docker",
    [
      "exec",
      "-e",
      `PGPASSWORD=${pw}`,
      "afrakala-lan-db",
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-P",
      "pager=off",
      "-c",
      "SELECT jobid, jobname, schedule FROM cron.job ORDER BY jobid;",
    ],
    { encoding: "utf8" },
  ).replace(/PGPASSWORD=[^\s"]+/g, "PGPASSWORD=***");
} catch (e) {
  cron = String(e.stdout || e.stderr || e);
}

// compare D2 hex
const rows = [...out.matchAll(/^\s*(\d+)\s*\|\s*(.+?)\s*\|\s*([0-9a-f]+)\s*$/gm)];
const mismatches = [];
for (let i = 0; i < expected.length; i++) {
  const expHex = Buffer.from(expected[i], "utf8").toString("hex");
  const got = rows.find((r) => Number(r[1]) === i);
  if (!got) {
    mismatches.push({ i, expected: expected[i], got: null });
  } else if (got[3] !== expHex) {
    mismatches.push({
      i,
      expected: expected[i],
      expHex,
      gotTitle: got[2].trim(),
      gotHex: got[3],
    });
  }
}

const report =
  out +
  "\n===== cron.job =====\n" +
  cron +
  "\n===== D2 mismatches =====\n" +
  JSON.stringify(mismatches, null, 2) +
  "\n===== expected hex =====\n" +
  expected.map((t, i) => `${i}\t${Buffer.from(t, "utf8").toString("hex")}\t${t}`).join("\n");

writeFileSync(resolve(here, "raw/sql-probes-4.txt"), report, "utf8");
console.log(report);
