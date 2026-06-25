## Slice 11-B — مرحله ۱: دیتابیس رسید تحویل و بیجک باربری

فقط migration و bucket. بدون تغییر UI.

### بررسی‌های انجام‌شده

- `invoices(id)` و `customers(id)` وجود دارند → FKها معتبر.
- `profiles` دارای ستون `full_name` و `is_active` است → سازگار با `get_delivery_receipts` و انتخاب reviewer.
- توابع `public.set_updated_at`، `public.has_role`، `public.auto_submit_penalty(p_inquiry_id, p_user_id, p_type, p_severity, p_description)`، و `public.tick_inquiries()` موجودند.
- `tick_inquiries` در انتها از قبل `perform public.expire_pending_documents();` را صدا می‌زند — یک خط `perform public.expire_pending_delivery_receipts();` بعد از آن اضافه می‌شود.
- جدول `workflow_settings` با سطرهای `shipping_receipt` (۳۶۰دق) و `delivery_receipt` (۱۸۰دق) از قبل وجود دارد.
- `audit_logs(entity_type, entity_id, action, actor_id, diff)` و `notification_events(event_type, user_id, channel, payload, status)` همان شکلی است که RPCها انتظار دارند (با Slice 9/10 تأیید شد).

### Migration (یک فایل، غیرمخرب)

1. **CREATE TABLE `public.delivery_receipts`** با ستون‌های ذکرشده، CHECKهای `type` و `status`، FK به `invoices`/`customers`/`auth.users`، و defaults روی `status`/`created_at`/`updated_at`.
2. **CREATE TABLE `public.delivery_receipt_status_history`** با FK به `delivery_receipts(id)` و `auth.users(id)`.
3. **ایندکس‌ها** روی `type`، `status`، `uploaded_by`، `invoice_id`، `customer_id`، ایندکس جزئی روی `review_deadline WHERE status='pending_review'`، و `receipt_id` در تاریخچه.
4. **Trigger** `set_delivery_receipts_updated_at BEFORE UPDATE` با `public.set_updated_at()`.
5. **GRANT**:
   - `delivery_receipts`: `select, insert, update` به `authenticated`، `all` به `service_role`.
   - `delivery_receipt_status_history`: `select, insert` به `authenticated`، `all` به `service_role`.
6. **ENABLE RLS** روی هر دو جدول.
7. **Policies** (دقیقاً مطابق پرامپت):
   - SELECT روی `delivery_receipts`: مالک، admin/manager، و sales فقط برای `pending_review`.
   - INSERT: manager/admin/sales.
   - UPDATE: manager/admin/sales (همراه با `WITH CHECK` همان عبارت برای جلوگیری از escalation).
   - SELECT روی history: مالک رسید، admin/manager/sales.
   - INSERT روی history: `changed_by = auth.uid() OR changed_by IS NULL`.

### RPCها (`SECURITY DEFINER`, `set search_path = public`)

8. `create_delivery_receipt(p_type, p_storage_path, p_file_name, p_file_size, p_mime_type, p_invoice_id default null, p_customer_id default null, p_notes default null) returns uuid`:
   - گارد نقش‌ها، خواندن `timer_minutes` از `workflow_settings` (fallback 180)، محاسبهٔ `review_deadline`.
   - درج رسید + تاریخچه `null→pending_review`.
   - انتخاب اولین `sales` فعال از `profiles ⋈ user_roles` و درج `notification_events`.
   - درج در `audit_logs` با `entity_type='delivery_receipt'`, `action='created'`.
   - GRANT EXECUTE به `authenticated`.

9. `review_delivery_receipt(p_receipt_id, p_decision, p_note default null) returns void`:
   - گارد نقش‌ها، تنها از `pending_review` به `confirmed/rejected` (به‌علاوه CHECK سمت تابع که `p_decision IN ('confirmed','rejected')`).
   - به‌روزرسانی رسید + درج تاریخچه + اعلان به آپلودکننده + audit_log.
   - GRANT EXECUTE به `authenticated`.

10. `expire_pending_delivery_receipts() returns void`:
    - حلقه روی رسیدهای `pending_review` با `review_deadline < now()`: تغییر به `expired` + تاریخچه + (در صورت `penalty_enabled` در workflow_settings برای آن `type`) فراخوانی `auto_submit_penalty(null, uploaded_by, 'no_confirm_store', 'low', ...)` + notification.
    - GRANT EXECUTE به `service_role`.

11. `get_delivery_receipts(p_type, p_status, p_invoice_id, p_limit default 20, p_offset default 0) returns table(...)`:
    - JOIN با `profiles` برای نام آپلودکننده و بازبین، با همان فیلتر دسترسی (مالک یا admin/manager/sales).
    - GRANT EXECUTE به `authenticated`.

12. **به‌روزرسانی `tick_inquiries`**: `CREATE OR REPLACE` همان بدنهٔ فعلی + افزودن خط `perform public.expire_pending_delivery_receipts();` بعد از فراخوانی `expire_pending_documents()`. بدون cron جدید.

### Storage bucket (با ابزار storage، نه SQL)

13. ساخت bucket `delivery-receipts` به‌صورت **private**.
14. سیاست‌های `storage.objects` در همان migration (سیاست روی `storage.objects` مجاز است):
    - INSERT: `bucket_id='delivery-receipts'` و کاربر دارای نقش manager/admin/sales.
    - SELECT: `bucket_id='delivery-receipts'` و `auth.role()='authenticated'`.
    - (UPDATE/DELETE فعلاً لازم نیست؛ افزوده نمی‌شود.)
    - الگوی مسیر فایل (در UI/RPC مرحله ۲ رعایت می‌شود): `<type>/<receipt_id>/<uuid>.<ext>`.

### رعایت قواعد پروژه

- migration غیرمخرب: فقط CREATE/ALTER (اضافی) و CREATE OR REPLACE روی توابع.
- RLS فعال + GRANT کامل + audit_log + اعلان + RBAC هم در RPC هم در policy (دفاع لایه‌ای).
- ایندکس جزئی برای جلوگیری از scan کل جدول هنگام انقضا.
- بدون cron مستقل (روی tick_inquiries سوار می‌شود).
- بدون CDN/سرویس خارجی؛ خودمیزبان‌سازگار.

### خارج از scope این مرحله

- UI، hook، routeها، تغییرات سایر RPCها/جدول‌ها، migration دیگر.
