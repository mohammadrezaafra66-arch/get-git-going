# طرح جامع رفع مشکلات ماژول /messages و رسیدهای تحویل — Self-host / LAN

## Task ID
messenger-selfhost-hardening-2026-07-14

## Classification
PLAN ONLY — file edits allowed: No

## SHA مبنا
- SHA فعلی repo: `0863c6c082b8aaf1f647a2537aa6c10734103c2c` (پیام کامیت: «RLS view فروش را تکمیل کرد»)
- منطبق با commit مبنای بیرونی. تفاوت مرتبط: **صفر**.

---

## هدف
رفع ۷ باگ گزارش‌شده در `/messages` و آپلود رسید تحویل روی محیط Self-host/LAN با Node 20، بدون تغییر معماری Phase 1، بدون تضعیف RLS و بدون هیچ migration/policy حدسی. مسیر تحویل با یک ابزار تشخیص read-only (`messenger-doctor.ps1`) شروع می‌شود؛ سایر مراحل فقط پس از گزارش خروجی واقعی این ابزار اجرا می‌شوند.

---

## جدول تشخیص مرحله صفر (بر اساس شواهد استخراج‌شده تا اینجا)

| # | بررسی | شاهد | نتیجه | اقدام |
|---|---|---|---|---|
| 1 | Node runtime کانتینر web | `Dockerfile:53 → FROM node:20-alpine AS runner` | Node 20 (بدون WebSocket بومی سراسری) | مسیر NoopRealtimeTransport واجب است — ارتقاء به Node 22 خارج از این PR. |
| 2 | server-side `createClient()`ها | `src/integrations/supabase/client.server.ts` (Noop اعمال شده) — `src/integrations/supabase/auth-middleware.ts:40` (**Noop اعمال نشده**) — `src/routes/api/messenger/ai-chat.ts:36` (**Noop اعمال نشده**) | این دو مسیر منشأ خطای «Node.js detected but native WebSocket not found» هستند | استخراج helper مشترک server-realtime-transport و استفاده در هر دو (auth-middleware auto-gen است → مسیر جایگزین در پایین). |
| 3 | مصرف `requireSupabaseAuth` | `embeddings.functions.ts`, `transcribe.functions.ts`, `upload.functions.ts` و ... همه به middleware ناقص وابسته‌اند | تمام server fnهای messenger هنگام fail Ollama/Storage با ارور WebSocket برخورد می‌کنند | با اصلاح گام ۲ به‌صورت زنجیره‌ای حل می‌شود. |
| 4 | `crypto.randomUUID` client-side | ۱۰ نقطه: `useDeliveryReceipts.ts:187`, `useInquiries.ts:32`, `usePurchase.ts:216`, `useDocuments.ts:157`, `sales.quotes.new.tsx:780,859`, `ProductImagesSection.tsx:85`, `FiltersBar.tsx:52`, `PaymentReceiptDocuments.tsx:315`, و `upload.functions.ts:59` (سرور) | مرورگر روی origin غیر-secure (`http://192.168.170.8`) → `crypto.randomUUID` تعریف نشده | Helper مشترک `safe-random-uuid.ts` + جایگزینی همه callsiteهای browser. |
| 5 | AudioRecorder | فایل کامل خوانده شد؛ `startRecording` بلافاصله `navigator.mediaDevices.getUserMedia` را می‌خواند بدون بررسی `window.isSecureContext` یا وجود `navigator.mediaDevices` | روی HTTP LAN، `mediaDevices` `undefined` است → `TypeError` که به‌طور کلی «شروع ضبط ناموفق بود» می‌شود | preflight (isSecureContext + وجود APIs) + مدیریت خطاها بر اساس `DOMException.name` + راهنمای HTTPS (Caddy موجود). |
| 6 | Ollama/Whisper env | `.env.lan.example` نیازمند بررسی؛ metadata کد نشان می‌دهد `OLLAMA_API_URL`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL` استفاده می‌شوند | نبود env → `disabled` بی‌صدا | افزودن به `.env.lan.example` + Compose + تست از داخل کانتینر توسط doctor. |
| 7 | Ledger و pipeline migration | `deploy/lan/scripts/update-lan.ps1` بدون هیچ رخداد `migration/migrate` | migration به‌صورت خودکار روی LAN اعمال نمی‌شود | اسکریپت جدا `apply-lan-migrations.ps1` با dry-run، تأیید صریح و ledger. |
| 8 | schema/policyها/RPCها | هنوز خوانده نشده؛ نیاز به خروجی `supabase--read_query` روی LAN (پس از استقرار doctor) | نامعلوم | **stop condition**: تا نبود خروجی واقعی هیچ migration نوشته نمی‌شود. |

---

## Scope
- افزودن ابزار doctor read-only.
- استخراج helper مشترک NoopRealtimeTransport + server-side Supabase factory.
- اصلاح دو مسیر server (`auth-middleware`, `ai-chat`) با کمترین اثر ممکن.
- Helper مشترک `safeRandomUUID` و جایگزینی همه callsite browser.
- AudioRecorder: preflight + مدیریت دقیق خطا + پیام HTTPS.
- افزودن envهای LAN و بازتاب در Compose (بدون secret).
- اسکریپت مستقل `apply-lan-migrations.ps1`.
- UI mapping دقیق reasonها برای semantic search و AI chat.
- MessageComposer: پشتیبانی type-safe از هر دو حالت خروجی `send_messenger_message` (string یا `{id}`).
- MessageComposer: نمایش مرحلهٔ شکست (pre-check / upload / RPC / cleanup).
- Delivery receipt: نگاشت صریح extension↔MIME + `safeRandomUUID` + پیام‌های مرحله‌ای.
- روال دانلود پیوست: تست پایانی end-to-end (بدون تغییر policy).
- **migration واقعی برای تغییر نقش عضو گروه فقط پس از خروجی doctor** — در همین PR فقط guard سمت UI اضافه می‌شود که «۰ ردیف» را success کاذب نمی‌گیرد، و migration جداگانه در PR بعدی.

## Out of scope
- ارتقاء Node 20 → 22.
- تغییر browser Supabase client یا realtime subscription.
- بازنویسی auth-middleware.ts auto-gen بدون دلیل (مسیر جایگزین در پایین توضیح داده شده).
- تغییر schema/جدول/policyهای موجود بدون شواهد pg_policies.
- تغییر معماری Ollama یا Whisper.
- تغییر UI کلی messenger.
- ادغام تغییرات در `update-lan.ps1` (migration باید صریح باشد).

---

## فایل‌های بررسی‌شده (قبلاً)
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/lib/messenger/embeddings.functions.ts`
- `src/lib/messenger/upload.functions.ts`
- `src/routes/api/messenger/ai-chat.ts`
- `src/components/messenger/MessageComposer.tsx`
- `src/components/messenger/AudioRecorder.tsx`
- `src/components/messenger/AiAssistantDrawer.tsx`
- `src/components/messenger/GroupMembersDialog.tsx`
- `src/hooks/delivery-receipts/useDeliveryReceipts.ts`
- `src/hooks/messenger/useMessengerMessages.ts`
- `src/hooks/messenger/useSemanticSearch.ts`
- `Dockerfile`, `deploy/lan/scripts/update-lan.ps1`

## فایل‌هایی که باید حین اجرا دوباره بررسی شوند
- `deploy/lan/.env.lan.example`
- `deploy/lan/docker-compose.yml`
- `src/lib/messenger/transcribe.functions.ts`
- `src/hooks/messenger/useSignedAttachmentUrl.ts` (دانلود پیوست)
- `src/lib/messenger/attachment-rules.ts` (نگاشت MIME↔ext مرجع)
- `deploy/proxy/Caddyfile.example`, `deploy/proxy/docker-compose.yml`
- migrationهای موجود messenger/semantic/AI/delivery در `supabase/migrations/`

## فایل‌های احتمالاً تغییر می‌کنند
- افزوده: `src/integrations/supabase/server-realtime-transport.ts` (server-only)
- افزوده: `src/integrations/supabase/server-client-factory.ts` (server-only helper)
- افزوده: `src/lib/crypto/safe-random-uuid.ts`
- افزوده: `deploy/lan/scripts/messenger-doctor.ps1`
- افزوده: `deploy/lan/scripts/apply-lan-migrations.ps1`
- افزوده: `docs/lan/HTTPS_FOR_MICROPHONE.md`
- ویرایش: `src/routes/api/messenger/ai-chat.ts` (استفاده از factory + کدهای خطا)
- ویرایش: `src/integrations/supabase/auth-middleware.ts` (**فقط اگر اجتناب‌ناپذیر**؛ مسیر جایگزین: helper سرور جدید که همان interface را برمی‌گرداند و در server fnهای messenger به‌جای `context.supabase` استفاده می‌شود، بدون لمس auto-gen)
- ویرایش: `src/components/messenger/AudioRecorder.tsx`
- ویرایش: `src/components/messenger/MessageComposer.tsx` (پشتیبانی return‌type دوگانهٔ RPC + پیام‌های مرحله‌ای)
- ویرایش: `src/components/messenger/AiAssistantDrawer.tsx` (mapping کدهای خطا)
- ویرایش: `src/hooks/messenger/useSemanticSearch.ts` + کامپوننت جست‌وجو (mapping reasonها)
- ویرایش: `src/components/messenger/GroupMembersDialog.tsx` (بررسی ردیف تغییرکرده قبل از toast)
- ویرایش: `src/hooks/delivery-receipts/useDeliveryReceipts.ts` (safeRandomUUID + MIME map دقیق)
- ویرایش سایر callsiteهای `crypto.randomUUID` browser (۸ فایل).
- ویرایش: `deploy/lan/.env.lan.example`, `deploy/lan/docker-compose.yml`, `deploy/lan/README.md`

### راه‌حل جایگزین برای اجتناب از ویرایش auto-gen
`auth-middleware.ts` علامت‌گذاری شده «Do not edit». مسیر پیشنهادی:
1. یک middleware جایگزین محلی مثل `src/integrations/supabase/require-supabase-auth-safe.ts` بسازیم که دقیقاً همان منطق را دارد ولی client را از `server-client-factory.ts` (با NoopRealtimeTransport) می‌گیرد.
2. فقط server fnهای messenger و AI به این middleware جدید سوییچ شوند. سایر server fnها دست‌نخورده باقی می‌مانند تا اثر جانبی نداشته باشند.
3. اگر تیم Lovable حاضر باشد auto-gen را با patch رسمی به‌روز کند، مسیر ۱ حذف می‌شود؛ در غیر این‌صورت این wrapper پایدارترین انتخاب است.

---

## Database / Migration impact
**در این PR: هیچ migration جدیدی نوشته نمی‌شود.**
- role mutation در همین PR فقط guard سمت UI می‌گیرد (`.select("user_id")` + بررسی خالی بودن + toast خطای شفاف).
- migration واقعی برای RPC `update_messenger_group_member_role` **پس از** خروجی doctor روی LAN (که policyهای دقیق `messenger_group_members` و functionهای موجود مثل `is_messenger_group_admin` را نشان می‌دهد) در PR جداگانه.
- Rollback: چون هیچ SQL اجرا نمی‌شود، rollback = revert commit.

## RLS / RBAC / audit impact
- هیچ policy تغییر نمی‌کند.
- هیچ bucket public نمی‌شود.
- هیچ grant جدیدی داده نمی‌شود.
- audit_logs بدون تغییر.

## Security / secret-safety impact
- هیچ secret در log/UI/report چاپ نمی‌شود.
- doctor فقط `SET/MISSING` گزارش می‌دهد.
- `SUPABASE_SERVICE_ROLE_KEY` هرگز به frontend نمی‌رود.
- `.env.lan.example` فقط نام env دارد، بدون مقدار.

## Self-host / Docker / Linux / Supabase impact
- بدون تغییر Docker runtime.
- بدون تغییر Compose services (فقط env جدید mapping می‌شود).
- بدون وابستگی جدید به CDN/سرویس خارجی.
- Caddy موجود بازاستفاده می‌شود (بدون تحمیل سرویس جدید).

## Performance impact
- Helper Supabase server-side یک instance per request است — همان الگوی فعلی، بدون سربار.
- بدون polling جدید.
- بدون indexing/جدول جدید.

## UI/UX impact
- پیام‌های خطا از انگلیسی خام به فارسی مرحله‌ای تبدیل می‌شوند.
- AudioRecorder روی HTTP پیام صریح «فقط روی HTTPS/localhost» می‌دهد.
- تغییر نقش دیگر success کاذب نمی‌دهد.
- Semantic search reasonها به کاربر توضیح داده می‌شوند.

---

## Implementation phases

- **Phase A — Doctor (read-only):** فقط `messenger-doctor.ps1` + مستندسازی. هدف: قبل از هر migration، خروجی واقعی dbشناسی جمع شود.
- **Phase B — رفع WebSocket سرور:** `server-realtime-transport.ts`, `server-client-factory.ts`, `require-supabase-auth-safe.ts`, و سوییچ ai-chat + سه server fn messenger.
- **Phase C — safeRandomUUID:** helper + جایگزینی ۱۰ callsite.
- **Phase D — AudioRecorder + HTTPS guide + Caddy note.**
- **Phase E — MessageComposer type-safe + پیام مرحله‌ای.**
- **Phase F — Semantic + AI chat reason mapping (UI only).**
- **Phase G — Delivery receipt: MIME map + safeRandomUUID.**
- **Phase H — LAN env & Compose mapping (بدون secret).**
- **Phase I — apply-lan-migrations.ps1 (فقط اسکریپت، migration واقعی نه).**
- **Phase J — Group role guard (UI-only در این PR).**
- **Phase K — Post-doctor:** فقط پس از دریافت خروجی واقعی doctor، PR جداگانه برای RPC/migration `update_messenger_group_member_role` و هر backfill لازم روی `message_embeddings`.

---

## Acceptance criteria
- خروجی doctor روی LAN با PASS/FAIL/WARN بدون هیچ secret.
- ساخت server Supabase client روی Node 20 exception نمی‌دهد (unit test موجود).
- آپلود تصویر <5MB / PDF / DOCX دیگر ارور WebSocket نمی‌دهد (نیاز به تست operator روی LAN).
- تغییر نقش عضو دیگر success کاذب نمی‌دهد؛ اگر RLS بلاک کند، toast خطای فارسی نمایش داده می‌شود.
- ضبط صدا روی HTTP LAN پیام مشخص HTTPS-required نمایش می‌دهد و روی HTTPS واقعاً ضبط می‌کند.
- Semantic search هر reason را با متن فارسی متمایز نمایش می‌دهد.
- AI chat کدهای خطای ساختار‌یافته به UI می‌دهد و پیام کاربر ناقص هنگام disabled/unreachable در `ai_conversations` ثبت نمی‌شود.
- آپلود رسید تحویل روی مرورگرهای بدون `crypto.randomUUID` هم کار می‌کند.
- دانلود پیوست end-to-end موفق است بدون تغییر policy.
- هیچ فایل auto-gen بدون یادداشت صریح ویرایش نشده.

## Manual test path (operator on 192.168.170.8)
1. `pwsh deploy/lan/scripts/messenger-doctor.ps1` → خروجی را ضمیمه گزارش کند.
2. `/messages` → آپلود تصویر ۲MB، PDF، DOCX (هر سه باید بدون ارور WebSocket).
3. تغییر نقش یک عضو غیرخودی به `admin` و برعکس.
4. ضبط صدا روی HTTP → باید پیام HTTPS نمایش دهد. بعد از فعال شدن Caddy: ضبط واقعی و ارسال.
5. جست‌وجوی معنایی با/بدون Ollama → پیام‌های reason متمایز.
6. ارسال پیام به دستیار AI با/بدون OLLAMA_API_URL.
7. آپلود رسید تحویل PDF و JPG.
8. دانلود پیوست ارسال‌شده.

## Commands to run (سمت agent)
- `bun run lint`
- `bun run typecheck` (اگر موجود)
- `bun run build`
- unit test جدید: `bun test src/integrations/supabase/server-client-factory.test.ts`
- unit test جدید: `bun test src/lib/crypto/safe-random-uuid.test.ts`
- اگر هر کدام در محیط Lovable قابل اجرا نبود، صریحاً «اجرا نشد» گزارش می‌شود.

## Risks
- ویرایش `auth-middleware.ts` auto-gen توسط سیستم regenerate ممکن است لغو شود → mitigation: helper جایگزین بدون لمس فایل auto-gen.
- Ollama URL از داخل container نباید `localhost` باشد → doctor این را چک می‌کند.
- Caddy HTTPS برای LAN نیاز به cert قابل‌اعتماد یا mkcert دارد؛ self-signed تجربه کاربری بد می‌دهد → مستند شده.
- تست operator اجباری است — هیچ ادعایی بدون خروجی واقعی.

## Stop conditions
- اگر doctor نشان دهد policy یا function مورد انتظار متفاوت است → migration در همین PR **نوشته نمی‌شود**.
- اگر ویرایش auto-gen اجتناب‌ناپذیر شود → متوقف و از کاربر تأیید صریح گرفته شود.
- اگر ارتقاء Node 22 در دستور کار قرار گیرد → PR جداگانه.

## Smallest safe next implementation slice
**Phase A فقط**: افزودن `deploy/lan/scripts/messenger-doctor.ps1` + یک بخش کوتاه در `deploy/lan/README.md` با دستور اجرا. هیچ تغییر کد runtime. سپس اجرا توسط operator روی LAN و بازگرداندن خروجی. بعد از آن، Phase B تا J در یک یا چند PR کوچک اجرا می‌شود.

## Next SAFE AGENT CHANGE prompt
> «Phase A را پیاده کن: فقط `deploy/lan/scripts/messenger-doctor.ps1` (read-only، بدون چاپ secret) و بخش دستور اجرا در `deploy/lan/README.md` را اضافه کن. هیچ فایل دیگری تغییر نکند. بعد از اجرا توسط من روی 192.168.170.8، خروجی را برایت می‌فرستم تا Phase B را طراحی کنی.»
