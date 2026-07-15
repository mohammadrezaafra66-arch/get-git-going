## وضعیت فعلی

### ۱) `/api/public/products` روی deploy ✅
تست شد روی `https://get-git-going.lovable.app/api/public/products` — پاسخ `HTTP 200` با همان JSON درست:
```json
{"products":[{"id":"6727ee7b-...","name":"مدل","model":null,"capacity":null,"stock_status":"unknown","is_active":true,"price":12500000}]}
```
فقط ستون‌های امن، فقط `is_active=true` و `stock_status<>'unavailable'`. نیازی به تغییر نیست.

### ۲) `presence_logs` ✅ (وجود دارد)
جدول `public.presence_logs` در دیتابیس هست و هم‌اکنون **۲ رکورد** دارد. یعنی ClockInOutButton درست کار می‌کند و رکورد ثبت می‌شود.

## جاهایی که خودتان می‌توانید چک کنید

**الف) از داخل داشبورد:**
- صفحه `/dashboard` → گوشه هدر → دکمه‌ی «ورود» / «خروج» (ClockInOutButton) کنار نقطه‌ی وضعیت آنلاین.
- بعد از کلیک روی «ورود»، توست «ورود ثبت شد» ظاهر می‌شود ⇒ یک ردیف جدید در `presence_logs`.

**ب) از View Backend (Table Editor):**
- View Backend → Tables → `presence_logs` → مرتب کن بر اساس `created_at` نزولی.
- ستون‌های کلیدی: `user_id`, `event_type` (`clock_in`/`clock_out`)، `created_at`.

**ج) از SQL Editor:**
```sql
select user_id, event_type, created_at
from public.presence_logs
order by created_at desc
limit 20;
```

**د) وضعیت آنلاین کاربر (`profiles.last_seen_at`):**
```sql
select id, full_name, last_seen_at
from public.profiles
order by last_seen_at desc nulls last
limit 20;
```
اگر heartbeat در `AuthProvider` فعال است، این ستون هر چند دقیقه به‌روز می‌شود.

## نتیجه‌گیری
هیچ تغییر کدی لازم نیست. دو مورد باقی‌مانده هر دو سبز هستند — فقط راهنمای مسیر تست بود.

<presentation-actions><presentation-open-backend>View Backend</presentation-open-backend></presentation-actions>