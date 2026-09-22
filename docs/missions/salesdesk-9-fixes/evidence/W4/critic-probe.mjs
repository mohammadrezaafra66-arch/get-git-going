/**
 * W4-CRITIC independent probes — no builder reports.
 * Reads AFRAKALA_LAN_ENV for DB password; runs via docker exec afrakala-lan-db.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const envPath =
  process.env.AFRAKALA_LAN_ENV ||
  "D:\\AfraKalaTest\\app\\deploy\\lan\\.env.lan";
const envText = readFileSync(envPath, "utf8");
const pw = (envText.match(/^\s*POSTGRES_PASSWORD=(.+)$/m) || [])[1]
  ?.trim()
  .replace(/^["']|["']$/g, "");
if (!pw) {
  console.error("NO_PASSWORD");
  process.exit(2);
}

function psql(sql) {
  try {
    const out = execFileSync(
      "docker",
      [
        "exec",
        "-e",
        "PGPASSWORD=" + pw,
        "afrakala-lan-db",
        "psql",
        "-U",
        "supabase_admin",
        "-d",
        "afrakala",
        "-v",
        "ON_ERROR_STOP=1",
        "-t",
        "-A",
        "-F",
        "|",
        "-c",
        sql,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    return out.trim();
  } catch (e) {
    const msg = String(e.stderr || e.message || e).replace(
      /PGPASSWORD=\S+/g,
      "PGPASSWORD=***",
    );
    throw new Error(msg.slice(0, 800));
  }
}

const EXPECTED = [
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

function toHex(s) {
  return Buffer.from(s, "utf8").toString("hex");
}

const report = [];
function section(title) {
  report.push("\n## " + title);
}
function line(s) {
  report.push(s);
}

section("D2 sales_activity_types");
const rows = psql(
  `SELECT sort_order, title, encode(convert_to(title,'UTF8'),'hex') FROM public.sales_activity_types ORDER BY sort_order;`,
);
const parsed = rows
  .split("\n")
  .filter(Boolean)
  .map((r) => {
    const [sort, title, hex] = r.split("|");
    return { sort: Number(sort), title, hex };
  });
line(`count=${parsed.length}`);
let d2_ok = parsed.length === 18;
for (let i = 0; i < EXPECTED.length; i++) {
  const expHex = toHex(EXPECTED[i]);
  const got = parsed.find((p) => p.sort === i);
  const match = got && got.hex === expHex && got.title === EXPECTED[i];
  if (!match) d2_ok = false;
  line(
    `sort=${i} expected_hex=${expHex} got_hex=${got?.hex ?? "MISSING"} title_eq=${got?.title === EXPECTED[i]} hex_eq=${got?.hex === expHex}`,
  );
}
line(`D2_VERDICT_SEED=${d2_ok ? "PASS" : "FAIL"}`);

section("D1 columns + mapping");
const cols = psql(`
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions'
AND column_name IN ('activity_type_id','due_at','due_has_time','original_due_at','done_at','result_note','deal_id','salesperson_id','author_id')
ORDER BY 1;
`);
line("cols=\n" + cols);
const need = [
  "activity_type_id",
  "author_id",
  "deal_id",
  "done_at",
  "due_at",
  "due_has_time",
  "original_due_at",
  "result_note",
  "salesperson_id",
];
const have = new Set(cols.split("\n").filter(Boolean));
line(
  `D1_COLS=${need.every((c) => have.has(c)) ? "PASS" : "FAIL"} missing=${need.filter((c) => !have.has(c)).join(",")}`,
);

const mapStats = psql(`
SELECT kind,
  count(*) FILTER (WHERE activity_type_id IS NOT NULL) AS with_type,
  count(*) AS total
FROM public.sales_interactions
WHERE kind IN ('call','note')
GROUP BY kind
ORDER BY kind;
`);
line("call_note_mapping=\n" + mapStats);

const mapDetail = psql(`
SELECT si.kind, t.sort_order, t.title, count(*)
FROM public.sales_interactions si
LEFT JOIN public.sales_activity_types t ON t.id = si.activity_type_id
WHERE si.kind IN ('call','note')
GROUP BY 1,2,3
ORDER BY 1,2;
`);
line("map_detail=\n" + mapDetail);

section("D4 RPC + role_permissions");
const rpc = psql(`
SELECT proname from pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN ('count_open_activities_due_today_or_overdue','tehran_today','materialize_due_activity_reminders')
ORDER BY 1;
`);
line("rpcs=\n" + rpc);

const rpcBody = psql(`
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='count_open_activities_due_today_or_overdue';
`);
line(`count_rpc_uses_tehran_today=${/tehran_today/i.test(rpcBody)}`);

const perms = psql(`
SELECT role_name, module, can_view, can_create, can_update
FROM public.role_permissions
WHERE module = 'sales-activities'
ORDER BY 1;
`);
line("role_permissions_sales_activities=\n" + (perms || "(empty)"));

section("D6 reminder + no pg_cron");
const remCols = psql(`
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions'
AND column_name IN ('reminder_enabled','reminder_fired_at')
ORDER BY 1;
`);
line("reminder_cols=\n" + remCols);

let cronJobs = "(none)";
try {
  cronJobs = psql(`
SELECT jobid::text, schedule, command
FROM cron.job
WHERE command ILIKE '%activit%' OR command ILIKE '%reminder%' OR command ILIKE '%materialize_due%'
ORDER BY 1;
`);
} catch (e) {
  cronJobs = "ERR:" + String(e.message || e).slice(0, 200);
}
line("cron_activity_jobs_afrakala=\n" + (cronJobs || "(none)"));

section("migrations");
line(`schema_migrations_count=${psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`)}`);
line(
  "w4_versions=\n" +
    psql(`
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20260922050000','20260922050100','20260922050200','20260922050300')
ORDER BY 1;
`),
);

section("tasks untouched");
line(
  `tasks_column_count=${psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks';`)}`,
);

const outPath = resolve(
  "docs/missions/salesdesk-9-fixes/evidence/W4/critic-probe-out.txt",
);
writeFileSync(outPath, report.join("\n") + "\n", "utf8");
console.log("WROTE " + outPath);
console.log(report.join("\n"));
