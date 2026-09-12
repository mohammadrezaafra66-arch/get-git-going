# R-2 — حسگرهای «معوق»: نقشه، سه مجموعه، و رفتار FK

## حکم (خلاصه اجرایی)

**واگرایی زندهٔ فعلی بین سه حسگر «معوق»، صفر است.** با داده‌های واقعی prod (بعد از ۷۷ مهاجرت)، هر سه مجموعه —
صفحهٔ مطالبات (`vw_customer_receivables.is_overdue`)، مسدودکنندهٔ فاکتور (`can_issue_customer_invoice`)، و مسیر
پیش‌فاکتور (`get_customer_dynamic_credit` → `has_overdue`/`binding_constraint`) — روی همان ۲۷ مشتریِ متصل‌به‌پرونده
دقیقاً توافق دارند (اثبات با فراخوانی واقعی RPC، نه فقط خواندن تعریف — بخش تسک ۲). علتش این نیست که پیش‌شرط
`due_date IS NOT NULL` بی‌ضرر است؛ علتش این است که **در این عکس‌فوری از داده، هیچ ردیف `due_date_unknown` با ماندهٔ
باز وجود ندارد** (۰ ردیف، ثابت‌شده در تسک ۲). پیش‌شرط هنوز یک باگ نهفته است — با یک سناریوی مصنوعیِ برگشت‌پذیر در
تسک ۴ ثابت شد که وقتی چنین ردیفی پیدا شود، `can_issue_customer_invoice` اشتباهاً `true` برمی‌گرداند — ولی همین حالا
فعال نیست.

**واگرایی واقعی و بزرگی که همین حالا وجود دارد، چیز دیگری است و در بریف مأموریت نیامده بود:** ۸۹ هویت مهمان/بدون
پیوند مشتری (customer_id = NULL روی ۱۴۷ ردیف پیش‌فاکتور پذیرفته‌شدهٔ معوق) به مبلغ **۲۴٬۴۵۶٬۴۵۰٬۱۰۱ ریال** در صفحهٔ
مطالبات «معوق» دیده می‌شوند اما **اصلاً قابل ارزیابی توسط `can_issue_customer_invoice` یا `get_customer_dynamic_credit`
نیستند**، چون هر دو تابع پارامتر `p_customer_id uuid` را الزامی می‌گیرند و برای هویت بدون customer_id، تابعی برای
فراخوانی وجود ندارد. رفع پیش‌شرط `due_date IS NOT NULL` (verdict پیش‌فرض OG-D) **این شکاف را اصلاً لمس نمی‌کند** —
با پیش‌بینی آزموده‌شده در تسک ۴: اعمال محمولهٔ پیشنهادی، صفر ردیف مهمان را «می‌بیند» (۱۴۷ ردیف مهمان همچنان نامرئی
می‌مانند چون هنوز به customer_id نیاز دارند). این تفاوت را زیر «توصیه‌های خارج از دامنه» گزارش می‌کنم چون مأموریت
صریحاً محدود به سه حسگر customer_id-محور بود، نه به شکاف مهمان/شخص — ولی برای تصمیم OG-D حیاتی است چون نشان می‌دهد
اصلاح پیشنهادی مشکل بزرگ‌تر و واقعی‌تر امروز را حل نمی‌کند.

**FK (OG-F):** `audit_logs.actor_id` **nullable است** (`is_nullable = YES`) — فرض مأموریت مبنی بر احتمال NOT NULL رد
شد. بنابراین `ON DELETE SET NULL` بدون مانع کار می‌کند؛ با آزمایش BEGIN...ROLLBACK دوبار ثابت شد (تسک ۳): با تعریف
فعلی (`NO ACTION`) حذف actor با خطای نقض FK رد می‌شود؛ با `SET NULL` حذف موفق می‌شود و ردیف audit باقی می‌ماند با
`actor_id = NULL`.

**اصلاح تک‌نقطه‌ای کافی است:** `get_customer_dynamic_credit` و `calculate_customer_realtime_credit` هر دو مستقیماً
`can_issue_customer_invoice` را صدا می‌زنند، و `create_sales_quote_with_items` (اجراکنندهٔ واقعی مسیر پیش‌فاکتور)
`get_customer_dynamic_credit` را صدا می‌زند. یعنی تغییر محمولهٔ `can_issue_customer_invoice` به‌تنهایی B، C، و مسیر
پیش‌فاکتور را هم‌زمان همسو می‌کند — نیازی به تغییر جداگانه در مسیر پیش‌فاکتور نیست. اثبات با تست سنتتیک قبل/بعد در
تسک ۴.

---

## STEP 0 — اثبات بازیابی

- دامپ منبع: `D:\AfraKalaTest\app\dumps\prod-20260913.dump` (میزبان: `/tmp/prod13.dump` در کانتینر)
- md5 داخل کانتینر: `docker exec afrakala-lan-db md5sum /tmp/prod13.dump` → **`6ccd2dbb07a9a4d9bbae4421eb3265e0`** — مطابق مقدار مورد انتظار (E3).
- `CREATE DATABASE prod_rehearsal_r2;` → `CREATE DATABASE` (exit 0).
- `pg_restore -U supabase_admin -d prod_rehearsal_r2 --no-owner --disable-triggers /tmp/prod13.dump` → **۲۱ خطای نادیده‌گرفته‌شده**، همه از نوع `schema "cron" does not exist` (۱۳ خط GRANT/ALTER DEFAULT PRIVILEGES روی schema `cron` + ۱ `setval` روی `cron.runid_seq`؛ باقی هم همان الگو، مجموعاً ۲۱ عدد که خودِ pg_restore با `warning: errors ignored on restore: 21` گزارش کرد) — دقیقاً همان‌طور که پیش‌بینی شده بود (pg_cron/vault). **خطای بارگذاری داده: صفر.**
- ledger: `SELECT count(*), max(version) FROM supabase_migrations.schema_migrations;` → **`681|20260912150000`** — دقیقاً مقدار مورد انتظار. (E3)
- پاک‌سازی در پایان: `DROP DATABASE prod_rehearsal_r2;` → `DROP DATABASE`؛ تأیید نهایی با `SELECT datname FROM pg_database;` — `prod_rehearsal_r2` در فهرست نیست (بقیهٔ دیتابیس‌های scratch — `prod_rehearsal_r1`, `prod_rehearsal_20260908` — دست‌نخورده باقی ماندند).

**نکتهٔ روشی:** `vw_customer_receivables` در انتهای تعریفش شرط `WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())`
دارد. زیر `supabase_admin` بدون JWT، `uid()` مقدار `NULL` برمی‌گرداند و **کل view صفر ردیف می‌دهد** — این یک تلهٔ سکوت
است (نه خطا، فقط ۰ سطر). برای همهٔ کوئری‌های تسک ۲ و ۴، طبق قانون امنیتی ردیف ۷ فایل CLAUDE.md، داخل یک نشست SQL
(بدون تغییر داده) این را ست کردم:
`SET request.jwt.claims = '{"sub":"4084224a-cd34-4632-9cbc-3b5f3581cf6e","role":"authenticated"}';`
(یک `user_id` واقعی با نقش `admin` در `user_roles`). فقط `SET` (نه `SET LOCAL`/تغییر role) کافی بود؛ `SET ROLE
authenticated` را امتحان کردم و به `permission denied for view vw_customer_receivables` خورد (grantهای مستقیم روی
view به نقش‌های PostgREST محدودند)، پس همان‌طور ماندم که `supabase_admin` باشم و فقط JWT claim را شبیه‌سازی کردم.

---

## تسک ۱ — فهرست حسگرهای «معوق»

منبع همهٔ تعاریف: `pg_get_viewdef` / `pg_get_functiondef` روی `prod_rehearsal_r2` (نه فایل‌های migration).

| حسگر | محمولهٔ دقیق | چه چیزی می‌خواند |
|---|---|---|
| `vw_customer_receivables.is_overdue` | `src.due_date IS NOT NULL AND src.due_date < tehran_today() AND src.outstanding_amount > 0::numeric` | `sales_quotes` (status='accepted') LEFT JOIN `customers`, `settlement_types`؛ `due_date` از `accepted_at + settlement_days` محاسبه می‌شود؛ `payment_receipt_links`+`payment_receipts` برای مبلغ پرداخت‌شدهٔ تأییدشده |
| `vw_customer_receivables.due_date_unknown` | `src.due_date IS NULL` (که یعنی `accepted_at IS NULL` یا `settlement_type` یافت نشد یا `is_active=false AND days=0`) | همان منبع بالا؛ `due_date_unknown_reason` یکی از `no_accepted_at` / `no_settlement_type` / `inactive_zero_days` است |
| `get_receivables_list` | فیلتر `overdue` = `v.is_overdue`؛ خودِ view را مستقیم می‌خواند، منطق جدا ندارد | `vw_customer_receivables` + `sales_quotes`/`profiles` برای فروشنده + `customer_capital_allocations_dynamic` برای سقف |
| `get_receivables_summary` | `overdue_outstanding` = `SUM(outstanding_amount) FILTER (WHERE is_overdue)`؛ ستون‌های جدا `due_date_unknown_outstanding`/`count_due_date_unknown` هم دارد (از مهاجرت ۴۵۸) | `vw_customer_receivables` |
| `can_issue_customer_invoice` (مهاجرت ۴۵۴) | `r.is_overdue = true AND r.outstanding_amount > 0` روی `vw_customer_receivables` گروه‌بندی‌شده به‌ازای `customer_id` | `vw_customer_receivables` |
| `get_customer_dynamic_credit` | `has_overdue` = `NOT (can_issue_customer_invoice(p_customer_id)).can_issue`؛ دیگر مستقیماً از `customer_credit_profile.has_overdue` نمی‌خواند (کامنت مهاجرت ۴۵۴: «۰ ردیف، همیشه false بود») | `can_issue_customer_invoice` + `customer_capital_allocations_dynamic` برای سقف |
| `calculate_customer_realtime_credit` | `v_has_overdue` = `NOT (can_issue_customer_invoice(p_customer_id)).can_issue`؛ اگر true باشد، `binding_constraint='overdue'` و `final_limit=0` برمی‌گرداند | همان، به‌علاوه `customer_credit_profile.credit_limit` |
| نویسندهٔ `binding_constraint='overdue'` | فقط `calculate_customer_realtime_credit` (و `get_customer_dynamic_credit` با متن آزاد، نه دقیقاً همین رشته) این رشته را برمی‌گردانند؛ `create_sales_quote_with_items`, `recompute_dynamic_capital_setting`, `run_daily_capital_allocation` هم `binding_constraint` را در body دارند ولی برای مقادیر دیگر (`formula`/`credit_limit`/`no_capital`/`no_salesperson`) | — |
| `customer_credit_profile.has_overdue` | ستون **مرده** است. `update_customer_overdue_status(_customer_id)` تنها نویسندهٔ آن است و از مهاجرت ۳۳۱ به بعد `v_overdue_since := NULL;` را بی‌قید‌وشرط ست می‌کند (کامنت خودِ تابع: منبع قدیمی صفر ردیف داشت). هیچ trigger یا cron ای این تابع را در `prod_rehearsal_r2` صدا نمی‌زند (`pg_trigger` جست‌وجو شد، صفر نتیجه؛ `cron.job` در این دیتابیس اصلاً وجود ندارد چون pg_cron جزو ۲۱ خطای بی‌ضرر بازیابی نشد). این ستون امروز در تصمیم‌گیری هیچ حسگری شرکت نمی‌کند. | `customer_credit_profile` (فقط نوشته می‌شود، خوانده نمی‌شود) |
| بلاک‌کنندهٔ سمت سرور واقعیِ مسیر پیش‌فاکتور | `create_sales_quote_with_items` — `IF COALESCE(_credit.has_overdue,false) OR COALESCE(_credit.binding_constraint,'')='overdue' THEN ...` که `_credit` از `get_customer_dynamic_credit(p_customer_id)` می‌آید | `get_customer_dynamic_credit` |
| بلاک‌کنندهٔ سمت کلاینت | `src/routes/_app.sales.quotes.new.tsx:220-237` — همان `get_customer_dynamic_credit` را RPC می‌زند و `hasOverdue = row.has_overdue \|\| row.binding_constraint === "overdue"` می‌سازد (خط ۲۳۴)؛ در `findCreditBlocker` (خط ۴۰۰-۴۴۰) اگر `creditInfo.hasOverdue` باشد `kind:"overdue"` برمی‌گرداند (خط ۴۰۹-۴۱۶) | فقط UX است — enforcement واقعی سمت سرور در `create_sales_quote_with_items` است، نه اینجا (مطابق قانون ۶ CLAUDE.md، فرانت مجوزدهنده نیست) |
| `QuoteCreationBlockDialog.tsx` | متن دیالوگ خودش را دارد («این مشتری مانده معوق دارد...»، خط ۱۳۱) — **این متن با متن مأموریت (کارت workbench) یکی نیست**؛ فقط `kind==="overdue"` را از همان state بالا مصرف می‌کند | — |
| کارت workbench (متن الزامی مأموریت) | `src/routes/_app.accounting.allocation-workbench.tsx:513-521` — `signal.reason` را **عیناً** از خروجی `can_issue_customer_invoice` چاپ می‌کند («جملهٔ دلیل را `can_issue_customer_invoice` برای حسابدار می‌نویسد و همان‌طور که هست چاپ می‌شود» — کامنت خط ۵۱۳) | `can_issue_customer_invoice` |

---

## تسک ۲ — سه مجموعه (شاهد اصلی برای OG-D)

همهٔ اعداد روی `prod_rehearsal_r2` با JWT شبیه‌سازی‌شدهٔ ادمین، پس از STEP 0.

### تعریف هویت (این خودش یک یافته است)
`COUNT(DISTINCT customer_id)` بی‌صدا NULLها را نادیده می‌گیرد. صفحهٔ مطالبات ولی سطر به سطر (`customer_id`,
`customer_name`) را نشان می‌دهد، نه گروه‌بندی‌شده. بین ۱۹۴ ردیف کل view (که در این عکس‌فوری **همه** معوق‌اند، چون
تاریخ سیستم ۲۰۲۶-۰۹-۱۲ است و همهٔ `due_date`ها بین ۱۶ مرداد تا ۸ شهریور هستند)، ۱۴۷ ردیف `customer_id IS NULL`
دارند — پیش‌فاکتورهای پذیرفته‌شده بدون اتصال به پروندهٔ مشتری (مسیر استثنای `guest_no_link`).

### |A|, |B|, |C|

| مجموعه | تعریف | عدد | واحد شمارش |
|---|---|---|---|
| A (کل، هر هویتی که صفحه «معوق» نشان می‌دهد) | `is_overdue=true` گروه‌بندی به `(customer_id یا نام مهمان)` | **۱۱۶** هویت (۲۷ مشتری متصل + ۸۹ گروه‌نامِ مهمان) | هویت مشتری/مهمان (نه ردیف) |
| A روی زیرمجموعهٔ متصل (customer_id NOT NULL) | همان، محدود به customer_id موجود | **۲۷** مشتری | مشتری |
| B (RPC واقعی) | فراخوانی زندهٔ `can_issue_customer_invoice(customer_id)` برای هر ۲۷ customer_id دیده‌شده در view؛ `can_issue=false` شمرده شد | **۲۷** مشتری | مشتری (فقط متصل — تابع برای NULL خطای `22023` می‌دهد) |
| C (RPC واقعی) | فراخوانی زندهٔ `get_customer_dynamic_credit(customer_id)` برای همان ۲۷؛ `has_overdue OR binding_constraint='overdue'` شمرده شد | **۲۷** مشتری | مشتری |

### تفاضل‌های زوجی

| تفاضل | تعداد | مبلغ (ریال) | چرا |
|---|---|---|---|
| A(متصل) − B | ۰ | ۰ | هر دو از همان `is_overdue` می‌آیند؛ تأیید با فراخوانی واقعی RPC روی هر ۲۷ مشتری، همه `can_issue=false` |
| B − A(متصل) | ۰ | ۰ | — |
| A(متصل) − C | ۰ | ۰ | تأیید با فراخوانی واقعی RPC؛ همه‌ی ۲۷ مشتری `has_overdue=true` |
| C − A(متصل) | ۰ | ۰ | — |
| B − C | ۰ | ۰ | `get_customer_dynamic_credit` داخلاً `can_issue_customer_invoice` را صدا می‌زند، پس نمی‌توانند واگرا شوند مگر `customers.person_id IS NULL` باشد — بررسی شد: صفر مورد از این ۲۷ نفر `person_id` تهی دارند |
| C − B | ۰ | ۰ | — |
| **A(کل) − B** | **۸۹ هویت مهمان** | **۲۴٬۴۵۶٬۴۵۰٬۱۰۱** | `can_issue_customer_invoice` پارامتر `p_customer_id uuid` را الزامی می‌گیرد (`IF p_customer_id IS NULL THEN RAISE EXCEPTION`)؛ برای هویت‌های بدون customer_id اصلاً چیزی برای فراخوانی وجود ندارد — نه باگ محمول، بلکه نبودِ کلید |
| **A(کل) − C** | **۸۹ هویت مهمان** | **۲۴٬۴۵۶٬۴۵۰٬۱۰۱** | همان دلیل |
| B − A(کل)، C − A(کل) | ۰ | ۰ | B و C زیرمجموعهٔ سخت‌گیرانه‌تر A هستند |

### نمونه از ۸۹ هویت مهمان (۱۰ مورد بزرگ، از کل جدول کامل که استخراج شد)

| نام | شمارهٔ پیش‌فاکتور | مبلغ باز | سررسید |
|---|---|---|---|
| احسان اربابی | SQ-2026-000067 | ۱٬۰۸۳٬۵۰۰٬۰۰۰ | ۱۴۰۵/۰۶/۰۴ (۲۰۲۶-۰۸-۲۶) |
| بیدار | SQ-2026-000038 | ۱٬۰۷۰٬۰۰۰٬۰۰۰ | ۲۰۲۶-۰۸-۱۸ |
| اسماعیل پیرایش ۱۳۲۰۰۱ | SQ-2026-000194 | ۸۹۵٬۶۰۰٬۰۰۰ | ۲۰۲۶-۰۹-۰۸ |
| رضا کمالی | SQ-2026-000132 | ۶۵۹٬۱۰۰٬۰۰۰ | ۲۰۲۶-۰۹-۰۱ |
| رضا کمالی | SQ-2026-000167 | ۶۵۷٬۱۰۰٬۰۰۰ | ۲۰۲۶-۰۹-۰۱ |

**هشدار [A-8] دربارهٔ واحد شمارش:** «۸۹ هویت» یعنی ۸۹ رشتهٔ متمایز `customer_name`، **نه لزوماً ۸۹ شخص واقعی متمایز**.
نام‌هایی مثل «بیدار» (۳ بار)، «درخشان پور» (۲ بار)، «آقای شهریار کبیری»/«اقای شهریار کبیری» (۲ بار، احتمالاً همان نفر با
املای متفاوت)، و «اصحابی»/«محمد اصحابی» (که یکی از آن‌ها *هم* یک مشتری متصل با همین نام دارد: `bd16ccb0-...`) نشان
می‌دهد شمارش بر مبنای متن نام، بالاسنج (نه دقیق) است — ممکن است چند ردیف واقعاً یک نفر باشند و مبلغ واقعی معوق برای
آن نفر بیشتر از هر ردیف تنها باشد. این خودش مصداق نیاز به «هستهٔ اشخاص یکپارچهٔ فاز ۲» است که CLAUDE.md به آن اشاره
می‌کند، نه چیزی که این مأموریت باید حل کند.

### due_date_unknown (سناریوی توصیف‌شده در بریف مأموریت)

`SELECT count(*) FROM vw_customer_receivables WHERE due_date_unknown AND outstanding_amount > 0;` → **۰** روی کل
۱۹۴ ردیف view (نه فقط ۲۷ مشتری متصل). بررسی مستقیم `sales_quotes` (نه از دریچهٔ view) هم همین را تأیید کرد: از میان
همهٔ پیش‌فاکتورهای `status='accepted'`، صفر مورد `accepted_at IS NULL` دارند، صفر مورد `settlement_type_id` گمشده
دارند، صفر مورد `is_active=false AND days=0` دارند. یعنی **هم‌اکنون هیچ ردیف due_date_unknown با بدهی باز در prod
وجود ندارد** — پیش‌شرط `due_date IS NOT NULL` امروز هیچ مشتری واقعی را از A/B/C نمی‌اندازد. (این باگ نهفته، نه
غایب، است — تسک ۴.)

---

## تسک ۳ — FK (`audit_logs_actor_id_fkey`, OG-F)

- `audit_logs.actor_id`: **`is_nullable = YES`** (`information_schema.columns`). فرض بریف مأموریت («اگر NOT NULL
  باشد SET NULL کار نمی‌کند») رد شد — این ستون از قبل nullable است.
- تعریف فعلی: `FOREIGN KEY (actor_id) REFERENCES users(id)` — `confdeltype = 'a'` (**NO ACTION**).
- ۷۵ FK دیگر در schema `public` به `auth.users` اشاره می‌کنند (فهرست کامل استخراج شد). الگوی رایج:
  - ستون‌های **audit/history-محور** (`audit_logs.actor_id`, `documents.reviewed_by/uploaded_by`,
    `document_status_history.changed_by`, `delivery_receipt_status_history.changed_by`,
    `purchase_request_status_history.changed_by`, `user_roles.assigned_by`, `person_identifiers.verified_by`, ...)
    اکثراً **`NO ACTION`** هستند — یعنی حذف کاربر را وقتی سابقه دارد، مسدود می‌کنند.
  - ستون‌های **created_by/updated_by اداری** (`daily_capital_settings.created_by`, `sales_reminders.created_by`,
    `dynamic_entity_scores.scored_by`, `automation_jobs.created_by`, `customer_capital_allocations_dynamic.salesperson_id`, ...)
    اغلب **`ON DELETE SET NULL`** هستند.
  - ردیف‌های هویتی/جلسه‌ای (`sessions`, `identities`, `mfa_factors`, `messenger_group_members`, `one_time_tokens`,
    `profiles`) طبیعتاً **`CASCADE`** هستند (بخشی از خودِ کاربر).

### اثبات BEGIN...ROLLBACK (E4، دو نیمه)

**نیمهٔ قرمز — رفتار فعلی:** ایجاد یک actor موقت در `auth.users`، نوشتن یک ردیف `audit_logs` با `actor_id` = آن actor،
سپس `DELETE FROM auth.users WHERE id=...`:
```
ERROR:  update or delete on table "users" violates foreign key constraint "audit_logs_actor_id_fkey" on table "audit_logs"
DETAIL:  Key (id)=(00000000-0000-0000-0000-00000000ee01) is still referenced from table "audit_logs".
```
حذف مسدود شد (رفتار فعلی درست است — امروز نمی‌توان کاربری با سابقهٔ audit را حذف کرد).

**نیمهٔ سبز — با `ON DELETE SET NULL`:** در یک تراکنش **جدا** (`BEGIN`)، محدودیت را موقتاً به `SET NULL` عوض کردم،
همان سناریو را تکرار کردم:
```
DELETE 1
   id   | actor_id | entity_type |  action  |          diff
 113830 |          | r2_test     | r2_probe | {"note": "... SET NULL variant, rolled back"}
```
حذف موفق شد و ردیف audit با `actor_id = NULL` باقی ماند. سپس `ROLLBACK`.

**تأیید تمیزی بعد از هر دو ROLLBACK:**
- `SELECT count(*) FROM public.audit_logs WHERE entity_type='r2_test';` → `0`
- `SELECT count(*) FROM auth.users WHERE email LIKE 'r2-throwaway%';` → `0`
- `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='audit_logs_actor_id_fkey';` → هنوز
  `FOREIGN KEY (actor_id) REFERENCES users(id)` (بدون `ON DELETE`، یعنی `NO ACTION` دست‌نخورده ماند)

**نتیجه برای OG-F:** چون `actor_id` nullable است، مسیر پیشنهادی مأموریت (`SET NULL`) بدون مانع فنی اجرا می‌شود. اما
این یک **تصمیم محصول** است، نه صرفاً فنی: `NO ACTION` امروز عمداً مانع حذف کاربری با سابقهٔ audit می‌شود (حفاظت از
تاریخچه)؛ تغییر به `SET NULL` این حفاظت را برمی‌دارد و اجازه می‌دهد ردیف‌های audit با actor گمنام باقی بمانند. اگر
هدف OG-F واقعاً «امکان حذف کاربر» است، `SET NULL` درست است؛ اگر هدف «هرگز کاربری با ردیف audit حذف نشود» است، تغییر
FK اشتباه است و راه‌حل باید anonymize-in-place (بدون حذف واقعی) باشد. R-2 این تصمیم را نمی‌گیرد — فقط ثابت می‌کند
هر دو مسیر فنی ممکن‌اند.

---

## تسک ۴ — محمولهٔ دقیق پیشنهادی OG-D و اثبات

### محمولهٔ دقیق (فقط همین یک خط عوض می‌شود)

در `can_issue_customer_invoice`، خط:
```sql
WHERE r.customer_id = p_customer_id
  AND r.is_overdue = true
  AND r.outstanding_amount > 0;
```
می‌شود:
```sql
WHERE r.customer_id = p_customer_id
  AND (r.is_overdue OR r.due_date_unknown)
  AND r.outstanding_amount > 0;
```
(شرط `outstanding_amount > 0` عملاً افزونه است چون منبع `vw_customer_receivables` از قبل تضمین می‌کند، اما برای
خوانایی و برابری با کد فعلی حفظ شد.) متن `reason`، امضای تابع، و بقیهٔ بدنه **بدون تغییر** می‌مانند — کارت workbench
(`allocation-workbench.tsx:521`) این رشته را عیناً چاپ می‌کند و در تست زیر بایت‌به‌بایت یکسان ماند.

### آیا مسیر پیش‌فاکتور هم باید جدا تغییر کند؟ نه.

زنجیرهٔ فراخوانی زنده (از خودِ `pg_get_functiondef`، نه فرض):
`create_sales_quote_with_items` ← `get_customer_dynamic_credit` ← `can_issue_customer_invoice` (و
`calculate_customer_realtime_credit` هم مستقیماً `can_issue_customer_invoice` را صدا می‌زند). اصلاح تک‌نقطه‌ای در
`can_issue_customer_invoice` برای B، C، و مسیر پیش‌فاکتور **هم‌زمان** جاری می‌شود.

### اثبات E4 (سناریوی سنتتیک، چون هیچ due_date_unknown واقعی در snapshot نیست)

داخل `BEGIN...ROLLBACK`: یک شخص/مشتری ساختگی + یک `sales_quote` با `status='accepted'` و `customer_id` معتبر ولی
بدون `settlement_type_id` تزریق شد (که خودش را `due_date_unknown=true, due_date_unknown_reason='no_settlement_type',
is_overdue=false` نشان داد — دقیقاً همان سناریوی «بدهی واقعی، سررسید نامعلوم»):

| مرحله | `can_issue` | `overdue_amount` | `reason` |
|---|---|---|---|
| **قبل** (تابع فعلی) | `true` (باگ: اجازهٔ فاکتور می‌دهد) | `0` | `NULL` |
| **بعد** (بازنویسی پیشنهادی) | `false` | `50000000` | `این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.` (بایت‌به‌بایت مطابق مأموریت) |

پایین‌دستی: `get_customer_dynamic_credit` روی همان مشتری بعد از پچ → `has_overdue=t` (قبل از پچ `f` بود؛ چون داخلاً
`can_issue_customer_invoice` را صدا می‌زند، بدون تغییر جداگانه به‌روز شد).

**عدم تخریب:** با تابع پچ‌شده، دوباره B واقعی را روی همان ۲۷ مشتریِ موجود (منهای مشتری مصنوعی) گرفتم:
`real_B_unchanged = 27 / total = 27` — یعنی پچ هیچ مشتری واقعی موجود را false-negative/false-positive نمی‌کند.

بعد از `ROLLBACK`: تابع به نسخهٔ اصلی برگشت (`function_still_patched = f`)، مشتری/شخص/پیش‌فاکتور مصنوعی حذف شدند
(`synthetic_rows_left = 0`).

### آیا این محمول سه مجموعه را «همگرا» می‌کند؟

روی داده‌های *واقعی* امروز: بله، به‌طور بی‌اثر — چون از قبل همگرا بودند (۰ ردیف due_date_unknown). روی سناریوی
سنتتیک: بله، مستقیماً اثبات شد. **ولی این محمول شکاف بزرگ‌تر (۸۹ هویت مهمان، ۲۴٫۴۶ میلیارد ریال) را اصلاً لمس
نمی‌کند** — چون آن شکاف دربارهٔ نبودِ `customer_id`ست، نه NULL بودن `due_date`. این دو مسئلهٔ مجزا هستند و
پیش‌فرض OG-D فقط دومی (که امروز غیرفعال است) را می‌بندد، نه اولی (که امروز ۲۴٫۴۶ میلیارد ریال فعال است).

---

## آنچه تأیید نشد

- نتوانستم بین اجرای واقعی سناریوی `due_date_unknown` روی داده‌های *تاریخی* prod (قبل از این عکس‌فوری) و نبود آن در
  عکس فعلی تمایز بگذارم — شاید قبلاً چنین ردیف‌هایی بوده و دستی/با مهاجرت ۴۵۸ اصلاح شده‌اند؛ این یک فرضیه است، نه
  ادعا (بررسی `audit_logs` یا تاریخچهٔ migration 458 برای این موضوع در دامنهٔ R-2 نبود).
- ندیدم که آیا مسیر UI دیگری (غیر از سه فایل گزارش‌شده در تسک ۱) هم متن یا منطق «معوق» را مستقل بازتولید می‌کند —
  جست‌وجو با `Grep` محدود به رشته‌های مشخص بود، نه یک بازبینی کامل UI.
- عدد ۸۹ هویت مهمان یک **حد بالا بر اساس نام متنی** است، نه شمارش اشخاص واقعی (نگاه کنید به هشدار [A-8] در تسک ۲).
- آزمایش FK فقط `audit_logs` را پوشاند؛ رفتار ۷۴ FK دیگر به‌صورت تک‌تک آزموده نشد (فقط تعریف/`confdeltype` آن‌ها
  خوانده شد، نه رفتارشان زیر DELETE واقعی).

## توصیه‌های خارج از دامنه

- شکاف ۸۹ هویت مهمان / ۲۴٫۴۶ میلیارد ریال (بالا) یک تصمیم محصول جداگانه لازم دارد: یا این پیش‌فاکتورها باید در زمان
  ثبت به `customer_id` وصل شوند (رفع علت اصلی، نه اثر)، یا `can_issue_customer_invoice`/`get_customer_dynamic_credit`
  باید یک مسیر دوم برای شناسایی مهمان (نام+تلفن) بپذیرند — که با معماری فعلی (کلید uuid) ناسازگار است و به هستهٔ
  اشخاص یکپارچهٔ فاز ۲ (که CLAUDE.md به آن اشاره می‌کند) مرتبط است. **این احتمالاً باگ مهم‌تری از OG-D است.**
- `customer_credit_profile.has_overdue`/`overdue_since` ستون‌های کاملاً مرده‌اند (نویسنده‌شان هارد-کد NULL می‌گذارد،
  هیچ trigger/cron آن را صدا نمی‌زند). یا باید حذف/مستندسازی شوند به‌عنوان deprecated، یا اگر قرار است دوباره زنده
  شوند باید منبع جدیدشان صریحاً `vw_customer_receivables` باشد تا با بقیهٔ حسگرها هم‌خوان بماند.
- تفاوت الگوی `NO ACTION` در ۱۵+ ستون audit/history-محور دیگر (`documents`, `purchase_requests`,
  `document_status_history`, ...) در برابر `SET NULL` در ستون‌های اداری، ناسازگار به نظر می‌رسد اگر تصمیم OG-F عمومی
  شود — شایسته‌ی یک بازبینی سیاست یکپارچه به جای تغییر تک‌ستونی `audit_logs`.
- برچسب `due_date_unknown_reason='no_settlement_type'` در تست من با `settlement_type_id=NULL` فعال شد، نه
  `no_accepted_at` که انتظار داشتم — به نظر می‌رسد یک trigger مقدار `accepted_at` را هنگام `status='accepted'` خودکار
  پر می‌کند؛ این trigger مستقیماً بررسی نشد و خارج از دامنهٔ R-2 است.

## حکم: COMPLETE
