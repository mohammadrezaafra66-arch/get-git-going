## Slice 8 — سیستم کارت قرمز (فقط دیتابیس)

پیاده‌سازی فقط در یک migration جدید زیر `supabase/migrations/`. هیچ تغییری در UI/کلاینت در این Slice. SQL پیشنهادی کاربر باید با اسکیمای واقعی پروژه تطبیق داده شود — موارد زیر در پلن اعمال شده‌اند.

### تطبیق با اسکیمای واقعی (مهم — فرق با SQL ارسالی)

- جدول `audit_events` و `notifications` وجود ندارد. به‌جای آن‌ها از موارد موجود استفاده می‌شود:
  - audit → `public.audit_logs(entity_type text, entity_id text, action text, actor_id uuid, diff jsonb)`
  - notification داخل‌اپ → `public.notification_events(user_id, title, body, type, reference_type, reference_id)`
- `profiles` ستون `role` و `active` ندارد. نقش‌ها در `public.user_roles` با enum `app_role` نگهداری می‌شوند و از تابع موجود `public.has_role(_user_id, _role)` استفاده می‌کنیم. فعال‌بودن از `profiles.is_active` خوانده می‌شود.
- `inquiries.user_id` وجود ندارد؛ کاربر مرتبط با تخلف از `inquiries.assigned_to`/`requested_by` گرفته می‌شود (در منطق صدور خودکار).
- نام نقش‌های ارسالی (`system_admin`, `company_manager`, `purchase_manager`) باید با enum واقعی `app_role` تطبیق پیدا کند → نیازمند تایید شما (سؤال پایین).

### ۱) Migration: سه جدول + ایندکس + GRANT + RLS

فایل: `supabase/migrations/<timestamp>_red_card_system.sql`

جدول‌ها مطابق ارسال شما، با این اصلاحات:

- `performance_penalties`: بدون تغییر ساختار. `created_by NULL` = صدور خودکار.
- `penalty_appeals`: بدون تغییر (با `unique(penalty_id)`).
- `appeal_reviewers`: بدون تغییر.
- ایندکس‌ها مطابق ارسالی شما.
- پس از هر `CREATE TABLE` بلوک `GRANT` استاندارد (طبق قانون پروژه):
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
  GRANT ALL ON public.<t> TO service_role;
  ```
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` روی هر سه.

### ۲) RLS Policies (بازنویسی‌شده با `has_role`)

- `performance_penalties`
  - SELECT: کاربر صاحب (`user_id = auth.uid()`)، یا `has_role(auth.uid(),'admin'|'manager'|...)` بر اساس نقش‌های واقعی پروژه.
  - INSERT/UPDATE: فقط `service_role` (تخلف فقط از طریق RPC با SECURITY DEFINER ثبت/غیرفعال می‌شود).
- `penalty_appeals`
  - SELECT: appellant خودش + اعضای هیئت (`EXISTS appeal_reviewers`) + مدیران.
  - INSERT/UPDATE: فقط service_role (همه‌چیز از طریق RPC).
- `appeal_reviewers`
  - SELECT: خود reviewer + appellant مربوطه + مدیران.
  - INSERT/UPDATE: فقط service_role.

### ۳) چهار RPC (همگی `SECURITY DEFINER` + `SET search_path = public`)

1. `auto_submit_penalty(p_inquiry_id, p_user_id, p_type, p_severity, p_description) RETURNS uuid`
  - منطق ضد تکرار طبق ارسالی.
  - audit به `audit_logs(entity_type='penalty', entity_id=v_penalty_id::text, action='auto_created', actor_id=p_user_id, diff=jsonb_build_object(...))`.
  - notification به `notification_events(user_id, title='کارت قرمز جدید', body='...', type='red_card_issued', reference_type='penalty', reference_id=v_penalty_id)`.
  - `REVOKE EXECUTE FROM public, anon, authenticated; GRANT EXECUTE TO service_role` — فقط cron/سرور صدا بزند.
2. `submit_appeal(p_penalty_id, p_reason) RETURNS uuid`
  - چک مالکیت، مهلت ۲۴h، عدم تکرار.
  - انتخاب هیئت ۳نفره با `has_role` + `profiles.is_active = true`؛ نقش‌ها بعد از پاسخ شما به سؤال نقش‌ها قطعی می‌شود.
  - notification به هیئت از طریق `notification_events`.
  - `GRANT EXECUTE TO authenticated` (کاربر برای خودش صدا می‌زند).
3. `vote_on_appeal(p_appeal_id, p_vote, p_note) RETURNS jsonb`
  - چک عضویت + رأی‌نداده، ثبت رأی، شمارش ۲از۳، آپدیت `penalty_appeals.status`، در صورت `accepted` → `performance_penalties.is_active=false`.
  - notification به appellant.
  - `GRANT EXECUTE TO authenticated`.
4. `get_user_penalties(p_user_id uuid default null) RETURNS TABLE(...)`
  - اگر `p_user_id` پاس شد و فراخوان کاربر دیگری است → فقط برای مدیران مجاز (`has_role`).
  - `GRANT EXECUTE TO authenticated`.

### ۴) اتصال به pg_cron برای صدور خودکار بعد از ۱۰ دقیقه

تابع `public.tick_inquiries()` (cron `inquiries-tick` هر دقیقه) همین حالا گذار به `critical_10min`/`transfer_available` را انجام می‌دهد. به‌جای ساخت cron job جدید، **همان تابع را extend می‌کنیم**: داخل گذار `danger_8min → critical_10min` (یا بلافاصله پس از آن) برای هر inquiry که تازه به ۱۰دقیقه رسیده، یک‌بار `auto_submit_penalty(...)` با:

- `p_user_id = inquiries.assigned_to` (اگر null → `requested_by`)
- `p_type = 'no_response_primary'`
- `p_severity = 'medium'`
- `p_description = 'عدم پاسخ مسئول اول طی ۱۰ دقیقه'`
صدا زده شود. به‌خاطر unique-guard داخل RPC، صدور دوباره برای همان (inquiry,user,type) رخ نمی‌دهد.

این تغییر کوچک و in-place در `tick_inquiries` انجام می‌شود و هیچ cron job جدیدی اضافه نمی‌کنیم (طبق قانون «از موارد موجود استفاده کن»).

### ریسک‌ها و ملاحظات

- نام‌های نقش (`system_admin`/`company_manager`/`purchase_manager`) باید با enum `app_role` پروژه match شوند؛ در غیر این صورت migration fail می‌شود.
- چون RLS فقط service_role را برای INSERT/UPDATE روی این جدول‌ها مجاز می‌کند، تمام نوشتن‌ها باید از طریق RPC های SECURITY DEFINER انجام شود (الگوی استاندارد پروژه).
- migration غیرمخرب است (فقط CREATE + CREATE OR REPLACE روی `tick_inquiries`). rollback: drop سه جدول + restore نسخه قبلی `tick_inquiries`.
- بدون UI/کلاینت — فقط دیتابیس (طبق درخواست).

### قبل از build، یک سؤال لازم

نقش‌های واقعی enum `app_role` پروژه چیست؟ تا policy ها و انتخاب هیئت در `submit_appeal` با نام‌های دقیق نوشته شود. اگر می‌خواهید همان مقادیر ارسالی (`system_admin`,`company_manager`,`purchase_manager`) به enum اضافه شوند، در همین migration اضافه‌شان می‌کنم.  


---

نقش‌های enum `app_role` پروژه:

```
admin, manager, sales, accountant, viewer

```

تطبیق با سیستم کارت قرمز:

- `system_admin` → `admin`
- `company_manager` → `manager`
- `purchase_manager` → `manager`
- مسئول خرید (که تخلف بهش ثبت می‌شه) → هر نقشی می‌تونه باشه، `user_id` از `inquiries.assigned_to` گرفته می‌شه

برای هیئت ۳ نفره در `submit_appeal`:

- نقش `manager`: عضو اول و دوم هیئت
- نقش `admin`: عضو خنثی (neutral)

لطفاً migration را با این نقش‌ها build کن. نیازی به اضافه کردن مقدار جدید به enum نیست.

---

  
