## Slice 9 — فضای خرید (مرحله ۱: فقط دیتابیس)

### اسکیمای واقعی پروژه (بررسی شد)

- `profiles`: دارای `full_name` و `is_active` ✓
- `app_role`: `admin, manager, sales, accountant, viewer` ✓ (`sales` معتبر است)
- `audit_logs(entity_type, entity_id, action, actor_id, diff)` ✓ — مطابق پرامپت
- `**notification_events` متفاوت است**: ستون‌های واقعی `event_type, user_id, channel, payload, status, processed_at` — هیچ ستون `title/body/type/reference_type/reference_id` ندارد. اعلان‌ها باید با `event_type` + `payload jsonb` ساخته شوند.
- **Bucket Storage** نمی‌تواند از داخل migration ساخته شود — باید با ابزار `supabase--storage_create_bucket` ساخته شود.

### تغییرات (یک migration + ساخت bucket)

**۱. Migration:** `supabase/migrations/<ts>_slice9_purchase_requests.sql`

سه جدول جدید مطابق پرامپت، با چهار مرحله الزامی (CREATE → GRANT → ENABLE RLS → POLICY):

- `purchase_requests` (با CHECK status, FK به inquiries/products/auth.users)
- `purchase_request_status_history`
- `purchase_receipts`

ایندکس‌ها، GRANTها، و RLS policies دقیقاً مطابق پرامپت.

تریگر `update_updated_at_column` روی `purchase_requests` برای نگهداری `updated_at`.

**RPCها** با تطبیق برای schema واقعی:

- `create_purchase_request(...)` — مطابق پرامپت، اما اعلان به‌صورت:
  ```sql
  insert into notification_events (event_type, user_id, channel, payload, status)
  values (
    'purchase_request_new', v_assigned_to, 'in_app',
    jsonb_build_object(
      'title','درخواست خرید جدید',
      'body','یک درخواست خرید جدید برای بررسی ثبت شده است.',
      'reference_type','purchase_request',
      'reference_id', v_request_id
    ),
    'pending'
  );
  ```
- `update_purchase_status(...)` — همان الگوی اعلان با `event_type='purchase_status_changed'` و ترجمه فارسی وضعیت در body.
- `get_purchase_requests(...)` — دقیقاً مطابق پرامپت (با `profiles.full_name`).

پیدا کردن مسئول خرید: چون `has_role` نیاز به subquery دارد و در `WHERE` با `profiles` join لازم است، از:

```sql
select p.id into v_assigned_to
from profiles p
join user_roles ur on ur.user_id = p.id
where p.is_active = true and ur.role = 'manager'
order by p.created_at asc
limit 1;
```

GRANT EXECUTE فقط به `authenticated` برای هر سه RPC.

**۲. Storage bucket** — با ابزار `supabase--storage_create_bucket(name='purchase-receipts', public=false)` پس از تأیید migration.

سپس یک migration کوچک دوم برای RLS policies روی `storage.objects` با محدودسازی به اعضای درخواست (نه فقط `auth.role()='authenticated'` که خیلی باز است):

- INSERT: فقط `assigned_to` درخواست مرتبط بتواند آپلود کند (path الگو: `<request_id>/...`).
- SELECT: requester / assignee / admin / manager.

### فایل‌های تغییریافته

- ایجاد: `supabase/migrations/<ts>_slice9_purchase_requests.sql`
- ایجاد bucket: `purchase-receipts` (private)
- ایجاد: `supabase/migrations/<ts2>_slice9_purchase_receipts_storage_rls.sql`

### بدون تغییر UI

هیچ فایل frontend در این مرحله تغییر نمی‌کند. types.ts پس از اجرای migration به‌صورت خودکار بازتولید می‌شود.

### ریسک‌ها

- اگر در پروژه شما الگوی متفاوتی برای ساخت اعلان (مثلاً تابع helper) وجود دارد، بفرمایید تا از آن استفاده کنم.
- `inquiries.id` فرض شده موجود است (طبق لیست جداول هست) ✓.

تأیید کنید تا migration و bucket را اجرا کنم.  
تأیید می‌کنم. migration و bucket را اجرا کن.

برای الگوی اعلان همان روشی که نوشتی (`event_type` + `payload jsonb`) درست است — تابع helper جداگانه‌ای نداریم.