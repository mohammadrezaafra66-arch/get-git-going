## Slice 11-A — مرحله ۱: جدول `workflow_settings` (فقط دیتابیس)

یک migration غیرمخرب برای ایجاد جدول تنظیمات گردش‌کار + RPCها + داده‌های پیش‌فرض. بدون تغییر UI/hook/route.

### اقدامات

1. **migration جدید** شامل:
   - `CREATE TABLE public.workflow_settings` با ستون‌های: `process_key` (unique)، `process_name_fa`، `uploader_role`، `reviewer_role`، `timer_minutes` (default 10)، `penalty_enabled`، `penalty_for` (check: uploader/reviewer/both)، `is_active`، `updated_by` (FK → auth.users)، `updated_at`.
   - ایندکس روی `process_key`.
   - تریگر `set_workflow_settings_updated_at` با تابع موجود `public.set_updated_at`.
   - GRANTها: `select, update` به authenticated و `all` به service_role.
   - فعال‌سازی RLS + دو policy: «خواندن برای authenticated» و «update فقط admin/manager» با `has_role`.
   - INSERT داده‌های پیش‌فرض برای ۵ فرایند: `inquiry_response`, `bijak_invoice_print`, `shipping_receipt`, `delivery_receipt`, `purchase_request`.

2. **RPCها** (`SECURITY DEFINER`, `search_path = public`):
   - `get_workflow_settings()` → همه ردیف‌ها (authenticated).
   - `update_workflow_setting(...)` → فقط admin/manager، با `COALESCE` برای merge، نوشتن در `audit_logs` با schema واقعی (`entity_type, entity_id, action, actor_id, diff`).
   - `get_workflow_setting(p_process_key)` → یک ردیف (authenticated + service_role).

3. **تأیید سازگاری قبل از اجرا**:
   - وجود تابع `public.set_updated_at` و `public.has_role`.
   - schema جدول `audit_logs` مطابق چیزی است که RPC می‌نویسد.

### خارج از scope
- بدون UI/hook/route.
- بدون تغییر جداول دیگر.
- بدون drop/rename.

### ریسک
کم — فقط CREATE + INSERT. policy update به نقش‌های admin/manager محدود است. در صورت عدم تطابق نام تابع/شِما، migration fail می‌شود و قبل از اجرا اصلاح می‌گردد.
