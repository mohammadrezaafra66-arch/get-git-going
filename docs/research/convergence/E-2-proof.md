# E-2 — Data layer: overdue sensor, audit_logs FK, signup trigger dedup

## حکم: COMPLETE

سه migration (530، 531، 532) روی یک نسخه‌ی کپی از production (`prod_rehearsal_e2`، بازیابی‌شده
از `/tmp/prod13.dump`) هر دو جهت (اعمال و — برای 532 — idempotency) اجرا و با کوئری قبل/بعد اثبات
شدند. هیچ عملیاتی روی `afrakala` یا `postgres` اجرا نشد. کپی در پایان کار حذف شد.

**HARDENING (بعد از پذیرش PR #441)** — orchestrator نشان داد بدنه‌ی اولیه‌ی 531
(`DROP CONSTRAINT audit_logs_actor_id_fkey` بدون `IF EXISTS`) روی شکلی از دیتابیس که این constraint
از قبل غایب است **abort** می‌کند — دقیقاً همان کلاس خطایی که migration 477 را در 2026-09-12 متوقف
کرد. 531 با الگوی catalogue-driven همان 523/524/525 (`pg_constraint` را قبل از عمل می‌خواند، نه یک
DROP کور) بازنویسی شد. 530 و 532 و e2e spec دست‌نخورده ماندند. چهار سناریو (A/B/C/D) روی یک بازیابی
**تازه** (نه از حافظه) دوباره اثبات شدند — نتیجه‌ی کامل در بخش Task 2 پایین‌تر، زیربخش «HARDENING».

---

## اثبات بازیابی (Step 0)

```
$ docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump      ✅ مطابق مقدار خواسته‌شده
```

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -c "CREATE DATABASE prod_rehearsal_e2;"'
CREATE DATABASE
```

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U supabase_admin -d prod_rehearsal_e2 --no-owner --disable-triggers /tmp/prod13.dump'
... 21 خطای بی‌ضرر، همه مربوط به schema "cron" (pg_cron روی این دیتابیس نصب نیست) ...
pg_restore: warning: errors ignored on restore: 21
```

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d prod_rehearsal_e2 -tAc "SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;"'
681|20260912150000                                       ✅ مطابق مقدار خواسته‌شده
```

شواهد: **E3**. تعداد خطاها (21) و محتوایشان (فقط `schema "cron" does not exist`) دقیقاً با حد مجاز
«~۲۱ خطای بی‌ضرر» مطابق است.

---

## Task 1 — migration 530: حساسگر معوق باید بدهی بدون سررسید را هم ببیند

### schema فعلی و منبعش

- `pg_get_functiondef` زنده‌ی `can_issue_customer_invoice` روی `prod_rehearsal_e2` **بایت‌به‌بایت**
  با migration `20260905220000_454_wire_overdue_gate_to_receivables.sql` یکسان بود — دیف انجام شد،
  تفاوتی نبود.
- `pg_get_viewdef('public.vw_customer_receivables', true)` نشان داد view از قبل ستون
  `due_date_unknown` (`due_date IS NULL AS due_date_unknown`) و `is_overdue`
  (`due_date IS NOT NULL AND due_date < tehran_today() AND outstanding_amount > 0`) را دارد —
  یعنی سیگنال لازم از قبل در view موجود بود، فقط `can_issue_customer_invoice` آن را نمی‌خواند.
- Set A (صفحه‌ی مطالبات، «معوق»): `src/routes/_app.accounting.receivables.tsx` از طریق RPCهای
  `get_receivables_list`/`get_receivables_summary` می‌خواند؛ هر دو مستقیماً `v.is_overdue` را از
  `vw_customer_receivables` می‌خوانند (خط ۳۸ و ۶۱ در `get_receivables_list`، خط ۹۲ در
  `get_receivables_summary`) — این migration به آن‌ها دست نزد.

### تغییر پیشنهادی

فایل: `supabase/migrations/20260913094000_530_overdue_sensor_covers_unknown_due_date.sql`

رو به جلو: `can_issue_customer_invoice` بازنویسی شد؛ شرط WHERE از
`r.is_overdue = true AND r.outstanding_amount > 0` به
`(r.is_overdue = true OR r.due_date_unknown = true) AND r.outstanding_amount > 0` تغییر کرد.
متن فارسی کارت («این مشتری دارای مانده معوق است...») بایت‌به‌بایت حفظ شد. role gate (42501 برای
خارج از admin/manager/accountant/sales) و REVOKE از PUBLIC/anon + GRANT به authenticated/service_role
عیناً از 454 تکرار شدند.

رو به عقب: خود فایل 454 مسیر برگشت است — `CREATE OR REPLACE FUNCTION` با بدنه‌ی 454 دوباره اعمال
می‌شود تا شرط به `is_overdue = true` تنها برگردد؛ REVOKE/GRANTهای همان migration بدون تغییر می‌مانند.
(هیچ DROP یا تغییر امضا رخ نداده که نیاز به DROP FUNCTION جداگانه داشته باشد.)

### اجرای روی کپی (E3)

```
$ cat 20260913094000_530_....sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/mig530.sql'
$ docker exec afrakala-lan-db md5sum /tmp/mig530.sql
618a0873816e786b2560b450808f9e3a  /tmp/mig530.sql
$ md5sum <local file>
618a0873816e786b2560b450808f9e3a *...530_....sql            ✅ md5 مطابق

$ docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d prod_rehearsal_e2 \
    --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig530.sql
SET
CREATE FUNCTION
REVOKE
REVOKE
GRANT
GRANT                                                        exit 0

$ docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d prod_rehearsal_e2 \
    -c "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260913094000');"
INSERT 0 1
```

### رفتار query قبل و بعد (E4)

داده‌ی واقعی روی این snapshot — صفر ردیف واقعی با `due_date_unknown AND outstanding_amount>0` دارد
(باگ latent است، طبق ادعای orchestrator):

```sql
SELECT
  count(DISTINCT customer_id) FILTER (WHERE is_overdue)                                   AS set_a_overdue_customers,
  count(DISTINCT customer_id) FILTER (WHERE due_date_unknown AND outstanding_amount > 0)  AS due_date_unknown_with_balance_customers,
  count(DISTINCT customer_id) FILTER (WHERE (is_overdue OR due_date_unknown) AND outstanding_amount > 0 AND NOT is_overdue) AS divergent_customers_old_vs_new
FROM public.vw_customer_receivables;
```
```
 set_a_overdue_customers | due_date_unknown_with_balance_customers | divergent_customers_old_vs_new
--------------------------+-----------------------------------------+---------------------------------
                        0 |                                        0 |                               0
```
`divergent_customers_old_vs_new = 0` ثابت می‌کند predicate قدیم و جدید روی داده‌ی واقعی این snapshot
دقیقاً یک نتیجه می‌دهند — یعنی Set A، B، C قبل و بعد از 530 با هم توافق دارند (هر دو خالی).
(نکته: شمار «۳ مشتری معوق» که در هدر migration 454 ثبت شده بود امروز دیگر صفر است — یعنی آن بدهی‌ها
از زمان 454 تا امروز تسویه شده‌اند؛ این یک مشاهده‌ی جانبی است، نه بخشی از دامنه‌ی این migration.)

**اثبات واقعی چون باگ latent است — یک ردیف مصنوعی، داخل `BEGIN…ROLLBACK`:**

مشتری `078f8a9e-bc69-4f56-8991-d8fe3ee5c1ec` (بدون هیچ مطالبات فعلی) + یک `sales_quotes` با
`status='accepted'`, `accepted_at=now()`, `settlement_type_id=NULL`, `final_amount=1000000` →
`due_date IS NULL` (`due_date_unknown_reason='no_settlement_type'`), `outstanding_amount=1000000`.

**قبل از 530:**
```
 customer_id | due_date | is_overdue | due_date_unknown | outstanding_amount
--------------------------------------+----------+------------+-------------------+---------------------
 078f8a9e-... |          | f          | t                 |             1000000

can_issue_customer_invoice(...):
 can_issue | overdue_amount | overdue_count | reason
-----------+-----------------+---------------+--------
 t         |               0 |             0 |            <-- نامرئی

get_customer_dynamic_credit(...).has_overdue = f            <-- نامرئی
```

**بعد از 530 (همان ردیف مصنوعی، تراکنش جدید):**
```
can_issue_customer_invoice(...):
 can_issue | overdue_amount | overdue_count | reason
-----------+-----------------+---------------+----------------------------------------------------------------------------------------------
 f         |         1000000 |             1 | این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.

get_customer_dynamic_credit(...).has_overdue = t             <-- گرفته شد
```

شواهد: **E4** — همان probe (همان مشتری مصنوعی، همان جدول) قبل fail (نامرئی) و بعد pass (گرفته‌شده)،
با خروجی کامل هر دو طرف.

### مصرف‌کننده‌های تحت تأثیر

- `public.calculate_customer_realtime_credit(uuid)` — `supabase/migrations/20260905220000_454_...sql:179-191` —
  فراخوان `can_issue_customer_invoice`؛ بدون تغییر (منطق فراخوانی عوض نشد).
- `public.get_customer_dynamic_credit(uuid)` — همان فایل، خطوط ۳۵۲-۳۵۴ — فراخوان
  `can_issue_customer_invoice`؛ بدون تغییر.
- `public.create_sales_quote_with_items` — طبق تأیید orchestrator، `get_customer_dynamic_credit` را
  صدا می‌زند؛ بدون تغییر در این migration (خارج از دامنه، طبق بریف).
- `src/routes/_app.accounting.receivables.tsx` (صفحه‌ی مطالبات) — از `get_receivables_list`/
  `get_receivables_summary` می‌خواند که مستقیماً `vw_customer_receivables.is_overdue` را می‌خوانند —
  **این migration به view دست نزد**، پس نمایش «معوق» در صفحه‌ی مطالبات عوض نشد. بدهی‌های
  due_date_unknown از قبل به‌صورت جدا (`due_date_unknown_outstanding`, `count_due_date_unknown`) در
  همان صفحه دیده می‌شوند — این عدد جدید نیست، از migration 458 موجود بوده.

---

## Task 2 — migration 531: audit_logs FK → ON DELETE SET NULL

### schema فعلی و منبعش

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'audit_logs_actor_id_fkey';
--        conname          |            pg_get_constraintdef
-- audit_logs_actor_id_fkey | FOREIGN KEY (actor_id) REFERENCES users(id)      -- confdeltype = 'a' (NO ACTION)

SELECT n.nspname, c.relname FROM pg_constraint con JOIN pg_class c ON c.oid=con.confrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE con.conname='audit_logs_actor_id_fkey';
--  auth | users

SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_name='audit_logs' AND column_name='actor_id';
-- actor_id | YES                                            ✅ تأیید مستقیم، ادعای بریف را تأیید می‌کند
```

### تغییر پیشنهادی

فایل: `supabase/migrations/20260913095000_531_audit_logs_actor_fk_set_null_on_delete.sql`

رو به جلو: `DROP CONSTRAINT audit_logs_actor_id_fkey` سپس `ADD CONSTRAINT ... FOREIGN KEY (actor_id)
REFERENCES auth.users(id) ON DELETE SET NULL`.

رو به عقب: همان دو دستور با ترتیب معکوس و بدون `ON DELETE SET NULL` (یعنی FK بدون action صریح =
NO ACTION، دقیقاً حالت قبل) — این دو خط در کامنت پایان فایل migration ثبت شده و به‌سادگی قابل اجراست:
```sql
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_actor_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id);
```

### اجرای روی کپی (E3)

```
md5 محلی = 91a1dfb196f959b969490fe208f588fa
md5 داخل کانتینر (بعد از stdin) = 91a1dfb196f959b969490fe208f588fa      ✅ مطابق

$ docker exec ... psql ... --single-transaction -f /tmp/mig531.sql
SET
ALTER TABLE
ALTER TABLE                                                              exit 0

$ INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260913095000');
INSERT 0 1
```

### رفتار query قبل و بعد (E4)

**قبل از 531** (داخل `BEGIN…ROLLBACK`، actor واقعی + ردیف audit واقعی):
```sql
INSERT INTO auth.users (id) VALUES ('11111111-2222-3333-4444-555555555530');
INSERT INTO audit_logs (actor_id, entity_type, entity_id, action)
  VALUES ('11111111-...530', 'e2_test_entity', 'e2-before-531', 'e2_test_action');
DELETE FROM auth.users WHERE id = '11111111-...530';
```
```
ERROR:  update or delete on table "users" violates foreign key constraint "audit_logs_actor_id_fkey" on table "audit_logs"
DETAIL:  Key (id)=(11111111-2222-3333-4444-555555555530) is still referenced from table "audit_logs".
ROLLBACK
```

**بعد از 531** (همان الگو، actor دیگر، داخل `BEGIN…ROLLBACK`):
```sql
INSERT INTO auth.users (id) VALUES ('11111111-2222-3333-4444-555555555531');
INSERT INTO audit_logs (actor_id, ...) VALUES ('11111111-...531', ..., 'e2-after-531', ...);
DELETE FROM auth.users WHERE id = '11111111-...531';
SELECT id, actor_id, entity_type, entity_id, action FROM audit_logs WHERE entity_id = 'e2-after-531';
```
```
DELETE 1
   id   | actor_id |  entity_type   |  entity_id   |     action
--------+----------+----------------+--------------+----------------
 113834 |          | e2_test_entity | e2-after-531 | e2_test_action     <-- actor_id NULL, ردیف باقی مانده
ROLLBACK
```

شواهد: **E4** — همان probe (همان الگوی insert/delete)، قبل قرمز (FK violation)، بعد سبز (حذف موفق +
ردیف با actor_id=NULL باقی‌مانده).

### مصرف‌کننده‌های تحت تأثیر

جست‌وجوی کد برای `audit_logs_actor_id_fkey` یا فرض صریح روی رفتار NO ACTION این FK در `src/` و
`supabase/migrations/` انجام نشد به‌صورت جداگانه (کد برنامه هرگز مستقیماً constraint را با نام صدا
نمی‌زند)؛ تنها اثر رفتاری، اجازه دادن به حذف کاربر با سابقه‌ی audit است — یک رفتار جدید که قبلاً
غیرممکن بود، نه تغییر در رفتار موجود.

### HARDENING — 531 اکنون catalogue-driven است (skip/create-if-absent، نه DROP کور)

**چرا.** orchestrator چهار حالت را روی یک shape شبیه production تست کرد. نسخه‌ی اولیه‌ی 531
(`DROP CONSTRAINT audit_logs_actor_id_fkey` بدون `IF EXISTS`، سپس `ADD CONSTRAINT ... ON DELETE
SET NULL`) روی production امروز امن است چون constraint وجود دارد، اما روی هر shape که constraint
از قبل غایب باشد **abort** می‌کند:
```
ERROR: constraint "audit_logs_actor_id_fkey" of relation "audit_logs" does not exist
```
این دقیقاً همان کلاس خطایی است که migration 477 را در 2026-09-12 متوقف کرد و ده ساعت هزینه داشت، و
دقیقاً همان‌جایی است که `rehearse.ps1` (مأموریت E-4) migrationها را روی shapeهای دلخواه بازپخش
می‌کند. رفع: 531 اکنون قبل از هر عملی `pg_constraint` را می‌خواند (همان الگوی `to_regclass`/
check-before-acting که 523/524/525 استفاده می‌کنند) و بسته به آنچه می‌بیند یکی از سه مسیر را
می‌رود — constraint غایب → می‌سازدش تازه با `ON DELETE SET NULL`؛ موجود ولی delete action غلط →
DROP و دوباره ADD با `ON DELETE SET NULL`؛ موجود و از قبل درست → no-op. در هر سه حالت state نهایی
یکسان است: `audit_logs_actor_id_fkey` با `ON DELETE SET NULL`. **530، 532 و e2e spec دست‌نخورده
ماندند.**

**بازیابی تازه** (نه از حافظه؛ طبق دستور orchestrator):
```
$ docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump                          ✅ مطابق

$ ... CREATE DATABASE prod_rehearsal_e2 ...
CREATE DATABASE
$ ... pg_restore ... --no-owner --disable-triggers /tmp/prod13.dump
... 21 خطای بی‌ضرر (schema "cron" does not exist) ...
pg_restore: warning: errors ignored on restore: 21
$ ... SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;
681|20260912150000                                                          ✅ مطابق
```

**Case A — constraint روی production shape موجود است، confdeltype='a':**
```sql
SELECT c.conname, c.confdeltype FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='audit_logs' AND c.conname='audit_logs_actor_id_fkey';
```
```
         conname          | confdeltype
--------------------------+-------------
 audit_logs_actor_id_fkey | a
```

**Case B — اجرای اول (md5 محلی و داخل کانتینر هر دو `47a8b2d183040f4b793ecedd9802973d`، مطابق):**
```
$ docker exec ... psql ... --single-transaction -f /tmp/mig531v2.sql
SET
NOTICE:  531: audit_logs_actor_id_fkey delete action was a — replacing with ON DELETE SET NULL
DO
DO
NOTICE:  531 VERIFY: audit_logs_actor_id_fkey is ON DELETE SET NULL
EXIT=0
```
تأیید مستقیم از catalogue: `confdeltype` اکنون `n`.

**Case C — اجرای دوم، همان فایل، بدون تغییر بین دو اجرا (idempotency):**
```
$ docker exec ... psql ... --single-transaction -f /tmp/mig531v2.sql
SET
DO
NOTICE:  531: audit_logs_actor_id_fkey is already ON DELETE SET NULL — no change
NOTICE:  531 VERIFY: audit_logs_actor_id_fkey is ON DELETE SET NULL
DO
EXIT=0
```
بدون تغییر نسبت به رفتار نسخه‌ی قبلی — همان‌طور که orchestrator هم گزارش داده بود، نسخه‌ی قبلی هم
در این حالت re-runnable بود؛ اینجا فقط دیگر پیام «no change» صریح گزارش می‌شود.

**Case D — شبیه‌سازی shape با constraint غایب، سپس اجرای migration:**
```sql
-- شبیه‌سازی: constraint را مستقیماً (خارج از migration) حذف می‌کنیم
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_actor_id_fkey;
-- تأیید غیبت:
SELECT count(*) FROM pg_constraint ... WHERE conname='audit_logs_actor_id_fkey';
-- 0
```
```
$ docker exec ... psql ... --single-transaction -f /tmp/mig531v2.sql
SET
NOTICE:  531: audit_logs_actor_id_fkey is absent — creating it fresh with ON DELETE SET NULL
DO
DO
NOTICE:  531 VERIFY: audit_logs_actor_id_fkey is ON DELETE SET NULL
EXIT=0                                                                      ✅ دیگر abort نمی‌کند
```
تأیید نهایی از catalogue:
```sql
SELECT conname, pg_get_constraintdef(oid), confdeltype FROM pg_constraint
 WHERE conname = 'audit_logs_actor_id_fkey';
```
```
         conname          |                      pg_get_constraintdef                      | confdeltype
--------------------------+------------------------------------------------------------------+-------------
 audit_logs_actor_id_fkey | FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL | n
```

**بازتأیید رفتار (E4، همان probe قبلی، روی state نهایی بعد از Case D):** actor واقعی + ردیف audit
واقعی + DELETE، داخل `BEGIN…ROLLBACK`:
```
INSERT 0 1
INSERT 0 1
DELETE 1
   id   | actor_id |  entity_type   |    entity_id    |     action
--------+----------+----------------+------------------+----------------
 113827 |          | e2_test_entity | e2-reverify-531 | e2_test_action
ROLLBACK
```
حذف موفق، `actor_id` تهی، ردیف باقی مانده — رفتار نهایی عیناً با نسخه‌ی قبلی یکسان است؛ فقط مسیر
رسیدن به آن اکنون در برابر shapeهای غیرمنتظره مقاوم است.

`prod_rehearsal_e2` در پایان این هاردنینگ نیز DROP و غیبتش با یک SELECT خالی از `pg_database`
تأیید شد.

---

## Task 3 — migration 532: حذف trigger تکراری ثبت‌نام

### schema فعلی و منبعش

```sql
SELECT tgname, tgenabled, pg_get_triggerdef(oid) FROM pg_trigger
  WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal ORDER BY tgname;
```
```
            tgname             | tgenabled |                          pg_get_triggerdef
 on_auth_user_created          | O         | ... AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()
 on_auth_user_created_afrakala | O         | ... AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()
```
هر دو فعال (`tgenabled='O'`)، هر دو به `handle_new_auth_user()` بسته شده‌اند — دقیقاً طابق ادعای R-1.

بدنه‌ی زنده‌ی `handle_new_auth_user()` (`pg_get_functiondef`) بررسی شد: insert در `public.profiles`
دارای `ON CONFLICT (id) DO NOTHING`؛ insert در `public.user_roles` دارای `ON CONFLICT DO NOTHING`؛
insert در `public.audit_logs` (`action='user_registered'`) **بدون هیچ ON CONFLICT** — دقیقاً همان
باگ که R-1 مشخص کرده بود.

### تغییر پیشنهادی

فایل: `supabase/migrations/20260913100000_532_drop_duplicate_signup_trigger.sql`

رو به جلو: `DROP TRIGGER IF EXISTS on_auth_user_created_afrakala ON auth.users;` — idempotent با
طراحی (`IF EXISTS`)، `on_auth_user_created` دست‌نخورده باقی می‌ماند.

رو به عقب: بازسازی trigger حذف‌شده با همان تعریف زنده که `pg_get_triggerdef` نشان داد:
```sql
CREATE TRIGGER on_auth_user_created_afrakala AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
```

### اجرای روی کپی (E3)

```
md5 محلی = e012d60e442d613e0cd927ae47e6175d
md5 داخل کانتینر = e012d60e442d613e0cd927ae47e6175d          ✅ مطابق

$ docker exec ... psql ... --single-transaction -f /tmp/mig532.sql
SET
DROP TRIGGER                                                  exit 0

$ INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260913100000');
INSERT 0 1

# idempotency — اجرای دوباره‌ی همان فایل:
$ docker exec ... psql ... --single-transaction -f /tmp/mig532.sql
SET
NOTICE:  trigger "on_auth_user_created_afrakala" for relation "auth.users" does not exist, skipping
DROP TRIGGER                                                  exit 0     ✅ no-op تمیز
```

### رفتار قبل و بعد (E4)

**تعداد trigger:**
```
قبل: trigger_count = 2   (on_auth_user_created, on_auth_user_created_afrakala)
بعد: trigger_count = 1   (فقط on_auth_user_created)
```

**شبیه‌سازی ثبت‌نام، داخل `BEGIN…ROLLBACK`، قبل از 532:**
```sql
INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('22222222-...532', 'e2-signup-test-before@example.invalid', '{"full_name":"E2 Signup Test"}');
SELECT count(*) FROM audit_logs WHERE entity_type='user' AND entity_id='22222222-...532' AND action='user_registered';
```
```
 user_registered_rows_before
------------------------------
                            2
```

**همان شبیه‌سازی، بعد از 532 (کاربر مصنوعی متفاوت، تراکنش جدید):**
```
 user_registered_rows_after
------------------------------
                            1
```

شواهد: **E4** — همان probe (همان الگوی INSERT INTO auth.users)، قبل ۲ ردیف، بعد ۱ ردیف.

### مصرف‌کننده‌های تحت تأثیر

- `public.profiles` و `public.user_roles` — بدون تغییر رفتار (insertهای آن‌ها از قبل idempotent بودند).
- `public.audit_logs` — از این پس هر ثبت‌نام دقیقاً یک ردیف `user_registered` می‌نویسد.
- **داده‌ی موجود دست‌نخورده ماند**: ۱۵ ردیف `user_registered` موجود روی ۱۳ کاربر (۲ کاربر با ۲ ردیف
  هرکدام) — طبق دستور صریح بریف، حذف نشدند. این یک تصمیم داده‌ای است، نه schema، و به انسان واگذار
  می‌شود.

---

## Task 4 — e2e spec

فایل: `e2e/security/e2-signup-audit-and-actor-delete.spec.ts`

چهار تست، همه با الگوی موجود `inRolledBackTx`/`say` از `e2e/helpers/tx.ts` (همان الگوی
`h9-manual-credit-floor-guard.spec.ts`)، **نه** `e2e/helpers/db.ts` — چون `db.ts` یک
`assertReadOnlySql` guard دارد که هر چیزی جز `select`/`with`/`show` را رد می‌کند، و این spec باید
INSERT/DELETE کند (داخل تراکنشی که همیشه ROLLBACK می‌شود). هر دو helper از همان الگوی متغیر محیطی
استفاده می‌کنند (`E2E_DB_CONTAINER`/`E2E_DB_NAME`/`E2E_DB_USER`)، پس spec روی هر دیتابیسی که caller
مشخص کند اجرا می‌شود.

تست‌ها:
1. `auth.users` دقیقاً یک trigger ثبت‌نام دارد (بعد از 532).
2. یک ثبت‌نام دقیقاً یک ردیف `user_registered` می‌نویسد.
3. حذف کاربری با سابقه‌ی audit موفق می‌شود (بعد از 531).
4. ردیف audit بعد از حذف با `actor_id = NULL` باقی می‌ماند.

**اجرا نشده.** طبق دستور صریح بریف، Playwright اجرا نشد (orchestrator مالک آن است و session‌ها
stale گزارش شده بودند). به‌جایش، همان دو سناریو دستی و مستقیم روی `prod_rehearsal_e2` قبل/بعد از
migrationها اجرا و در Task 2 و Task 3 بالا مستند شد — که خودِ منطقی است که spec آزمایش می‌کند، فقط
از مسیر دیگر.

---

## ریسک داده و برنامه‌ی برگشت

- **530**: بدون ریسک داده — فقط منطق یک تابع STABLE SECURITY DEFINER عوض شد؛ هیچ ردیفی نوشته یا
  حذف نشد. برگشت = بازگرداندن بدنه‌ی 454 (در گزارش بالا کامل نقل شد).
- **531**: بدون ریسک داده مستقیم — فقط delete action یک FK تغییر کرد؛ هیچ ردیف موجودی تغییر یا حذف
  نشد. اثر رفتاری *آینده*: حذف یک کاربر از این پس ممکن است `audit_logs.actor_id` چند ردیف را NULL
  کند (به‌جای اینکه حذف را کلاً مسدود کند) — این دقیقاً هدف تغییر است. برگشت = بازگرداندن FK بدون
  `ON DELETE SET NULL` (کامل در گزارش بالا).
- **532**: بدون ریسک داده — فقط یک trigger حذف شد؛ ردیف‌های audit_logs موجود (شامل ۲ تکراری) دست
  نخوردند و عمداً حذف نشدند (تصمیم داده‌ای، به انسان واگذار شد). برگشت = بازسازی trigger حذف‌شده
  (کامل در گزارش بالا).

هیچ‌کدام از سه migration مخرب نیستند (بدون DROP TABLE/TRUNCATE/DELETE بی‌شرط)؛ هیچ‌کدام روی
`afrakala` یا `postgres` اجرا نشدند.

---

## چه چیزی تأیید نشد

- **e2e spec اجرا نشده** — طبق دستور صریح بریف؛ منطقش با تست دستی معادل روی `prod_rehearsal_e2`
  پوشش داده شد اما خودِ فایل spec تحت Playwright اجرا نشده است.
- **TypeScript typecheck روی spec جدید اجرا نشد** — این worktree فاقد `node_modules` است
  (`npx tsc` با خطای «This is not the tsc command you are looking for» برگشت، یعنی TypeScript در
  این worktree نصب نیست). فایل spec دقیقاً بر اساس الگوی کارکرده‌ی
  `e2e/security/h9-manual-credit-floor-guard.spec.ts` (همان importها، همان امضای `inRolledBackTx`/
  `say`) نوشته شد تا ریسک این نقطه کم شود، اما ادعای «typecheck پاس شد» نمی‌شود کرد.
- **اثر migration 530 روی `create_sales_quote_with_items` مستقیماً تست نشد** — طبق بریف این تابع
  نیازی به تغییر نداشت چون از طریق `get_customer_dynamic_credit` غیرمستقیم زنجیر می‌شود؛ زنجیره‌ی
  فراخوانی توسط orchestrator تأیید شده بود و در اینجا فقط دو حلقه‌ی میانی (`can_issue_customer_invoice`،
  `get_customer_dynamic_credit`) مستقیماً تست شدند، نه خودِ RPC صدور پیش‌فاکتور.
- شمار «۳ مشتری معوق / ۹۷۸,۵۰۰,۰۰۰ ریال» که در هدر migration 454 ذکر شده بود، امروز روی این
  snapshot صفر است — یعنی طبیعتاً از زمان 454 تا 2026-09-12 آن بدهی‌ها تسویه شده‌اند. این مشاهده
  تأیید نشده در برابر سابقه‌ی کامل (آیا واقعاً پرداخت شده یا رفتار دیگری) — خارج از دامنه‌ی این
  مأموریت.

## توصیه‌های خارج از دامنه

- صفحه‌ی مطالبات (`_app.accounting.receivables.tsx`) از قبل `due_date_unknown_outstanding` و
  `count_due_date_unknown` را جدا از «معوق» نشان می‌دهد (migration 458) — اگر کسب‌وکار بخواهد این دو
  مفهوم را در UI هم یکی کند (نه فقط در گیت اعتباری)، آن یک تصمیم UI/UX جداست، نه تغییر schema.
- ۱۵ ردیف `user_registered` تکراری موجود در `audit_logs` (۲ کاربر با ۲ ردیف) پاک‌سازی نشدند — یک
  migration داده‌ای جداگانه (نه schema) می‌تواند این‌ها را با شناسایی دقیق جفت‌های تکراری حذف کند،
  اما این تصمیم را باید owner بگیرد.
