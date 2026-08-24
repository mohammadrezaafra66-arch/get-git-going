# M4 — OG-26 + OG-28 · هشت view کلاس نگهبان `is_viewer_only` — PROGRESS

## HANDOFF STATE

```
Mission:              M4 — OG-26 (بستن fail-open برای uid تهی). OG-28 باز می‌ماند.
Status:               فاز ۰ کامل
Branch:               feature/m4-viewer-guard
Base:                 staging @ 5a828df9  (تأیید شد: git rev-parse origin/staging)
Migration reserved:   386  (تأیید شد: بالاترین روی دیسک ۳۸۵ است)
Assertion gate:       یک عدد
Review rounds:        حداکثر ۲
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

## گام بعدی

فاز ۱ — فایل بازگشت ۳۸۶ پیش از خود مهاجرت.
