# سیستم امتیازدهی پویا (Dynamic Scoring) — برنامه

## پاسخ مستقیم به سه سوال

### ۱) تداخل نام؟
بررسی فهرست ۱۶۰+ جدول موجود: **هیچ تداخلی نیست**.
- `dynamic_scoring_parameters` و `dynamic_parameter_weights` در دیتابیس وجود ندارند.
- پیشوند `dynamic_` فقط در ماژول جداول داینامیک کاربر (`dynamic_tables`, `dynamic_table_columns`, ...) استفاده شده که کاملاً مستقل است و تضادی ایجاد نمی‌کند.
- هیچ‌کدام از ۱۰ کد پارامتر پیش‌فرض (`customer_purchase_1y` و غیره) با ستون یا enum موجود برخورد ندارند.

نکته: جدول‌های مرتبط که باید با آن‌ها سازگار باشیم (نه تداخل):
- `customer_credit_profile.settlement_score` — منبع پارامتر `customer_settlement_score`.
- `employee_scores`, `employee_score_events` — منابع پارامترهای کارشناس.
- `call_logs` — منبع `salesperson_call_in` / `salesperson_call_out`.
- `invoices`, `invoice_items` — منابع خرید/سود مشتری.

### ۲) Schema جداگانه یا public؟
**`public` کافی و توصیه‌شده است.**
- توابع کمکی RBAC (`has_role`, `auth.uid()`) و الگوی RLS پروژه روی `public` تنظیم شده‌اند.
- PostgREST/Data API فقط `public` را به‌صورت پیش‌فرض expose می‌کند؛ schema جدید نیاز به GRANT و تنظیمات اضافه دارد.
- audit logging و `is_valid_audit_entity_type` نیز روی `public` است.
- Schema جداگانه فقط زمانی لازم است که بخواهیم کاملاً از Data API جدا شویم — اینجا برعکس، می‌خواهیم UI بخواند.

### ۳) وزن ۰.۲ برای هر پارامتر؟
**منطقی است به‌عنوان baseline v1**، مشروط به دو نکته:
- **نرمال‌سازی مقادیر خام**: مبلغ خرید (تومان) و تعداد تماس و درصد سود واحد یکسان ندارند. هر پارامتر باید قبل از ضرب در وزن به بازه [0,1] یا [0,100] map شود (min-max یا percentile روی جامعه فعال).
- **بازتوزیع وزن**: اگر پارامتری `is_active=false` شد یا داده‌ای ندارد (مثلاً مشتری جدید بدون سابقه ۱ساله)، وزن آن باید بین پارامترهای فعال پخش شود تا مجموع همیشه ۱.۰ بماند. در غیر این صورت نمره‌ها مصنوعاً پایین می‌آیند.

---

## طراحی جداول (نهایی)

```sql
-- پارامترها
public.dynamic_scoring_parameters (
  id uuid pk,
  entity_type text check in ('customer','salesperson'),
  code text not null,
  label_fa text not null,
  direction text check in ('positive','negative'),
  is_active boolean default true,
  display_order int default 0,
  created_by uuid references auth.users,
  created_at, updated_at timestamptz,
  unique(entity_type, code)
)

-- وزن‌های زمان‌دار (تاریخچه قابل بازسازی)
public.dynamic_parameter_weights (
  id uuid pk,
  parameter_id uuid fk -> parameters(id) on delete cascade,
  weight numeric(4,3) check (weight >= 0 and weight <= 1),
  valid_from date not null,
  valid_to date,              -- null = جاری
  created_by uuid,
  created_at timestamptz,
  exclude using gist (parameter_id with =, daterange(valid_from, valid_to, '[)') with &&)
)
```

- RLS: همه احراز‌هویت‌شده‌ها read؛ فقط `admin`/`manager` write از طریق RPC تعریف‌شده.
- audit: افزودن کدهای جدید به `is_valid_audit_entity_type` (`scoring_parameter`, `parameter_weight`).
- GRANT کامل برای `authenticated` + `service_role`.

---

## ۵ فاز اجرا (پس از تأیید)

| فاز | محتوا | خروجی |
|---|---|---|
| 1 | Migration: دو جدول + RLS + GRANT + audit allow-list | فقط دیتابیس |
| 2 | Seed ۵ پارامتر مشتری + ۵ پارامتر کارشناس با وزن ۰.۲ | داده پیش‌فرض |
| 3 | RPC `recalculate_entity_score(entity_type, entity_id)` با نرمال‌سازی + بازتوزیع وزن | موتور محاسبه |
| 4 | pg_cron شبانه برای محاسبه دسته‌ای + snapshot در `score_snapshots` | اتوماسیون |
| 5 | UI ادمین: جدول مدیریت پارامترها/وزن‌ها + پیش‌نمایش تأثیر روی نمونه مشتری | فرانت |

---

## ریسک‌ها

- داده ناکافی برای مشتری/کارشناس جدید → استراتژی fallback (نمره خنثی ۵۰ یا null).
- تغییر وزن باید snapshot قبلی را خراب نکند → `valid_from/valid_to` این را تضمین می‌کند.
- نرمال‌سازی نسبی (percentile) باعث می‌شود نمره یک مشتری با تغییر رفتار دیگران تغییر کند → باید در UI شفاف باشد.

---

**منتظر تأیید برای شروع فاز ۱ (فقط migration دیتابیس) هستم.**
