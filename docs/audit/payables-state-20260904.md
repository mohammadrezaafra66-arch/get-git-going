# وضعیت واقعی صفحهٔ پرداختنی تأمین‌کنندگان

**اجرا:** ۲۰۲۶-۰۹-۰۳ · نام فایل طبق دستور بریف `20260904`.
**نوع:** کاملاً فقط‌خواندنی. فقط `SELECT` روی `postgres`، خواندن `C:\afrakala`، و
مرور خواندنی از راه مرورگر. هیچ فرمی ثبت نشد، هیچ رکوردی ساخته نشد. تنها فایل
نوشته‌شده همین گزارش. هیچ نام تأمین‌کننده‌ای چاپ نشده.

---

## اثبات حضور — خروجی خام

```
$ hostname
DESKTOP-MT8J1VR

$ docker exec afrakala-lan-db psql -U postgres -d postgres -c "SELECT current_database(), count(*) FROM public.customers;"
 current_database | count
------------------+-------
 postgres         |  1700
(1 row)
```

هر دو مطابق انتظار.

---

## حکم، پیشاپیش

## **WORKS**

پرداختنی مشکل دریافتنی را **ندارد**. سازوکار سررسید وجود دارد، کار می‌کند، و هر ۸
ردیف تاریخ واقعی محاسبه‌شده دارند — **صفر NULL، صفر «نامشخص»**. ادعای «درست است، دست
نزن» تأیید می‌شود.

ولی سه قید دارد که در «تأیید نشده» و «ریسک نهفته» آمده، و مهم‌ترینشان این است که این
حکم از **پایگاه‌داده و کد** گرفته شده، نه از دیدنِ صفحه — چون نتوانستم وارد شوم.

---

## بخش الف — نیمهٔ مرورگر: **ناتمام، و دلیلش**

`http://192.168.170.10:3000/accounting/payables` باز شد. آنچه دیده شد:

```
بدهی تأمین‌کنندگان
دسترسی ندارید. این بخش فقط برای مدیر کل، مدیر، حسابدار است.
```

و در هدر صفحه، برچسب کاربر: **«بدون نقش»**.

کنسول علت را قطعی می‌کند:

```
[error] [auth-diagnostic][session.onAuthStateChange] INITIAL_SESSION
        {hasSession: false, sessionUserId: null, previousUserId: null, ...}
```

**`hasSession: false` — اصلاً نشستی وجود ندارد.** مرورگر ناشناس است.

ورود به سامانه یعنی ثبت فرم با نام کاربری و رمز. بریف صریحاً «submitting any form in
the browser» را ممنوع کرده، و مستقل از آن، من مجاز به وارد کردن رمز نیستم. پس **A1
تا A6 از راه مشاهده قابل پاسخ نیستند** و در «تأیید نشده» آمده‌اند.

آنچه از مرورگر **واقعاً** به‌دست آمد:

### A7 — مسیر و گارد نقش ✅ مشاهده‌شده

عنوان صفحه: **«بدهی تأمین‌کنندگان»**. پیام گارد، عیناً: «دسترسی ندارید. این بخش فقط
برای مدیر کل، مدیر، حسابدار است.»

و از کد، همان سه نقش:

```ts
src/routes/_app.accounting.payables.tsx:50-53
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
```

و RPC هم همان را در سمت سرور تکرار می‌کند:

```sql
get_payables_list:
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
```

**گارد در هر دو لایه هست** — این خودش یافتهٔ مثبتی است.

### A8 — خطاها و درخواست‌های شبکه ✅ مشاهده‌شده

هر ۲۵ درخواست asset با **۲۰۰** برگشتند، از جمله
`_app.accounting.payables-BEJ8h3J0.js` و — مهم — **`AgingBuckets-Kt3t-B15.js`**. یعنی
صفحه واقعاً کامپوننت سطل سنی را بار می‌کند.

هیچ فراخوانی `/rest/v1/rpc/...` انجام نشد، چون گارد پیش از واکشی داده قطع کرد.

خطای تکرارشوندهٔ کنسول، بی‌ربط به این صفحه:

```
[error] WebSocket connection to 'ws://192.168.170.10:8000/realtime/v1/websocket?...' failed
```

سرویس realtime روی این نصب مستقر نیست. (کلید anon در آن URL بود و عمداً بازتولید نشد.)

### A2 و A4 و A6 — از **سورس**، نه از مشاهده

این‌ها را با `file:line` می‌دهم و صریح برچسب می‌زنم که «کدشده» است، نه «دیده‌شده».

**ستون‌ها، به ترتیب** — `src/routes/_app.accounting.payables.tsx:485-495`:

```
تأمین‌کننده · شناسه خرید · تاریخ خرید · سررسید · مدت پرداخت · مبلغ خرید ·
قیمت نقدی · مانده · سطل سنی · وضعیت · عملیات
```

ستون **«سررسید»** و ستون **«مدت پرداخت»** هر دو وجود دارند — همان دو چیزی که در
دریافتنی غایب بود.

**سطل‌های سنی** — پنج تا، `_app.accounting.payables.tsx:66-70`:

```ts
  bucket_current: number;
  bucket_d1_30: number;
  bucket_d31_60: number;
  bucket_d61_90: number;
  bucket_d90_plus: number;
```

دریافتنی «سررسید نشده» و «۱ تا ۳۰ روز» دارد؛ پرداختنی همان دو **به‌علاوهٔ سه سطل
بیشتر** (۳۱–۶۰، ۶۱–۹۰، ۹۰+). یعنی از این نظر **کامل‌تر** از دریافتنی است.

**فیلترها** — از امضای RPC:

```
get_payables_list(p_from_date date, p_to_date date, p_supplier_id uuid,
                  p_due_filter text, p_search text, p_limit int, p_offset int,
                  p_include_paid boolean)
```

بازهٔ تاریخ ✅ · تأمین‌کننده ✅ · جست‌وجو ✅ · صفحه‌بندی ✅ (`limit` بین ۱ و ۲۰۰،
پیش‌فرض ۵۰) · نمایش پرداخت‌شده‌ها ✅ · و ده حالت فیلتر سررسید:

```
'all','overdue','today','tomorrow','future','current','d1_30','d31_60','d61_90','d90_plus'
```

مرتب‌سازی ثابت است: `ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC`.

**دکمهٔ خروجی:** در این فایل پیدا نشد — زیر «تأیید نشده».

---

## بخش ب — نیمهٔ پایگاه‌داده

### B1 — منبع داده

سه فراخوانی، `src/routes/_app.accounting.payables.tsx`:

```
190:      const { data, error } = await supabase.rpc("get_payables_summary", {
213:      const { data, error } = await supabase.rpc("get_payables_list", {
233:      const { data, error } = await supabase.rpc("get_payable_detail", {
```

`get_payables_list` — `STABLE SECURITY DEFINER`, `search_path=public` — از یک view
می‌خواند:

```sql
  FROM public.vw_supplier_payables v
  WHERE (p_include_paid OR v.is_paid = false)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    ...
```

### B2 — سررسید از کجا می‌آید · **این هستهٔ سؤال است**

از `pg_get_viewdef('public.vw_supplier_payables')`، عیناً:

```sql
    pt.days AS payment_term_days,
        CASE
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
            ELSE p.purchase_date
        END AS due_date,
...
   FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id
  WHERE NOT is_viewer_only(auth.uid());
```

**ستون منبع: `purchases.payment_term_id` → `payment_terms.days`، جمع‌شده با
`purchases.purchase_date`.**

این **دقیقاً معادل ساختاری اصلاح دریافتنی** است:

| | دریافتنی (بعد از اصلاح) | پرداختنی (از قبل) |
|---|---|---|
| لنگر تاریخ | `sales_quotes.accepted_at` | `purchases.purchase_date` |
| مدت | `settlement_types.days` | `payment_terms.days` |
| اتصال | نوع تسویهٔ پیش‌فاکتور | `purchases.payment_term_id` |

**پس پرداختنی سازوکار معادل دارد — نه سازوکار متفاوت، نه هیچ.**

پوشش ستون:

```
 purchases_total | with_term | term_null | with_purchase_date | paid
-----------------+-----------+-----------+--------------------+------
               8 |         8 |         0 |                  8 |    2
```

**۸ از ۸ خرید `payment_term_id` دارند. صفر NULL.**

### B3 — پرداختنی ساختاراً چیست

```
        t         | count
------------------+-------
 purchases        |     8      ← منبع اصلی؛ هر ردیف view یک خرید است
 purchase_items   |     8
 payment_vouchers |     2
 payment_terms    |     5
 suppliers        |    16
```

view **فقط** از `purchases` می‌سازد (با `LEFT JOIN` به `suppliers` و
`payment_terms`). `payment_vouchers` در این view نقشی ندارد؛ پرداخت‌شدگی از
`purchases.paid_at` می‌آید:

```sql
    p.paid_at IS NOT NULL AS is_paid,
        CASE WHEN p.paid_at IS NOT NULL THEN 0::numeric
             ELSE COALESCE(p.cash_price, p.total_amount, 0::numeric)
        END AS outstanding_amount,
```

### B4 — آیا مفهوم مدت تسویهٔ تأمین‌کننده وجود دارد؟ **بله**

جدول `payment_terms` وجود دارد، ۵ ردیف، همه فعال:

```
     name     | days | is_active
--------------+------+-----------
 نقدی         |    0 | t
 تسویه 2 روزه |    2 | t
 تسویه 3 روزه |    3 | t
 تسویه 4 روزه |    4 | t
 تسویه 5 روزه |    5 | t
```

مدت **به‌ازای هر خرید** تعیین می‌شود (`purchases.payment_term_id`)، نه یک عدد ثابت روی
تأمین‌کننده. یعنی همان خرید از یک تأمین‌کننده می‌تواند نقدی باشد و خرید بعدی ۵ روزه.

### B5 — چه کسی سررسید را تعیین می‌کند؟ **کارشناس خرید، و اجباری است**

```ts
src/shared/components/PurchaseForm.tsx:62
  payment_term_id: z.string().uuid({ message: "انتخاب زمان تسویه الزامی است" }),
```

`.uuid()` بدون `.optional()` — فرم بدون آن ثبت نمی‌شود. و مسیر نوشتن:

```ts
src/shared/components/PurchaseForm.tsx:264      payment_term_id: values.payment_term_id,
src/hooks/purchase/useCreatePurchase.ts:136       p_payment_term_id: input.payment_term_id,
```

**این دقیقاً دلیل ساختاری تفاوت دو طرف است:** در خرید، انتخاب مدت تسویه از روز اول
اجباری بوده. در فروش نبود، و همان شکاف بعداً باید با `accepted_at` وصله می‌شد.

---

## اعداد واقعی — همان چیزی که A3 و A4 می‌خواستند، از view

چون نتوانستم صفحه را ببینم، همان اعداد را مستقیم از منبعی که صفحه می‌خواند گرفتم.

```
 rows_total | with_due_date | due_date_null | with_term_days
------------+---------------+---------------+----------------
          8 |             8 |             0 |              8
```

**۸ سررسید واقعی، صفر NULL.** در دریافتنی پیش از اصلاح، ۱۴۶ از ۱۵۱ «نامشخص» بود.
اینجا صفر است.

```
 aging_bucket | rows | overdue | paid
--------------+------+---------+------
 current      |    8 |       0 |    2
```

و شش ردیف پرداخت‌نشده‌ای که کاربر می‌دید:

```
 purchase_date |  due_date  | payment_term_days | days_until_due | is_overdue | aging_bucket | outstanding_amount
---------------+------------+-------------------+----------------+------------+--------------+--------------------
 2026-09-03    | 2026-09-03 |                 0 |              0 | f          | current      |           12000000
 2026-09-03    | 2026-09-05 |                 2 |              2 | f          | current      |          140000000
 2026-09-03    | 2026-09-05 |                 2 |              2 | f          | current      |           74000000
 2026-09-03    | 2026-09-05 |                 2 |              2 | f          | current      |         1825000000
 2026-09-03    | 2026-09-06 |                 3 |              3 | f          | current      |          625000000
 2026-09-03    | 2026-09-07 |                 4 |              4 | f          | current      |          270000000
```

هر سررسید واقعاً محاسبه شده: `2026-09-03` به‌علاوهٔ مدت. سازوکار زنده است.

---

## بخش ج — حکم

### **WORKS**

شواهدی که اثباتش می‌کنند:

1. **۸ از ۸ ردیف سررسید دارند، صفر NULL** — در برابر ۱۴۶ از ۱۵۱ «نامشخص» که دریافتنی
   داشت.
2. **۸ از ۸ خرید `payment_term_id` دارند** چون فرم خرید آن را اجباری می‌کند.
3. **سازوکار معادل وجود دارد و زنده است:** `purchase_date + payment_terms.days`.
4. **سطل سنی از دریافتنی کامل‌تر است** — پنج سطل در برابر دو تا.
5. **گارد نقش در هر دو لایه** (route و RPC) برقرار است.

ادعای «درست است، دست نزن» **تأیید می‌شود** — ولی تا امروز هیچ‌کس تأییدش نکرده بود، و
حالا شواهدش هست.

### ریسک نهفته — یک تفاوت که امروز اثر ندارد ولی باید بدانید

اگر روزی `payment_term_id` تهی باشد، view سررسید را **NULL نمی‌کند** — به خودِ تاریخ
خرید سقوط می‌دهد:

```sql
    ELSE p.purchase_date
```

یعنی آن خرید بلافاصله سررسیدشده و به‌زودی «معوق» نشان داده می‌شود، بدون هیچ علامتی که
بگوید مدتش ثبت نشده. **این از حالت دریافتنی بدتر است**، چون دریافتنی «نامشخص» نشان
می‌داد و دیده می‌شد؛ این یکی یک عدد غلطِ باورپذیر می‌دهد.

امروز اثری ندارد (صفر NULL) و تنها چیزی که نگه‌اش داشته، اجباری بودن فیلد در فرم است.
اگر روزی خریدی از مسیر دیگری (import، RPC مستقیم) ساخته شود که آن اعتبارسنجی را رد
کند، این ریسک فعال می‌شود.

---

## دو سؤال پایانی

### آیا نقشهٔ تخصیص روزانه می‌تواند امروز هر دو طرف را بخواند؟

**بله. سمت پرداختنی مانع نیست.** هر دو view سررسید واقعی و `outstanding_amount`
دارند و به تاریخ سطل‌بندی می‌شوند.

### آیا view یا RPC ای هست که هر دو طرف را با هم برگرداند؟

**بله — و نیمه‌ساخته نیست، کار می‌کند: `compute_daily_capital(p_capital_date)`.**

```sql
  FROM public.vw_customer_receivables;     -- total / overdue / due_today / future
  ...
  FROM public.vw_supplier_payables         -- total / overdue / due_today / future
```

اجرای واقعی، با JWT ادمین شبیه‌سازی‌شده داخل `BEGIN … ROLLBACK` (تابع `STABLE` است و
نمی‌تواند بنویسد):

```
capital_date    | 2026-09-03
formula_version | v1
suggested       |  4,538,100,000
recv_total      | 30,850,950,101
recv_overdue    | 24,459,850,101
recv_today      |  4,550,100,000
recv_future     |  1,841,000,000
pay_total       |  2,946,000,000
pay_overdue     |              0
pay_today       |     12,000,000
pay_future      |  2,934,000,000
```

و حساب سر جمع می‌آید: `4,550,100,000 − 12,000,000 = 4,538,100,000` — دقیقاً همان
`suggested`. بقیهٔ جملات فرمول صفرند چون `daily_capital_inputs` صفر ردیف دارد.

**نقشهٔ تخصیص روزانه لایهٔ داده‌اش را از قبل دارد.** آنچه ندارد، ورودی‌های نقدینگی
(`daily_capital_inputs`) و یک صفحه است.

---

## تأیید نشده

1. **A1، A3، A5 و بخشی از A6 مشاهده نشدند.** مرورگر نشست نداشت
   (`hasSession: false`) و ورود ممنوع بود. اعداد معادلشان از view گرفته شد، ولی
   **آنچه واقعاً روی صفحه رندر می‌شود دیده نشد** — از جمله اینکه تاریخ‌ها جلالی نمایش
   داده می‌شوند یا میلادی، و اینکه خلاصهٔ بالای صفحه چه ارقامی نشان می‌دهد.
   **چه چیزی حلش می‌کند:** یک نشست ادمین در مرورگر.
2. **دکمهٔ خروجی (اکسل) پیدا نشد** در فایل صفحه. ممکن است باشد و من با الگوی جست‌وجوی
   خودم ندیده باشم.
3. **سطل‌های سنی روی داده آزموده نشده‌اند.** هر ۸ خرید امروز (۲۰۲۶-۰۹-۰۳) ساخته شده‌اند،
   پس همه `current` اند و هیچ‌کدام معوق نیست. اینکه `d1_30` تا `d90_plus` درست کار
   می‌کنند از منطق view برمی‌آید، نه از مشاهده روی داده.
4. **`get_payables_summary` و `get_payable_detail` باز نشدند.** فقط
   `get_payables_list` و view زیرینش بررسی شد.
5. **حجم داده بسیار کم است — ۸ خرید.** حکم «کار می‌کند» روی این نمونه معتبر است ولی
   فشار واقعی را ندیده.

---

## اگر بخواهید نیمهٔ مرورگر کامل شود

از یک نشست ادمین، همان صفحه را باز کنید و چهار عدد را گزارش کنید: تعداد ردیف، چند تا
سررسید جلالی واقعی نشان می‌دهند، برچسب و شمار هر سطل، و ارقام خلاصهٔ بالای صفحه.
انتظار بر پایهٔ داده: **۶ ردیف پرداخت‌نشده، هر ۶ با سررسید واقعی، هر ۶ در سطل
«سررسید نشده»، و صفر معوق.** اگر چیز دیگری دیدید، تفاوتش با این گزارش خودش یافتهٔ
بعدی است.

---

*هر ادعا با `file:line`، کوئری و خروجی خامش، یا آنچه در مرورگر دیده شد همراه است.
هیچ نوشتنی انجام نشد و هیچ فرمی ثبت نشد.*
