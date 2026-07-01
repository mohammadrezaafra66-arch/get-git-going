## مشکل

تابع `run_daily_capital_allocation` هنگام محاسبه، برای مشتریانی که پروفایل اعتباری ندارند مقدار `binding_constraint = 'no_profile'` می‌گذارد، اما CHECK constraint روی `customer_capital_allocations_dynamic.binding_constraint` فقط این چهار مقدار را می‌پذیرد:

```
'formula' | 'credit_limit' | 'overdue' | 'floor'
```

نتیجه: هنگام INSERT، خطای check violation و کل تراکنش rollback می‌شود ⇒ «سرمایه ثبت نمی‌شود / ارور می‌دهد».

## راه‌حل (Migration کوچک)

اصلاح CASE داخل تابع: وقتی مشتری پروفایل اعتباری ندارد، عملاً از فرمول سهم استفاده می‌شود، پس مقدار درست همان `'formula'` است.

تغییر تنها این بلاک در `run_daily_capital_allocation`:

```sql
binding_constraint = CASE
  WHEN has_overdue THEN 'overdue'
  WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
  ELSE 'formula'   -- شامل حالت NOT has_profile
END
```

بقیهٔ منطق (محاسبه final_limit، تخصیص فروشنده، Hamilton rounding، audit log) دست‌نخورده می‌ماند.

## تأیید

پس از migration، از UI `/accounting/dynamic-capital` مقدار سرمایه را وارد و «محاسبه و ذخیره» زده می‌شود؛ باید بدون خطا snapshot تولید کند.
