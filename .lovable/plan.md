
# برنامه: گسترش پارامترهای امتیازدهی اعتباری با input_type و min/max

## وضعیت فعلی (بررسی شد)

- `dynamic_scoring_parameters`: ۱۰ ردیف (۵ customer + ۵ salesperson). ندارد: `input_type`, `min_value`, `max_value`, `unit_label`, `input_hint`.
- `dynamic_entity_scores`:
  - `raw_score numeric(4,3)` با CHECK `>= 0 AND <= 1` — یعنی normalized ذخیره می‌شود.
  - ۱۱ رکورد customer موجود است.
  - trigger های `validate_dynamic_entity_score`, `audit_dynamic_entity_score`, `set_updated_at` فعال.
- `dynamic_parameter_weights`: ۵ وزن customer فعال (هرکدام 0.2). با DELETE پارامترها، به علت `ON DELETE CASCADE` پاک می‌شوند.
- `calculate_dynamic_score` مستقیماً `s.raw_score` را در محاسبه استفاده می‌کند (عدد ۰..۱).
- پارامترهای salesperson: **دست‌نخورده باقی می‌مانند**.

## پاسخ به سؤالات شما

**۱) سازگاری با constraint فعلی `dynamic_entity_scores`؟**
CHECK فعلی روی `raw_score` بین ۰ و ۱ است. اگر `actual_value` جدید را اضافه کنیم و `raw_score` را همچنان normalized (۰..۱) نگه داریم، سازگار است. نیازی به تغییر constraint نیست.

**۲) `raw_score` computed column یا trigger؟**
پیشنهاد **trigger** (`BEFORE INSERT OR UPDATE`)، نه GENERATED column. دلایل:
- GENERATED باید IMMUTABLE باشد و به جدول دیگری (`dynamic_scoring_parameters` برای min/max) نمی‌تواند JOIN بزند.
- Trigger منعطف است، می‌تواند clipping اعمال کند و پیام خطای فارسی بدهد.
- منطق: `NEW.raw_score := LEAST(1, GREATEST(0, (NEW.actual_value - p.min_value) / NULLIF(p.max_value - p.min_value, 0)))`
- برای `direction='negative'` در آینده: `1 - normalized`. الان همه positive هستند.
- کاربر می‌تواند `actual_value` بدهد و `raw_score` خودکار محاسبه شود. یا برای backward-compat اگر `actual_value` NULL باشد، `raw_score` مستقیم پذیرفته شود.

**۳) پارامترهای salesperson دست‌نخورده؟**
بله. فقط پارامترهای customer پاک/جایگزین می‌شوند. برای پارامترهای salesperson موجود، ستون‌های جدید مقدار پیش‌فرض می‌گیرند (`input_type='score_100'`, `min=0`, `max=100`) که رفتار فعلی را حفظ می‌کند.

## مراحل migration (یک migration واحد)

**گام ۱ — افزودن ستون‌ها به `dynamic_scoring_parameters`:**
- `input_type text NOT NULL DEFAULT 'score_100'` + CHECK (`score_100`, `toman`, `months`, `boolean`)
- `min_value numeric NOT NULL DEFAULT 0`
- `max_value numeric NOT NULL DEFAULT 100`
- `unit_label text` (nullable)
- `input_hint text` (nullable)
- CHECK: `max_value > min_value`

**گام ۲ — افزودن `actual_value` به `dynamic_entity_scores`:**
- `actual_value numeric` (nullable برای backward-compat با ۱۱ رکورد موجود)
- `is_clipped boolean NOT NULL DEFAULT false` — نشانگر اینکه actual > max بوده

**گام ۳ — trigger جدید `compute_normalized_raw_score` (BEFORE INSERT/UPDATE):**
- اگر `NEW.actual_value IS NOT NULL`: پارامتر را lookup کن، normalize کن، `raw_score` و `is_clipped` را set کن.
- اگر NULL: `raw_score` را همان‌طور که کاربر داده بپذیر (backward-compat).
- قبل از trigger فعلی `validate_dynamic_entity_score` اجرا شود (نام: `trg_a_compute_raw_score` برای الفبایی مقدم).

**گام ۴ — پاک‌سازی پارامترهای customer قدیمی:**
- `DELETE FROM dynamic_scoring_parameters WHERE entity_type='customer'` (CASCADE → weights و entity_scores مربوطه پاک می‌شوند).
- **ریسک:** ۱۱ رکورد `dynamic_entity_scores` مشتری از دست می‌رود. با توجه به اینکه در حال گسترش سیستم هستید و مقادیر جدید actual_value را ندارند، این پاک‌سازی منطقی است. اگر می‌خواهید حفظ شود، بگویید تا snapshot backup اضافه کنم.

**گام ۵ — INSERT ۱۰ پارامتر جدید customer** با ستون‌های `input_type`, `min_value`, `max_value`, `unit_label`, `input_hint`, `display_order` و `direction='positive'`.

**گام ۶ — INSERT وزن‌های جدید** در `dynamic_parameter_weights` با `valid_from = current_date` و `valid_to = NULL` (طبق جدول شما، مجموع = 1.00).

**گام ۷ — به‌روزرسانی `calculate_dynamic_score`:**
- فیلد `is_clipped` (از ستون جدید `dynamic_entity_scores.is_clipped`) و `actual_value` به breakdown اضافه شود.
- منطق weighted_score تغییر نمی‌کند (همچنان از `raw_score` که ۰..۱ است).

## تغییرات کد (بعد از migration)

فقط types خودکار regen می‌شوند. تغییرات کد UI (فرم امتیازدهی با input جدید بر اساس `input_type`) در **مرحله بعدی** انجام می‌شود — این migration فقط schema است. سؤال: آیا در همین turn UI را هم بسازم یا فقط migration؟

## ریسک‌ها

- **از دست رفتن ۱۱ رکورد امتیاز موجود** به دلیل CASCADE. تأیید شما لازم است.
- Trigger جدید در همان BEFORE trigger chain نباید با `validate_dynamic_entity_score` تداخل کند — نام‌گذاری الفبایی رعایت می‌شود.
- `direction='negative'` در آینده باید در trigger هندل شود؛ الان همه positive.

## چک‌لیست خود-میزبانی
- بدون CDN، بدون secret جدید، reversible با DROP COLUMN / DROP TRIGGER.
- RLS دست‌نخورده. Audit trigger فعال باقی می‌ماند.

---

**منتظر تأیید شما هستم برای:**
1. اجرای migration؟ (بله/خیر)
2. حذف ۱۱ رکورد امتیاز مشتری موجود قابل قبول است؟ (بله/خیر)
3. UI فرم امتیازدهی در همین turn ساخته شود یا فقط migration؟
