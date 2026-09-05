# آمادگی تخصیص سرمایه و اعتبار مشتریان

**بررسی:** ۲۰۲۶-۰۹-۰۱ · کاملاً فقط‌خواندنی. هیچ INSERT/UPDATE/DELETE، هیچ migration،
هیچ restart، هیچ دستور git. هیچ تنظیم سرمایه‌ای «برای تست» ساخته نشد. تنها فایل
نوشته‌شده همین گزارش.

```
$ hostname
DESKTOP-MT8J1VR
```

---

## ⚠ فرض مأموریت درست نیست — و علت واقعی چیز دیگری است

مأموریت می‌گوید:

> «/accounting/dynamic-capital reports no active capital setting exists ... with zero
> capital allocated every customer's usable credit is zero»

**سرمایه تخصیص یافته است.** روی پایگاه‌داده:

- یک تنظیم سرمایه برای **امروز** وجود دارد: `2026-09-01`، مبلغ **۲٬۰۰۰٬۰۰۰٬۰۰۰**
- تابع خودِ سیستم آن را «فعال» می‌شناسد
- تخصیص امروز **اجرا شده**: ۱۵ ردیف فروشنده، ۹۶ ردیف مشتری
- و همان مشتری‌ای که بررسی کرده بودید — **اصحابی، کد ۱۱۴۰۱۷** — سقف
  **۵۰۶٬۰۲۱٬۰۰۹** دارد

علت واقعی این است: **امتیازها ماهانه‌اند و امروز اول ماه است.** امتیاز شهریور فقط برای
**یک مشتری** ثبت شده، پس فرمول سهم بقیه را صفر حساب می‌کند.

---

## Q1 — جدول‌ها و وضعیتشان

جدول‌ها از کاتالوگ کشف شدند، نه از عنوان صفحه.

| جدول | ردیف | نقش |
|---|---|---|
| `daily_capital_settings` | **13** | تنظیم سرمایهٔ روزانه — ورودی مالک |
| `salesperson_capital_allocations_dynamic` | 183 | خروجی لایهٔ فروشنده |
| `customer_capital_allocations_dynamic` | 886 | خروجی لایهٔ مشتری — سقف نهایی اینجاست |
| `customer_credit_balance` | 93 | اعتبار بلوکه/مصرف‌شده |
| `credit_scoring_rules` | 6 | قواعد امتیاز اعتباری |
| `dynamic_scoring_parameters` | 16 | پارامترهای امتیازدهی (۱۰ تای آن مشتری) |
| `dynamic_parameter_weights` | 16 | وزن هر پارامتر |
| `dynamic_entity_scores` | 1581 | **امتیازهای ماهانه — گلوگاه واقعی** |
| `daily_capital_inputs` | **0** | ورودی‌های نقدینگی (اختیاری، استفاده نمی‌شود) |
| `daily_capital_snapshots` | **0** | عکس‌برداری (استفاده نمی‌شود) |
| `capital_allocation_ledger` | 0 | دفتر مصرف تخصیص |
| `customer_credit_profile` | 0 | مانده/تسویه — صفر یعنی بدهی صفر، مانع نیست |
| `credit_score_snapshots` | 0 | — |
| `credit_requests` | 0 | — |

### `daily_capital_settings` — ستون‌ها

```
 pos |  column_name  |   data_type   | nullable |     default
-----+---------------+---------------+----------+-------------------
   1 | id            | uuid          | NO       | gen_random_uuid()
   2 | capital_date  | date          | NO       | -
   3 | total_capital | numeric       | NO       | -
   4 | scoring_mode  | text          | NO       | 'manual'
   5 | notes         | text          | YES      | -
   6 | created_by    | uuid          | YES      | -
   7 | created_at    | timestamptz   | NO       | now()
   8 | updated_at    | timestamptz   | NO       | now()
```

**هیچ ستون `is_active` ندارد.** «فعال بودن» صرفاً یعنی جدیدترین ردیفی که
`capital_date <= CURRENT_DATE` باشد.

### ۱۳ تنظیم موجود

```
 capital_date | total_capital | scoring_mode
--------------+---------------+--------------
 2026-09-01   |    2000000000 | auto      ← امروز
 2026-08-31   |    2000000000 | auto
 2026-08-27   |    2000000000 | auto
 2026-08-25   |    2000000000 | auto
 2026-08-24   |    2000000000 | auto
 2026-08-23   |    2000000000 | auto
 2026-08-22   |    2000000000 | auto
 2026-08-20   |    2000000000 | auto
 2026-08-19   |    2000000000 | auto
 2026-08-18   |    2000000000 | auto
 2026-08-17   |    2000000000 | auto
 2026-08-15   |    5000000000 | auto
 2026-08-11   |    9000000000 | auto
```

---

## Q2 — زنجیره، به زبان ساده

### تابعی که «تنظیم فعال» را تعریف می‌کند

```sql
CREATE OR REPLACE FUNCTION public._latest_active_capital_setting()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT id FROM public.daily_capital_settings
   WHERE capital_date <= CURRENT_DATE
   ORDER BY capital_date DESC, created_at DESC
   LIMIT 1
$function$
```

اجرای واقعی همین حالا:

```
          active_setting_id           |  its_date  | its_capital |   today
--------------------------------------+------------+-------------+------------
 30e881c9-f676-4289-8fb8-dcbcc7bb1425 | 2026-09-01 |  2000000000 | 2026-09-01
```

**تنظیم فعال وجود دارد.**

### زنجیرهٔ کامل — `run_daily_capital_allocation(p_capital_date, p_total_capital, p_notes)`

از بدنهٔ تابع، خط به خط:

**گام ۱ — لایهٔ فروشنده.** برای هر کاربر با نقش `sales`:

```
line 48-52:  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
             SELECT ..., COALESCE((public.calculate_dynamic_score('salesperson', ur.user_id, p_capital_date)
                                   ->> 'weighted_score')::numeric, 0)
             FROM public.user_roles ur WHERE ur.role = 'sales'
line 58-64:  IF v_sum_sp_score > 0 THEN
               share_ratio = weighted_score / v_sum_sp_score
               raw_amount  = share_ratio * p_total_capital
```

کل سرمایه به‌نسبت امتیاز بین فروشنده‌ها تقسیم می‌شود.

**گام ۲ — لایهٔ مشتری.** برای هر فروشنده‌ای که سرمایه گرفته:

```
line 116:    WHERE allocated_capital > 0
line 120-125: INSERT INTO _sp_cust(customer_id, weighted_score)
              SELECT ..., COALESCE((public.calculate_dynamic_score('customer', c.id, p_capital_date)
                                    ->> 'weighted_score')::numeric, 0)
              FROM public.customers c
              WHERE c.responsible_id = v_sp.salesperson_id
                AND COALESCE(c.is_active, true) = true
line 129-133: IF v_sum_cust_score > 0 THEN
                floor_amount = (weighted_score / v_sum_cust_score) * v_sp.allocated_capital
```

سهم هر فروشنده بین **مشتریان خودش** (`responsible_id`) به‌نسبت امتیاز تقسیم می‌شود و
در `customer_capital_allocations_dynamic.final_limit` می‌نشیند.

**گام ۳ — آنچه به مشتری می‌رسد.** `get_customer_dynamic_credit(p_customer_id)`:

```sql
  SELECT a.final_limit, s.capital_date, a.binding_constraint ...
  FROM public.customer_capital_allocations_dynamic a
  JOIN public.daily_capital_settings s ON s.id = a.capital_setting_id
  WHERE a.customer_person_id = _person_id
  ORDER BY s.capital_date DESC, a.created_at DESC LIMIT 1;
...
  GREATEST(v_final_limit - COALESCE(v_outstanding,0) - COALESCE(v_held,0), 0) AS available_credit
```

**تابعی که باید اجرا شود تا اعداد ظاهر شوند:** `run_daily_capital_allocation` — یا
`recompute_dynamic_capital_setting` که تریگر خودکار صدایش می‌زند (بخش Q5).

### زنجیره در یک خط

> مالک **مبلغ کل** را وارد می‌کند → بین فروشنده‌ها به‌نسبت **امتیاز ماهانهٔ فروشنده**
> تقسیم می‌شود → سهم هر فروشنده بین **مشتریان خودش** به‌نسبت **امتیاز ماهانهٔ مشتری**
> تقسیم می‌شود → عدد نهایی سقف اعتبار مشتری می‌شود.

**هر جای این زنجیره امتیازِ ماهِ جاری نباشد، سهم صفر می‌شود.**

---

## علت ریشه‌ای — چرا امروز همه صفرند

### مقایسهٔ دیروز و امروز

```
=== customer allocations ===
 capital_date | rows | positive | zero
--------------+------+----------+------
 2026-09-01   |   96 |        1 |   95      ← امروز
 2026-08-31   |   78 |       78 |    0      ← دیروز
```

دیروز **هر ۷۸ مشتری** سقف مثبت داشتند. امروز از ۹۶ نفر فقط **یکی**.

### چرا — امتیازها ماهانه‌اند

```sql
SELECT period_month, entity_type, count(*) AS rows, count(DISTINCT entity_id) AS entities
  FROM public.dynamic_entity_scores GROUP BY 1,2 ORDER BY 1 DESC;
```

```
 period_month | entity_type | rows | entities
--------------+-------------+------+----------
 2026-09-01   | customer    |    8 |        1     ← ماه جاری
 2026-09-01   | salesperson |   24 |        4
 2026-08-01   | customer    | 1519 |      398     ← ماه گذشته
 2026-08-01   | salesperson |   30 |        5
```

`calculate_dynamic_score('customer', id, p_capital_date)` امتیاز را برای **ماهِ همان
تاریخ** می‌خواند. امروز ۲۰۲۶-۰۹-۰۱ است — روز اول یک ماه تازه. مرداد ۳۹۸ مشتری امتیاز
داشتند؛ شهریور **یک نفر**.

### و آن یک نفر دقیقاً مشتری شماست

```
              entity_id               |  name  | accounting_code |         scored_at          | manually_scored
--------------------------------------+--------+-----------------+----------------------------+-----------------
 bd16ccb0-19ab-4d4b-843f-92fb649c415f | اصحابی | 114017          | 2026-09-01 09:15:40.583+00 | t
```

و سقفش:

```
 capital_date | weighted_score | share_ratio | raw_allocation | final_limit | binding_constraint
--------------+----------------+-------------+----------------+-------------+--------------------
 2026-09-01   |       0.320611 |     1.00000 |      506021009 |   506021009 | formula
 2026-08-31   |       0.746600 |     0.07232 |       11736620 |    11736620 | formula
```

امروز `share_ratio = 1.0` گرفته چون تنها مشتری امتیازدارِ فروشنده‌اش است — دیروز
۰.۰۷ بود. یعنی کل سهم آن فروشنده به یک نفر رسیده.

**این دقیقاً توضیح می‌دهد چرا شما این مشتری را «سالم» دیدید و بقیه را صفر.**

### مسیر پایگاه‌داده کاملاً سالم است

با JWT شبیه‌سازی‌شدهٔ ادمین، همان خواندنی که صفحه انجام می‌دهد:

```
 as admin, settings visible |        13
 latest active setting      | t
 allocations visible today  |    96
 اصحابی final_limit         |   506021009
```

RLS مانع نیست، تخصیص هست، `customer_person_id` در هر ۸۸۶ ردیف پر است و با
`customers.person_id` می‌خواند.

> **یک فرضیه که آزمودم و غلط بود:** حدس زدم شاید `customer_person_id` در جدول تخصیص
> خالی باشد و به همین دلیل تابع چیزی پیدا نکند. غلط بود — ۸۸۶ از ۸۸۶ پر است.

---

## Q3 — مالک دقیقاً چه چیزی وارد می‌کند

برای ساخت یک تنظیم سرمایه فقط **دو چیز** لازم است:

| فیلد | اجباری | معنی |
|---|---|---|
| `capital_date` | **بله** | روزی که این سرمایه برایش است. برای اثر فوری = امروز |
| `total_capital` | **بله** | کل مبلغی که به اعتبار مشتریان اختصاص می‌دهید (ریال) |
| `scoring_mode` | پیش‌فرض `manual` | همهٔ ۱۳ ردیف موجود `auto` اند |
| `notes` | اختیاری | یادداشت |

### مثال عملی

اگر می‌خواهید امروز **۲ میلیارد ریال** به اعتبار مشتریان اختصاص دهید:

```
capital_date  = 2026-09-01
total_capital = 2000000000
```

**و دقیقاً همین امروز ساعت ۰۹:۰۴ وارد شده است.** پس این گام از قبل انجام شده و
نیازی به تکرار ندارد.

`daily_capital_inputs` (موجودی بانک، چک‌های در راه، ذخیرهٔ ریسک و…) صفر ردیف دارد و
در این زنجیره خوانده نمی‌شود — برای محاسبهٔ سقف لازم نیست.

---

## Q4 — مسیر ورود

| صفحه | مسیر | نقش‌های مجاز | کار |
|---|---|---|---|
| سرمایهٔ پویا | **`/accounting/dynamic-capital`** | `["admin", "accountant"]` | تنظیم سرمایه |
| امتیازدهی | **`/accounting/salesperson-scoring"`** | `["admin", "accountant"]` | ثبت امتیاز |
| تخصیص مشتریان | `/accounting/customer-capital-allocations` | — | نمایش |
| تخصیص فروشنده‌ها | `/accounting/salesperson-capital-allocations` | — | نمایش |
| سرمایهٔ روزانه | `/accounting/daily-capital` | — | ورودی‌های نقدینگی (استفاده نمی‌شود) |

صفحهٔ `dynamic-capital` مستقیم از جدول می‌خواند
(`_app.accounting.dynamic-capital.tsx:125` → `.from("daily_capital_settings")`)، نه
از RPC. RLS آن برای admin/manager/accountant باز است و در آزمون شبیه‌سازی‌شده هر ۱۳
ردیف دیده شد.

نوشتن امتیاز از `src/hooks/credit/useDynamicScoring.ts` انجام می‌شود.

هیچ‌کدام از این صفحه‌ها `adminOnly` یا پنهان‌از‌منو نیستند، ولی هر دو صفحهٔ کلیدی به
`ROLE_ALLOWLIST` محدودند: فقط **admin و accountant**.

---

## Q5 — خودکار است یا دستی؟ **هر دو**

### تخصیص خودکار است — با تریگر

```
 tgname                                     | on_table              | tgenabled
--------------------------------------------+-----------------------+-----------
 trg_refresh_dyn_capital_after_score_change  | dynamic_entity_scores | O
   AFTER INSERT OR DELETE OR UPDATE ... EXECUTE FUNCTION
   refresh_today_dynamic_capital_after_score_change()
```

بدنه‌اش:

```sql
  v_period date := date_trunc('month', CURRENT_DATE)::date;
  v_score_period date := COALESCE(NEW.period_month, OLD.period_month);
  IF v_score_period <> v_period THEN RETURN ...; END IF;       -- فقط ماه جاری

  SELECT id INTO v_setting_id FROM public.daily_capital_settings
   WHERE capital_date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1;
  IF v_setting_id IS NULL THEN RETURN ...; END IF;             -- بدون تنظیم امروز، کاری نمی‌کند

  PERFORM public.recompute_dynamic_capital_setting(v_setting_id, ...);
```

**یعنی: هر بار امتیازِ ماه جاری ثبت شود، تخصیص خودش دوباره اجرا می‌شود** — به‌شرطی که
تنظیم سرمایه‌ای با `capital_date = امروز` وجود داشته باشد. امروز دارد.

شواهدش در داده هست: هر ۳۲ امتیاز شهریور بین ۰۹:۰۸ تا ۰۹:۲۰ ثبت شده و تخصیص امروز
همان لحظه‌ها بازمحاسبه شده.

### ولی امتیاز دادن دستی است

```
 entity_type | count | has_scorer |           first            |            last
-------------+-------+------------+----------------------------+----------------------------
 customer    |     8 |          8 | 2026-09-01 09:12:18.303+00 | 2026-09-01 09:15:40.583+00
 salesperson |    24 |         24 | 2026-09-01 09:08:41.267+00 | 2026-09-01 09:20:43.933+00
```

**هر ۳۲ ردیف `scored_by` دارند** — همه دستی وارد شده‌اند، هیچ‌کدام از کار زمان‌بندی‌شده.

### pg_cron هیچ کار تخصیص سرمایه‌ای ندارد

```
 jobid |  schedule   | command                                          | active
     9 | 0 6 * * *   | SELECT public.generate_birthday_notifications(); | t
    10 | */5 * * * * | SELECT public.recompute_all_employee_scores();   | t
    11 | */5 * * * * | SELECT public.capture_score_snapshots();         | t
    12 | 0 2 * * *   | SELECT public.cleanup_stale_auto_suppliers();    | t
```

کارهای ۱۰ و ۱۱ جدول `employee_scores` را به‌روز می‌کنند (۵ ردیف، همه مثبت، آخرین
به‌روزرسانی ۰۹:۵۰ امروز) — که جدول **متفاوتی** از `dynamic_entity_scores` است. هیچ
کاری `run_daily_capital_allocation` را صدا نمی‌زند.

**پس:** ساخت تنظیم سرمایهٔ روزانه دستی است، ثبت امتیاز ماهانه دستی است، ولی تخصیص
پس از آن‌ها خودکار است.

---

## Q6 — لایهٔ فروشنده

**لایهٔ فروشنده سالم است و مشکلی ندارد:**

```
 capital_date | rows | positive | zero | min_score | max_score |   total
--------------+------+----------+------+-----------+-----------+------------
 2026-09-01   |   15 |        4 |   11 |    0.0000 |    0.8851 | 2000000000
 2026-08-31   |   15 |        5 |   10 |    0.0000 |    0.5285 | 2000000000
```

هر دو روز **کل ۲ میلیارد** تقسیم شده. امروز ۴ فروشنده امتیاز شهریور دارند (دیروز ۵).

پس لایهٔ فروشنده هم امتیاز ماهانه می‌خواهد، ولی چون تعدادشان کم است (۱۵ نفر) و ۴ نفر
از قبل امتیاز گرفته‌اند، گلوگاه اصلی نیست. **گلوگاه، لایهٔ مشتری است.**

---

## یک شکاف ساختاری جدا — ۶۴۰ مشتری هرگز سقف نمی‌گیرند

```
               step               | count
----------------------------------+-------
 customers total                  |   769
 has person_id                    |   769
 has responsible_id (salesperson) |   129     ← گلوگاه ساختاری
 is_active                        |   769
 got an allocation today          |    96
```

تخصیص فقط به مشتریانی می‌رسد که `responsible_id` دارند (خط ۱۲۴ تابع). **۶۴۰ مشتری
از ۷۶۹ فروشندهٔ مسئول ندارند** و هر چقدر هم امتیاز بدهید، سهمی نمی‌گیرند.

وضعیت فعلی سقف‌ها:

```
 customers_total | with_positive_ceiling | never_allocated | no_salesperson
-----------------+-----------------------+-----------------+----------------
             769 |                    14 |             660 |            640
```

---

## تأیید نشده

1. **هیچ صفحه‌ای در مرورگر باز نشد.** مسیرها و دسترسی‌ها از رجیستری و فایل‌های route
   خوانده شد. اینکه صفحهٔ `/accounting/dynamic-capital` واقعاً چه پیامی نشان می‌دهد
   تأیید نشد؛ داده‌ای که باید بخواند موجود است.
2. **`get_customer_dynamic_credit` اجرا نشد** — تابع `VOLATILE` است و در مأموریت
   فقط‌خواندنی صدایش نزدم. منطقش از بدنه خوانده شد و جست‌وجویش را دستی بازتولید کردم.
3. **`calculate_dynamic_score` باز نشد.** فقط ورودی‌اش (`dynamic_entity_scores`
   per-month) و رفتار مشاهده‌شده‌اش بررسی شد. اینکه دقیقاً چطور از پارامترها امتیاز
   می‌سازد نامعلوم است.
4. **مقدار عددی امتیازها.** اینکه برای هر مشتری چه عددی «درست» است تصمیم کسب‌وکاری
   است، نه چیزی که از داده دربیاید.
5. **تخمین زمان‌های چک‌لیست** حدسی‌اند.

---

## حل‌نشده

1. **هیچ سازوکار انتقال امتیاز از ماه قبل وجود ندارد.** فهرست کامل توابع بررسی شد؛
   هیچ تابع copy/carry-forward ای نیست. یعنی **هر اول ماه** این کار دستی تکرار می‌شود.
   مرداد ۳۹۸ مشتری امتیاز گرفتند (۱۵۱۹ ردیف)؛ برای رسیدن به همان پوشش در شهریور باید
   دوباره وارد شوند.
2. **۶۴۰ مشتری بدون فروشندهٔ مسئول.**
3. **هیچ هشداری برای «اول ماه شد و امتیازها خالی است» وجود ندارد.** سیستم بی‌صدا سقف
   همه را صفر می‌کند.

---

## برای فعال شدن اعتبار مشتریان چه باید کرد

### آنچه لازم **نیست**

**تنظیم سرمایه نسازید.** برای امروز (`2026-09-01`) با مبلغ ۲ میلیارد از قبل ساخته
شده و سیستم آن را فعال می‌شناسد. ساختن دوباره کاری نمی‌کند.

### گام ۱ — امتیاز شهریور فروشنده‌ها را کامل کنید ‹۱۵ فروشنده، حدود ۱۵ دقیقه›

**کجا:** `/accounting/salesperson-scoring` (فقط admin و accountant)

الان ۴ نفر از ۱۵ امتیاز شهریور دارند. ۱۱ نفر باقی‌مانده تا وقتی امتیاز نگیرند،
سرمایه‌ای نمی‌گیرند و مشتریانشان هم هیچ.

### گام ۲ — امتیاز شهریور مشتریان را وارد کنید ‹گلوگاه اصلی›

**کجا:** همان صفحهٔ امتیازدهی

الان **۱ مشتری از ۷۶۹** امتیاز شهریور دارد. مرداد ۳۹۸ نفر داشتند.

**ولی همهٔ ۳۹۸ نفر لازم نیست.** تخصیص فقط به مشتریانِ دارای فروشندهٔ مسئول می‌رسد، و
آن‌ها **۱۲۹ نفر**اند. پس سقف کار شما ۱۲۹ نفر است، نه ۷۶۹ و نه ۳۹۸.

اگر می‌خواهید فوری نتیجه ببینید، از مشتریان همان ۴ فروشنده‌ای شروع کنید که امتیاز
شهریور دارند — سرمایه همین حالا دستشان است.

### گام ۳ — هیچ کاری اجرا نکنید ‹خودکار›

تریگر `trg_refresh_dyn_capital_after_score_change` با هر ثبت امتیازِ ماه جاری، تخصیص
را خودش دوباره اجرا می‌کند. لازم نیست دکمه‌ای بزنید یا تابعی صدا کنید.

### گام ۴ — راستی‌آزمایی که سقف‌ها واقعاً ظاهر شدند

روی صفحهٔ `/accounting/customer-capital-allocations` تعداد ردیف‌های با سقف مثبت را
ببینید. یا از دید پایگاه‌داده، این عدد باید از ۱۴ بالا برود:

> «چند مشتری سقف مثبت دارند» — الان ۱۴ نفر از ۷۶۹.

اگر امتیاز دادید و عددی تغییر نکرد، دو چیز را چک کنید: امتیاز برای **ماه جاری** ثبت
شده باشد (نه ماه قبل)، و آن مشتری **فروشندهٔ مسئول** داشته باشد.

### گام ۵ — تصمیم برای ۶۴۰ مشتری بدون فروشنده

اگر قرار است این‌ها هم اعتبار بگیرند، اول باید `responsible_id` بگیرند. این خارج از
صفحهٔ امتیازدهی است و کار جداگانه‌ای است.

### و یک هشدار برای ماه بعد

**اول هر ماه این وضعیت تکرار می‌شود.** هیچ انتقال خودکاری بین ماه‌ها وجود ندارد و
هیچ هشداری هم داده نمی‌شود — سقف همه بی‌صدا صفر می‌شود تا وقتی امتیاز ماه جدید وارد
شود. اگر می‌خواهید این تکرار نشود، یا باید یک سازوکار انتقال ساخته شود یا یادآوری
اول ماه گذاشته شود.

---

*هر ادعا با کوئری یا `file:line` و خروجی خامش همراه است. هیچ نوشتنی روی پایگاه‌داده
انجام نشد.*
