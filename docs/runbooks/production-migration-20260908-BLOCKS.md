# بلوک‌های اجرا — مهاجرت پروداکشن ۲۰۲۶-۰۹-۰۸

> **این سند را مالک، بلوک به بلوک، اجرا می‌کند.** هر بلوک را paste کنید، خروجی کامل را
> برگردانید، و **منتظر بمانید** تا بلوک بعدی داده شود. هرگز دو بلوک را پشت سر هم اجرا نکنید.
>
> مبنای فنی: `docs/runbooks/production-migration-20260908.md` (سند اصلی) و
> `docs/missions/prodprep/STAGE0-findings.md` (اندازه‌گیری‌های تازهٔ ۲۰۲۶-۰۹-۰۸).
> **هر جا این سند با سند اصلی اختلاف دارد، دلیلش همان‌جا نوشته شده است.**

---

## ۰ · قاعده‌های ثابت

1. **نام پایگاه‌داده روی پروداکشن `postgres` است.** هر دستوری که `-d afrakala` دارد مالِ
   ماشین تست است و اشتباه کپی شده.
2. **هر اجرا با `--single-transaction -v ON_ERROR_STOP=1`.** یک شکست کامل rollback می‌شود.
3. **SQL فقط با فایل تحویل می‌شود، هرگز با pipe به `psql`.** و **md5 هر دو سمت** قبل از اجرا.
4. **اعمال، سپس ثبت ردیف لجر، سپس اثبات.** ثبت بدون `ON CONFLICT` — برخورد باید خطا بدهد.
5. **هر خروجی که با «باید ببینی» فرق دارد، توقف کامل است.** خروجی را کامل paste کنید و
   هیچ کاری نکنید.

### نقشِ اجرا — یک نکتهٔ باز

سند اصلی و کل تمرین با `-U supabase_admin` اجرا شده و **همهٔ اندازه‌گیری‌های تأییدشده با همین
نقش‌اند**. بلوک‌های زیر هم `supabase_admin` را می‌گویند.

> **اگر هر دستوری خطای `must be member of role "postgres"` یا `permission denied` داد،
> بایست.** آن‌وقت باید با `-U postgres` اجرا شود و آن یک بلوک تازه است که من می‌دهم.
> **خودتان نقش را عوض نکنید.**

### الگوی استاندارد — همان چیزی که ۷۴ بار روی تمرین کار کرد

هر بلوک فاز ۴ همین چهار قدم است. `<file>` و `<version>` در خود بلوک می‌آید.

```bash
export MSYS_NO_PATHCONV=1
cd C:/afrakala

# ۱) تحویل با stdin
cat "supabase/migrations/<file>" | docker exec -i afrakala-lan-db sh -c "cat > /tmp/m.sql"
# ۲) md5 هر دو سمت — اگر یکی نبودند، psql را اجرا نکن
md5sum "supabase/migrations/<file>" | awk '{print $1}'
docker exec afrakala-lan-db md5sum /tmp/m.sql | awk '{print $1}'
# ۳) اعمال
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/m.sql'
echo "EXIT=$?"
# ۴) ثبت ردیف لجر، با assert اینکه ردیف مالِ خودِ همین اجراست
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
  -d postgres -v ON_ERROR_STOP=1 --single-transaction -c "
DO \$r\$
DECLARE v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_before FROM supabase_migrations.schema_migrations;
  INSERT INTO supabase_migrations.schema_migrations (version) VALUES (''<version>'');
  SELECT count(*) INTO v_after FROM supabase_migrations.schema_migrations;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION ''ledger did not move by exactly one: % -> %'', v_before, v_after;
  END IF;
END \$r\$;"'
```

**دو چیزی که خواهید دید و خرابی نیستند:**
`WARNING: there is already a transaction in progress` (شش مهاجرت `BEGIN;` خودشان را دارند:
۴۶۶، ۵۱۲، ۵۱۳، ۵۱۴، ۵۱۶، ۵۱۷)، و **NOTICEهای فارسی**.
**ولی اگر به‌جای فارسی `?????` دیدید، فوراً بایست** — یعنی فایل از یک pipe رد شده.

---

## فاز ۱ · PREFLIGHT — باقی‌ماندهٔ خواندنی‌ها

سه پرسش را صبح جواب دادید. این‌ها بقیه‌اند.

### بلوک ۱ از M — پیش‌پرواز: نسخه، لجر، replica، فضا، و `base_url`

**چه می‌کند:** پنج چیز را فقط می‌خواند. **هیچ‌چیز را تغییر نمی‌دهد.**

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
 SELECT name, kind, is_active, capabilities, base_url,
        (secret_id IS NOT NULL) AS has_secret, id
   FROM public.ai_providers ORDER BY name;
 SELECT r.service_key, r.capability, r.is_enabled, r.fallback_enabled, p.name AS provider_name
   FROM public.ai_usage_routes r LEFT JOIN public.ai_providers p ON p.id = r.provider_id
  WHERE r.capability = 'vision';"
docker exec afrakala-lan-db df -h /var/lib/postgresql/data
```

**باید ببینی:**

- `is_replica` = **`f`**. اگر `t` بود، **این ماشین replica است و اجرا همین‌جا تمام می‌شود.**
- `ledger_rows` حدود **۵۶۹**، `ledger_max` = **`20260827120000`**.
- `ai_providers` دو ردیف: `gpt` با `is_active=f`، و `ollama` با `is_active=t`،
  **و `base_url` آن باید `http://192.168.170.8:11434` باشد**.
- مسیر `receipt_ocr.vision` با `is_enabled=t` و `fallback_enabled=f` و `provider_name=ollama`.
- فضای آزاد **حداقل ۱ گیگابایت**.
- `APP_GIT_SHA` فعلی (هرچه هست) — فقط یادداشت می‌شود.

> **چرا `base_url` اضافه شده و در سند اصلی نبود:** مهاجرت ۴۷۵ در قدم ۳۷ دقیقاً همین رشته را
> الزام می‌کند. اگر فرق داشته باشد، ۴۷۵ رد می‌شود و آنجا یک تصمیم دارید
> (`STAGE0-findings.md` §۴).

**اگر چیز دیگری دیدی:** بایست. خروجی را کامل برایم paste کن. هیچ کاری نکن.

---

### بلوک ۲ از M — 🔴 drill بازگردانی پشتیبان

**چه می‌کند:** ثابت می‌کند dump امروز صبح واقعاً قابل بازگردانی است. **تا اینجا فقط
«اندازه‌اش درست است» را می‌دانیم، و آن پشتیبان نیست.**

> **این تنها شکاف بزرگی است که هنوز باز است (`U-1`).** سند اصلی خودش می‌گوید: پشتیبانی که
> کسی بازگردانی‌اش را نیازموده، پشتیبان نیست؛ امید است.

**سطح ۱ — ارزان، روی پروداکشن بی‌خطر. paste کن:**

```powershell
docker exec afrakala-lan-db ls -l "C:\Users\AFRA KaLa\Desktop\prod-20260908.dump" 2>$null
Get-Item "C:\Users\AFRA KaLa\Desktop\prod-20260908.dump" | Select-Object Length, LastWriteTime
```

**باید ببینی:** `Length` = **۳۳٬۷۸۴٬۴۶۳** بایت.

**اگر چیز دیگری دیدی:** بایست. خروجی را کامل برایم paste کن.

> **سطح ۲ (بازگردانی واقعی) یک تصمیم شماست** و بلوکش بعد از این می‌آید:
> **(الف)** روی ماشین تست — صفر ریسک برای پروداکشن، ولی یک فایل ۳۳ مگابایتی حاوی دادهٔ
> واقعی مشتریان جابه‌جا می‌شود. **توصیهٔ من.**
> **(ب)** روی خود لپ‌تاپ پروداکشن در یک پایگاهِ scratch — داده جابه‌جا نمی‌شود، ولی یک
> `CREATE DATABASE` روی کلاستر پروداکشن می‌زنید.
> **(ج)** نزنید — آنگاه امشب بدون پشتیبانِ اثبات‌شده جلو می‌روید.

---

## فاز ۲ · آشتی‌دادن لجر — ثبت می‌کند، اجرا نمی‌کند

> **این فاز هیچ مهاجرتی را اجرا نمی‌کند.** فقط ردیف در لجر می‌نویسد.
> **هرگز برای «درست کردن شمارش» یک مهاجرت را دوباره اجرا نکنید.**

فهرست not-applied روی پروداکشن، با توجه به جواب‌های صبح، فقط **بند C** است:
`20260903100000` و `20260903140000` (مهاجرت‌های ۴۲۰ و ۴۲۱).
**۴۰۸ اضافه نمی‌شود** — چون موجود است و ردیف لجرش درست است.

### بلوک ۳ — گزارش آشتی (بدون نوشتن)
### بلوک ۴ — ثبت (`gap` و `inserted` باید برابر باشند)
### بلوک ۵ — اجرای دوباره، باید `gap=0 inserted=0` بدهد

*(متن کامل هر سه بلوک هنگام رسیدن به آن‌ها داده می‌شود — بدنهٔ SQL عیناً از
`ledger-reconcile.sh:74-137` و قدم‌های ۳.۳ تا ۳.۵ سند اصلی.)*

---

## فاز ۳ · بستن default ACL — 🔴 **اینجا سند اصلی اصلاح شده است**

### بلوک ۶ — خواندن وضعیت فعلی

**چه می‌کند:** ۹ ردیف را نشان می‌دهد و grantor و schema هرکدام را. **فقط خواندنی.**

```powershell
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d postgres -c `
"SELECT d.defaclrole::regrole AS grantor, coalesce(n.nspname,'(GLOBAL)') AS schema,
        d.defaclobjtype AS objtype, d.defaclacl
   FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
  ORDER BY 1,2,3;"
```

**باید ببینی:** **۱۴ ردیف** در کل، که **۹ تای آن‌ها `anon` دارند** — سه‌تا
`postgres/public`، سه‌تا `postgres/storage`، سه‌تا `supabase_admin/public`، هرکدام با
`objtype` های `r`، `f`، `S`.

**اگر چیز دیگری دیدی:** بایست. paste کن.

---

### بلوک ۷ — 🔴 بستن، با **دو دستور بیشتر از سند اصلی**

**چه می‌کند:** `anon` را از هر ۹ ورودی برمی‌دارد، **و** گرنت داخلی `EXECUTE TO PUBLIC` روی
توابع تازه را می‌بندد.

> ### چرا دو دستور اضافه — این را قبل از paste بخوانید
>
> بلوکِ سند اصلی فقط `anon` را revoke می‌کند و موفقیت را با
> `count(*) … LIKE '%anon%'` = صفر تعریف می‌کند. **آن معیار می‌تواند برقرار شود در حالی که
> `anon` هنوز هر تابع تازه‌ساخته را اجرا می‌کند.** اندازه‌گیری‌شده روی تمرین
> (`STAGE0-findings.md` §۲): با فقط revoke کردن `anon`، تابع تازه ACL
> `{=X, postgres=X, …}` می‌گیرد — آن `=X` یعنی `PUBLIC`، و `anon` عضو `PUBLIC` است.
>
> **جدول‌ها و sequenceها این مشکل را ندارند** (اندازه‌گیری شد: `anon` روی جدول تازه `f` شد).
> **فقط توابع.**
>
> **مبادله‌ای که باید بپذیرید:** دو دستور آخر `IN SCHEMA` ندارند، پس پیش‌فرض را برای هر
> schema عوض می‌کنند، نه فقط `public`. ۷۴ مهاجرت امشب فقط در `public` تابع می‌سازند، پس
> اجرای امشب اثر نمی‌گیرد؛ اثر ماندگار روی اشیای آینده است. همین کار را مهاجرت ۳۹۳ هم کرده.
> **`authenticated` هیچ‌چیزی از دست نمی‌دهد** — اندازه‌گیری شد.

**paste کن:**

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

**باید ببینی:** یازده بار `ALTER DEFAULT PRIVILEGES`، و بعد **`0`**.

**صفر شرط موفقیت است، نه پیام دستور.**

**اگر چیز دیگری دیدی:** بایست. paste کن. **مخصوصاً اگر
`must be member of role "postgres"` دیدی** — آن‌وقت نقش اجرا باید عوض شود و آن بلوک را
من می‌دهم.

---

### بلوک ۸ — اثبات اینکه بستن واقعاً کار کرد

**چه می‌کند:** یک تابع، یک جدول و یک sequence موقت می‌سازد، مجوز `anon` را می‌خواند، و
**همه را rollback می‌کند**. هیچ‌چیز باقی نمی‌ماند.

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

**باید ببینی — دقیقاً این:**

```
   kind   | anon | authenticated
----------+------+---------------
 function | f    | t
 table    | f    | t
 sequence | f    | t
```

و در انتها `ROLLBACK`.

**اگر ستون `anon` هر جا `t` بود:** بایست. بستن کامل نشده و ۲۶ تابع امشب anon-اجراپذیر
متولد می‌شوند.

---

## فاز ۴ · ۷۴ مهاجرت

**ترتیب، ترتیبِ نام فایل است.** جدول کامل: پیوست ب سند اصلی.

**پیش‌بینی امشب** (`STAGE0-findings.md` §۷): **۶۹ موفق · ۳ توقف تصمیم‌دار (۴۴۹، ۴۵۰، ۴۵۲) ·
۱ رد شده و جایگزین (۴۶۰ → ۵۲۲)**.
**اولین توقف در ترتیب ۱۵ است.** بعد از ترتیب ۱۸، فعلاً هیچ توقفی پیش‌بینی نمی‌شود.

### چیدمان بلوک‌ها

- مهاجرت‌های `[schema]` که **پشت سر هم**اند، در یک بلوک تا سقف ۱۰ تا، با یک `SELECT` اثبات در آخر.
- هر مهاجرت `[schema+data]` **تنها**، با انتظار ردیفش کنارش.
- **۴۴۹، ۴۵۰، ۴۵۲، ۴۶۰/۵۲۲ و ۵۰۷ بلوک ویژه دارند** و تصمیم داخل خودِ بلوک نوشته شده.

| بلوک | ترتیب | مهاجرت | نوع |
|---|---|---|---|
| ۹ | ۱ | ۴۲۰ | `[schema+data]` تنها |
| ۱۰ | ۲ | ۴۲۱ | `[schema+data]` تنها |
| ۱۱ | ۳ | ۴۲۵ | `[schema]` |
| ۱۲ | ۴ | ۴۳۰ | `[schema+data]` تنها |
| ۱۳ | ۵ | ۴۳۱ | `[schema]` |
| ۱۴ | ۶ | ۴۳۲ | `[schema+data]` تنها |
| ۱۵ | ۷ | ۴۳۵ | `[schema+data]` تنها |
| ۱۶ | ۸ | ۴۳۶ | `[schema+data]` تنها |
| ۱۷ | ۹–۱۱ | ۴۴۶، ۴۴۳، ۴۴۵ | `[schema]` دسته‌ای |
| ۱۸ | ۱۲ | ۴۳۷ | `[schema+data]` تنها |
| ۱۹ | ۱۳–۱۴ | ۴۴۷، ۴۴۸ | `[schema]` دسته‌ای · **🛑 نقطهٔ توقف ۱** |
| **۲۰** | **۱۵** | **۴۴۹** | **🔴 بلوک ویژه — انتظار شکست** |
| **۲۱** | **۱۶** | **۴۵۰** | **🔴 بلوک ویژه — انتظار شکست** |
| ۲۲ | ۱۷ | ۴۵۱ | `[schema]` |
| **۲۳** | **۱۸** | **۴۵۲** | **🔴 بلوک ویژه — انتظار شکست** |
| ۲۴ | ۱۹–۲۴ | ۴۵۳، ۴۵۴، ۴۵۵، ۴۵۷، ۴۵۸، ۴۵۹ | `[schema]` دسته‌ای · **🛑 نقطهٔ توقف ۲** |
| **۲۵** | **۲۵** | **۴۶۰ رد می‌شود → ۵۲۲ اجرا می‌شود** | **🔴 بلوک ویژه** |
| ۲۶… | ۲۶–۴۰ | ۴۶۱ … ۴۷۸ | مخلوط · **🛑 نقطهٔ توقف ۳** |
| … | ۴۱–۵۶ | ۴۸۱ … ۴۹۶ | مخلوط · **🛑 نقطهٔ توقف ۴** |
| … | ۵۷–۶۲ | ۴۹۷ … ۵۰۷ | مخلوط · **🛑 نقطهٔ توقف ۵** |
| … | ۶۳–۷۴ | ۵۰۸ … ۵۱۹ | مخلوط · **🛑 نقطهٔ توقف ۶** |

*(متن کامل هر بلوک هنگام رسیدنش داده می‌شود. بلوک‌های ویژه از همین حالا زیر آمده‌اند تا
قبل از شب بخوانیدشان.)*

---

### 🔴 بلوک ۲۰ — ترتیب ۱۵ · مهاجرت ۴۴۹ · **انتظار شکست**

**چه می‌کند:** سه تابع daily-capital را حذف می‌کند و بعد شمارش دو جدول را assert می‌کند.

**باید ببینی — به احتمال بسیار زیاد این خطا:**

```
ERROR:  449: daily_capital_snapshots expected 10 rows, found 0
```

**این شکست انتظاری است و پایگاه‌داده سالم است** — کل تراکنش rollback می‌شود و هیچ تابعی
واقعاً حذف نمی‌شود.

**چرا:** عدد `10` از پایگاه **تست** خوانده شده. شما ورود سرمایهٔ روزانه را رد کردید، پس
پروداکشن هرگز آن ردیف‌ها را ننوشته. روی dump پروداکشن اندازه‌گیری شد: **`daily_capital_snapshots`
صفر و `daily_capital_inputs` صفر** — **پس دو عدد غلط است، نه یکی.**

> ### 🔴 تصمیم شما — همین‌جا
>
> - **(الف) رد کنید و ردیف لجرش را ثبت نکنید — توصیهٔ من.**
>   *مبادله:* هیچ‌چیز روی پروداکشن عوض نمی‌شود. سه تابع بی‌استفاده می‌مانند و به‌عنوان
>   بدهی ثبت می‌شود. **کاملاً برگشت‌پذیر.**
> - **(ب) بایستید و فردا با نویسنده‌اش حل کنید.** *مبادله:* ۵۹ مهاجرت باقی امشب نمی‌نشیند.
>
> **گزینهٔ «عدد را در فایل شل کنید» را نمی‌آورم:** `CLAUDE.md` قاعدهٔ ۶ ویرایش فایل مهاجرت
> موجود را ممنوع می‌کند.
>
> **دقت کنید ۴۴۹ با ۴۶۰ فرق دارد:** ۴۶۰ ردیف لجر می‌گیرد چون ۵۲۲ کارش را انجام می‌دهد.
> **۴۴۹ ردیف لجر نمی‌گیرد، چون هیچ‌چیز کارش را انجام نمی‌دهد.** ثبت کردنش دروغ است.

**اگر خطای دیگری دیدی — یا اگر موفق شد:** بایست. paste کن. موفقیت یعنی پروداکشن دقیقاً
۱۰ و ۲ ردیف دارد، که یعنی فرض من غلط بوده.

---

### 🔴 بلوک ۲۱ — ترتیب ۱۶ · مهاجرت ۴۵۰ · **انتظار شکست، با چهار عدد غلط**

**باید ببینی:**

```
ERROR:  450: backup_142 expected 18 rows, found 16
```

**یافتهٔ تازه‌ای که در سند اصلی نیست:** ۴۵۰ **چهار** ثابت را assert می‌کند و روی dump
پروداکشن **هر چهار غلط‌اند**:

| assert | می‌خواهد | پروداکشن دارد |
|---|---|---|
| `dynamic_parameter_weights_backup_142` | ۱۸ | **۱۶** |
| `dynamic_parameter_weights_backup_20260722` | ۱۸ | **۱۶** |
| `knowledge_documents` | ۱ | **۰** |
| `messenger_messages` | ۱۶ | **۱** |

تمرین فقط اولی را گزارش کرد چون همان‌جا ایستاد. **پس شل کردن یک عدد، شکست را فقط به عدد
بعدی منتقل می‌کند.**

> ### 🔴 تصمیم — **(الف) رد کنید و ردیف لجر ثبت نکنید.** توصیهٔ من، به همان دلیل ۴۴۹.

---

### 🔴 بلوک ۲۳ — ترتیب ۱۸ · مهاجرت ۴۵۲ · **انتظار شکست**

**باید ببینی:** اول دو NOTICE، بعد خطا:

```
NOTICE:  452: backup_142=16 rows, backup_20260722=16 rows, live dynamic_parameter_weights=16 rows
NOTICE:  452: 0 row(s) exist in backup_142 and NOWHERE else -- this is why neither table is dropped
ERROR:  452: rows were lost in the rename (142=16, 0722=16)
```

**آن NOTICE دوم را بخوانید — یافتهٔ تازه است.** ۴۵۲ وجود دارد چون ادعا می‌کند دو ردیف فقط
در `backup_142` هستند و جای دیگری نیستند. **روی dump پروداکشن این عدد صفر است.** یعنی روی
پروداکشن این backupها **کپی محضِ** جدول زنده‌اند و رد کردن ۴۵۲ **هیچ داده‌ای را از دست
نمی‌دهد**. (روی تست ۱۸ در برابر ۱۶ بود و دو ردیف یکتا داشت — آن وضعیت مالِ تست است.)

> ### 🔴 تصمیم — **(الف) رد کنید و ردیف لجر ثبت نکنید.** با این تفاوت که اینجا
> **مطمئن‌تر** از ۴۴۹ و ۴۵۰ است: داده‌ای برای محافظت وجود ندارد.

---

### 🔴 بلوک ۲۵ — ترتیب ۲۵ · **۴۶۰ رد می‌شود، ۵۲۲ اجرا می‌شود** (تصمیم D-62)

**چه می‌کند:** ۴۶۰ را **اجرا نمی‌کند**؛ به‌جایش مهاجرت تازهٔ ۵۲۲ را اجرا می‌کند که همان کار
را با آدرس‌دهی بر اساس **نام** انجام می‌دهد؛ سپس **هر دو** ردیف لجر را ثبت می‌کند.

**چرا ۴۶۰ اجرا نمی‌شود:** UUIDهایش مالِ پایگاه تست‌اند و روی پروداکشن **وجود ندارند**، پس
۴۶۰ نه «بدون تغییر» می‌دهد و نه no-op — **abort می‌کند**، روی همان اولین assert.

**۵۲۲ سه بار اثبات شده** (`STAGE0-findings.md` §۵): روی تمرین اعمال شد (۲ ردیف)، روی پایگاه
تست no-op داد (۰ ردیف)، و روی تمرین بار دوم no-op داد (۰ ردیف).

**paste کن:** الگوی استاندارد با
`<file> = supabase/migrations/20260908120000_522_pin_receipt_ocr_by_name_supersedes_460.sql`
و `<version> = 20260908120000`.

**باید ببینی — چون پروداکشن از قبل در وضعیت مطلوب است، انتظارِ no-op داریم:**

```
NOTICE:  522: receipt_ocr.vision was ALREADY pinned to the local ollama provider e07894ce-... , enabled, fallback off - no change
NOTICE:  522: provider gpt (f6a5bc04-...) was ALREADY inactive - no change
NOTICE:  522: total rows written = 0
NOTICE:  522: NOTE - the pinned local provider ... declares capabilities {chat,embeddings}, which do NOT include vision. ...
NOTICE:  522: local provider base_url is http://192.168.170.8:11434 ...
NOTICE:  522 VERIFY: receipt_ocr.vision is pinned to the local provider ... ; zero active non-local providers declare vision
EXIT=0
```

**`total rows written = 0` اینجا موفقیت است، نه شکست.**
**آن NOTICE دربارهٔ `{chat,embeddings}` هم انتظاری است** — یعنی OCR محلی عملاً خاموش است و
به ورود دستی برمی‌گردد. این همان «پیامد پذیرفته‌شده»ی خودِ ۴۶۰ است و **جهت امنِ شکست** است:
رسیدی که خوانده نمی‌شود بهتر از رسیدی است که به سرور شخص ثالث می‌رود.

**سپس ردیف لجر ۴۶۰ را هم ثبت کنید**، با نسخهٔ `20260906090000` — بلوکش جدا داده می‌شود، و
یادداشتِ «superseded by 522» در گزارش اجرا ثبت می‌شود.

**اگر `total rows written` عددی غیر از صفر بود:** بایست و paste کن. یعنی وضعیت پروداکشن با
آنچه صبح خواندید فرق کرده.

---

### ✅ ترتیب ۳۷ · مهاجرت ۴۷۵ — **انتظار موفقیت** (تصحیح نسبت به تمرین)

روی تمرین ۴۷۵ رد شد و به‌عنوان cascade ۴۶۰ ثبت شد. **آن نتیجه به پروداکشن منتقل نمی‌شود.**
۴۷۵ **وضعیت** را می‌خواند نه UUID را، و وضعیتی که شما در ۲۰۲۶-۰۹-۰۷ دستی ساختید تمام
شرط‌هایش را برآورده می‌کند. اندازه‌گیری شد: با مسیر pin شده، ۴۷۵ **exit 0** می‌دهد
(`STAGE0-findings.md` §۴).

**باید ببینی:** `475 VERIFY: … receipt_ocr.vision still pinned to the LAN Ollama provider`.

**تنها چیزی که می‌تواند خرابش کند:** اگر `base_url` در بلوک ۱ چیزی جز
`http://192.168.170.8:11434` بود. آن‌وقت اینجا می‌ایستیم و تصمیم می‌گیریم.

---

### ✅ ترتیب ۶۲ · مهاجرت ۵۰۷ — **انتظار موفقیت** (تصحیح نسبت به تمرین)

روی تمرین رد شد؛ **روی پروداکشن، به شرط اینکه بلوک ۷ اجرا شده باشد، می‌گذرد.**
اندازه‌گیری‌شده، در ترتیب واقعی پروداکشن (`STAGE0-findings.md` §۳).

**چرا تمرین و پروداکشن اینجا فرق می‌کنند:** روی تمرین تابع
`roll_employee_daily_streaks` از قبل وجود دارد و گرنت `anon=X` در ACLش پخته شده؛ بستنِ
default ACL هیچ‌وقت شیء **موجود** را دست نمی‌زند. پروداکشن روی ۴۲۴ است و **این تابع را
اصلاً ندارد** — مهاجرت ۵۰۴ در ترتیب ۵۹، یعنی **بعد از** بلوک ۷، آن را تازه می‌سازد.

**باید ببینی:** چهار `REVOKE`، دو `GRANT`، یک `DO`، و `EXIT=0`.

**اگر `ERROR: 507: anon must not reach either function` دیدی:** بایست. یعنی بلوک ۷ کامل
اجرا نشده.

---

## فاز ۵ · راستی‌آزمایی · فاز ۶ · دیپلوی · فاز ۷ · smoke

بلوک‌هایشان بعد از پایان فاز ۴ داده می‌شود. دو نکته را از حالا بدانید:

1. **فاز ۵ قدم ۵.۲** (هیچ تابعی anon-اجراپذیر نمانده) **فقط با بلوک ۷ اصلاح‌شده به صفر
   می‌رسد.** با بلوکِ سند اصلی، توابع تازه از راه `PUBLIC` هنوز در دسترس `anon` می‌مانند.
2. **دیپلوی: `--no-deps` و `GIT_SHA` روی خط فرمان، هر دو اجباری.** بدون `--no-deps`
   اپلیکیشن پایین می‌رود؛ بدون `GIT_SHA` برچسب دروغ می‌گوید و تنها چکِ صحتِ دیپلوی خاموش
   می‌شود. مسیر compose و env-file پروداکشن **قبل از آن بلوک از خودِ مخزن تأیید می‌شود**،
   نه از روی مسیرهای ماشین تست.
