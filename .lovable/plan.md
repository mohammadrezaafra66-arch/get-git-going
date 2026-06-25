## Slice 10 — مرحله ۱: دیتابیس فضای بیجک و فاکتور

ایجاد migration غیرمخرب برای سیستم اسناد (بیجک/فاکتور/حواله) با چرخه تأیید ۱۰ دقیقه‌ای.

### قبل از اجرا — بررسی‌های لازم

1. تأیید وجود `auto_submit_penalty` (Slice 8) و `update_updated_at_column` (Slice 9) با امضای انتظاری.
2. تأیید وجود `tick_inquiries` برای الحاق `expire_pending_documents` (در صورت نبود → cron job مستقل).
3. تأیید فیلدهای واقعی `notification_events` (`event_type`, `user_id`, `channel`, `payload`, `status`) و `audit_logs` (`entity_type`, `entity_id`, `action`, `actor_id`, `diff`) و `profiles.full_name`/`is_active` — همان‌طور که در Slice 9 استفاده شد.
4. تأیید نقش `accountant` در enum `app_role` — در صورت نبود، افزودن آن لازم است (سؤال از کاربر).

### فایل‌های migration

`**supabase/migrations/<ts>_slice10_documents.sql**` — تنها schema/RLS/RPC:

1. جدول `public.documents` با چک‌های `type` (bijak/invoice/havale) و `status` (pending_review/confirmed/rejected/expired)، FK انعطاف‌پذیر `reference_id`+`reference_type`، `review_deadline` پیش‌فرض `now() + 10 min`.
2. جدول `public.document_status_history`.
3. ایندکس‌ها: `type`, `status`, `uploaded_by`, `reference_id`, و partial index روی `review_deadline` where `status='pending_review'`.
4. تریگر `set_documents_updated_at` با استفاده از `update_updated_at_column`.
5. GRANTها روی هر دو جدول (authenticated + service_role).
6. ENABLE RLS + همه policyهای ذکرشده در پرامپت.
7. RPCها:
  - `create_document(...)` — security definer، چک نقش accountant/manager/admin، insert سند + history + notification به اولین manager فعال + audit log.
  - `review_document(p_document_id, p_decision, p_note)` — چک نقش manager/admin، چک `pending_review`، update + history + notification به uploader + audit log.
  - `expire_pending_documents()` — حلقه روی pending‌های منقضی، تغییر به `expired` + history + `auto_submit_penalty` برای manager + notification به uploader.
  - `get_documents(p_type, p_status, p_limit, p_offset)` — security definer با join به profiles برای نام‌ها.
8. GRANT EXECUTE روی RPCها (authenticated؛ `expire_pending_documents` فقط service_role).
9. الحاق `perform public.expire_pending_documents();` به انتهای `tick_inquiries` (با CREATE OR REPLACE تابع موجود — نیاز به خواندن نسخه فعلی قبل از patch).

`**supabase/migrations/<ts+1>_slice10_documents_storage_rls.sql**` — فقط policyهای `storage.objects` برای bucket `documents` (insert: accountant/manager/admin، select: authenticated).

### Storage bucket

ساخت bucket `documents` (private) با ابزار `supabase--storage_create_bucket` — جدا از migration.

### خارج از scope این مرحله

- بدون تغییر UI، بدون هوک، بدون route.
- بدون cron job جدید (اتکا به `tick_inquiries`).

### ریسک‌ها

- اگر نقش `accountant` در `app_role` نیست → policy و RPC شکست می‌خورند. باید قبل از اجرا روشن شود.
- اگر امضای `auto_submit_penalty` متفاوت است → `expire_pending_documents` نیاز به تطبیق.
- `CREATE OR REPLACE FUNCTION tick_inquiries` نیازمند خواندن نسخه فعلی است؛ در صورت نبود، fallback به cron job مستقل (`select cron.schedule('expire-documents','* * * * *', ...)`).

### تأیید پس از اجرا

- `supabase--linter` و رفع warningهای مرتبط.
- چک حضور دو جدول، چهار RPC، policyها، و bucket.  
نقش `accountant` در enum `app_role` موجود است — بررسی کردیم:
  ```
  admin, manager, sales, accountant, viewer
  ```
  نیازی به افزودن نیست. migration را اجرا کن.