# برنامه اصلاح موارد 211 تا 218

این برنامه اصلاح فقط پیشنهاد است. در ممیزی فعلی هیچ اصلاحی انجام نشده است.

## اولویت 1 — تکمیل کنترل‌های حیاتی پیش‌فاکتور

### 212.8 — قطعی‌سازی موجودی و Race Condition

Root cause:
- UI قبل از قطعی‌سازی موجودی را بررسی می‌کند، اما از شواهد فعلی transactional بودن کسر موجودی و جلوگیری از race/double finalize کامل اثبات نشد.

فایل‌ها/بخش‌های درگیر:
- `src/routes/_app.sales.quotes.$quoteId.tsx`
- `src/lib/warehouses/queries.ts`
- SQL function مربوط به تغییر وضعیت/قبول پیش‌فاکتور
- جدول‌های `warehouse_stock`, `sales_quotes`, `sales_quote_items`

اصلاح پیشنهادی:
1. در Backend و در همان transaction تغییر وضعیت به `accepted`:
   - quote را `FOR UPDATE` قفل کند.
   - آیتم‌ها را بخواند.
   - ردیف‌های `warehouse_stock` را `FOR UPDATE` قفل کند.
   - اگر موجودی ناکافی است exception واضح بدهد.
   - فقط اگر quote قبلاً accepted نشده، موجودی را کم کند.
2. idempotency برای finalize اضافه شود.
3. audit log برای deduction ثبت شود.
4. تست همزمان دو درخواست برای یک کالا با موجودی محدود اضافه شود.

Acceptance Criteria:
- دو کاربر همزمان نمی‌توانند موجودی را منفی کنند.
- finalize دوباره موجودی را دوباره کم نمی‌کند.
- خطا شامل نام کالا، انبار، تعداد درخواستی و موجودی فعلی است.

## اولویت 2 — workflow تعهدات 212

### 212-B و 212-C — پیگیری تعهد معوق/کسری

Root cause:
- متن و snapshot تعهد ذخیره می‌شود، اما workflow اجرای تعهد، deadline، اتصال فیش، وضعیت ایفای تعهد و گزارش عدم ایفای تعهد کامل نیست.

Database احتمالی:
- جدول جدید `sales_quote_commitments`
  - `id`
  - `quote_id`
  - `customer_id`
  - `salesperson_id`
  - `type`
  - `amount`
  - `minutes`
  - `deadline_at`
  - `business_day`
  - `commitment_text`
  - `status`: `pending`, `fulfilled`, `breached`, `waived`
  - `fulfilled_receipt_id`
  - `created_at`, `created_by`
  - `reviewed_at`, `reviewed_by`

Frontend:
- در popupهای `QuoteCreationBlockDialog` deadline واقعی را نشان بدهد.
- در جزئیات quote کارت «تعهدات» اضافه شود.
- در داشبورد فروشنده «تعهدات در انتظار» نمایش داده شود.
- حسابداری بتواند فیش واریزی را به تعهد link کند.

Backend:
- هنگام create quote، تعهد در جدول جدا ذخیره شود.
- هنگام ثبت فیش مرتبط، وضعیت `fulfilled` شود.
- job/read-only query برای تعهدات overdue ساخته شود.

Audit:
- create/fulfill/breach/waive همه audit شوند.

Acceptance Criteria:
- تعهد بعد از reload دیده شود.
- deadline قابل محاسبه و گزارش باشد.
- فیش به تعهد وصل شود.
- تعهد نقض‌شده قابل گزارش باشد.

### 212.9 — تأیید حسابداری واقعی

Root cause:
- مسیر فعلی self-attestation است؛ فروشنده می‌گوید از خانم ماهرو تأیید گرفته، اما approval واقعی وجود ندارد.

دو گزینه تصمیم کارفرما:
1. اگر self-attestation کافی است: UI باید صریح بنویسد «اظهار فروشنده» نه «تأیید واقعی».
2. اگر approval واقعی لازم است:
   - جدول `quote_accounting_approvals`
   - درخواست approval توسط فروشنده
   - تأیید/رد توسط حسابدار مجاز
   - فقط بعد از approval واقعی امکان ثبت یا فعال‌سازی quote باشد.

Acceptance Criteria برای approval واقعی:
- فروشنده به‌تنهایی نتواند مسیر را کامل کند.
- حسابدار مشخص، زمان تأیید و متن ثبت شود.
- رد approval دلیل داشته باشد.

## اولویت 3 — تکمیل 211 اعلان ماندگار

Root cause:
- notification عمومی وجود دارد، اما popup ماندگار اختصاصی صفحه اصلی که تا «دیده شد» حذف نشود به‌صورت کامل اثبات نشد.

Frontend:
- در Dashboard یا AppShell، query برای unread `quote_rejected` notifications اضافه شود.
- اگر unread وجود دارد، modal/alert اجباری نمایش داده شود.
- دکمه «دیده شد» به `mark_notification_read` وصل شود.
- فقط reference مربوط به کاربر فعلی نمایش داده شود.

Backend:
- اگر لازم است نوع `quote_rejected` در notification_queue حفظ شود.
- RLS فعلی `nq_select_own_or_admin` و `nq_update_own` کافی به نظر می‌رسد، اما تست role لازم است.

Acceptance Criteria:
- فروشنده بعد از login تا زدن «دیده شد» popup را ببیند.
- کارشناس دیگر آن را نبیند.
- بعد از seen و reload دیگر نمایش داده نشود.

## اولویت 4 — تست و سخت‌سازی 213

Root cause:
- کد refresh ساخته شده، اما صحت end-to-end عددی با سناریوی کنترل‌شده هنوز اثبات نشده است.

کارهای لازم:
1. seed تستی کنترل‌شده برای:
   - salesperson با score غیرصفر
   - customer مرتبط با score غیرصفر
   - capital setting امروز
2. اجرای `run_daily_capital_allocation`
3. تغییر score و بررسی trigger/recompute
4. مقایسه دستی فرمول با UI و DB
5. تست حالت ledger exists و skip

Acceptance Criteria:
- بعد از تغییر score، سقف اعتبار مشتری بدون صفر ماندن refresh شود.
- اگر customer مانع `overdue/no_salesperson/no_capital` دارد، reason panel درست نشان دهد.

## اولویت 5 — 214.1 جلوگیری از hallucination در Purchase Advisor

Root cause:
- فروشندگان واقعی وارد prompt می‌شوند، اما مدل هنوز ممکن است پاسخ آزاد بسازد.

اصلاح پیشنهادی:
1. خروجی AI را structured JSON کند:
   - `recommended_suppliers`
   - `whatsapp_sellers_used`
   - `has_whatsapp_sellers`
   - `unknowns`
2. بعد از پاسخ مدل، نام فروشندگان را با لیست منبع validate کند.
3. اگر مدل فروشنده خارج از منبع آورد، یا حذف کند یا هشدار بدهد.
4. در UI بخش «فروشندگان واقعی از واتساپ» را جدا از متن AI نشان دهد.

Acceptance Criteria:
- محصول دارای فروشنده، همان فروشندگان واقعی را نشان دهد.
- محصول فاقد فروشنده، فروشنده خیالی تولید نکند.

## اولویت 6 — تکمیل 218

Root cause:
- marker ذخیره/نمایش/اکسل دارد، اما فیلتر اختصاصی و تست ثبت واقعی انجام نشده است.

اصلاح پیشنهادی:
1. فیلتر «نوع سند: اسکرین‌شات همراه بانک» در لیست فیش‌ها اضافه شود.
2. در detail و export همین فیلتر قابل مشاهده باشد.
3. اگر OCR/آپلود بتواند screenshot بودن را تشخیص دهد، فقط پیشنهاد دهد نه auto-enforce.
4. تست E2E ثبت فیش با checkbox و upload انجام شود.

Acceptance Criteria:
- checkbox بعد از reload بماند.
- list/filter/export مقدار درست نشان دهند.
- upload تصویر مستقل از checkbox خراب نشود.

## 215 و 216

وضعیت:
- نیازمندی تجاری در فایل مأموریت وجود ندارد.
- فقط migrationهای فنی مرتبط دیده شد.

اقدام پیشنهادی:
- از کارفرما متن نیازمندی رسمی 215 و 216 گرفته شود.
- تا آن زمان اصلاح جدید در scope 211-218 انجام نشود.

## ترتیب اجرای پیشنهادی

1. تست کنترل‌شده 211 و 212 با داده غیرواقعی.
2. تکمیل transactional finalize موجودی.
3. ساخت جدول و workflow تعهدات 212.
4. تصمیم درباره self-attestation یا approval واقعی 212.9.
5. popup ماندگار 211 در AppShell/Dashboard.
6. تست عددی 213 و اصلاح احتمالی.
7. hardening ضد hallucination برای 214.1.
8. فیلتر اختصاصی 218.

## ریسک‌ها

- تغییر Backend پیش‌فاکتور روی فروش روزانه اثر مستقیم دارد؛ باید در maintenance window انجام شود.
- موجودی انبار اگر داده ناقص داشته باشد، ثبت/قطعی‌سازی گسترده‌ای را متوقف می‌کند.
- approval واقعی حسابداری ممکن است workflow فروش را کند کند؛ تصمیم کسب‌وکاری لازم دارد.
- Purchase Advisor اگر بدون validation باقی بماند، ممکن است فروشنده خیالی در پاسخ بدهد.
