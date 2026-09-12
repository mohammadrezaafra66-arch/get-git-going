# بلوک‌های اجرا — مهاجرت پروداکشن · اجرا در ۲۰۲۶-۰۹-۱۲

> **این سند را مجری، بلوک به بلوک، از بلوک ۰ تا فاز ۷ در یک نشست اجرا می‌کند.**
> بعد از هر بلوک، خروجی کامل را برگردانید و منتظر تأیید بمانید. **هرگز دو بلوک را پشت سر هم
> اجرا نکنید.**
>
> مبنای فنی: `docs/runbooks/production-migration-20260908.md` (سند اصلی)،
> `docs/missions/prodprep/STAGE0-findings.md` (اندازه‌گیری‌های ۲۰۲۶-۰۹-۰۸)، و
> `docs/missions/prodprep/MIGRATIONS-74.md` — **که دیگر کامل نیست؛ §۰.۱ را بخوانید.**

---

## ۰.۱ · 🔴 عدد عوض شد: **۷۷** است، نه ۷۴

PR #435 در ۲۰۲۶-۰۹-۰۸ روی `staging` نشست (`a6b6c629`). با آن **سه** فایل مهاجرت روی
`staging` آمد که پروداکشن هیچ‌کدام را ندارد:

```
20260908030000_520_staff_call_metrics_coverage_guard.sql
20260908034500_521_manual_guard_trigger_fn_least_privilege.sql
20260908120000_522_pin_receipt_ocr_by_name_supersedes_460.sql
```

شمارش دوباره، روی `origin/staging` امروز:

```
فایل‌هایی که پروداکشن ندارد (ts > 20260904150000، به‌علاوهٔ 420/421) : 77
همان فهرست در MIGRATIONS-74.md                                      : 74
در staging هست و در فهرست ۷۴تایی نیست                               : 520، 521، 522
در فهرست ۷۴تایی هست و روی staging نیست                              : هیچ‌کدام
```

**`MIGRATIONS-74.md` کهنه است و به‌عنوان فهرست کامل امشب استفاده نشود.** فهرست معتبر امشب
جدول فاز ۴ همین سند است.

> **`staging` جز #435 تکان نخورده.** `origin/staging` روی `a6b6c629` است =
> `9c113aac` + #435. **PR شمارهٔ #436 اصلاً وجود ندارد** — بالاترین PR مخزن ۴۳۵ است
> (`gh pr view 436` → `Could not resolve to a PullRequest`). #433 بسته شد و #434 قبل از
> `9c113aac` ادغام شده بود.

**۵۲۰ و ۵۲۱ در تمرینِ ۷۴تایی نبودند، ولی امروز اندازه‌گیری شدند:** هر دو روی
`prod_rehearsal_20260908` اعمال شدند، md5 هر دو سمت یکی، **هر دو `EXIT=0`**. ۵۲۰ هیچ عدد
مطلقِ ردیف assert نمی‌کند (مقایسه‌هایش `= 0` رابطه‌ای‌اند)، و ۵۲۱ سه `REVOKE` است و بس.
**هر دو `BEGIN;`/`COMMIT;` خودشان را دارند** — پس فهرستِ «هشدارِ بی‌ضرر» حالا هشت‌تاست:
۴۶۶، ۵۱۲، ۵۱۳، ۵۱۴، ۵۱۶، ۵۱۷، **۵۲۰، ۵۲۱**.

### جمع‌بندی عددیِ امشب

| | تعداد |
|---|---|
| فاصلهٔ واقعی پروداکشن ↔ staging | **۷۷** |
| اجرا می‌شوند | **۷۶** (۴۶۰ اجرا نمی‌شود) |
| پیش‌بینی موفق | **۷۳** |
| پیش‌بینی توقف تصمیم‌دار | **۳** — ۴۴۹، ۴۵۰، ۴۵۲ |
| رد شده، ردیف لجر **ثبت می‌شود** | **۱** — ۴۶۰ (جایگزینش ۵۲۲ است) |
| رد شده، ردیف لجر **ثبت نمی‌شود** | **۳** — ۴۴۹، ۴۵۰، ۴۵۲ |
| ردیف لجرِ افزوده در پایانِ یک اجرای کامل | **۷۴** (۷۳ موفق + ردیف ۴۶۰) |

---

## ۰.۲ · قاعده‌های ثابت

1. **نام پایگاه‌داده روی پروداکشن `postgres` است.** هر دستوری که `-d afrakala` دارد مالِ
   ماشین تست است و اشتباه کپی شده.
2. **هر اجرا با `--single-transaction -v ON_ERROR_STOP=1`.** یک شکست کامل rollback می‌شود.
3. **SQL فقط با فایل تحویل می‌شود، هرگز pipe به `psql`**، و **md5 هر دو سمت** قبل از اجرا.
4. **اعمال، سپس ثبت ردیف لجر.** ثبت **بدون `ON CONFLICT`** — برخورد باید خطا بدهد، نه سکوت.
   خروجی درست ثبت دقیقاً `INSERT 0 1` است.
5. **هر خروجی که با «باید ببینی» فرق دارد، توقف کامل است.** خروجی را کامل paste کنید و
   هیچ کاری نکنید. **هرگز «دوباره امتحان کن» بدون اینکه بدانید دفعهٔ دوم چه فرقی می‌کند.**

### نقشِ اجرا — یک نکتهٔ باز که حدس زده نشد

سند اصلی و کل تمرین با `-U supabase_admin` اجرا شده و **همهٔ اندازه‌گیری‌های تأییدشده با
همین نقش‌اند**. بلوک‌های زیر هم `supabase_admin` را می‌گویند.

> **اگر هر دستوری `must be member of role "postgres"` یا `permission denied` داد، بایست.**
> آن‌وقت باید با `-U postgres` اجرا شود و آن یک بلوک تازه است که داده می‌شود.
> **خودتان نقش را عوض نکنید.**

### دفترِ اجرا — بلوک‌های ۰ تا ۳ اینجا ثبت می‌شوند

فاز ۴ **مکانیکاً** بررسی می‌کند که هر چهار بلوک اول تأیید شده باشند. مسیر دفتر:

```
C:\afrakala\run-20260912.log
```

**خودتان این خط‌ها را ننویسید.** بعد از هر بلوک، خروجی را برمی‌گردانید؛ اگر تأیید شد،
دستور ثبتش داده می‌شود. **دفتر، تأییدِ من است، نه خودتصدیقیِ بلوک.**

---

## بلوک ۰ — پشتیبانِ امروز

**چه می‌کند:** وجود، اندازه و سلامتِ فهرستِ dumpِ **امروز صبح** را بررسی می‌کند.
**فقط خواندنی.**

> 🔴 **فایل هدف عوض شده.** dumpِ ۲۰۲۶-۰۹-۰۸ **چهار روز دادهٔ واقعی عقب است و هدفِ
> بازگردانی نیست.** هر ارجاع به پشتیبان در این سند از امروز به این فایل است:
>
> ```
> C:\Users\AfRa KaLa\Desktop\prod-20260912.dump
> ```
>
> فایل ۲۰۲۶-۰۹-۰۸ را پاک نکنید — فقط دیگر هدف نیست.

**paste کن:**

```powershell
$dump = "C:\Users\AfRa KaLa\Desktop\prod-20260912.dump"
Get-Item $dump | Select-Object FullName, Length, LastWriteTime
cmd /c "certutil -hashfile ""$dump"" MD5"
```

**باید ببینی:** فایل موجود است، `LastWriteTime` **امروز ۲۰۲۶-۰۹-۱۲**، `Length` یک عدد در
حدود **۳۴ مگابایت** (dumpِ ۰۹-۰۸ برابر ۳۳٬۷۸۴٬۴۶۳ بایت بود؛ امروز باید **کمی بزرگ‌تر**
باشد، نه کوچک‌تر). یک md5 چاپ می‌شود — **یادداشتش کنید**، سطح ۲ به آن نیاز دارد.

**اگر `Length` کوچک‌تر از ۳۰ مگابایت بود، یا تاریخ امروز نبود:** بایست.

---

### بلوک ۰-ب — سطح ۲: ثابت کنید dump قابل بازگردانی است

**⚠️ این تنها شکاف بزرگی است که هنوز باز است.** سند اصلی خودش می‌گوید: پشتیبانی که کسی
بازگردانی‌اش را نیازموده، پشتیبان نیست؛ امید است. `pg_restore --list` فقط سرآیند فایل را
می‌خواند و **کافی نیست**.

**اول فهرست را بخوانید — بی‌خطر، روی پروداکشن:**

```powershell
$dump = "C:\Users\AfRa KaLa\Desktop\prod-20260912.dump"
cat $dump | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/p12.dump'
docker exec afrakala-lan-db md5sum /tmp/p12.dump
docker exec afrakala-lan-db pg_restore --list /tmp/p12.dump | Select-Object -First 12
docker exec afrakala-lan-db sh -c 'pg_restore --list /tmp/p12.dump | wc -l'
```

**باید ببینی:** md5 **دقیقاً همان** md5 بلوک ۰ (اگر فرق داشت، فایل در راه خراب شده — بایست)؛
`dbname: postgres` در سرآیند؛ و تعداد خط **نزدیک ۵٬۰۷۳**. اگر `TOC Entries` خیلی کمتر از
۵۰۰۰ بود، dump ناقص است.

> ### 🔴 تصمیم — drill واقعی کجا زده شود
>
> - **(الف) روی ماشین تست — توصیهٔ من.** صفر ریسک برای پروداکشن. *مبادله:* یک فایل ۳۴
>   مگابایتی حاوی دادهٔ واقعی مشتریان به ماشین دیگر منتقل می‌شود.
> - **(ب) روی خود لپ‌تاپ پروداکشن، در یک پایگاهِ scratch.** *مبادله:* داده جابه‌جا نمی‌شود،
>   ولی یک `CREATE DATABASE` روی کلاستر پروداکشن می‌زنید.
> - **(ج) نزنید.** *مبادله:* امشب بدون پشتیبانِ اثبات‌شده جلو می‌روید.
>
> بلوک drill بعد از انتخاب شما داده می‌شود. انتظارِ خروجی: `pg_restore` با **exit 1 و حدود
> ۲۱ خطا** تمام می‌شود و **این طبیعی است** (۱۹ تا `pg_cron` و ۲ تا vault)؛ شرط موفقیت
> `persons` حدود **۴٬۸۵۱ یا بیشتر** است. **اگر `persons` صفر بود، dump داده ندارد.**

---

## بلوک ۱ — PREFLIGHT

**چه می‌کند:** شش چیز را می‌خواند. **هیچ‌چیز را تغییر نمی‌دهد.**

**paste کن:**

```powershell
cd C:\afrakala
git rev-parse --short HEAD
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT pg_is_in_recovery() AS is_replica;
 SELECT count(*) AS ledger_rows, min(version) AS ledger_min, max(version) AS ledger_max
   FROM supabase_migrations.schema_migrations;
 SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
 SELECT to_regclass('public.document_numbers') AS dn, to_regclass('public.dual_documents') AS dd,
        to_regclass('public.document_attachments') AS da,
        to_regprocedure('public.hold_credit_for_quote(uuid,uuid)') AS m408;
 SELECT name, kind, is_active, capabilities, base_url, id FROM public.ai_providers ORDER BY name;
 SELECT r.service_key, r.is_enabled, r.fallback_enabled, p.name AS provider_name
   FROM public.ai_usage_routes r LEFT JOIN public.ai_providers p ON p.id = r.provider_id
  WHERE r.capability = 'vision';
 SELECT count(*) AS anon_default_acl FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';"
docker exec afrakala-lan-db df -h /var/lib/postgresql/data
```

**باید ببینی:**

| چیز | مقدار |
|---|---|
| `is_replica` | **`f`** — اگر `t` بود، **اجرا همین‌جا تمام می‌شود** |
| `ledger_rows` | حدود **۵۶۹**، `ledger_max` = **`20260827120000`** |
| `dn` / `dd` / `da` | **هر سه نام جدول** (نه خالی) |
| `m408` | **`public.hold_credit_for_quote(uuid,uuid)`** |
| `ai_providers` | `gpt` با `is_active=f` · `ollama` با `is_active=t` و **`base_url = http://192.168.170.8:11434`** |
| مسیر vision | `is_enabled=t`، `fallback_enabled=f`، `provider_name=ollama` |
| `anon_default_acl` | **۹** |
| فضای آزاد | **حداقل ۱ گیگابایت** |

> **چرا `base_url` اینجاست:** مهاجرت ۴۷۵ در ترتیب ۳۷ **دقیقاً** همین رشته را الزام می‌کند.

**اگر چیز دیگری دیدی:** بایست. paste کن.

---

## بلوک ۲ — آشتی‌دادن لجر

> **این بلوک هیچ مهاجرتی را اجرا نمی‌کند.** فقط ردیف در لجر می‌نویسد.
> **هرگز برای «درست کردن شمارش» یک مهاجرت را دوباره اجرا نکنید** (`CLAUDE.md` ۲b).

فهرست not-applied روی پروداکشن، با توجه به بلوک ۱، فقط **بند C** است: `20260903100000` و
`20260903140000` (مهاجرت‌های ۴۲۰ و ۴۲۱). **۴۰۸ اضافه نمی‌شود** — موجود است و ردیفش درست.

### بلوک ۲-الف · گزارش (بدون نوشتن)

```bash
export MSYS_NO_PATHCONV=1
cd /c/afrakala
printf '20260903100000\n20260903140000\n' > /tmp/skip.txt
ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//' \
  | awk '$1 <= "20260904150000"' | sort -u > /tmp/all.txt
comm -23 /tmp/all.txt /tmp/skip.txt > /tmp/candidates.txt
wc -l /tmp/all.txt /tmp/skip.txt /tmp/candidates.txt
cat /tmp/candidates.txt | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/reconcile_candidates.txt'
md5sum /tmp/candidates.txt | awk '{print $1}'
docker exec afrakala-lan-db md5sum /tmp/reconcile_candidates.txt | awk '{print $1}'
```

**باید ببینی:** دو md5 **یکی**. اگر نبودند، بایست.

سپس فایل گزارش (بدنه عیناً از `ledger-reconcile.sh:74-137`):

```bash
cat > /tmp/rr.sql <<'SQL'
\set ON_ERROR_STOP on
CREATE TEMP TABLE _candidates(version text PRIMARY KEY);
\copy _candidates FROM '/tmp/reconcile_candidates.txt'
CREATE TEMP TABLE _gap AS
  SELECT version FROM _candidates
  EXCEPT SELECT version FROM supabase_migrations.schema_migrations;
CREATE TEMP TABLE _orphan AS
  SELECT version FROM supabase_migrations.schema_migrations
  EXCEPT SELECT version FROM _candidates;
\echo '--- ledger claims ---'
SELECT count(*) AS ledger_rows, min(version) AS ledger_min, max(version) AS ledger_max
  FROM supabase_migrations.schema_migrations;
\echo '--- candidates ---'
SELECT count(*) AS candidate_rows, max(version) AS candidate_max FROM _candidates;
\echo '--- 3a APPLIED BUT UNRECORDED (this is what gets inserted) ---'
SELECT count(*) AS gap_rows FROM _gap;
SELECT version FROM _gap ORDER BY 1;
\echo '--- 3b RECORDED BUT NOT A CANDIDATE (never inserted; investigate) ---'
SELECT count(*) AS orphan_rows FROM _orphan;
SELECT version FROM _orphan ORDER BY 1;
SQL
cat /tmp/rr.sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/rr.sql'
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/rr.sql'
```

**باید ببینی:** `gap_rows` عددی **بین ۵ و ۲۰**. روی تمرین ۱۰ بود.
**اگر خیلی بزرگ‌تر از ۲۰ بود، بایست و بپرس چرا.**
`orphan_rows` معمولاً صفر؛ اگر غیرصفر بود فقط یادداشت می‌شود، **هرگز حذف نمی‌شود**.

### بلوک ۲-ب · ثبت

همان فایل، با این بلاک اضافه‌شده به انتها، سپس اجرای دوباره:

```sql
DO $reconcile$
DECLARE v_gap bigint; v_ins bigint; v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_gap    FROM _gap;
  SELECT count(*) INTO v_before FROM supabase_migrations.schema_migrations;
  -- NO ON CONFLICT: a collision must raise, not be swallowed.
  INSERT INTO supabase_migrations.schema_migrations (version) SELECT version FROM _gap;
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins <> v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: inserted % rows but the gap was %', v_ins, v_gap;
  END IF;
  SELECT count(*) INTO v_after FROM supabase_migrations.schema_migrations;
  IF v_after <> v_before + v_gap THEN
    RAISE EXCEPTION 'ledger-reconcile: ledger went % -> %, expected %', v_before, v_after, v_before + v_gap;
  END IF;
  RAISE NOTICE 'ledger-reconcile: gap=% inserted=% ledger %->% (asserted)', v_gap, v_ins, v_before, v_after;
END
$reconcile$;
```

**باید ببینی:** `NOTICE: ledger-reconcile: gap=N inserted=N ledger X->Y (asserted)` با
**`gap` و `inserted` برابر**، و exit 0.
**اگر `duplicate key` دیدی، بایست** — تراکنش کامل rollback شده و لجر دست‌نخورده است.

### بلوک ۲-ج · اثبات idempotency

بلافاصله همان را دوباره اجرا کنید. **باید ببینی:** `gap=0 inserted=0`.

---

## بلوک ۳ — بستن default ACL · **اینجا سند اصلی اصلاح شده است**

### بلوک ۳-الف · خواندن

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT d.defaclrole::regrole AS grantor, coalesce(n.nspname,'(GLOBAL)') AS schema,
        d.defaclobjtype AS objtype, d.defaclacl
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  ORDER BY 1,2,3;"
```

**باید ببینی:** **۱۴ ردیف**، که **۹ تا `anon` دارند** — سه‌تا `postgres/public`، سه‌تا
`postgres/storage`، سه‌تا `supabase_admin/public`، هرکدام با `objtype` های `r`، `f`، `S`.

### بلوک ۳-ب · بستن — **دو دستور بیشتر از سند اصلی**

> ### چرا دو دستور اضافه — قبل از paste بخوانید
>
> بلوکِ سند اصلی فقط `anon` را revoke می‌کند و موفقیت را `count = 0` تعریف می‌کند.
> **آن معیار می‌تواند برقرار شود در حالی که `anon` هنوز هر تابع تازه‌ساخته را اجرا می‌کند**،
> چون گرنتِ درون‌ساختِ PostgreSQL یعنی `EXECUTE TO PUBLIC` (همان `=X`) سرِ جایش می‌ماند و
> `anon` عضو `PUBLIC` است. اندازه‌گیری‌شده در تراکنش‌های برگشتی:
>
> | چه revoke شد | تابع تازه، `anon` اجرا می‌کند؟ |
> |---|---|
> | هیچ (وضعیت امروزِ پروداکشن) | **t** |
> | فقط `anon` — **بلوکِ سند اصلی** | **t** |
> | `anon` + `REVOKE EXECUTE … FROM PUBLIC` سراسری | **f** |
>
> **جدول‌ها و sequenceها این نقص را ندارند — فقط توابع.**
> **`authenticated` هیچ‌چیز از دست نمی‌دهد.**
>
> **مبادله‌ای که می‌پذیرید:** دو دستور آخر `IN SCHEMA` ندارند، پس پیش‌فرض را برای **هر**
> schema عوض می‌کنند. ۷۶ مهاجرت امشب فقط در `public` تابع می‌سازند، پس اجرای امشب اثر
> نمی‌گیرد؛ اثر ماندگار روی اشیای آینده است. همین کار را مهاجرت ۳۹۳ هم کرده.

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres `
  -v ON_ERROR_STOP=1 --single-transaction -c `
"ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON TABLES    FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON FUNCTIONS FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public  REVOKE ALL ON SEQUENCES FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON TABLES    FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON FUNCTIONS FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA storage REVOKE ALL ON SEQUENCES FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON TABLES    FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON FUNCTIONS FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public  REVOKE ALL ON SEQUENCES FROM anon;
 ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
 ALTER DEFAULT PRIVILEGES FOR ROLE postgres       REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;"
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -tAc `
"SELECT count(*) FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';"
```

**باید ببینی:** یازده بار `ALTER DEFAULT PRIVILEGES`، بعد **`0`**.
**صفر شرط موفقیت است، نه پیام دستور.**

### بلوک ۳-ج · اثبات (همه‌چیز rollback می‌شود)

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"BEGIN;
 CREATE FUNCTION public._p3_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';
 CREATE TABLE public._p3_tbl(id serial);
 CREATE SEQUENCE public._p3_seq;
 SELECT 'function' AS kind, has_function_privilege('anon','public._p3_fn()','EXECUTE') AS anon,
        has_function_privilege('authenticated','public._p3_fn()','EXECUTE') AS authenticated
 UNION ALL SELECT 'table', has_table_privilege('anon','public._p3_tbl','SELECT'),
        has_table_privilege('authenticated','public._p3_tbl','SELECT')
 UNION ALL SELECT 'sequence', has_sequence_privilege('anon','public._p3_seq','SELECT'),
        has_sequence_privilege('authenticated','public._p3_seq','SELECT');
 ROLLBACK;"
```

**باید ببینی — دقیقاً این، و در انتها `ROLLBACK`:**

```
   kind   | anon | authenticated
----------+------+---------------
 function | f    | t
 table    | f    | t
 sequence | f    | t
```

**اگر ستون `anon` هر جا `t` بود:** بایست.

---

# فاز ۴ · ۷۶ مهاجرت

## بلوک ۴ — 🔴 دروازه + مقدمه

**چه می‌کند:** اول بررسی می‌کند بلوک‌های ۰ تا ۳ همه تأیید شده باشند و **اگر نه، امتناع
می‌کند**. بعد تابعِ `mig_apply` را تعریف می‌کند که هر بلوکِ بعدیِ فاز ۴ از آن استفاده می‌کند.

> **این تابع فقط در همین پنجرهٔ Git Bash زندگی می‌کند.** اگر ترمینال را بستید یا پنجرهٔ
> تازه باز کردید، **این بلوک را دوباره paste کنید**، وگرنه بلوک بعدی
> `mig_apply: command not found` می‌دهد.

**paste کن (Git Bash، نه PowerShell):**

```bash
export MSYS_NO_PATHCONV=1
cd /c/afrakala

# ---------- دروازه ----------
LOG=/c/afrakala/run-20260912.log
gate_ok=1
for b in 0 1 2 3; do
  if grep -qx "BLOCK $b OK" "$LOG" 2>/dev/null; then
    echo "gate: BLOCK $b OK"
  else
    echo "gate: BLOCK $b  ***MISSING***"; gate_ok=0
  fi
done
if [ "$gate_ok" -ne 1 ]; then
  echo; echo "GATE REFUSES. Blocks 0-3 are not all confirmed in $LOG."
  echo "STOP. Do not run any Phase 4 block."
else
  echo; echo "GATE PASSED - Phase 4 may begin."
fi

# ---------- تابعِ اعمال ----------
mig_apply() {
  local ver="$1" file="$2" path="supabase/migrations/$2"
  [ -f "$path" ] || { echo "MISSING FILE: $path"; return 1; }
  cat "$path" | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/mig.sql' || return 1
  local h c
  h=$(md5sum "$path" | awk '{print $1}')
  c=$(docker exec afrakala-lan-db md5sum /tmp/mig.sql | awk '{print $1}')
  if [ "$h" != "$c" ]; then
    echo "MD5 MISMATCH $file  host=$h  cont=$c  -- NOT APPLIED"; return 1
  fi
  echo "=== $file  (md5 $h) ==="
  docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
    -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql' \
    || { echo "*** APPLY FAILED: $file  -- transaction rolled back, ledger NOT written ***"; return 1; }
  docker exec afrakala-lan-db sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U supabase_admin \
    -d postgres -v ON_ERROR_STOP=1 --single-transaction \
    -c \"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$ver');\"" \
    || { echo "*** LEDGER RECORD FAILED for $ver ***"; return 1; }
  echo "OK $file"
}
```

**باید ببینی:** چهار خط `gate: BLOCK n OK` و بعد `GATE PASSED - Phase 4 may begin.`

**اگر `GATE REFUSES` دیدی:** بایست. یعنی یکی از بلوک‌های ۰ تا ۳ تأیید نشده.

> **خروجی هر `mig_apply` موفق با `INSERT 0 1` تمام می‌شود و بعد `OK <file>`.**
> **`INSERT 0 1` اثباتِ ثبت است** — چون `ON CONFLICT` نداریم، برخورد خطا می‌دهد.
> **هر چیزی جز `OK` در پایان یک بلوک، توقف است.**

---

## ۴.۱ · چیزهایی که می‌بینید و خرابی نیستند

1. **`WARNING: there is already a transaction in progress`** و بعدش
   `WARNING: there is no transaction in progress` — هشت مهاجرت `BEGIN;`/`COMMIT;` خودشان
   را دارند: **۴۶۶، ۵۱۲، ۵۱۳، ۵۱۴، ۵۱۶، ۵۱۷، ۵۲۰، ۵۲۱**. بی‌ضررند.
2. **NOTICEهای فارسی.** **ولی اگر به‌جای فارسی `?????` دیدی، فوراً بایست** — یعنی فایل از
   یک pipe رد شده و متن نابود شده.
3. **`trigger … does not exist, skipping`** — الگوی `DROP TRIGGER IF EXISTS` است.

## ۴.۲ · عددِ `ins/upd/del` را درست بخوانید

عددهای «تمرین» در جدول‌های زیر **دلتای tuple کل پایگاه‌داده** است (`pg_stat_database`)، و
**شامل کاتالوگ سیستم هم هست**. یک مهاجرت کاملاً DDL هم `9/3/8` نشان می‌دهد.
**این شمارش ردیفِ کسب‌وکار نیست** و نباید این‌طور خوانده شود. برای مقایسه آورده شده‌اند تا
یک انحرافِ بزرگ دیده شود، نه برای تطبیق دقیق.

---

## ۴.۳ · گروه ۱ · ترتیب‌های ۱ تا ۱۴

| بلوک | ترتیب | # | فایل | نسخه | نوع | تمرین ins/upd/del |
|---|---|---|---|---|---|---|
| ۵ | ۱ | ۴۲۰ | `20260903100000_420_guest_quotes_get_their_own_reason.sql` | `20260903100000` | داده — دلیل ردِ پیش‌فاکتور مهمان | 9/3/8 |
| ۶ | ۲ | ۴۲۱ | `20260903140000_421_guest_refusal_message_tells_the_truth.sql` | `20260903140000` | داده — متن پیام رد | 5/1/5 |
| ۷ | ۳ | ۴۲۵ | `20260904160000_425_settlement_dead_predicates.sql` | `20260904160000` | اسکیما | 4/6/4 |
| ۸ | ۴ | ۴۳۰ | `20260904190000_430_asan_import_requires_code_and_mobile.sql` | `20260904190000` | داده — الزام کد و موبایل | 12/2/7 |
| ۹ | ۵ | ۴۳۱ | `20260904193000_431_retire_person_import_batch.sql` | `20260904193000` | اسکیما | 0/0/6 |
| ۱۰ | ۶ | ۴۳۲ | `20260904200000_432_asan_import_batch_provenance_and_revert.sql` | `20260904200000` | داده — provenance و revert | 35/6/7 |
| ۱۱ | ۷ | ۴۳۵ | `20260904210000_435_person_delete_when_there_is_no_history.sql` | `20260904210000` | داده — حذف شخص بدون سابقه | 21/6/6 |
| ۱۲ | ۸ | ۴۳۶ | `20260905100000_436_close_anon_role_grant_escalation.sql` | `20260905100000` | داده — بستن تشدید گرنت `anon` | 12/21/12 |
| ۱۳ | ۹–۱۱ | ۴۴۶، ۴۴۳، ۴۴۵ | (سه فایل، زیر) | — | اسکیما، دسته‌ای | — |
| ۱۴ | ۱۲ | ۴۳۷ | `20260905163000_437_inline_create_registers_asan_identifier.sql` | `20260905163000` | داده — ثبت شناسهٔ آسان | 4/2/4 |
| ۱۵ | ۱۳–۱۴ | ۴۴۷، ۴۴۸ | (دو فایل، زیر) | — | اسکیما، دسته‌ای | — |

**بلوک ۵ تا ۱۲ و ۱۴ — هرکدام یک خط:**

```bash
mig_apply 20260903100000 20260903100000_420_guest_quotes_get_their_own_reason.sql
```
```bash
mig_apply 20260903140000 20260903140000_421_guest_refusal_message_tells_the_truth.sql
```
```bash
mig_apply 20260904160000 20260904160000_425_settlement_dead_predicates.sql
```
```bash
mig_apply 20260904190000 20260904190000_430_asan_import_requires_code_and_mobile.sql
```
```bash
mig_apply 20260904193000 20260904193000_431_retire_person_import_batch.sql
```
```bash
mig_apply 20260904200000 20260904200000_432_asan_import_batch_provenance_and_revert.sql
```
```bash
mig_apply 20260904210000 20260904210000_435_person_delete_when_there_is_no_history.sql
```
```bash
mig_apply 20260905100000 20260905100000_436_close_anon_role_grant_escalation.sql
```

**بلوک ۱۳ — دستهٔ اسکیما (۳ تا)، با اثبات در آخر:**

```bash
mig_apply 20260905110000 20260905110000_446_attach_purchase_actor_active_trigger.sql && \
mig_apply 20260905130000 20260905130000_443_fix_ambiguous_outparams_and_assert_route_permissions.sql && \
mig_apply 20260905140000 20260905140000_445_scheduled_jobs_documentation.sql && \
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -tAc \
"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN
 (''20260905110000'',''20260905130000'',''20260905140000'');"'
```

**باید ببینی:** سه بار `OK`، و در پایان **`3`**.
مهاجرت ۴۴۳ NOTICE می‌دهد: `role_permissions module roles -> 7 rows` و همین‌طور
`purchases -> 7` و `dashboard -> 7`.

**بلوک ۱۴:**
```bash
mig_apply 20260905163000 20260905163000_437_inline_create_registers_asan_identifier.sql
```

**بلوک ۱۵ — دستهٔ اسکیما (۲ تا) · 🛑 نقطهٔ توقف ۱:**

```bash
mig_apply 20260905170000 20260905170000_447_retire_capital_allocation_tombstones.sql && \
mig_apply 20260905170500 20260905170500_448_retire_superseded_functions.sql && \
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -tAc \
"SELECT count(*) AS ledger_rows, max(version) AS top FROM supabase_migrations.schema_migrations;"'
```

**باید ببینی:** دو `OK`، و `top` = `20260905170500`.
**هر ۱۴ تای این گروه روی تمرین موفق بودند — هر شکستی اینجا غیرمنتظره است.**

---

## ۴.۴ · گروه ۲ · ترتیب‌های ۱۵ تا ۲۴ — **سه توقفِ پیش‌بینی‌شده**

### 🔴 بلوک ۱۶ — ترتیب ۱۵ · مهاجرت ۴۴۹ · **انتظار شکست**

```bash
mig_apply 20260905171000 20260905171000_449_retire_daily_capital_functions.sql
```

**باید ببینی — به احتمال بسیار زیاد:**

```
ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
*** APPLY FAILED: ...449... -- transaction rolled back, ledger NOT written ***
```

**این شکست انتظاری است و پایگاه‌داده سالم است.** کل تراکنش rollback شد؛ هیچ تابعی حذف نشد.

**چرا:** عدد `10` از پایگاه **تست** خوانده شده. شما ورود سرمایهٔ روزانه را رد کردید، پس
پروداکشن هرگز آن ردیف‌ها را ننوشت. روی dump پروداکشن اندازه‌گیری شد: `daily_capital_snapshots`
**صفر** و `daily_capital_inputs` **صفر** — **دو عدد غلط است، نه یکی.**

> ### 🔴 تصمیم — **(الف) رد کنید، ردیف لجر ثبت نکنید.** توصیهٔ من.
> *مبادله:* هیچ‌چیز عوض نمی‌شود؛ سه تابع بی‌استفاده می‌مانند و بدهی ثبت می‌شود.
> **کاملاً برگشت‌پذیر.**
> گزینهٔ دیگر: **(ب)** بایستید و فردا با نویسنده‌اش حل کنید — ۶۱ مهاجرت باقی امشب نمی‌نشیند.
> «عدد را در فایل شل کنید» را نمی‌آورم: `CLAUDE.md` قاعدهٔ ۶ ویرایش مهاجرت موجود را ممنوع می‌کند.
>
> **۴۴۹ با ۴۶۰ فرق دارد:** ۴۶۰ ردیف لجر می‌گیرد چون ۵۲۲ کارش را انجام می‌دهد.
> **۴۴۹ ردیف نمی‌گیرد، چون هیچ‌چیز کارش را انجام نمی‌دهد.** ثبتش دروغ است.

**اگر (الف) را انتخاب کردید، هیچ دستوری لازم نیست** — `mig_apply` از قبل ردیف را ننوشته.
مستقیم به بلوک بعد.

**اگر موفق شد:** بایست و paste کن — یعنی پروداکشن واقعاً ۱۰ و ۲ ردیف دارد.

### 🔴 بلوک ۱۷ — ترتیب ۱۶ · مهاجرت ۴۵۰ · **انتظار شکست، چهار عدد غلط**

```bash
mig_apply 20260905171500 20260905171500_450_retire_superseded_tables.sql
```

**باید ببینی:** `ERROR:  450: backup_142 expected 18 rows, found 16`

**یافته‌ای که در سند اصلی نیست — ۴۵۰ چهار ثابت assert می‌کند و هر چهار روی پروداکشن غلط‌اند:**

| assert | می‌خواهد | پروداکشن |
|---|---|---|
| `dynamic_parameter_weights_backup_142` | ۱۸ | **۱۶** |
| `dynamic_parameter_weights_backup_20260722` | ۱۸ | **۱۶** |
| `knowledge_documents` | ۱ | **۰** |
| `messenger_messages` | ۱۶ | **۱** |

تمرین فقط اولی را گزارش کرد چون همان‌جا ایستاد. **شل کردن یک عدد، شکست را فقط به بعدی
منتقل می‌کند.** ۴۵۰ قبل از assert یک جدول `DROP` و چهار جدول `RENAME` می‌کند — **همه
rollback شدند.**

> ### 🔴 تصمیم — **(الف) رد کنید، ردیف لجر ثبت نکنید.** به همان دلیل ۴۴۹.

### بلوک ۱۸ — ترتیب ۱۷ · ۴۵۱ · اسکیما

```bash
mig_apply 20260905172000 20260905172000_451_retire_app_role_wrappers.sql
```

### 🔴 بلوک ۱۹ — ترتیب ۱۸ · مهاجرت ۴۵۲ · **انتظار شکست**

```bash
mig_apply 20260905180000 20260905180000_452_retire_parameter_weight_backups_by_rename.sql
```

**باید ببینی — دو NOTICE، بعد خطا:**

```
NOTICE:  452: backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows
NOTICE:  452: 0 row(s) exist in backup_142 and NOWHERE else -- this is why neither table is dropped
ERROR:  452: rows were lost in the rename (142=16, 0722=16)
```

**آن NOTICE دوم را بخوانید — یافتهٔ تازه.** ۴۵۲ وجود دارد چون ادعا می‌کند دو ردیف فقط در
`backup_142` هستند. **روی dump پروداکشن این عدد صفر است** — یعنی backupها **کپی محضِ** جدول
زنده‌اند و رد کردن ۴۵۲ **هیچ داده‌ای از دست نمی‌دهد.** (۱۸ در برابر ۱۶ و دو ردیف یکتا، وضعیتِ
**تست** است.)

> ### 🔴 تصمیم — **(الف) رد کنید، ردیف لجر ثبت نکنید.** اینجا **مطمئن‌تر** از ۴۴۹ و ۴۵۰
> است: داده‌ای برای محافظت وجود ندارد.

### بلوک ۲۰ — ترتیب‌های ۱۹ تا ۲۴ · دستهٔ اسکیما (۶ تا) · 🛑 نقطهٔ توقف ۲

```bash
mig_apply 20260905183000 20260905183000_453_credit_customers_report_uncomputed_as_null.sql && \
mig_apply 20260905220000 20260905220000_454_wire_overdue_gate_to_receivables.sql && \
mig_apply 20260905221500 20260905221500_455_score_period_current_month_then_dated_fallback.sql && \
mig_apply 20260905224500 20260905224500_457_payables_debt_is_the_purchase_total.sql && \
mig_apply 20260905230000 20260905230000_458_receivables_summary_keeps_unknown_due_dates.sql && \
mig_apply 20260905231500 20260905231500_459_payables_names_an_unknown_due_date.sql && \
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -tAc \
"SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version BETWEEN ''20260905183000'' AND ''20260905231500'';"'
```

**باید ببینی:** شش `OK`، و در پایان **`6`**.

---

## ۴.۵ · گروه ۳ · ترتیب‌های ۲۵ تا ۴۰

### 🔴 بلوک ۲۱ — ترتیب ۲۵ · **۴۶۰ رد می‌شود، ۵۲۲ اجرا می‌شود** (تصمیم D-62)

**چه می‌کند:** ۴۶۰ را **اجرا نمی‌کند**؛ ۵۲۲ را اجرا می‌کند که همان کار را با آدرس‌دهی بر
اساس **نام** انجام می‌دهد؛ سپس **هر دو** ردیف لجر را ثبت می‌کند.

**چرا ۴۶۰ اجرا نمی‌شود:** UUIDهایش مالِ پایگاه تست‌اند و روی پروداکشن وجود ندارند، پس
۴۶۰ نه «بدون تغییر» می‌دهد و نه no-op — **abort می‌کند**، روی همان اولین assert.

```bash
mig_apply 20260908120000 20260908120000_522_pin_receipt_ocr_by_name_supersedes_460.sql && \
docker exec afrakala-lan-db sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U supabase_admin \
  -d postgres -v ON_ERROR_STOP=1 --single-transaction \
  -c \"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260906090000');\""
```

**باید ببینی — چون پروداکشن از قبل در وضعیت مطلوب است، انتظارِ no-op داریم:**

```
NOTICE:  522: receipt_ocr.vision was ALREADY pinned to the local ollama provider e07894ce-... - no change
NOTICE:  522: provider gpt (f6a5bc04-...) was ALREADY inactive - no change
NOTICE:  522: total rows written = 0
NOTICE:  522: NOTE - the pinned local provider ... declares capabilities {chat,embeddings}, which do NOT include vision...
NOTICE:  522: local provider base_url is http://192.168.170.8:11434 ...
NOTICE:  522 VERIFY: ... zero active non-local providers declare vision
INSERT 0 1
OK ...522...
INSERT 0 1        <-- این ردیف ۴۶۰ است
```

**`total rows written = 0` اینجا موفقیت است.** آن NOTICE دربارهٔ `{chat,embeddings}` هم
انتظاری است: OCR محلی عملاً خاموش است و به ورود دستی برمی‌گردد — **جهت امنِ شکست**.

**اگر `total rows written` غیرصفر بود:** بایست — وضعیت پروداکشن از ۲۰۲۶-۰۹-۰۷ تغییر کرده.

### بلوک‌های ۲۲ تا ۳۰ — ترتیب‌های ۲۶ تا ۴۰

| بلوک | ترتیب | # | نسخه · فایل | نوع | تمرین |
|---|---|---|---|---|---|
| ۲۲ | ۲۶ | ۴۶۱ | `20260906091500` · `..._461_gate_hold_and_release_credit.sql` | داده — گیت hold/release | 8/8/7 |
| ۲۳ | ۲۷ | ۴۶۲ | `20260906093000` · `..._462_gate_money_tier_definers.sql` | داده — گاردهای ردهٔ پولی | 5/11/2 |
| ۲۴ | ۲۸ | ۴۶۳ | `20260906094500` · `..._463_gate_identity_tier_definers.sql` | داده — ردهٔ هویت | 6/8/5 |
| ۲۵ | ۲۹ | ۴۶۴ | `20260906100000` · `..._464_gate_catalogue_tier_definers.sql` | داده — ردهٔ کاتالوگ | 3/14/3 |
| ۲۶ | ۳۰ | ۴۶۵ | `20260906101500` · `..._465_gate_housekeeping_tier_definers.sql` | داده — housekeeping | 13/14/12 |
| ۲۷ | ۳۱–۳۲ | ۴۶۶، ۴۶۷ | دستهٔ اسکیما (۲) | اسکیما | — |
| ۲۸ | ۳۳ | ۴۶۸ | `20260906111500` · `..._468_bot_writers_require_a_valid_key.sql` | داده — کلید معتبر `bot_*` | 26/12/26 |
| ۲۹ | ۳۴ | ۴۶۹ | `20260906113000` · `..._469_market_rate_system_rpcs_test_for_service_role_positively.sql` | داده | 9/9/8 |
| ۳۰ | ۳۵–۳۶ | ۴۷۰، ۴۷۱ | دستهٔ اسکیما (۲) | اسکیما | — |

**۴۶۲ روی تمرین رد شد** چون ۴۰۸ آنجا نبود. **روی پروداکشن ۴۰۸ هست (بلوک ۱)، پس می‌گذرد.**
**۴۶۶ `BEGIN;` خودش را دارد** — هشدارِ تراکنش بی‌ضرر است.

```bash
mig_apply 20260906091500 20260906091500_461_gate_hold_and_release_credit.sql
```
```bash
mig_apply 20260906093000 20260906093000_462_gate_money_tier_definers.sql
```
```bash
mig_apply 20260906094500 20260906094500_463_gate_identity_tier_definers.sql
```
```bash
mig_apply 20260906100000 20260906100000_464_gate_catalogue_tier_definers.sql
```
```bash
mig_apply 20260906101500 20260906101500_465_gate_housekeeping_tier_definers.sql
```
```bash
mig_apply 20260906103000 20260906103000_466_receivables_carry_salesperson_and_ceiling.sql && \
mig_apply 20260906110000 20260906110000_467_scoring_tables_select_credit_audience.sql
```
```bash
mig_apply 20260906111500 20260906111500_468_bot_writers_require_a_valid_key.sql
```
```bash
mig_apply 20260906113000 20260906113000_469_market_rate_system_rpcs_test_for_service_role_positively.sql
```
```bash
mig_apply 20260906114500 20260906114500_470_expire_pending_documents_loses_its_direct_authenticated_grant.sql && \
mig_apply 20260906120000 20260906120000_471_ai_provider_key_and_bot_readers_require_a_caller.sql
```

### ✅ بلوک ۳۱ — ترتیب ۳۷ · مهاجرت ۴۷۵ · **انتظار موفقیت** (تصحیح نسبت به تمرین)

روی تمرین رد شد و cascade ۴۶۰ ثبت شد. **آن نتیجه به پروداکشن منتقل نمی‌شود.** ۴۷۵ **وضعیت**
را می‌خواند نه UUID، و وضعیتی که شما در ۲۰۲۶-۰۹-۰۷ ساختید همهٔ شرط‌هایش را برآورده می‌کند.
اندازه‌گیری شد: با مسیر pin شده، ۴۷۵ **exit 0** می‌دهد.

```bash
mig_apply 20260906130000 20260906130000_475_audit_ai_routing_changes.sql
```

**باید ببینی:** `475 VERIFY: … receipt_ocr.vision still pinned to the LAN Ollama provider`

**تنها چیزی که خرابش می‌کند:** اگر `base_url` در بلوک ۱ چیزی جز `http://192.168.170.8:11434`
بود. آن‌وقت اینجا می‌ایستیم.

### بلوک ۳۲ — ترتیب‌های ۳۸–۳۹ · ۴۷۶، ۴۷۷ · دستهٔ اسکیما

```bash
mig_apply 20260906140000 20260906140000_476_close_pre393_anon_execute_grants.sql && \
mig_apply 20260906150000 20260906150000_477_close_anon_table_grants.sql
```

**هر دو روی تمرین رد شدند — هر دو به‌خاطر نبودِ ماژول ۳۳۶–۳۷۰، که روی پروداکشن هست.**

> **یک ریسک نهفته در ۴۷۷ حتی اگر بگذرد:** ۴۷۷ یک پیمایش کاتالوگ نیست — **۳۹۰ `REVOKE`
> ثابت** است که از کاتالوگ پایگاه **تست** تولید شده. جدولی که روی پروداکشن هست و روی تست
> نبوده، **بی‌سروصدا با گرنت `anon` رها می‌شود.** فاز ۵ این را می‌سنجد.

### بلوک ۳۳ — ترتیب ۴۰ · ۴۷۸ · 🛑 نقطهٔ توقف ۳

```bash
mig_apply 20260906160000 20260906160000_478_partial_purchase_payment.sql
```

**تمرین: رد شد (`column pv.reversed_at does not exist`) — کلاس (ب)، روی پروداکشن می‌گذرد.**

---

## ۴.۶ · گروه ۴ · ترتیب‌های ۴۱ تا ۵۶ — **سنگین‌ترین گروه از نظر دادهٔ واقعی**

| بلوک | ترتیب | # | نسخه | چه داده‌ای | تمرین |
|---|---|---|---|---|---|
| ۳۴ | ۴۱ | ۴۸۱ | `20260906170000` | ساخت `allocation_rows` + ۳۱ FK به `persons` | **208/14/6** |
| ۳۵ | ۴۲ | ۴۸۲ | `20260906171500` | RPCهای تخصیص | 23/12/0 |
| ۳۶ | ۴۳ | ۴۸۳ | `20260906180000` | تریگرهای audit روی `allocation_rows` | 21/7/6 |
| ۳۷ | ۴۴ | ۴۸۴ | `20260906181000` | **rename** `capital_allocation_ledger` | 11/7/6 |
| ۳۸ | ۴۵ | ۴۸۵ | `20260906182000` | پر کردن شکاف‌های `role_permissions` | 3/0/0 |
| ۳۹ | ۴۶ | ۴۸۶ | `20260906190000` | ساخت `chart_of_accounts` + seed | 103/12/0 |
| ۴۰ | ۴۷ | ۴۸۷ | `20260906190500` | اسکیما — ستون‌های تعهدی | 0/0/0 |
| ۴۱ | ۴۸ | ۴۸۸ | `20260906191000` | ثبت تعهدی فروش | 18/5/7 |
| ۴۲ | ۴۹ | ۴۸۹ | `20260906191500` | ثبت تعهدی خرید | 9/3/0 |
| ۴۳ | ۵۰ | ۴۹۰ | `20260906192000` | اسکیما | 1/0/0 |
| ۴۴ | ۵۱ | ۴۹۱ | `20260906192500` | مسیرهای لغو تعهدی | 16/5/7 |
| ۴۵ | ۵۲ | ۴۹۲ | `20260906193000` | اعلان روزانهٔ تعهدی | 3/3/0 |
| ۴۶ | ۵۳ | ۴۹۳ | `20260906193500` | اسکیما | 4/2/3 |
| ۴۷ | ۵۴ | ۴۹۴ | `20260906194000` | clamp ماندهٔ پرداخت خرید | 5/1/4 |
| ۴۸ | ۵۵ | ۴۹۵ | `20260906194500` | پرداخت ضمنی به‌عنوان مانده | 5/1/5 |
| ۴۹ | ۵۶ | ۴۹۶ | `20260906200000` | اسکیما | 4/3/6 |

```bash
mig_apply 20260906170000 20260906170000_481_allocation_rows.sql
```
**باید ببینی:** `481 OK: allocation_rows created; 31 person FKs, all registered; anon has nothing`
— **این یکی از شش عددِ قابل‌اعتماد است.**

```bash
mig_apply 20260906171500 20260906171500_482_allocation_rpcs.sql
```
```bash
mig_apply 20260906180000 20260906180000_483_allocation_rows_audit_write_triggers.sql
```
```bash
mig_apply 20260906181000 20260906181000_484_retire_capital_allocation_ledger.sql && \
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -tAc \
"SELECT to_regclass(''public.capital_allocation_ledger'') AS old_must_be_null;"'
```
**باید ببینی:** `OK`، و بعد یک خط **خالی** (یعنی `NULL`). ۴۸۴ یک جدول را rename می‌کند؛
**اگر بی‌صدا گذشت، همین `SELECT` اثباتش است.**

```bash
mig_apply 20260906182000 20260906182000_485_fill_role_permissions_gaps.sql
```
**باید ببینی:** `485: role_permissions now 189 rows, 0 gaps` — عددِ قابل‌اعتماد.

```bash
mig_apply 20260906190000 20260906190000_486_chart_of_accounts.sql
```
```bash
mig_apply 20260906190500 20260906190500_487_ledger_accrual_columns.sql
```
**تمرین: رد شد (`column "doc_kind" does not exist`) — کلاس (ب)، روی پروداکشن می‌گذرد.**

```bash
mig_apply 20260906191000 20260906191000_488_sale_accrual_posting.sql
```
```bash
mig_apply 20260906191500 20260906191500_489_purchase_accrual_posting.sql
```
```bash
mig_apply 20260906192000 20260906192000_490_quote_status_cancelled_after_accept.sql
```
```bash
mig_apply 20260906192500 20260906192500_491_accrual_cancel_paths.sql
```
```bash
mig_apply 20260906193000 20260906193000_492_daily_accrual_notice.sql
```
```bash
mig_apply 20260906193500 20260906193500_493_notification_type_daily_accrual.sql
```
```bash
mig_apply 20260906194000 20260906194000_494_purchase_payment_outstanding_clamp.sql
```
```bash
mig_apply 20260906194500 20260906194500_495_implicit_payment_is_outstanding.sql
```
```bash
mig_apply 20260906200000 20260906200000_496_call_logs_batch_score_recompute.sql
```
**باید ببینی:** `496 OK: per-row call_logs recompute retired … anon has nothing` · 🛑 **نقطهٔ توقف ۴**

> ⚠️ **۴۸۸، ۴۸۹، ۴۹۱ و ۴۹۲ روی تمرین تقریباً هیچ کاری نکردند** چون `journal_entries` آنجا
> **صفر** ردیف دارد و روی پروداکشن **۱۵**. **اعداد این چهار ردیف کمترین ارزش را دارند** —
> روی پروداکشن مسیر تعهدی واقعاً اجرا می‌شود. انحراف اینجا لزوماً خطا نیست، ولی paste کنید.

---

## ۴.۷ · گروه ۵ · ترتیب‌های ۵۷ تا ۶۲

```bash
mig_apply 20260906201000 20260906201000_497_call_logs_cdr_columns.sql && \
mig_apply 20260906202000 20260906202000_498_call_log_extensions.sql
```
**۴۹۷ روی تمرین رد شد (cascade ۴۷۷). اگر ۴۷۷ در بلوک ۳۲ گذشت، این هم می‌گذرد.**

```bash
mig_apply 20260906210000 20260906210000_504_employee_streaks_daily.sql
```
```bash
mig_apply 20260906211000 20260906211000_505_credit_request_approval.sql
```
```bash
mig_apply 20260906212000 20260906212000_506_capital_manual_floor.sql
```

### ✅ بلوک ۵۳ — ترتیب ۶۲ · مهاجرت ۵۰۷ · **انتظار موفقیت** · 🛑 نقطهٔ توقف ۵

روی تمرین رد شد؛ **روی پروداکشن، به شرط اینکه بلوک ۳ اجرا شده باشد، می‌گذرد.**
اندازه‌گیری‌شده در ترتیب واقعی پروداکشن.

**چرا تمرین و پروداکشن فرق می‌کنند:** روی تمرین `roll_employee_daily_streaks` از قبل وجود
دارد و `anon=X` در ACLش پخته شده؛ بستنِ default ACL هرگز شیء **موجود** را دست نمی‌زند.
پروداکشن روی ۴۲۴ است و این تابع را **ندارد** — مهاجرت ۵۰۴ (بلوک ۵۰، ترتیب ۵۹) یعنی
**بعد از** بلوک ۳، آن را تازه می‌سازد.

```bash
mig_apply 20260907060000 20260907060000_507_cron_definer_writers_are_not_authenticated_callable.sql
```

**باید ببینی:** چهار `REVOKE`، دو `GRANT`، یک `DO`، `INSERT 0 1`، `OK`.
**اگر `ERROR: 507: anon must not reach either function` دیدی:** بایست — بلوک ۳ کامل نشده.

---

## ۴.۸ · گروه ۶ · ترتیب‌های ۶۳ تا ۷۴ · و دو مهاجرتِ تازه

```bash
mig_apply 20260907090000 20260907090000_508_delete_residue_allocation_row.sql
```
**باید ببینی:** `D-55: allocation_rows قبل=0 ، حذف‌شده=0` — **`حذف‌شده=0` اینجا موفقیت است**،
چون ردیفِ هدف یک artefact پایگاه تست بود. **و اگر فارسی سالم چاپ شد، تحویل درست بوده.**

```bash
mig_apply 20260907093000 20260907093000_509_allocation_tehran_today.sql
```
```bash
mig_apply 20260907100000 20260907100000_512_call_logs_issabel_import_foundation.sql
```
```bash
mig_apply 20260907103000 20260907103000_510_daily_allocation_honours_manual_floor.sql
```
```bash
mig_apply 20260907110000 20260907110000_513_call_import_worker_recompute.sql
```
```bash
mig_apply 20260907113000 20260907113000_511_manual_credit_floor_guard.sql
```
**۵۱۱ امنیتی است** — گارد کف اعتبار دستی.

```bash
mig_apply 20260907123000 20260907123000_515_system_health_reports_require_admin.sql && \
mig_apply 20260907130000 20260907130000_514_call_extension_activity_views.sql && \
mig_apply 20260907140000 20260907140000_516_call_extension_views_least_privilege.sql && \
mig_apply 20260907150000 20260907150000_518_manual_credit_floor_guard_covers_insert.sql
```
**۵۱۴ و ۵۱۶ روی تمرین رد شدند (cascade ۴۹۷ ← ۴۷۷). اگر ۴۹۷ گذشت، این دو هم می‌گذرند.**
**۵۱۵ و ۵۱۸ امنیتی‌اند.**

```bash
mig_apply 20260907154500 20260907154500_517_derive_staff_call_metrics.sql
```
```bash
mig_apply 20260907170000 20260907170000_519_system_health_guard_targets_api_callers.sql
```
**۵۱۹ امنیتی است.**

### بلوک ۶۳ — **۵۲۰ و ۵۲۱ — تازه، در فهرست ۷۴تایی نبودند** · 🛑 نقطهٔ توقف ۶

```bash
mig_apply 20260908030000 20260908030000_520_staff_call_metrics_coverage_guard.sql && \
mig_apply 20260908034500 20260908034500_521_manual_guard_trigger_fn_least_privilege.sql && \
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -tAc \
"SELECT count(*) AS ledger_rows, max(version) AS top FROM supabase_migrations.schema_migrations;"'
```

**باید ببینی:** دو `OK`، و `top` = **`20260908120000`** (که ۵۲۲ است، چون در بلوک ۲۱ ثبت شد و
از ۵۲۱ بزرگ‌تر است).
**هر دو `BEGIN;`/`COMMIT;` خودشان را دارند** — هشدارِ تراکنش بی‌ضرر است.
**۵۲۰ روی تمرین امروز اعمال شد و `EXIT=0` داد؛ ۵۲۱ هم همین‌طور.**

---

# فاز ۵ · راستی‌آزمایی

### بلوک ۶۴ — لجر و اسکیما با هم بخوانند

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT count(*) AS ledger_rows, max(version) AS top FROM supabase_migrations.schema_migrations;"
```
**باید ببینی:** `top` = **`20260908120000`**. `ledger_rows` = ۵۶۹ + آنچه بلوک ۲ ثبت کرد +
**۷۴** (۷۳ موفق + ردیف ۴۶۰). اگر ۴۴۹/۴۵۰/۴۵۲ رد شدند، آن سه **نباید** در لجر باشند.

### بلوک ۶۵ — هیچ تابعی anon-اجراپذیر نمانده باشد · **مهم‌ترین چک**

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname IN ('pay_purchase_with_voucher','review_credit_request',
        'create_sales_quote_with_items','reverse_document','calculate_customer_realtime_credit',
        'get_receivables_summary','get_payables_summary','asan_commit_person_batch',
        'asan_revert_person_batch','roll_employee_daily_streaks',
        'notify_accountants_daily_accrual_summary','ai_get_provider_key')
  ORDER BY 1;"
```
**باید ببینی:** `(0 rows)`. **هر نامی که ظاهر شود یعنی بلوک ۳ کامل نبوده.**

### بلوک ۶۶ — جدول‌ها و ویوها

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT c.relname, has_table_privilege('anon', c.oid, 'SELECT') AS anon_select
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname IN
    ('allocation_rows','chart_of_accounts','call_log_extensions',
     'v_promotion_suggestions','vw_account_balances')
  ORDER BY 1;
 SELECT count(*) AS anon_default_acl FROM pg_default_acl WHERE defaclacl::text LIKE '%anon%';"
```
**باید ببینی:** هر پنج `anon_select = f`، و `anon_default_acl = 0`.

### بلوک ۶۷ — سرشماری `og103`: `anon` دقیقاً مجموعهٔ KEEP_OPEN را بخواند

```powershell
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','v','m')
    AND has_table_privilege('anon', c.oid, 'SELECT')
  ORDER BY 1;"
```
**باید ببینی:** فهرستی کوتاه — انتظار **`brands`، `product_images`، `profile_field_definitions`**
و چند جدولِ پایهٔ view. **هر نام غیرمنتظره را paste کنید** — ۴۷۷ فهرست ثابت دارد و جدولی که
روی تست نبوده از دستش در می‌رود.

### بلوک ۶۸ — PostgREST را ری‌استارت کنید

```powershell
docker restart afrakala-lan-rest
docker ps --filter name=afrakala-lan-rest --format "{{.Names}}`t{{.Status}}"
```
**باید ببینی:** `afrakala-lan-rest   Up X seconds`.
> **`afrakala-lan-db` را ری‌استارت نکنید.** روی پروداکشن اندازه‌گیری نشده — UNKNOWN.

---

# فاز ۶ · دیپلوی

### بلوک ۶۹ — تگ رول‌بک، سپس بیلد

```powershell
cd C:\afrakala
docker tag afrakala-app:lan afrakala-app:lan-rollback
git fetch origin; git status -sb
```
**باید ببینی:** تگ بدون خطا، و شاخه `main` بدون تغییرِ محلی. **مالک باید #435 را قبلاً در
`main` ادغام کرده باشد و اینجا `git pull` شود** — بلوکش جدا داده می‌شود.

### بلوک ۷۰ — دیپلوی · **دو چیز اجباری**

```powershell
cd C:\afrakala
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
  up -d --no-deps --build web
```

> **۱. `--no-deps` — بدون آن اپلیکیشن پایین می‌رود.** `web` به `kong` وابسته است و
> `auth`/`rest`/`storage`/`meta` همه `depends_on: db-role-fix` دارند؛ یک `up -d web` سادهٔ
> کانتینر یک‌بارمصرفِ `db-role-fix` را وارد گراف می‌کند و آن روی این ماشین‌ها بالا نمی‌آید.
> **بازیابی، اثبات‌شده:** `docker start afrakala-lan-web`.
> **۲. `GIT_SHA` روی خط فرمان — بدون آن بیلد درست است و برچسب دروغ می‌گوید**، و همان
> برچسب تنها چکِ صحتِ دیپلوی است.

### بلوک ۷۱ — راستی‌آزمایی دیپلوی

```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
git rev-parse --short HEAD
docker ps --filter name=afrakala-lan --format "{{.Names}}`t{{.Status}}"
curl.exe -s -o NUL -w "%{http_code} %{time_total}\n" http://192.168.170.10:3000/login
curl.exe -s -w "\n%{http_code}\n" http://192.168.170.10:3000/api/healthz
```
**باید ببینی:** دو مقدار SHA **یکی**؛ `afrakala-lan-db-role-fix` با `Exited (0)` و هر
`afrakala-lan-*` دیگر `Up`؛ `/login` = **۲۰۰** زیر یک ثانیه؛ `/api/healthz` = **۲۰۰**.

**اگر SHAها یکی نبودند:** بایست — دیپلوی کدی را که فکر می‌کنید اجرا نمی‌کند.

### بلوک ۷۲ — گیتِ سرد: `viewer` نباید به `/admin/automation` برسد

در یک پنجرهٔ **ناشناس**، با کاربر `viewer` وارد شوید و `/admin/automation` را باز کنید.
**باید ببینی:** رد شدن / ریدایرکت. **paste کنید چه دیدید.**

---

# فاز ۷ · smoke — شما کلیک می‌کنید، من نمی‌کنم

با کاربر **`accountant`** وارد شوید و **فقط گزارش کنید چه می‌بینید**:

1. صفحهٔ **دریافتنی‌ها** — ردیف‌ها می‌آیند؟ ستون فروشنده و سقف پر است؟
2. صفحهٔ **پرداختنی‌ها** — بدهی برابر کل خرید است؟ تاریخ سررسید نامعلوم نام دارد؟
3. **میز کار تخصیص** — باز می‌شود؟ ردیف‌ها می‌آیند؟
4. **یک آپلود OCR رسید** — **انتظارِ شکست یا ورود دستی داریم** (ollama قابلیت `vision`
   اعلام نمی‌کند). **اگر رسید به‌درستی خوانده شد، آن هم را بگویید** — یعنی فرضِ ما غلط بوده.

**هیچ‌کدام را «درست کنید» نکنید. فقط گزارش.**
