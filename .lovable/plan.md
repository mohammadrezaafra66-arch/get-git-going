# Phase 5 — ضبط پیام صوتی + STT با Whisper Self-Hosted

## هدف

افزودن ضبط صوت در مرورگر، آپلود از همان جریان Phase 4، و رونویسی خودکار با Whisper self-hosted (با fallback تمیز). نوع پیام `audio` (که در migration Phase 1 از قبل مجاز است).

## تصمیمات کلیدی

1. **فرمت ضبط:** `audio/webm;codecs=opus` (Chrome/Firefox/Edge) و `audio/mp4` (Safari/iOS) — هر دو پسوند (`webm`، `mp4`) از قبل در `messenger_attachment_size_ok` migration Phase 2 مجاز هستند (سقف 50MB). نیازی به تغییر storage policy نیست.
2. **سقف audio:** 25MB در attachment-rules.ts (محدودیت UI/serverFn pre-check). در سطح bucket policy 50MB باقی می‌ماند — سپر دفاعی دوم.
3. **STT روش:** serverFn جدید `transcribeMessengerAudio({ message_id })` — پس از ارسال پیام صوتی فراخوانی می‌شود. اگر موفق شد، فیلد `content` پیام را با transcript به‌روزرسانی می‌کند (RLS اجازه می‌دهد چون sender خود کاربر است).
4. **Endpoint Whisper:** OpenAI-compatible `POST {WHISPER_API_URL}/v1/audio/transcriptions` (multipart). درخواست با `language=fa`. اگر `WHISPER_API_KEY` تنظیم شده، در هدر `Authorization: Bearer ...`.
5. **Graceful degradation:** اگر Whisper در دسترس نبود یا timeout شد → پیام بدون transcript باقی می‌ماند؛ هیچ toast خطا نباید UX ارسال را قطع کند (در پس‌زمینه fire-and-forget).

## فایل‌های جدید

### 1. `src/components/messenger/AudioRecorder.tsx`

Hook + UI کوچک:

- وضعیت‌ها: `idle | recording | recorded | uploading`
- `startRecording()`: `navigator.mediaDevices.getUserMedia({ audio: true })` → بررسی `MediaRecorder.isTypeSupported` با اولویت `audio/webm;codecs=opus` سپس `audio/mp4` (اگر هیچ‌کدام پشتیبانی نشد → toast فارسی و abort).
- timer شمارنده (mm:ss) با cap 5 دقیقه؛ خودکار stop در 5:00.
- جلوگیری از blob خالی (< 1024 bytes) → toast «ضبط خالی است».
- بازگردانی نتیجه از طریق `onComplete(file: File)` به والد. نام فایل: `voice-${Date.now()}.${ext}`.
- در حالت `recorded`: کنترل play/pause محلی + دکمه ارسال و دکمه discard.
- حتماً `stream.getTracks().forEach(t => t.stop())` در همه مسیرها.

### 2. `src/lib/messenger/transcribe.functions.ts`

```ts
transcribeMessengerAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ message_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    // 1) بررسی sender_id == userId از messenger_messages
    // 2) بارگیری attachment (file_path, file_type, file_size)
    // 3) دانلود از Storage با supabase.storage.from(...).download(file_path)
    //    (همان context.supabase — RLS اجازه می‌دهد چون عضو است)
    // 4) اگر WHISPER_API_URL خالی است → return { ok: false, reason: 'disabled' }
    // 5) POST multipart به ${WHISPER_API_URL}/v1/audio/transcriptions
    //    fields: file, model=whisper-1 (یا WHISPER_MODEL env)، language=fa
    //    AbortController با 60s timeout
    // 6) موفق: UPDATE messenger_messages SET content = transcript WHERE id = message_id AND sender_id = userId
    // 7) شکست/timeout: log و return { ok: false, reason }
  });
```

- secrets خوانده‌شده فقط داخل handler از `process.env` (نه VITE_).
- هیچ orphan در صورت شکست STT (فقط content آپدیت نمی‌شود).
- خروجی همیشه shape سازگار `{ ok: boolean, reason?: string }` — کلاینت روی شکست خطا throw نکند.

### 3. `src/components/messenger/AudioPlayer.tsx`

- استفاده از `useSignedAttachmentUrl(file_path)`.
- المنت `<audio controls preload="metadata" src={url} />` — رندر native browser player (سبک، RTL-safe، بدون وابستگی).
- نمایش مدت زمان وقتی metadata لود شد (`onLoadedMetadata`).
- skeleton تا signed URL آماده شود.
- توضیح: «پلیر سفارشی با progress bar دستی» مستلزم بازنویسی بیشتر است؛ native player همین requirementها (play/pause + progress + duration) را برآورده می‌کند، با bundle صفر.

## فایل‌های ویرایش‌شده

### 4. `src/lib/messenger/attachment-rules.ts`

- افزودن kind جدید `"audio"` با:
  - `exts: ["webm", "mp4", "ogg", "m4a", "mp3"]` (webm/mp4 از قبل در bucket مجاز؛ بقیه fallback اختیاری)
  - `mimes: [/^audio\/(webm|mp4|ogg|mpeg|x-m4a|aac).*/i]`
  - `maxBytes: 25 * MB`
  - `label: "صوت"`
- **چالش ابهام pasوند:** webm و mp4 و ogg هم در video وجود دارند. تابع `getRuleByExt` فقط ext را می‌بیند. راه‌حل: تابع جدید `getRuleByExtAndMime(ext, mime)` — اگر mime با `audio/` شروع شد، rule صوت برگردد؛ در غیر این صورت rule موجود.
- بازنویسی `mimeMatchesRule` بدون تغییر؛ فقط helper جدید اضافه شود.
- در UI آپلود فایل (دکمه paperclip): rule انتخاب همان `getRuleByExt` (mime نامشخص پیش از انتخاب فایل) — برای فایل آپلود معمولی audio با ext .mp3/.m4a کار می‌کند، اما .webm آپلود شده به‌عنوان «صوت» تشخیص داده نمی‌شود (به‌عنوان video دیده می‌شود — قابل قبول، چون UX نادر است).

### 5. `src/lib/messenger/upload.functions.ts`

- در `preCheckMessengerAttachment`: اگر mime با `audio/` شروع شد → `getRuleByExtAndMime` استفاده شود. بقیه‌ی اعتبارسنجی (mime↔ext، size per-type، path generation) بدون تغییر.
- توجه: ext خروجی برای ضبط صوتی همان webm/mp4 خواهد بود — مطابق سقف storage 50MB، ولی pre-check 25MB رد می‌کند.

### 6. `src/components/messenger/MessageComposer.tsx`

- state جدید: `mode: "compose" | "recording" | "recorded"`.
- دکمه Mic در ردیف ابزار (کنار Paperclip). در حالت `recording` یا `recorded` → کل composer به AudioRecorder سوییچ می‌شود (نه paperclip، نه textarea — جلوگیری از race).
- جریان ارسال:
  1. AudioRecorder یک `File` می‌دهد.
  2. همان pipeline Phase 4: `preCheck → storage.upload → send_messenger_message_with_attachment` با `p_type='audio'` و `p_content=''` (transcript بعداً اضافه می‌شود؛ migration حاضر `text NULL` می‌پذیرد و RPC `content` را به `trim` می‌کند — باید بررسی شود؛ اگر RPC `NOT NULL`/`length>0` می‌خواهد، یک placeholder تک‌فاصله مثل Phase 4).
  3. پس از موفقیت RPC، `void transcribeMessengerAudio({ data: { message_id: row.id } })` — fire-and-forget. روی reject فقط console.warn.
  4. invalidate query پس از 2-3 ثانیه (یا روی realtime update — برای فاز 5 ساده: refetch با تأخیر).

### 7. `src/components/messenger/MessageList.tsx`

- اگر attachment با kind=audio (تشخیص با `getRuleByExtAndMime(ext, file_type)`):
  - رندر `<AudioPlayer attachment={a} />` به‌جای `<AttachmentBubble>`.
  - اگر `m.content` غیر خالی و غیر whitespace: زیر پلیر در یک حباب کوچک «📝 رونویسی: {content}» نمایش داده شود.
- ترتیب: audio همیشه یک attachment per message (RPC اجازه می‌دهد). اگر چند attachment بود، اولی audio و بقیه fallback.

### 8. `src/hooks/messenger/useMessengerMessages.ts`

- بدون تغییر ساختاری. realtime INSERT از قبل invalidate می‌کند. برای آپدیت `content` بعد از STT: subscribe جدید روی `event: 'UPDATE'` همان channel، تا transcript خودش‌به‌خود ظاهر شود. (اگر table در `supabase_realtime` publication نباشد برای UPDATE — Phase 3 ADD TABLE انجام شده؛ UPDATE هم منتشر می‌شود.)

## Secrets جدید (runtime)

- `WHISPER_API_URL` — مثلاً `http://whisper:9000` (داخل docker-compose سرور self-host).
- `WHISPER_API_KEY` — اختیاری (اگر backend احراز هویت دارد).
- `WHISPER_MODEL` — اختیاری، پیش‌فرض `whisper-1`.

این سه secret با `add_secret` در همان فاز ثبت می‌شوند. تا قبل از تنظیم، STT در حالت `disabled` کار می‌کند (پیام صوتی بدون transcript ارسال می‌شود).

## Acceptance criteria

1. کاربر می‌تواند دکمه میکروفون را بزند، ضبط شروع شود، timer نمایش داده شود، حداکثر تا 5:00 ادامه یابد و خودکار متوقف شود.
2. در حالت ضبط، دکمه‌های stop و cancel فعال باشند؛ cancel هیچ پیام ارسال نکند و track میکروفون آزاد شود.
3. بعد از stop، preview قابل پخش باشد و کاربر بتواند ارسال یا discard کند.
4. ارسال پیام صوتی: blob به Storage آپلود شود، RPC `send_messenger_message_with_attachment` با `p_type='audio'` فراخوانی شود.
5. در طرف گیرنده (و فرستنده پس از realtime)، AudioPlayer با کنترل play/pause/seek/duration رندر شود.
6. اگر Whisper در دسترس بود، transcript فارسی ظرف ~10s زیر پلیر ظاهر شود (از طریق realtime UPDATE).
7. اگر `WHISPER_API_URL` تنظیم نباشد یا endpoint fail کند، پیام بدون transcript باقی بماند و هیچ خطایی در UI نمایش داده نشود.
8. ضبط blob خالی (start/stop آنی) با toast فارسی reject شود و چیزی آپلود نشود.
9. مرورگری که هیچ یک از webm/mp4 را پشتیبانی نکند، دکمه میکروفون disabled یا توضیح خطا داشته باشد.
10. غیر-sender نتواند با فراخوانی `transcribeMessengerAudio` پیام دیگران را آپدیت کند (پوشش با شرط `sender_id = auth.uid()` در UPDATE).

## Manual test path

1. کاربر A در Chrome دسکتاپ → /messages → گروه عضو → دکمه Mic، ضبط 5s صحبت فارسی، stop، play preview، Send.
2. صبر 3-5s → کاربر A و B باید AudioPlayer ببینند؛ اگر Whisper تنظیم است، transcript فارسی زیر پلیر ظاهر شود.
3. کاربر A در Safari/iOS → همان فلو با `audio/mp4`.
4. کاربر A در Firefox → `audio/webm` با Opus.
5. تست cap: ضبط را تا 5 دقیقه ادامه دهید → باید خودکار stop شود.
6. تست cancel: ضبط شروع، cancel → چراغ میکروفون مرورگر باید خاموش شود (track release)، چیزی ارسال نشود.
7. تست empty: مستقیماً start و stop در 100ms → toast «ضبط خالی است».
8. تست Whisper down: env `WHISPER_API_URL` را پاک کنید → ارسال موفق، بدون transcript، بدون خطا.
9. تست permission denied: getUserMedia را در مرورگر deny کنید → toast فارسی، composer سالم بماند.
10. تست امنیت STT: با کاربر B سعی کنید `transcribeMessengerAudio({ message_id: <پیام A> })` فراخوانی شود → نباید content تغییر کند (UPDATE با شرط sender_id = userId).

## ریسک‌ها

- **ابهام پسوند webm/mp4 بین audio و video:** در آپلود فایل معمولی کاربر، یک فایل `.webm` ویدئویی به‌اشتباه به‌عنوان video با cap 50MB می‌رود (درست). اما در ضبط در مرورگر همیشه mime با `audio/` شروع می‌شود → rule صوت با cap 25MB. تفکیک با mime در pre-check سرور انجام می‌شود. این یک نقطه‌ی شکنندگی است که در کامنت مستند می‌شود.
- **حجم دانلود سرور:** serverFn audio را از Storage دانلود می‌کند سپس به Whisper پاس می‌دهد (Worker نمی‌تواند مستقیم signed URL را به Whisper بدهد چون Whisper احتمالاً به Storage دسترسی ندارد). با cap 25MB روی Worker بافر می‌شود — قابل قبول، اما اگر Whisper روی همان docker network است، می‌توان path داخلی پاس داد (out of scope).
- **Timeout Whisper:** بسته به مدل و سخت‌افزار، 5 دقیقه audio ممکن است > 60s طول بکشد. timeout 90s در plan؛ اگر مرتب fail شد، فاز بعد retry queue اضافه شود.
- **Realtime UPDATE:** publication فقط INSERT را در Phase 3 اضافه کرد؟ بررسی شد: `ALTER PUBLICATION ... ADD TABLE` همه‌ی operationها را پابلیش می‌کند. هوک باید listener برای UPDATE هم اضافه کند.
- **WHISPER_API_URL در localhost سرور:** درخواست HTTP از Worker به localhost ممکن است در محیط lovable preview ناموفق باشد (Worker در sandbox). در self-host با docker network کار می‌کند. در preview، انتظار `disabled` می‌رود — graceful.
- **هزینه pre-check دوم:** هر پیام صوتی → یک serverFn اضافه برای STT. سربار 1 RPC اضافی per audio — قابل قبول.
- **Browser permission cache:** اولین بار دیالوگ permission ظاهر می‌شود؛ کاربر اگر deny کند، باید raw error نشود. handled.

## Out of scope (تأیید مجدد)

- داکر Whisper و docker-compose (مستندسازی self-host جداست).
- پخش بلادرنگ صوت (streaming به جای دانلود کامل).
- noise cancellation / VAD.
- ویرایش transcript دستی.
- چند زبانه (فقط `fa`).
- waveform visualization در پلیر.
- retry queue برای STT شکست‌خورده.

## Stop conditions

- `npm run build` خطا داد → فقط رفع خطا، scope ثابت بماند.
- `bunx tsgo --noEmit` warning جدید آورد → بررسی شود.
- اگر MediaRecorder در هیچ‌یک از webm/mp4 پشتیبانی نشد → دکمه Mic disabled با tooltip فارسی، فاز ادامه پیدا کند بدون block.
- اگر `messenger_attachment_size_ok` ضبط webm 20MB را reject کرد (نباید، چون webm = 50MB) → توقف و گزارش.
- اگر RPC `send_messenger_message_with_attachment` با `p_content=''` constraint می‌شکند → جایگزینی با تک‌فاصله مثل Phase 4 (مستند).
- هرگونه نیاز به تغییر migration/RLS/RPC → توقف و درخواست تأیید قبل از ادامه.
- اگر دانلود از Storage در serverFn (محیط Worker) با بافر 25MB حافظه ترکاند → کاهش cap به 10MB و گزارش.  
لطفاً Phase 5 پیام‌رسان AfraKala را اجرا کن — ضبط صوت + STT.
  هیچ تغییر در migration، RLS، RPC، یا bucket.
  فایل‌های جدید:
  1. src/components/messenger/AudioRecorder.tsx
     - وضعیت‌ها: idle | recording | recorded | uploading
     - startRecording: getUserMedia → بررسی MediaRecorder.isTypeSupported
       اولویت: audio/webm;codecs=opus سپس audio/mp4
       اگر هیچ‌کدام پشتیبانی نشد: دکمه Mic disabled با tooltip فارسی
     - timer mm:ss با cap 5 دقیقه، خودکار stop در 5:00
     - جلوگیری از blob خالی (< 1024 bytes) → toast «ضبط خالی است»
     - onComplete(file: File) به والد — نام فایل: voice-${[Date.now](http://Date.now)()}.${ext}
     - حالت recorded: play/pause محلی + دکمه ارسال + دکمه discard
     - حتماً stream.getTracks().forEach(t => t.stop()) در همه مسیرها
     - permission denied: toast فارسی، composer سالم بماند
  2. src/lib/messenger/transcribe.functions.ts
     - transcribeMessengerAudio = createServerFn({ method: "POST" })
       با middleware requireSupabaseAuth
       input: { message_id: uuid }
     - بررسی: sender_id == userId از messenger_messages
     - بارگیری attachment (file_path, file_type, file_size)
     - دانلود از Storage با context.supabase
     - اگر WHISPER_API_URL خالی → return { ok: false, reason: 'disabled' }
     - POST multipart به ${WHISPER_API_URL}/v1/audio/transcriptions
       fields: file, model=${WHISPER_MODEL || 'whisper-1'}, language=fa
       اگر WHISPER_API_KEY موجود: Authorization: Bearer header
       AbortController با timeout 90s (نه 60s)
     - موفق: UPDATE messenger_messages SET content = transcript
       WHERE id = message_id AND sender_id = userId
     - شکست/timeout: فقط console.warn، return { ok: false, reason }
     - خروجی همیشه { ok: boolean, reason?: string } — هرگز throw نکن
  3. src/components/messenger/AudioPlayer.tsx
     - useSignedAttachmentUrl(file_path) برای signed URL
     - <audio controls preload="metadata" src={url} />
     - نمایش مدت زمان با onLoadedMetadata
     - skeleton تا signed URL آماده شود
  فایل‌های ویرایش‌شده:
  4. src/lib/messenger/attachment-rules.ts
     - kind جدید "audio":
       exts: ["webm", "mp4", "ogg", "m4a", "mp3"]
       mimes: [/^audio\/(webm|mp4|ogg|mpeg|x-m4a|aac).*/i]
       maxBytes: 25  *1024*  1024
       label: "صوت"
     - تابع جدید getRuleByExtAndMime(ext, mime):
       اگر mime با audio/ شروع شد → rule صوت
       در غیر این صورت → getRuleByExt(ext)
  5. src/lib/messenger/upload.functions.ts
     - در preCheckMessengerAttachment:
       اگر mime با audio/ شروع شد → getRuleByExtAndMime استفاده شود
  6. src/components/messenger/MessageComposer.tsx
     - state جدید: mode: "compose" | "recording" | "recorded"
     - دکمه Mic کنار Paperclip
     - در حالت recording/recorded: کل composer به AudioRecorder سوییچ شود
     - جریان ارسال audio:
       a. preCheck → storage.upload → send_messenger_message_with_attachment
          با p_type='audio' و p_content=' ' (تک‌فاصله)
       b. پس از موفقیت RPC:
          void transcribeMessengerAudio({ data: { message_id: [row.id](http://row.id) } })
          fire-and-forget، روی reject فقط console.warn
       c. mode را به "compose" برگردان
  7. src/components/messenger/MessageList.tsx
     - اگر attachment با kind=audio (با getRuleByExtAndMime):
       رندر <AudioPlayer> به‌جای AttachmentBubble
     - اگر content غیر خالی و غیر whitespace بعد از STT:
       زیر پلیر: «📝 رونویسی: {content}»
  8. src/hooks/messenger/useMessengerMessages.ts
     - در useEffect Realtime: listener جداگانه برای UPDATE اضافه کن:
       .on('postgres_changes', { event: 'UPDATE', schema: 'public',
         table: 'messenger_messages',
         filter: `group_id=eq.${groupId}` },
         (p) => {
           queryClient.setQueryData(['messenger-messages', groupId],
             (old) => old?.map(m => [m.id](http://m.id) === [p.new.id](http://p.new.id) ? {...m, ...[p.new](http://p.new)} : m) ?? []
           );
         })
     - این برای نمایش خودکار transcript بعد از STT لازم است
  Secrets که باید ثبت شوند (با add_secret):
  - WHISPER_API_URL (مثال: [http://whisper:9000](http://whisper:9000))
  - WHISPER_API_KEY (اختیاری)
  - WHISPER_MODEL (اختیاری، پیش‌فرض whisper-1)
  بعد از اجرا:
  1. npm run build بدون خطا
  2. typecheck روی همه فایل‌های messenger
  3. گزارش هر warning جدید