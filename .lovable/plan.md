## مشکل
اجرای RPC `run_daily_capital_allocation` روی `/accounting/dynamic-capital` با خطای دیتابیس شکست می‌خورد:

```
message: "UPDATE requires a WHERE clause"
code: 21000
```

این خطا از تنظیم امنیتی `sql_safe_updates` در session نقش‌های Supabase می‌آید که هر `UPDATE` بدون `WHERE` را رد می‌کند — حتی روی جدول موقت (temp table).

در بدنه‌ی این تابع ۵ جای `UPDATE ... SET` بدون `WHERE` روی temp tableها وجود دارد:
- خط ۵۷ روی `_sp_alloc` (محاسبه share_ratio/raw_amount/floor_amount/fractional)
- خط ۶۵ روی `_sp_alloc` (allocated_capital = floor_amount)
- خط ۱۲۴ روی `_sp_cust` (floor_amount/fractional)
- خط ۱۳۰ روی `_sp_cust` (raw_allocation = floor_amount)
- خط ۱۶۶ روی `_cust_alloc` (final_limit/binding_constraint)

## راه‌حل (تغییر جراحی، بدون تغییر منطق)

یک migration که تابع `public.run_daily_capital_allocation` را با همان بدنه بازتعریف می‌کند، فقط با افزودن `WHERE true` به همان ۵ `UPDATE`. هیچ تغییری در امضا، RLS، مجوزها، ورودی/خروجی و منطق تخصیص Hamilton rounding داده نمی‌شود.

## فایل‌ها
- Migration جدید: `CREATE OR REPLACE FUNCTION public.run_daily_capital_allocation(...)` با ۵ UPDATE اصلاح‌شده.

## تست دستی
1. رفتن به `/accounting/dynamic-capital`
2. انتخاب تاریخ جدید + مبلغ سرمایه + کلیک «محاسبه و ذخیره»
3. بررسی: عدم خطای 21000، درج ردیف در `daily_capital_settings` و توزیع در جداول `salesperson_capital_allocations_dynamic` و `customer_capital_allocations_dynamic`.

## ریسک
پایین — فقط افزودن `WHERE true` است؛ رفتار روی temp table یکسان می‌ماند (همه ردیف‌ها به‌روزرسانی می‌شوند). هیچ تأثیری روی RLS/RBAC/audit ندارد.