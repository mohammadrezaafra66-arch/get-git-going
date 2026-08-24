# M4 — OG-26 + OG-28 · هشت view کلاس نگهبان `is_viewer_only` — PROGRESS

## HANDOFF STATE

```
Mission:              M4 — OG-26 (بستن fail-open برای uid تهی). OG-28 باز می‌ماند.
Status:               ۳۸۶ و ۳۸۷ اعمال و commit شدند. بازبینی دور ۱ پاسخ داده شد.
Branch:               feature/m4-viewer-guard
Base:                 staging @ 5a828df9  (تأیید شد: git rev-parse origin/staging)
Migrations:           386 (تغییر) + 387 (تعمیر دروازهٔ ۳۸۶) — دروازهٔ دوم نیست
Assertion gate:       یک عدد، یک بار تعمیر شد در ۳۸۷
Review rounds:        ۱ از ۲ مصرف شد — حکم CHANGE، سه یافتهٔ واقعی، همه اصلاح شد
Owner answer:         (ب) — فقط هشت view. تابع دست‌نخورده می‌ماند.
Catalogue baseline:   a51ee08e55ff48453d7a2925f1c5d098 / pg_class 1105 / pg_proc 841
Deployed APP_GIT_SHA: e66e3759 — و همین می‌ماند. **این مأموریت build نمی‌زند.**
Not mine:             deploy/lan/docker-compose.yml (کار موازی HTTPS مالک) — لمس نشد
```

---

## فاز ۰ — سنجش. هیچ تغییری.

### ۰.۱ — کلاس نگهبان، مشتق‌شده نه فرض‌شده

```
product_computed_prices_public           owner=supabase_admin  reloptions={security_invoker=true}
publish_recipients_view                  owner=supabase_admin  reloptions=(none)
v_dynamic_customer_capital_balances      owner=supabase_admin  reloptions=(none)
v_dynamic_salesperson_capital_balances   owner=supabase_admin  reloptions=(none)
v_promotion_suggestions                  owner=supabase_admin  reloptions={security_invoker=true}
vw_account_balances                      owner=supabase_admin  reloptions=(none)
vw_customer_receivables                  owner=supabase_admin  reloptions=(none)
vw_supplier_payables                     owner=supabase_admin  reloptions=(none)

count = 8
```

**عدد ۸ درست است. ولی ادعای «هر هشت `SECURITY DEFINER`اند» غلط است** — دو تای اولشان از
مهاجرت ۳۷۰ (اصلاح G-1) `security_invoker=true` دارند. شش‌تا definer‌اند، دوتا invoker.

هر هشت تعریف verbatim گرفته شد. **شکل بیرونی هر هشت یکسان است:**

```sql
   FROM ( … ) src
  WHERE NOT is_viewer_only(uid());
```

`publish_recipients_view` تنها موردی است که شرط دیگری هم دارد
(`p.is_active AND ur.role = ANY(...)`) ولی آن **داخل** زیرپرس‌وجوی `src` است، نه کنار نگهبان.

### ۰.۲ — هر فراخوان `is_viewer_only`، نه فقط view‌ها. **این چیزی است که (الف) در برابر (ب) را تعیین کرد.**

```
is_viewer_only(uuid)   STABLE  SECURITY DEFINER
                       anon=EXECUTE  authenticated=EXECUTE  PUBLIC=false
```

بدنهٔ تابع، verbatim:

```sql
SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = _user_id AND ur.role = 'viewer')
   AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = _user_id AND ur.role <> 'viewer');
```

**فراخوان‌ها:**

| نوع | تعداد | جزئیات |
|---|---|---|
| view | ۸ | همان‌هایی که بالا آمد |
| **سیاست RLS** | **۹۱** | همه یک نام: `viewer_restricted`؛ روی ۹۱ جدول متمایز؛ **همه با پیشوند دقیقاً یکسان** `(NOT is_viewer_only(uid()))`؛ همه `TO {authenticated}`؛ همه `cmd=ALL`؛ همان پیشوند در `WITH CHECK` هم هست |
| تابع | ۱ | `public.search_visible_persons(text,integer,integer,text,text[],text,text[])` — `SECURITY INVOKER` |
| trigger / constraint / default | ۰ | هیچ‌کدام |

**هیچ جدولی نیست که `viewer_restricted` تنها سیاستش باشد** (شمارش: ۰)، پس رد‌کردن uid تهی
در آن ۹۱ سیاست قفل کامل نمی‌ساخت — ولی رفتار را عوض می‌کرد.

**و یک فراخوان به رفتار فعلی وابسته است، که همان دلیل وجود (ب) است:**

```
search_visible_persons:
  IF public.is_viewer_only(auth.uid()) THEN _missing := ARRAY[]::text[]; ELSE …
```

این تابع نگهبان را **مثبت** استفاده می‌کند: کاربر viewer-only فیلترهای «شناسهٔ ناقص» را
اصلاً نمی‌گیرد. امروز با uid تهی نتیجه `false` است و شاخهٔ `ELSE` اجرا می‌شود. تحت (الف)
نتیجه `true` می‌شد و شاخهٔ viewer اجرا می‌شد — **رفتار برعکس می‌شد، و این fail-closed هم
نیست، فقط متفاوت است.**

### ۰.۲ب — انتخاب مالک

سؤال pre-flight با همین عددها پرسیده شد (۸ view + ۹۱ سیاست + ۱ تابع، نه «یک تابع و هشت
view»). **مالک (ب) را انتخاب کرد: فقط هشت view.** تابع دست‌نخورده می‌ماند، پس ۹۱ سیاست و
`search_visible_persons` هیچ تغییری نمی‌کنند.

### ۰.۳ — `pg_stat_statements`

**هشدار روش‌شناختی: M6 در ۲۰۲۶-۰۸-۲۴ `pg_stat_statements_reset()` زد**، پس شمارنده‌ها از
همان تاریخ شروع می‌شوند و **نبودن یک پرس‌وجو هیچ چیزی دربارهٔ گذشته ثابت نمی‌کند.**

```
                                            anon   authenticated
product_computed_prices_public                 0              19
publish_recipients_view                        0               6
v_dynamic_customer_capital_balances            0               6
v_dynamic_salesperson_capital_balances         0               6
v_promotion_suggestions                        0               6
vw_account_balances                            0               6
vw_customer_receivables                        0               0
vw_supplier_payables                           0               0
```

> **آلودگی‌ای که خودم ساختم و ثبتش می‌کنم:** اولین شکل این پرس‌وجو را بدون فیلتر نقش نوشتم و
> «هر هشت view صدا زده شده‌اند» گرفتم — که غلط بود، چون probeهای خودِ من به‌عنوان
> `supabase_admin` در همان جدول نشسته بودند. عدد بالا فقط `anon` و `authenticated` است.

### ۰.۴ — خط پایه‌ای که اصلاح **نباید** تکانش دهد

**اول: چه کسی اصلاً حق SELECT دارد؟**

```
                                          anon   authenticated  service_role  invoker
product_computed_prices_public            false  true           true          true
publish_recipients_view                   false  true           true          default(definer)
v_dynamic_customer_capital_balances       false  true           true          default
v_dynamic_salesperson_capital_balances    false  true           true          default
v_promotion_suggestions                   false  true           true          true
vw_account_balances                       false  true           true          default
vw_customer_receivables                   false  **false**      true          default
vw_supplier_payables                      false  **false**      true          default
```

**`anon` روی هر هشت صفر امتیاز دارد** — مهاجرت ۳۷۰ سرجایش است، G-1 برنگشته.
**و `authenticated` روی دو تای آخر هم SELECT ندارد** — فقط `service_role`. این را سند
مأموریت نگفته بود.

**ردیف‌ها، به تفکیک فراخوان:**

| view | admin | accountant | sales | **uid تهی** |
|---|---|---|---|---|
| `product_computed_prices_public` | ۵۸۸ | ۵۸۸ | ۵۸۸ | **۰** |
| `publish_recipients_view` | ۲۴ | ۲۴ | ۲۴ | **۲۴** ← باز |
| `v_dynamic_customer_capital_balances` | ۱۴ | ۱۴ | ۱۴ | **۱۴** ← باز |
| `v_dynamic_salesperson_capital_balances` | ۲۱۰ | ۲۱۰ | ۲۱۰ | **۲۱۰** ← باز |
| `v_promotion_suggestions` | ۱۹۸۸۰ | ۱۹۸۸۰ | ۱۹۸۸۰ | **۰** |
| `vw_account_balances` | ۱ | ۱ | ۱ | **۱** ← باز |
| `vw_customer_receivables` | رد شد | رد شد | رد شد | رد شد |
| `vw_supplier_payables` | رد شد | رد شد | رد شد | رد شد |

**این جدول معیار پذیرش است.** پاسخ مالک یعنی هر عدد ستون‌های admin/accountant/sales باید
بعد از تغییر مو‌به‌مو همان بماند.

**و دو چیز را رد می‌کند:**

۱. **fail-open روی چهار view زنده است، نه هشت.** دو view دارای `security_invoker` از قبل
   صفر می‌دهند، چون RLS جدول‌های پایه به فراخوان می‌رسد و `has_any_role(NULL,…)` غلط است.
   دو view آخر برای `authenticated` اصلاً قابل SELECT نیستند.

۲. با فراخوانی که هیچ محدودیت جدولی ندارد (مثلاً خودِ `supabase_admin` بدون claim)، همان
   شش view definer این را می‌دهند: ۵۸۸ / ۲۴ / ۱۴ / ۲۱۰ / ۱۹۸۸۰ / ۱ / ۳ / ۱۲۹. یعنی
   **۱۹٬۸۸۰ ردیف `v_promotion_suggestions` به یک فراخوان بی‌هویت** — اگر روزی نقشی با
   SELECT روی آن، uid تهی داشته باشد.

### ۰.۴ب — **کشف ایمنی که شکل مهاجرت را تعیین می‌کند**

سنجیده داخل `BEGIN … ROLLBACK` صریح در خود فایل:

```
BEFORE   product_computed_prices_public   reloptions={security_invoker=true}
CREATE OR REPLACE VIEW …                  (بدون WITH)
AFTER    product_computed_prices_public   reloptions=(none)          ← افتاد
         relacl                            بدون تغییر                 ← حفظ شد
         anon SELECT                       false                      ← حفظ شد
```

**`CREATE OR REPLACE VIEW` مقدار `reloptions` را می‌اندازد.** یعنی یک مهاجرت ساده‌لوحانه
روی `product_computed_prices_public` و `v_promotion_suggestions` **بی‌صدا
`security_invoker=true` مهاجرت ۳۷۰ را برمی‌گرداند** — و R4 نمی‌بیندش، چون امتیاز `anon`
عوض نمی‌شود. مهاجرت باید `WITH (security_invoker = true)` را برای آن دو صریح بنویسد و
دروازه باید `reloptions` را با نام ادعا کند، نه فقط ACL را.

و همان probe تأیید کرد که خود اصلاح کار می‌کند: با
`WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())` تعداد ردیف برای uid تهی از ۵۸۸ به
**۰** رسید. پس از `ROLLBACK`، `reloptions` و `relacl` هر دو دقیقاً به حالت قبل برگشتند.

### ۰.۵ — خط پایهٔ رگرسیون

```
R2   /api/public/products      200، ۱۹۹ محصول، صفر قیمت غیرصفر
R3   public sale-list          404
R4   هشت view به‌عنوان anon      ۸ از ۸ رد            (G-1)
R5   view/sequence تازه         anon هیچ امتیازی نمی‌گیرد  (OG-25)
R6   get_recent_purchase_label 401                   (M3)
R7   rolbypassrls              anon=false authenticated=false  (M9)
R8   /api/healthz              200
R11  digest a51ee08e55ff48453d7a2925f1c5d098  pg_class 1105  pg_proc 841
APP_GIT_SHA                    e66e3759 — و همین می‌ماند
```

R1، R8(UI)، R9، R10، R12 در فاز ۳ گرفته می‌شوند.

**`test.manager` و `test.viewer` هر دو `status=rejected`اند: `NOT TESTABLE`. فعال نشدند.**
(OG-36)

---

## فاز ۱ — فایل بازگشت، پیش از مهاجرت

`docs/verification/386-down.sql` از خروجی `pg_get_viewdef` که در ۰.۱ گرفته شده بود ساخته شد،
نه از یک «اصلِ» فرض‌شده. پیش از اینکه چیزی اعمال شود dry-run شد:

```
 >>>> STATE BEFORE (outside any transaction) | 841 | f
 >>>> STATE AFTER ROLLBACK — must equal STATE BEFORE | 841
```

و جداگانه اثبات شد که خودش دو ریسک خودش را ندارد:

```
AFTER DOWN  security_invoker kept on 2 of 2
AFTER DOWN  anon privileges on the eight = 0
```

بند صریح دارد که **هیچ GRANT و هیچ REVOKE** ندارد، چون سنجش نشان داد
`CREATE OR REPLACE VIEW` مقدار `relacl` را **حفظ** می‌کند — افزودن گرنت همان نقص
بازگشتِ نامتقارن می‌شد که مهاجرت‌های ۳۷۴/۳۷۶/۳۷۷ برایش مستند شده‌اند.

## فاز ۲ — تغییر

`supabase/migrations/20260824210000_386_close_null_uid_on_viewer_guard_views.sql`

هشت `CREATE OR REPLACE VIEW`. predicate بیرونی هر هشت از
`WHERE NOT is_viewer_only(uid())` شد
`WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())`.
دو تای دارای invoker صریح `WITH (security_invoker = true)` را بازنویسی می‌کنند.

**هر هشت عوض شد، نه فقط چهارتای واقعاً باز.** چهار تای دیگر **اتفاقی** بسته‌اند نه
به‌واسطهٔ نگهبان: دوتا چون `security_invoker` اجازه می‌دهد RLS جدول پایه به فراخوان برسد،
دوتا چون `authenticated` اصلاً گرنت ندارد. یک `GRANT` یا یک تغییر OG-28 دوباره بازشان
می‌کند. گذاشتن دو شکلِ متفاوت predicate در یک کلاس نگهبان دقیقاً همان drift‌ی است که ادعای
هشت-نامی برای دیدنش ساخته شده.

## فاز ۳ — پذیرش

| # | نتیجه |
|---|---|
| A1 | uid تهی روی هر هشت view: **صفر ردیف** (یا رد دسترسی). پیش از تغییر: ۲۴ / ۱۴ / ۲۱۰ / ۱ |
| A2 | admin / accountant / sales — **هیچ تفاوتی بین نقش‌ها**؛ جزئیات و دو سلولی که داده‌شان جابه‌جا شد پایین |
| A3 | `anon` روی هر هشت: ۸ از ۸ رد — G-1 برنگشته |
| A4 | دروازه روی پایگاه سالم پاس، بدون ادعای تهی |
| A5 | نُه اختلال، هر نُه گرفته شد |
| A6 | dry-run بازگشت: STATE AFTER = STATE BEFORE؛ و ثابت شد واقعاً معکوس می‌کند (۸ → ۰ → ۸) |
| A7 | `manager` / `viewer`: **NOT TESTABLE — status=rejected**، فعال نشدند |

### A2 — و دو سلولی که تکان خوردند، و چرا مال این مأموریت نیست

| view | admin | accountant | sales | uid تهی |
|---|---|---|---|---|
| `product_computed_prices_public` | ۵۸۸ | ۵۸۸ | ۵۸۸ | ۰ |
| `publish_recipients_view` | **۲۵** | **۲۵** | **۲۵** | ۰ |
| `v_dynamic_customer_capital_balances` | ۱۴ | ۱۴ | ۱۴ | ۰ |
| `v_dynamic_salesperson_capital_balances` | ۲۱۰ | ۲۱۰ | ۲۱۰ | ۰ |
| `v_promotion_suggestions` | ۱۹۸۸۰ | ۱۹۸۸۰ | ۱۹۸۸۰ | ۰ |
| `vw_account_balances` | **۲** | **۲** | **۲** | ۰ |
| `vw_customer_receivables` | رد | رد | رد | رد |
| `vw_supplier_payables` | رد | رد | رد | رد |

خط پایهٔ ۰.۴ برای این دو، ۲۴ و ۱ بود. **هر دو ردیابی شدند تا منبعشان و هیچ‌کدام کار M4
نیست:**

```
bank_accounts:
  «12»          type=bank  created=2026-07-20 07:42
  «صندوق نقدی»  type=cash  created=2026-08-24 14:08   ← مالک، موازی، امروز
publish_recipients_view، بدنه بدون هیچ نگهبانی = 25
```

**استدلال قطعی:** predicate این مأموریت فقط `uid()` را می‌سنجد، پس **نمی‌تواند** تفاوتی
بین سه نقش بسازد. هر سه نقش عدد یکسان می‌بینند، و همان عدد را بدنهٔ view بدون نگهبان هم
می‌دهد. یعنی داده جابه‌جا شده، نه دید. بازبین مستقل هم مستقلاً همین ۲۴→۲۵ را دید و به
یک ردیف تازهٔ `user_roles` ردیابی‌اش کرد.

> **و یک نتیجهٔ جانبی که مالک باید بداند: پیش‌نیاز OG-37 حالا برقرار است.** تا امروز
> `bank_accounts` فقط یک ردیف با `account_type='bank'` داشت و هیچ صندوق نقدی وجود نداشت،
> برای همین شاخهٔ نقدی هر سه نوع سند هرگز سرتاسر آزموده نشده بود. صندوق نقدی امروز ساخته
> شده. این مأموریت روی آن کاری نکرد و R1 را دوباره با شاخهٔ نقدی نرانْد — ولی حالا شدنی است.

### فاز ۳ب — بازبینی مستقل، دور ۱ از ۲ — حکم **CHANGE**

بازبین خودِ تغییر را درست، دقیقاً معکوس‌شدنی و byte-identical با وضعیت زنده تأیید کرد و
هر چهار ادعایی را که سند پیشرفت با سند مأموریت مخالفت کرده بود مستقلاً درست یافت. **نقص در
دروازه بود.**

**F1 (HIGH) — دروازه تنها معیار سخت مالک را اصلاً ادعا نمی‌کرد.**
خواستهٔ مالک دو نیمه داشت: uid تهی بسته شود، و دید کاربر واردشده تکان نخورد. دروازهٔ ۳۸۶
فقط نیمهٔ اول را می‌سنجید. بازتولیدشده **بدون لمس تابع** — یک view با
`… AND false` بازنویسی شد:

```
ADMIN rows on publish_recipients_view after view-only sabotage = 0   (baseline 24)
386 verdict: OK
```

**و اینجا اشتباه خودم را ثبت می‌کنم:** من دیده بودم که `is_viewer_only → SELECT false` از
دروازه رد می‌شود و استدلال کردم تابع خارج از دامنه است. آن استدلال به شکل مشخصی غلط بود:
جهتی را آزمودم که نگهبان را **باز** می‌کند — که واقعاً قلمرو OG-28 است — و هرگز جهتی را که
**می‌بندد** نیازمودم، که دقیقاً معیار پذیرش مالک است. آزمون یک‌طرفه از یک خواستهٔ دوطرفه.

**F2 (MEDIUM)** — بند ۳ یک `ILIKE` روی زیررشته بود، پس
`uid() IS NOT NULL OR NOT is_viewer_only(uid())` متن لازم را دارد و بی‌اثر است. و بند ۲ روی
چهار view از هشت‌تا نمی‌توانست بگیردش — همان چهارتایی که خود مهاجرت برای توجیه تغییر هر
هشت‌تا به نهفته‌بودنشان استناد می‌کند.

**F3 (MEDIUM)** — بند ۴ یک‌طرفه بود: از‌دست‌رفتن `security_invoker` را می‌گرفت،
به‌دست‌آوردنش را نه. `ALTER VIEW vw_account_balances SET (security_invoker = true)` رد
می‌شد — که OG-28 از راه پنهان است و همان‌جا دید کاربر واردشده را عوض می‌کند.

**F4/F5 (LOW)** — مشتق کلاس فقط `relkind='v'` در `public` بود؛ یک matview یا view در
schema دیگر با گرنت `anon` رد می‌شد. و ویژگی‌های امنیتی خود تابع ادعا نمی‌شد.

**F6 (LOW)** — HANDOFF این سند کهنه مانده بود. اصلاح شد.

**F7 (LOW، ارثی)** — ۳۸۳ تا ۳۸۶ در `supabase_migrations.schema_migrations` نیستند. مشکل
سراسری برنامه است نه این مأموریت؛ بازبین اثبات کرد ۳۸۶ idempotent است پس بی‌ضرر.

**F8 (LOW)** — دو نکتهٔ روش‌شناختی که خودم ثبت کرده بودم درست بودند ولی کامل نبودند:
`pg_stat_statements.track = top` یعنی دسترسی از **داخل** یک تابع اصلاً ثبت نمی‌شود، و
`max = 5000` یعنی ورودی‌ها مستقل از هر reset حذف می‌شوند. و سرشماری «چه کسی می‌تواند این
view‌ها را بخواند» **`supabase_read_only_user`** را جا انداخته بود — که روی هر هشت SELECT
سطح‌جدولی دارد و فقط به‌خاطر نداشتن EXECUTE روی تابع نگهبان متوقف می‌شود
(`permission denied for function is_viewer_only`، یکسان پیش و پس از ۳۸۶، پس اثر M4 صفر).

**آنچه بازبین نسنجید و صریح گفت نسنجیده:** R8 (بارگذاری سرد `sales`) — چون نشست ذخیره‌شده
منقضی بود و وارد کردن رمز را انجام نداد. من R8 را جداگانه اجرا کردم: **۵۹ از ۵۹ سبز.**

## فاز ۳ج — تعمیر دروازه: مهاجرت ۳۸۷

**دروازهٔ دوم نیست؛ تعمیر همان دروازه است**، و چون ۳۸۶ اعمال و commit شده و این مخزن
مهاجرت اعمال‌شده را ویرایش نمی‌کند (قاعدهٔ ۶ AGENTS.md)، در فایل تازه می‌آید — همان الگوی
۳۸۲ برای ۳۸۱ و ۳۸۵ برای ۳۸۴. **بندهای ۱، ۳ و ۴ مهاجرت ۳۸۶ بازنشسته می‌شوند؛ بندهای ۲ و ۵
سرجایشان می‌مانند.**

**F1 با شمارش ردیف تعمیر نشد، عمداً.** اصلاح بدیهی این بود که ۵۸۸/۲۴/۱۴/۲۱۰/۱۹۸۸۰/۱ سنجاق
شود، و غلط است: اینها دادهٔ زندهٔ کسب‌وکارند. بازبین ۲۴→۲۵ را وسط بازبینی دید و در همین
تعمیر ۱→۲ هم اتفاق افتاد. سنجاق‌کردنشان این دروازه را به دلایلی می‌شکست که هیچ ربطی به
نگهبان ندارند — همان اشتباهی که سرشماری مهاجرت ۳۸۱ کرد و ۳۸۲ مجبور شد بازنشسته‌اش کند.

آنچه سنجاق شد، **خاصیتی** است که آن عددها شاهدش بودند و به داده وابسته نیست:

```
برای هر کاربر غیر-viewer-only:  guard باید TRUE باشد   (۲۸ کاربر)
برای هر کاربر viewer-only:      guard باید FALSE باشد  (۱ کاربر)
```

هر دو جمعیت ناتهی‌اند، و خودِ ناتهی‌بودن هم ادعا می‌شود.

**F2** با انکر کردن **کل** predicate رندرشده تعمیر شد، نه زیررشته:

```
WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));
```

**F3** با ادعای دوطرفهٔ `security_invoker` — روی دقیقاً آن دو باشد و روی آن شش نباشد.

**F4** با گسترش مشتق کلاس به `relkind IN ('v','m')` و همهٔ schemaها.

**نُه اختلال پیش از اعمال، هر نُه گرفته شد، پایه پاس:**

```
F1a  view-only sabotage: AND false                    → گرفته شد (انکر predicate)
F1b  is_viewer_only → SELECT true                     → گرفته شد (نگهبان تهی‌بودن)
F1c  is_viewer_only → SELECT false                    → گرفته شد (نگهبان تهی‌بودن)
F2a  OR بی‌اثر روی view خواندنی                        → گرفته شد
F2b  OR بی‌اثر روی view غیرقابل‌خواندن (۳۸۶ کور بود)   → گرفته شد
F3   security_invoker روی view ششم                    → گرفته شد
F4a  matview که نگهبان را می‌پذیرد                     → گرفته شد
F4b  view در schema دیگر                              → گرفته شد
```

> **صریح، چون یک خواننده ممکن است گیج شود:** F1b و F1c از راه **نگهبان تهی‌بودن** گرفته
> می‌شوند نه از راه دو ادعای مستقیم. وقتی تابع مقدار ثابت برمی‌گرداند، همهٔ کاربران در یکی
> از دو دسته می‌افتند و دستهٔ دیگر خالی می‌شود، پس ادعای مستقیم روی مجموعهٔ تهی اجرا
> می‌شود و نگهبان است که بلند شکست می‌خورد. گرفتن درست است، ولی از مسیر غیرمستقیم.

**F5 تعمیر نشد و `[U]` ثبت می‌شود.** ادعای ویژگی‌های امنیتی خودِ `is_viewer_only`
(`SECURITY DEFINER`، `search_path`، نداشتن `EXECUTE` برای `PUBLIC`) دربارهٔ شیئی است که این
مأموریت عمداً لمسش نکرده — مالک (ب) را انتخاب کرد. افزودنش یعنی دروازه چیزی را ادعا کند که
مأموریت مالکش نیست. **آنچه حلش می‌کند:** یک تصمیم مالک دربارهٔ اینکه محافظت از خودِ تابع
مال کدام مأموریت است.

## فاز ۳د — رگرسیون

```
R2   200، ۱۹۹ محصول، صفر قیمت غیرصفر        = خط پایه   (OG-29)
R3   404، صفر لیست منتشرشده از ۲۰            = خط پایه
R4   ۸ از ۸ رد                                = خط پایه   G-1 برنگشته
R5   view/sequence تازه: anon هیچ             = خط پایه   OG-25 برنگشته
R6   401 / 42501                              = خط پایه   M3 برنگشته
R7   anon=false authenticated=false           = خط پایه   M9 برنگشته
R8   ۵۹ از ۵۹ spec نگهبان مسیر M6            سبز        M6 برنگشته
R1   سه شاخهٔ ویزارد تا صفحهٔ مرور، صفر ثبت    سبز
R11  a51ee08e55ff48453d7a2925f1c5d098 / 1105 / 841 = خط پایه
R12  مسیرهای خودم تمیز؛ `deploy/lan/docker-compose.yml` مال مالک است و لمس نشد
APP_GIT_SHA  e66e3759 — **هیچ build زده نشد**
```

R11 تکان نخورد با اینکه هشت view دوباره ساخته شدند، چون digest روی `relname:relacl` است و
`CREATE OR REPLACE VIEW` مقدار `relacl` را حفظ می‌کند — همان چیزی که در ۰.۴ب سنجیده شد.

## گام بعدی

R9 و R10، سپس ثبت Owner-Gateها و ارسال.
