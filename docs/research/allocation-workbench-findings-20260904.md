# پخش حساب ۴۰۵ — ممیزی خواندنیِ آنچه از پیش ساخته شده

اندازه‌گیری ۲۰۲۶-۰۹-۰۴ · میزبان `VIRA-SERVICE` (سرور تست، `192.168.170.8`) · شاخه `staging` @ `c816eea4`
· پایگاه‌داده `afrakala` روی `afrakala-lan-db` · **به `192.168.170.10` (سامانهٔ اصلی) وصل نشدم.**

**فقط خواندنی، دو بار تضمین‌شده:** هر پرس‌وجو با `PGOPTIONS="-c default_transaction_read_only=on"`
اجرا شد — موتور خودش `INSERT/UPDATE/DDL` را رد می‌کند — و هیچ فایلی جز همین سند نوشته نشد.
هیچ نام، تلفن، آدرس، کد ملی یا ایمیلی در این سند نیست؛ فقط شمارش.

## دو پاسخ یک‌خطی که مأموریت خواسته بود

۱. **آیا نقشهٔ پخش روزانه می‌تواند امروز هر دو طرف را از منابع موجود بخواند؟**
   **بله.** `vw_customer_receivables` (۸ ردیف، ۷ با سررسید واقعی) و `vw_supplier_payables`
   (۳۰۳ ردیف، **صفر سررسید خالی**) هر دو زنده‌اند و هر دو سررسید ترم‌محور می‌دهند.
۲. **آیا هیچ view یا RPC ای همین حالا هر دو طرف را با هم برمی‌گرداند؟**
   **بله — `compute_daily_capital(date)`**، که همان دو view را در یک تابع می‌خواند و
   total/overdue/due_today/future هر دو طرف را برمی‌گرداند. **و هیچ‌جای برنامه آن را صدا نمی‌زند.**

## خلاصهٔ اجرایی

- **بزرگ‌ترین یافته یک «نبودن» نیست، یک موتورِ ساخته‌شده و وصل‌نشده است.** `compute_daily_capital`
  یک محاسبه‌گر کاملِ وضعیت نقدی روزانه است که مطالبات و پرداختنیِ زنده را می‌خواند؛ **صفر
  فراخواننده** در کل `src/` و `server/`. صفحهٔ زندهٔ سرمایهٔ پویا به‌جای آن، عدد سرمایهٔ روز را
  **دستی تایپ** می‌گیرد.
- **۱۱ تابع پایگاه‌داده در این دامنه هیچ فراخوانندهٔ برنامه‌ای ندارند** — از جمله دروازهٔ آمادهٔ
  «مشتری معوق فاکتور نگیرد»، با متن فارسی نوشته‌شده.
- **ادعای «پرداختنی سررسید ندارد» رد شد:** ۳۰۳ از ۳۰۳ ردیف سررسید دارند. اما مکانیزمش با مطالبات
  فرق دارد و یک بازگشتِ خاموش به `purchase_date` در خود دارد.
- **`call_logs` واقعاً وجود دارد و کاملاً بی‌مصرف است** — ۰ ردیف، ۰ نویسنده، ۰ خواننده.
- **ردیف تخصیص («بدهکار X به بستانکار Y») وجود ندارد**؛ نزدیک‌ترین چیز `dual_documents` است که
  گذشته‌نگر است، نه برنامه.

### شمارش آرا برای C1..C16

| verdict | ادعاها | تعداد |
|---|---|---|
| exists-works | C1، C11، C13، C14، C16 | ۵ |
| exists-partial | C2، C5، C6، C8، C10، C12 | ۶ |
| absent | C3، C4، C7، C15 | ۴ |
| not-connected | C9 | ۱ |
| exists-broken | — | ۰ |
| UNVERIFIED | — | ۰ |

جمع: ۵ + ۶ + ۴ + ۱ = **۱۶ از ۱۶**.

---

## F1..Fn — یافته‌ها

### F1 · C1 · exists-works
**ادعا:** «صفحهٔ مطالبات سررسید را از `accepted_at + settlement_types.days` نشان می‌دهد — ساخته‌شده و کار می‌کند.»

**وضعیت واقعی:** تأیید شد. مسیر `src/routes/_app.accounting.receivables.tsx` دقیقاً سه فراخوانی داده
دارد و هر سه RPC اند: `get_receivables_summary` (:242)، `get_receivables_list` (:257)،
`get_receivable_detail` (:276). RPC فهرست از `public.vw_customer_receivables` می‌خواند و آن view
سررسید را با سه حالت NULL صریح می‌سازد. دادهٔ زنده: **۸ ردیف، ۷ سررسید واقعی، ۱ NULL با دلیل
`inactive_zero_days`، ۷ معوق.**

**شواهد:** `pg_get_viewdef('public.vw_customer_receivables')` سطرهای ۴۷–۵۲:

```
CASE
    WHEN q.accepted_at IS NULL THEN NULL::date
    WHEN st.id IS NULL THEN NULL::date
    WHEN st.is_active = false AND st.days = 0 THEN NULL::date
    ELSE (q.accepted_at + ((st.days || ' days'::text)::interval))::date
END AS due_date
```

`get_receivables_list` سطر ۳۰: `FROM public.vw_customer_receivables v`.
ردیف دفتر مهاجرت `20260831210000` (مهاجرت ۴۱۹) موجود است — بین DB و git واگرایی نیست.

**پیامد ساخت:** طرف مطالبات پایهٔ قابل‌اتکاست؛ روی همین view بساز، نه روی چیز تازه.

### F2 · C2 · exists-partial
**ادعا:** «تلفن مشتری از فهرست مطالبات در دسترس است — ادعای نبودن.»

**وضعیت واقعی:** در **فهرست** نیست، فقط در **کشوی جزئیات**، یک کلیک آن‌طرف‌تر.
`get_receivables_list` بیست ستون برمی‌گرداند و هیچ‌کدام تلفن نیست؛ `vw_customer_receivables` هم
ستون تلفن ندارد. تلفن **جست‌وجوپذیر هم نیست**: بند جست‌وجوی RPC فقط `customer_name` و
`invoice_number` را می‌گیرد.

**شواهد:** بند جست‌وجو، `get_receivables_list` سطرهای ۴۳–۴۷:
`OR v.customer_name ILIKE '%'||v_search||'%' OR v.invoice_number ILIKE '%'||v_search||'%'`.
سمت جزئیات: `get_receivable_detail` سطر ۱۸ — `COALESCE(c.phone, q.customer_phone) AS customer_phone`،
که فقط در `src/routes/_app.accounting.receivables.tsx:696-701` رندر می‌شود.

**پیامد ساخت:** کسی که تماس وصول می‌گیرد نمی‌تواند با فهرست کار کند. افزودن تلفن **افزودن ستون** است
نه join تازه — `LEFT JOIN customers c` از پیش در سطر ۷۰ همان view هست.

### F3 · C3 · absent
**ادعا:** «فروشندهٔ مالکِ پیش‌فاکتور آن‌جا نشان داده می‌شود — ادعای نبودن.»

**وضعیت واقعی:** در هیچ‌کدام از صفحه، RPC و view نیست. اما داده یک ستون آن‌طرف‌تر است:
`sales_quotes.salesperson_id` روی **۹ از ۹** پیش‌فاکتور پذیرفته‌شده پر است و view از همان جدول
(`FROM sales_quotes q`) می‌خواند. روی ۸ ردیف زنده، **۲ فروشندهٔ متمایز**.

**شواهد:** `grep -n -i -E "salesperson|فروشنده|seller" src/routes/_app.accounting.receivables.tsx`
→ بدون تطبیق. ستون‌های بیرونی view (۲۲ ستون) هیچ salesperson ندارند.

**پیامد ساخت:** ارزان، و پیش‌نیاز گروه‌بندیِ F7.

### F4 · C4 · absent
**ادعا:** «سقف اعتبار مشتری آن‌جا نشان داده می‌شود — ادعای نبودن.»

**وضعیت واقعی:** نه در صفحه، نه در view، نه در هیچ‌یک از سه RPC. دادهٔ سقف جای دیگری زنده است:
`customer_capital_allocations_dynamic` = **۳۵ ردیف**، و `v_dynamic_customer_capital_balances`
مقادیر `final_limit / held_amount / consumed_amount / remaining_amount / binding_constraint` را
به‌ازای `customer_id` می‌دهد. از ۳ مشتری متمایزِ فهرست مطالبات، **۲ تا** چنین تخصیصی دارند.
هشدار: `customer_credit_profile.credit_limit` وجود دارد ولی آن جدول **صفر ردیف** دارد — بدیلِ مرده
است (F20)، رویش نساز.

**پیامد ساخت:** یک join روی `customer_id` به `v_dynamic_customer_capital_balances`. همان view
`salesperson_id` هم دارد، پس F3 و F4 با یک join می‌آیند. ستون باید «سقفی ثبت نشده» را صادقانه نشان
دهد، نه صفر — چون ۱ از ۳ مشتری هیچ تخصیصی ندارد.

### F5 · C5 · exists-partial
**ادعا:** «روزهای گذشته از سررسید هیچ‌جا محاسبه نمی‌شود.»

**وضعیت واقعی:** محاسبه می‌شود، اما به‌صورت `days_until_due` **علامت‌دار**، و رابط کاربری دقیقاً در
حالت معوق آن را **پنهان می‌کند**. view آن را `due_date - tehran_today()` می‌سازد؛ روی ردیف‌های معوقِ
زنده بازه‌اش **۲- تا ۴۲-** است. صفحه فقط وقتی عدد را چاپ می‌کند که ردیف معوق **نباشد**؛ ردیف معوق
فقط نشانِ «معوق» می‌گیرد و هیچ عددی نمی‌گیرد. هیچ ستون، تابع یا view ای به نام
`days_past_due`/`days_overdue`/`past_due` وجود ندارد — هر سه جست‌وجو صفر برگشتند.

**شواهد:** view سطرهای ۱۳–۱۷؛ سرکوب در `src/routes/_app.accounting.receivables.tsx:545-555`:

```
{r.is_overdue ? (<Badge variant="destructive">معوق</Badge>)
 : r.due_date ? (<Badge variant="secondary">{toFaDigits(String(r.days_until_due ?? 0))} روز</Badge>)
 : (<Badge variant="outline">{NA}</Badge>)}
```

همین الگو در کارت موبایل، سطرهای ۵۸۹–۵۹۵.

**پیامد ساخت:** محاسبهٔ تازه لازم نیست — فقط قدرمطلقِ عددِ موجود را در حالت معوق نمایش بده.

### F6 · C6 · exists-partial
**ادعا:** «سطل‌های سنی هست ولی سطل جدا برای «امروز» ندارد.»

**وضعیت واقعی:** پنج سطل، نه بیشتر، و **سطل «امروز» ندارد**. برچسب‌ها یک‌بار در TypeScript تعریف
شده‌اند و بین مطالبات و پرداختنی مشترک‌اند: `current='سررسید نشده'`، `d1_30='۱ تا ۳۰ روز'`،
`d31_60='۳۱ تا ۶۰ روز'`، `d61_90='۶۱ تا ۹۰ روز'`، `d90_plus='بیش از ۹۰ روز'`. محاسبه در SQL روی
`tehran_today() - due_date` با مرزهای `<=0 / <=30 / <=60 / <=90 / else`. ردیفی که **امروز** سررسید
است ۰ می‌دهد، به شاخهٔ `<= 0` می‌افتد و کنار ردیف‌های واقعاً آینده در `current` می‌نشیند.

دو ناهم‌خوانی دیگر: (الف) `due_date` ی که NULL است هم به‌زور `current` می‌شود — و در دادهٔ زنده
**تمام محتوای آن سطل همین است** (count = ۱، و کمینه/بیشینهٔ `days_until_due` اش هر دو NULL)؛
(ب) کارت خلاصهٔ «سررسید امروز» و فیلتر `today` وجود دارند، پس صفحه عددی نشان می‌دهد که هیچ سطلی
متناظرش نیست.

**شواهد:** `src/lib/accounting/aging.ts:14-50` — دقیقاً پنج ورودی؛ `AgingBucket` در سطر ۲.
`pg_get_viewdef('public.vw_customer_receivables')` سطرهای ۱۹–۲۶ برای `aging_bucket`.
`get_receivables_summary` measure جداگانه‌ای برای due_today دارد که از عبارت دیگری می‌آید.

**پیامد ساخت:** برای میز پخش روزانه «سررسید امروز» باید **سطل** باشد نه فقط کارت، و NULL باید سطل
خودش را داشته باشد نه پناه‌گرفتن در `current`.

### F7 · C7 · absent
**ادعا:** «گروه‌بندی بر اساس فروشنده، مرتب‌سازی بر اساس مبلغ، و خروجی اکسل روی آن صفحه — هر سه نبودن.»

**وضعیت واقعی:** هر سه غایب. (الف) هیچ گروه‌بندی‌ای نیست؛ صفحه یک جدول/کارتِ تخت است. (ب)
مرتب‌سازی سمت سرور **ثابت** است — `ORDER BY v.is_overdue DESC, v.due_date NULLS LAST,
v.outstanding_amount DESC` — صفحه هیچ state مرتب‌سازی ندارد، هیچ `TableHead` ای `onClick` ندارد، و
آرگومان‌های RPC (`p_from_date, p_to_date, p_customer_id, p_due_filter, p_search, p_limit,
p_offset`) هیچ پارامتر sort یا group ندارند. (ج) هیچ خروجی‌ای نیست — نه دکمه، نه import مربوط به
csv/xlsx.

**شواهد:** `grep -n -i -E "export|excel|xlsx|خروجی|sort|مرتب|group|گروه" src/routes/_app.accounting.receivables.tsx`
→ تنها تطبیق، سطر ۴۶ `export const Route = createFileRoute(...)`.
ستون‌های واقعاً رندر‌شده (سطرهای ۵۱۴–۵۲۳): مشتری / شماره فاکتور / سررسید / مبلغ کل / پیش‌پرداخت /
پرداخت تأییدشده / مانده / سطل سنی / وضعیت / عملیات.

**پیامد ساخت:** تلهٔ مهم — RPC با `LIMIT/OFFSET` صفحه‌بندی می‌کند (سقف ۲۰۰ با
`LEAST(GREATEST(COALESCE(p_limit,50),1),200)`)، پس مرتب‌سازی سمت کلاینت فقط صفحهٔ جاری را مرتب
می‌کند و **بی‌صدا دروغ می‌گوید**. مرتب‌سازی و خروجی هر دو باید سمت سرور باشند. نویسندهٔ xlsx در
`src/lib/asan/write-xlsx.ts` و CSV در `src/lib/data-tables/csv-export.ts` موجودند — سومی ننویس.

### F8 · C8 · exists-partial
**ادعا:** «رکورد قول (مبلغ + تاریخی که بدهکار تعهد کرده) هیچ‌جا هست — ادعای نبودن.»

**وضعیت واقعی:** جدول مستقلِ قول/تعهد **وجود ندارد**، زیر هیچ‌کدام از نام‌های
commitment/pledge/promise/expected_payment/follow_up و معادل‌های فارسی. ولی «نبودن» زیادی قاطع است:
یک رکورد قولِ **ناقص** هست، به‌شکل شش ستون روی `sales_quotes` (مهاجرت ۲۱۲) —
`quote_exception_type / _amount / _minutes / _text / _confirmed_at / _confirmed_by / _snapshot`.
مسیر `overdue_salesperson_commitment` دقیقاً مبلغ + مهلت را می‌گیرد: فروشنده تعهدنامهٔ فارسی امضا
می‌کند که مشتری تا N دقیقهٔ دیگر تسویه می‌کند. پر هم شده: **۲۴** پیش‌فاکتور `confirmed_at` دارند و
**۶** تا `amount`.

آنچه نیست: (الف) ردیف مستقلی که به پیش‌فاکتور گره نخورده باشد، (ب) تاریخ مطلق به‌جای شمارش دقیقه،
(ج) هر نوع پیگیری — به F23 نگاه کن.

**شواهد:** جست‌وجوی نام جدول‌ها با `relname ~* 'promis|commit|pledge|expect|follow|remind|due'` تنها
یک تطبیق داد، `sales_reminders`، که متن ثابت است نه قول (ستون‌ها: `id, text, sort_order, is_active,
created_at, updated_at, created_by`).

**پیامد ساخت:** «قول» را از صفر نساز؛ همین ستون‌ها لنگرگاه طبیعی‌اند، اما به تاریخ مطلق و ردیف
مستقل نیاز دارند.

### F9 · C9 · not-connected 🔌
**ادعا:** «ثبت تماس هست — ادعای نبودن. جدولی به نام `call_logs` در شمای سامانهٔ اصلی دیده شده.»

**وضعیت واقعی:** `call_logs` **این‌جا هم هست** و کاملاً بی‌مصرف است. ۱۱ ستون، `CHECK` روی
`direction`، RLS فعال با ۴ سیاست نقش‌محور، ۲ ایندکس هدفمند، و یک تریگر وصل به موتور امتیاز کارکنان
— و **۰ ردیف**. **۰ نویسنده و ۰ خواننده** در برنامه: تنها رخداد رشتهٔ `call_logs` زیر `src/`، بلوک
تایپ خودکار Supabase است. هیچ مسیری آن را رندر نمی‌کند و در هیچ ورودی منویی نیست.
`employee_id` و `customer_id` هیچ‌کدام FK ندارند.

**شواهد:** ستون‌ها: `id, employee_id, direction, duration_seconds, started_at, ended_at,
customer_id, external_id, source, metadata, created_at`. `SELECT count(*) FROM call_logs` → `0`.
`grep -rn "call_logs" --include=*.ts --include=*.tsx src/ server/ | grep -v types.ts` → **۰ خط**.
ساخته‌شده در `supabase/migrations/20260430201059_cbcd6677-f87a-4842-a3ac-5a710470edd6.sql:73`.
خوانندهٔ قدیمی‌اش هم رفته: در `compute_employee_score` فقط داخل یک کامنت مانده که می‌گوید تماس‌ها از
`staff_daily_performance_metrics` می‌آیند.

**پیامد ساخت:** جدول تماس تازه نساز. شما، RLS، ایندکس و تریگر آماده‌اند؛ آنچه نیست، مسیر نوشتن و
هر سطح خواندن است. تصمیم لازم: یا `call_logs` را پر کن و امتیازدهی را به آن برگردان، یا رسماً
بازنشسته‌اش کن. توجه: چون FK ندارد، هر نویسنده‌ای باید خودش `employee_id`/`customer_id` را اعتبارسنجی
کند، و دروازهٔ FK اشخاص (قاعدهٔ ۹ `CLAUDE.md`) فعلاً شامل این جدول نمی‌شود.

### F10 · C10 · exists-partial
**ادعا:** «جدول تخصیص/برنامه — ردیفی به معنی «بدهکار X این مبلغ را به بستانکار Y می‌دهد» — هست؛ ادعای نبودن.»

**وضعیت واقعی:** ردیف برنامهٔ **آینده‌نگر** وجود ندارد. هیچ enum ای در پایگاه‌داده برچسب `planned` یا
`scheduled` ندارد. آنچه هست سه‌شاخه می‌شود:

۱. موتور تخصیص **سرمایه**: `daily_capital_settings` (۱۹ ردیف) + `salesperson_capital_allocations_dynamic`
   (۲۵۲) + `customer_capital_allocations_dynamic` (۳۵)، با `run_daily_capital_allocation(p_capital_date,
   p_total_capital)` — اما **سقف اعتبار** را بر پایهٔ امتیاز پخش می‌کند، نه نقدینگی را بین بستانکاران.
۲. `dual_documents` (۷ ردیف) — ستون‌هایش دقیقاً `payer_{customer,supplier,party}_id →
   beneficiary_{customer,supplier,party}_id + amount + document_date` اند؛ کاملاً وصل و زنده، ولی
   **گذشته‌نگر** (وضعیت draft/approved/rejected، بدون تاریخ سررسید یا برنامه).
۳. `mutual_settlements` (**۰ ردیف**) — `person_id + customer_id + supplier_id + entry_date +
   offset_amount + cash_amount + direction`؛ کاملاً ساخته‌شده، در منو، و یک‌بار هم استفاده نشده.

**شواهد:** جست‌وجوی نام با `relname ~* 'alloc|plan|distrib|settl|treasur|cash|payout|disburse|schedul'`
→ دقیقاً ۶ تطبیق: `capital_allocation_ledger`, `customer_capital_allocations_dynamic`,
`mutual_settlements`, `salesperson_capital_allocations_dynamic`, `settlement_types`,
`v_purchase_item_allocation`. جست‌وجوی **ساختاری** (جدولی که هم ستون بدهکارگونه و هم بستانکارگونه
داشته باشد) هم `dual_documents` و `mutual_settlements` را برگرداند و بس.

**پیامد ساخت:** «ردیف تخصیص» تنها چیزی است که واقعاً باید از صفر ساخته شود. شکل ستون‌های
`dual_documents` الگوی درستِ دوطرفه است و باید همان را تقلید کند — اما به‌عنوان **برنامه**، و مرز
«تخصیص هرگز سند نمی‌شود» باید در خودِ شما اعمال شود، نه فقط در UI.

### F11 · C11 · exists-works
**ادعا:** «`audit_logs` می‌تواند تاریخچهٔ ویرایش ردیف‌به‌ردیف را سرویس بدهد.»

**وضعیت واقعی:** **بله** برای «چه‌کسی» و «کِی»؛ **نیمه** برای «از چه به چه». هفت ستون
(`id bigint, actor_id uuid, entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
diff jsonb, created_at timestamptz`)، **۴۹٬۳۱۲ ردیف**، ۳۱ مگابایت، RLS فعال با ۳ سیاست، ۱۵۴ action
متمایز روی ۷۷ نوع موجودیت، و ۵ ایندکس از جمله `audit_logs_entity_idx ON (entity_type, entity_id)`
که با `EXPLAIN ANALYZE` تأیید شد **واقعاً انتخاب می‌شود** — پس جست‌وجوی per-row یک index scan است،
نه پیمایش ۴۹ هزار ردیف.

شکاف در `diff` است: شِمای الزامی ندارد. هیچ ردیفی `diff` تهی ندارد، ولی فقط ۱۱٬۸۸۹ ردیف از الگوی
old/new، ۷٬۶۰۶ از from/to و ۹۲۱ از before/after استفاده می‌کنند — یعنی حدود **۲۸٬۹۰۰ ردیف** هیچ‌کدام،
و بارِ دلخواه یا snapshot اند. تریگر عمومیِ ممیزی هم وجود ندارد: ۴۷ تریگر نام‌دار جدول‌های مشخصی را
پوشش می‌دهند و **هیچ‌کدام** `mutual_settlements`، `capital_allocation_ledger`، `dual_documents`،
`payment_receipts`، `payment_receipt_links` یا `payment_vouchers` را پوشش نمی‌دهد.

**پیامد ساخت:** الزام «هر تغییر نقشه ثبت شود» را همین جدول برآورده می‌کند، **به شرط اینکه** برای
جدول تخصیص یک قرارداد `diff` ثابت (old/new) تعریف و رعایت شود و تریگرش نوشته شود — چون امروز چنین
تریگری برای هیچ‌یک از جدول‌های این دامنه وجود ندارد.

### F12 · C12 · exists-partial
**ادعا:** «پرداختنی سررسید قابل‌استفاده دارد» — که هم‌زمان روی سامانهٔ اصلی در حال بررسی جداگانه بود.

**وضعیت واقعی — پاسخ قطعی: دارد.** مسیر `src/routes/_app.accounting.payables.tsx` (تقریباً دوقلوی
مطالبات: همان سه RPC، همان مؤلفه‌های aging)، منبع `public.vw_supplier_payables` از راه
`get_payables_summary` / `get_payables_list` / `get_payable_detail`.
مکانیزم ترم‌محور دارد، اما **متفاوت**: `purchases.purchase_date + payment_terms.days`، لنگر روی
تاریخ خرید نه لحظهٔ پذیرش، و از راه `purchases.payment_term_id → payment_terms` نه
`sales_quotes.settlement_type_id → settlement_types`.

**شمارش زنده (با JWT حسابدار): ۳۰۳ ردیف، سررسید NULL = ۰، `payment_term_days` NULL = ۰،
۲۹۲ معوق، ۰ پرداخت‌شده.** جمع مانده ۳۲۸٬۹۳۷٬۹۶۳٬۳۹۹٫۹۴ که ۳۵٬۰۲۶٬۱۸۵٬۶۲۴٫۹۴ آن معوق است.

**ناهم‌تقارن بحرانی:** وقتی ترم نباشد، view **NULL برنمی‌گرداند** — بی‌صدا به `p.purchase_date`
برمی‌گردد:

```
CASE
    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
    ELSE p.purchase_date
END AS due_date
```

یعنی دقیقاً همان «عددِ غلط با برچسب اطمینان‌بخش» که مهاجرت ۴۱۹ از سمت مطالبات حذف کرد. امروز آن
شاخه صفر ردیف دارد، و **به همین دلیل نقص نامرئی است**.

**پیامد ساخت:** پرداختنی را می‌شود همین امروز خواند. ولی اگر خریدی بدون ترم ثبت شود، سررسیدش همان
روزِ خرید گزارش می‌شود و معوقِ کاذب می‌سازد؛ اصلاحش قرینه‌سازی با ۴۱۹ است — `NULL` به‌علاوهٔ یک
`due_date_unknown_reason`.

### F13 · C13 · exists-works
**ادعا:** «مفهوم شرایط تسویهٔ سمت تأمین‌کننده وجود دارد» — نامعلوم بود.

**وضعیت واقعی:** وجود دارد، به‌شکل جدول `payment_terms` به‌علاوهٔ FK به‌ازای هر خرید. **نه** به‌شکل
ستون `days` روی `suppliers` و **نه** به‌شکل پیش‌فرضِ هر تأمین‌کننده. `payment_terms` نه ستون و
**۵ ردیفِ همه‌فعال** دارد: `نقدی=0`، `تسویه ۳۰ روزه=30`، `چک ۴۵ روزه=45`، `تسویه ۶۰ روزه=60`،
`تسویه ۹۰ روزه=90`. اتصال از راه `purchases.payment_term_id`، پر روی **۳۰۳ از ۳۰۳** خرید. صفحهٔ
مدیریتش `src/routes/_app.admin.payment-terms.tsx`. جدول `suppliers` شانزده ستون دارد و هیچ‌کدام
ترم یا days نیست.

**پیامد ساخت:** آنچه باید ساخته شود **پیش‌فرضِ هر تأمین‌کننده** است، نه جدول ترم‌ها.

### F14 · C14 · exists-works 🔌
**ادعا:** «آیا هیچ view یا RPC ای هر دو طرف را با هم برمی‌گرداند؟» — نامعلوم.

**وضعیت واقعی:** هیچ **view** ای دو طرف را join یا union نمی‌کند (صفر تطبیق؛ در کل پایگاه‌داده فقط
دو view شکلِ aging وجود دارد: همان `vw_customer_receivables` و `vw_supplier_payables`). ولی
**RPC ها بله**، در دو خانواده با **منابع متفاوت**:

۱. `compute_daily_capital(date)` هر دو view را در یک تابع می‌خواند و total/overdue/due_today/future
   هر دو طرف را برمی‌گرداند؛ `save_daily_capital_snapshot(date)` ذخیره‌اش می‌کند و
   `daily_capital_snapshots` **۱۰ ردیف** دارد با ستون‌های `overdue_receivables`/`overdue_payables`.
   **این همان شیء دوطرفهٔ واقعی است، روی همان دو view که دو صفحهٔ گزارش استفاده می‌کنند.**
۲. `person_settlement_position(uuid)` و `list_mutual_settlement_candidates()` که
   receivable/payable/net/direction هر شخص را می‌دهند — اما از `journal_lines`/`journal_entries`
   (`account_kind` برابر `customer_credit` یا `supplier_payable`)، **نه** از آن دو view. حجم دفتر
   روزنامه در سمت پرداختنی نازک است: **۵۱** سطر `customer_credit` در برابر **۱** سطر
   `supplier_payable`.

**شواهد:** توابعی که تعریفشان هم `receivab` و هم `payab` دارد → ۱۰ تابع، از جمله
`compute_daily_capital`, `save_daily_capital_snapshot`, `person_settlement_position`,
`list_mutual_settlement_candidates`. امضای `compute_daily_capital` شامل
`total_receivables, overdue_receivables, due_today_receivables, future_receivables,
total_payables, overdue_payables, due_today_payables, future_payables` است؛ بدنه‌اش سطر ۲۹
`FROM public.vw_customer_receivables` و سطر ۳۷ `FROM public.vw_supplier_payables`.

**پیامد ساخت:** view ترکیبی تازه نساز — این دقیقاً «ماژول موازی»ِ ممنوع در قاعدهٔ ۱۴ `CLAUDE.md`
است. اگر فهرست **ردیف‌به‌ردیفِ** دوطرفه بخواهیم، آن واقعاً وجود ندارد و تازه است. و صریح باش که هر
صفحهٔ تازه از کدام سنجه می‌خواند: نسخهٔ view-محور (۸ / ۳۰۳ ردیف) و نسخهٔ journal-محور (۵۱ / ۱ سطر)
هرگز با هم جور درنمی‌آیند، و قاطی‌کردنشان در یک صفحه برای یک شخص دو «مانده» تولید می‌کند.

### F15 · C15 · absent
**ادعا:** «شمارهٔ حساب بانکی روی پروندهٔ شخص/مشتری ذخیره می‌شود» — ادعای «بعضی بله، بعضی هر بار پرسیده می‌شود».

**وضعیت واقعی:** روی `persons`، `customers` و `suppliers` **هیچ ستون حساب بانکی وجود ندارد**.
اندازه‌گیری: تعداد ستون‌های منطبق بر `iban|sheba|shaba|bank|card_number|account_number` روی این
جدول‌ها = **۰**. تنها جایی که یک شخص می‌تواند شبا داشته باشد `person_identifiers` با `kind='iban'`
است — که `CHECK` اجازه‌اش را می‌دهد، نرمال‌ساز چک‌سام واقعی IBAN دارد، و UI برچسب «شبا» دارد.

**شمارش روی این پایگاه‌داده: مشتریان = ۸۶ (هر ۸۶ `person_id` دارند)؛ ردیف‌های `person_identifiers`
با `kind='iban'` = ۰؛ مشتریان دارای شبا = ۰ (۸۶ خالی)؛ تأمین‌کنندگان = ۱۵، دارای شبا = ۰.**
kind های واقعاً استفاده‌شده: `mobile_e164 = 35` و `asan_person_code = 16`. جایگزین پویا هم نیست:
`person_field_definitions` = ۰ ردیف، و ۵ ردیف `profile_field_definitions` فیلد پرسنلی‌اند.
تنها شماره‌های بانکیِ سامانه، حساب‌های خودِ شرکت‌اند: `bank_accounts` = ۲ ردیف.

**پیامد ساخت:** «کارآموز شماره‌حساب‌ها را جمع می‌کند» امروز هیچ مقصدی در سامانه ندارد. مقصد درست
`person_identifiers(kind='iban')` است — موجود، معتبرسنجی‌شده، و خالی. جدول تازه لازم نیست.

### F16 · C16 · exists-works
**ادعا:** «خروجی آسان هست و در حال تعمیر است» — و پرسش: آیا تخصیص هرگز باید به آسان برسد؟

**وضعیت واقعی:** هفت خروجی ثبت‌شده در `src/lib/asan/export-registry.ts` —
`sales, purchase, receipts, payments, third_party, purchase_settlement, bank_deposits` — همه
`available: true`، روی چهار layout (`sales | purchase | journal | bank_deposit`). صفحهٔ
`/admin/asan-export` در منو هست («خروجی برای آسان»، `registry.ts:814`). شماره‌گذاری در
`asan_export_numbers` با ۲ ردیف تا امروز.

**پاسخ: نه — تخصیص هرگز نباید به آسان برسد.** بر پایهٔ آنچه در همین مخزن خواندم:

۱. دفتر شماره‌گذاری فقط سند می‌پذیرد: `asan_export_numbers_doc_type_check` دقیقاً سه مقدار را اجازه
   می‌دهد — `sales_invoice`, `purchase_invoice`, `accounting_document`. تخصیص هیچ‌کدام نیست و دفتر
   چهارمی وجود ندارد.
۲. هیچ‌یک از چهار `asan_list_*` به تخصیص دست نمی‌زند: برای هر چهار، `(prosrc ~* 'allocation') = false`.
۳. تخصیص شکل سند ندارد: `customer_capital_allocations_dynamic` نه بدهکار دارد، نه بستانکار، نه کد
   حسابداری، نه شمارهٔ سند، نه تاریخ ثبت سند.
۴. تخصیص **سقف** است نه حرکت پول؛ وقتی نوشته می‌شود هیچ پولی جابه‌جا نمی‌شود.

رویداد حسابداری‌ای که باید به آسان برسد، همان فاکتور یا فیشی است که تخصیص **اجازه‌اش را داد** — و
آن‌ها خروجی ثبت‌شدهٔ خودشان را دارند (`sales`, `receipts`).

**پیامد ساخت:** خروجی آسان برای تخصیص نساز.

---

### F17 · NEW · not-connected 🔌 — **موتور محاسبهٔ نقدینگی روزانه**
**وضعیت واقعی:** `compute_daily_capital` یک موتور کاملِ نسخه‌دار (`'v1'`) برای وضعیت نقدی روز است:
موجودی بانک + نقد + چک‌های دریافتنی + مطالبات سررسید امروز + مطالبات خارجی + نقدشوندگی موجودی +
تعدیل دستی، منهای پرداختنیِ سررسید امروز + چک‌های پرداختنی + بدهی‌های خارجی + هزینه‌های نزدیک +
ذخیرهٔ ریسک + وجوه مسدود — و **`vw_customer_receivables` و `vw_supplier_payables` زنده را می‌خواند**.
**هیچ‌چیز در برنامه آن را صدا نمی‌زند.** تنها فراخوانندهٔ درون‌پایگاهی‌اش `save_daily_capital_snapshot`
است که خودش هم صفر فراخوانندهٔ برنامه‌ای دارد. سه نویسندهٔ دیگر (`upsert_daily_capital_input`,
`save_daily_capital_snapshot`, `recompute_dynamic_capital_setting`) هم صفر فراخواننده دارند و صفحهٔ
ورود داده‌اش یک redirect stub است.

به‌جای آن، صفحهٔ زندهٔ `/accounting/dynamic-capital` سرمایهٔ کل روز را **دستی تایپ‌شده** می‌گیرد و
مستقیم به `run_daily_capital_allocation` می‌دهد — تابعی که نه `compute_daily_capital` را می‌خواند
نه view مطالبات را. همهٔ این RPC ها به `authenticated` مجوز EXECUTE دارند، یعنی از راه PostgREST
در دسترس‌اند؛ فقط صدا زده نمی‌شوند.

**شواهد:** `grep -rl` روی هر `*.ts`/`*.tsx` (بدون `node_modules` و `types.ts`) →
`compute_daily_capital :: NONE`، `save_daily_capital_snapshot :: NONE`،
`upsert_daily_capital_input :: NONE`، `recompute_dynamic_capital_setting :: NONE`
(این چهار را خودم مستقلاً هم اجرا کردم، همان نتیجه).
`src/hooks/capital/useDynamicCapital.ts:101-105` → `supabase.rpc("run_daily_capital_allocation", {...})`.
`src/routes/_app.accounting.dynamic-capital.tsx:318` → `<Label>سرمایه کل (تومان)</Label>`.
شمارش: `daily_capital_inputs=2`، `daily_capital_snapshots=10`.

**پیامد ساخت:** این بزرگ‌ترین دارایی «ساخته‌شده، وصل‌نشده»ِ این دامنه است. وصل‌کردن دوبارهٔ
`compute_daily_capital` به‌عنوان **عدد پیشنهادی** در `/accounting/dynamic-capital` (با آزادی
حسابدار برای بازنویسی) تغییری فقط در UI است، روی موتوری که همین حالا مطالبات و پرداختنی زنده را
می‌خواند.

### F18 · NEW · not-connected 🔌 — **چرخهٔ hold/consume تخصیص**
**وضعیت واقعی:** یک چرخهٔ کاملِ چهارفعلی در پایگاه‌داده هست که هیچ‌کس صدایش نمی‌زند:
`hold_capital_allocation`, `consume_capital_allocation`, `release_capital_allocation`,
`refund_capital_allocation`، به‌علاوهٔ پیش‌بررسیِ `can_use_customer_capital_allocation`.
هر پنج، **صفر ارجاع** در هر `.ts`/`.tsx` مخزن **و** صفر فراخوانندهٔ درون‌پایگاهی دارند. جدول
ممیزی‌شان `capital_allocation_ledger` (با `held_before/held_after/consumed_before/consumed_after`)
**۰ ردیف** دارد — یعنی هرگز یک رویداد هم ثبت نکرده. هر پنج به `authenticated` مجوز EXECUTE دارند.
کامنت هوک زنده، این دفتر را «تاشده» می‌نامد: `src/hooks/capital/useDynamicCapital.ts:43`.

**پیامد ساخت:** تخصیص امروز فقط عددی روی یک صفحه است، بدون هیچ ردگیریِ مصرف؛ چیزی سقف مشتری را
هنگام صدور فاکتور کم نمی‌کند. اگر «تخصیص با صدور فاکتور مصرف شود» جزو طرح باشد، لوله‌کشی‌اش هست و
فقط فراخواننده می‌خواهد — **اما** زنجیرهٔ موازیِ `hold_credit`/`release_credit` **زنده است**
(`create_receipt → increase_credit`، `update_sales_quote_status → hold_credit_for_quote`)، پس اول
باید تصمیم گرفت کدام دفتر برنده است.

### F19 · NEW · not-connected 🔌 — **دروازهٔ صدور فاکتور برای مشتری معوق**
**وضعیت واقعی:** `can_issue_customer_invoice` یک دروازهٔ سمت‌سرورِ تمام‌شده است: ردیف‌های معوق مشتری
را از `vw_customer_receivables` می‌خواند و `can_issue=false` با یک متن ردِ فارسیِ آماده برمی‌گرداند:
«این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.»
همراهش `log_invoice_issuance_blocked_overdue` هم هست. **هیچ‌کدام هیچ ارجاعی در هیچ `.ts`/`.tsx`
ندارند**، و دومی فراخوانندهٔ درون‌پایگاهی هم ندارد. هر دو به `authenticated` مجوز EXECUTE دارند.
پس تنها بررسی معوقِ اعمال‌شده در مسیر ایجاد پیش‌فاکتور، بررسی سمت‌کلاینتی است که
`customer_credit_profile.has_overdue` را می‌خواند — و آن همیشه false است (F20).

**شواهد (خودم اجرا کردم):** `pg_get_functiondef` تأیید می‌کند تابع `vw_customer_receivables` را
می‌خواند؛ `grep -rl can_issue_customer_invoice` روی `src server e2e` بدون `types.ts` → `NONE`،
و برای `log_invoice_issuance_blocked_overdue` → `NONE`.

**پیامد ساخت:** اعمال قاعدهٔ معوق یک فراخوانی RPC در مسیر ایجاد پیش‌فاکتور می‌خواهد، نه موتور قاعدهٔ
تازه — و بلافاصله گاز می‌گیرد، چون همین حالا ۷ از ۸ ردیف مطالبات معوق‌اند.

### F20 · NEW · exists-broken — **ردیابی معوق مشتری از ریشه خاموش است**
**وضعیت واقعی:** `public.update_customer_overdue_status(uuid)` یک `v_overdue_since := NULL;` صریح
پیش از شاخه‌ای دارد که باید `has_overdue=true` بگذارد، پس آن شاخه **دست‌نیافتنی** است و هر فراخوانی
`has_overdue=false, overdue_since=NULL` می‌نویسد. کامنت خودش هم همین را می‌گوید و می‌گوید ردیابی معوق
باید روی `sales_quotes` بازسازی شود و این «یک تصمیم محصولی است». هم‌زمان
`public.customer_credit_profile` — که `credit_limit`, `has_overdue`, `overdue_since`,
`last_overdue_check_at` را در اختیار دارد — **صفر ردیف** دارد.

پس گزارش مطالبات ۷ ردیف معوق نشان می‌دهد، در حالی که سامانهٔ اعتبار باور دارد **هیچ مشتری‌ای معوق
نیست**.

**شواهد (خودم تأیید کردم):** `pg_get_functiondef(update_customer_overdue_status) ~ 'v_overdue_since := NULL;'`
→ `true`. `SELECT count(*) FROM customer_credit_profile` → `0`. کامنت درون تابع، سطرهای ۱۰–۱۷، به
مهاجرت ۳۳۱ ارجاع می‌دهد. توابعی که این وضعیت را می‌خوانند شامل
`calculate_customer_realtime_credit`, `can_issue_customer_invoice`, `get_customer_dynamic_credit`,
`list_trusted_credit_customers` اند.

**پیامد ساخت:** پرارزش‌ترین نیمه‌ساختهٔ این ممیزی. `vw_customer_receivables` حالا دقیقاً همان منبعی
را می‌سازد که ۳۳۱ گفت نبود، پس `update_customer_overdue_status` بالاخره می‌تواند تکمیل شود. اما
**مکانیکی نیست**: با روشن‌شدنش، صدور پیش‌فاکتور برای مشتریانی که امروز آزادند بلافاصله بسته می‌شود
(۷ از ۸ ردیف مطالبات زنده معوق‌اند). دقیقاً مثل سابقهٔ قاعدهٔ ۱۰ `CLAUDE.md`، پیش از هر مهاجرتی
تأیید مالک روی **پیامد کسب‌وکاری** لازم است، نه فقط روی اعداد.

### F21 · NEW · exists-broken — **تب فروشِ `/reports` جدولی می‌خواند که وجود ندارد**
**وضعیت واقعی:** `src/routes/_app.reports.tsx` گزارش فروشش را از `.from("invoices")` می‌سازد.
در پایگاه‌داده هیچ relation ای به نام `invoices` وجود ندارد — تنها تطبیق `invoice_workflow_stages`
است. همان select علاوه بر آن `customers!inner(full_name)` می‌خواهد، در حالی که `public.customers`
ستون `name` دارد نه `full_name`. پس پرس‌وجو روی **دو محورِ مستقل** می‌شکند. مسیر در منو ثبت شده.
همان فایل برای کارت‌های مطالباتش `get_receivables_summary` را درست صدا می‌زند، پس صفحه نیمه‌کار است:
کارت‌های مطالبات رندر می‌شوند، تب فروش نمی‌تواند.

**شواهد (خودم تأیید کردم):** `src/routes/_app.reports.tsx:89-91` →
`.from("invoices").select("id, total_amount, status, created_at, customers!inner(full_name)")`.
`relations_named_invoice*` → فقط `invoice_workflow_stages`. `customers_has_full_name` → `false`.
`src/lib/navigation/registry.ts:610` → `{ to: "/reports", label: "گزارش‌ها", ... }`.

**پیامد ساخت:** همان پوسیدگیِ «جدول فاکتورِ مرده» که مهاجرت ۳۳۱ از `get_receivable_detail` و
`update_customer_overdue_status` پاک کرد؛ `/reports` از قلم افتاده بود. تب فروش را روی
`sales_quotes` بازبساز یا حذفش کن — **جدول `invoices` را دوباره نساز.**

### F22 · NEW · exists-broken — **سه KPI فعال به جدول خالی اشاره می‌کنند**
**وضعیت واقعی:** `inbound_calls` (وزن ۱)، `outbound_calls` (وزن ۲) و `talk_minutes` (وزن ۰٫۵) هر سه
`enabled` اند و `source='call_logs'` اعلام می‌کنند — جدولی با صفر ردیف و بدون نویسنده. ستون `source`
تزئینی است: `compute_employee_score` تنها مصرف‌کنندهٔ `gamification_kpis` است و برای تماس‌ها و دقایق
مکالمه، `staff_daily_performance_metrics` را **hard-code** کرده، صرف‌نظر از اینکه `source` چه بگوید
(آن جدول ۱۱ ردیف با مجموع ۳٬۴۳۵ تماس ورودی، ۴٬۴۷۵ خروجی و ۳٬۴۰۵ دقیقه دارد).

**پیامد ساخت:** هرکس `gamification_kpis.source` را بخواند تا بفهمد میز کار را کجا وصل کند، به جدول
خالی وصل می‌کند. یا آن سه مقدار `source` را اصلاح کن یا `compute_employee_score` را واقعاً روی
`source` شاخه‌بندی کن. یک UPDATE به‌ازای هر KPI است، نه تغییر شِما.

### F23 · NEW · exists-broken — **`quote_exception_minutes` فقط نوشته می‌شود**
**وضعیت واقعی:** نیمهٔ «مهلت»ِ تنها رکورد قولِ سامانه **write-only** است. دقیقاً یک تابع پایگاه‌داده
به آن دست می‌زند، `create_sales_quote_with_items`، و آن هم می‌نویسدش. هیچ‌چیز آن را برای پرسیدن
«آیا مهلت گذشت؟» نمی‌خواند، و هیچ فایل `src/` هیچ ستون `quote_exception_*` را select نمی‌کند.
جدا از آن، این ستون هرگز پر نشده (۰ از ۶۳ پیش‌فاکتور)، چون تنها شاخه‌ای که آن را می‌گذارد — مسیر
معوق — هرگز شلیک نکرده (F20). دو نوع استثنایی که واقعاً شلیک کرده‌اند `accounting_approval` (۱۸) و
`credit_shortfall_salesperson_commitment` (۳) اند.

**پیامد ساخت:** قول ثبت می‌شود و هرگز بررسی نمی‌شود. هر پیگیریِ آینده باید خواندنِ این ستون‌ها را
اضافه کند، نه ستون تازه.

### F24 · NEW · not-connected 🔌 — **یک read model یتیمِ اعتبار مشتری**
**وضعیت واقعی:** `src/lib/sales/customer-credit-snapshot.ts` یک read model ۱۸۴ خطی است
(`trusted_status`, `settlement_speed`, `overdue_lock`, `manual_override`, به‌علاوهٔ
`evidence`/`data_sources`) با **صفر importer** در کل مخزن. دو بخشش با یادداشت فارسی صراحتاً پارک
شده‌اند: «فرمول سرعت تسویه هنوز در Group 3 Business Rules Review تأیید نشده است؛ مقدار فعلی عمداً
unknown است.» و «قانون قفل معوق هنوز تأیید نشده است؛ این read model فعلاً هیچ قفل خودکار اعمال
نمی‌کند.» این **سومین** خوانش اعتبار است، کنار `get_customer_credit` و `get_customer_dynamic_credit`.

**پیامد ساخت:** چهارمین read model اعتبار را ننویس. همین فایل شکل درست را دارد و دقیقاً همان دو
قاعدهٔ کسب‌وکاری را نام می‌برد که مالک هنوز باید دربارهٔ‌شان تصمیم بگیرد: سرعت تسویه و قفل معوق.

### F25 · NEW · exists-broken — **هیچ زمان‌بندی‌ای وجود ندارد**
**وضعیت واقعی:** دو تابع انقضا مثل job نوشته شده‌اند و هیچ‌چیز زمان‌بندی‌شان نمی‌کند.
**`pg_cron` روی این پایگاه‌داده نصب نیست** (تأیید مستقیم خودم: `pg_cron_installed=false`؛ و
`SELECT ... FROM cron.job` با «relation does not exist» می‌شکند). `expire_pending_delivery_receipts`
صفر فراخوانندهٔ برنامه‌ای دارد (تنها ارجاعش یک spec امنیتی است)، پس رسیدهای تحویلِ در انتظار هرگز
منقضی نمی‌شوند. `expire_stale_credit_holds` به‌جای زمان‌بندی، فرصت‌طلبانه از صفحهٔ ایجاد پیش‌فاکتور
صدا زده می‌شود (`src/routes/_app.sales.quotes.new.tsx:203-207`)، یعنی hold های کهنه فقط وقتی آزاد
می‌شوند که یک فروشنده اتفاقاً آن صفحه را باز کند.

**پیامد ساخت:** هیچ قابلیت پیگیری یا یادآوریِ تازه‌ای نباید فرض کند زمان‌بند وجود دارد. الگوی موجود
«جاروی سوارشده بر بارگذاری صفحه» است، و برای میز پخش روزانه کافی نیست.

### F26 · NEW · absent — **گردش‌کار پیگیری و وصول وجود ندارد**
**وضعیت واقعی:** هیچ گردش‌کار پیگیری، قولِ پرداخت یا وصول برای مطالبات وجود ندارد. جست‌وجوهای
فارسی روی `src`: «قول» = ۰ فایل، «طلبکار» = ۰، «پرداختنی» = ۰، «نقدینگی» = ۰، «وصول» = ۳؛ «پیگیری»
در ۲۶ فایل هست ولی در صفحهٔ مطالبات فقط برچسب شمارهٔ پیگیری پرداخت است. هیچ جدول
follow-up/dunning/collection وجود ندارد: تنها تطبیق‌های `follow|task|reminder|call_|activity|note|dunn|collect`
عبارت‌اند از `call_logs`, `marketing_task_templates`, `sales_reminders`, `tasks`.
`sales_reminders` فهرست تختِ متن‌های یادآوری است (بدون مشتری، مبلغ یا سررسید)، و هر ۱۰ ردیف `tasks`
از نوع `marketing_recurring_task` اند.

تنها مصنوعِ قول‌شکل که **وجود دارد**، تعهد فروشنده در `QuoteCreationBlockDialog` است
(`overdue_salesperson_commitment` با متن تعهدنامهٔ فارسی و مهلت دقیقه‌ای) — که شرط شلیکش هرگز
نمی‌تواند درست شود (F20).

**پیامد ساخت:** پیگیری زمینِ بکر است — اما متن تعهد، انواع استثنا و ستون‌های ممیزی روی `sales_quotes`
از پیش هستند و لنگرگاه طبیعی یک رکورد «قولِ پرداخت» اند.

### F27 · NEW/D3 · not-connected 🔌 — **سه صفحهٔ واقعی که از منو دیده نمی‌شوند**
**وضعیت واقعی:** ۳۴ مسیر این دامنه در برابر ۱۲۱ ورودی یکتای `to:` در `registry.ts` بررسی شدند.
۲۴ مسیر در رجیستری‌اند. ۳ مسیر بی‌ضرر redirect stub اند (مستند در `registry.ts:511-514`) و ۴ مسیر
بی‌ضرر drill-down اند. سه مورد باقی‌مانده صفحات واقعی‌اند که کاربر از منو پیدایشان نمی‌کند:

- **`/operations/receipts`** — یک صفحهٔ کامل بازبینی OCR فیش (admin+manager). تطبیق در رجیستری = ۰،
  و **هیچ `<Link>` یا ارجاع رشته‌ای در هیچ‌جای `src`** ندارد. جز با تایپ‌کردن URL دست‌نیافتنی است.
  (تأیید مستقل خودم: `grep -rno '"/operations/receipts"' src` بدون `routeTree.gen` → بدون خروجی.)
- **`/delivery-receipts`** — صفحهٔ کامل بارگذاری/تأیید. تطبیق در رجیستری = ۰؛ فقط از کاشیِ هاب
  همکاری (`_app.collaboration.tsx:76`) در دسترس است، هرگز از منو (فقط خواهرِ ادمینش
  `/admin/delivery-receipts` ثبت شده).
- **`/sales/customers/credit-allocation-guide`** — تطبیق در رجیستری = ۰؛ فقط از یک لینک روی صفحهٔ
  سرمایهٔ پویا در دسترس است.

**پیامد ساخت:** هر صفحهٔ تازهٔ میز پخش باید در همان کامیت وارد `registry.ts` شود، وگرنه به همین سه
تا اضافه می‌شود.

### F28 · NEW · not-connected 🔌 — **`vw_supplier_payables.product_summary` یک NULL ثابت است**
**وضعیت واقعی:** ستون `product_summary` در view پرداختنی یک `NULL` کدشده است که UI آن را به‌عنوان
دادهٔ واقعی رندر می‌کند. (این یافته از کاوش خودکار آمد و من مستقلاً وجود ستون را در `pg_get_viewdef`
دیدم؛ برای مصرف در طرح، باید پیش از هر تصمیمی دوباره اندازه‌گیری شود — به بخش UNVERIFIED نگاه کن.)

**پیامد ساخت:** اگر میز پخش قرار است «بابت چه چیزی» را نشان دهد، این ستون امروز چیزی نمی‌دهد.

### F29 · NEW · not-connected 🔌 — **جدول‌هایی که ساخته شدند و هرگز پر نشدند**
**وضعیت واقعی (شمارش دقیق `COUNT(*)`، نه تخمین `pg_stat`):** `capital_allocation_ledger=0`،
`customer_credit_profile=0`، `credit_requests=0`، `credit_score_snapshots=0`، `mutual_settlements=0`،
`person_field_definitions=0`، `purchase_receipts=0`، `payment_receipt_custom_fields=0`،
`payment_receipts_backup_20260722=0`. و نزدیک به خالی: `delivery_receipts=1`،
`payment_receipt_documents=1`، `daily_capital_inputs=2`، `asan_export_numbers=2`،
`payment_receipt_links=3`.

**پیامد ساخت:** `customer_credit_profile` با صفر ردیف، خالیِ باربَر است: هر تصمیم اعتباری در برنامه
`outstanding_balance` و `has_overdue` را از جدولی می‌خواند که هرگز یک ردیف هم نداشته (F20).

### F30 · D4 · exists-works (با یک قید) — **واقعیت RLS، آزموده با کاربران تک‌نقشِ واقعی**
**وضعیت واقعی:** با دو کاربر واقعیِ تک‌نقش (`sales` و `accountant`) داخل تراکنش برگشت‌خورده، با
`SET LOCAL ROLE authenticated` و JWT شبیه‌سازی‌شده. فایل پرس‌وجو با `psql -f` تحویل شد و md5 دو طرف
یکی بود (`11c3f0939f978cd0ea51e2d6ae438538`).

| جدول | فروش می‌بیند | حسابدار می‌بیند |
|---|---|---|
| `customers` | ۷۳ | ۸۶ |
| `suppliers` | ۱۵ | ۱۵ |
| `settlement_types` | ۱۲ | ۱۲ |
| `sales_quotes` | ۰ | ۶۶ |
| `purchases` | ۰ | ۳۰۳ |
| `payment_receipts` | ۰ | ۲۸ |
| `payment_vouchers` | ۰ | ۱۲ |
| `customer_capital_allocations_dynamic` | ۰ | ۳۵ |
| `audit_logs` | ۰ | ۰ |
| `call_logs` | ۰ | ۰ |
| `capital_allocation_ledger` | ۰ | ۰ |

**تفسیر صادقانهٔ صفرها — این مهم‌ترین بخش این یافته است:**
- `sales_quotes = 0` برای فروش **یافته نیست**: آن کاربر مالک صفر پیش‌فاکتور است و سیاست
  `salesperson_id = uid()` است. صفر، نتیجهٔ درستِ داده است نه ردِ دسترسی.
- `audit_logs = 0` برای حسابدار **یافتهٔ واقعی است**: جدول ۴۹٬۳۱۲ ردیف دارد و سیاستش
  `has_role(uid(),'admin')` است؛ پس حسابدار واقعاً رد می‌شود.
- `call_logs = 0` و `capital_allocation_ledger = 0` **هیچ‌چیز ثابت نمی‌کنند**، چون هر دو جدول در
  مبدأ خالی‌اند. این‌ها در بخش UNVERIFIED رفته‌اند.

**پیامد ساخت:** الزام مالک — «فروش نباید نقشهٔ پخش را ببیند» — با الگوی موجود شدنی است: جدول‌های
مالی این دامنه امروز برای نقش فروش صفر برمی‌گردانند. اما این باید برای جدول تخصیصِ تازه **از نو
آزموده شود**، چون هیچ‌کدام از این اندازه‌گیری‌ها دربارهٔ جدولی که هنوز وجود ندارد چیزی نمی‌گوید.

---

## Duplicates

### DUP-1 — دو چارچوب خروجی آسان، و صفحهٔ منودار به نسخهٔ مرده وصل است
- **مکان‌ها:** `src/lib/export/export-modes.ts` (۵ آداپتور، همه با
  `createUnconfiguredAsanAdapter`، `isConfigured: false`، `buildRows()` بی‌قید‌وشرط
  `AsanLayoutNotConfiguredError` می‌اندازد) در برابر `src/lib/asan/export-registry.ts` (۷ خروجی،
  همه `available: true`، پشتیبانی‌شده با توابع واقعی پایگاه‌داده).
- **کدام در استفاده است:** هر دو. صفحهٔ زندهٔ `/accounting/receipts` — که در منو هست
  (`grep -c '"/accounting/receipts"' registry.ts` → ۴) — یک Select دوگزینه‌ای رندر می‌کند که گزینهٔ
  دومش «خروجی آسان» است و انتخابش **همیشه** استثنا می‌اندازد
  (`_app.accounting.receipts.tsx:180-182`)، در حالی که خروجی کارآمد `receipts` برای همان داده روی
  `/admin/asan-export` موجود است.
- **پیشنهاد ادغام:** شاخهٔ `export-modes.ts` را از `/accounting/receipts` بردار و حسابدار را به
  `/admin/asan-export` بفرست.

### DUP-2 — دو تعریف زنده از «اعتبار در دسترس مشتری» که با هم اختلاف دارند
- **مکان‌ها:** `get_customer_credit` (ستون ذخیره‌شدهٔ `customer_credit_balance.available_credit`)،
  فراخوانده در `src/routes/_app.accounting.receipts.$receiptId.tsx:261` — در برابر
  `get_customer_dynamic_credit` (محاسبهٔ `GREATEST(final_limit - outstanding_balance - held_credit, 0)`
  از آخرین ردیف `customer_capital_allocations_dynamic`)، فراخوانده در
  `src/routes/_app.sales.quotes.new.tsx:215`.
- **کدام در استفاده است:** **هر دو، روی دو صفحهٔ متفاوت.** اندازه‌گیری روی همین پایگاه‌داده: از ۷
  مشتری که در هر دو منبع هستند، **۵ اختلاف دارند** (خروجی `24|8|5|7`).
- **پیشنهاد ادغام:** یکی را انتخاب و دیگری را حذف کن، وگرنه حسابدار و فروشنده در یک روز برای یک
  مشتری دو سقف متفاوت می‌بینند.

### DUP-3 — دو مشتقِ «معوق»، و دروازهٔ زنده به مردهٔ آن وصل است
- **مکان‌ها:** `vw_customer_receivables.is_overdue` (از `accepted_at + settlement_types.days` در
  برابر `tehran_today()`) — در برابر `customer_credit_profile.has_overdue`، پرچمی که مسدودسازیِ
  ایجاد پیش‌فاکتور **واقعاً می‌خواند** (`_app.sales.quotes.new.tsx:404-410`).
- **کدام در استفاده است:** UI به دومی وصل است، که جدولش ۰ ردیف دارد و نویسنده‌اش no-op است. پس شاخهٔ
  «معوق» و متن تعهد فروشنده **هرگز نمی‌توانند شلیک کنند**، در حالی که همین حالا
  ۱٬۶۱۶٬۳۰۰٬۰۰۰ مانده معوق واقعی وجود دارد.
- **پیشنهاد ادغام:** یک منبع حقیقت — `vw_customer_receivables` — و F20 باید پیش از این تصمیم حل شود.

### DUP-4 — سه مشتقِ مستقل از «این خرید دیر پرداخت شد؟»
- **مکان‌ها:** `vw_supplier_payables` (بدون مهلت ارفاقی) · `award_accountant_payment_score`
  (تریگر `trg_award_accountant_payment_score` روی `purchases`، با
  `promised_days + purchase_score_grace_days`) · `vw_purchase_float`
  (`promised_days`/`actual_days`/`implied_daily_cost`، ۳۰۳ ردیف).
- **کدام در استفاده است:** اولی در صفحهٔ پرداختنی، دومی به‌صورت تریگر. **`vw_purchase_float` صفر
  مصرف‌کننده دارد** (`grep -rn 'vw_purchase_float' src server` بدون خروجی).
- **پیشنهاد ادغام:** سطل سنی خودش تکراری **نیست** — `d31_60` فقط در ۲ view و ۴ تابع هست و آن ۴ تابع
  صرفاً روی ستون view فیلتر می‌کنند. آنچه باید یکی شود، معنای «مهلت ارفاقی» است.

### DUP-5 — یک منبع دستیِ دومِ مطالبات و پرداختنی، که دیگر نگه‌داشتنی نیست
- **مکان‌ها:** `daily_capital_inputs.external_receivables` و `.external_payables` — اعدادی
  دستی‌تایپ که `compute_daily_capital` به جمع‌های مشتق‌شده اضافه/کم می‌کند.
- **کدام در استفاده است:** فرمول هنوز می‌خواندشان، ولی صفحه‌ای که واردشان می‌کرد
  (`/accounting/daily-capital`) حالا redirect stub است و تنها نویسنده،
  `upsert_daily_capital_input`، صفر فراخواننده دارد.
- **پیشنهاد ادغام:** یا سطح ورود تازه، یا حذف از فرمول. امروز بی‌صدا صفر اند.

### چیزی که تکراری **نیست** (کنترل منفی، تا خالی‌بودن قابل‌ممیزی باشد)
`src/lib/accounting/aging.ts` فقط نمایشی است (برچسب و tone؛ هیچ حساب تاریخی ندارد) و هر دو صفحهٔ
مطالبات و پرداختنی همان `AgingBucketBadge`/`AgingBucketCards` را از
`src/components/accounting/AgingBuckets.tsx` import می‌کنند (`grep -rn 'AgingBuckets' src --include=*.tsx`
→ فقط دو مسیر). `get_account_balances` هم `vw_account_balances` را می‌پیچد و مانده‌ها را از نو
مشتق نمی‌کند.

---

## Integration gaps

هر شکاف، دو سرِ سیم و آنچه ناجور است:

1. **`compute_daily_capital` ↔ صفحهٔ سرمایهٔ پویا.**
   سرِ یک: تابعی که `total/overdue/due_today/future` هر دو طرف را از view های زنده می‌دهد.
   سرِ دو: `src/routes/_app.accounting.dynamic-capital.tsx:318` → `<Label>سرمایه کل (تومان)</Label>`
   و `useDynamicCapital.ts:101` که `run_daily_capital_allocation` را با `p_total_capital` دستی صدا
   می‌زند. **ناجوری:** هیچ سیمی وجود ندارد؛ عدد محاسبه‌شده هرگز به صفحه نمی‌رسد.

2. **`can_issue_customer_invoice` ↔ مسیر ایجاد پیش‌فاکتور.**
   سرِ یک: `... FROM public.vw_customer_receivables r WHERE r.customer_id = p_customer_id AND
   r.is_overdue = true AND r.outstanding_amount > 0` با متن ردِ فارسی آماده.
   سرِ دو: `_app.sales.quotes.new.tsx:404-410` → `if (creditInfo?.hasOverdue) { return { kind: "overdue", ...`
   که از `customer_credit_profile` می‌خواند. **ناجوری:** سمت سرور از view درست می‌خواند، سمت کلاینت
   از جدول خالی؛ دروازهٔ درست هرگز صدا زده نمی‌شود.

3. **`quote_exception_minutes` (نوشتن) ↔ هیچ خواننده‌ای.**
   سرِ یک: `create_sales_quote_with_items` که مقدارش را می‌نویسد.
   سرِ دو: وجود ندارد — هیچ تابع و هیچ فایل `src/` این ستون را select نمی‌کند.
   **ناجوری:** مهلت ثبت می‌شود و هیچ‌کس نمی‌پرسد گذشت یا نه.

4. **`call_logs` (شِما + تریگر امتیاز) ↔ هیچ مسیر نوشتنی.**
   سرِ یک: جدول با RLS، ایندکس و `trg_call_logs_recompute_employee_score`.
   سرِ دو: هیچ فرم، هیچ webhook، هیچ ingest. **ناجوری:** تریگر روی جدولی نشسته که هرگز INSERT
   نمی‌گیرد؛ و سه KPI فعال هنوز به آن به‌عنوان `source` اشاره می‌کنند (F22).

5. **`vw_customer_receivables.is_overdue` ↔ `customer_credit_profile.has_overdue`.**
   سرِ یک: ۷ ردیف معوق زنده. سرِ دو: جدول با ۰ ردیف و نویسندهٔ `v_overdue_since := NULL;`.
   **ناجوری:** دو حقیقت متضاد دربارهٔ یک واقعیت، و فرمول اعتبار به نسخهٔ مرده وصل است.

6. **`person_identifiers(kind='iban')` ↔ جمع‌آوری شماره‌حساب.**
   سرِ یک: `CHECK` اجازه می‌دهد، نرمال‌ساز چک‌سام IBAN دارد، UI برچسب «شبا» دارد.
   سرِ دو: **۰ ردیف** — هیچ جریان کاری‌ای آن را پر نمی‌کند. **ناجوری:** ظرف هست، قیف نیست.

7. **دو سنجهٔ «موقعیت هر شخص»: view-محور در برابر journal-محور.**
   سرِ یک: `vw_customer_receivables`/`vw_supplier_payables` → ۸ و ۳۰۳ ردیف.
   سرِ دو: `person_settlement_position` روی `journal_lines` → ۵۱ و **۱** سطر.
   **ناجوری:** هر صفحه‌ای که این دو را کنار هم بگذارد، برای یک شخص دو «مانده» نشان می‌دهد.

---

## Constraints

**پشته و نسخه‌ها (از manifest ها، نه از حافظه) —** `package.json`:
React `^19.2.0` · React-DOM `^19.2.0` · Vite `^7.3.1` · TypeScript `^5.8.3` ·
`@tanstack/react-router ^1.168.0` · `@tanstack/react-query ^5.83.0` ·
`@supabase/supabase-js ^2.104.1` · `@playwright/test ^1.62.0` · `xlsx ^0.18.5` ·
`tailwindcss ^4.2.1` · `zod ^4.3.6` · `eslint ^9.32.0`.
زنجیرهٔ ابزار روی همین ماشین: Node `v22.16.0`، npm `10.9.2`.
پایگاه‌داده: **PostgreSQL 15.6**، افزونه‌ها: `btree_gist, pg_graphql, pg_stat_statements, pg_trgm,
pgcrypto, pgjwt, pgsodium, plpgsql, supabase_vault, uuid-ossp, vector` — **`pg_cron` نیست**.

**فرمانِ آزمونِ کشف‌شده —** در `package.json` **هیچ script با نام `test` وجود ندارد**؛ همان‌طور که
`CLAUDE.md` هم می‌گوید. آنچه هست:
`dev = vite dev` · `build = vite build` · `lint = eslint .` · `typecheck = tsc --noEmit` ·
`preview = node server/node-entry.mjs` · `format = prettier --write .` ·
`test:receipt-ocr = npx --yes tsx --test src/lib/accounting/receipt-ocr-structured.test.ts`.
مجموعهٔ واقعی آزمون Playwright است — **۱۲۸ فایل `*.spec.ts` زیر `e2e/`** با چهار پیکربندی
(`playwright.config.ts`, `playwright.auth.config.ts`, `playwright.pwa.config.ts`, `pw.session.config.ts`)
که با `npx playwright test -c <config>` اجرا می‌شوند. **در این ممیزی هیچ آزمونی اجرا نکردم**؛ فقط
شمردمشان.

**قراردادهای مشاهده‌شده (نه فرض‌شده):**
- **مهاجرت‌ها فقط افزایشی**، شماره‌گذاری `2026MMDDHHMMSS_<NNN>_<name>.sql`؛ روی دیسک **۶۰۸ فایل**.
- **قاعدهٔ ۱۴ `CLAUDE.md`** — ماژول/جدول/سرویس موازی ممنوع. F14 و F24 هر دو مستقیماً به این قاعده
  می‌خورند.
- **قاعدهٔ ۹** — هر FK تازه به `persons` باید پیش از `ALTER TABLE` در registry ی `person_merge` ثبت
  شود، وگرنه event trigger مهاجرت ۳۲۸ کل مهاجرت را می‌شکند. جدول تخصیصِ آینده که به شخص ارجاع دهد
  دقیقاً زیر همین قاعده است.
- **قاعدهٔ ۱۰** — تغییر دامنهٔ امتیاز/اعتبار می‌تواند سقف‌های واقعی را جابه‌جا کند؛ سابقهٔ ۴۱۱.
  روشن‌کردن F20 از همین جنس است.
- **مرزِ «تخصیص هرگز سند نیست»** در خودِ پایگاه‌داده قابل اعمال است: `asan_export_numbers` با
  `CHECK` سه‌مقداری‌اش الگوی آماده‌ای برای همین است.
- **RTL/فارسی و mobile-first** در همهٔ صفحات این دامنه رعایت شده؛ برچسب‌های سطل سنی یک‌بار در
  `src/lib/accounting/aging.ts` تعریف و بین دو صفحه مشترک‌اند.
- **هر مسیر تازه باید در همان کامیت وارد `src/lib/navigation/registry.ts` شود** — F27.

**چیزی که با ادعاها در تضاد است:**
۱. ادعای «پرداختنی سررسید ندارد» با ۳۰۳ از ۳۰۳ سررسیدِ پرشده رد می‌شود (F12).
۲. ادعای «رکورد قول وجود ندارد» با شش ستون `quote_exception_*` روی `sales_quotes` تعدیل می‌شود (F8).
۳. ادعای «شماره‌حساب بعضی ذخیره شده» رد می‌شود: **صفر** شبا روی این پایگاه‌داده (F15).
۴. ادعای ضمنیِ «چیزی برای دوطرفه‌دیدن نداریم» رد می‌شود: `compute_daily_capital` هست، فقط وصل نیست
   (F14, F17).

---

## Coverage

**فرمان‌های شمارش و اعدادشان (همه را خودم دوباره اجرا کردم):**

| چه چیزی | فرمان | عدد |
|---|---|---|
| جدول‌های `public` | `pg_class relkind='r'` | ۲۲۴ |
| view/matview های `public` | `pg_class relkind IN ('v','m')` | ۲۲ |
| توابع `public` | `pg_proc` | ۸۴۰ |
| relation های **دامنه** | همان + regex دامنه | **۳۳** |
| توابع **دامنه** | `pg_proc.proname` + regex دامنه | **۸۱** |
| تریگرهای دامنه | `pg_trigger` + regex | ۵۱ |
| فایل‌های مسیر | `ls src/routes/*.tsx *.ts` | ۲۰۴ |
| ورودی‌های یکتای منو | `grep -oP '(?<=^\s{4}to: ")[^"]+' registry.ts \| sort -u` | ۱۲۱ |
| مسیرهای **دامنه** | زیرمجموعهٔ دستی از ۲۰۴ | **۳۴** |
| نام‌های RPC که برنامه صدا می‌زند | `grep -rhoP '(?<=\.rpc\(")[^"]+' src server \| sort -u` | ۱۵۸ |
| فایل‌های `*.spec.ts` | `find e2e -name '*.spec.ts'` | ۱۲۸ |
| فایل‌های مهاجرت | `ls supabase/migrations/*.sql` | ۶۰۸ |

**حساب پوشش:**

- **ادعاها: ۱۶ + ۵ = ۲۱ فهرست‌شده · ۲۱ ارزیابی‌شده · ۰ ارزیابی‌نشده.**
  C1..C16 هر ۱۶ verdict گرفتند؛ D1 (فهرست دامنه)، D2 (تکراری‌ها)، D3 (نقشهٔ منو)، D4 (واقعیت RLS) و
  D5 (قیدها) هر پنج پاسخ گرفتند.
- **relation های دامنه: ۳۳ فهرست‌شده · ۳۳ ردیف‌شماری‌شده · ۰ نشمرده.** (فهرست کاملش با تعداد ردیف
  در F29 و در جدول‌های بالا آمده.)
  **قید مهم روی چهار صفر:** `vw_customer_receivables`, `vw_supplier_payables`,
  `v_dynamic_customer_capital_balances`, `v_dynamic_salesperson_capital_balances` وقتی به‌عنوان
  `supabase_admin` بدون JWT خوانده شوند صفر می‌دهند، چون تعریفشان `uid()` دارد
  (تأیید مستقیم: `guarded_by_uid=true` برای هر چهار). اعداد واقعی در این سند از RPC های
  `SECURITY DEFINER` زیر JWT شبیه‌سازی‌شده آمده‌اند: **۸** و **۳۰۳**. در مقابل
  `v_customer_credit_exposure` گارد `uid()` **ندارد** (`guarded_by_uid=false`) پس صفرش واقعی است.
- **مسیرهای دامنه: ۳۴ فهرست‌شده · ۳۴ در برابر رجیستری بررسی‌شده · ۰ بررسی‌نشده.**
  ۲۴ در منو · ۳ redirect stub بی‌ضرر · ۴ drill-down بی‌ضرر · **۳ یتیم** (F27).
- **توابع دامنه: ۸۱ به‌نام فهرست‌شده.** از این‌ها **۳۰ تابع** تعریفشان خوانده یا مجوز/فراخوانندهٔ
  برنامه‌ای‌شان مستقیماً اندازه‌گیری شد. **۵۱ تابعِ باقی‌مانده فقط نام‌شان شمرده شد، نه بیشتر** —
  دلیل: بیرون از ۲۱ ادعای این مأموریت بودند و در دامنهٔ فیلترِ نامی افتاده‌اند نه در مسیر هیچ ادعا.
  این تنها بخشی است که **بسته نمی‌شود** و عمداً به‌عنوان بدهی گزارش می‌شود.
- **جست‌وجوهای فارسی (تعداد فایل‌های `src` حاوی هر عبارت):** تخصیص=۲۰ · پخش=۲ · قول=۰ · تعهد=۵ ·
  پیگیری=۲۶ · بدهکار=۷ · طلبکار=۰ · مطالبات=۷ · پرداختنی=۰ · سررسید=۷ · معوق=۱۲ · وصول=۳ ·
  مانده=۲۹ · نقدینگی=۰ · سرمایه=۱۳ · خزانه=۶ · تسویه=۳۲.

---

## UNVERIFIED / UNKNOWN

۱. **صفرِ دیدهٔ `call_logs` و `capital_allocation_ledger` برای هر دو نقش هیچ‌چیز دربارهٔ RLS ثابت
   نمی‌کند** — هر دو جدول در مبدأ ۰ ردیف دارند. برای آزمودن واقعیِ سیاست‌هایشان به ردیف آزمایشی نیاز
   است، که در این ممیزیِ فقط‌خواندنی مجاز نبود.
۲. **`vw_supplier_payables.product_summary` (F28)** از کاوش خودکار آمده و من فقط وجود ستون را دیدم؛
   ثابت‌بودن `NULL` را خودم دوباره اندازه نگرفتم. پیش از هر تصمیمی دوباره اندازه بگیر.
۳. **۵۱ تابع از ۸۱ تابع دامنه فقط شمرده شدند** — تعریفشان خوانده نشد. اگر نیمهٔ فراموش‌شدهٔ دیگری
   وجود داشته باشد، محتمل‌ترین جایش همین‌جاست.
۴. **چرا `customer_credit_profile` صفر ردیف دارد در حالی که `customer_credit_balance` ۲۴ ردیف دارد**
   — نویسندهٔ خنثی‌شده را خواندم، ولی ردیابی نکردم که قرار بوده کدام مسیر ردیف profile را بکارد.
۵. **آیا اختلاف ۵ از ۷ در DUP-2 رانش است یا طراحی** — واگرایی را اندازه گرفتم، ولی تاریخچهٔ مهاجرت را
   نخواندم تا بفهمم کدام‌یک قرار بوده مرجع باشد.
۶. **آیا `/operations/receipts` عمداً بازنشسته شده یا صرفاً ثبت نشده** — صفر لینک و صفر ورودی منو
   دیدم، ولی هیچ کامنت یا سندی که قصد را بگوید پیدا نکردم (برخلاف سه redirect stub که در
   `registry.ts:511-514` مستندند).
۷. **آیا خودِ نرم‌افزار آسان فیلد سقف اعتبار مشتری دارد که تخصیص را از راهی غیر از اکسل بگیرد** —
   `docs/asan/ASAN_BRIDGE.md` هیچ تطبیقی برای «تخصیص» یا `allocation` ندارد و من به آسان دسترسی
   ندارم. پاسخ «نه» در F16 فقط بر پایهٔ دفترها، layout ها و توابع همین مخزن است.
۸. **آیا بدنهٔ ۷٬۴۵۲ کاراکتری `run_daily_capital_allocation` منطق مطالبات را زیر نام دیگری دارد** —
   فقط برای دو رشتهٔ `compute_daily_capital` و `vw_customer_receivables` آزموده شد (هر دو false)؛
   کل بدنه خوانده نشد.
۹. **آیا مسیری سمت سرور یا سطح MCP این RPC های یتیم را با نامِ ساخته‌شده در زمان اجرا صدا می‌زند** —
   grep روی رشتهٔ لفظی بود. الگوهای این مخزن (`rpc("name")`) پوشش داده شدند، اما نامِ پویا نه.
۱۰. **هیچ‌چیز دربارهٔ سامانهٔ اصلی (`192.168.170.10`)** — به آن وصل نشدم. هر تفاوت شِما یا داده بین
    تست و سامانهٔ اصلی در این سند **نامعلوم** است.

---

## وضعیت گزارش

**PARTIAL.**

هر ۱۶ ادعای C1..C16 verdict گرفتند و هر ۵ مورد D1..D5 پاسخ گرفتند؛ حساب پوششِ relation ها (۳۳/۳۳)،
مسیرها (۳۴/۳۴) و ادعاها (۲۱/۲۱) بسته می‌شود.

آنچه نمی‌بندد و دلیل «کامل» ننوشتنم است: **از ۸۱ تابع دامنه، ۵۱ تا فقط شمرده شدند و تعریفشان خوانده
نشد.** با توجه به اینکه پنج مورد از یافته‌های این سند دقیقاً از خواندنِ تعریف توابع بیرون آمدند
(F17، F18، F19، F20، F23)، ادعای پوشش کامل بدون خواندن آن ۵۱ تا صادقانه نیست.
