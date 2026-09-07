# Issabel — زمینه‌سازی: دسترس‌پذیری، شکل CDR، و فاصلهٔ میان گزارش شبانه و پاپ‌آپ زنده

| | |
|---|---|
| مأموریت | Wave 6 groundwork · **Question B** · Agent B · نوع **READ-ONLY RESEARCH** |
| درخت | `D:\AfraKalaTest\app` · شاخه `staging` |
| SHA | `a433860410f63200ee10053bd5401bd0f739dfb8` (preflight و postflight یکسان) |
| دیتابیس | `afrakala` روی کانتینر `afrakala-lan-db` · هر دستور با `PGOPTIONS="-c default_transaction_read_only=on"` |
| میزبان اجرا | test host `192.168.170.8` |
| Issabel | `192.168.170.252` — **چهار probe، هر پورت یکی. هیچ login، هیچ query، هیچ حدس credential.** |
| تاریخ | ۲۰۲۶-۰۹-۰۶ |
| وضعیت | **COMPLETE** — ۱۰ از ۱۰ زیرسؤال پاسخ گرفت |

> **قواعدی که رعایت شد**
> - **قاعدهٔ probe:** هیچ تابع دیتابیسی صدا زده نشد. همهٔ بدنه‌ها با `pg_get_functiondef` خوانده شدند.
> - **Issabel:** دقیقاً **چهار** اتصال TCP، هر پورت یکی، timeout سه ثانیه. هیچ بایتی بعد از handshake فرستاده نشد. هیچ credential حدس زده نشد. هیچ پورت پنجمی زده نشد.
> - `192.168.170.10` (تولید) نه تماس گرفته شد، نه resolve شد، نه ping شد.
> - هیچ Playwright، هیچ e2e، هیچ browser automation، هیچ load test (wave 5 هم‌زمان روی همین DB می‌سازد).
> - هیچ migration، هیچ تغییر کد، هیچ نصب، هیچ restart، هیچ تغییر داده، هیچ تغییر وضعیت git.
> - **هیچ دادهٔ مشتری در این سند نیست** — شماره‌ها فقط به شکل نقاب‌دار (`09XXXXXXXXX`).

**برچسب‌ها:** **[E]** اندازه‌گیری‌شده اینجا · **[P]** prior art با ارجاع · **[U]** تصمیم مالک · **[doc]** دانش عمومی مستندات vendor، **نه** اندازه‌گیریِ این نصب · **[?]** نامعلوم

---

## Verdict — یک پاراگراف

**هر چهار پورت Issabel از این میزبان پاسخ می‌دهند** — ۴۴۳، ۳۳۰۶، ۵۰۳۸ و ۸۰۸۸ همگی `OPEN` **[E]** — و همین یک اندازه‌گیری، گره‌ای را باز می‌کند که prior art صریحاً «غیرقابل اندازه‌گیری از این ماشین» اعلام کرده بود **[P]**: آدرس حالا معلوم است، MySQL روی یک واسط بیرونی گوش می‌دهد (نه فقط `localhost`)، AMI روشن است، و HTTP server آستریسک بالاست. اما **باز بودن پورت فقط یعنی چیزی آنجا گوش می‌دهد؛ نه یعنی ما اجازهٔ ورود داریم** — و من به‌عمد جلوتر نرفتم، پس credential، نسخه، و ACL هر سه `UNKNOWN` می‌مانند. فراتر از آن، این مأموریت نشان می‌دهد **درخواست مالک دو پروژهٔ کاملاً متفاوت است که در یک جمله بسته‌بندی شده‌اند**: (۱) **گزارش و آرشیو**، که با **CDR** و یک import دوره‌ای حل می‌شود و همهٔ قطعاتش از قبل هست — زمان‌بند `pg_cron` زنده است و امروز سه job روی `afrakala` اجرا می‌کند **[E]**، جدول `call_logs` با RLS و تریگر امتیازدهی آماده است **[E]**، و نگاشت شماره→مشتری با ۳۶ ردیف `mobile_e164` و یک نرمال‌ساز نوشته‌شده موجود است **[E]**؛ و (۲) **پاپ‌آپ Caller-ID**، که CDR اصلاً نمی‌تواند انجامش دهد چون CDR **پس از پایان تماس** نوشته می‌شود، و به یک شنوندهٔ دائمی AMI/ARI بعلاوهٔ یک کانال push به مرورگر نیاز دارد — و **کانال push امروز وجود ندارد**: `realtime` عمداً از Kong حذف شده (`# سرویس‌های غیرفعال (realtime, functions, imgproxy, analytics) عمداً` **[E]**)، هیچ کانتینر realtime اجرا نمی‌شود، و هیچ `EventSource` در کل کد نیست. سه کمبود ساختاری هم قطعی است: **هیچ ستونی در هیچ جدولی شمارهٔ داخلی را نگه نمی‌دارد** (جست‌وجوی کل schema → `0 rows` **[E]**)، **`call_logs` نه ستون «بی‌پاسخ» دارد، نه «داخلی»، نه «تماس داخلی»، و `direction` با یک `CHECK` فقط دو مقدار می‌پذیرد** **[E]**، و **`idx_call_logs_external` یکتا نیست**، یعنی هر import دوباره داده را تکراری می‌کند **[E]**. بزرگ‌ترین ریسک پنهان این است که **هر درج در `call_logs` یک تریگر امتیازدهی را شلیک می‌کند** که در `employee_scores` و `employee_score_events` می‌نویسد — یعنی import، عارضهٔ جانبی نوشتنی دارد و «فقط وارد کردن داده» نیست **[E]**.

---

## آنچه از قبل وجود دارد — با اثبات

### B1 · دسترس‌پذیری Issabel — **هر چهار پورت باز** `[E]`

**دستور دقیق (یک اتصال TCP به ازای هر پورت، timeout سه ثانیه، هیچ بایت payload):**

```powershell
foreach ($p in 443,3306,5038,8088) {
  $c = New-Object System.Net.Sockets.TcpClient
  $t = $c.ConnectAsync('192.168.170.252',$p)
  $ok = $t.Wait(3000)
  if ($ok -and $c.Connected) { "port $p : OPEN" }
  else { "port $p : CLOSED/FILTERED (3000ms timeout)" }
  $c.Close()
}
```

**خروجی عیناً:**

```
port 443 : OPEN
port 3306 : OPEN
port 5038 : OPEN
port 8088 : OPEN
```

**آنچه این می‌گوید و آنچه نمی‌گوید — این تفکیک مهم است:**

| پورت | سرویس متعارف **[doc]** | آنچه `OPEN` **اثبات می‌کند** `[E]` | آنچه اثبات **نمی‌کند** |
|---|---|---|---|
| ۴۴۳ | رابط وب Issabel (HTTPS) | یک TCP listener روی این آدرس هست | نسخه، certificate، اینکه اصلاً Issabel است |
| ۳۳۰۶ | MySQL/MariaDB — دیتابیس `asteriskcdrdb` | **MySQL روی یک واسط بیرونی bind شده، نه فقط `127.0.0.1`** و firewall تا `192.168.170.8` بازش گذاشته | اینکه یوزری وجود دارد که از IP ما بپذیرد؛ اینکه `asteriskcdrdb` آنجاست |
| ۵۰۳۸ | AMI — Asterisk Manager Interface | **AMI در `manager.conf` روشن است و `bindaddr` روی localhost محدود نشده** | اینکه یوزر AMI ای هست، و `permit=` ما را می‌پذیرد |
| ۸۰۸۸ | HTTP server آستریسک (میزبان ARI و WebSocket) | **`http.conf` روشن است و بیرونی گوش می‌دهد** | اینکه **ARI** در `ari.conf` فعال است — این جدا از `http.conf` است **[doc]** |

> **جواب مستقیم به سؤال بازِ prior art.** `docs/research/issabel-feasibility-20260906.md:129-...` سؤال‌های مالک ۱ و ۳ تا ۵ را «مسدودکننده و غیرقابل اندازه‌گیری از این ماشین» گذاشته بود **[P]**. با آدرسی که مالک داده، **سؤال ۱ بسته شد** و سؤال‌های ۳/۴/۵ **نیمه‌بسته** شدند: می‌دانیم سه سرویس گوش می‌دهند، ولی نمی‌دانیم ما را راه می‌دهند.

> **بودجهٔ probe مصرف شد: ۴ از ۴. هیچ probe پنجمی زده نشد و نباید زده شود.**

### B2 · جدول `call_logs` — ساخته، محافظت‌شده، خالی `[E]`

**ستون‌ها (زنده):**

```
$ docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" \
    afrakala-lan-db psql -d afrakala -X -A -F'|' -c \
    "select ordinal_position, column_name, data_type, is_nullable, coalesce(column_default,'')
     from information_schema.columns
     where table_schema='public' and table_name='call_logs' order by ordinal_position;"

ordinal_position|column_name|data_type|is_nullable|coalesce
1|id|uuid|NO|gen_random_uuid()
2|employee_id|uuid|NO|
3|direction|text|NO|
4|duration_seconds|integer|NO|0
5|started_at|timestamp with time zone|NO|now()
6|ended_at|timestamp with time zone|YES|
7|customer_id|uuid|YES|
8|external_id|text|YES|
9|source|text|NO|'manual'::text
10|metadata|jsonb|NO|'{}'::jsonb
11|created_at|timestamp with time zone|NO|now()
(11 rows)
```

**قیود:**

```
conname|contype|pg_get_constraintdef
call_logs_direction_check|c|CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
call_logs_pkey|p|PRIMARY KEY (id)
(2 rows)
```

**ایندکس‌ها — و نکتهٔ یکتایی:**

```
indexname|indexdef
call_logs_pkey|CREATE UNIQUE INDEX call_logs_pkey ON public.call_logs USING btree (id)
idx_call_logs_employee_time|CREATE INDEX idx_call_logs_employee_time ON public.call_logs USING btree (employee_id, started_at DESC)
idx_call_logs_external|CREATE INDEX idx_call_logs_external ON public.call_logs USING btree (external_id) WHERE (external_id IS NOT NULL)
```

`idx_call_logs_external` **`CREATE INDEX` است، نه `CREATE UNIQUE INDEX`** `[E]`. یعنی هیچ ضمانتی برای idempotency وجود ندارد: اگر یک import دو بار همان بازهٔ CDR را بردارد، همان تماس‌ها دو بار درج می‌شوند و هر درج تریگر امتیازدهی را شلیک می‌کند. prior art این را «بازبررسی‌نشده» گذاشته بود (`issabel-feasibility-20260906.md` §۴.۴) **[P]** — **اینجا بازبررسی شد و تأیید می‌شود.**

**RLS — چهار سیاست، همه `TO authenticated`:**

```
policyname|cmd|roles|qual|with_check
Admin can delete call logs|DELETE|{authenticated}|has_role(auth.uid(), 'admin'::text)|
Admin/manager can insert call logs|INSERT|{authenticated}||(has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
Admin/manager can update call logs|UPDATE|{authenticated}|(has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))|
Self/admin/manager can view call logs|SELECT|{authenticated}|((employee_id = auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))|
(4 rows)
```

**این دقیقاً D-35/D-41 را از قبل برآورده می‌کند** **[U]**: سیاست `SELECT` یعنی کارشناس فقط ردیف‌های `employee_id = auth.uid()` خودش را می‌بیند و `admin`/`manager` همه را. **هیچ کاری برای D-41 در سطح RLS لازم نیست.**

**تعداد ردیف:** `select count(*) from public.call_logs;` → `0` `[E]` — همخوان با `phone-gap-20260905.md:158` و `allocation-workbench-build-research-20260906.md:576` **[P]**.

### B3 · تریگر `trg_call_logs_recompute_employee_score` — **عارضهٔ جانبی نوشتنیِ هر import** `[E]`

```
tgname|pg_get_triggerdef
trg_call_logs_recompute_employee_score|CREATE TRIGGER trg_call_logs_recompute_employee_score AFTER INSERT OR DELETE OR UPDATE ON public.call_logs FOR EACH ROW EXECUTE FUNCTION recompute_employee_scores_on_call_log()
(1 row)
```

بدنهٔ تابع، خوانده با `pg_get_functiondef` — **صدا زده نشد** `[E]`:

```sql
CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_call_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.employee_id; ELSE _emp := NEW.employee_id; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'call_'||lower(TG_OP), 'call_logs',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
```

**چه چیزی شلیک می‌کند — `FOR EACH ROW`، نه `FOR EACH STATEMENT`:**

1. `calculate_employee_score(_emp)` را صدا می‌زند، که (طبق `phone-gap-20260905.md:252-256` **[P]**) در `employee_scores` می‌نویسد.
2. یک ردیف در `employee_score_events` با `event_type='call_insert'` و `source_table='call_logs'` درج می‌کند.
3. `EXCEPTION WHEN OTHERS THEN NULL` — یعنی **هر خطایی بی‌صدا بلعیده می‌شود**. اگر امتیازدهی بشکند، import سبز گزارش می‌دهد.

**پیامد برای import:** درج ۵۰۰ تماس یعنی **۵۰۰ بار** بازمحاسبهٔ امتیاز و **۵۰۰ ردیف** در `employee_score_events`. این یک نکتهٔ اندازه است، نه یک باگ — ولی باید قبل از اولین import دیده شود، نه بعدش.

### B4 · زمان‌بند `pg_cron` — **زنده، و امروز روی `afrakala` کار می‌کند** `[E]`

این تناقض مستقیم با یکی از prior artهاست و باید صریح ثبت شود.

```
$ ... psql -d afrakala -c "select extname, extversion from pg_extension order by 1;"
btree_gist|1.7
pg_graphql|1.5.7
pg_stat_statements|1.10
pg_trgm|1.6
pgcrypto|1.3
pgjwt|0.2.0
pgsodium|3.1.8
plpgsql|1.0
supabase_vault|0.2.8
uuid-ossp|1.1
vector|0.7.4
(11 rows)                      <-- pg_cron نیست

$ ... psql -d postgres -c "select extname, extversion from pg_extension where extname='pg_cron';"
extname|extversion
pg_cron|1.6
(1 row)

$ ... psql -d postgres -c "select jobid, schedule, database, username, active, left(command,90) from cron.job order by jobid;"
jobid|schedule|database|username|active|cmd
9|0 6 * * *|postgres|postgres|t| SELECT public.generate_birthday_notifications();
20|30 22 * * *|afrakala|supabase_admin|t|SELECT public.capture_score_snapshots();
21|45 22 * * *|afrakala|supabase_admin|t|SELECT public.refresh_all_sale_list_prices();
22|0 23 * * *|afrakala|supabase_admin|t|SELECT public.sync_product_price_observatory_rows();
(4 rows)
```

**سه ردیف با `database='afrakala'` و `active='t'` — این خودِ اثباتِ کارکردنِ `cron.schedule_in_database` است.** دلیلش هم در repo مستند است — `supabase/migrations/20260905140000_445_scheduled_jobs_documentation.sql:5-18`:

```
-- pg_cron 1.6 is installed in the *postgres* database, because the background
-- worker reads its job list from the database named by cron.database_name,
-- which is 'postgres' on this deployment. Creating the extension here is
-- refused outright:
--
--   ERROR:  can only create extension in database postgres
--   ...
-- The jobs themselves therefore live in postgres and are registered by
-- deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql. They execute
-- against afrakala via cron.schedule_in_database(...,'afrakala'), which needs
-- no configuration change and no container restart.
```

**و یک تنظیم که هر برنامه‌ریزی زمانی را عوض می‌کند** `[E]`:

```
$ ... psql -d postgres -c "select name, setting from pg_settings where name like 'cron.%' order by 1;"
cron.database_name|postgres
cron.timezone|GMT
...
$ ... psql -d afrakala -c "show timezone;"  ->  UTC
```

**`cron.timezone = GMT`.** ساعت‌های D-39 به وقت تهران‌اند و تهران **UTC+03:30** است — با نیم‌ساعت، نه ساعت کامل. یعنی هر بیان cron برای D-39 روی **دقیقهٔ ۳۰** می‌افتد، نه دقیقهٔ ۰. (جدول کامل در بخش «آنچه باید ساخته شود».)

### B5 · نگاشت شماره → مشتری (D-36) — **از قبل هست و شکلش دقیقاً معلوم است** `[E]`

**۳۶ ردیف `mobile_e164` — تأیید prior art:**

```
$ ... -c "select kind, count(*) from public.person_identifiers group by kind order by 2 desc;"
kind|count
mobile_e164|36
asan_person_code|19
(2 rows)
```

همخوان با `issabel-feasibility-20260906.md` («`mobile_e164` **۳۶**») **[P]**.

**قالب ذخیره‌سازی، بدون افشای هیچ شماره‌ای** — الگو با `regexp_replace(value,'[0-9]','X','g')` نقاب‌دار شد `[E]`:

```
$ ... -c "select distinct regexp_replace(value_normalized,'[0-9]','X','g') as masked_pattern,
          count(*) over (partition by regexp_replace(value_normalized,'[0-9]','X','g'))
          from public.person_identifiers where kind='mobile_e164';"
masked_pattern|count
+XXXXXXXXXXXX|36
(1 row)

$ ... -c "select kind, length(value_raw), (value_raw ~ '^\+98'), (value_raw ~ '^0'), count(*)
          from public.person_identifiers group by 1,2,3,4 order by 1,2;"
mobile_e164|11|f|t|36        <-- value_raw: ۱۱ رقم، با 0 شروع
mobile_e164 (normalized)|13|t|f|36   <-- value_normalized: +98 و ۱۰ رقم
```

پس **هر ۳۶ ردیف:** `value_raw` = `09XXXXXXXXX` (۱۱ کاراکتر) و `value_normalized` = `+989XXXXXXXXX` (۱۳ کاراکتر). **صفر استثنا.**

**ایندکس معکوس هم از قبل هست** — دقیقاً همان جهتی که یک import لازم دارد `[E]`:

```
idx_person_identifiers_kind_value|CREATE INDEX idx_person_identifiers_kind_value ON public.person_identifiers USING btree (kind, value_normalized)
uq_person_identifiers_contact_global|CREATE UNIQUE INDEX ... btree (kind, value_normalized) WHERE ((status <> 'revoked') AND (kind = ANY (ARRAY['mobile_e164','email'])))
```

`uq_person_identifiers_contact_global` **یکتاست** — یعنی یک شمارهٔ موبایل حداکثر به یک شخص می‌خورد و جست‌وجوی معکوس مبهم نمی‌شود.

**نرمال‌ساز نوشته‌شده، آماده، و دقیقاً همان چهار قالبی را می‌پذیرد که یک CDR می‌تواند بدهد** — `src/lib/persons/identifiers-normalize.ts:106-119`:

```ts
    case "mobile_e164": {
      // Iran mobile only — stable E.164 form +98 9XXXXXXXXX.
      const d = digitsOnly(trimmed);
      // Accept 09XXXXXXXXX | 9XXXXXXXXX | 989XXXXXXXXX | 00989XXXXXXXXX
      let core: string | null = null;
      if (/^00989\d{9}$/.test(d)) core = d.slice(4);
      else if (/^989\d{9}$/.test(d)) core = d.slice(2);
      else if (/^09\d{9}$/.test(d)) core = d.slice(1);
      else if (/^9\d{9}$/.test(d)) core = d;
      if (!core) {
        return err("invalid_format", "شماره موبایل ایران معتبر نیست (مثال: 09121234567)");
      }
      return { ok: true, value_normalized: "+98" + core };
    }
```

و `toAsciiDigits` (سطر ۴۴-۵۲) ارقام فارسی/عربی را هم می‌پذیرد. **پس نرمال‌سازی «باید ساخته شود» نیست — نوشته شده است.**

> **`normalizeSearchText` که بریف نام برده، نرمال‌سازِ تلفن نیست** `[E]`. آن در `src/lib/i18n/search-normalizer.ts:10` است و برای جست‌وجوی متن فارسی به کار می‌رود (`src/lib/navigation/search.ts:1`، `src/routes/_app.products.index.tsx:36` و ۸ مصرف‌کنندهٔ دیگر). نرمال‌سازِ تلفن `normalizeIdentifier('mobile_e164', …)` است.

**تابع جست‌وجو هم زنده و از frontend قابل فراخوانی است** `[E]` (خوانده شد، **صدا زده نشد**):

```
proname|args|prosecdef|proacl
person_find_by_identifiers|p_identifiers jsonb|f|{postgres=X/…,supabase_admin=X/…,authenticated=X/…,service_role=X/…}
```

`prosecdef = f` یعنی `SECURITY INVOKER` — پس RLS اعمال می‌شود و یک کارشناس فقط اشخاصی را می‌بیند که اجازه‌اش را دارد (`src/lib/persons/find-by-phone.ts:22-28` این را صریح مستند کرده).

### B6 · کانال push — **کد هست، سرور نیست** `[E]`

این حساس‌ترین یافتهٔ بخش پاپ‌آپ است و باید بدون تعارف گفته شود.

**سمت کد، به نظر می‌رسد push داریم.** ۹ فایل از `supabase.channel(...).on("postgres_changes", ...)` استفاده می‌کنند `[E]`:

```
$ git grep -n -I -E "\.channel\(|postgres_changes" HEAD -- src | head
src/components/credit/DynamicScoringSection.tsx:119:      .channel(`dyn-scoring-${entityType}-${entityId}`)
src/components/dashboard/DashboardHeader.tsx:28:    const ch = supabase.channel("dashboard-presence");
src/components/layout/AppSidebar.tsx:251:      .channel("sidebar-pending-users")
src/hooks/messenger/useAllInquiries.ts:34:      .channel(`messenger:inquiries:all:${instanceIdRef.current}`)
src/hooks/messenger/useInquiries.ts:56:      .channel(`messenger:inquiries:${groupId}:${instanceIdRef.current}`)
src/hooks/messenger/useMessengerMessages.ts:49:      .channel(`messenger:group:${groupId}`)
```

**و publication هم واقعاً پیکربندی شده** `[E]`:

```
$ ... -c "select pubname, schemaname, tablename from pg_publication_tables order by 1,2,3;"
supabase_realtime|public|customer_capital_allocations_dynamic
supabase_realtime|public|dynamic_parameter_weights
supabase_realtime|public|dynamic_scoring_parameters
supabase_realtime|public|inquiries
supabase_realtime|public|messenger_messages
supabase_realtime|public|product_computed_prices
(6 rows)
```

**ولی هیچ سرویس realtime ای وجود ندارد.** سه شاهد مستقل:

```
$ grep -n -E "^  [a-z0-9_-]+:" deploy/lan/docker-compose.yml
17:  afrakala-lan-net:   21:  lan-db-data:   22:  lan-storage-data:
28:  web:   89:  db:   124:  db-role-fix:   143:  auth:   176:  rest:
197:  storage:   227:  meta:   249:  studio:   274:  kong:   339:  caddy:

$ grep -n -i "realtime" deploy/lan/docker-compose.yml
(none)

$ docker ps --format "{{.Names}}" | grep afrakala-lan
afrakala-lan-auth  afrakala-lan-caddy  afrakala-lan-db  afrakala-lan-kong
afrakala-lan-meta  afrakala-lan-rest  afrakala-lan-storage  afrakala-lan-web
```

و **خودِ Kong می‌گوید چرا** — نقل مستقیم از config رندرشدهٔ داخل کانتینر `[E]`:

```
$ docker exec afrakala-lan-kong sh -c "sed -n '89,91p' /home/kong/kong.rendered.yml"
# سرویس‌های غیرفعال (realtime, functions, imgproxy, analytics) عمداً
# در این config وجود ندارند تا attack surface کاهش یابد. اگر در فاز بعد
# نیاز شد، service و route مربوطه را اضافه کنید.

$ docker exec afrakala-lan-kong sh -c "grep -n 'url:' /home/kong/kong.rendered.yml"
31:    url: http://auth:9999/
42:    url: http://rest:3000/
62:    url: http://storage:5000/
73:    url: http://meta:8080/
```

**چهار upstream. هیچ‌کدام realtime نیست. حذف عمدی، برای کاهش attack surface — یک تصمیم امنیتی ثبت‌شده، نه یک فراموشی.**

### B7 · SSE — **یک نمونهٔ کارگر از قبل هست، ولی یک‌طرفه و درخواست‌محور** `[E]`

```
$ git grep -n -I -E "EventSource|text/event-stream" HEAD -- src server automation scripts e2e
HEAD:src/routes/api/messenger/ai-chat.ts:170:          "Content-Type": "text/event-stream; charset=utf-8",
```

**`EventSource` صفر مورد. `text/event-stream` یک مورد.** و آن یک مورد، `src/routes/api/messenger/ai-chat.ts:169-174`:

```ts
        const sseHeaders = {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        } as const;
```

مصرف‌کننده‌اش `fetch` + `getReader()` است، نه `EventSource` — `src/components/messenger/AiAssistantDrawer.tsx:76,90`:

```ts
      const res = await fetch("/api/messenger/ai-chat", {
      ...
      const reader = res.body.getReader();
```

**فرق ماهوی که باید صریح گفته شود:** این SSE **پاسخِ یک درخواستِ کاربر** است — کاربر پیام می‌فرستد، سرور توکن‌ها را استریم می‌کند، تمام. یک پاپ‌آپ Caller-ID نیازمند **جریانی است که همیشه باز است و سرور بی‌آنکه کاربر چیزی خواسته باشد در آن می‌نویسد**. الگوی هدرها قابل استفادهٔ مجدد است؛ معماری‌اش نه.

### B8 · صفحهٔ ورود دستی — زنده و در حال استفاده `[E]/[P]`

```
$ ... -c "select count(*) rows_total, count(distinct staff_user_id) staff,
          min(metric_date)::text, max(metric_date)::text
          from public.staff_daily_performance_metrics;"
rows_total|staff|min|max
11|8|2026-07-23|2026-08-11
(1 row)
```

۱۱ ردیف از ۸ کارشناس، بازهٔ ۲۰۲۶-۰۷-۲۳ تا ۲۰۲۶-۰۸-۱۱ — همخوان با `phone-gap-20260905.md:542` **[P]** (که همان ۱۱/۸ را گزارش کرده بود؛ **تاریخ‌ها اینجا اضافه شد**: **آخرین ثبت ۲۶ روز پیش است، یعنی صفحه فعال نگه‌داشته نمی‌شود**).

### B9 · فهرست کوتاه آنچه بدون هیچ کاری قابل استفادهٔ مجدد است

| # | چه هست | مسیر | چه کاری را حل کرده |
|---|---|---|---|
| R1 | `call_logs` با ۱۱ ستون، PK، CHECK جهت، ۳ ایندکس | `supabase/migrations/20260430201059_cbcd6677-f87a-4842-a3ac-5a710470edd6.sql:72-98` | ظرف تک-تماس، شامل `external_id` برای وصل به سامانهٔ بیرونی |
| R2 | ۴ سیاست RLS روی همان جدول | زنده در `pg_policies` | **D-41 از قبل برآورده است** — self برای کارشناس، همه برای admin/manager |
| R3 | تریگر امتیازدهی روی درج | `trg_call_logs_recompute_employee_score` | XP بدون یک خط کد اضافه — **و بدون امکان خاموش کردن** |
| R4 | زمان‌بند زنده روی `afrakala` | `cron.job` در دیتابیس `postgres`، jobهای ۲۰/۲۱/۲۲ | D-39 نیازی به زیرساخت جدید ندارد |
| R5 | نرمال‌ساز موبایل ایران | `src/lib/persons/identifiers-normalize.ts:106-119` | چهار قالب ورودی → `+989XXXXXXXXX` |
| R6 | ایندکس معکوس یکتا روی شماره | `uq_person_identifiers_contact_global` | شماره → شخص، بدون ابهام، بدون ایندکس جدید |
| R7 | تابع جست‌وجوی شخص با شناسه | `public.person_find_by_identifiers(jsonb)` · `SECURITY INVOKER` · `authenticated=X` | D-36 از frontend قابل صدا زدن است |
| R8 | الگوی SSE کارگر | `src/routes/api/messenger/ai-chat.ts:169-174` | هدرها و شکل استریم |
| R9 | صفحهٔ ورود دستی تماس | `src/routes/_app.gamification.admin.manual-metrics.tsx:421-423` | مسیر جایگزین اگر Issabel به بن‌بست خورد |
| R10 | ظرف بی‌استفاده برای فیلد دلخواه کارمند | `profile_field_definitions` (۵ ردیف) / `profile_field_values` (۰ ردیف) | نگه‌داشتن «داخلی» بدون هیچ migration — با دو هزینه که در بخش بعد آمده |

---

## آنچه باید ساخته شود — با جست‌وجویی که چیزی نیافت

> هر ادعای «وجود ندارد» در این بخش، دستوری دارد که هیچ نتیجه‌ای نداد.

### C1 · هیچ ستونی برای «شمارهٔ داخلی» وجود ندارد (D-35)

**جست‌وجوی کل schema `public`** `[E]`:

```
$ ... -c "select table_schema||'.'||table_name||'.'||column_name, data_type
          from information_schema.columns
          where table_schema='public'
            and (column_name ~* 'extension|(^|_)ext($|_)|sip|pbx|asterisk|agent_num|dialer|caller')
          order by 1;"
col|data_type
(0 rows)
```

**جست‌وجوی جدول‌ها** `[E]`:

```
$ ... -c "select table_name from information_schema.tables where table_schema='public'
          and (table_name ~* 'extension|phone|call|pbx|sip|asterisk|cdr') order by 1;"
table_name
call_logs
phone_collisions
(2 rows)
```

دو جدول، هیچ‌کدام داخلی نگه نمی‌دارد.

**جست‌وجوی کد** `[E]` — هیچ hit تلفنی:

```
$ git grep -n -I -i -E "\bextension\b|ext_number|extensionNumber" HEAD -- src server automation scripts supabase openapi
```
→ هر hit یا **پسوند فایل** است (`src/components/accounting/PaymentReceiptDocuments.tsx:61,117,156,335,348` · `src/lib/images/prepare-image.ts:90`) یا **افزونهٔ Postgres** (`CREATE EXTENSION` در migrationها). **صفر مورد به معنای داخلی تلفن.**

**جست‌وجوی فارسی** `[E]`:

```
$ git grep -n -I -E "تلفن[^\"']{0,20}داخلی|داخلی[^\"']{0,20}تلفن" HEAD -- src server supabase docs
HEAD:docs/research/issabel-feasibility-20260906.md:129: ... هیچ ستون «داخلی» ای در کل schema نیست ...
```
**تنها hit، خودِ گزارشی است که همین شکاف را ثبت کرده.** یعنی صفر در کد.

**جدول‌های تنظیمات هم ظرف jsonb ندارند** `[E]`:

```
$ ... -c "select table_name, column_name from information_schema.columns where table_schema='public'
          and data_type='jsonb' and table_name ~* 'setting|config|option|preference' order by 1,2;"
(0 rows)

$ ... -c "select table_name from information_schema.tables where table_schema='public'
          and table_name ~* 'setting|config' order by 1;"
daily_capital_settings | league_settings | pricing_board_settings
recent_purchase_settings | shop_settings | workflow_settings
(6 rows)
```

هیچ‌کدام ظرف عمومی نیستند.

**آیا `profiles` ستون قابل استفادهٔ مجدد دارد؟ نه.** ۱۳ ستون، همه معنای دیگری دارند `[E]`:

```
id | full_name | phone | avatar_url | is_active | created_at | updated_at
status | position | registered_at | birth_date | last_seen_at | person_id
```

`profiles.phone` **شمارهٔ موبایل شخصیِ کارمند** است، نه داخلی — استفادهٔ دوگانه از آن معنا را خراب می‌کند. `position` متن آزادِ سِمت است.

**اندازهٔ کار** `[E]`:

```
$ ... -c "select role::text, count(*) from public.user_roles group by 1 order by 2 desc;"
admin|14   sales|14   manager|3   accountant|3   viewer|2
$ ... -c "select count(*) profiles_total, count(*) filter (where status='active') active from public.profiles;"
41|26
```

یعنی نگاشت بین **۱۴ تا ۴۱ ردیف** است — کدامش، تصمیم مالک است (سؤال ۱۲ در prior art **[P]**).

**سه ظرف ممکن، با هزینه‌های سنجیده — انتخاب مالک است، نه من** (prior art §۴.۳ این سه را کامل شکافته **[P]**؛ اینجا فقط دو عدد بازبررسی‌شده اضافه می‌شود):

- `profile_field_values` — امروز **۰ ردیف** `[E]`، `profile_field_definitions` **۵ ردیف** `[E]`. بدون migration. ولی مقدارش `jsonb` است و **ایندکس معکوس ندارد** — و import دقیقاً جهت معکوس (داخلی → کارمند) را لازم دارد.
- `person_identifiers` با `kind='extension'` — نیازمند تغییر یک CHECK. زندهٔ امروز `'extension'` را ندارد (نقل قید در B5 بالا).
- ستون تازه روی `employee_profiles` — که **۰ ردیف** دارد `[E]`، پس خودش یک کار جداست.

### C2 · `call_logs` برای خواستهٔ مالک چه کم دارد (D-34)

D-34 می‌گوید `call_logs` تنها منبع حقیقت است **[U]**. با شکل امروزش، این چهار خواستهٔ مالک **قابل بیان نیستند**:

| خواستهٔ مالک | ستون موجود؟ | چرا نه — با شاهد |
|---|---|---|
| **تماس ورودی بی‌پاسخ** | **نه** | هیچ ستون نتیجه/وضعیت وجود ندارد. ۱۱ ستون در B2 فهرست شده‌اند؛ `duration_seconds NOT NULL DEFAULT 0` هم نمی‌تواند جانشین شود، چون «۰ ثانیه» را از «بی‌پاسخ» جدا نمی‌کند |
| **تماس داخلی (داخلی به داخلی)** | **نه** | `CHECK (direction = ANY (ARRAY['inbound','outbound']))` — **دیتابیس مقدار سومی را رد می‌کند**. یک تماس داخلی نه ورودی است نه خروجی |
| **کدام داخلی** | **نه** | نه در `call_logs`، نه در هیچ جدول دیگری (C1) |
| **چه کسی با چه کسی (داخلی)** | **نه** | `employee_id` یکی است؛ هیچ ستون «طرف مقابل» نیست |
| جهت | بله | `direction` |
| دقیقه | بله (ثانیه) | `duration_seconds` + `started_at`/`ended_at` |
| مشتری | بله (بدون FK) | `customer_id uuid` — **هیچ کلید خارجی‌ای وجود ندارد**، تأیید `phone-gap-20260905.md:113-116` **[P]** |
| جلوگیری از درج تکراری | **نه** | `idx_call_logs_external` یکتا نیست (B2) |

**هیچ کامنتی روی جدول یا ستون‌ها نیست** `[P]` (`phone-gap-20260905.md:109-112`) — پس معنای `source` و `metadata` هم جایی مستند نشده. `metadata jsonb` می‌تواند این‌ها را موقتاً نگه دارد، ولی بدون CHECK و بدون ایندکس، و آرشیوِ «جست‌وجو بر اساس داخلی، تاریخ و ساعت» که مالک خواسته روی `jsonb` بدون ایندکس کار نمی‌کند.

### C3 · هیچ client ای برای MySQL یا AMI در پروژه نیست

```
$ node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies).join(', '))"
@cloudflare/vite-plugin, @hookform/resolvers, @lovable.dev/mcp-js, @radix-ui/*, @supabase/supabase-js,
@tailwindcss/vite, @tanstack/*, arabic-persian-reshaper, bidi-js, class-variance-authority, clsx, cmdk,
date-fns, embla-carousel-react, html2canvas, html2canvas-pro, input-otp, jspdf, lucide-react, marked,
moment-jalaali, nitro, pdfmake, react, react-day-picker, react-dom, react-hook-form,
react-multi-date-picker, react-resizable-panels, recharts, sonner, tailwind-merge, tailwindcss,
tw-animate-css, unpdf, vaul, vite-tsconfig-paths, xlsx, zod
```

**نه `mysql`، نه `mysql2`، نه `mariadb`، نه `asterisk-manager`، نه `ari-client`، نه `ws`، نه `socket.io`.** `devDependencies` هم ندارد.

**و از سمت دیتابیس هم راهی به MySQL نیست** `[E]`:

```
$ ... -c "select name, default_version, installed_version from pg_available_extensions
          where name in ('pg_net','http','dblink','mysql_fdw','postgres_fdw','pg_cron') order by 1;"
name|default_version|installed_version
dblink|1.2|
http|1.6|
pg_cron|1.6|
pg_net|0.13.0|
postgres_fdw|1.1|
(5 rows)
```

**`mysql_fdw` اصلاً در فهرست نیست** — یعنی روی این image موجود نیست. `postgres_fdw` هست ولی به Postgres وصل می‌شود نه MySQL. `installed_version` همهٔ پنج‌تا **خالی** است.

**پیامد ساختاری:** یک job `pg_cron` نمی‌تواند خودش CDR را از MySQL بخواند. import **باید** یک فرآیند سمت برنامه باشد. (این «طراحی» نیست، یک محدودیت اندازه‌گیری‌شده است.)

### C4 · D-39 به شکل cron — **۷ بیان، همه روی دقیقهٔ ۳۰**

D-39 **[U]**: ۰۸–۱۰ ساعتی · ۱۰–۱۳ هر ۳۰ دقیقه · ۱۳–۱۷ ساعتی · ۱۷–۲۰ ساعتی · ۲۰–۰۸ هر ۶ ساعت.

چون `cron.timezone = GMT` `[E]` و تهران UTC+03:30 است، هر ساعت تهران منهای ۳:۳۰ می‌شود:

| # | بازهٔ تهران | تناوب | ساعت‌های تهران | معادل GMT | بیان cron (GMT) |
|---|---|---|---|---|---|
| ۱ | ۰۸–۱۰ | ساعتی | ۰۸، ۰۹ | ۰۴:۳۰، ۰۵:۳۰ | `30 4,5 * * *` |
| ۲ | ۱۰–۱۳ | هر ۳۰ دقیقه | ۱۰:۰۰ … ۱۲:۳۰ | ۰۶:۳۰ … ۰۹:۰۰ | `0,30 7,8 * * *` و `30 6 * * *` و `0 9 * * *` |
| ۳ | ۱۳–۱۷ | ساعتی | ۱۳…۱۶ | ۰۹:۳۰…۱۲:۳۰ | `30 9,10,11,12 * * *` |
| ۴ | ۱۷–۲۰ | ساعتی | ۱۷، ۱۸، ۱۹ | ۱۳:۳۰، ۱۴:۳۰، ۱۵:۳۰ | `30 13,14,15 * * *` |
| ۵ | ۲۰–۰۸ | هر ۶ ساعت | ۲۰، ۰۲ | ۱۶:۳۰، ۲۲:۳۰ | `30 16,22 * * *` |

**شمارش: با ادغام، ۵ تا ۷ ردیف cron لازم است.** بازهٔ ۲ به‌تنهایی سه بیان می‌خواهد چون نیم‌ساعت افست، پنجرهٔ «هر ۳۰ دقیقه» را از مرز ساعت جابه‌جا می‌کند — این دقیقاً همان چیزی است که نمی‌شود در یک بیان `*/30 6-9 * * *` جمع کرد بدون اینکه یک اجرای اضافی خارج از بازه بیفتد.

**آیا یک job واحد که ساعت جاری را چک کند بهتر است؟ سه دلیل به نفعش، یکی علیه:**

- **به نفع (۱):** ۷ ردیف cron در دیتابیس `postgres` زندگی می‌کنند، در حالی که همهٔ کدِ برنامه در `afrakala` است. هر تغییر برنامه یعنی `psql` روی دیتابیس دوم — همان چیزی که migration 445 مجبور شد در کامنت توضیحش دهد **[E]**.
- **به نفع (۲):** برنامه با GMT بیان شده ولی مالک آن را به وقت تهران فکر می‌کند. هفت بیان روی دقیقهٔ ۳۰، **هفت فرصت اشتباهِ ترجمه** است. یک job که `now() AT TIME ZONE 'Asia/Tehran'` را می‌خواند، برنامه را به زبان خودش نگه می‌دارد.
- **به نفع (۳):** تغییر برنامه بدون هیچ عملیات cron ممکن می‌شود — یعنی مالک می‌تواند ساعت‌ها را عوض کند بدون دخالت مهندس.
- **علیه:** یک job پرتناوب (مثلاً هر ۳۰ دقیقه) که اکثر اجراهایش بلافاصله برمی‌گردد، در `cron.job_run_details` نویز تولید می‌کند و «اجرا شد ولی کاری نکرد» را از «اجرا نشد» سخت‌تر می‌کند.

**این یک ارزیابی است، نه یک پیشنهاد پیاده‌سازی. انتخاب با مالک/معمار است.**

### C5 · هیچ فرآیند دائمیِ اختصاصی در stack نیست

سرویس‌های اعلام‌شده در `deploy/lan/docker-compose.yml` (سطرهای نقل‌شده در B6): `web`, `db`, `db-role-fix`, `auth`, `rest`, `storage`, `meta`, `studio`, `kong`, `caddy`. **همه یا Supabase استانداردند یا خود اپ.**

`automation/worker-runtime/` روی دیسک هست ولی **پایتون است و در هیچ compose ای نیست** `[E]`:

```
$ ls automation/worker-runtime/
.env.example  README.md  pyproject.toml  src/  tests/       <-- pyproject، نه package.json
$ grep -rn "worker-runtime\|worker-dummy" deploy/ --include=*.yml --include=*.yaml
(no output)
```

**یعنی یک شنوندهٔ AMI، اولین فرآیند دائمیِ اختصاصیِ این stack خواهد بود.**

---

## نقاط اتصال (hook points) — file:line

| # | نقطه | مسیر دقیق | چرا اینجا |
|---|---|---|---|
| H1 | جدول مقصد CDR | `supabase/migrations/20260430201059_cbcd6677-f87a-4842-a3ac-5a710470edd6.sql:72-98` | migration سازندهٔ `call_logs` — شکل امروز از اینجاست |
| H2 | **تریگری که هر درج را می‌بیند** | `trg_call_logs_recompute_employee_score` (زنده) · بدنه در `supabase/migrations/20260430202057_ef2f0c6d-b6a5-4824-bb22-866def6fc130.sql:206-233` | هر import آن را شلیک می‌کند؛ `EXCEPTION WHEN OTHERS THEN NULL` خطا را می‌بلعد |
| H3 | خوانندهٔ امتیاز | `public.compute_employee_score(uuid, jsonb)` — خطوط ۷۴-۷۵ کامنت، ۸۰/۸۶/۹۲/۹۸/۱۳۰/۱۳۶/۱۵۶ `FROM staff_daily_performance_metrics` | **D-34 اینجا اجرا نمی‌شود**: امتیاز از `call_logs` عدد نمی‌خواند |
| H4 | نرمال‌سازِ شماره | `src/lib/persons/identifiers-normalize.ts:106-119` | CDR → `+989XXXXXXXXX` |
| H5 | جست‌وجوی شخص با شماره | `public.person_find_by_identifiers(p_identifiers jsonb)` · `SECURITY INVOKER` | D-36 |
| H6 | نمونهٔ مصرف‌کنندهٔ H5 | `src/lib/persons/find-by-phone.ts:22-28` | الگوی «شخصِ نادیدنی = عدم تطابق، نه خطا» |
| H7 | الگوی SSE | `src/routes/api/messenger/ai-chat.ts:169-174` (هدرها)، `:177/240/269/284` (`ReadableStream`) | تنها SSE موجود |
| H8 | مصرف‌کنندهٔ SSE در مرورگر | `src/components/messenger/AiAssistantDrawer.tsx:76,90` | `fetch` + `getReader()` — **نه `EventSource`** |
| H9 | جایی که realtime عمداً بسته شده | `/home/kong/kong.rendered.yml:89-91` داخل کانتینر `afrakala-lan-kong` | سد اصلی پاپ‌آپ |
| H10 | مستندسازی زمان‌بند | `supabase/migrations/20260905140000_445_scheduled_jobs_documentation.sql:5-23` | چرا cron در `postgres` است نه `afrakala` |
| H11 | script ثبت job | `deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql` (نام‌برده در H10) | الگوی `cron.schedule_in_database(...,'afrakala')` |
| H12 | ورود دستی امروز | `src/routes/_app.gamification.admin.manual-metrics.tsx:222-229` (RPC) · `:421-423` (فیلدها) | تعریف دوم «تماس» از اینجا نوشته می‌شود |
| H13 | ظرف بی‌استفاده برای داخلی | جدول‌های `profile_field_definitions` / `profile_field_values` | R10 |
| H14 | تنظیم منطقهٔ زمانی cron | `pg_settings` → `cron.timezone = GMT` | همهٔ بیان‌های C4 از اینجا می‌آیند |

---

## سؤال‌های مالک که هنوز باز است — به زبان کسب‌وکار

> prior art (`issabel-feasibility-20260906.md` §۶) چهارده سؤال ثبت کرده بود **[P]**. probeهای امروز **سؤال ۱ را بست** و ۳/۴/۵ را نیمه‌بست. آنچه زیر می‌آید فقط چیزهایی است که **هنوز باز است** یا **تازه باز شد**.

**الف — دربارهٔ دسترسی (مسدودکننده)**

۱. **چه کسی روی سرور تلفن `192.168.170.252` دسترسی مدیر دارد؟** نام آن شخص یا شرکت، و آیا می‌شود از او خواست یک کاربر «فقط خواندن» بسازد؟ (متن دستور در بخش بعد آماده است.)

۲. **نسخهٔ Issabel چیست؟** در پایین صفحهٔ ورود سایت `https://192.168.170.252` نوشته شده. **من وارد نشدم و نخواهم شد.**

۳. **پورت ۵۰۳۸ (سامانهٔ رویداد زنده) باز است. آیا این عمدی است؟** این پورت اجازهٔ کنترل تماس می‌دهد، نه فقط خواندن. اگر مالک پاپ‌آپ را نمی‌خواهد، **بهتر است بسته بماند** و برای گزارش شبانه اصلاً لازم نیست.

**ب — دربارهٔ آنچه واقعاً خواسته می‌شود**

۴. **گزارش شبانه و پاپ‌آپ زنده، دو پروژه‌اند. کدام اول؟** گزارش و آرشیو با CDR حل می‌شود و همهٔ قطعاتش هست. پاپ‌آپ به یک برنامهٔ همیشه-روشن و یک کانال جدید نیاز دارد که امروز **عمداً** بسته است. **D-33 می‌گوید گیمیفیکیشن اول** **[U]** — و گیمیفیکیشن با CDR کامل می‌شود، بدون پاپ‌آپ.

۵. **«تماس بی‌پاسخ» یعنی چه؟** فقط تماسی که هیچ‌کس برنداشت، یا تماسی که به صف رفت و مشتری قطع کرد هم؟ و اگر مشتری بعد از ۳ ثانیه قطع کرد، آن هم «از دست رفته» است؟ **جدول امروز هیچ ستونی برای این ندارد.**

۶. **«تماس داخلی» چطور امتیاز می‌گیرد؟** جدول امروز فقط دو حالت «ورودی» و «خروجی» را می‌پذیرد و دیتابیس حالت سوم را **رد می‌کند**. اگر تماس داخلی هم باید ثبت شود، این یک تغییر در قاعدهٔ جدول است.

۷. **اگر یک کارشناس دو بار در روز داخلی‌اش عوض شود، یا داخلی یک نفرِ رفته به نفر بعدی برسد — سابقهٔ قبلی به چه کسی نسبت داده شود؟** (این تعیین می‌کند نگاشت یک مقدار ساده است یا یک بازهٔ زمانی.)

۸. **تماس‌هایی که کارشناس با موبایل شخصی می‌گیرد و از مرکز تلفن رد نمی‌شود، هم باید شمرده شود؟** اگر بله، CDR هرگز تصویر کامل نمی‌دهد و ورود دستی باید کنارش بماند.

**ج — دربارهٔ اثری که فوراً روی امتیازها می‌گذارد**

۹. **آگاهید که اولین import، امتیاز کارمندها را بلافاصله عوض می‌کند؟** هر تماس واردشده یک بار امتیاز آن کارمند را از نو حساب می‌کند و یک رد در تاریخچه می‌گذارد. اگر ۵۰۰ تماس وارد شود، ۵۰۰ بار. **این خاموش‌کردنی نیست مگر با یک تغییر در دیتابیس.**

۱۰. **`staff_daily_performance_metrics` بعد از go-live چه می‌شود؟** D-34 می‌گوید مشتق شود **[U]**، ولی امروز **همان جدول است که امتیاز از آن خوانده می‌شود، نه `call_logs`** (H3). یعنی D-34 یک تغییر در موتور امتیازدهی است، نه فقط یک تغییر در منبع داده. **آخرین ثبت دستی ۲۰۲۶-۰۸-۱۱ بوده — ۲۶ روز پیش** `[E]`. آیا این ۱۱ ردیف باید بمانند یا کنار گذاشته شوند؟

---

## آنچه مالک باید فراهم کند — دسترسی، فهرست، اعتبارنامه

| # | چه چیزی | برای کدام بخش | بدون آن چه می‌شود |
|---|---|---|---|
| ۱ | **کاربر MySQL فقط-خواندنی** روی `asteriskcdrdb`، محدود به مبدأ `192.168.170.8` (D-38 **[U]**) | گزارش و آرشیو | هیچ CDR ای خوانده نمی‌شود. **مسدودکنندهٔ اصلی.** |
| ۲ | **نام کاربری و رمز** آن کاربر، از کانالی امن (نه در چت، نه در commit) | همان | همان |
| ۳ | **فهرست داخلی‌ها** — هر داخلی چه شماره‌ای است | نگاشت D-35 | CDR وارد می‌شود ولی به هیچ‌کس نسبت داده نمی‌شود |
| ۴ | **چه کسی چه داخلی‌ای دارد** — نام کارشناس در کنار شماره | همان | همان |
| ۵ | **تأیید اینکه هر کارشناس دقیقاً یک داخلی دارد** (یا فهرست استثناها) | همان | نگاشت مبهم می‌شود |
| ۶ | **نگه‌داشت CDR روی سرور چند روز است** | برنامه‌ریزی import | معلوم نیست اگر یک روز import نرسد چقدر فرصت جبران هست |
| ۷ | **اعتبارنامهٔ AMI** — فقط اگر پاپ‌آپ خواسته شود | پاپ‌آپ | پاپ‌آپ ممکن نیست |
| ۸ | **تأیید صریح برای باز کردن مجدد سرویس realtime در Kong** — یا انتخاب SSE به‌جایش | پاپ‌آپ | کانال push وجود ندارد (B6). این یک تصمیم امنیتی است چون attack surface را عمداً بسته‌اند |
| ۹ | **تصمیم دربارهٔ ظرف داخلی** — `profile_field_values` یا `person_identifiers` یا ستون تازه | نگاشت D-35 | ساخت شروع نمی‌شود |

**D-40 [U]** («فقط از go-live، بدون واردسازی سابقه») ردیف ۶ را کم‌فشارتر می‌کند، ولی حذفش نمی‌کند: نگه‌داشت CDR تعیین می‌کند اگر import چند روز بخوابد چقدر داده از دست می‌رود.

---

## دستور ساخت یوزر MySQL برای مالک

> ### ⚠️ هیچ‌کدام از این‌ها آزموده نشده است
>
> **من به Issabel وارد نشدم، هیچ query ای نزدم، و هیچ credential ای حدس نزدم.** تنها چیزی که اندازه گرفتم این است که **پورت ۳۳۰۶ از `192.168.170.8` پاسخ می‌دهد** (B1). این یعنی MySQL روی یک واسط بیرونی گوش می‌دهد — نه اینکه دستورهای زیر بی‌خطا اجرا می‌شوند. نسخهٔ MySQL/MariaDB `UNKNOWN` است، نام دقیق دیتابیس `UNKNOWN` است، و اینکه کاربر `root` از کجا قابل ورود است `UNKNOWN` است. **این دستورها را ادمین سرور تلفن اجرا می‌کند و اوست که خروجی واقعی را می‌بیند.**

### گام ۱ — وارد شدن به سرور تلفن

روی خودِ سرور `192.168.170.252` (نه از این کامپیوتر)، با SSH یا کنسول، به‌عنوان `root`:

```bash
mysql -u root -p
```

رمز را همان‌جا وارد کنید. (روی نصب‌های Issabel این رمز معمولاً در `/etc/issabel.conf` نگهداری می‌شود **[doc]** — ادمین می‌داند کجاست.)

### گام ۲ — دیدن اینکه دیتابیس CDR واقعاً چه نام دارد

**قبل از ساختن کاربر، این را ببینید.** نام متعارف `asteriskcdrdb` است **[doc]** ولی روی نصب‌های قدیمی‌تر یا فارسی‌سازی‌شده ممکن است فرق کند:

```sql
SHOW DATABASES;
```

اگر `asteriskcdrdb` در فهرست نبود، **متوقف شوید و نام واقعی را گزارش کنید** — بقیهٔ دستورها باید با آن نام بازنویسی شوند.

سپس ببینید جدول اصلی چه نام دارد و چه ستون‌هایی:

```sql
USE asteriskcdrdb;
SHOW TABLES;
DESCRIBE cdr;
```

**خروجی این سه دستور را برای ما بفرستید.** این تنها راهی است که فرض‌های بخش «شکل CDR» در این سند از حالت `UNVERIFIED` دربیایند.

### گام ۳ — ساختن کاربر فقط-خواندنی

نام کاربر پیشنهادی `afrakala_cdr_ro` («ro» یعنی read-only). **رمز را خودتان انتخاب کنید — رمز نمونهٔ زیر را عیناً استفاده نکنید:**

```sql
CREATE USER 'afrakala_cdr_ro'@'192.168.170.8' IDENTIFIED BY '<یک رمز قوی که خودتان می‌سازید>';
GRANT SELECT ON asteriskcdrdb.* TO 'afrakala_cdr_ro'@'192.168.170.8';
FLUSH PRIVILEGES;
```

**سه نکته دربارهٔ همین سه خط:**

- `'@'192.168.170.8'` یعنی این کاربر **فقط از کامپیوتر تست** می‌تواند وارد شود. از هیچ جای دیگری، حتی از خود سرور تلفن، کار نمی‌کند. اگر آن را `'%'` بگذارید، از هر کجای شبکه قابل استفاده می‌شود — **این کار را نکنید.**
- `GRANT SELECT` یعنی **فقط خواندن**. این کاربر نمی‌تواند چیزی بنویسد، عوض کند یا پاک کند. حتی اگر رمزش لو برود، به سوابق تماس شما آسیبی نمی‌رسد.
- `ON asteriskcdrdb.*` یعنی **فقط این یک دیتابیس**. بقیهٔ دیتابیس‌های سرور تلفن (از جمله دیتابیس تنظیمات و رمزها) برای این کاربر نامرئی می‌مانند.

**اگر می‌خواهید حتی از این هم تنگ‌تر باشد** — فقط یک جدول به‌جای کل دیتابیس:

```sql
GRANT SELECT ON asteriskcdrdb.cdr TO 'afrakala_cdr_ro'@'192.168.170.8';
```

این امن‌تر است، ولی اگر بعداً معلوم شود جدول دیگری هم لازم است (مثلاً `cel` برای رویدادهای ریز تماس **[doc]**)، باید دوباره `GRANT` بزنید.

### گام ۴ — بررسی اینکه MySQL بیرون را می‌بیند

پورت ۳۳۰۶ از کامپیوتر تست پاسخ می‌دهد `[E]`، پس **این گام احتمالاً از قبل درست است** — ولی برای اطمینان:

```bash
grep -R "bind-address" /etc/my.cnf /etc/my.cnf.d/ 2>/dev/null
```

- اگر خروجی `bind-address = 127.0.0.1` بود، MySQL فقط روی خود سرور گوش می‌دهد و **از بیرون قابل اتصال نیست** — که با اندازه‌گیری ما نمی‌خواند و باید علتش روشن شود.
- اگر خروجی خالی بود یا `bind-address = 0.0.0.0`، از بیرون قابل اتصال است.

**هیچ تغییری در این فایل ندهید مگر لازم باشد** — تغییرش نیازمند restart سرویس MySQL است و مرکز تلفن در آن لحظه سوابق را ثبت نمی‌کند.

### گام ۵ — بررسی فایروال روی پورت ۳۳۰۶

```bash
firewall-cmd --list-all
# یا روی نصب‌های قدیمی‌تر:
iptables -L -n | grep 3306
```

اگر لازم شد باز شود، **فقط برای همان یک IP**:

```bash
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.170.8/32" port port="3306" protocol="tcp" accept'
firewall-cmd --reload
```

`/32` یعنی دقیقاً همان یک کامپیوتر، نه کل شبکه.

### گام ۶ — آزمون نهایی که خودِ مالک می‌تواند بگیرد

**از سرور تلفن، برای دیدن اینکه کاربر ساخته شد:**

```sql
SELECT user, host FROM mysql.user WHERE user = 'afrakala_cdr_ro';
SHOW GRANTS FOR 'afrakala_cdr_ro'@'192.168.170.8';
```

خروجی دوم باید فقط `SELECT` نشان دهد و فقط روی `asteriskcdrdb`.

**آزمون واقعی، از کامپیوتر تست:** بعد از اینکه اعتبارنامه به‌دست ما رسید، همین یک خط ثابت می‌کند کار می‌کند یا نه:

```bash
mysql -h 192.168.170.252 -u afrakala_cdr_ro -p -e "SELECT COUNT(*) FROM asteriskcdrdb.cdr;"
```

اگر یک عدد برگرداند، تمام است. اگر خطای `Access denied` داد، یعنی گام ۳ یا ۵ کامل نشده.

### آنچه هرگز نباید انجام شود

| کار | چرا نه |
|---|---|
| دادن رمز `root` مرکز تلفن به ما | لازم نیست. `SELECT` روی یک دیتابیس کافی است |
| `GRANT ALL` به‌جای `GRANT SELECT` | به سوابق تماس شرکت اجازهٔ نوشتن و پاک‌کردن می‌دهد |
| `'@'%'` به‌جای `'@'192.168.170.8'` | کاربر را از کل شبکه قابل استفاده می‌کند |
| نوشتن رمز در چت، ایمیل معمولی، یا فایل داخل پروژه | قاعدهٔ ۴ همین پروژه: هیچ راز واقعی نباید commit شود |
| باز کردن ۳۳۰۶ روی اینترنت | مرکز تلفن روی شبکهٔ داخلی است و باید بماند |

---

## Caller-ID popup — دامنه، نه طراحی

> **این بخش فهرست موجودی است، نه طراحی.** هیچ راه‌حلی پیشنهاد نمی‌شود.

### چرا CDR این کار را نمی‌کند

**CDR یعنی «رکورد جزئیات تماس» و پس از پایان تماس نوشته می‌شود** **[doc]**. یک پاپ‌آپ باید در **لحظهٔ زنگ خوردن** ظاهر شود — یعنی وقتی که هنوز هیچ CDR ای وجود ندارد. **هیچ تناوب polling ای این را حل نمی‌کند**، حتی هر ثانیه: رکورد هنوز نوشته نشده. این یک تفاوت ماهوی است، نه یک مسئلهٔ سرعت.

### چهار چیزی که لازم دارد

**(الف) یک شنوندهٔ AMI یا ARI که همیشه روشن است.**

- پورت ۵۰۳۸ باز است `[E]` — یعنی AMI روشن است. پورت ۸۰۸۸ هم باز است `[E]` — یعنی HTTP server آستریسک بالاست، ولی **این ثابت نمی‌کند ARI فعال است**؛ ARI در `ari.conf` جدا روشن می‌شود **[doc] UNVERIFIED**.
- **کجا زندگی کند؟** stack امروز ده سرویس دارد و **هیچ‌کدام فرآیند دائمیِ اختصاصی نیست** (C5). دو ظرف ممکن، بدون توصیه:
  - یک سرویس تازه در `deploy/lan/docker-compose.yml` — که یعنی **یازدهمین سرویس، و اولین سرویسِ نوشتهٔ خودمان**.
  - داخل خود `web` (که یک فرآیند Node/nitro دائمی است). ولی `web` هر بار deploy از نو ساخته می‌شود و اتصال AMI با آن قطع می‌شود — یعنی هر deploy یک قطعیِ پاپ‌آپ.
- **هیچ client ای برای AMI در پروژه نیست** (C3) — نه `asterisk-manager`، نه `ari-client`، نه حتی `ws`.

**(ب) یک کانال push به مرورگر — و امروز وجود ندارد.**

سه شاهد در B6 نشان می‌دهد `realtime` **عمداً** از Kong حذف شده و هیچ کانتینر realtime اجرا نمی‌شود. یعنی:

- ۹ فایلی که امروز `supabase.channel().on("postgres_changes")` صدا می‌زنند، upstream ای برای رسیدن ندارند `[E]`. **این خارج از دامنهٔ من است ولی باید ثبت شود** — یک مأموریت دیگر باید بررسی کند آیا این قابلیت‌ها امروز کار می‌کنند یا بی‌صدا شکست می‌خورند. `[?]`
- **`EventSource` صفر مورد است** در کل کد `[E]`. تنها SSE موجود (H7) پاسخِ یک درخواست است، نه جریان دائمیِ سرور-به-مرورگر (B7).
- بازکردن دوبارهٔ realtime یک **تصمیم امنیتی مالک** است، چون صریحاً برای کاهش attack surface بسته شده (نقل قول در B6).

**(ج) نگاشت داخلی → کاربر، برای رساندن رویداد به مرورگرِ درست.**

بدون این، رویداد «داخلی ۲۰۴ زنگ می‌خورد» به هیچ‌کس نمی‌رسد. و این نگاشت **امروز در هیچ ستونی وجود ندارد** (C1). یعنی **بند (ج) پیش‌نیاز بند (الف) و (ب) هر دو است** و در عین حال همان چیزی است که import شبانه هم لازم دارد — **تنها قطعهٔ مشترک دو پروژه**.

**(د) قید HTTP در برابر HTTPS — گاز می‌گیرد، ولی نه آنجا که انتظار می‌رود.**

اندازه‌گیری `[E]` — از `deploy/lan/.env.lan`:

```
VITE_SUPABASE_URL=http://192.168.170.8:9000
SITE_URL=http://192.168.170.8:3100
ADDITIONAL_REDIRECT_URLS=https://test.myafrakala.ir,https://test.myafrakala.ir/**,http://192.168.170.8:3100,...
```

و `deploy/lan/docker-compose.yml:339-349` نشان می‌دهد یک Caddy با `443:443` و certificate از `C:/certs` هم بالاست — **پس اپ از هر دو راه در دسترس است: `http://192.168.170.8:3100` و `https://test.myafrakala.ir`**.

- **جایی که گاز نمی‌گیرد:** یک endpoint ای SSE روی مسیر `/api/...` **هم‌مبدأ** با صفحه است. چه صفحه HTTP باشد چه HTTPS، هم‌مبدأ بودن مسئلهٔ mixed-content را حذف می‌کند.
- **جایی که گاز می‌گیرد:** اگر کسی وسوسه شود مرورگر را **مستقیم** به `wss://192.168.170.252:8088` وصل کند، یک صفحهٔ HTTPS با certificate خودامضای مرکز تلفن روبه‌رو می‌شود و مرورگر آن را **بی‌صدا** رد می‌کند. شنونده باید سمت سرور باشد، نه سمت مرورگر. `[doc]` دربارهٔ خودامضا بودن certificate — **من به ۴۴۳ وصل نشدم و certificate را ندیدم. `UNVERIFIED`.**
- **جای دوم:** اگر مسیر SSE از پشت Caddy رد شود، بافر کردن پاسخ می‌تواند رویداد را تا بسته شدن جریان نگه دارد. هدر `X-Accel-Buffering: no` که در H7 هست دقیقاً برای همین گذاشته شده — **ولی آزموده نشد که Caddy به آن احترام می‌گذارد یا نه.** `[?]`

### اندازه، نسبت به import CDR

| | import CDR | پاپ‌آپ Caller-ID |
|---|---|---|
| فرآیند دائمی جدید | **صفر** — cron موجود کافی است (B4) | **یک** — اولین در تاریخ این stack (C5) |
| سرویس جدید در compose | صفر | یک (یا پذیرش قطعی در هر deploy) |
| وابستگی npm جدید | یک (client مای‌اس‌کیوال) | **دو تا سه** (client مای‌اس‌کیوال ندارد؛ AMI + احتمالاً `ws`) |
| تصمیم امنیتی مالک | یک (کاربر فقط-خواندنی) | **سه** (کاربر AMI با دسترسی کنترل تماس + بازکردن مجدد realtime یا ساخت SSE + مسیر شبکهٔ دائمی) |
| رفتار در قطعی | بی‌اثر — اجرای بعدی جبران می‌کند | **مستقیماً دیده می‌شود** — پاپ‌آپ نمی‌آید و کسی نمی‌فهمد چرا |
| نیاز به reconnect/backpressure | ندارد | **دارد** — TCP دائمی، heartbeat، صف رویداد |
| نگاشت داخلی → کاربر | لازم | لازم (همان) |

**برآورد اندازه: تقریباً سه تا چهار برابر import CDR** — و مهم‌تر از عدد، این است که **جنسش فرق دارد**: import یک job است که یا اجرا می‌شود یا نمی‌شود و لاگ می‌گذارد؛ پاپ‌آپ یک سامانهٔ همیشه-روشن با حالت (state) است که وقتی خراب می‌شود **بی‌صدا** خراب می‌شود. این stack امروز هیچ چیزی از جنس دوم ندارد.

**نتیجه‌گیری دامنه‌ای:** بند (ج) — نگاشت داخلی → کاربر — تنها قطعه‌ای است که **هر دو** پروژه به آن نیاز دارند و **هیچ‌کدام بدون آن جلو نمی‌رود**. اگر ترتیبی لازم است، آن ترتیب از این واقعیت درمی‌آید، نه از این سند.

---

## Numbers

| # | چه چیزی | عدد | دستوری که تولیدش کرد |
|---|---|---|---|
| N1 | پورت‌های باز Issabel | **۴ از ۴** | حلقهٔ `TcpClient.ConnectAsync` در B1 — عیناً |
| N2 | ردیف‌های `call_logs` | **۰** | `... psql -d afrakala -c "select count(*) from public.call_logs;"` |
| N3 | ستون‌های `call_logs` | **۱۱** | `information_schema.columns` (B2) |
| N4 | قیود `call_logs` | **۲** (۱ PK، ۱ CHECK) | `pg_constraint` روی `conrelid='public.call_logs'::regclass` |
| N5 | مقادیر مجاز `direction` | **۲** (`inbound`, `outbound`) | همان CHECK — **هیچ مقدار سومی پذیرفته نمی‌شود** |
| N6 | ایندکس‌های `call_logs` | **۳** — و **۰ تای غیر-PK یکتاست** | `pg_indexes` (B2) |
| N7 | سیاست‌های RLS روی `call_logs` | **۴**، همه `TO authenticated` | `pg_policies` (B2) |
| N8 | تریگرهای کاربر روی `call_logs` | **۱** — `AFTER INSERT OR DELETE OR UPDATE ... FOR EACH ROW` | `pg_trigger where not tgisinternal` |
| N9 | ستون‌های `call_logs` برای «بی‌پاسخ» / «داخلی» / «تماس داخلی» | **۰ / ۰ / ۰** | فهرست ۱۱ ستون در B2 |
| N10 | `pg_cron` در دیتابیس `afrakala` | **نصب نیست** (۱۱ افزونهٔ دیگر) | `select extname from pg_extension` روی `-d afrakala` |
| N11 | `pg_cron` در دیتابیس `postgres` | **نصب است، نسخه ۱.۶** | همان روی `-d postgres` |
| N12 | jobهای cron با `database='afrakala'` | **۳** (۲۰، ۲۱، ۲۲)، هر سه `active='t'` | `select ... from cron.job` روی `-d postgres` |
| N13 | `cron.timezone` | **`GMT`** (و `TimeZone` هر دو دیتابیس `UTC`) | `select name, setting from pg_settings where name like 'cron.%'` |
| N14 | بیان‌های cron لازم برای D-39 | **۵ تا ۷** | استخراج در C4 از D-39 + N13 |
| N15 | ردیف‌های `mobile_e164` | **۳۶** | `select kind, count(*) from public.person_identifiers group by kind` |
| N16 | قالب‌های متمایز `value_normalized` برای موبایل | **۱** — `+XXXXXXXXXXXX` (۱۳ کاراکتر) | `regexp_replace(value_normalized,'[0-9]','X','g')`, `distinct` |
| N17 | قالب‌های متمایز `value_raw` برای موبایل | **۱** — ۱۱ کاراکتر با `0` آغاز (`09XXXXXXXXX`) | `length(value_raw)` + `value_raw ~ '^0'` گروه‌بندی‌شده |
| N18 | قالب‌های ورودی که نرمال‌ساز می‌پذیرد | **۴** | `src/lib/persons/identifiers-normalize.ts:109-114` |
| N19 | ستون‌های schema که «داخلی» را نگه دارند | **۰** | `information_schema.columns` با regex در C1 → `(0 rows)` |
| N20 | جدول‌های `settings|config` با ستون `jsonb` | **۰** (۶ جدول settings، هیچ‌کدام jsonb عمومی) | دو query در C1 |
| N21 | ردیف‌های `profile_field_values` | **۰** (تعاریف: **۵**) | `select count(*)` روی هر دو |
| N22 | ردیف‌های `employee_profiles` | **۰** | همان query |
| N23 | جمعیت هدف نگاشت | **۱۴** با نقش `sales`، **۴۱** کل `profiles` (۲۶ فعال) | `user_roles` group by · `profiles` count |
| N24 | سرویس‌های اعلام‌شده در compose LAN | **۱۰** — هیچ `realtime` | `grep -n -E "^  [a-z0-9_-]+:" deploy/lan/docker-compose.yml` |
| N25 | کانتینرهای `afrakala-lan-*` در حال اجرا | **۸** — هیچ realtime | `docker ps --format "{{.Names}}"` |
| N26 | upstreamهای Kong | **۴** (auth, rest, storage, meta) | `docker exec afrakala-lan-kong sh -c "grep -n 'url:' /home/kong/kong.rendered.yml"` |
| N27 | جدول‌های داخل publication `supabase_realtime` | **۶** | `select ... from pg_publication_tables` |
| N28 | فایل‌های frontend با `postgres_changes` | **۶+** (۹ فایل با `.channel(`) | `git grep -n -I -E "\.channel\(\|postgres_changes" HEAD -- src` |
| N29 | `EventSource` در کل کد | **۰** | `git grep -n -I -F "EventSource" HEAD -- src server automation scripts e2e` → بدون خروجی |
| N30 | `text/event-stream` در کل کد | **۱** | `git grep -n -I -F "text/event-stream" HEAD` → `src/routes/api/messenger/ai-chat.ts:170` |
| N31 | client مای‌اس‌کیوال / AMI / ARI / ws در `package.json` | **۰ از ۷** | `node -e` روی `dependencies` + `devDependencies` (C3) |
| N32 | `mysql_fdw` در `pg_available_extensions` | **موجود نیست** | query در C3 — پنج نام پرسیده شد، `mysql_fdw` برنگشت |
| N33 | افزونه‌های نصب‌شده از آن پنج | **۰** (`installed_version` همه خالی) | همان query |
| N34 | ردیف‌های `staff_daily_performance_metrics` | **۱۱** از **۸** کارشناس، ۲۰۲۶-۰۷-۲۳ تا **۲۰۲۶-۰۸-۱۱** | `count(*)`, `count(distinct staff_user_id)`, `min/max(metric_date)` |
| N35 | ردیف‌های `phone_collisions` | **۳** | `select count(*) from public.phone_collisions;` |
| N36 | KPIهای با `source='call_logs'` | **۳ از ۱۳** (هر سه `enabled='t'`) | `select key, weight, enabled, source ... from public.gamification_kpis order by display_order` |
| N37 | قوانین XP فعالِ تماس | **۲** — `outbound_call`=۵، `inbound_call`=۳ | `select event_key, xp_amount, is_active from public.gamification_kpi_rules` |
| N38 | رویدادهای امتیاز از نوع تماس تا امروز | **۰** | `select event_type, source_table, count(*) from public.employee_score_events group by 1,2` — ۷ ردیف، هیچ‌کدام تماس |
| N39 | پارامترهای امتیازدهی پویا با `%call%` | **۲**، هر دو `input_type='months'` | `select ... from public.dynamic_scoring_parameters where code ilike '%call%'` |
| N40 | خطوط `compute_employee_score` که `call_logs` را نام می‌برند | **۲**، **هر دو کامنت** (۷۴، ۷۵) — در برابر **۸** خط `FROM staff_daily_performance_metrics` | `pg_get_functiondef(...) \| grep -n -E "call_logs\|staff_daily_performance_metrics"` |

---

## Contradictions

### X1 · `pg_cron` — prior art امروز **نادرست** است

| منبع | ادعا |
|---|---|
| `docs/research/phone-gap-20260905.md:30` **[P]** | «(`pg_cron` روی این دیتابیس **نصب نیست**، پس cron هر-۵-دقیقه‌ای هرگز ساخته نشد)» |
| `docs/research/phone-gap-20260905.md:822` (ردیف N20) **[P]** | «افزونهٔ `pg_cron` — **۰ ردیف** (نصب نیست) … `cron.job` → `ERROR: relation "cron.job" does not exist`» |
| `docs/research/issabel-feasibility-20260906.md` §۵.۱ **[P]** | «**`pg_cron` در دیتابیس `postgres` نصب است و jobهایش `afrakala` را هدف می‌گیرند** … نتیجه‌گیری prior art از یک query که فقط در دیتابیس اشتباه اجرا شده بود گرفته شده» |
| **اندازه‌گیری امروز [E]** | **`issabel-feasibility` درست است.** `pg_cron 1.6` در `postgres` نصب است؛ سه job با `database='afrakala'` و `active='t'` وجود دارند (N11، N12) |

**داوری:** جملهٔ `phone-gap` در حرف درست است (`pg_cron` واقعاً در `afrakala` نیست) ولی **نتیجه‌گیری‌اش غلط است**: cron نه‌تنها ساخته شد، بلکه امروز روی همین دیتابیس کار می‌کند. **این مستقیماً روی D-39 اثر می‌گذارد** — زمان‌بند «باید ساخته شود» نیست.

### X2 · «هیچ سامانهٔ تلفنی‌ای وجود ندارد» — دیگر درست نیست

| منبع | ادعا |
|---|---|
| `phone-gap-20260905.md:32-34` **[P]** | «در کل فایل‌های تحت کنترل گیت، **هیچ ردی از هیچ سامانهٔ تلفنی وجود ندارد** … **مالک هنوز نگفته است چه سامانهٔ تلفنی‌ای وجود دارد**» |
| `issabel-feasibility-20260906.md` §۱ **[P]** | «**آدرس سرور Issabel نامعلوم است** … این ردیف با ۰ بسته به شبکه بسته می‌شود» |
| **امروز** | **هر دو در repo همچنان درست‌اند** `[E]` — `git grep -F "170.252" HEAD` → **۰ فایل**. ولی **مالک آدرس را داده** و **هر چهار پورت پاسخ می‌دهند** (B1) |

**داوری:** هیچ تناقضی در اندازه‌گیری نیست؛ شکاف **اطلاعاتی** بود و **مالک آن را پر کرد**. آنچه باید ثبت شود: **آدرس `192.168.170.252` هنوز در هیچ فایلی از repo نیست** `[E]` — یعنی هر کس فقط repo را بخواند، همچنان به نتیجهٔ prior art می‌رسد.

### X3 · «`idx_call_logs_external` یکتا نیست» — بازبررسی شد

`issabel-feasibility-20260906.md` §۴.۴ این را `[prior art · NOT RE-VERIFIED]` گذاشته بود **[P]**. **اینجا بازبررسی شد و درست است** `[E]` — نقل کامل `indexdef` در B2: `CREATE INDEX`، نه `CREATE UNIQUE INDEX`.

### X4 · یک اصلاح داخل خودِ `phone-gap` که تأیید می‌شود

`allocation-workbench-build-research-20260906.md:622-625` **[P]** گفته بود ادعای `phone-gap` مبنی بر «امتیازدهی `call_logs` را نمی‌خواند» **نیمه‌درست** است، چون تریگر هست. **اندازه‌گیری امروز هر دو نیمه را تأیید می‌کند** `[E]`: تابع `compute_employee_score` هیچ عددی از `call_logs` نمی‌خواند (N40: دو کامنت در برابر هشت `FROM staff_daily_performance_metrics`)، **و** تریگر `AFTER INSERT OR DELETE OR UPDATE ... FOR EACH ROW` روی جدول زنده است (B3).

---

## Coverage

### بررسی‌شده

| حوزه | چطور |
|---|---|
| دسترس‌پذیری Issabel | چهار اتصال TCP، هر پورت یکی، timeout ۳ ثانیه — **صفر بایت payload، صفر تلاش ورود** |
| شِمای زندهٔ `call_logs` | `information_schema.columns`، `pg_constraint`، `pg_indexes`، `pg_policies`، `pg_trigger` |
| تریگر امتیازدهی | `pg_get_triggerdef` + `pg_get_functiondef` — **صدا زده نشد** |
| موتور امتیازدهی | `pg_get_functiondef(compute_employee_score)` با grep روی دو نام جدول — **صدا زده نشد** |
| زمان‌بند | `pg_extension` روی هر دو دیتابیس · `cron.job` روی `postgres` (فقط خواندن) · `pg_settings where name like 'cron.%'` · `show timezone` |
| نگاشت شماره → مشتری | `person_identifiers` — شمارش، قیود، ۱۲ ایندکس، و **قالب نقاب‌دار با `regexp_replace`** |
| نرمال‌ساز | `src/lib/persons/identifiers-normalize.ts` خوانده شد؛ `search-normalizer.ts` هم بررسی و **رد** شد |
| غیاب نگاشت داخلی | `information_schema.columns` با ۸ الگو · `information_schema.tables` با ۷ الگو · `git grep` انگلیسی و فارسی · جدول‌های settings |
| کانال push | `docker-compose.yml` (فهرست سرویس) · `docker ps` · **config رندرشدهٔ Kong داخل کانتینر** · `pg_publication_tables` · `git grep` برای `EventSource`/`text/event-stream`/`.channel(` |
| وابستگی‌ها | `package.json` کامل (deps + devDeps) · `pg_available_extensions` برای ۶ افزونه |
| قید HTTP/HTTPS | `deploy/lan/.env.lan` (بدون افشای هیچ کلید) · `deploy/lan/docker-compose.yml:339-349` |
| چهار تعریف «تماس» | `gamification_kpis` · `gamification_kpi_rules` · `dynamic_scoring_parameters` · `staff_daily_performance_metrics` · `employee_score_events` |
| prior art | `phone-gap-20260905.md` · `three-gaps-merged-20260905.md` · `allocation-workbench-build-research-20260906.md` · **`issabel-feasibility-20260906.md`** (در بریف نیامده بود؛ خودم پیدایش کردم) · `PROGRESS.md` · `CLAUDE.md` |

### بررسی‌نشده — با دلیل

| حوزه | چرا نه |
|---|---|
| **محتوای واقعی `asteriskcdrdb`** | **هیچ اتصال، هیچ credential، هیچ حدس.** تا وقتی مالک کاربر را نساخته، هیچ ستونی و هیچ ردیفی خوانده نمی‌شود |
| نسخهٔ Issabel و Asterisk | نیازمند باز کردن رابط وب یا SSH — هیچ‌کدام مجاز نبود |
| فعال بودن ARI (در برابر فقط `http.conf`) | باز بودن ۸۰۸۸ آن را ثابت نمی‌کند؛ `ari.conf` فقط از خود سرور دیده می‌شود |
| certificate پورت ۴۴۳ | به آن وصل نشدم؛ فقط handshake TCP انجام شد |
| اینکه آیا `postgres_changes`های امروزی واقعاً کار می‌کنند | خارج از دامنه، و بررسی‌اش نیازمند مرورگر است که ممنوع بود. **ثبت شد به‌عنوان یافتهٔ جانبی، نه ادعا** |
| رفتار Caddy با `X-Accel-Buffering` | نیازمند آزمون زنده |
| رفتار زمان اجرای هر تابع دیتابیس | **قاعدهٔ probe** — هیچ تابعی صدا زده نشد |
| UI زنده روی `:3100` | Playwright/e2e/browser ممنوع؛ wave 5 هم‌زمان اجرا می‌شود |
| `192.168.170.10` | ممنوع — نه تماس، نه resolve، نه ping |
| `schema_full_export.sql` / `deploy/missing_schema_for_selfhost.sql` | غیرقابل اتکا اعلام شده؛ هیچ ادعایی بر آن‌ها بنا نشد |
| `input_type='months'` روی پارامترهای تماس | همان ناهنجاری که `phone-gap-20260905.md` §A11 ثبت کرده بود؛ فقط بازتأیید شد، بررسی نشد |

---

## UNVERIFIED / UNKNOWN

### شکل CDR — **هر ردیف این جدول `[doc] UNVERIFIED` است**

> **هیچ‌کدام از این‌ها از این نصب خوانده نشده.** اینها ستون‌های متعارف جدول `cdr` آستریسک از مستندات vendor اند. **هیچ ردیف واقعی خوانده نشد و تا وقتی مالک کاربر MySQL را نساخته، نمی‌شود خواند.** گام ۲ در بخش «دستور ساخت یوزر» دقیقاً برای تبدیل این جدول از `[doc]` به `[E]` نوشته شده است.

| ستون **[doc]** | خواستهٔ مالک | نگاشت پیشنهادی **[doc] UNVERIFIED** | چرا نامطمئن است |
|---|---|---|---|
| `calldate` | زمان تماس، آرشیو ساعتی | `call_logs.started_at` | منطقهٔ زمانی ذخیره‌شده در CDR `UNKNOWN` — ممکن است محلی باشد نه UTC. **این تنها یک ستون است که اگر اشتباه ترجمه شود، کل آرشیو ساعتی غلط می‌شود** |
| `src` | شمارهٔ تماس‌گیرنده | ورودی: شمارهٔ مشتری → D-36 · خروجی: داخلی کارشناس | تشخیص اینکه کدام، به `dcontext` وابسته است |
| `dst` | شمارهٔ مقصد | ورودی: داخلی کارشناس · خروجی: شمارهٔ مشتری | همان |
| `dcontext` | **جهت تماس** | نام context در `extensions.conf` — مثلاً یک نام برای تماس ورودی، یک نام برای خروجی، یک نام برای داخلی | **این نام‌ها روی هر نصب متفاوت‌اند و توسط ادمین انتخاب می‌شوند.** بدون دیدن مقادیر واقعی، هیچ نگاشتی قابل نوشتن نیست. `UNKNOWN` |
| `channel` | جهت (راه دوم) | پیشوند کانال مبدأ | همان مشکل — پیشوندها به پیکربندی trunk وابسته‌اند |
| `dstchannel` | جهت (راه سوم) | پیشوند کانال مقصد | همان |
| `disposition` | **تماس بی‌پاسخ** | مقدارهای متعارف `ANSWERED` / `NO ANSWER` / `BUSY` / `FAILED` **[doc]** | مجموعهٔ واقعی مقادیر روی این نصب `UNKNOWN`. و اینکه «مشتری زنگ زد و قطع کرد» کدام یک از این‌ها می‌شود، **هم به نصب و هم به تعریف مالک وابسته است** (سؤال مالک ۵) |
| `duration` | مدت | **کل زمان از شروع زنگ تا قطع** | برای «دقایق مکالمه» احتمالاً **غلط** است، چون زمان زنگ خوردن را هم می‌شمارد |
| `billsec` | **دقایق مکالمه** | **زمان از لحظهٔ پاسخ تا قطع** | این ستون به خواستهٔ مالک نزدیک‌تر است. **ولی برای یک تماس بی‌پاسخ صفر است** — یعنی `billsec=0` هم «بی‌پاسخ» است هم «پاسخ داده شد و فوراً قطع شد». **بدون `disposition` قابل تفکیک نیست** |
| `uniqueid` | جلوگیری از درج تکراری | `call_logs.external_id` | ستون مقصد وجود دارد **ولی ایندکسش یکتا نیست** (N6) — یعنی حتی با نگاشت درست، دیتابیس درج تکراری را رد نمی‌کند |
| — | **تماس داخلی، چه کسی با چه کسی** | هر دوی `src` و `dst` یک داخلی‌اند | تشخیصش به فهرست داخلی‌ها نیاز دارد، که **وجود ندارد** (C1). و `call_logs.direction` **حالت سوم را رد می‌کند** (N5) |

### بقیهٔ نامعلوم‌ها

| # | چه چیزی | چرا |
|---|---|---|
| U1 | **نسخهٔ Issabel و Asterisk** | وارد نشدم. فقط ادمین یا صفحهٔ ورود می‌داند |
| U2 | **آیا کاربر MySQL از IP ما پذیرفته می‌شود** | باز بودن پورت ≠ اجازهٔ ورود. تا کاربر ساخته نشود آزمودنی نیست |
| U3 | **نام واقعی دیتابیس CDR** | `asteriskcdrdb` متعارف است **[doc]** ولی گام ۲ برای همین نوشته شد |
| U4 | **آیا ARI فعال است** | ۸۰۸۸ باز است ولی `ari.conf` جداست **[doc]** |
| U5 | **اعتبارنامه و `permit=` مربوط به AMI** | ۵۰۳۸ باز است؛ اینکه کدام IPها مجازند فقط از `manager.conf` معلوم می‌شود |
| U6 | **certificate پورت ۴۴۳** | وصل نشدم |
| U7 | **منطقهٔ زمانیِ ذخیره‌شده در `calldate`** | تعیین‌کنندهٔ درستی کل آرشیو ساعتی. فقط با دیدن یک ردیف واقعی معلوم می‌شود |
| U8 | **نگه‌داشت CDR روی سرور** | تنها مالک/ادمین می‌داند. اثرش روی D-40 در «آنچه مالک باید فراهم کند» ردیف ۶ |
| U9 | **آیا `postgres_changes`های امروزی در ۹ فایل frontend کار می‌کنند** | Kong هیچ upstream ای برایشان ندارد (N26) و هیچ کانتینر realtime نیست (N25). **قویاً محتمل است که کار نکنند، ولی من مرورگر باز نکردم** — و این خارج از دامنهٔ این سؤال است. **باید به‌عنوان یک ردیف مستقل بررسی شود** |
| U10 | **آیا Caddy به `X-Accel-Buffering` احترام می‌گذارد** | آزمون زنده لازم دارد |
| U11 | **معنای `source` و `metadata` در `call_logs`** | `[P]` `phone-gap-20260905.md:109-112` — هیچ کامنت، هیچ CHECK، هیچ enum |
| U12 | **آیا هر کارشناس دقیقاً یک داخلی دارد** | سؤال باز prior art (§۶ سؤال ۱۰) **[P]** — همچنان باز |
| U13 | **کدام یک از ۱۴ (`sales`) یا ۴۱ (`profiles`) جمعیت هدف است** | سؤال باز prior art (§۶ سؤال ۱۲) **[P]** — همچنان باز |
| U14 | **`input_type='months'` روی دو پارامتر شمارش تماس** | ناهنجاری ثبت‌شده در `phone-gap-20260905.md` §A11 **[P]**؛ بازتأیید شد (N39) ولی بررسی نشد — خارج از دامنه |

---

## پیوست — تأیید preflight / postflight

```
# preflight
$ cd /d/AfraKalaTest/app && git status --porcelain
?? docs/missions/wave2-credit/
?? docs/missions/wave5/
?? docs/research/allocation-workbench-build-research-20260906.md
?? docs/research/authenticated-open-functions-20260905.md
?? docs/research/ocr-gap-20260905.md
?? docs/research/phone-gap-20260905.md
?? docs/research/scoring-engine-zero-parameters-20260905.md
?? docs/research/three-gaps-merged-20260905.md
$ git rev-parse HEAD              -> a433860410f63200ee10053bd5401bd0f739dfb8
$ git rev-parse --abbrev-ref HEAD -> staging
```

هیچ commit، هیچ stash، هیچ تغییر شاخه، هیچ worktree اضافه یا حذف‌شده، هیچ نوشتنی در دیتابیس،
هیچ بایتی به `192.168.170.10`، و **دقیقاً چهار بستهٔ handshake به `192.168.170.252`**.

خروجی postflight در گزارش نهایی به ارکستریتور آمده است.
