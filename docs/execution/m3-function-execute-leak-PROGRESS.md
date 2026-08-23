# M3 — نشت سطح‌تابع: OG-33 + OG-31 — PROGRESS

## HANDOFF STATE

```
Mission:              M3 — function EXECUTE leak
Status:               complete — review CHANGE, all findings closed
Branch:               feature/m3-function-execute-leak
Base:                 staging @ 9a661303  (verified: git rev-parse origin/staging)
Items:                OG-33 (close, owner-decided) + OG-31 (decide with measurement)
Migrations:           381 (OG-33) and 382 (gate repair), both applied, psql exit 0
Assertion gates:      1 — shipped in 381, REPAIRED in 382 (not a second gate)
Review rounds:        max 2
Catalogue baseline:   a51ee08e55ff48453d7a2925f1c5d098 / pg_class 1105 / pg_proc 841
```

## پرسش پیش‌پرواز — **مالک پاسخ داد**

> آیا زمان آخرین خرید هر محصول باید عمومی باشد؟

**پاسخ مالک: خیر. ببند.** و صریح گفت از fallback استفاده نکن — یعنی این یک
**تصمیم** است، نه انتخاب پیش‌فرض یک عامل. ثبت می‌شود چون تفاوت دارد: بستن به
پشتوانهٔ تصمیم مالک برگشت‌پذیرتر و قابل‌دفاع‌تر از بستن به پشتوانهٔ fallback است.

---

## فاز ۰ — سنجش. هیچ تغییری.

### ۰.۱ — سطح `EXECUTE` تابع، با **اثر** نه هویت

```
functions in public                          : 841
anon can EXECUTE (effective)                 : 746
  of those, SECURITY DEFINER                 : 347
anon NAMED in proacl (identity test)         : 743
proacl IS NULL (=> PUBLIC default)           : 0
PUBLIC named in proacl (leading '=')         : 712
```

**عدد تعیین‌کننده ۷۱۲ است.** هفتصد و دوازده تابع گرنت `PUBLIC` دارند، یعنی
`REVOKE EXECUTE … FROM anon` روی آن‌ها **هیچ کاری نمی‌کند** — دقیقاً همان تلهٔ
سند مأموریت. اختلاف ۷۴۶ (اثر) و ۷۴۳ (هویت) هم می‌گوید سه تابع را anon
می‌تواند اجرا کند بی‌آنکه نامش در `proacl` باشد.

### ۰.۲ — `pg_stat_statements`: anon واقعاً چه اجرا کرده

این روش شکل‌کد ندارد و به همین دلیل روش دوم است — نه دو جست‌وجوی کد.

```
anon | calls=21315 | set_config(...)                       <- PostgREST role switch
anon | calls=21055 | SELECT shop_settings.key ...          <- /api/healthz
anon | calls=16141 | COMMIT
anon | calls=24    | SELECT products.id, name, ...         <- /api/public/products
anon | calls=15    | SELECT notification_queue...          <- زنگ اعلان، پیش از چسبیدن توکن
anon | calls=4     | vw_account_balances                   <- probeهای بازبینی G-1
anon | calls=3     | rpc get_recent_purchase_label         <- probeهای خودم
```

**فقط ۴ RPC متمایز را anon تا امروز اجرا کرده، و هر چهار probe تحقیقاتی بوده‌اند
— نه ترافیک محصول.** یعنی هیچ مصرف‌کنندهٔ واقعیِ RPC به‌عنوان anon وجود ندارد.

### ۰.۳ — دو تابع OG-33، وضعیت دقیق

```
get_recent_purchase_label(uuid)     secdef=true  anonExec=true
get_recent_purchase_labels(uuid[])  secdef=true  anonExec=true
proacl = {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
          ^^ این «=X» یعنی PUBLIC
```

هر دو **هم** گرنت صریح `anon` دارند **هم** گرنت `PUBLIC`. پس بستنشان به **دو**
REVOKE نیاز دارد، نه یکی.

### ۰.۴ — مصرف‌کنندگان، با پیمایش گذرای import

```
components/products/RecentPurchaseBadge.tsx   -> rpc('get_recent_purchase_label')
components/products/RecentPurchaseGroup.tsx   -> rpc('get_recent_purchase_labels')
```

چهار مسیر به آن‌ها می‌رسند:

| مسیر | نقش |
|---|---|
| `_app.products.$id.tsx` | احرازشده |
| `_app.products.index.tsx` | احرازشده |
| `_app.sales.search.tsx` | احرازشده |
| **`public.sale-lists.$listId.tsx`** | **عمومی** — از راه `components/public/sale-list-table.tsx` |

و آن مسیر عمومی **امروز برای anon کار نمی‌کند**:

```
anon SELECT on sale_lists  : false
published sale lists       : 0
```

پس بستن این دو تابع **هیچ صفحهٔ کارکننده‌ای را نمی‌شکند**. سه مسیر `_app` هم
دست‌نخورده می‌مانند، چون هر دو تابع گرنت **صریح** `authenticated=X` دارند که
REVOKEِ `anon` و `PUBLIC` به آن نمی‌خورد.

### ۰.۵ — OG-31: چه چیزی به پیش‌فرض `FUNCTIONS` وابسته است

**مسیر ربات به `anon` وابسته نیست.** هر ده تابع `bot_*` برای anon اجراشدنی‌اند،
ولی `src/server/bot-api.ts` از **service role** استفاده می‌کند — پس
`authenticateBot` و بقیه از آن راه نمی‌آیند. این را سند مأموریت خواسته بود
صریحاً بررسی شود.

**مسیر احراز هویت** — این‌ها برای anon اجراشدنی‌اند و توابع کمکیِ داخل سیاست‌های
RLS هستند:

```
has_any_role(uuid, app_role[])   anonExec=true      212 policies call has_any_role
has_any_role(uuid, text[])       anonExec=true      165 policies call has_role
has_role(uuid, app_role)         anonExec=true       91 policies call is_viewer_only
has_role(uuid, text)             anonExec=true
is_viewer_only(uuid)             anonExec=true
log_event, normalize_identifier, tehran_today        anonExec=true
has_dynamic_permission           anonExec=FALSE
```

### ۰.۶ — ~~یک فرضیهٔ من که سنجش ردش کرد، و کامل توضیحش نمی‌توانم بدهم~~

> **توضیحش یک کوئری فاصله داشت. بازبینی مستقل دادش — بند F5 پایین.**
> اندازه‌گیری‌های زیر درست‌اند؛ حدسی که در پایانشان زدم (overloadها) مسیر
> انحرافی بود. علت واقعی این است که هر سه سیاست `customers` به
> `TO {authenticated}` محدودند و برای `anon` اصلاً اعمال نمی‌شوند.

فرض کرده بودم گرفتن `EXECUTE` از anon روی یک تابع کمکیِ سیاست، رفتار را از
«صفر ردیف» به `42501` عوض می‌کند. داخل `BEGIN … ROLLBACK` آزمودم:

```
BEFORE  customers as anon = 0
REVOKE EXECUTE ON has_any_role(uuid, text[]) FROM anon;  و FROM PUBLIC;
AFTER   customers as anon = 0        <- تغییری نکرد
```

ولی سر دیگر طیف واقعی است و همان‌جا سنجیده شد:

```
pricing_rules as anon -> ERROR: permission denied for function has_dynamic_permission
anon EXECUTE on has_dynamic_permission = false
```

~~یعنی هر دو رفتار وجود دارد. `has_any_role` دو overload دارد … پس این توضیح
کامل جا نمی‌افتد. ثبت می‌کنم به‌عنوان سنجیده‌ولی‌توضیح‌نداده.~~ **حل شد — F5.**

برای M3 تعیین‌کننده نیست — این مأموریت هیچ REVOKE دسته‌جمعی روی
توابع موجود نمی‌کند — ولی هر مأموریت آینده‌ای که بخواهد بکند باید بداند اثرش
**جدول‌به‌جدول و امضا‌به‌امضا** فرق می‌کند و از «هیچ تغییری» تا `42501` نوسان
دارد.

---

## تصمیم‌ها

### OG-33 — بسته می‌شود

تصمیم مالک. `REVOKE EXECUTE` از **`anon` و `PUBLIC`** روی هر دو تابع. سه نقش
دیگر گرنت صریح دارند و دست‌نخورده می‌مانند.

### ~~OG-31 — پیش‌فرض بسته می‌شود، موجودها دست نمی‌خورند~~

> **این تصمیم دو بار عوض شد و هر دو بار غلط بود. نسخهٔ نهایی در F1 است.**
>
> نسخهٔ اول: «پیش‌فرض `FUNCTIONS` را برای anon ببند.» — دروازه پیش از اعمال
> ردش کرد؛ روی تابع تازه هیچ اثری نداشت.
> نسخهٔ دوم: «بستنی نیست، درمانش no-op است.» — بازبینی مستقل ردش کرد؛ صورت
> **سراسری** بستنی است.
> **نسخهٔ نهایی: بستنی هست، با دو دستور، و دامنهٔ انفجارش هر شِمای این نصب
> است — پس تصمیم مالک است، نه عامل. با همین سنجش برگردانده شد.**

~~`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon` — قرینهٔ
دقیق کاری که مهاجرت ۳۷۳ برای `TABLES` و `SEQUENCES` کرد.~~

چرا توابع موجود دست نمی‌خورند، با دلیل نه با احتیاط:

1. ۷۴۶ تابع درگیرند و ۲۱۲ سیاست RLS به آن‌ها تکیه می‌کنند. این دامنهٔ M10 است،
   نه M3 — و سند مأموریت صریحاً حصار زده: «به گرنت‌های جدول گسترش نده».
2. اثرش، طبق بند ۰.۶، **قابل پیش‌بینی نیست** بی‌آنکه هر ۷۴۶ تا جداگانه سنجیده
   شود.
3. شواهد زمان اجرا می‌گوید هیچ RPCی به‌عنوان anon در محصول فراخوانده نمی‌شود،
   پس بستن شیرِ آینده تمام سودِ در دسترس را می‌گیرد و هیچ ریسکی برنمی‌دارد.

---

## فاز ۵ — بازبینی مستقل: **CHANGE**، و ادعای اصلی مأموریت غلط بود

### F1 — MAJOR: نتیجه‌گیری OG-31 **نادرست بود**. صورت پنجمی هست که کار می‌کند.

نوشته بودم «هیچ صورتی از `ALTER DEFAULT PRIVILEGES … ON FUNCTIONS` جلوی
اجراشدن تابع تازه توسط anon را نمی‌گیرد». **هر چهار صورتی که آزمودم
`IN SCHEMA public` داشتند.** بازبین صورت **سراسری** را امتحان کرد — همان که
هرگز به ذهنم نرسید — و کار می‌کند. خودم بازتولیدش کردم:

```sql
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;              -- بدون IN SCHEMA
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
```

```
new fn proacl : {postgres=X, supabase_admin=X, authenticated=X, service_role=X}
anon          : false          <- بسته شد
PUBLIC        : false          <- بسته شد
authenticated : true
service_role  : true
global defacl rows created: 1
```

سازوکار: ردیف **سراسری** (`defaclnamespace = 0`) پیش‌فرض درون‌ساختهٔ
`acldefault()` را **جایگزین** می‌کند، نه اینکه رویش سوار شود. ردیف
schema-scoped این کار را نمی‌کند. چهار اندازه‌گیری من هرکدام **درست** بودند؛
تعمیمی که از آن‌ها گرفتم نبود.

**یک قید واقعی که بازبین سنجید و باید ثبت شود:** ردیف سراسری روی **هر شِما**
اثر می‌گذارد، نه فقط `public`. تابعی که `supabase_admin` در شِمای دیگری بسازد
هم `EXECUTE` عمومی‌اش را از دست می‌دهد. برای یک نصب Supabase که شِماهای
`auth`, `storage`, `realtime` دارد، این تصمیم مالک است نه عامل.

**پس OG-31 اصلاح‌شده برگردانده می‌شود:** «با دو دستور بستنی است، با این دامنهٔ
انفجار» — نه «درمانش no-op است». ثبت اول من غلط بود و اینجا تصحیح می‌شود.
مهاجرت ۳۸۱ همچنان چیزی برای OG-31 نمی‌فرستد، ولی حالا به دلیل درست: دامنهٔ
سراسری تصمیم مالک است.

### F2 — MAJOR: دروازهٔ ۳۸۱ روی دو حالت پایانی غلط پاس می‌شد

هر دو را بازتولید کردم:

- **P1، جابه‌جایی خنثی.** بازبین `is_viewer_only(uuid)` و `tehran_today()` را
  برای anon بست و دو RPC مدیریتی را باز کرد. شمار روی **۷۴۴** ماند و دروازه
  پاس شد. `is_viewer_only` پشتوانهٔ **۹۱** سیاست RLS است.
- **P2، آسیب جانبی.** `SELECT` anon روی `shop_settings` و `products` گرفته شد
  — یعنی `/api/healthz` و `/api/public/products` هر دو مرده — و گرنت خودِ
  مالک هم گرفته شد. دروازه پاس شد **و در پیام موفقیتش نوشت
  «supabase_admin kept it»**.

علت هر دو یکی است و بازبین دقیق نامش را برد: **دروازه به شِما نشانه رفته بود،
نه به تغییر.**

### F3, F4 — سرشماری کل‌شِما در یک مهاجرتِ replay‌شونده، و یک ادعای تهی

بررسی ۵ حالت ۸۳۹ تابعی را که ۳۸۱ اصلاً لمس نمی‌کند در مهاجرتی پین می‌کرد که
باید کامل و به ترتیب replay شود. و `supabase_admin` در فهرست نگه‌داشتنی‌ها
**تهی** بود: superuser است، پس `has_function_privilege` برایش همیشه `true`
است — دقیقاً به همین دلیل P2 توانست گرنت مالک را بگیرد و دیده نشود.

### مهاجرت ۳۸۲ — **تعمیر** دروازه، نه دروازهٔ دوم

سقف مأموریت یک دروازه است و می‌گوید اگر شکست خورد **تعمیرش کن**. ۳۸۱ اعمال و
commit شده و مهاجرت اعمال‌شده ویرایش نمی‌شود، پس تعمیر در ۳۸۲ آمد و
**بررسی‌های ۴ و ۵ مهاجرت ۳۸۱ صراحتاً بازنشسته شدند.**

۳۸۲ به **تغییر** نشانه می‌رود، و کوتاه‌تر است:

- سرشماری کل‌شِما حذف شد.
- شش امضای کمکیِ RLS که anon باید نگه دارد، **با نام** ادعا می‌شوند — P1 را می‌بندد.
- `shop_settings` و `products` که سطوح عمومی زنده می‌خوانند، **با نام** — P2 را می‌بندد.
- `supabase_admin` از آزمون اثر بیرون رفت و با `aclexplode` روی `proacl` سنجیده می‌شود.
- probeِ خودباطل‌کنندهٔ ۳۸۱ بازنشسته شد؛ وضعیت OG-31 جایش در رکورد دروازه‌هاست نه در مهاجرتی که باید replay شود.

نتیجهٔ حمله‌ها:

```
BASELINE                    382: NOTICE OK
P1 swap (defeated 381)      381: OK   382: ERROR anon lost EXECUTE on public.is_viewer_only(uuid)
P2 collateral (defeated 381) 381: OK   382: ERROR supabase_admin has no EXECUTE aclitem on …
P3 PUBLIC trap               382: ERROR anon can still EXECUTE …
P4 authenticated loses it    382: ERROR authenticated lost EXECUTE on …
P5 373 undone                382: ERROR an anon default privilege is back on TABLES or SEQUENCES
```

### F5 — و توضیح بند ۰.۶ که یک کوئری فاصله داشت

نوشته بودم «سنجیده ولی توضیح‌نداده». بازبین توضیحش را داد و بازتولیدش کردم —
و حدس من (overloadها) **مسیر انحرافی** بود:

```
customers     : viewer_restricted        TO {authenticated}
customers     : manage customers by role TO {authenticated}
customers     : read customers by role   TO {authenticated}
pricing_rules : viewer_restricted        TO {authenticated}
pricing_rules : manager admin write …    TO {public}
pricing_rules : pricing_rules_select_…   TO {public}
```

هر سه سیاست `customers` به `authenticated` محدودند، پس برای `anon` **اصلاً
اعمال نمی‌شوند** — qual هرگز ارزیابی نمی‌شود، تابع هرگز صدا زده نمی‌شود، و
گرفتن `EXECUTE` نامرئی است. صفر ردیف از «هیچ سیاست مجازی برای این نقش نیست»
می‌آید. `pricing_rules` دو سیاست `TO {public}` دارد، پس qual **ارزیابی
می‌شود** و نبود `EXECUTE` به‌صورت `42501` بیرون می‌زند.

هشدار رو به جلویی که گرفته بودم همچنان درست است، ولی دلیلش فرق دارد: عامل
تعیین‌کننده **محدودبودن سیاست به `authenticated`** است، که **جدول‌به‌جدول
قابل بررسی است** و به سنجش ۷۴۶ تابع نیاز ندارد.

### F6 — عدد ۱۶۵ بازتولیدپذیر است، ولی خودش معیوب بود

بازبین گفت با هیچ صورت‌بندی به ۱۶۵ نرسیده. رسیدم:
`qual || with_check ILIKE '%has_role%'` = **۱۶۵**. ولی نکتهٔ مهم‌تر این است که
`has_role` **زیررشتهٔ** `has_any_role` است، پس آن ۱۶۵ هر دو را با هم می‌شمارد
و عدد بی‌معنایی است. کوئری ثبت می‌شود و عدد با قید گزارش:
`qual`-تنها = ۱۳۷، `qual`+`with_check` = ۱۶۵، هر دو با تطبیق زیررشته‌ای.
اعداد همسایه دقیق‌اند: `has_any_role` = ۲۱۲، `is_viewer_only` = ۹۱.

### F7 — نشانگر harness برای این مأموریت کور است

`rollback-dryrun.sql` شمار `pg_proc` را نشانگر می‌گیرد (۸۴۱). `381-down` فقط
`GRANT` می‌زند، پس آن عدد چه بازگشت انجام شود چه نشود ۸۴۱ است. harness عمومی
و در اصل درست است، ولی برای M3 آن نشانگر چیزی اثبات نمی‌کند — بازبین probeهای
ACL خودش را دورش پیچید و بازگشت را با آن‌ها اثبات کرد.

### F8 — ۳۸۱ در `schema_migrations` نیست

`SELECT count(*) … WHERE version='20260823160000'` = **۰**. با الگوی مستندشدهٔ
۳۷۴ تا ۳۸۰ می‌خواند (مهاجرت‌ها اینجا دستی اعمال می‌شوند و چیزی آن جدول را
نمی‌نویسد)، ولی نه مهاجرت گفته بودش نه سند. ثبت شد.

### قضاوت بازبین دربارهٔ بیش‌مهندسی

«عمدتاً منضبط، با یک زیاده‌روی روشن» — و آن زیاده‌روی **داخل دروازه** بود:
چهار `REVOKE` را پنج ادعا نگهبانی می‌کرد که دو تایشان بیرون از تغییر را نشانه
رفته بودند، در حالی که ادعاهایی که آسیب واقعی را می‌گرفتند غایب بودند.
۳۸۲ همان را اصلاح می‌کند.

## گام بعدی

ارسال.
