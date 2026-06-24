## Task ID

messenger-storage-bucket-phase-2

## Classification

PLAN ONLY — یک bucket جدید + یک migration برای policyهای `storage.objects`. هیچ تغییر کد.

## File edits allowed

No (plan mode). در صورت تأیید:

- ساخت bucket از طریق tool رسمی `supabase--storage_create_bucket` (نه SQL).
- یک فایل جدید `supabase/migrations/<ts>_messenger_attachments_storage_policies.sql` فقط برای policyهای `storage.objects` و یک helper function در `public`.

## Goal

آماده‌سازی محل امن آپلود/دانلود/حذف پیوست‌های پیام‌رسان، با دسترسی محدود به اعضای گروه و سقف حجم تفکیک‌شده بر اساس نوع فایل.

## Current state

- جدول `public.messenger_attachments` با ستون‌های `message_id, file_path, file_name, file_type, file_size` فعال است.
- جدول `public.messenger_messages` با `sender_id, group_id`.
- helper `public.is_messenger_group_member(_group_id, _user_id)` (SECURITY DEFINER) موجود.
- هیچ bucket یا policy روی `storage.objects` برای پیام‌رسان نیست.
- جدول قدیمی `public.messages` (inbox) دست‌نخورده.

## Scope (این فاز)

1. ساخت bucket `messenger-attachments` به‌صورت **private** با `supabase--storage_create_bucket`.
2. در migration:
  - تنظیم محدودیت سراسری bucket: `file_size_limit = 52428800` (۵۰MB، سقف بزرگ‌ترین نوع) و `allowed_mime_types` به مجموعه‌ی mimeهای مجاز (jpg/jpeg/png/webp, mp4/webm, pdf, doc/docx, zip, xlsx). این کار با `UPDATE storage.buckets SET ... WHERE id='messenger-attachments'` انجام می‌شود (مجاز برای ستون‌های پیکربندی).
  - تابع کمکی `public.messenger_attachment_size_ok(_name text, _size bigint)` در schema `public` (SECURITY INVOKER، `STABLE`، `search_path=public`) که سقف per-extension را به‌صورت زیر اعمال می‌کند:
    - jpg/jpeg/png/webp → 5MB
    - mp4/webm → 50MB
    - pdf → 20MB
    - doc/docx → 10MB
    - zip/xlsx → 5MB
    - هر چیز دیگری → false
  - تابع `public.messenger_attachment_path_owner(_name text)` برای استخراج segment اول مسیر و مقایسه با `auth.uid()`.
  - تابع `public.messenger_attachment_visible(_name text, _uid uuid)` (SECURITY DEFINER، `search_path=public`) که یک LEFT JOIN بین `messenger_attachments` و `messenger_messages` انجام می‌دهد و `is_messenger_group_member(m.group_id, _uid)` را بررسی می‌کند.
3. سه policy روی `storage.objects` با `bucket_id = 'messenger-attachments'`:
  - **INSERT (authenticated)**: `auth.uid() IS NOT NULL` و `messenger_attachment_path_owner(name)` و `messenger_attachment_size_ok(name, (metadata->>'size')::bigint)`.
  - **SELECT (authenticated)**: `messenger_attachment_visible(name, auth.uid())` یا `owner = auth.uid()` (uploader همیشه فایل خودش را می‌بیند).
  - **DELETE (authenticated)**: `owner = auth.uid()` و `messenger_attachment_path_owner(name)` (اطمینان مضاعف: فقط uploader حذف می‌کند).
  - **UPDATE**: ممنوع (هیچ policy، طبق RLS deny-by-default).
4. ساختار مسیر: `{auth.uid()}/{uuid}.{ext}` — کنترل با تابع `messenger_attachment_path_owner`.

## Out of scope

- هیچ تغییر در `messenger_attachments` یا سایر جداول `public`.
- هیچ thumbnail، resize، یا EXIF strip.
- هیچ RPC، serverFn، edge function، یا UI.
- هیچ تغییر روی bucketهای موجود دیگر.
- هیچ admin override برای دیدن فایل‌های سایر گروه‌ها.
- هیچ پشتیبانی از mimeهای خارج از لیست (مثل audio/wav یا svg).

## Files likely to change

- `supabase/migrations/<ts>_messenger_attachments_storage_policies.sql` (تنها فایل، policy + helper functions + UPDATE روی `storage.buckets`).
- ایجاد bucket فقط از طریق tool — هیچ تغییر فایل دیگری.

## Database / migration impact

- ۳ تابع جدید در `public` (size_ok, path_owner, visible).
- ۳ policy جدید روی `storage.objects` با فیلتر `bucket_id = 'messenger-attachments'`.
- ۱ ردیف جدید در `storage.buckets` (از طریق tool).
- ۱ UPDATE روی همان ردیف برای ست کردن `file_size_limit` و `allowed_mime_types`.
- Reversible: drop policies + drop functions + delete bucket row + delete objects.
- Idempotent: `DROP POLICY IF EXISTS` و `CREATE OR REPLACE FUNCTION`.

## RLS / RBAC / audit impact

- `storage.objects` همان RLS داخلی Supabase را دارد؛ policyهای ما فقط برای bucket مورد نظر اضافه می‌شوند و سایر bucketها را تحت تأثیر قرار نمی‌دهند.
- دسترسی download از طریق `messenger_attachment_visible` به جدول `messenger_attachments` و `messenger_messages` متصل است → اعضای گروه می‌بینند.
- audit log در این فاز اضافه نمی‌شود (Phase 3 با trigger).

## Performance impact

- هر دانلود یک lookup روی `messenger_attachments.file_path` انجام می‌دهد → نیاز به index یکتا روی `messenger_attachments(file_path)` در همین migration (هم‌اکنون وجود ندارد).
- `messenger_attachment_visible` در hot-path دانلود فایل صدا می‌شود؛ با index بالا O(log n).
- بدون realtime/پیمایش عمومی.

## UI/UX impact

هیچ. صفحه‌ی `/messages` همچنان Placeholder. هیچ کامپوننت آپلودی اضافه نمی‌شود.

## Implementation phases

این فاز فقط Storage. فاز ۳ بعداً: RPC ارسال پیام + UI آپلود + audit + realtime.

## Acceptance criteria

- bucket `messenger-attachments` در لیست buckets موجود است و `public = false`.
- `file_size_limit = 52428800`، `allowed_mime_types` شامل تمام mimeهای ذکرشده.
- linter پس از migration: هیچ ERROR جدید. WARNهای `Function Search Path Mutable` مربوط به توابع جدید نباشد (همه `SET search_path` دارند).
- کاربر غیرعضو با دانستن `name` فایل، نمی‌تواند آن را دانلود کند.
- عضو گروه مرجع می‌تواند دانلود کند.
- آپلود با `name` شروع‌شده با UUID متفاوت از `auth.uid()` رد می‌شود.
- آپلود jpg با حجم > 5MB یا mp4 با حجم > 50MB در policy رد می‌شود.
- آپلود mime خارج از لیست (مثل text/plain) توسط `allowed_mime_types` bucket رد می‌شود.
- حذف توسط کاربری غیر از uploader رد می‌شود.
- UPDATE روی object همیشه رد می‌شود.

## Manual test path (با Supabase JS از دو کاربر تستی A و B)

1. A یک گروه می‌سازد و B را عضو می‌کند، یک پیام می‌فرستد و یک ردیف در `messenger_attachments` با `file_path = '<A.uid>/test.pdf'` ثبت می‌کند.
2. A فایل `<A.uid>/test.pdf` (PDF ≤ 20MB) را آپلود می‌کند → OK.
3. A تلاش به آپلود `<B.uid>/x.pdf` → reject.
4. A آپلود `<A.uid>/big.mp4` با 60MB → reject.
5. A آپلود `<A.uid>/x.txt` → reject (mime).
6. B (عضو) دانلود `<A.uid>/test.pdf` → OK.
7. کاربر C (غیرعضو) دانلود همان فایل → reject.
8. B تلاش به DELETE فایل → reject. A حذف → OK.
9. UPDATE روی object → reject.

## Commands to run

- پس از تأیید پلن: `supabase--storage_create_bucket(name='messenger-attachments', public=false)` → سپس `supabase--migration` با محتوای زیر.
- پس از apply: مرور `supabase--linter`.
- در صورت ساخت کد بعداً: `npm run build` برای regenerate types.

## Risks

- **سقف per-type با policy، نه با bucket-native**: bucket-level `file_size_limit` فقط یک عدد است (50MB). محدودیت 5/10/20MB در policyی RLS بررسی می‌شود؛ اگر کلاینت با streaming/multipart تلاش به دور زدن کند، Supabase Storage قبل از commit حجم را در metadata می‌نویسد و policy آن را می‌بیند، اما بهتر است در فاز ۳ سرور-ساید (createServerFn) نیز یک pre-check اضافه شود.
- **race condition آپلود/متادیتا**: ابتدا فایل آپلود می‌شود (مسیر `{user_id}/{uuid}.ext`) سپس ردیف `messenger_attachments` ثبت می‌شود. تا قبل از ثبت ردیف، `messenger_attachment_visible` همان فایل را برای کسی غیر از uploader قابل دید نمی‌کند (که درست است). اگر ردیف هرگز ثبت نشد → orphan file. در Phase 3 با cleanup job یا تراکنشی کردن در RPC حل می‌شود.
- **mime sniffing کلاینت**: `allowed_mime_types` بر اساس Content-Type کلاینت بررسی می‌شود؛ کاربر بدخواه می‌تواند mime جعلی بفرستد. در فاز ۳ سرور باید magic-bytes بررسی کند.
- **SECURITY DEFINER**: تابع `messenger_attachment_visible` با SECURITY DEFINER دسترسی به جدول‌های private می‌گیرد؛ EXECUTE فقط به `authenticated` و `service_role` داده می‌شود.
- **عدم audit**: حذف/آپلود فایل لاگ نمی‌شود (Phase 3).
- **self-host migration**: همین migration روی نسخه‌ی self-host هم باید قابل اجرا باشد؛ به‌دلیل وابستگی به schema `storage`، اگر آنجا schema تفاوت داشته باشد ممکن است نیاز به adapter باشد. باید روی self-host قبل از production تست شود (طبق `MIGRATION_SAFETY_POLICY`).

## Stop conditions

- اگر workspace policy `cloud_block_public_buckets` با ساخت private bucket مشکلی نداشته باشد (انتظار می‌رود نه). اگر هر خطای ایجاد bucket رخ داد → توقف و اطلاع به کاربر.
- اگر linter ERROR جدید روی توابع/policyهای این فاز گزارش کرد → اصلاح در همان migration.
- اگر کاربر بخواهد ساختار مسیر یا سقف‌ها را تغییر دهد → re-plan.

## Smallest safe next implementation slice

همین یک bucket + یک migration. هیچ کد TS تغییر نمی‌کند.

## Technical detail — SQL skeleton (برای مرور قبل از apply)

```sql
-- 0) bucket created via tool, then:
UPDATE storage.buckets
   SET file_size_limit  = 52428800,
       allowed_mime_types = ARRAY[
         'image/jpeg','image/png','image/webp',
         'video/mp4','video/webm',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/zip',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]
 WHERE id = 'messenger-attachments';

-- 1) unique index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS ux_messenger_attachments_file_path
  ON public.messenger_attachments(file_path);

-- 2) helper functions in public (SET search_path = public)
CREATE OR REPLACE FUNCTION public.messenger_attachment_path_owner(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT split_part(_name, '/', 1) = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_size_ok(_name text, _size bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE lower(regexp_replace(_name, '^.*\.', ''))
    WHEN 'jpg'  THEN _size <= 5*1024*1024
    WHEN 'jpeg' THEN _size <= 5*1024*1024
    WHEN 'png'  THEN _size <= 5*1024*1024
    WHEN 'webp' THEN _size <= 5*1024*1024
    WHEN 'mp4'  THEN _size <= 50*1024*1024
    WHEN 'webm' THEN _size <= 50*1024*1024
    WHEN 'pdf'  THEN _size <= 20*1024*1024
    WHEN 'doc'  THEN _size <= 10*1024*1024
    WHEN 'docx' THEN _size <= 10*1024*1024
    WHEN 'zip'  THEN _size <= 5*1024*1024
    WHEN 'xlsx' THEN _size <= 5*1024*1024
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_visible(_name text, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_attachments a
    JOIN public.messenger_messages m ON m.id = a.message_id
    WHERE a.file_path = _name
      AND public.is_messenger_group_member(m.group_id, _uid)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) TO authenticated, service_role;

-- 3) policies on storage.objects scoped to bucket
CREATE POLICY "msg_att_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'messenger-attachments'
    AND public.messenger_attachment_path_owner(name)
    AND public.messenger_attachment_size_ok(name, COALESCE((metadata->>'size')::bigint, 0))
  );

CREATE POLICY "msg_att_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'messenger-attachments'
    AND ( owner = auth.uid()
       OR public.messenger_attachment_visible(name, auth.uid()) )
  );

CREATE POLICY "msg_att_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'messenger-attachments'
    AND owner = auth.uid()
    AND public.messenger_attachment_path_owner(name)
  );
-- (no UPDATE policy → updates are denied)
```

  
لطفاً Phase 2 پیوست‌های پیام‌رسان را اجرا کن — دقیقاً طبق پلن زیر، هیچ کد TS/UI تغییر نکند:

مرحله ۱: bucket ایجاد کن

- نام: messenger-attachments

- نوع: private (public = false)

مرحله ۲: migration جدید بساز در supabase/migrations/<timestamp>_messenger_attachments_storage_policies.sql

با این محتوا (دقیقاً):

-- UPDATE bucket config

UPDATE storage.buckets

   SET file_size_limit = 52428800,

       allowed_mime_types = ARRAY[

         'image/jpeg','image/png','image/webp',

         'video/mp4','video/webm',

         'application/pdf',

         'application/msword',

         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

         'application/zip',

         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

       ]

 WHERE id = 'messenger-attachments';

-- unique index

CREATE UNIQUE INDEX IF NOT EXISTS ux_messenger_attachments_file_path

  ON public.messenger_attachments(file_path);

-- helper functions

CREATE OR REPLACE FUNCTION public.messenger_attachment_path_owner(_name text)

RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$

  SELECT split_part(_name, '/', 1) = auth.uid()::text

$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_size_ok(_name text, _size bigint)

RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$

  SELECT CASE lower(regexp_replace(_name, '^.*\.', ''))

    WHEN 'jpg'  THEN _size <= 5242880

    WHEN 'jpeg' THEN _size <= 5242880

    WHEN 'png'  THEN _size <= 5242880

    WHEN 'webp' THEN _size <= 5242880

    WHEN 'mp4'  THEN _size <= 52428800

    WHEN 'webm' THEN _size <= 52428800

    WHEN 'pdf'  THEN _size <= 20971520

    WHEN 'doc'  THEN _size <= 10485760

    WHEN 'docx' THEN _size <= 10485760

    WHEN 'zip'  THEN _size <= 5242880

    WHEN 'xlsx' THEN _size <= 5242880

    ELSE false

  END

$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_visible(_name text, _uid uuid)

RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$

  SELECT EXISTS (

    SELECT 1 FROM public.messenger_attachments a

    JOIN public.messenger_messages m ON [m.id](http://m.id) = a.message_id

    WHERE a.file_path = _name

      AND [public.is](http://public.is)_messenger_group_member([m.group](http://m.group)_id, _uid)

  )

$$;

REVOKE EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) TO authenticated, service_role;

-- DROP old policies if exist

DROP POLICY IF EXISTS "msg_att_insert" ON storage.objects;

DROP POLICY IF EXISTS "msg_att_select" ON storage.objects;

DROP POLICY IF EXISTS "msg_att_delete" ON storage.objects;

-- policies

CREATE POLICY "msg_att_insert" ON storage.objects FOR INSERT TO authenticated

  WITH CHECK (

    bucket_id = 'messenger-attachments'

    AND public.messenger_attachment_path_owner(name)

    AND public.messenger_attachment_size_ok(name, COALESCE((metadata->>'size')::bigint, 0))

  );

CREATE POLICY "msg_att_select" ON storage.objects FOR SELECT TO authenticated

  USING (

    bucket_id = 'messenger-attachments'

    AND ( owner = auth.uid()

       OR public.messenger_attachment_visible(name, auth.uid()) )

  );

CREATE POLICY "msg_att_delete" ON storage.objects FOR DELETE TO authenticated

  USING (

    bucket_id = 'messenger-attachments'

    AND owner = auth.uid()

    AND public.messenger_attachment_path_owner(name)

  );

بعد از apply:

1. linter را اجرا کن و نتیجه گزارش بده

2. تأیید کن bucket در لیست buckets با public=false موجود است

3. npm run build اجرا کن