## Task ID

messenger-core-db-migration

## Classification

PLAN ONLY — single database migration (no code, no UI, no edge function).

## File edits allowed

No (plan mode). On approval: one new file under `supabase/migrations/` only.

## Goal

ایجاد ۵ جدول پایه‌ی پیام‌رسان داخلی AfraKala با RLS امن و بدون recursion.

## Current state

- جدول `public.messages` فعلی یک inbox ساده‌ی recipient-based است (sender_id, recipient_id, subject, body, is_read). با مدل گروهی درخواست‌شده تداخل ندارد و دست‌نخورده باقی می‌ماند.
- route `/_app/messages` فقط Placeholder است (هیچ کوئری روی جداول جدید ندارد).
- هیچ جدول `messenger_*` وجود ندارد.

## Scope

یک migration واحد timestamped که فقط شامل:

1. ساخت ۵ جدول دقیقاً با ستون‌های درخواست‌شده.
2. GRANTهای لازم (authenticated + service_role) چون همه policyها به `auth.uid()` متصل‌اند → بدون `anon`.
3. تابع SECURITY DEFINER کمکی `public.is_messenger_group_member(_group_id uuid, _user_id uuid)` برای جلوگیری از RLS recursion.
4. فعال‌سازی RLS روی هر ۵ جدول.
5. Policyهای حداقلی طبق درخواست + پوشش insert/delete امن.
6. ایندکس‌های ضروری برای کوئری‌های متداول.

## Out of scope

- هیچ تغییری در `public.messages` موجود.
- هیچ Storage bucket یا policy روی storage (پیوست‌ها فعلاً فقط متادیتا).
- هیچ realtime publication، trigger، یا audit trigger.
- هیچ RPC، serverFn، route، یا UI.
- هیچ seed data.
- هیچ تغییر در `user_roles` یا RBAC.

## Files likely to change

- `supabase/migrations/<timestamp>_messenger_core_tables.sql` (جدید، تنها فایل).

## Database / migration impact

- ۵ جدول جدید در `public`.
- ۱ تابع SECURITY DEFINER جدید با `search_path=public`.
- Reversible: drop function + drop tables (CASCADE روی foreign keys داخلی خودشان).
- Idempotent: همه با `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` قبل از CREATE POLICY.
- Destructive نیست → نیازی به backup خاص ندارد، اما طبق `MIGRATION_SAFETY_POLICY` در staging قبل از production تست شود.

## RLS / RBAC / audit impact

- RLS روی هر ۵ جدول فعال.
- دسترسی فقط برای اعضای گروه از طریق `is_messenger_group_member()` (SECURITY DEFINER) — جلوگیری از infinite recursion در policy روی `messenger_group_members`.
- ویرایش/حذف پیام فقط توسط `sender_id = auth.uid()`.
- RBAC موجود (`has_role`) دست‌نخورده؛ admin override در این فاز اضافه نمی‌شود (می‌تواند فاز بعد).
- Audit log: در این migration اضافه نمی‌شود؛ در صورت نیاز در فاز جداگانه با trigger روی INSERT/UPDATE/DELETE اضافه می‌شود (یادداشت ریسک).

## Performance impact

- ایندکس‌ها: `(group_id, created_at DESC)` روی `messenger_messages`، `(user_id)` روی `messenger_group_members`، `(message_id)` روی `messenger_attachments` و `messenger_read_receipts`.
- کوئری list پیام‌ها همیشه باید با `LIMIT` و pagination در UI/سرور آینده مصرف شود (خارج از این migration).

## UI/UX impact

هیچ. صفحه‌ی `/messages` همچنان Placeholder می‌ماند.

## Implementation phases

Phase 1 (این پلن): migration پایه + RLS + ایندکس.
Phase 2 (بعداً، جداگانه): Storage bucket برای پیوست‌ها + policy.
Phase 3 (بعداً): RPC/serverFn ارسال پیام + audit trigger + realtime + UI.

## Acceptance criteria

- migration روی Lovable Cloud بدون خطا اعمال شود.
- `supabase--linter` هیچ ERROR جدیدی روی این ۵ جدول گزارش نکند (WARNINGها بررسی و در گزارش ذکر شوند).
- کاربر غیرعضو با `SELECT` روی پیام‌های یک گروه هیچ ردیفی نبیند.
- عضو گروه فقط پیام‌های همان گروه را ببیند.
- فقط `sender_id` بتواند `UPDATE`/`soft delete` روی پیام خودش انجام دهد.
- INSERT پیام/عضویت/پیوست/read receipt فقط در گروه‌هایی که کاربر عضو است.
- `messenger_groups` INSERT فقط با `created_by = auth.uid()`.

## Manual test path (با psql/Supabase به‌عنوان دو کاربر تستی)

1. user A یک گروه می‌سازد → خودش به‌عنوان admin در `messenger_group_members` اضافه می‌شود (در این فاز به‌صورت دستی، چون trigger نداریم؛ این محدودیت در گزارش ذکر می‌شود).
2. user A پیام می‌فرستد → user B (غیرعضو) نباید ببیند.
3. user A عضو می‌کند B را → B می‌بیند.
4. user B تلاش به UPDATE پیام A → reject.
5. user A پیام خود را edit/soft-delete می‌کند → OK.

## Commands to run

- پس از apply: `supabase--linter`.
- `npm run build` و `npm run lint` (تأثیر صفر روی کد، فقط برای اطمینان از regenerate شدن `src/integrations/supabase/types.ts`).

## Risks

- **Self-bootstrap گروه**: بدون trigger، سازنده‌ی گروه باید جداگانه خودش را به اعضا اضافه کند. در فاز RPC حل می‌شود. ریسک کوتاه‌مدت: گروه‌های یتیم در صورت خطای client.
- **عدم audit log**: مغایر با اصل ۱۰ AGENTS.md برای «sensitive actions». در پلن Phase 3 پوشش داده می‌شود؛ تا آن زمان به‌عنوان ریسک شناخته‌شده.
- **عدم moderation**: حذف/ویرایش توسط admin گروه در این فاز نیست.
- **پیوست‌ها بدون bucket**: درج ردیف در `messenger_attachments` بدون فایل واقعی ممکن است؛ تا فاز Storage نباید از UI استفاده شود.
- **Realtime**: publication اضافه نمی‌شود؛ subscribe در UI آینده نیازمند migration کوچک جدا.

## Stop conditions

- اگر کاربر بخواهد جدول `messages` موجود حذف/merge شود → توقف و پلن جداگانه.
- اگر linter ERROR روی جدول‌های جدید بدهد → اصلاح در همان migration قبل از تأیید نهایی.
- اگر کاربر admin-override یا audit را در همین فاز بخواهد → پلن گسترش یابد.

## Smallest safe next implementation slice

همین یک migration. هیچ کد TS/UI تغییر نمی‌کند.

## Technical detail — SQL skeleton (برای مرور قبل از apply)

```sql
-- 1) helper (SECURITY DEFINER → no RLS recursion)
CREATE OR REPLACE FUNCTION public.is_messenger_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- 2) tables (هر کدام دقیقاً با ستون‌های درخواست‌شده) + GRANTs + ENABLE RLS + POLICY
--    ترتیب: CREATE TABLE → GRANT → ENABLE RLS → POLICY (مطابق راهنمای Lovable Cloud)
```

Policy خلاصه:

- `messenger_groups`: SELECT اگر `is_messenger_group_member(id, auth.uid())`؛ INSERT اگر `created_by = auth.uid()`؛ UPDATE/DELETE فقط `created_by`.
- `messenger_group_members`: SELECT اگر عضو همان گروه؛ INSERT/DELETE اگر `created_by` گروه = auth.uid() (مدیریت توسط سازنده در این فاز).
- `messenger_messages`: SELECT اگر عضو گروه و `deleted_at IS NULL`؛ INSERT اگر `sender_id = auth.uid()` و عضو؛ UPDATE/DELETE اگر `sender_id = auth.uid()`.
- `messenger_attachments`: SELECT/INSERT/DELETE بر اساس عضویت در گروه پیام مادر (subquery به `messenger_messages`).
- `messenger_read_receipts`: SELECT اگر عضو گروه پیام؛ INSERT اگر `user_id = auth.uid()` و عضو؛ بدون UPDATE/DELETE.  
  
لطفاً فقط یک migration جدید ایجاد کن در مسیر:
  supabase/migrations/<timestamp>_messenger_core_tables.sql
  محتوای migration دقیقاً طبق plan زیر باشد — هیچ کد TS، UI، یا route تغییر نکند.
  [محتوای Task 0.1 از سند را اینجا paste کن]
  بعد از apply:
  1. supabase linter را اجرا کن و نتیجه را گزارش بده
  2. npm run build را اجرا کن تا types.ts regenerate شود