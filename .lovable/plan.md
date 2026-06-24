## Task ID

messenger-phase-3-rpc-realtime-ui

## Classification

PLAN ONLY — تغییرات شامل migration (RPCها + realtime publication)، یک وابستگی npm جدید، و یک route UI. ریسک متوسط به‌خاطر RPCهای SECURITY DEFINER.

## File edits allowed

No (plan mode). در صورت تأیید:

- `supabase/migrations/<ts>_messenger_rpc_and_realtime.sql` (تنها migration این فاز)
- `package.json` + lockfile → افزودن `moment-jalaali` (و `@types/moment-jalaali`) اگر در پروژه نیست
- `src/routes/_app.messages.tsx` — جایگزینی Placeholder
- ایجاد چند فایل کوچک UI زیر `src/components/messenger/` و یک hook:
  - `src/components/messenger/ConversationsSidebar.tsx`
  - `src/components/messenger/ChatWindow.tsx`
  - `src/components/messenger/MessageList.tsx`
  - `src/components/messenger/MessageComposer.tsx`
  - `src/components/messenger/NewGroupDialog.tsx`
  - `src/hooks/messenger/useMessengerGroups.ts`
  - `src/hooks/messenger/useMessengerMessages.ts`
  - `src/lib/messenger/format.ts` (تاریخ شمسی)

هیچ تغییر در فایل‌های Phase 1/2، `messages` قدیمی، یا route دیگر.

## Goal

کاربر بتواند گروه بسازد، عضو اضافه کند، پیام متنی ارسال/دریافت کند و پیام‌های جدید را به‌صورت Realtime ببیند — همه با تراکنش‌های امن سرور-ساید و RTL/شمسی.

---

## Phase 3.A — Migration (RPC + Realtime)

فایل: `supabase/migrations/<ts>_messenger_rpc_and_realtime.sql`

### توابع (همه `SECURITY DEFINER`، `SET search_path=public`، `LANGUAGE plpgsql`):

1. `**public.create_messenger_group(p_name text, p_type text) RETURNS uuid**`
  - اعتبارسنجی: `auth.uid() IS NOT NULL`، `p_type IN ('private','group','operational')`، `length(trim(p_name)) BETWEEN 1 AND 120`
  - `INSERT INTO messenger_groups(name, type, created_by) VALUES (...) RETURNING id`
  - `INSERT INTO messenger_group_members(group_id, user_id, role) VALUES (new_id, auth.uid(), 'admin')`
  - RETURN id
  - GRANT EXECUTE TO authenticated
2. `**public.add_messenger_group_member(p_group_id uuid, p_user_id uuid, p_role text DEFAULT 'member') RETURNS uuid**`
  - `p_role IN ('admin','member','viewer')`
  - بررسی: caller باید با role='admin' در همان گروه عضو باشد (query مستقیم به `messenger_group_members`، نه فقط `is_messenger_group_member`)
  - بررسی: `p_user_id` در `auth.users` موجود باشد (FK کافی است)
  - INSERT با `ON CONFLICT (group_id, user_id) DO NOTHING` و RETURNING id
  - اگر duplicate بود → RAISE EXCEPTION با کد قابل تشخیص (`P0001`, message فارسی)
  - GRANT EXECUTE TO authenticated
3. `**public.send_messenger_message(p_group_id uuid, p_content text, p_type text DEFAULT 'text', p_reply_to uuid DEFAULT NULL) RETURNS public.messenger_messages**`
  - بررسی عضویت با `is_messenger_group_member(p_group_id, auth.uid())` → در غیر این صورت EXCEPTION
  - `p_type IN ('text','image','file','audio','system')`
  - `length(p_content) BETWEEN 1 AND 4000`
  - اگر `p_reply_to NOT NULL` → بررسی کند که پیام مرجع در همان گروه است
  - INSERT و RETURNING ROW
  - INSERT receipt برای sender در `messenger_read_receipts` با `ON CONFLICT DO NOTHING`
  - GRANT EXECUTE TO authenticated
4. `**public.send_messenger_message_with_attachment(p_group_id uuid, p_content text, p_type text, p_reply_to uuid, p_file_path text, p_file_name text, p_file_type text, p_file_size bigint) RETURNS public.messenger_messages**`
  - همه‌ی validationهای #3
  - `p_file_size > 0 AND p_file_size <= 52428800`
  - `messenger_attachment_size_ok(p_file_path, p_file_size)` باید TRUE باشد
  - `messenger_attachment_path_owner(p_file_path)` با مقایسه‌ی `split_part(p_file_path,'/',1) = auth.uid()::text`
  - یک تراکنش (همان handler): INSERT message → INSERT attachment با `message_id=new.id` → INSERT self-receipt
  - اگر هر گام خطا داد، کل تراکنش rollback ⇒ orphan رفع می‌شود
  - GRANT EXECUTE TO authenticated

### Realtime

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messenger_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages';
  END IF;
END $$;
```

فقط همین یک جدول. (read_receipts و attachments فعلاً نیاز realtime ندارند.)

### REVOKE

```sql
REVOKE EXECUTE ON FUNCTION public.create_messenger_group(text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_messenger_group_member(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_messenger_message(uuid,text,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.send_messenger_message_with_attachment(...) FROM PUBLIC, anon;
```

GRANT فقط به `authenticated, service_role`.

### Idempotency

- `CREATE OR REPLACE FUNCTION` برای همه
- بلوک DO برای publication
- بدون DROP TABLE / ALTER TABLE

---

## Phase 3.B — UI

### Route: `src/routes/_app.messages.tsx`

- حفظ `requirePermission("messages","view")` در `beforeLoad`
- Layout دو-ستونه: سمت راست sidebar (24rem)، سمت چپ ChatWindow؛ در موبایل stack با toggle
- بدون `<EmptyState>` placeholder

### `useMessengerGroups`

- `supabase.from('messenger_groups').select('id,name,type, messenger_group_members!inner(user_id,role), messenger_messages(content,created_at,sender_id)')` با محدودیت آخرین پیام (subquery یا view ساده در کلاینت با `order` و `limit:1` در relation)
- RLS خودش فقط گروه‌های عضو را برمی‌گرداند
- React Query با `staleTime: 30s`
- شمارش پیام‌های خوانده‌نشده: `messenger_messages` در گروه با `created_at > last_read_at` کاربر؛ روش ساده: query جداگانه `select count(*) ... where group_id=any($1) and id not in (select message_id from messenger_read_receipts where user_id=auth.uid())` — limit به ۵۰ گروه آخر، debounce نشده چون فقط روی mount و invalidate اجرا می‌شود

### `useMessengerMessages(groupId)`

- `select id,sender_id,content,message_type,reply_to_id,created_at` با `order('created_at')` و `limit(50)` — pagination با cursor در فاز بعد
- Realtime subscription:
  ```ts
  useEffect(() => {
    const ch = supabase.channel(`msg:${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messenger_messages', filter: `group_id=eq.${groupId}` }, (p) => {
        queryClient.setQueryData(['messenger-messages', groupId], (old) => [...(old ?? []), p.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId]);
  ```
- بعد از mount/پیام جدید: insert read_receipt برای پیام‌های دیده‌شده (batch ساده)

### Components

- `ConversationsSidebar`: لیست گروه‌ها + دکمه «گروه جدید» (`NewGroupDialog`)
- `NewGroupDialog`: فرم name + type + (اختیاری) چند کاربر اولیه از `profiles`؛ فراخوانی `supabase.rpc('create_messenger_group', {...})` و سپس برای هر کاربر `add_messenger_group_member`
- `ChatWindow`: header + `MessageList` + `MessageComposer`
- `MessageList`: bubble RTL، نام فرستنده از `profiles` (cache شده با React Query)، زمان شمسی با `moment-jalaali` (`jYYYY/jMM/jDD HH:mm`)
- `MessageComposer`: textarea (Enter=send، Shift+Enter=newline) + دکمه «ارسال»؛ فراخوانی `supabase.rpc('send_messenger_message', { p_group_id, p_content, p_type:'text', p_reply_to:null })`

### استایل

- استفاده از `Card`, `Button`, `Input`, `Textarea`, `Avatar`, `ScrollArea`, `Badge` از shadcn موجود
- توکن‌های رنگ پروژه — هیچ hex hardcode
- `dir="rtl"` در سطح کانتینر؛ متن چپ‌چین صرفاً برای زمان/اعداد در صورت نیاز با `dir="ltr"`

### `moment-jalaali`

- اگر `package.json` آن را ندارد، اضافه می‌شود
- import فقط در `src/lib/messenger/format.ts` (یا `src/lib/i18n/formatters.ts` اگر بخواهیم متمرکز کنیم؛ ولی فعلاً فایل جدا تا فاز ۱-قدیمی لمس نشود)

---

## Out of scope (صراحتاً)

- آپلود فایل و UI پیوست (فاز ۴)
- پیام صوتی و Whisper STT (فاز ۵)
- کارت استعلام محصول
- audit trigger روی messenger_*
- admin override برای دیدن همه گروه‌ها
- اعلان SMS/Email/Push
- typing indicator، delivery status
- جستجو در پیام‌ها
- edit/delete پیام در UI (هرچند RLS برای sender موجود است)
- mention/@user
- group avatar/cover

---

## Database / Migration impact

- ۴ تابع جدید در `public` (SECURITY DEFINER)
- ۱ ALTER PUBLICATION
- Reversible: DROP FUNCTION + `ALTER PUBLICATION ... DROP TABLE`
- بدون تغییر جدول، بدون تغییر RLS موجود
- سازگار با self-host (هیچ ویژگی Cloud-only)

## RLS / RBAC / audit

- RLS فاز ۱ بدون تغییر باقی می‌ماند
- RPCها SECURITY DEFINER هستند ولی **هر کدام** بررسی صریح عضویت/admin بودن caller را انجام می‌دهند → نشت بین‌گروهی ندارند
- بدون audit در این فاز (فاز جداگانه)
- `requirePermission("messages","view")` در route فقط UI guard است؛ منبع حقیقت RLS+RPC validation

## Performance

- محدودیت اولیه: ۵۰ پیام آخر، ۵۰ گروه آخر
- realtime تنها روی یک channel به ازای گروه فعال
- index موجود روی `messenger_messages(group_id, created_at)` کافی است (در migration Phase 1 ساخته شد)
- subscription با cleanup در `return` `useEffect` — بدون leak

## UI/UX impact

- جایگزینی Placeholder route → کاربر واقعاً می‌تواند چت کند
- RTL، شمسی، mobile-first

---

## Acceptance criteria

1. کاربر A با `create_messenger_group('تست','group')` گروه می‌سازد و خودش به‌عنوان admin اضافه می‌شود (یک ردیف در `messenger_group_members`).
2. A با `add_messenger_group_member` کاربر B را اضافه می‌کند؛ B با `add_messenger_group_member` نمی‌تواند کسی اضافه کند (role='member').
3. A پیام می‌فرستد → در سشن B بدون refresh ظاهر می‌شود (Realtime).
4. C (غیرعضو) `send_messenger_message` همان گروه → EXCEPTION.
5. C نمی‌تواند پیام‌های گروه را با `select` از Data API ببیند (RLS فاز ۱).
6. `send_messenger_message_with_attachment` با `file_size > limit` rollback می‌کند و هیچ ردیف message ایجاد نمی‌شود.
7. زمان پیام‌ها به فارسی شمسی نمایش داده می‌شود.
8. linter بعد از migration: هیچ ERROR جدید.
9. `npm run build` بدون خطا.

## Manual test path

1. login با کاربر A در tab1، B در tab2.
2. A: «گروه جدید» → نام=«تست»، نوع=group → ایجاد.
3. A: در dialog، B را اضافه کن.
4. tab2 (B): گروه «تست» در sidebar ظاهر می‌شود (نیاز به refetch دستی → invalidate در فاز بعد، الان manual reload OK).
5. A پیام «سلام» می‌فرستد → در tab2 بدون reload ظاهر می‌شود.
6. B پاسخ می‌دهد → در tab1 بدون reload ظاهر می‌شود.
7. در tab سوم با کاربر C → گروه «تست» در sidebar نیست.
8. C در devtools `supabase.rpc('send_messenger_message', {p_group_id:'<id>', p_content:'x'})` → خطا.

---

## Risks

- **RPC SECURITY DEFINER**: اگر validation داخل تابع اشتباه باشد، privilege escalation. کاهش: هر RPC بررسی صریح `auth.uid()` + عضویت + admin role.
- **add_messenger_group_member بدون consent**: admin می‌تواند هرکسی را به گروه اضافه کند. این برای فاز ۳ پذیرفته است؛ در آینده با invitation flow بهبود.
- **پاسخ کامل ردیف messenger_messages از SECURITY DEFINER**: مشکل خاصی نیست چون فرستنده مالک محتواست؛ ولی باید فقط ستون‌های public را برگرداند (همه ستون‌های جدول مجاز هستند).
- **حجم پیام‌های خوانده‌نشده برای گروه‌های بزرگ**: query `count(*)` می‌تواند سنگین شود؛ در آینده با `last_read_at` per-member بهینه‌سازی.
- **Realtime cost**: یک channel به ازای گروه فعال؛ کاربری که ۲۰ گروه دارد فقط روی گروه باز شده subscribe می‌کند → ایمن.
- **moment-jalaali bundle**: ~۸۰KB. اگر مشکل bundle → جایگزین `date-fns-jalali` (سبک‌تر). اول `moment-jalaali` چون درخواست کاربر.
- **self-host**: همه چیز روی توابع SQL استاندارد + publication استاندارد Supabase Realtime — سازگار.
- **read_receipt در سمت سرور (send)**: self-receipt نشانگر «خوانده» نیست، صرفاً برای ساده‌سازی count unread. روش جایگزین: receipt را فقط در UI هنگام دیدن واقعی بزن. در پلن، self-receipt در RPC حذف شود؟ → **تصمیم: نگه می‌داریم** چون پیام خودِ فرستنده برای او «خوانده» محسوب می‌شود و count نباید unread نشان دهد.
- **عدم pagination پیام‌ها**: ۵۰ آخر کافی است برای MVP؛ infinite scroll فاز بعد.

---

## Stop conditions

- اگر `supabase--linter` خطای جدید روی توابع RPC گزارش کرد → اصلاح در همان migration.
- اگر `npm run build` به‌خاطر `moment-jalaali` types خطا داد → نصب `@types/moment-jalaali` یا fallback به `date-fns-jalali`.
- اگر RLS فعلی `messenger_groups` اجازه‌ی SELECT به creator (قبل از عضو شدن) را نمی‌دهد و create_group نتواند ردیف را برگرداند → بررسی و در صورت نیاز RPC ردیف را با privileges DEFINER بسازد و فقط `id` برگرداند (که در پلن همین است).
- اگر کاربر تصمیم گرفت Realtime را به فازی دیگر موکول کند → حذف ALTER PUBLICATION + حذف useEffect subscription.

---

## Smallest safe next implementation slice

همان ۴ RPC + publication + UI پایه. هیچ آپلود/صدا/کارت استعلام.

## Commands to run after apply

- `supabase--linter` و گزارش
- `bun add moment-jalaali` (+ types در صورت نیاز)
- `npm run build`
- مرور دستی دو-tab طبق Manual test path  
  
  
لطفاً Phase 3 پیام‌رسان AfraKala را اجرا کن — دقیقاً طبق پلن زیر:
  بخش A — Migration:
  فایل جدید: supabase/migrations/<timestamp>_messenger_rpc_and_realtime.sql
  ۴ تابع SECURITY DEFINER بساز:
  1. create_messenger_group(p_name text, p_type text) RETURNS uuid
     - auth.uid() IS NOT NULL
     - p_type IN ('private','group','operational')
     - length(trim(p_name)) BETWEEN 1 AND 120
     - INSERT به messenger_groups + INSERT سازنده به messenger_group_members با role='admin'
     - RETURN group id
  2. add_messenger_group_member(p_group_id uuid, p_user_id uuid, p_role text DEFAULT 'member') RETURNS uuid
     - p_role IN ('admin','member','viewer')
     - caller باید role='admin' در همان گروه باشد
     - INSERT با ON CONFLICT (group_id, user_id) DO NOTHING
     - اگر duplicate: RAISE EXCEPTION با کد P0001
  3. send_messenger_message(p_group_id uuid, p_content text, p_type text DEFAULT 'text', p_reply_to uuid DEFAULT NULL) RETURNS messenger_messages
     - بررسی عضویت با is_messenger_group_member
     - p_type IN ('text','image','file','audio','video','system')
     - length(p_content) BETWEEN 1 AND 4000
     - اگر p_reply_to IS NOT NULL: بررسی کن پیام مرجع در همان گروه است
     - INSERT message + INSERT self read_receipt با ON CONFLICT DO NOTHING
     - RETURN ردیف کامل
  4. send_messenger_message_with_attachment(p_group_id uuid, p_content text, p_type text, p_reply_to uuid, p_file_path text, p_file_name text, p_file_type text, p_file_size bigint) RETURNS messenger_messages
     - همه validationهای تابع ۳
     - p_file_size BETWEEN 1 AND 52428800
     - messenger_attachment_size_ok(p_file_path, p_file_size) = TRUE
     - split_part(p_file_path,'/',1) = auth.uid()::text
     - یک transaction: INSERT message → INSERT attachment → INSERT self receipt
     - اگر هر گام خطا: کل rollback
  برای همه توابع:
  - LANGUAGE plpgsql
  - SECURITY DEFINER
  - SET search_path=public
  - REVOKE EXECUTE FROM PUBLIC, anon
  - GRANT EXECUTE TO authenticated, service_role
  Realtime publication:
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messenger_messages'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages';
    END IF;
  END $$;
  بخش B — UI:
  1. اگر moment-jalaali در package.json نیست، اضافه کن
  2. فایل‌های زیر بساز:
     - src/lib/messenger/format.ts (تابع formatJalali با moment-jalaali)
     - src/hooks/messenger/useMessengerGroups.ts
     - src/hooks/messenger/useMessengerMessages.ts (با Realtime subscription + cleanup)
     - src/components/messenger/ConversationsSidebar.tsx
     - src/components/messenger/NewGroupDialog.tsx (فراخوانی create_messenger_group + add_messenger_group_member)
     - src/components/messenger/ChatWindow.tsx
     - src/components/messenger/MessageList.tsx (bubble RTL، زمان شمسی)
     - src/components/messenger/MessageComposer.tsx (Enter=send، Shift+Enter=newline)
  3. src/routes/_app.messages.tsx را جایگزین کن:
     - requirePermission("messages","view") در beforeLoad حفظ شود
     - layout دو-ستونه: sidebar راست (24rem) + ChatWindow چپ
     - موبایل: stack با toggle
     - dir="rtl" در کانتینر اصلی
     - رنگ‌ها از توکن‌های موجود پروژه (بدون hex hardcode)
     - از Card, Button, Textarea, Avatar, ScrollArea, Badge از shadcn استفاده کن
  بعد از اجرا:
  1. linter اجرا کن و نتیجه گزارش بده
  2. npm run build اجرا کن
  3. تأیید کن که ۴ تابع RPC در Supabase موجودند
  4. تأیید کن messenger_messages در supabase_realtime publication است
- &nbsp;