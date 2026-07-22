# کاربرگ بازنویسی تنظیمات آسیب‌دیده

متن فارسی این ردیف‌ها هنگام درج در پایگاه داده به کاراکتر `?` تبدیل شده و
**قابل بازیابی نیست**. حدس زدن یا بازسازی متن مجاز نیست؛ مقدار درست را باید
انسان وارد کند.

این کاربرگ برای همین ساخته شده: برای هر ردیف، ستون‌های سالمِ کنار آن آورده شده
تا حدس زدنِ محتوای درست لازم نباشد. کلیدهای انگلیسی (`key`، `field_key`،
`scope`، `days`) قوی‌ترین سرنخ‌اند.

**قبل از هر اصلاحی، بخش «روش امن اعمال تغییرات» در انتهای این سند را بخوانید.**
اگر همان مسیر قبلی تکرار شود، متن دوباره خراب می‌شود.

---

## ردیف ۱ — کم‌حجم و پرکاربرد (اول این‌ها)

### ۱.۱ `validation_rules` — ۵ ردیف، ستون آسیب‌دیده: `message`

پیام‌های اعتبارسنجی که در فرم رسید پرداخت پیش از ثبت نمایش داده می‌شوند.
محل نمایش: `src/lib/validation/rules.ts:23` و
`src/shared/components/PaymentReceiptForm.tsx:1054`
مدیریت: `src/routes/_app.admin.validation-rules.tsx:64`

| `id` | `scope` | `field_key` | `rule_type` | `severity` | متن درست (تکمیل کنید) |
|---|---|---|---|---|---|
| `46c8d5ae-e0ed-4a13-ba14-2c441a290803` | journal_entry | payer_accounting_code | required | blocking | |
| `f81e86fa-d93e-479e-b468-a3f5604ff52c` | journal_entry | receiver_accounting_code | required | blocking | |
| `1b3c8900-6250-41c1-8a03-4a70e57c73b5` | receipt | payer_accounting_code | accounting_code_valid | warning | |
| `c194b822-5d0e-4905-86a7-ab4963cca304` | receipt | receiver_accounting_code | accounting_code_valid | warning | |
| `80e7b7a5-df39-42d5-8b9a-f050a8e8e5d5` | receipt | receiver_name | required | warning | |

### ۱.۲ `payment_terms` — ۳ ردیف، ستون آسیب‌دیده: `name`

ستون `days` عملاً معنای ردیف را مشخص می‌کند.
محل نمایش: `src/routes/_app.admin.payment-terms.tsx:68`

| `id` | `days` | `sort_order` | نام درست (تکمیل کنید) |
|---|---|---|---|
| `f22624c1-d8fa-437e-9943-8b6358fb7c23` | ۰ | ۱ | |
| `dc482b28-c40a-4482-af06-c16ccd15dfec` | ۳۰ | ۲ | |
| `548a3a94-947b-4f3c-95f8-4f47fef8d39a` | ۴۵ | ۵ | |

### ۱.۳ `invoice_workflow_stages` — ۴ ردیف از ۵، ستون آسیب‌دیده: `title`

فقط ترتیب مرحله سالم مانده است.
محل نمایش: `src/routes/_app.admin.workflow-stages.tsx:62`

| `id` | `order_index` | عنوان درست (تکمیل کنید) |
|---|---|---|
| `b6c96778-b052-4d74-916a-92d78b1ec54f` | ۱ | |
| `59d0fd31-9672-476a-b075-e2c61e52e5c9` | ۲ | |
| `630a73e3-99b5-4bf6-a51f-6b090b4c34cd` | ۳ | |
| `2227d15a-8847-45df-ab36-f1ba4b0ff910` | ۴ | |

### ۱.۴ `price_change_reasons` — ۶ ردیف از ۱۸، ستون آسیب‌دیده: `title`

**هشدار: این جدول هیچ ستون کلید انگلیسی ندارد.** تنها `is_active` سالم است، پس
سرنخی برای بازسازی وجود ندارد. ۱۲ ردیف دیگرِ همین جدول سالم‌اند؛ دیدن آن‌ها در
`/pricing/change-reasons` کمک می‌کند بفهمید چه عناوینی جا افتاده است.
محل نمایش: `src/lib/pricing/queries.ts:18` و
`src/routes/_app.pricing.change-reasons.tsx:68`

| `id` | عنوان درست (تکمیل کنید) |
|---|---|
| `14c7986f-2a11-4453-8ac9-5451c639af29` | |
| `21e1fb0b-3882-4c6a-8bb2-b1060cd3f5a7` | |
| `39df6605-93e7-4dca-84e5-3e24ab6b6fe5` | |
| `c5a2e5d5-cb45-4509-aa21-46cff3527bde` | |
| `d7de13c1-a776-46af-97e2-422089533c68` | |
| `ee211565-b208-48a3-864b-e2081ddc65d3` | |

### ۱.۵ `gamification_kpis` — ۱۲ ردیف، ستون‌های آسیب‌دیده: `label_fa` و `description`

**بهترین حالت از نظر سرنخ:** ستون `key` انگلیسی و سالم است و دقیقاً معنای هر
ردیف را می‌رساند.
محل نمایش: `src/lib/operations/gamification.ts:42`

| `id` | `key` | `weight` | `enabled` | `label_fa` درست | `description` درست |
|---|---|---|---|---|---|
| `8bde8882-cc93-4414-9a96-b18f451f42de` | inbound_calls | ۱ | بله | | |
| `b2052f72-7a51-4712-990a-fc8997feeee3` | outbound_calls | ۲ | بله | | |
| `b82833f5-454c-4ff2-a738-dac31383f765` | talk_minutes | ۰٫۵ | بله | | |
| `37267612-48bb-49ff-87f9-71cd8b30883e` | total_sales | ۰٫۰۰۰۱ | بله | | |
| `94a31e03-0709-4300-8bcc-fad597e5535d` | cumulative_sales | ۰٫۰۰۰۰۱ | بله | | |
| `e01a59af-b315-441f-a006-0236bca7003d` | new_customers | ۲۰۰٫۲ | بله | | |
| `fefd71f7-d7c7-40f2-b504-0fe87f8e7bba` | active_work_hours | ۲ | بله | | |
| `219e7229-f6d1-4430-8a3b-8940a1d834b1` | deals_registered | ۳ | بله | | |
| `4461eba3-93ff-42b9-ab81-e61174bfb66f` | sales_per_talk_minute | ۰٫۰۰۱ | بله | | |
| `614b0a6d-1727-495a-834a-05d7d4afae1e` | growth_vs_last_month | ۰٫۵ | بله | | |
| `28882d4b-ed73-47d9-8289-45041c9de6b4` | total_profit | ۰٫۰۰۰۲ | **خیر** | | |
| `ecafb341-4d4f-4372-b41a-2c5c789bb8ec` | profit_per_talk_minute | ۰٫۰۰۲ | **خیر** | | |

> نکته: دو ردیف آخر غیرفعال‌اند و در تابع `calculate_employee_score` هیچ شاخه‌ای
> برای آن‌ها وجود ندارد. یعنی حتی با فعال شدن هم امتیازشان صفر می‌ماند. این یک
> موضوع جداگانه از خرابی متن است.

---

## ردیف ۲ — حجیم، فوریت کمتر

این سه گروه روی هم ۱۵۰ مقدار دارند. فهرست کامل ردیف‌به‌ردیف در این سند نیامده،
چون بدون سرنخِ انگلیسی، فهرست کردن شناسه‌ها کمکی به بازنویسی نمی‌کند. به جای آن
پرس‌وجوی تولید فهرست آمده است.

| جدول | ستون | تعداد | محل نمایش | سرنخ سالم |
|---|---|---|---|---|
| `daily_mood_questions` | `question_text` | ۹۳ | `src/lib/operations/daily-mood.ts:142` | ندارد |
| `dynamic_table_columns` | `label` | ۳۵ | `src/routes/_app.bot-api-keys.index.tsx:826` | دارد — ستون کلید/اسلاگ جدول |
| `product_suppliers` | `notes` | ۲۲ | `src/shared/components/ProductSupplierManager.tsx:86` | دارد — تأمین‌کننده و کالای مرتبط |

نکته درباره `product_suppliers`: هر ۲۲ ردیف **مقدار یکسانی** دارند، یعنی احتمالاً
یک یادداشت تکراری بوده و با یک بار نوشتنِ متن درست، همه با هم قابل اصلاح‌اند.

برای گرفتن فهرست کامل هر گروه:

```sql
SELECT id, label
  FROM public.dynamic_table_columns
 WHERE label ~ '\?{3,}'
 ORDER BY id;
```

---

## ردیف ۳ — بزرگ‌ترین، جداگانه بررسی شود

`dynamic_table_cells.value_text` با ۲۶۶ مقدار از ۳۷۲۹ ردیف.

این‌ها محتوای جدول‌های پویا هستند، نه تنظیمات سیستم. پیش از هر اقدامی باید
مشخص شود این جدول‌های پویا هنوز استفاده می‌شوند یا نه؛ اگر آزمایشی بوده‌اند،
حذفِ کل جدولِ پویا منطقی‌تر از بازنویسی ۲۶۶ خانه است. این تصمیم با شماست.

---

## روش امن اعمال تغییرات

خرابی اولیه به این دلیل رخ داد که متن فارسی از مسیر کنسول پیش‌فرض ویندوز عبور
کرد و به کدپیج ANSI تبدیل شد. هر کاراکتری که در آن کدپیج معادل نداشت، به `?`
تبدیل شد — **پیش از رسیدن به پایگاه داده**. پس اگر همان مسیر تکرار شود، مقدار
اصلاح‌شده هم دوباره خراب می‌شود.

### روش نادرست (این کار را نکنید)

```powershell
# متن فارسی از لوله کنسول عبور می‌کند و خراب می‌شود
"UPDATE payment_terms SET name = 'نقدی' WHERE days = 0;" | docker exec -i afrakala-lan-db psql -U supabase_admin -d afrakala
```

### روش درست

فایل SQL را با کدگذاری UTF-8 ذخیره کنید و با سوئیچ `-f` اعمال کنید:

```powershell
# ۱) فایل را با UTF-8 بنویسید
Set-Content -Path fix.sql -Encoding utf8 -Value "UPDATE public.payment_terms SET name = 'نقدی' WHERE days = 0;"

# ۲) کنسول را روی UTF-8 تنظیم کنید
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding            = [System.Text.Encoding]::UTF8

# ۳) فایل را کپی و با -f اجرا کنید
docker cp fix.sql afrakala-lan-db:/tmp/fix.sql
docker exec -e PGCLIENTENCODING=UTF8 afrakala-lan-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d afrakala -f /tmp/fix.sql
```

### بررسی پس از هر اصلاح

بعد از هر درج یا به‌روزرسانی گروهی، این پرس‌وجو باید صفر برگرداند:

```sql
SELECT count(*) FROM public.payment_terms WHERE name ~ '\?{3,}';
```

اگر عدد صفر نبود، متن دوباره خراب شده است؛ تغییر را برگردانید و مسیر را اصلاح
کنید، نه اینکه دوباره تلاش کنید.

---

## آنچه در این کاربرگ نیامده

- `dynamic_table_cells` (۲۶۶ مقدار) — ردیف ۳، تصمیم جداگانه
- `daily_mood_hafez_poems`، `daily_mood_scenarios`، `achievements`، `missions`،
  `league_settings`، `market_indicators`، `market_rate_sources`،
  `market_rate_source_mappings`، `gamification_kpi_rules`،
  `profile_field_definitions`، `dynamic_tables`، `pricing_rules` — محتوای
  مرجعِ آسیب‌دیده که در ردیف‌بندی سند اصلی نیامده بود. فهرست کامل و شمارش دقیق
  در `docs/data-and-rag-progress.md` بخش ۱.۱ آمده است.
