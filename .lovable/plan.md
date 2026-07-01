
## هدف
صفحه‌ی موجود `/sales/credit-rules` را از جدول یتیم `credit_scoring_rules` جدا کرده و به سیستم فعال «امتیازدهی پویا» متصل کنیم؛ بدون ساخت صفحه یا مسیر جدید و بدون تغییر ظاهر کلی.

## وضعیت فعلی (چرا الان اثر ندارد)
- `credit_scoring_rules` در هیچ RPC/تریگر مصرف نمی‌شود؛ فقط این صفحه به آن وصل است.
- سیستم فعال از این جدول‌ها می‌خواند:
  - `dynamic_scoring_parameters` (تعریف پارامتر: `code`, `label_fa`, `entity_type='customer'`, `direction`, `is_active`, `display_order`)
  - `dynamic_parameter_weights` (وزن با بازهٔ اعتبار: `parameter_id`, `weight`, `valid_from`, `valid_to`)
- کامپوننت `DynamicScoringSection` و روتین تخصیص سرمایه روزانه از همین دو جدول تغذیه می‌شوند.

## تغییرات

### فقط یک فایل: `src/routes/_app.sales.credit-rules.tsx`

۱) تغییر منبع داده به join بین دو جدول جدید:
- Query «لیست قوانین»:
  - از `dynamic_scoring_parameters` (فقط `entity_type='customer'`) بخوان.
  - برای هر پارامتر آخرین ردیف «فعال» را از `dynamic_parameter_weights` بگیر (`valid_to IS NULL` یا بزرگتر از `now()`، مرتب‌سازی `valid_from DESC LIMIT 1`).
  - خروجی به شکل `{ id, code, label_fa, weight, is_active, direction }` نگاشته شود.

۲) ذخیرهٔ ویرایش وزن (versioned، بدون از دست دادن سابقه):
- در `update` mutation:
  - اگر فقط `is_active` عوض شد → `UPDATE dynamic_scoring_parameters SET is_active=... WHERE id=parameter_id`.
  - اگر وزن عوض شد → «ورژنینگ»: ردیف فعلی وزن را ببند (`valid_to = now()`) و یک ردیف جدید در `dynamic_parameter_weights` با `valid_from = now()` و مقدار جدید درج کن.
  - برای جلوگیری از تداخل CHECK/constraint، این دو عمل در یک RPC انجام شود.

۳) افزودن پارامتر جدید:
- درج در `dynamic_scoring_parameters` با `entity_type='customer'`, `code` (slug انگلیسی، الزامی)، `label_fa` (اختیاری؛ پیش‌فرض = code)، `is_active=true`، `direction='higher_better'`، `display_order = max+10`.
- سپس درج ردیف اولیهٔ وزن در `dynamic_parameter_weights` با `valid_from=now()`, `valid_to=NULL`.
- این هم داخل همان RPC انجام شود تا اتمیک باشد.

۴) UI:
- فرم افزودن: فیلد جدید «برچسب فارسی» + همان `code` انگلیسی موجود.
- ستون «فرمول» به «جهت» تغییر کند (higher_better / lower_better) — فقط نمایشی.
- بقیهٔ ظاهر، helpها و منطق مجموع وزن‌ها دست نخورد.
- پیام هشدار مجموع وزن‌ها همان‌طور که هست حفظ شود.

### مایگریشن (SQL)
دو تابع SECURITY DEFINER کوچک اضافه شود (فقط admin/accountant اجازهٔ EXECUTE):

- `public.upsert_dynamic_parameter_weight(_parameter_id uuid, _new_weight numeric, _new_is_active boolean)`
  - `is_active` را روی پارامتر ست کند.
  - اگر وزن فعلی با `_new_weight` فرق دارد: ردیف باز را ببندد و ردیف جدید درج کند؛ در غیر این صورت فقط `is_active` را برگرداند.
- `public.create_dynamic_scoring_parameter(_code text, _label_fa text, _weight numeric, _direction text default 'higher_better')`
  - پارامتر و ردیف وزن اولیه را اتمیک بسازد و `parameter_id` را برگرداند.

RLS/GRANT:
- `GRANT EXECUTE` روی هر دو تابع به `authenticated`؛ داخل تابع با `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')` گارد شود.
- policyهای موجود روی دو جدول تغییری نمی‌کنند.
- audit_log برای هر دو عملیات (`parameter_created`, `parameter_weight_changed`, `parameter_toggled`).

## خارج از اسکوپ (طبق انتخاب شما)
- ساخت صفحهٔ ادمین جدید یا مسیر جدید انجام نمی‌شود.
- جدول قدیمی `credit_scoring_rules` حذف/تغییر نمی‌کند (برای امنیت داده‌ها). فقط دیگر توسط UI خوانده/نوشته نمی‌شود.
- فرمول محاسبه، snapshot سرمایه، و `DynamicScoringSection` دست نمی‌خورد.

## تأیید و ریسک
- Build/Typecheck اجرا و گزارش می‌شود.
- تست دستی:
  1) ورود به `/sales/credit-rules` → لیست همان پارامترهای موجود در سیستم پویا نمایش داده شود.
  2) تغییر وزن یک پارامتر → در بازکردن پروفایل مشتری، ستون «امتیاز وزنی کل» با وزن جدید بازمحاسبه شود.
  3) غیرفعال‌کردن پارامتر → از فهرست اسلایدرهای مشتری حذف و از تخصیص سرمایهٔ بعدی خارج شود.
- ریسک: اگر پارامتری وزن باز نداشته باشد، در نمایش صفر می‌شود؛ در upsert اگر باز نبود مستقیم درج تازه انجام می‌شود.
