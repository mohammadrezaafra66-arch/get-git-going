# پژوهش — فهرست وصل‌نشده‌ها: هر یتیم چیست، و چه باید بشود

**READ-ONLY — هیچ چیزی تغییر نکرد.** تنها فایل نوشته‌شده همین سند است. هیچ migration، هیچ نصب،
هیچ حذف، هیچ commit. همهٔ statementهای دیتابیس با
`PGOPTIONS="-c default_transaction_read_only=on"` اجرا شدند و تنها probe رفتاری داخل
`BEGIN READ ONLY … ROLLBACK` بود. `192.168.170.10` نه تماس گرفته شد، نه resolve، نه ping.

| | |
|---|---|
| مخزن | `D:\AfraKalaTest\app` · شاخهٔ `staging` |
| **SHA خوانده‌شده** | **`6c812f08d0fc0373246e2d3d4fbb8ca077c917d6`** — همهٔ اندازه‌گیری‌ها روی این SHA |
| **SHA در پایان** | **`a085dcc4`** — ⚠️ **درخت وسط ممیزی تکان خورد؛ بند زیر** |
| دیتابیس | `afrakala` روی `afrakala-lan-db`، به‌عنوان `supabase_admin` |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| وضعیت | **PARTIAL** — دلیل دقیق در «خودآزمایی» بند ۳ (ورود با نقش‌های sales/viewer انجام نشد) |

### ⚠️ درخت وسط ممیزی تکان خورد — و چرا نتایج دست‌نخورده می‌مانند

عامل دیگری در همین checkout وسط کار commit زد. HEAD از `6c812f08` به `a085dcc4` رفت.
**من هیچ commitی نزدم و هیچ شاخه‌ای عوض نکردم.** آنچه landed شد:

```
$ git log --oneline 6c812f08..HEAD
a085dcc4 docs(research): frontend/backend gaps and nav active state

$ git diff --stat 6c812f08..HEAD
 docs/research/asan-bridge-build-20260904.md     | 160 +++++
 docs/research/frontend-backend-gaps-20260905.md | 897 ++++++++++++++++++++++++
 docs/research/nav-active-state-20260905.md      | 816 +++++++++++++++++++++
 3 files changed, 1873 insertions(+)

$ git diff --name-only 6c812f08..HEAD | grep -E "supabase/migrations|src/|automation/"
(هیچ)
```

سه سند پژوهشی که قبلاً untracked بودند commit شدند و **بس**. نه migration، نه کد، نه route،
نه `automation/`. **هیچ‌کدام از سطح‌هایی که اندازه گرفتم عوض نشد**، پس هر عدد این سند روی
`6c812f08` معتبر می‌ماند. اگر build mission روی SHA تازه‌تری اجرا شود، فقط لازم است همین
`git diff --name-only` را تکرار کند.

---

## 🔴 پیش از هر چیز — یک یافتهٔ امنیتی، نه یک قلم فهرست

**هر کسی که کلید عمومی `anon` را دارد — که در باندل مرورگر است و عملاً عمومی است — می‌تواند
بدون هیچ ورودی به سیستم، به خودش یا هرکسی نقش `admin` بدهد.**

سه تابع، هر سه `SECURITY DEFINER`، هر سه **بدون هیچ بررسی نقشی در بدنه**، هر سه با
`EXECUTE` برای `anon`:

```
$ psql: has_function_privilege / proacl
assign_user_role      | anon=true | authenticated=true | owner=supabase_admin | secdef=true
assign_user_role_txt  | anon=true | authenticated=true | owner=supabase_admin | secdef=true
revoke_user_role      | anon=true | authenticated=true | owner=supabase_admin | secdef=true
```

بدنهٔ کامل `assign_user_role_txt` — تمام آن، بدون حذف:

```sql
CREATE OR REPLACE FUNCTION public.assign_user_role_txt(_target_user uuid, _role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (_target_user, _role::public.app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
END; $function$
```

هیچ `has_role`، هیچ `IF NOT … RAISE`، هیچ چیز. و RLS جلویش را نمی‌گیرد:

```
user_roles rls_enabled=true rls_forced=false owner=postgres policies=4
supabase_admin superuser=true bypassrls=true
```

`relforcerowsecurity=false` و مالکِ تابع superuser با `bypassrls` است، پس تابع RLS را دور می‌زند.

**اثبات زنده، از راه PostgREST واقعی با کلید anon.** برای اینکه چیزی نوشته نشود، عمداً یک
مقدار نقشِ نامعتبر فرستادم؛ اجرا وارد بدنه می‌شود و روی cast به enum شکست می‌خورد — یعنی
مجوز رد نشده، فقط دادهٔ من بد بوده:

```
$ curl -X POST http://192.168.170.8:9000/rest/v1/rpc/assign_user_role_txt \
       -H "apikey: <ANON>" -H "Authorization: Bearer <ANON>" \
       -d '{"_target_user":"00000000-...","_role":"__probe_invalid_role__"}'
HTTP 400
{"code":"22P02","message":"invalid input value for enum app_role: \"__probe_invalid_role__\""}
```

با `"_role":"admin"` همان مسیر ردیف را می‌نوشت. همین نتیجه برای `assign_user_role` و
`revoke_user_role` تکرار شد.

**کنترل روش‌شناسی** — یک تابع که *درست* بسته شده، با همان کلید و همان مسیر:

```
$ curl -X POST .../rpc/capture_score_snapshots -H "apikey: <ANON>" -d '{}'
HTTP 401
{"code":"42501","message":"permission denied for function capture_score_snapshots"}
```

یعنی ۴۰۱ شکل پاسخِ «بسته» است؛ ۴۰۰ با `22P02` شکل پاسخِ «باز و وارد بدنه شده».

### چرا این از دست رفت — و چرا دقیقاً به این ممیزی مربوط است

این حفره **قبلاً پیدا و بسته شده بود** — ولی نصفه.
`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts:1-14`:

```
 * OG-61 / migration 399 — an UNAUTHENTICATED caller must not reach any SECURITY DEFINER
 * function that writes and carries no authorization check of its own.
 * This gate exists because the hole was real and was proven, not suspected. Before 399:
 *     SET ROLE anon;
 *     SELECT public.revoke_user_role_txt('<a real admin uuid>', 'admin');
 *     -- admin role rows: 14 -> 13
```

migration ۳۹۹ آن حادثه را بست — و `revoke_user_role_txt` امروز واقعاً `anon=false` است.
ولی آن تست **۲۶ نام را دستی فهرست می‌کند**، و سه نام در فهرستش نیست:

```
$ grep -c "assign_user_role" e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
0
```

- `assign_user_role_txt` — دادن نقش، که از گرفتنِ نقش بدتر است. پوشش داده نشده.
- `assign_user_role` و `revoke_user_role` — **دوقلوهای «جایگزین‌شده»ی خوشهٔ ۳ همین فهرست.**
  هرکدام یک `PERFORM` روی نسخهٔ `_txt` است، و `revoke_user_role` با `anon=true` **بازتر از
  خودِ `revoke_user_role_txt` است که `anon=false` دارد.**

**این دقیقاً همان چیزی است که «دوقلوی زائد» را از یک قلم نظافتی به یک قلم امنیتی تبدیل می‌کند:
درِ دوم همان اتاق، و فقط درِ اول قفل شد.** تعداد فعلی برای زمینه، بدون هیچ تغییری:
`user_roles_rows=36 admins=14`.

من هیچ نقشی ندادم و نگرفتم. هیچ ردیفی نوشته نشد.

---

## Verdict

**۶۷ قلم شمرده شد. ۱۲ تای آن‌ها واقعاً وصل‌شدنی است، ۱۶ تا باید حذف شود، ۹ تا تصمیم مالک
می‌خواهد، و بقیه عمداً همان‌طور که هستند درست‌اند.** [E] سه فهرست دوباره استخراج شد و هر سه با
اعداد ۳۵/۱۵/۱۴ اختلاف دارد — و در هر سه مورد **عدد من برنده است چون روشش قابل بازآزمایی است**:
توابع **۳۷** (=۳۵ به‌علاوهٔ دو تابع trigger که به هیچ triggerی وصل نیستند و ممیزی قبلی به‌خاطر
`RETURNS trigger` از فهرست انداخته بود)، جدول‌های بی‌نویسنده **۱۸** (=۱۴ نام قبلی + **سه** جدول
backup نه یکی + `person_field_definitions`)، و صفحه‌های بی‌لینک **۷ نه ۱۴** — چون هفت تای آن
فهرست در واقع لینک دارند و ممیزی قبلی صرفاً ندیده بودشان (F-P1).

مهم‌ترین چیزی که این ممیزی عوض می‌کند، سه تصحیح است. یکم، **بخش بزرگی از «۱۴ صفحهٔ بی‌لینک»
اصلاً بی‌لینک نیست**: `/collaboration` — که خودش در رجیستری است — یک هاب است که
`/my-penalties`، `/delivery-receipts` و `/documents` را لینک می‌کند، و `/pricing` هم
`/pricing/owner-attention` را. دوم، **خوشهٔ «کار زمان‌بندی‌شده» آن چیزی نیست که نامش می‌گوید**:
`recompute_customer_credit_scores` امروز حتی دستی هم کار نمی‌کند، چون `calculate_credit_score`
که صدا می‌زند هنوز از جدول حذف‌شدهٔ `invoices` می‌خواند و با `42P01` می‌ترکد — اثبات‌شده با یک
probe زنده. سوم، **`dynamic_entity_scores` را هیچ تابعی نمی‌نویسد**؛ فقط صفحهٔ ادمین می‌نویسدش،
پس «۰ ردیف برای دورهٔ جاری» نشانهٔ نبودِ زمان‌بند نیست — نشانهٔ این است که کسی هنوز اعداد شهریور
را وارد نکرده.

و در بالای همه، یک قلم که اصلاً قلم فهرست نیست: سه تابع نقش‌دهی که از راه `anon` قابل
فراخوانی‌اند.

---

## Counts — re-derived

### فهرست ۱ — توابع یتیم: **۳۷** (ممیزی قبلی: ۳۵)

روش: توابع `public` با `prokind='f'`، بدون وابستگی افزونه، که **هیچ‌کدام** از این‌ها نیستند —
صدا زده از بدنهٔ تابع دیگر، وصل به trigger یا event trigger، نام‌برده در policy، در `DEFAULT`،
در `CHECK`، در view/matview — **منهای** هر نامی که frontend با هر یک از پنج اصطلاح فراخوان
صدا می‌زند `[prior:fb-gaps F16]`.

```
$ psql -f orphans.sql            -> 236 functions with no in-DB caller
$ comm -23 <those> <213 rpc names called from src/server (all 5 idioms)>
   -> 37
```

**اختلاف با ۳۵، دقیقاً:**

```
$ comm -23 <my 37> <the brief's 35>
handle_new_user
tg_purchase_actor_active
$ comm -13 <my 37> <the brief's 35>
(خالی — فهرست من ابرمجموعهٔ دقیق فهرست قبلی است)
```

هر دو `RETURNS trigger` هستند و **به هیچ trigger‌ی وصل نیستند** — ظاهراً ممیزی قبلی
توابع trigger را یکجا کنار گذاشته، که این دو را هم با خود برده. هر دو یافتهٔ واقعی‌اند (F-1.5).

### فهرست ۲ — جدول‌های بی‌نویسنده: **۱۸** (ممیزی قبلی: ۱۵)

روش سه‌لایه: ۲۲۴ جدول پایهٔ `public` → آن‌هایی که هیچ بدنهٔ تابعی به آن‌ها
`INSERT/UPDATE/DELETE/MERGE` نمی‌کند (۱۰۶) → منهای آن‌هایی که کد `src/`+`server/` می‌نویسد
(۱۱۵ جدول نویسنده دارد) → منهای آن‌هایی که یک migration می‌نویسد یا seed می‌کند (۵۰).

```
base tables in public: 224 | no in-DB writer: 106
written by a migration: 50
FINAL writerless: 18
```

**دو باگ در دتکتور خودم را قبل از اعتماد به عدد پیدا و تصحیح کردم**، و هر دو عدد را عوض کردند:
regex تشخیص نویسنده در بدنهٔ توابع **حساس به حروف بزرگ و کوچک** بود در حالی که بدنه‌ها
`insert into` با حروف کوچک می‌نویسند (`~` → `~*`؛ ۶۶ → ۲۱)، و regex مهاجرت‌ها انتهای خط را
لنگر نمی‌کرد (`promotion_nomination_policy` را از دست داد؛ ۲۱ → ۱۸).

**اختلاف با ۱۵:** هر ۱۴ نامِ فهرست قبلی در فهرست من هست. اضافه‌ها: **سه** جدول backup
(`dynamic_parameter_weights_backup_142`، `dynamic_parameter_weights_backup_20260722`،
`payment_receipts_backup_20260722`) در حالی که ممیزی قبلی «یک جدول backup» گفته بود، به‌علاوهٔ
`person_field_definitions`.

### فهرست ۳ — صفحه‌های بی‌لینک: **۷** (ممیزی قبلی: ۱۴) — بزرگ‌ترین تصحیح

روش: ۱۵۹ مسیر ایستای `routeTree.gen.ts` منهای ۱۲۶ مسیر رجیستری = **۳۳ مسیر خارج از رجیستری**
`[prior:nav F10]`. سپس هر ۳۳ را طبقه‌بندی کردم (redirect stub / layout / page) **و هر مقصد
لینک واقعی در `src/` را استخراج کردم** — با کنار گذاشتن خودِ `registry.ts`،
`primary-modules.ts` و `nav-items.ts` که لینک نیستند.

```
routeTree static app routes: 159
of those, in the registry: 126
of those, NOT in the registry: 33
  redirect stubs : 6      layouts : 0      unresolved : 1      real pages : 26
of the 26 real pages, WITH an in-app link : 19
of the 26 real pages, with NO link at all :  7
```

**هفت صفحهٔ واقعاً بی‌لینک:**

```
/api-keys                      570   _app.api-keys.tsx
/operations/api-keys           395   _app.operations.api-keys.tsx
/operations/receipts           392   _app.operations.receipts.tsx
/presence                      294   _app.presence.tsx
/operations/purchase-advisor   221   _app.operations.purchase-advisor.tsx
/operations/gamification       145   _app.operations.gamification.tsx
/gamification/achievements      89   _app.gamification.achievements.tsx
```

**چرا ۱۴ به ۷ رسید — این همان caveat اول فاز ۴ است، ولی در جهت معکوس.** ممیزی قبلی نگران بود
که لینکِ ساخته‌شده با الحاق رشته را grep نبیند؛ چیزی که واقعاً از دست رفته بود، **لینک‌های کاملاً
معمولی** بودند:

| صفحه | ممیزی قبلی | واقعیت |
|---|---|---|
| `/my-penalties` | بی‌لینک | `_app.collaboration.tsx:67` → `to: "/my-penalties"`, «کارت‌های قرمز من» |
| `/delivery-receipts` | بی‌لینک | `_app.collaboration.tsx:76` → «رسیدهای تحویل» |
| `/documents` | بی‌لینک | `_app.collaboration.tsx:85` → «اسناد» |
| `/pricing/owner-attention` | بی‌لینک | `_app.pricing.index.tsx:223` → «گزارش رسیدگی مسئولان» |
| `/integrations/didar` | صفحهٔ ۳۲ خطی | **redirect stub** — `throw redirect({ to: "/operations/didar" })` |
| `/admin/gamification/achievements` | صفحهٔ ۸ خطی | **redirect stub** |

`/collaboration` خودش در رجیستری است (`group: "main"`)، پس این سه صفحه از منو در دو کلیک
قابل رسیدن‌اند. تنها دستور شمارش هم همین است:

```
$ grep -rnE '(\bto=|\bto:\s*|href=)\{?\s*"/[^"]+"' src/   # با حذف registry/primary-modules/nav-items
```

### جمع اقلام این ممیزی

```
۳۷ تابع + ۱۸ جدول + ۷ صفحه + ۵ کامپوننت = ۶۷ قلم
```

---

## Phase 1 — توابع

هر جمله زیر از بدنه گرفته شده، و **هر جمله یک نقل‌قول دارد** (شمارش در خودآزمایی بند ۲).
منبعِ همهٔ بدنه‌ها `pg_get_functiondef` روی دیتابیس زنده است.

### خوشه ۱ — «کار زمان‌بندی‌شده» (۹) · هیچ زمان‌بندی وجود ندارد

```
$ psql -c "select extname from pg_extension order by 1"
btree_gist pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt pgsodium plpgsql
supabase_vault uuid-ossp vector
```

`pg_cron` نیست، `pg_net` نیست، `cron.job` وجود ندارد — تأیید `[P]`.

| # | نام · migration | یک جمله (از بدنه) | نقل‌قول | می‌نویسد | گارد نقش | EXECUTE | پیش‌نیاز · اندازهٔ اتصال |
|---|---|---|---|---|---|---|---|
| F1 | `capture_score_snapshots` · `20260430202403_…` (399) | هر ردیف `employee_scores` را با مهر زمان کپی می‌کند و اسنپ‌شات‌های کهنه‌تر از ۹۰ روز را پاک می‌کند | `INSERT INTO public.score_snapshots (…) SELECT … FROM public.employee_scores;` … `DELETE FROM public.score_snapshots WHERE captured_at < now() - interval '90 days';` | `score_snapshots` (INSERT+DELETE) | **هیچ** | authenticated | `employee_scores`=**۹** ردیف، `score_snapshots`=**۰**. اجرای دستی ۹ ردیف می‌سازد. **اتصال کوچک: یک ورودی زمان‌بند** |
| F2 | `recompute_all_employee_scores` · `20260430202057_…` (331) | روی کارمندهای موجود در `call_logs` یا `employee_scores` حلقه می‌زند و برای هرکدام `calculate_employee_score` را صدا می‌زند، و خطای هرکدام را می‌بلعد | `SELECT employee_id FROM public.call_logs … UNION SELECT employee_id FROM public.employee_scores` … `PERFORM public.calculate_employee_score(_emp);` … `EXCEPTION WHEN OTHERS THEN NULL;` | غیرمستقیم `employee_scores` | **هیچ** | **anon**+authenticated | `call_logs`=**۰** ردیف. پس فقط همان **۹** نفر موجود را بازمحاسبه می‌کند و **به هیچ‌کس تازه نمی‌رسد**. اتصال کوچک، ولی بی‌فایده تا `call_logs` پر شود |
| F3 | `recompute_customer_credit_scores` · `20260506221928_…` (335) | روی **همهٔ** مشتری‌های فعال حلقه می‌زند و برای هرکدام `calculate_credit_score` را صدا می‌زند و سطر نتیجه یا خطا برمی‌گرداند | `SELECT c.id FROM public.customers c WHERE c.is_active = true ORDER BY c.id LIMIT v_limit OFFSET v_offset` | خودش هیچ؛ از راه `calculate_credit_score` → `customer_credit_profile`, `credit_score_snapshots`, `audit_logs` | `admin`/`manager`/`accountant` | **anon**+authenticated | **امروز کار نمی‌کند — بند ۱.۲** |
| F4 | `refresh_all_sale_list_prices` · `20260511073017_…` (399) | آخرین `rounded_sale_price` هر محصول را در اقلام لیست‌های فروش می‌نشاند و اختلاف با قیمت قبلی را بازمی‌سازد | `UPDATE public.sale_list_items sli SET current_price = l.new_price, previous_price = COALESCE(hist.old_sale_price, hist.new_sale_price), change_amount = …` | `sale_list_items` (۴ ستون) | **هیچ** | authenticated | `sale_list_items`=**۱۸۳۷** ردیف. اجرای دستی قیمت‌های ۱۸۳۷ قلم را بازمی‌نویسد — **بی‌خطر نیست**. اتصال کوچک |
| F5 | `sync_product_price_observatory_rows` · `20260516161314_…` (399) | ردیف‌ها و سلول‌های جدول پویای «رصدخانهٔ قیمت» را از کاتالوگ محصول می‌سازد یا به‌روز می‌کند و شمارش درج/به‌روزرسانی می‌دهد | `RETURNS TABLE(inserted_rows integer, updated_rows integer)` … `v_col_pid uuid; v_col_pname uuid; v_col_sku uuid;` | `dynamic_table_rows`, `dynamic_table_cells` | **هیچ** | authenticated | `dynamic_table_rows`=**۳۳۹**. جدول پویای رصدخانه باید با slug درست موجود باشد. اتصال کوچک |
| F6 | `cleanup_stale_auto_suppliers` · `20260506163859_…` (399) | تأمین‌کننده‌های خودکارافزوده‌ای را حذف می‌کند که ۱۰۰ روز است نه برای این محصول و نه برای هیچ محصول هم‌برند خریدی نداشته‌اند | `WHERE ps.auto_added = true` … `WHERE (lpp.last_at IS NULL OR lpp.last_at < now() - INTERVAL '100 days')` … `DELETE FROM public.product_suppliers ps USING to_remove tr WHERE ps.id = tr.id;` | `product_suppliers` (**DELETE**) | **هیچ** | authenticated | `product_suppliers`=**۳۱** که **۲۲** تای آن `auto_added` است. **حذف واقعی داده.** اتصال کوچک |
| F7 | `auto_publish_release` · `20260807060000_307` (311) | اگر برای این `git_sha` انتشاری ثبت نشده باشد یک رکورد انتشار با اقلام تغییر می‌سازد، و شکل ورودی را سخت‌گیرانه اعتبارسنجی می‌کند | `SELECT * INTO r FROM public.platform_releases WHERE git_sha = _sha LIMIT 1; IF FOUND THEN RETURN r; END IF;` … `IF jsonb_array_length(p_items) > 40 THEN RAISE EXCEPTION 'حداکثر ۴۰ مورد تغییر مجاز است'` | `platform_releases`, `audit_logs` | **هیچ** (ولی EXECUTE فقط service_role) | postgres,service_role,supabase_admin | `platform_releases`=**۱۲**. **idempotent روی git_sha.** برای build pipeline ساخته شده، نه برای کاربر. اتصال کوچک: یک گام در deploy |
| F8 | `set_market_rate_tick_status` · `20260506171839_…` (220) | وضعیت یک تیک نرخ بازار را به تأییدشده/مشکوک/ردشده می‌برد و تغییر را در ممیزی ثبت می‌کند | `IF p_status NOT IN ('accepted','suspect','rejected') THEN RAISE EXCEPTION 'وضعیت نامعتبر'` … `UPDATE public.market_rate_ticks SET status = p_status, note = COALESCE(p_note, note)` | `market_rate_ticks`, `audit_logs` | `admin`/`manager`/`accountant` | **anon**+authenticated | `market_rate_ticks`=**۱** ردیف. **این زمان‌بندی‌شده نیست — یک اقدام دستی است که دکمه ندارد.** اتصال کوچک: یک دکمه در صفحهٔ موجود نرخ‌ها |
| F9 | `manual_daily_metrics_totals` · `20260722200000_132_1` | جمع فروش، سود، تماس ورودی/خروجی و دقایق مکالمهٔ یک کارمند را از تاریخی به بعد برمی‌گرداند | `SELECT COALESCE(SUM(sales_amount), 0), COALESCE(SUM(profit_amount), 0), … FROM public.staff_daily_performance_metrics WHERE staff_user_id = p_employee_id AND metric_date >= p_from::date;` | **فقط می‌خواند** | **هیچ** | authenticated | `staff_daily_performance_metrics`=**۱۱**. **این هم زمان‌بندی‌شده نیست — یک کوئری خلاصه است.** اتصال کوچک: یک کارت در صفحهٔ ثبت دستی |

> **تصحیح دسته‌بندی:** ممیزی قبلی این ۹ تا را «کار زمان‌بندی‌شده» نامید. [E] با خواندن بدنه‌ها،
> **F8 و F9 اصلاً کار دوره‌ای نیستند** — یکی یک اقدام کاربری و دیگری یک کوئری خواندنی است.
> خوشهٔ واقعی زمان‌بندی‌شده **۷** تاست.

### خوشه ۲ — چرخهٔ تخصیص سرمایه (۷)

| # | نام · migration | یک جمله (از بدنه) | نقل‌قول | می‌نویسد | گارد | EXECUTE | پیش‌نیاز · اتصال |
|---|---|---|---|---|---|---|---|
| F10 | `hold_capital_allocation` · `20260506230647_…` (243) | **سنگ قبر** — هر فراخوان را با پیام فارسی رد می‌کند و به مسیر زندهٔ اعتبار ارجاع می‌دهد | `RAISE EXCEPTION 'این مسیر رزرو بازنشسته شده است؛ از hold_credit/release_credit استفاده کنید (M11)' USING ERRCODE = '0A000';` | هیچ | — | **anon**+auth | **نه.** همیشه خطا. جانشین: `hold_credit` |
| F11 | `release_capital_allocation` · همان | سنگ قبر، متن یکسان | همان `RAISE EXCEPTION … (M11)` | هیچ | — | **anon**+auth | **نه** |
| F12 | `consume_capital_allocation` · همان | سنگ قبر، متن یکسان | همان | هیچ | — | **anon**+auth | **نه** |
| F13 | `refund_capital_allocation` · همان | سنگ قبر، متن یکسان | همان | هیچ | — | **anon**+auth | **نه** |
| F14 | `can_use_customer_capital_allocation` · `20260506230647_…` (243) | می‌گوید آیا مبلغی از سقف تخصیص مشتری در snapshot سرمایهٔ فعال قابل استفاده است، و اگر نه دلیل فارسی می‌دهد | `_snap := public._latest_active_capital_setting();` … `RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص ندارد'::text;` | فقط می‌خواند | `admin`/`manager`/`sales`/`accountant` | **anon**+auth | `customer_capital_allocations_dynamic`=**۳۵**، `salesperson_…`=**۲۵۲**. **بله، بی‌خطر** |
| F15 | `upsert_daily_capital_input` · `20260506203803_…` (335) | ورودی‌های دستی سرمایهٔ یک روز (بانک، نقد، چک‌ها، مطالبات و بدهی بیرونی، ذخیرهٔ ریسک و…) را ثبت یا به‌روز می‌کند و عدد منفی را رد می‌کند | `IF p_bank_balance < 0 OR p_cash_balance < 0 OR p_incoming_checks < 0 … THEN` | `daily_capital_inputs` | `admin`/`manager`/`accountant` | **anon**+auth | `daily_capital_inputs`=**۲**. بله |
| F16 | `save_daily_capital_snapshot` · `20260506203207_…` (268) | محاسبهٔ سرمایهٔ آن روز را در جدول اسنپ‌شات تثبیت می‌کند | `IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN` … `RETURNS daily_capital_snapshots` | `daily_capital_snapshots` | `admin`/`manager`/`accountant` | authenticated | `daily_capital_snapshots`=**۱۰**. بله |

### خوشه ۳ — دوقلوهای جایگزین‌شده (۳) · **و همان‌جا که حفرهٔ امنیتی است**

| # | نام · migration | یک جمله (از بدنه) | نقل‌قول | می‌نویسد | گارد | EXECUTE | جانشین زنده |
|---|---|---|---|---|---|---|---|
| F17 | `assign_user_role` · `20260626082118_…` | یک پوستهٔ `app_role` که نسخهٔ متنی را PERFORM می‌کند و هیچ بررسی خودش ندارد | `BEGIN PERFORM public.assign_user_role_txt(_target_user, _role::text); END;` | از راه `_txt` → `user_roles` | **هیچ** | **anon**+auth | `assign_user_role_txt` (که frontend صدا می‌زند) |
| F18 | `revoke_user_role` · همان | همان، برای حذف نقش | `BEGIN PERFORM public.revoke_user_role_txt(_target_user, _role::text); END;` | از راه `_txt` → `user_roles` | **هیچ** | **anon**+auth ← **بازتر از خود `_txt` که anon=false است** | `revoke_user_role_txt` |
| F19 | `create_dynamic_scoring_parameter` · `20260701134828_…` (142) | یک پارامتر امتیازدهی مشتری می‌سازد، وزن ماه جاری را ثبت و در ممیزی لاگ می‌کند | `INSERT INTO public.dynamic_scoring_parameters(entity_type, code, label_fa, …) VALUES ('customer', …)` … `INSERT INTO public.dynamic_parameter_weights(parameter_id, weight, valid_from, created_by)` | `dynamic_scoring_parameters`, `dynamic_parameter_weights`, `audit_logs` | `admin`/`manager`/`accountant` | anon+auth | `create_dynamic_scoring_parameter_v2` (`_app.sales.credit-rules.tsx:218`) |

### خوشه ۴ — تشخیصی، بدون صفحه (۴) · همه فقط‌خواندنی

| # | نام · migration | یک جمله (از بدنه) | نقل‌قول | می‌نویسد | گارد | امروز دستی؟ |
|---|---|---|---|---|---|---|
| F20 | `person_fk_drift_report` · `20260801160000_231` (331) | جدول‌هایی را می‌شمارد که ستون `*_person_id` آن‌ها با `person_id` جدول والد نمی‌خواند | `FROM public.sales_quotes q LEFT JOIN public.customers c ON c.id = q.customer_id WHERE q.customer_person_id IS DISTINCT FROM c.person_id HAVING count(*) > 0` | فقط می‌خواند | هیچ | **بله، کاملاً بی‌خطر** |
| F21 | `polymorphic_ref_orphan_report` · `20260808070000_317` (395) | در حرکات انبار ردیف‌هایی را می‌شمارد که `ref_id` دارند ولی مقصدشان وجود ندارد، یا نوعشان به هیچ جدولی نگاشت نشده | `WHERE sm.ref_id IS NOT NULL AND ((sm.ref_type = 'purchase' AND NOT EXISTS (SELECT 1 FROM public.purchases t WHERE t.id = sm.ref_id)) OR …)` | فقط می‌خواند | هیچ | **بله، بی‌خطر** |
| F22 | `validate_journal_entry_balance` · `20260502090826_…` (395) | جمع بدهکار و بستانکار یک سند را با هم و با صفر مقایسه می‌کند | `COALESCE(SUM(debit), 0) = COALESCE(SUM(credit), 0) AND COALESCE(SUM(debit), 0) > 0 AS is_balanced FROM public.journal_lines WHERE journal_entry_id = p_journal_entry_id;` | فقط می‌خواند | هیچ | **بله، بی‌خطر** |
| F23 | `person_backfill_existing` · `20260801090000_230` | ابزار مهاجرت: ردیف‌های یک جدول قدیمی را به هستهٔ اشخاص وصل یا شخص تازه می‌سازد و شمارش created/linked/rejected برمی‌گرداند | `_created int := 0; _linked int := 0; _rejected int := 0;` … `IF _uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است.'` | `person_context_links`; `UPDATE customers`/`suppliers` | فقط بررسی `auth.uid()` | **نه بدون احتیاط** — تنها `INVOKER` نویسندهٔ فهرست، ابزار یک‌بارمصرف مهاجرت |

### خوشه ۵ — عمداً خنثی‌شده (۳) → **DEFER**

بند ۱.۳ پایین.

### خوشه ۶ — بقیه (۹) + دو تابع trigger که ممیزی قبلی نداشت (۲)

| # | نام · migration | یک جمله (از بدنه) | نقل‌قول | می‌نویسد | گارد | EXECUTE | امروز دستی؟ · اتصال |
|---|---|---|---|---|---|---|---|
| F24 | `api_dynamic_table_query_rows` · `20260426053202_…` (220) | ردیف‌های یک جدول پویا را با **slug** و فیلترهای مجاز می‌خواند و jsonb می‌دهد — نسخهٔ «API» به‌جای نسخهٔ id-محور داخلی | `SELECT id INTO _table_id FROM public.dynamic_tables WHERE slug = p_table_slug AND is_active = true;` … `WHERE table_id = _table_id AND column_key = _filter_key AND is_filterable = true;` | فقط می‌خواند | `admin`/`manager` | anon+auth | بله. **اتصال کوچک** — نسخهٔ id-محورش (`query_dynamic_table_rows`) از UI صدا زده می‌شود |
| F25 | `api_dynamic_table_update_cell` · همان | یک سلول جدول پویا را با slug به‌روز می‌کند و در ممیزی می‌نویسد | `IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN` | `dynamic_table_cells`, `audit_logs` | `admin`/`manager` | anon+auth | بله. اتصال کوچک |
| F26 | `get_product_sale_price` · `20260427133517_…` (395) | آخرین قیمت فروش ثبت‌شدهٔ یک محصول را از تاریخچه برمی‌گرداند | `SELECT new_sale_price FROM public.product_sale_price_history WHERE product_id = _product_id AND (_sale_price_type_id IS NULL OR sale_price_type_id = _sale_price_type_id) ORDER BY created_at DESC LIMIT 1;` | فقط می‌خواند | **هیچ** | authenticated | `product_sale_price_history`=**۴۳۵۰**. بله. مسیر زندهٔ قیمت `product_computed_prices` است |
| F27 | `get_workflow_setting` · `20260625031700_…` (395) | یک سطر تنظیمات گردش‌کار را با کلید فرایند برمی‌گرداند (تک‌رکورد) | `SELECT * FROM public.workflow_settings WHERE process_key = p_process_key;` | فقط می‌خواند | **هیچ** | authenticated | بله، بی‌خطر. جانشین جمعِ آن (`get_workflow_settings`) از UI صدا زده می‌شود |
| F28 | `mi_get_seller_favorite_products` · `20260430185634_…` (335) | پرتعامل‌ترین محصولات نزد کاربران با نقش فروش در N روز اخیر را برمی‌گرداند | `PERFORM _mi_require_privileged();` … `SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'sales'::text` | فقط می‌خواند | `_mi_require_privileged()` | anon+auth | بله. **خواهرِ همان `mi_*`هایی که UI صدا می‌زند** — اتصال کوچک: یک کارت در داشبورد بازار |
| F29 | `validate_price_settlement_compatibility` · `20260704181332_…` | می‌گوید آیا مهلت تسویهٔ انتخابی از سقف مجاز آن نوع قیمت بیشتر است، با پیام فارسی آماده | `IF v_settlement_days > v_price_max_days THEN RETURN jsonb_build_object('valid', false, 'reason', 'settlement_too_long', 'message', 'قیمت «' \|\| v_price_title \|\| '» حداکثر ' \|\| v_price_max_days \|\| ' روز تسویه دارد…')` | فقط می‌خواند | **هیچ** (INVOKER) | anon+auth | بله، بی‌خطر |
| F30 | `is_valid_audit_entity_type` · `20260628152557_…` (302) | چک می‌کند نوع موجودیت در فهرست ثابت انواع مجاز ممیزی باشد | `SELECT _entity_type = ANY(ARRAY['ai_provider','inquiry','invoice','customer',…])` | فقط می‌خواند | **هیچ** (INVOKER, IMMUTABLE) | anon+auth | بله. **`UNCLEAR`** — پایین |
| F31 | `log_invoice_issuance_blocked_overdue` · `20260506221117_…` (220) | وقتی صدور فاکتور به‌خاطر معوقه رد شود رویداد را در ممیزی ثبت می‌کند، و اول از تابع مجوز می‌پرسد تا لاگ جعلی ثبت نشود | `-- محافظت در برابر لاگ جعلی: فقط اگر مشتری واقعاً معوقه دارد، ثبت شود` … `SELECT can_issue INTO v_can FROM public.can_issue_customer_invoice(p_customer_id); IF v_can IS DISTINCT FROM false THEN RETURN; END IF;` | `audit_logs` | فقط `auth.uid()` | **anon**+auth | بله ولی عملاً بی‌اثر — گاردش به دادهٔ فاکتور تکیه دارد |
| F32 | `search_tokens_match` · `20260615080500_afk_g2_028` | همهٔ توکن‌های عبارت جست‌وجو باید پس از نرمال‌سازی فارسی در متن باشند تا `true` بدهد | `ELSE NOT EXISTS (SELECT 1 FROM tokens WHERE COALESCE((SELECT document FROM normalized), '') NOT ILIKE '%' \|\| tokens.token \|\| '%')` | فقط می‌خواند | **هیچ** (IMMUTABLE PARALLEL SAFE) | anon+auth | بله، بی‌خطر — یک کمکی جست‌وجو |
| **F33** | **`handle_new_user`** · **در هیچ migrationی نیست** | trigger ثبت‌نام: برای کاربر تازه پروفایل می‌سازد و نقش `viewer` می‌دهد | `insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email)); insert into public.user_roles (user_id, role) values (new.id, 'viewer');` | `profiles`, `user_roles` | **هیچ** | **anon**+auth | **به هیچ trigger‌ی وصل نیست** — کوئری `pg_trigger` خالی برگشت. یعنی مسیر خودکار ساخت پروفایل امروز خاموش است |
| **F34** | **`tg_purchase_actor_active`** · `20260802150000_260` (261) | trigger نگهبان: اگر سازندهٔ خرید یا درخواست خرید حساب غیرفعال داشته باشد جلویش را می‌گیرد | `IF _actor IS NOT NULL AND NOT public.is_active_actor(_actor) THEN RAISE EXCEPTION 'حساب کاربری شما فعال نیست.' USING ERRCODE = '42501', HINT = 'ACTOR_INACTIVE';` | هیچ (فقط رد می‌کند) | — | service_role only | **به هیچ trigger‌ی وصل نیست** — این محافظ امروز خاموش است |

#### `UNCLEAR` — تنها موردی که بدنه هدف را روشن نمی‌کند

**F30 `is_valid_audit_entity_type`.** فهرست انواع مجازش هنوز `'invoice'` را دارد، در حالی که
جدول `invoices` در migration ۳۳۲ حذف شده — و در همان آرایه `'sales_quote'` هم هست:

```sql
    'inquiry','invoice','customer','product','profile','user_role','supplier',
    ...
    'category','brand','price_list','pricing_rule','sale_list','sales_quote',
```

از بدنه نمی‌شود فهمید `'invoice'` عمداً مانده (برای سازگاری با ردیف‌های تاریخی `audit_logs`)
یا جاماندگیِ پاک‌سازی است. **حدس نمی‌زنم.**

---

## Phase 1.1 — دو سیستم سرمایه

**نتیجه: مجموعهٔ یتیم، سیستم زندهٔ سرمایه را تکرار نمی‌کند — یک نسل قبلیِ همان ایده است که
خودش رسماً بازنشسته اعلام شده. این همان شکل `invoices` در برابر `sales_quotes` است، ولی با یک
تفاوت مهم: اینجا کسی زحمت کشیده و سنگ قبر گذاشته.**

شواهد، به ترتیب قطعیت:

**۱) چهار تابع از هفت‌تا، خودشان می‌گویند بازنشسته‌اند.** بدنهٔ هر چهار، کامل:

```sql
BEGIN
  RAISE EXCEPTION 'این مسیر رزرو بازنشسته شده است؛ از hold_credit/release_credit استفاده کنید (M11)'
    USING ERRCODE = '0A000';
END
```

این دیگر «به‌نظر می‌رسد موازی است» نیست — **نویسنده‌اش نام جانشین را در متن خطا نوشته**.

**۲) دفتر آن خالی است، دفتر سیستم زنده پر.**

```
capital_allocation_ledger=0
customer_capital_allocations_dynamic=35   salesperson_capital_allocations_dynamic=252
customer_credit_balance=24
```

**۳) جانشین‌ها واقعاً وجود دارند و وصل‌اند.** `hold_credit` و `release_credit` هر دو در
دیتابیس هستند و **فراخوانِ درون‌دیتابیسی دارند** (به همین دلیل در فهرست ۳۷تایی من نیستند).

**۴) ولی سه تای باقی‌مانده تکراری نیستند — و این تفاوت مهم است.**
`can_use_customer_capital_allocation` (F14)، `upsert_daily_capital_input` (F15) و
`save_daily_capital_snapshot` (F16) روی **همان جدول‌های زندهٔ** `customer_capital_allocations_dynamic`
و `salesperson_capital_allocations_dynamic` و `daily_capital_inputs` کار می‌کنند، نه روی
`capital_allocation_ledger` خالی. F14 صراحتاً `_latest_active_capital_setting()` را صدا می‌زند —
همان snapshot سیستم زنده. **این سه، ورودی و بازجستِ سیستمِ زنده‌اند که رابط کاربری‌شان ساخته
نشده، نه بقایای سیستم مرده.**

پس «هفت تابع تخصیص سرمایه» یک خوشه نیست، **دو** خوشه است: چهار سنگ قبر برای حذف، و سه قابلیت
واقعی روی سیستم زنده که تصمیم مالک می‌خواهد.

---

## Phase 1.2 — نه کار زمان‌بندی‌شده، و ۷۰ موجودیت بدون امتیاز

### بازاندازه‌گیری امتیازها — عدد `[P]` تأیید شد

```
$ SELECT period_month, entity_type, count(*), count(DISTINCT entity_id) …
2026-07-01 | customer    | rows=38 | entities=5
2026-07-01 | salesperson | rows=17 | entities=3        -> ۵۵ ردیف ✓ (مطابق [P])
2026-08-01 | customer    | rows=53 | entities=6
2026-08-01 | salesperson | rows=42 | entities=7        -> ۹۵ ردیف ✓ (مطابق [P])
today=2026-09-05  current_period=2026-09-01  rows_in_current_period=0   ✓ (مطابق [P])
```

«۲۰ موجودیت از ۹۰» هم تأیید شد، ولی با یک تفکیک که `[P]` نداشت:

```
customer entities=11   salesperson entities=9      (جمع = ۲۰)
match_customers=11  match_persons=0  match_profiles=9
customers_total=90
```

یعنی **۱۱ مشتری از ۹۰** تا به حال امتیاز خورده‌اند، به‌علاوهٔ ۹ کارشناس فروش. «۷۰ موجودیت»
در واقع **۷۹ مشتریِ بدون امتیاز** است.

### آزمون فرضیهٔ `responsible_id` — قوی، ولی کامل نیست

```
customers_with_responsible_id=13   customers_without_responsible_id=77
scored_and_has_responsible=10   scored_no_responsible=1
unscored_and_has_responsible=3  unscored_no_responsible=76
```

**فرضیه ۹۶٪ توضیح‌دهنده است ولی قطعی نیست:** ۷۶ از ۷۹ مشتری بدون امتیاز `responsible_id`
ندارند — ولی **۳ مشتری `responsible_id` دارند و باز هم امتیاز نخورده‌اند**، و **۱ مشتری بدون
`responsible_id` امتیاز خورده**. پس `responsible_id` عامل نیست، هم‌بسته است. **همان‌طور که
بریف خواسته بود آزمودم و فرض نکردم.**

### و پاسخ سؤالی که واقعاً مهم بود

**اجرای این توابع دورهٔ جاری را پر نمی‌کند، چون هیچ‌کدام‌شان `dynamic_entity_scores` را
نمی‌نویسند.**

```
$ SELECT proname FROM pg_proc … WHERE definition ~* 'INSERT INTO|UPDATE|DELETE FROM' 'dynamic_entity_scores'
(خالی — هیچ تابعی در دیتابیس این جدول را نمی‌نویسد)

$ grep dynamic_entity_scores <code writers>
dynamic_entity_scores  src/hooks/credit/useDynamicScoring.ts:204,213
```

**تنها نویسندهٔ این جدول، صفحهٔ ادمین است.** یک انسان `actual_value` را برای هر پارامتر، هر
مشتری، هر ماه دستی وارد می‌کند. پس «۰ ردیف برای شهریور» **نشانهٔ نبودِ زمان‌بند نیست** — نشانهٔ
این است که هنوز کسی اعداد شهریور را وارد نکرده. **هیچ cronی این را حل نمی‌کند.**

### `recompute_customer_credit_scores` امروز کار نمی‌کند — اثبات زنده

حلقه‌اش هیچ گارد `responsible_id` ندارد و **همهٔ ۹۰ مشتری فعال** را برمی‌دارد:

```sql
    SELECT c.id FROM public.customers c
    WHERE c.is_active = true ORDER BY c.id LIMIT v_limit OFFSET v_offset
```
```
customers_active=90 inactive=0
```

ولی `calculate_credit_score` که صدا می‌زند، هنوز از جدولِ **حذف‌شدهٔ** `invoices` می‌خواند — در
شش جا (`FROM invoices i` در خطوط ۷۳، ۸۶، ۱۳۱، ۱۷۲، ۲۰۷ بدنه):

```
$ psql: does invoices exist in ANY schema?
(NONE - relation does not exist anywhere)

$ BEGIN READ ONLY; … SELECT * FROM public.calculate_credit_score(v_id); … ROLLBACK;
NOTICE:  probing customer b60e21e8-fa1f-4182-9132-a93d651adb89
NOTICE:  RESULT: SQLSTATE=42P01 MESSAGE=relation "invoices" does not exist
ROLLBACK
```

**پس اجرای `recompute_customer_credit_scores` امروز ۹۰ بار وارد شاخهٔ `EXCEPTION` می‌شود و ۹۰
سطر `status='error'` برمی‌گرداند، و هیچ چیز نمی‌نویسد.** این «وصل‌نشده» نیست، **شکسته** است.

و این تنها بازماندهٔ بازنشستگی فاکتور است:

```
$ which live functions still reference the dropped invoices table?
calculate_credit_score
```

migration ۳۳۱ («rewrite_invoice_readers») ۱۷ تابع وابسته را بازنویسی کرد و **دقیقاً یکی را جا
انداخت**. `calculate_credit_score` از frontend صدا زده نمی‌شود (فقط در
`src/integrations/supabase/types.ts:10603` به‌عنوان تایپ تولیدشده ظاهر می‌شود)، پس این یک
شکستگی نهفته است نه یک خطای زندهٔ کاربر — ولی هر تلاشی برای «وصل کردن» F3 اول باید این را
تعمیر کند.

### `recompute_all_employee_scores` به هیچ‌کس تازه نمی‌رسد

```
employee_scores=9  call_logs=0
distinct_emp_in_scores=9  distinct_emp_in_call_logs=0
```

حلقه‌اش `call_logs UNION employee_scores` است و `call_logs` صفر ردیف دارد، پس **فقط همان ۹ نفرِ
موجود** را بازمحاسبه می‌کند. و صفحهٔ `/operations/gamification` نشان می‌دهد چرا این بن‌بست است:
منبع KPIها `call_logs` (صفر ردیف) و `invoices` (حذف‌شده) است.

---

## Phase 1.3 — سه تابع خنثی‌شده → `DEFER`

هر سه، به تصریح بدنهٔ خودشان، در ۳۳۱ خالی شدند و **بازسازی‌شان تصمیم محصول اعلام شده**.

**`calculate_salesperson_collected_sales`** — کامنت داخل بدنه:

```
  -- 331: both CTEs read the invoice table, which is being retired. They produced
  -- nothing: the table holds 0 rows, so `eligible` and `per_invoice` were always empty.
  -- IMPORTANT SHAPE NOTE: aggregating over an empty per_invoice still returns exactly ONE
  -- row -- zeros via COALESCE, and COUNT(*) = 0 -- so this replacement returns one row of
  -- zeros too. Returning no rows would be a behaviour change for every caller.
  -- Not repointed at sales_quotes: that would turn a metric that has always read zero into
  -- a live number, which is a product decision, not a cleanup.
```

**`update_customer_overdue_status`**:

```
  -- 331: overdue state was derived from the invoice table. MIN() over zero matching rows
  -- is NULL, and that table holds 0 rows, so v_overdue_since was always NULL and the
  -- "no overdue" branch below always ran. Assigning NULL keeps that exactly.
  -- Overdue tracking will need a real source once it is rebuilt on sales_quotes; that is a
  -- product decision and is NOT silently introduced here.
  v_overdue_since := NULL;
```

**`recalculate_settlement_score`**:

```
  -- 331: this loop scored settlement punctuality from the invoice table. That table
  -- holds 0 rows, so it never iterated and v_score was always 0 -- which is what the rest
  -- of this function still computes with. Settlement dates live only on invoices today;
  -- rebuilding this on sales_quotes would be a new feature, not a migration.
```

> **یک تناقض که باید ثبت شود:** هر سه کامنت می‌گویند «the table holds 0 rows». [E] امروز
> جدول **اصلاً وجود ندارد** — migration ۳۳۲ (`…_332_drop_invoices_table.sql:498`) آن را
> `DROP` کرد. کامنت‌ها در لحظهٔ نوشتن (۳۳۱) درست بودند و حالا کهنه‌اند. تفاوت عملی دارد:
> «صفر ردیف» یعنی کوئری موفق می‌شود؛ «جدول نیست» یعنی `42P01` — که همان چیزی است که
> `calculate_credit_score` را می‌ترکاند.

**`DEFER — owned by the accrual-ledger programme`** برای هر سه.

---

## Phase 2 — جدول‌ها

هر ۱۸ جدول: **صفر ردیف، RLS فعال، حداقل یک policy.** یعنی هیچ‌کدام تصادفی ساخته نشده‌اند.

```
automation_artifacts              |rows=0|written_in_db=NO|rls=true|policies=1
automation_checkpoints            |rows=0|written_in_db=NO|rls=true|policies=1
automation_driver_outputs         |rows=0|written_in_db=NO|rls=true|policies=1
automation_job_runs               |rows=0|written_in_db=NO|rls=true|policies=1
automation_log_events             |rows=0|written_in_db=NO|rls=true|policies=1
automation_worker_heartbeats      |rows=0|written_in_db=NO|rls=true|policies=1
automation_workers                |rows=0|written_in_db=NO|rls=true|policies=1
call_logs                         |rows=0|written_in_db=NO|rls=true|policies=4
credit_requests                   |rows=0|written_in_db=NO|rls=true|policies=4
dynamic_parameter_weights_backup_142       |rows=0|…|policies=2
dynamic_parameter_weights_backup_20260722  |rows=0|…|policies=2
employee_streaks                  |rows=0|written_in_db=NO|rls=true|policies=1
knowledge_articles                |rows=0|written_in_db=NO|rls=true|policies=2
messages                          |rows=0|written_in_db=NO|rls=true|policies=3
payment_receipts_backup_20260722  |rows=0|written_in_db=NO|rls=true|policies=1
person_field_definitions          |rows=0|written_in_db=NO|rls=true|policies=3
price_list_items                  |rows=0|written_in_db=NO|rls=true|policies=2
price_lists                       |rows=0|written_in_db=NO|rls=true|policies=2
```

| # | جدول | migration سازنده | خواننده دارد؟ | یک جمله دربارهٔ کاری که برایش ساخته شد |
|---|---|---|---|---|
| T1–T7 | هفت جدول `automation_*` | `20260605120000_phase0_automation_tables.sql` (و `20260608091000_phase1_…` برای `driver_outputs`) | **نه در `src/`، نه در تابع** | صف و دفترچهٔ اجرای زیرسیستم automation — worker، اجرای job، ضربان، checkpoint، خروجی درایور، لاگ، و artifact. بند ۲.۱ |
| T8 | `call_logs` | `20260430201059_…` | **یک تابع می‌خواند** (`recompute_all_employee_scores`) | لاگ تماس‌های ورودی/خروجی کارشناسان — ورودیِ سه KPI گیمیفیکیشن که در `/operations/gamification` دیده می‌شوند. **خوانده می‌شود، هرگز نوشته نمی‌شود** |
| T9 | `credit_requests` | `20260427141056_…` | یک تابع می‌خواند | درخواست افزایش اعتبار مشتری برای گردش تأیید. `UNCLEAR` — از ستون‌هایش نمی‌شود گفت گردش تأیید کجا قرار بوده اجرا شود |
| T10–T12 | سه جدول `*_backup_*` | `142_fix_weight_validity_month_start.sql`, `134_receipt_type_four_values.sql` | نه | پشتیبان قبل از دو migration تغییرشکل. اسمشان تاریخ دارد و هر دو migration مدت‌هاست اجرا شده |
| T13 | `employee_streaks` | `20260430205231_…` | **کد می‌خواند** | زنجیرهٔ روزهای فعال هر کارمند. **صفحهٔ `/gamification/achievements` سه نشان بر پایهٔ آن دارد** («سه روز پیاپی»، «هفته‌ی پر تلاش»، «یک ماه طلایی») که هیچ‌وقت قابل کسب نیستند |
| T14 | `knowledge_articles` | `20260424144837_…` | نه | نسل اول پایگاه دانش. جانشین زنده‌اش `knowledge_documents` است (که UI می‌نویسد) |
| T15 | `messages` | `20260424144837_…` | نه | نسل اول پیام‌رسان. جانشین زنده‌اش `messenger_messages` است |
| T16 | `person_field_definitions` | `20260517111720_…` | **کد + ۲ تابع می‌خوانند** | تعریف فیلدهای سفارشی اشخاص. صفر تعریف یعنی هیچ فیلد سفارشی‌ای وجود ندارد؛ خواننده‌ها بی‌سروصدا هیچ برمی‌گردانند |
| T17–T18 | `price_lists`, `price_list_items` | `20260424144837_…` | نه | ماژول لیست‌های قیمت. **صفحه‌اش `/price-lists` وجود دارد، در سایدبار لینک دارد، و خودش می‌گوید ساخته نشده** `[prior:fb-gaps]`: «ماژول لیست‌های قیمت — به‌زودی» |

**سه جدول از هجده، خواننده دارند ولی نویسنده ندارند** — `call_logs`، `employee_streaks`،
`person_field_definitions`. این بدتر از «نه خواننده نه نویسنده» است: کدی هست که منتظر دادهٔ
هرگزنیامده می‌ماند و بی‌صدا خالی برمی‌گردد.

## Phase 2.1 — زیرسیستم automation

**حکم: ساخته شده و هرگز مستقر نشده — و این عمدی است، نه فراموشی.**

`automation/` اسکلت نیست. **۷۳ فایل** دارد: یک OpenAPI، دو JSON schema، یک worker آزمایشی
Node، و یک بستهٔ کامل Python — **۴۰ فایل منبع و ۳۳ فایل تست**:

```
automation/openapi/automation-v1.yaml
automation/schemas/{heartbeat,job}.schema.json
automation/worker-dummy/{e2e-lib.mjs,run-e2e.mjs,README.md}
automation/worker-runtime/src/       … 40 files (job_claim, heartbeat, checkpoint,
                                          job_runner, drivers/, supabase_client, …)
automation/worker-runtime/tests/     … 33 files
```

و **جدول‌ها را با نام می‌شناسد**:

```
automation/worker-runtime/src/evidence_db_bridge.py:8: TARGET_TABLE = "automation_driver_outputs"
automation/worker-runtime/src/readonly_output_bridge.py:8: TARGET_TABLE = "automation_driver_outputs"
automation/worker-runtime/src/torob_queue_smoke.py:117:
    "/rest/v1/automation_job_runs?select=id,job_id,status,phase_label,started_at",
automation/worker-runtime/src/torob_queue_smoke.py:137:
    rows = client.patch("/rest/v1/automation_job_runs", {"id": f"eq.{run_id}"}, body)
```

شمارش ارجاع‌ها: `automation_driver_outputs` در **۲۰** فایل، `automation_job_runs` و
`automation_log_events` و `automation_jobs` هرکدام در **۴**، سه‌تای دیگر در **۲**؛
`automation_artifacts` در **۰**.

**و README خودش تکلیف را روشن می‌کند** — `automation/worker-runtime/README.md:3-8`:

```
**Status:** Controlled worker foundation with mock contracts, guarded read-only evidence
helpers, deterministic read-only pipeline, runner route, and no production scheduler.

The runtime is still intentionally controlled. It is not a general crawler, not a
scheduler, and not a production automation daemon.
```

**«intentionally controlled» و «no production scheduler».** این یک ساخت فازبندی‌شده است که
عمداً در فاز ۲/۳ متوقف نگه داشته شده. صفر بودن جدول‌ها نتیجهٔ طبیعی همان تصمیم است، نه نقص.
پس اقدام درست **حذف نیست**.

---

## Phase 3 — صفحه‌ها (با شواهد مرورگری)

### 3.0 — چه کسی واقعاً می‌تواند هر صفحه را باز کند

**تأیید fail-open.** `has_dynamic_permission` وقتی هیچ ردیفی در `role_permissions` برای آن
ماژول نباشد، برای `view` به **هر پنج نقش** اجازه می‌دهد:

```sql
  IF _exists THEN
    RETURN _matched;
  END IF;
  -- Fallback: sensible defaults based on legacy static matrix
  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::text[]);
```

**ولی هیچ‌کدام از هفت صفحه به این مسیر تکیه نمی‌کند — پنج تا guard مسیرِ صریح دارند:**

```
_app.api-keys.tsx:47-49                     beforeLoad → await requireAdmin();
_app.operations.api-keys.tsx:37-39          beforeLoad → await requireAdmin();
_app.operations.receipts.tsx:33-35          beforeLoad → await requireAnyRole(["admin","manager"]);
_app.operations.purchase-advisor.tsx:29-31  beforeLoad → await requireAnyRole(["admin","manager"]);
_app.operations.gamification.tsx:16-18      beforeLoad → await requireAnyRole(["admin","manager"]);
```

**و دو تا هیچ guard ندارند:**

```
_app.presence.tsx:20-21                 createFileRoute("/_app/presence")({ component: PresencePage,
_app.gamification.achievements.tsx:13-14 createFileRoute("/_app/gamification/achievements")({ component: AchievementsPage,
```

**آیا این نشت داده است؟ اندازه‌گیری لایهٔ داده می‌گوید نه.** `/presence` از `profiles` و
`presence_logs` می‌خواند، و RLS هر دو محدود است:

```
presence_logs | pl_select | authenticated | SELECT |
    qual=((user_id = uid()) OR has_role(uid(),'admin') OR has_role(uid(),'manager'))
presence_logs | viewer_restricted | authenticated | ALL | qual=(NOT is_viewer_only(uid()))
profiles | users read own profile | SELECT | qual=(uid() = id)
profiles | admins read all profiles | SELECT | qual=has_role(uid(),'admin')
profiles | viewer_restricted | authenticated | ALL | qual=(NOT is_viewer_only(uid()))
```

پس یک کاربر `sales` که `/presence` را مستقیم باز کند، **پوستهٔ صفحه را می‌بیند ولی فقط ردیف
خودش را**؛ و یک کاربر `viewer` به‌خاطر policy `viewer_restricted` هیچ. `/gamification/achievements`
هم فهرست ثابت نشان‌هاست، نه دادهٔ شخص دیگر.

**حکم: نبودِ guard روی این دو یک نقص دفاع‌در-عمق است، نه نشت داده.** RLS جلوی داده را
گرفته. ولی اتکای انحصاری به RLS خلاف قاعدهٔ ۷ پروژه است («UI guard + route guard + RLS»).

> **آنچه اندازه نگرفتم و باید صادقانه بگویم:** ورود با `test.sales@` و `test.viewer@` انجام
> **نشد**. وارد کردن رمز عبور در فرم ورود کاری است که انجام نمی‌دهم، حتی وقتی رمز در بریف
> آمده باشد. آنچه بالا آمد اندازه‌گیری لایهٔ RLS و guard است که همان سؤال را در لایه‌ای
> پاسخ می‌دهد که واقعاً تعیین‌کننده است — ولی جایگزین کامل مشاهدهٔ رندر نیست.
> **دو بررسی باقی‌مانده برای مالک** در بخش UNVERIFIED فهرست شده.

### شواهد مرورگری — هر هفت صفحه، به‌عنوان admin

مرورگر از قبل نشست فعال مالک را داشت (`mohammadrezaafra66@gmail.com`، نقش «مدیر کل»). من
هیچ اعتباری وارد نکردم؛ فقط همان نشست موجود را مشاهده کردم.

| # | مسیر · خط | عنوان فارسی (نقل‌قول از صفحهٔ زنده) | backend | رندر شد؟ | در رجیستری؟ |
|---|---|---|---|---|---|
| P1 | `/api-keys` · ۵۷۰ | «حاکمیت کلیدهای API» — «ایجاد، فعال/غیرفعال، حذف و مشاهده تاریخچه کلیدهای API — دسترسی فقط برای مدیر» | `bot_api_keys`, `bot_api_key_audit_log` | ✅ **کامل، با ۱۲ کلید واقعی** (فقط پیشوند `bk_…`، بدون راز کامل) | **نه** |
| P2 | `/operations/api-keys` · ۳۹۵ | «حاکمیت کلیدهای API» — «مدیریت وضعیت فعال/غیرفعال کلیدهای موجود — دسترسی فقط برای مدیر» | همان | ✅ همان ۱۲ کلید | **نه** |
| P3 | `/operations/receipts` · ۳۹۲ | «مرور فیش‌های OCR» — «بررسی و تأیید فیش‌های واریزی پردازش‌شده توسط pipeline» | `ocr_receipts` (**وجود ندارد**) | ✅ رندر شد، با **حالت خالی صادقانه**: «pipeline OCR هنوز فعال نشده است. جدول ocr_receipts هنوز ساخته نشده — پس از راه‌اندازی سرویس Python/FastAPI، فیش‌ها اینجا ظاهر می‌شوند.» | **نه** |
| P4 | `/presence` · ۲۹۴ | «گزارش حضور و غیاب» — «مشاهده لاگ ورود و خروج کاربران» | `profiles`, `presence_logs` | ✅ رندر شد، فیلترها فعال، «رکوردی در این بازه یافت نشد» | **نه** |
| P5 | `/operations/purchase-advisor` · ۲۲۱ | «دستیار هوشمند خرید» — «با انتخاب محصول، پیشنهاد خرید مبتنی بر تاریخچه قیمت و نرخ ارز از هوش مصنوعی دریافت کنید.» | AI provider + قیمت‌ها | ✅ فرم کامل رندر شد (محصول، تعداد، فوریت، یادداشت، «دریافت توصیه AI») | **نه** |
| P6 | `/operations/gamification` · ۱۴۵ | «مدیریت گیمیفیکیشن» — «پارامترهای KPI و وزن آن‌ها برای محاسبه امتیاز کارشناسان فروش.» | `gamification_kpis` | ✅ ۱۳ پارامتر KPI رندر شد | **نه** |
| P7 | `/gamification/achievements` · ۸۹ | «نشان‌ها» — «مجموعه‌ی دستاوردهای قابل کسب در سیستم.» | `achievements`, `employee_achievements` | ✅ ۱۰ نشان، «۰ از ۱۰ نشان کسب شده است.» | **نه** |

**هیچ‌کدام از هفت صفحه خطا نداد.** هر هفت کامل رندر می‌شوند.

**P6 یک یافتهٔ جانبی مهم داد.** منبع KPIها روی صفحهٔ زنده نوشته شده، و سه‌تای اول
`call_logs`اند (صفر ردیف) و سه‌تا `invoices` (حذف‌شده):

```
تماس‌های ورودی        call_logs   count
تماس‌های خروجی        call_logs   count
مدت مکالمه            call_logs   minutes
مجموع فروش (ماهانه)   invoices    currency
مجموع سود (ماهانه)    invoices    currency   [auto-disabled: no profit/cost data]
مجموع کل فروش         invoices    currency
```

این توضیح می‌دهد چرا F2 (`recompute_all_employee_scores`) به هیچ‌کس تازه نمی‌رسد: **ورودی‌های
سیستم گیمیفیکیشن یا خالی‌اند یا حذف شده‌اند.**

### تکراری‌ها

**جفت ۱ — `/api-keys` (۵۷۰) در برابر `/operations/api-keys` (۳۹۵): تکراری واقعی.**
هر دو **عنوان یکسان** «حاکمیت کلیدهای API» دارند، همان ۱۲ ردیف را از همان جدول نشان می‌دهند،
و هر دو `requireAdmin()` دارند. تفاوت فقط دامنه است — از خروجی زندهٔ هر دو:

| | `/api-keys` | `/operations/api-keys` |
|---|---|---|
| ستون‌ها | نام، پیشوند، نقش مدیریتی، وضعیت، تاریخ ایجاد، **تاریخ انقضا**، آخرین استفاده، عملیات | نام، پیشوند، وضعیت، آخرین استفاده، تاریخ انقضا، نقش مدیریت، عملیات |
| ساخت کلید | ✅ «کلید جدید» | ❌ ندارد |
| حذف | ✅ | ❌ فقط «غیرفعال‌سازی» |
| تاریخچه | ✅ به ازای هر کلید | ✅ «تاریخچه عملیات — ۲۰ مورد اخیر» |

**`/api-keys` ابرمجموعهٔ کارکردی است.** کدام‌یک تازه‌تر است `[?]` — تاریخ کامیت هر دو فایل را
دنبال نکردم.

**جفت ۲ — `/operations/receipts` (۳۹۲) در برابر `/accounting/receipts` (۵۸۲): تکراری نیست.**
اینها دو چیز کاملاً متفاوت‌اند و شواهد زندهٔ P3 آن را قطعی می‌کند: `/operations/receipts` یک
**صف بازبینی OCR** برای سرویس Python/FastAPI است که هرگز مستقر نشده و جدولش (`ocr_receipts`)
هرگز ساخته نشده؛ `/accounting/receipts` دفتر واقعی فیش‌های پرداخت است که کار می‌کند و در
رجیستری لینک دارد. **ادغام‌شدنی نیستند.**

**جفت ۳ (تازه، در فهرست قبلی نبود) — `/operations/gamification` در برابر
`/gamification/settings`.** دومی در رجیستری است (`admin`/`adm-gamification`). هر دو تنظیمات
گیمیفیکیشن‌اند. **هم‌پوشانی‌شان را اندازه نگرفتم** — `[?]`، در UNVERIFIED.

## Phase 3.1 — پنج کامپوننت

```
$ grep -rn "<Name>" src --include=*.tsx --include=*.ts   (بدون خود فایل)
LeagueBadge           src/components/gamification/LeagueBadge.tsx        importers=0  lines=142
LevelUpOverlay        src/components/gamification/LevelUpOverlay.tsx     importers=0  lines=114
PriceChangeIndicator  src/components/pricing/PriceChangeIndicator.tsx    importers=0  lines=34
RateTypeBadge         src/components/pricing/RateTypeBadge.tsx           importers=0  lines=34
nav-items.ts          src/components/layout/nav-items.ts                 importers=0  lines=55
```

| # | کامپوننت | چه رندر می‌کند | صفحه‌ای که باید استفاده‌اش می‌کرد |
|---|---|---|---|
| C1 | `LeagueBadge` (۱۴۲) | نشان مرتبهٔ لیگ کارمند | `/gamification/league` **وجود دارد و در رجیستری است** — ولی این کامپوننت را import نمی‌کند |
| C2 | `LevelUpOverlay` (۱۱۴) | افکت تمام‌صفحهٔ ارتقای سطح (۶۰ ذره — `Array.from({length: 60})`) | هر صفحهٔ گیمیفیکیشن؛ رویدادِ ارتقا هیچ‌جا منتشر نمی‌شود |
| C3 | `PriceChangeIndicator` (۳۴) | فلش/درصد تغییر قیمت | صفحه‌های قیمت وجود دارند و وصل‌اند؛ این نسخهٔ استفاده‌نشده است |
| C4 | `RateTypeBadge` (۳۴) | نشان نوع نرخ ارز | `/pricing/currency-rates` وجود دارد و در رجیستری است |
| C5 | `nav-items.ts` (۵۵) | یتیم ناوبری — **تنها جای پروژه که برچسب فارسی ۹ گروه و ۹ زیرگروه را دارد** | `[prior:nav F7]` — بازنمی‌شمارم |

## Phase 3.2 — وابستگی به HTTPS

**هیچ‌کدام از هفت صفحه به Secure Context وابسته نیست — یک منفیِ تمیز.**

```
$ grep -cE "getUserMedia|crypto\.randomUUID|crypto\.subtle" src/routes/<each of the 7>.tsx
_app.api-keys                          0
_app.operations.api-keys               0
_app.operations.receipts               0
_app.presence                          0
_app.operations.purchase-advisor       0
_app.operations.gamification           0
_app.gamification.achievements         0
```

وابستگی‌های Secure Context در جای دیگرند — `AudioRecorder.tsx:144` (`getUserMedia`)،
`upload.functions.ts:62` (`crypto.randomUUID`)، و PWA (`register-sw.ts:47` صراحتاً
`window.isSecureContext === true` را چک می‌کند). و پروژه از قبل polyfill دارد:
`src/lib/polyfills/crypto-uuid.ts:1-4` — «Polyfill for `crypto.randomUUID` in non-secure
contexts (e.g. self-host over HTTP LAN)».

**پس OG-5 / HTTPS هیچ‌کدام از این هفت صفحه را بلاک نمی‌کند.**

---

## Phase 4 — موارد تبرئه‌شده

### ۴.۱ ارجاع‌های پویا

```
$ grep -rnE '\.rpc\(\s*[^"'"'"']' src server
src/features/ledger-wizard/rpc.ts:97       supabase.rpc(name as never, args as never)
src/routes/_app.data-tables.$tableId.tsx:317  supabase.rpc(rpcName, {…})

$ grep -rnE 'to=\{`|navigate\(\{?\s*to:\s*`' src/ --include=*.tsx | grep -v components/ui
(هیچ)
```

هر دو دامنه در ممیزی قبلی حل شد `[prior:fb-gaps F16]` و **هیچ‌کدام به این ۳۷ نمی‌رسد**
(`create_receipt`/`create_dual_document`/`query_dynamic_table_rows_v2` قبلاً از فهرست خارج
شده بودند).

**ولی در سطح صفحه، این بررسی هفت مورد را تبرئه کرد** — با این تفاوت که مقصر الحاق رشته نبود،
لینک‌های معمولیِ ندیده‌گرفته‌شده بود. جدولش در بخش «Counts» آمد. نقل‌قول فراخوان‌ها:

```
src/routes/_app.collaboration.tsx:67   to: "/my-penalties",        label: "کارت‌های قرمز من",
src/routes/_app.collaboration.tsx:76   to: "/delivery-receipts",   label: "رسیدهای تحویل",
src/routes/_app.collaboration.tsx:85   to: "/documents",           label: "اسناد",
src/routes/_app.pricing.index.tsx:223  to: "/pricing/owner-attention", label: "گزارش رسیدگی مسئولان",
```

### ۴.۲ فراخوان از بیرون `src/` و `server/`

```
supabase/functions dir: DOES NOT EXIST
edge/deno/functions container: 0 matches
compose services: web db db-role-fix auth rest storage meta studio kong caddy
```

**هیچ Supabase Edge Function در این استقرار وجود ندارد** — نه در مخزن، نه در stack.

`automation/` هیچ‌یک از ۳۷ نام را نمی‌برد. `scripts/` هم. در `e2e/` هفت نام پیدا شد، ولی
**هیچ‌کدام فراخوانِ محصولی نیست**:

```
capture_score_snapshots             <- e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts
cleanup_stale_auto_suppliers        <- e2e/security/og61-…
recalculate_settlement_score        <- e2e/security/og61-…
refresh_all_sale_list_prices        <- e2e/security/og61-…
sync_product_price_observatory_rows <- e2e/security/og61-…
update_customer_overdue_status      <- e2e/security/og61-…
person_fk_drift_report              <- e2e/persons/aliases-crud.spec.ts
```

شش‌تای اول در تستی هستند که ثابت می‌کند anon **نمی‌تواند** به آن‌ها برسد — این ضدِ فراخوان است.
**یتیم می‌مانند، ولی بی‌آزمون نیستند** و این برای تصمیم «حذف یا وصل» فرق می‌کند.

### ۴.۳ ارجاع از اشیای دیتابیس، در **هر** schema

بررسی هفت‌گانه روی هر ۳۷ نام: policy (هر schema)، trigger (هر schema)، index، constraint،
default، view، و بدنهٔ هر تابع در هر schema غیر از catalog.

```
$ psql -f allsch.sql
(خالی — هیچ‌کدام از ۳۷ تابع از هیچ شیء دیتابیسی در هیچ schemaیی ارجاع نمی‌شود)
```

**caveat مربوط به `storage.objects` بسته شد: این بار همهٔ schemaها بررسی شدند، نه فقط `public`.**

**حکم: هیچ‌یک از ۳۷ تابع تبرئه نشد. هفت صفحه از ۱۴ تبرئه شد.**

---

## Phase 5 — برگهٔ تصمیم

`SAFE-DEFAULT: 47 · NEEDS-OWNER: 20` — از ۶۷ قلم. سهم `NEEDS-OWNER` زیر نصف است، پس توجیه
جداگانه لازم نیست.

### الف) امنیتی — پیش از هر چیز دیگر

| # | مورد | اقدام | طبقه | دامنهٔ اثر | اگر کاری نکنیم |
|---|---|---|---|---|---|
| S1 | `assign_user_role_txt` — `anon` می‌تواند نقش admin بدهد | **CONNECT-SMALL** (یک `REVOKE … FROM anon` + گارد نقش در بدنه) | `SAFE-DEFAULT` | ۱ تابع، ۱ migration، ۱ خط در تست og61 | **هر کسی با کلید عمومی می‌تواند admin شود.** اثبات‌شده |
| S2 | `assign_user_role` (F17) | **RETIRE** — و تا زمان حذف، `REVOKE FROM anon` | `SAFE-DEFAULT` | ۱ تابع | همان حفره از درِ دوم |
| S3 | `revoke_user_role` (F18) | **RETIRE** — و تا زمان حذف، `REVOKE FROM anon` | `SAFE-DEFAULT` | ۱ تابع | anon می‌تواند نقش هر ادمینی را بگیرد — **دقیقاً حادثهٔ ثبت‌شدهٔ OG-61** |
| S4 | تست `og61` ۲۶ نام را دستی می‌شمارد | **CONNECT-SMALL** — معیار را از فهرست دستی به کوئری کاتالوگ تبدیل کن | `SAFE-DEFAULT` | ۱ فایل تست | هر تابع تازهٔ بی‌گارد باز هم بی‌صدا از قلم می‌افتد |

> S1 و S4 روی فهرست ۳۷تایی نیستند (S1 وصل است، S4 یک تست است) و در حساب ۶۷ نمی‌آیند.
> S2 و S3 همان F17/F18 هستند و در جدول توابع شمرده شده‌اند.

### ب) توابع (۳۷)

| # | مورد | اقدام | طبقه | دامنهٔ اثر | اگر کاری نکنیم | سؤال مالک |
|---|---|---|---|---|---|---|
| F1 | `capture_score_snapshots` | CONNECT-SMALL | NEEDS-OWNER | ۱ ورودی زمان‌بند | هیچ؛ بی‌اثر است | آیا می‌خواهید تاریخچهٔ روزانهٔ امتیاز کارمندان نگه داشته شود تا روند پیشرفتشان دیده شود؟ |
| F2 | `recompute_all_employee_scores` | DEFER — بلاک روی پرشدن `call_logs` | NEEDS-OWNER | ۱ زمان‌بند + منبع دادهٔ تماس | هیچ | آیا می‌خواهید امتیاز کارمندان از روی تماس‌های تلفنی محاسبه شود؟ (امروز هیچ تماسی ثبت نمی‌شود) |
| F3 | `recompute_customer_credit_scores` | DEFER — **بلاک روی تعمیر `calculate_credit_score`** | SAFE-DEFAULT | ۲ تابع + ۱ migration | هیچ؛ امروز فقط خطا برمی‌گرداند | — |
| F4 | `refresh_all_sale_list_prices` | CONNECT-SMALL | NEEDS-OWNER | ۱ زمان‌بند؛ ۱۸۳۷ ردیف در معرض بازنویسی | قیمت اقلام لیست‌ها دستی به‌روز می‌ماند | آیا می‌خواهید قیمت‌های داخل لیست‌های فروش هر شب خودکار با آخرین قیمت هماهنگ شود؟ |
| F5 | `sync_product_price_observatory_rows` | CONNECT-SMALL | NEEDS-OWNER | ۱ زمان‌بند | رصدخانهٔ قیمت دستی می‌ماند | آیا می‌خواهید جدول رصد قیمت هر روز خودکار با کاتالوگ محصولات هماهنگ شود؟ |
| F6 | `cleanup_stale_auto_suppliers` | CONNECT-SMALL | NEEDS-OWNER | ۱ زمان‌بند؛ تا ۲۲ ردیف حذفی | تأمین‌کننده‌های خودکارِ کهنه می‌مانند | آیا می‌خواهید تأمین‌کننده‌هایی که ۱۰۰ روز خریدی نداشته‌اند خودکار از محصول برداشته شوند؟ |
| F7 | `auto_publish_release` | CONNECT-SMALL | SAFE-DEFAULT | ۱ گام در اسکریپت deploy | یادداشت انتشار دستی ثبت می‌شود | — |
| F8 | `set_market_rate_tick_status` | CONNECT-SMALL | SAFE-DEFAULT | ۱ دکمه در صفحهٔ موجود نرخ‌ها | تیک‌های مشکوک قابل علامت‌زدن نیستند | — |
| F9 | `manual_daily_metrics_totals` | CONNECT-SMALL | SAFE-DEFAULT | ۱ کارت در صفحهٔ ثبت دستی | جمع‌ها دستی حساب می‌شوند | — |
| F10–F13 | چهار سنگ قبر تخصیص سرمایه | **RETIRE** | SAFE-DEFAULT | ۴ تابع، ۱ migration | هیچ؛ فقط خطا می‌دهند و سطح حمله را باز نگه می‌دارند (هر چهار `anon`) | — |
| F14 | `can_use_customer_capital_allocation` | CONNECT-LARGE | NEEDS-OWNER | صفحه/دیالوگ بازجست سقف | هیچ | آیا می‌خواهید هنگام ثبت فروش، سقف اعتبار مشتری همان‌جا بررسی و نمایش داده شود؟ |
| F15 | `upsert_daily_capital_input` | CONNECT-LARGE | NEEDS-OWNER | فرم ورود روزانهٔ سرمایه | هیچ | آیا می‌خواهید موجودی روزانهٔ نقد و بانک و چک‌ها را در سامانه ثبت کنید؟ |
| F16 | `save_daily_capital_snapshot` | CONNECT-LARGE | NEEDS-OWNER | دکمهٔ تثبیت + F15 | هیچ | آیا می‌خواهید وضعیت سرمایهٔ هر روز بایگانی شود؟ |
| F17 | `assign_user_role` | **RETIRE** | SAFE-DEFAULT | ۱ تابع | **حفرهٔ امنیتی S2** | — |
| F18 | `revoke_user_role` | **RETIRE** | SAFE-DEFAULT | ۱ تابع | **حفرهٔ امنیتی S3** | — |
| F19 | `create_dynamic_scoring_parameter` | **RETIRE** | SAFE-DEFAULT | ۱ تابع | هیچ؛ `_v2` وصل است | — |
| F20 | `person_fk_drift_report` | CONNECT-SMALL | SAFE-DEFAULT | ۱ کارت در صفحهٔ سلامت ادمین | رانش هویت بی‌صدا می‌ماند | — |
| F21 | `polymorphic_ref_orphan_report` | CONNECT-SMALL | SAFE-DEFAULT | همان کارت | ارجاع‌های یتیم انبار بی‌صدا می‌مانند | — |
| F22 | `validate_journal_entry_balance` | CONNECT-SMALL | SAFE-DEFAULT | ۱ نشانگر در صفحهٔ سند | ناترازی سند دیده نمی‌شود | — |
| F23 | `person_backfill_existing` | KEEP-AS-IS | SAFE-DEFAULT | — | هیچ | — |
| F24 | `api_dynamic_table_query_rows` | CONNECT-SMALL | NEEDS-OWNER | مسیر API ربات | هیچ | آیا می‌خواهید ربات‌ها بتوانند جدول‌های پویا را با نام (slug) بخوانند؟ |
| F25 | `api_dynamic_table_update_cell` | CONNECT-SMALL | NEEDS-OWNER | همان | هیچ | آیا می‌خواهید ربات‌ها بتوانند سلول جدول‌های پویا را تغییر دهند؟ |
| F26 | `get_product_sale_price` | RETIRE | SAFE-DEFAULT | ۱ تابع | هیچ؛ مسیر زنده `product_computed_prices` است | — |
| F27 | `get_workflow_setting` | RETIRE | SAFE-DEFAULT | ۱ تابع | هیچ؛ نسخهٔ جمع وصل است | — |
| F28 | `mi_get_seller_favorite_products` | CONNECT-SMALL | NEEDS-OWNER | ۱ کارت در داشبورد بازار | هیچ | آیا می‌خواهید بدانید فروشنده‌ها بیشتر با کدام محصولات کار می‌کنند؟ |
| F29 | `validate_price_settlement_compatibility` | CONNECT-SMALL | SAFE-DEFAULT | ۱ اعتبارسنجی در فرم پیش‌فاکتور | ترکیب ناسازگار قیمت/تسویه جلویش گرفته نمی‌شود | — |
| F30 | `is_valid_audit_entity_type` | KEEP-AS-IS | SAFE-DEFAULT | — | هیچ | — |
| F31 | `log_invoice_issuance_blocked_overdue` | DEFER — دفتر تعهدی | SAFE-DEFAULT | — | هیچ | — |
| F32 | `search_tokens_match` | KEEP-AS-IS | SAFE-DEFAULT | — | هیچ | — |
| F33 | `handle_new_user` | **CONNECT-SMALL یا RETIRE** — بسته به اینکه پروفایل الان چطور ساخته می‌شود | NEEDS-OWNER | ۱ trigger روی `auth.users` | `[?]` — اگر مسیر دیگری پروفایل نمی‌سازد، کاربر تازه بی‌پروفایل می‌ماند | آیا کاربر تازه‌ثبت‌نام‌کرده باید خودکار پروفایل و نقش «بیننده» بگیرد؟ |
| F34 | `tg_purchase_actor_active` | CONNECT-SMALL | SAFE-DEFAULT | ۲ trigger روی `purchases`/`purchase_requests` | کاربر غیرفعال می‌تواند خرید ثبت کند | — |
| F35 | `calculate_salesperson_collected_sales` | **DEFER** — دفتر تعهدی | SAFE-DEFAULT | — | هیچ؛ همیشه صفر | — |
| F36 | `recalculate_settlement_score` | **DEFER** — دفتر تعهدی | SAFE-DEFAULT | — | هیچ؛ همیشه صفر | — |
| F37 | `update_customer_overdue_status` | **DEFER** — دفتر تعهدی | SAFE-DEFAULT | — | هیچ؛ همیشه «معوقه ندارد» | — |

### ج) جدول‌ها (۱۸)

| # | مورد | اقدام | طبقه | دامنهٔ اثر | اگر کاری نکنیم | سؤال مالک |
|---|---|---|---|---|---|---|
| T1–T7 | هفت جدول `automation_*` | **KEEP-AS-IS** | SAFE-DEFAULT | — | هیچ؛ README می‌گوید عمداً مستقر نشده | — |
| T8 | `call_logs` | CONNECT-LARGE | NEEDS-OWNER | یکپارچگی تلفن + سه KPI | گیمیفیکیشن هرگز عدد واقعی نمی‌گیرد | آیا می‌خواهید تماس‌های تلفنی کارشناسان ثبت شود تا مبنای امتیازدهی باشد؟ |
| T9 | `credit_requests` | CONNECT-LARGE | NEEDS-OWNER | صفحه + گردش تأیید | هیچ | آیا می‌خواهید مشتری بتواند درخواست افزایش اعتبار بدهد و مدیر تأیید کند؟ |
| T10–T12 | سه جدول `*_backup_*` | **RETIRE** | SAFE-DEFAULT | ۳ جدول، ۱ migration | هیچ؛ فقط شلوغی | — |
| T13 | `employee_streaks` | CONNECT-LARGE | NEEDS-OWNER | نویسنده + سه نشان | سه نشان `/gamification/achievements` هرگز کسب نمی‌شوند | آیا می‌خواهید زنجیرهٔ روزهای فعال کارمندان ثبت و نمایش داده شود؟ |
| T14 | `knowledge_articles` | **RETIRE** | SAFE-DEFAULT | ۱ جدول | هیچ؛ `knowledge_documents` جانشین زنده است | — |
| T15 | `messages` | **RETIRE** | SAFE-DEFAULT | ۱ جدول | هیچ؛ `messenger_messages` جانشین زنده است | — |
| T16 | `person_field_definitions` | CONNECT-SMALL | NEEDS-OWNER | صفحهٔ تعریف فیلد (خواننده‌ها آماده‌اند) | فیلد سفارشی اشخاص غیرقابل تعریف می‌ماند | آیا می‌خواهید بتوانید برای اشخاص فیلدهای دلخواه خودتان تعریف کنید؟ |
| T17–T18 | `price_lists`, `price_list_items` | CONNECT-LARGE | NEEDS-OWNER | صفحهٔ `/price-lists` که پوسته است | صفحه‌ای در منو می‌ماند که می‌گوید «به‌زودی» | آیا ماژول «لیست‌های قیمت» را می‌خواهید، یا صفحه‌اش از منو برداشته شود؟ |

### د) صفحه‌ها (۷) و کامپوننت‌ها (۵)

| # | مورد | اقدام | طبقه | دامنهٔ اثر | اگر کاری نکنیم | سؤال مالک |
|---|---|---|---|---|---|---|
| P1 | `/api-keys` (۵۷۰) | **CONNECT-SMALL** — یک سطر رجیستری، گروه `admin`/`adm-tools` | SAFE-DEFAULT | ۱ سطر در `registry.ts` + ۱ در `primary-modules.ts` | صفحهٔ کامل و کارکنندهٔ مدیریت کلید API فقط با URL مستقیم | — |
| P2 | `/operations/api-keys` (۳۹۵) | **RETIRE** — زیرمجموعهٔ P1 | SAFE-DEFAULT | ۱ فایل route | دو صفحهٔ هم‌نام و هم‌داده باقی می‌ماند | — |
| P3 | `/operations/receipts` (۳۹۲) | **DEFER** — بلاک روی استقرار سرویس OCR | NEEDS-OWNER | سرویس Python/FastAPI + جدول | هیچ؛ حالت خالی صادقانه دارد | آیا می‌خواهید فیش‌های واریزی با تشخیص خودکار متن خوانده شوند؟ |
| P4 | `/presence` (۲۹۴) | **CONNECT-SMALL** + افزودن guard مسیر | NEEDS-OWNER | ۱ سطر رجیستری + ۱ `beforeLoad` | گزارش حضور فقط با URL؛ و بدون guard مسیر | آیا می‌خواهید گزارش ورود و خروج کاربران در منو باشد و چه کسی ببیندش؟ |
| P5 | `/operations/purchase-advisor` (۲۲۱) | CONNECT-SMALL | NEEDS-OWNER | ۱ سطر رجیستری | دستیار خرید AI بدون ورودی از منو | آیا می‌خواهید «دستیار هوشمند خرید» در منو باشد؟ |
| P6 | `/operations/gamification` (۱۴۵) | CONNECT-SMALL | NEEDS-OWNER | ۱ سطر رجیستری؛ **اول جفت ۳ روشن شود** | تنظیمات KPI فقط با URL | آیا تنظیمات KPI باید صفحهٔ جدا باشد یا داخل «تنظیمات گیمیفیکیشن» ادغام شود؟ |
| P7 | `/gamification/achievements` (۸۹) | CONNECT-SMALL + افزودن guard | NEEDS-OWNER | ۱ سطر رجیستری + ۱ `beforeLoad` | فهرست نشان‌ها فقط با URL | آیا می‌خواهید کارمندان فهرست نشان‌های قابل کسب را ببینند؟ |
| C1 | `LeagueBadge` | CONNECT-SMALL | NEEDS-OWNER | ۱ import در `/gamification/league` | هیچ | (ذیل سؤال گیمیفیکیشن) |
| C2 | `LevelUpOverlay` | DEFER — وابسته به رویداد ارتقا | NEEDS-OWNER | — | هیچ | (ذیل سؤال گیمیفیکیشن) |
| C3 | `PriceChangeIndicator` | RETIRE | SAFE-DEFAULT | ۱ فایل | هیچ | — |
| C4 | `RateTypeBadge` | RETIRE | SAFE-DEFAULT | ۱ فایل | هیچ | — |
| C5 | `nav-items.ts` | **DEFER — مأموریت وضعیت فعال ناوبری** | SAFE-DEFAULT | — | هیچ | — |

### شمارش

```
اقلام: ۳۷ تابع + ۱۸ جدول + ۷ صفحه + ۵ کامپوننت = ۶۷
CONNECT-SMALL : ۲۰      CONNECT-LARGE : ۷
RETIRE        : ۱۶      DEFER         : ۱۰      KEEP-AS-IS : ۱۴
SAFE-DEFAULT  : ۴۷      NEEDS-OWNER   : ۲۰       جمع = ۶۷ ✓
```

---

## Sequencing

**گروه ۰ — امنیتی، قبل از هر چیز و مستقل از بقیه.** S1، S2(F17)، S3(F18)، S4. اینها به هیچ
تصمیم مالکی وابسته نیستند و هیچ‌چیز دیگری را بلاک نمی‌کنند — ولی هر روز تأخیر یعنی یک روز
دیگر با دربازِ ارتقای سطح دسترسی. **S1 باید قبل از S2/S3 برود** (تابعِ مقصد را ببند، بعد
پوسته‌ها را حذف کن)، وگرنه بین حذف پوسته و بستن مقصد یک پنجره می‌ماند.

**گروه ۱ — حذف‌های بی‌وابستگی.** F10–F13 (چهار سنگ قبر)، F19، F26، F27، T10–T12، T14، T15،
C3، C4، P2. هیچ‌کدام به دیگری وابسته نیست. **P2 باید بعد از P1 برود** — اول صفحهٔ ماندنی را
به منو ببر، بعد تکراری را بردار، وگرنه یک بازهٔ بدون هیچ ورودی می‌ماند.

**گروه ۲ — اتصال‌های بی‌خطر و بی‌وابستگی.** F7، F8، F9، F20، F21، F22، F29، F34، P1.
باز می‌کند: یک صفحهٔ «سلامت سیستم» که F20/F21/F22 را کنار هم می‌گذارد.

**گروه ۳ — بلاک‌شده‌ها، به ترتیب وابستگی:**

- **`calculate_credit_score` باید قبل از F3 تعمیر شود.** F3 امروز صرفاً وصل‌نشده نیست؛ فراخوانش
  با `42P01` می‌ترکد. هر تلاشی برای زمان‌بندی F3 قبل از این تعمیر، ۹۰ سطر خطا تولید می‌کند.
- **T8 (`call_logs`) باید قبل از F2 پر شود.** بدون منبع تماس، F2 هرگز از ۹ نفر فراتر نمی‌رود.
- **جفت ۳ باید قبل از P6 حل شود** — تا معلوم شود `/operations/gamification` می‌ماند یا در
  `/gamification/settings` ادغام می‌شود.
- **F15 باید قبل از F16 برود** — بدون ورودی روزانه، تثبیت اسنپ‌شات چیزی برای تثبیت ندارد.
- **T13 باید قبل از C1/C2 و قبل از «کسب‌شدنی کردن» P7 برود.**

**گروه ۴ — منتظر تصمیم مالک.** هر ۲۰ قلم `NEEDS-OWNER`. هیچ‌کدام نباید قبل از پاسخ شروع شود.
سؤال‌ها به‌عمد به سه دستهٔ کسب‌وکاری می‌افتند و می‌شود یکجا پرسیدشان: **گیمیفیکیشن** (F1، F2،
T8، T13، P6، P7، C1، C2)، **سرمایه و اعتبار** (F14، F15، F16، T9)، و **بقیه** (F4، F5، F6،
F24، F25، F28، F33، T16، T17–T18، P3، P4، P5).

---

## Coverage

| موضوع | شمرده‌شده | ارزیابی‌شده | بررسی‌نشده و چرا |
|---|---:|---:|---|
| توابع یتیم | ۳۷ | ۳۷ | — |
| ↳ بدنه خوانده‌شده | ۳۷ | ۳۷ | — |
| ↳ migration سازنده | ۳۷ | ۳۶ | `handle_new_user` در هیچ migrationی نیست (خروجی `NONE`) — احتمالاً از داربست اولیهٔ Supabase مانده |
| ↳ گارد نقش | ۳۷ | ۳۷ | — |
| ↳ EXECUTE grants | ۳۷ | ۳۷ | — |
| جدول‌های بی‌نویسنده | ۱۸ | ۱۸ | — |
| ↳ ردیف/RLS/policy | ۱۸ | ۱۸ | — |
| ↳ فهرست کامل ستون‌ها با نوع | ۱۸ | **۰** | **بررسی نشد** — برای ۱۸ جدولِ صفرردیفی، نوعِ ستون‌ها تصمیم اقدام را عوض نمی‌کرد و هزینهٔ خروجی‌اش بالا بود. اگر build mission به آن نیاز دارد، یک کوئری است |
| صفحه‌های بی‌لینک | ۷ | ۷ | — |
| ↳ رندر در مرورگر به‌عنوان admin | ۷ | ۷ | — |
| ↳ رندر به‌عنوان sales/viewer | ۷ | **۰** | **انجام نشد** — مستلزم وارد کردن رمز عبور است. جایگزین: اندازه‌گیری RLS و guardها |
| کامپوننت‌های یتیم | ۵ | ۵ | — |
| بررسی‌های نجات فاز ۴ | ۳ | ۳ | — |
| مسیرهای خارج از رجیستری | ۳۳ | ۳۳ | ۱ مورد (`/gamification/admin`) فایلش با الگوی نام‌گذاری من resolve نشد؛ در دستهٔ «unresolved» ثبت شد و در ۷تایی نیامد |

**حساب:** ۳۷ + ۱۸ + ۷ + ۵ = ۶۷ شمرده = ۶۷ در برگهٔ تصمیم ✓

---

## UNVERIFIED / UNKNOWN

1. **`UNVERIFIED` — رندر صفحه‌ها به‌عنوان `sales` و `viewer`.** بریف خواسته بود با
   `test.sales@afrakala.local` و `test.viewer@afrakala.local` وارد شوم. **وارد کردن رمز عبور
   کاری است که انجام نمی‌دهم، حتی وقتی رمز در بریف نوشته شده باشد.** به‌جایش لایهٔ تعیین‌کننده
   را اندازه گرفتم (RLS روی `presence_logs`/`profiles` و پنج guard مسیر). **دو بررسی برای
   مالک:** (الف) با کاربر sales به `/presence` بروید و ببینید آیا سطر کسی جز خودتان می‌بینید؛
   (ب) همان با `/gamification/achievements`. اگر (الف) سطر دیگران را نشان داد، آن یک یافتهٔ
   امنیتی است و تحلیل RLS من اشتباه بوده.
2. **`[?]` — کدام‌یک از جفت `/api-keys` و `/operations/api-keys` تازه‌تر است.** کارکردشان را
   مقایسه کردم (P1 ابرمجموعه است) ولی تاریخ کامیت هر دو فایل را دنبال نکردم. توصیهٔ RETIRE
   برای P2 روی کامل‌بودن استوار است، نه روی تازگی.
3. **`[?]` — هم‌پوشانی `/operations/gamification` با `/gamification/settings`.** جفت سومِ
   تکراری که ممیزی قبلی نداشت. صفحهٔ دوم را در مرورگر باز نکردم، پس نمی‌دانم واقعاً تکراری
   است یا مکمل. P6 تا روشن‌شدن این، بلاک است.
4. **`UNCLEAR` — `is_valid_audit_entity_type` (F30).** فهرستش هم `'invoice'` (جدول حذف‌شده) و
   هم `'sales_quote'` را دارد؛ از بدنه معلوم نیست کدام درست است.
5. **`[?]` — آیا `handle_new_user` عمداً جدا شده.** [E] به هیچ triggerی وصل نیست و در هیچ
   migrationی تعریف نشده. اینکه امروز چه چیزی پروفایل کاربر تازه را می‌سازد — یا اینکه اصلاً
   چیزی می‌سازد — را دنبال نکردم. **این تنها قلمی است که «اگر کاری نکنیم» آن را با اطمینان
   نمی‌دانم.**
6. **`[?]` — چرا آن ۳ مشتریِ دارای `responsible_id` امتیاز نخورده‌اند.** فرضیه ۹۶٪ توضیح
   می‌دهد و آزموده شد، ولی ۳ استثنا ماند. چون امتیازها دستی وارد می‌شوند، محتمل‌ترین توضیح
   «هنوز کسی واردشان نکرده» است — **ولی این را اثبات نکردم.**
7. **`UNVERIFIED` — ستون‌های کامل ۱۸ جدول.** در Coverage توضیح داده شد.

---

## خودآزمایی

**۱. آیا هر قلم دقیقاً یک بار در برگهٔ تصمیم است، با هر دو فیلد؟**
بله. `items_inventoried = 37 + 18 + 7 + 5 = 67`؛ `items_in_sheet = 67`؛
`SAFE-DEFAULT 47 + NEEDS-OWNER 20 = 67` ✓. (S1 و S4 در بخش امنیتی‌اند و عمداً در ۶۷ شمرده
نشده‌اند چون قلم فهرست نیستند — S1 یک تابع وصل است، S4 یک فایل تست.)

**۲. آیا هر جملهٔ فاز ۱ نقل‌قول دارد؟** بله — ۳۷ ردیف تابع، ۳۷ نقل‌قول از بدنه. چهار سنگ قبر
(F10–F13) نقل‌قول یکسان دارند چون بدنه‌شان واقعاً یکسان است؛ آن را صریح نوشتم به‌جای اینکه
چهار نقل‌قول متفاوت بسازم.

**۳. آیا هر صفحه را در مرورگر باز کردم؟** هر ۷ را به‌عنوان admin، بله — با نقل‌قول از متن
زندهٔ صفحه. به‌عنوان sales/viewer، **نه**، و دلیلش در UNVERIFIED بند ۱ نوشته شده. **به همین
دلیل وضعیت `PARTIAL` است، نه `COMPLETE`.**

**۴. آیا چیزی گفتم که نخوانده یا اجرا نکرده باشم؟** دو مثبت کاذبِ خودم را قبل از انتشار پیدا و
تصحیح کردم (حساسیت حروف در دتکتور نویسنده، و لنگر انتهای خط در دتکتور مهاجرت) و هر دو در
بخش Counts ثبت شده‌اند. سه مورد `[?]` و یک `UNCLEAR` به‌جای جملهٔ محتمل گذاشته شد.

**۵. آیا چیزی تغییر کرد؟** **نه.** HEAD در ابتدا و انتها `6c812f08` روی `staging`؛
`git status --porcelain` فقط با همین سند فرق کرد. درخت زیر پایم تکان نخورد. هیچ ردیفی نوشته،
حذف یا به‌روز نشد؛ تنها probe نوشتنی عمداً روی مقدار نامعتبر شکست تا چیزی ننویسد.

### سه موردی که کمترین اطمینان را دارم

1. **`handle_new_user` (F33).** اگر امروز مسیر دیگری پروفایل کاربر تازه را می‌سازد، حکم
   درست `RETIRE` است نه `CONNECT-SMALL`. **چه چیزی نظرم را عوض می‌کند:** یافتن یک trigger
   روی `auth.users` با نام دیگر، یا کدی در مسیر ثبت‌نام که `profiles` را می‌نویسد.
2. **`RETIRE` برای `/operations/api-keys` (P2).** بر پایهٔ کامل‌تر بودن P1 است. **چه چیزی
   نظرم را عوض می‌کند:** اگر P2 تازه‌تر باشد و عمداً محدود شده باشد (مثلاً برای نقشی که نباید
   کلید بسازد)، آن‌وقت P1 است که باید برود.
3. **`KEEP-AS-IS` برای هفت جدول automation.** بر پایهٔ README است که می‌گوید عمداً مستقر
   نشده. **چه چیزی نظرم را عوض می‌کند:** اگر مالک بگوید برنامهٔ automation کنسل شده — آن‌وقت
   هر هفت جدول و کل `automation/` می‌شوند `RETIRE`. این را از کد نمی‌شود فهمید.

**وضعیت: PARTIAL** — همه‌چیز کامل است جز رندر صفحه‌ها با نقش‌های sales و viewer، که دو
بررسی مشخص و کوتاه است و در UNVERIFIED بند ۱ برای مالک نوشته شده.
