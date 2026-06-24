# Phase 4 — آپلود فایل در UI پیام‌رسان

## هدف

افزودن آپلود فایل به MessageComposer + نمایش پیوست در MessageList، با pre-check سرور-ساید برای جبران ریسک mime-sniffing از Phase 2. هیچ تغییری در migration، RLS، RPC، یا bucket policies انجام نمی‌شود.

## فایل‌های جدید

### 1. `src/lib/messenger/attachment-rules.ts` (client-safe constants)

ثابت مشترک بین UI و serverFn — همان سقف‌های Phase 2:

```text
images (jpg, jpeg, png, webp, gif) → 5MB   → mime: image/*
video  (mp4, webm, mov)            → 50MB  → mime: video/*
pdf                                 → 20MB  → mime: application/pdf
word   (doc, docx)                  → 10MB  → mime ms-word/officedocument.wordprocessingml
excel  (xls, xlsx)                  → 5MB
zip                                  → 5MB
```

خروجی: `getRuleByExt(ext)`, `formatBytes(n)`, `iconForKind(kind)`.

### 2. `src/lib/messenger/upload.functions.ts` (serverFn، client-safe path)

```ts
preCheckMessengerAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    group_id: z.string().uuid(),
    file_name: z.string().min(1).max(200),
    mime_type: z.string().min(1).max(120),
    file_size: z.number().int().positive().max(52_428_800),
  }).parse)
  .handler(async ({ data, context }) => {
    // 1) member check via context.supabase + is_messenger_group_member
    // 2) ext from file_name → اگر در allow-list نباشد → reject
    // 3) mime ↔ ext match (image/* با jpg/png/...، application/pdf با pdf، ...)
    // 4) size ≤ سقف per-type
    // 5) تولید path امن: `${userId}/${crypto.randomUUID()}.${ext}`
    return { ok: true, path, kind, ext };
  });
```

دلایل:

- جبران فقدان `allowed_mime_types` در bucket (Phase 2 risk).
- نام فایل اصلی هرگز در path نمی‌رود → جلوگیری از path traversal و کاراکترهای فارسی.
- ext و mime در یک نقطه‌ی سرور تأیید می‌شوند، پس کلاینت نمی‌تواند policy را دور بزند.

### 3. `src/hooks/messenger/useSignedAttachmentUrl.ts`

- ورودی: `file_path`
- خروجی: `useQuery` با `staleTime: 50 * 60_000`, expiry درخواست = 3600s
- استفاده از `supabase.storage.from("messenger-attachments").createSignedUrl(path, 3600)`.

### 4. `src/components/messenger/AttachmentPreview.tsx`

preview قبل از ارسال (نام، حجم با `formatBytes`، آیکن، دکمه × حذف).

### 5. `src/components/messenger/AttachmentBubble.tsx`

رندر پیوست داخل پیام (پس از join با messenger_attachments):

- `image/*` → `<img>` با signed URL، max-h-64، lazy، onClick = باز کردن در tab.
- `video/*` → کارت با آیکن + نام + دکمه دانلود (بدون پخش inline در این فاز).
- بقیه → آیکن + نام + حجم + دکمه دانلود.
- حالت loading/skeleton وقتی signed URL هنوز نیامده.

## فایل‌های ویرایش‌شده

### `src/components/messenger/MessageComposer.tsx`

- state جدید: `file: File | null`, `uploadProgress: number`.
- دکمه Paperclip → input مخفی (`accept` = ext های مجاز).
- وقتی فایل انتخاب شد → نمایش AttachmentPreview.
- روی Send (یا Enter اگر متن خالی نیست):
  1. اگر file وجود دارد:
    - `await preCheckMessengerAttachment({ data: {...} })` — اگر throw کرد، toast خطای فارسی.
    - `supabase.storage.from("messenger-attachments").upload(path, file, { contentType, upsert: false })` — progress event با XHR یا fallback تخمینی (Supabase JS upload progress در v2 محدود است؛ از حالت indeterminate در progress bar استفاده می‌شود اگر event نیامد).
    - `supabase.rpc("send_messenger_message_with_attachment", { p_group_id, p_content: value || null, p_type: kind === "image" ? "image" : "file", p_reply_to: null, p_file_path: path, p_file_name: file.name, p_file_type: file.type, p_file_size: file.size })`.
    - cleanup: اگر RPC شکست خورد → `storage.remove([path])` تا فایل orphan نماند.
  2. اگر فقط متن: مسیر فعلی.
- disable کامل دکمه‌ها در حین آپلود.

### `src/hooks/messenger/useMessengerMessages.ts`

- `select` گسترش پیدا می‌کند با LEFT JOIN از طریق relation:
`select("id,...,messenger_attachments(id,file_path,file_name,file_type,file_size)")`.
- type گسترش `MessengerMessage` با فیلد `attachments`.

### `src/components/messenger/MessageList.tsx`

- اگر `m.attachments?.length` > 0 → رندر `<AttachmentBubble>` قبل/بعد از `m.content`.
- اگر content خالی است، حباب متن رندر نشود.

## Acceptance criteria

1. کاربر می‌تواند فایل png تا 5MB انتخاب کند، preview ببیند، ارسال کند، و در طرف دیگر inline render شود.
2. آپلود فایل با ext غیرمجاز (مثلاً `.exe`) قبل از touch کردن Storage با toast فارسی reject شود.
3. آپلود فایل با حجم بیش از سقف per-type توسط `preCheckMessengerAttachment` reject شود (نه فقط UI).
4. آپلود فایل با mime جعلی (mismatch با ext) reject شود.
5. اگر RPC پس از آپلود موفق fail شود، فایل از Storage حذف شود (no orphan).
6. signed URL پس از 1 ساعت expire می‌شود — refetch خودکار با `staleTime`.
7. عضو غیر گروه نمی‌تواند pre-check را با group_id جعلی pass کند (middleware + RLS).
8. کاربر می‌تواند پیوست را همراه متن یا بدون متن ارسال کند.

## Manual test path

1. ورود با کاربر A، انتخاب گروهی که عضو است.
2. آپلود `.png` 2MB → باید inline ظاهر شود.
3. آپلود `.pdf` 1MB → آیکن + نام + دکمه دانلود.
4. تلاش آپلود `.exe` → toast: «نوع فایل مجاز نیست».
5. تلاش آپلود `.png` 10MB → toast: «حجم بیش از سقف مجاز برای تصویر».
6. تلاش آپلود فایلی که ext آن `.png` و mime آن `application/x-msdownload` است (rename دستی) → reject سرور-ساید.
7. ورود با کاربر B عضو همان گروه → پیوست‌های A را می‌بیند با signed URL کار می‌کند.
8. خروج، ورود کاربر C غیرعضو → نباید پیامی ببیند (RLS فاز 1).

## ریسک‌ها

- **Progress واقعی آپلود**: SDK Supabase JS v2 برای upload به Storage event progress استاندارد ندارد. fallback: progress bar حالت `indeterminate` در حین آپلود. مستندسازی این محدودیت در کامنت.
- **Orphan files**: اگر کاربر در حین آپلود تب را ببندد، فایل بدون رکورد attachment باقی می‌ماند. در این فاز فقط cleanup شکست RPC پوشش داده می‌شود؛ orphan-sweep کرون فاز بعدی.
- **Bundle size**: تنها lucide icons اضافه (`Paperclip`, `File`, `FileImage`, `FileVideo`, `Download`, `X`) — جزو set موجود.
- **mime sniffing**: pre-check سرور ext↔mime را تطبیق می‌دهد، اما محتوای واقعی فایل بررسی نمی‌شود. کاربری که قصد فریب دارد می‌تواند فایل با magic-bytes درست و mime/ext درست بسازد. سپر بعدی: virus-scan فاز بعد.
- **Race condition Storage vs RPC**: اگر آپلود طول بکشد و کاربر چیز دیگر ارسال کند، ترتیب پیام‌ها مختل نشود — disable composer در حین آپلود.
- `**accept` کلاینت فقط هینت است** — اعتبار واقعی روی serverFn است (تأیید‌شده).

## Out of scope

- ضبط صوت/ویدئو در مرورگر.
- thumbnail سرور-ساید (تصاویر در همان سایز اصلی صرف می‌شوند).
- آپلود گروهی چند فایل همزمان.
- پیش‌نمایش inline PDF.
- orphan-sweep خودکار.
- پخش inline ویدئو/صوت.

## Stop conditions

- `npm run build` خطا داد → فقط رفع خطا، گسترش scope ممنوع.
- linter Supabase warning جدید آورد → بررسی، اگر مربوط به فاز 4 نیست گزارش و ادامه.
- اگر مشخص شد upload progress قابل دستیابی نیست حتی indeterminate → progress bar حذف، فقط spinner.
- اگر join `messenger_attachments` در select باعث RLS error شد → fallback به query جداگانه per message-batch.
- هرگونه نیاز به تغییر RLS / RPC / migration / bucket → توقف و درخواست تأیید قبل از ادامه.  
  
لطفاً Phase 4 پیام‌رسان AfraKala را اجرا کن — آپلود فایل در UI. هیچ تغییر در migration، RLS، RPC، یا bucket.
  فایل‌های جدید:
  1. src/lib/messenger/attachment-rules.ts
     - ثابت‌های نوع و سقف فایل:
       images (jpg,jpeg,png,webp,gif) → 5MB, mime: image/*
       video (mp4,webm,mov) → 50MB, mime: video/*
       pdf → 20MB
       doc/docx → 10MB
       xls/xlsx → 5MB
       zip → 5MB
     - توابع: getRuleByExt(ext), formatBytes(n), iconForKind(kind)
  2. src/lib/messenger/upload.functions.ts (serverFn)
     - preCheckMessengerAttachment با createServerFn + requireSupabaseAuth middleware
     - input: group_id (uuid), file_name, mime_type, file_size (max 52428800)
     - بررسی‌ها به ترتیب:
       a. عضویت کاربر در گروه با is_messenger_group_member
       b. ext از file_name در allow-list باشد
       c. mime ↔ ext match (image/* با jpg/png/webp/gif، video/* با mp4/webm/mov، application/pdf با pdf و...)
       d. size ≤ سقف per-type از attachment-rules
       e. تولید path امن: {userId}/{crypto.randomUUID()}.{ext}
     - RETURN: { ok: true, path, kind, ext }
  3. src/hooks/messenger/useSignedAttachmentUrl.ts
     - ورودی: file_path
     - [supabase.storage](http://supabase.storage).from("messenger-attachments").createSignedUrl(path, 3600)
     - useQuery با staleTime: 50 * 60000
  4. src/components/messenger/AttachmentPreview.tsx
     - نمایش نام، حجم (formatBytes)، آیکن نوع، دکمه × حذف
  5. src/components/messenger/AttachmentBubble.tsx
     - image/*: <img> با signed URL, max-h-64, lazy, onClick=open در tab
     - video/*: آیکن + نام + دکمه دانلود
     - بقیه: آیکن + نام + حجم + دکمه دانلود
     - loading/skeleton تا signed URL آماده شود
  فایل‌های ویرایش‌شده:
  6. src/components/messenger/MessageComposer.tsx
     - state: file: File | null, uploadProgress: number
     - دکمه Paperclip → input مخفی با accept = ext های مجاز
     - انتخاب فایل → نمایش AttachmentPreview
     - روی Send:
       a. اگر file دارد:
          - await preCheckMessengerAttachment → اگر خطا: toast فارسی، توقف
          - [supabase.storage](http://supabase.storage) upload با path از pre-check → progress indeterminate
          - supabase.rpc("send_messenger_message_with_attachment", {
              p_group_id, 
              p_content: value.trim() || " ",  ← یک فاصله اگر متن خالی است
              p_type: kind === "image" ? "image" : kind === "video" ? "video" : "file",
              p_reply_to: null,
              p_file_path: path,
              p_file_name: [file.name](http://file.name),
              p_file_type: file.type,
              p_file_size: file.size
            })
          - اگر RPC fail شد: storage.remove([path]) → toast خطا
       b. اگر فقط متن: مسیر فعلی بدون تغییر
     - disable کامل در حین آپلود
  7. src/hooks/messenger/useMessengerMessages.ts
     - select گسترش: messenger_attachments(id,file_path,file_name,file_type,file_size)
     - type MessengerMessage گسترش با attachments?
  8. src/components/messenger/MessageList.tsx
     - اگر m.attachments?.length > 0: رندر AttachmentBubble
     - اگر content فقط فاصله است: حباب متن رندر نشود
  بعد از اجرا:
  1. npm run build بدون خطا
  2. typecheck روی همه فایل‌های messenger
  3. گزارش هر warning جدید