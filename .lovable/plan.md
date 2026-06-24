# Phase 6 — دستیار هوشمند Self-Hosted (Ollama + pgvector)

## هدف

افزودن دستیار AI گفتگو-محور، تولید embedding خودکار برای پیام‌های متنی، و جست‌وجوی معنایی در گروه‌های پیام‌رسان — همه با Ollama self-hosted روی همان سرور. بدون هیچ وابستگی به API خارجی. سازگاری کامل با self-host (Linux + Docker + Supabase) و RAM 16GB.

---

## 1) Migration جدید

فایل: `supabase/migrations/<ts>_messenger_phase6_ai.sql`

### 1.1 Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

نکته self-host: `pgvector` در image رسمی Supabase موجود است. اگر در deployment فعلی نصب نباشد، plan متوقف می‌شود (stop condition).

### 1.2 `ai_conversations`

- `id uuid pk`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `group_id uuid null references messenger_groups(id) on delete cascade` — اختیاری: گفتگوی AI می‌تواند مرتبط با گروه باشد
- `role text not null check (role in ('user','assistant','system'))`
- `content text not null`
- `model text` — اسم مدل پاسخ‌دهنده
- `tokens_in int`, `tokens_out int` — اختیاری برای آمار
- `created_at timestamptz default now()`
- index: `(user_id, group_id, created_at desc)`

### 1.3 `message_embeddings`

- `message_id uuid pk references messenger_messages(id) on delete cascade`
- `group_id uuid not null references messenger_groups(id) on delete cascade` (denormalized برای RLS و فیلتر سریع)
- `embedding vector(768)` — ابعاد `nomic-embed-text`
- `content_excerpt text` — ۲۰۰ کاراکتر اول برای preview نتیجه بدون JOIN
- `created_at timestamptz default now()`
- index: `USING hnsw (embedding vector_cosine_ops)` + `(group_id)`

### 1.4 GRANT + RLS

طبق قانون پروژه:

```sql
GRANT SELECT, INSERT, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
GRANT SELECT, INSERT, DELETE ON public.message_embeddings TO authenticated;
GRANT ALL ON public.message_embeddings TO service_role;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
```

Policies:

- `ai_conversations`: کاربر فقط ردیف‌های `user_id = auth.uid()` خود را می‌بیند/می‌سازد/پاک می‌کند.
- `message_embeddings`: SELECT فقط اگر کاربر عضو `group_id` باشد (همان pattern موجود `is_messenger_group_member`). INSERT/DELETE فقط service_role (از سمت serverFn نوشته می‌شود با supabase auth context کاربر فرستنده — اما برای جلوگیری از سوء‌استفاده، INSERT با شرط `EXISTS sender_id == auth.uid() در messenger_messages`).

### 1.5 RPC کمکی برای جست‌وجو

```sql
CREATE OR REPLACE FUNCTION public.search_messenger_messages_semantic(
  p_group_id uuid, p_query_embedding vector(768), p_limit int DEFAULT 10
) RETURNS TABLE(message_id uuid, content text, created_at timestamptz, sender_id uuid, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.content, m.created_at, m.sender_id,
         1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM message_embeddings e
  JOIN messenger_messages m ON m.id = e.message_id
  WHERE e.group_id = p_group_id
    AND is_messenger_group_member(p_group_id, auth.uid())
    AND m.deleted_at IS NULL
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
$$;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```

بدون تغییر در migration/RLS/RPCهای Phase 1-5.

---

## 2) فایل‌های serverFn جدید

### 2.1 `src/lib/messenger/ai-chat.functions.ts`

- `chatWithAssistant` با `requireSupabaseAuth`، input `{ group_id?: uuid|null, message: string(1..4000) }`.
- مراحل:
  1. اعتبارسنجی عضویت اگر `group_id` داده شد.
  2. بارگیری ۲۰ پیام آخر گروه (اگر group_id) به‌علاوه ۱۰ پیام قبلی از `ai_conversations` همان user/group.
  3. ساخت messages array: system فارسی + history + user.
  4. درج user message در `ai_conversations`.
  5. اگر `OLLAMA_API_URL` خالی → return `{ ok:false, reason:'disabled' }`.
  6. POST به `${OLLAMA_API_URL}/api/chat` با `{ model: OLLAMA_MODEL || 'llama3.2:8b', messages, stream: true }`.
  7. **Streaming SSE به کلاینت**: serverFn معمولی body stream برنمی‌گرداند → برای streaming از **server route** استفاده می‌شود (نه createServerFn). پس فایل دوم لازم است (پایین).
  8. timeout 120s با AbortController.
  9. پایان stream: درج assistant message در `ai_conversations`.

> **اصلاح طراحی**: چون `createServerFn` plain DTO برمی‌گرداند، streaming باید از طریق **server route** باشد. در نتیجه `chatWithAssistant` به یک server route تبدیل می‌شود.

### 2.2 `src/routes/api/messenger/ai-chat.ts` (server route — SSE)

- `POST /api/messenger/ai-chat`
- auth: استخراج JWT از header `Authorization`، سپس ساخت supabase client با session کاربر (مثل میدلور). در صورت نبود → 401.
- بدنه: zod `{ group_id?: uuid|null, message: string }`.
- جواب: `text/event-stream` با chunkهای Ollama که خط به خط forward می‌شوند. در پایان، assistant message در DB ذخیره می‌شود.
- در صورت `OLLAMA_API_URL` خالی → یک event با `{ ok:false, reason:'disabled' }` و بسته شدن stream.

### 2.3 `src/lib/messenger/embeddings.functions.ts`

- `generateMessageEmbedding` با `requireSupabaseAuth`، input `{ message_id: uuid }`.
  - بررسی پیام: نوع `text` و `sender_id = userId` (یا عضویت گروه — به‌خاطر امنیت فقط sender).
  - اگر `OLLAMA_API_URL` خالی → `{ ok:false, reason:'disabled' }` (هرگز throw).
  - POST `${OLLAMA_API_URL}/api/embeddings` با `{ model: OLLAMA_EMBED_MODEL || 'nomic-embed-text', prompt: content }` (timeout 30s).
  - UPSERT در `message_embeddings(message_id, group_id, embedding, content_excerpt)`.
  - خروجی همیشه `{ ok: boolean, reason?: string }`.
- `semanticSearchMessenger` با `requireSupabaseAuth`، input `{ group_id: uuid, query: string(1..500) }`.
  - بررسی عضویت (RLS هم دوباره چک می‌کند).
  - generate embedding برای query.
  - فراخوانی RPC `search_messenger_messages_semantic`.
  - return آرایه نتایج با `similarity`.

### 2.4 ادغام تولید embedding

در `MessageComposer.tsx` پس از موفقیت ارسال پیام نوع `text`:

```ts
void generateMessageEmbedding({ data: { message_id: row.id } }).catch(console.warn);
```

fire-and-forget، بدون block کردن UX. هیچ تغییر در RPC ارسال پیام.

---

## 3) UI

### 3.1 `src/components/messenger/AiAssistantDrawer.tsx` (جدید)

- Drawer از shadcn (سمت چپ در RTL).
- فیلد textarea + دکمه «ارسال»، لیست پیام‌های user/assistant.
- اتصال به `/api/messenger/ai-chat` با `fetch` + `ReadableStream` reader؛ append chunkها به پیام assistant در حال رشد.
- نمایش skeleton تا اولین chunk.
- اگر response `disabled` بود → پیام فارسی «دستیار هوشمند هنوز فعال نیست».
- دکمه «پاک کردن گفتگو» (DELETE روی `ai_conversations` با scope user+group).

### 3.2 `src/components/messenger/ChatWindow.tsx` (ویرایش)

- اضافه شدن یک دکمه آیکونی (Sparkles) در هدر → باز کردن `AiAssistantDrawer` با `group_id` فعلی.

### 3.3 `src/components/messenger/SemanticSearchBar.tsx` (جدید)

- input کوچک بالای `MessageList` با placeholder «جست‌وجوی معنایی…»
- debounce 400ms، روی Enter یا دکمه ذره‌بین فراخوانی `semanticSearchMessenger`.
- زیر input یک popover/list با نتایج (محتوای کوتاه + درصد شباهت + زمان). کلیک → scroll به پیام در لیست (با `data-message-id`).
- وضعیت «در حال جست‌وجو»، «نتیجه‌ای یافت نشد»، و «دستیار غیرفعال است» همگی فارسی.
- اگر `OLLAMA_API_URL` تنظیم نباشد، input پنهان یا disable با tooltip.

### 3.4 `src/hooks/messenger/useAiConversation.ts` (جدید)

- مدیریت state گفتگوی AI، fetch تاریخچه از `ai_conversations` با supabase client.

### 3.5 `src/hooks/messenger/useSemanticSearch.ts` (جدید)

- wrapper بر serverFn با React Query، disable شدن خودکار بعد از 30s stale.

---

## 4) Secrets

از طریق `set_secret` پس از تأیید plan:

- `OLLAMA_API_URL` (مثال: `http://ollama:11434`)
- `OLLAMA_MODEL` (پیش‌فرض کد: `llama3.2:8b`)
- `OLLAMA_EMBED_MODEL` (پیش‌فرض کد: `nomic-embed-text`)

تا قبل از تنظیم → کل قابلیت در حالت `disabled` با UI فارسی، بدون خطا. هیچ secret با پیشوند `VITE_`.

---

## 5) Acceptance criteria

1. کاربر در هدر ChatWindow دکمه «دستیار هوشمند» می‌بیند؛ کلیک Drawer را باز می‌کند.
2. ارسال یک پیام به دستیار، پاسخ به‌صورت streaming کلمه‌به‌کلمه فارسی نمایش داده می‌شود (< 5s تا اولین chunk روی Llama 3.2 8B).
3. تاریخچه گفتگو در `ai_conversations` ذخیره و در reload Drawer برگردانده می‌شود.
4. ارسال هر پیام متنی جدید در گروه → ظرف چند ثانیه ردیف معادل در `message_embeddings` ایجاد می‌شود (verifiable در SQL).
5. SemanticSearchBar: عبارت «فاکتور دیروز» نزدیک‌ترین پیام‌های مرتبط را برمی‌گرداند، نه فقط match لغوی.
6. کلیک روی نتیجه جست‌وجو → اسکرول دقیق به آن پیام در MessageList با highlight موقت.
7. کاربر B نمی‌تواند `ai_conversations` کاربر A را بخواند (RLS).
8. کاربر B نمی‌تواند `generateMessageEmbedding` برای پیام کاربر A فراخوانی کند (شرط sender_id).
9. اگر `OLLAMA_API_URL` پاک باشد: همه UIهای AI حالت «غیرفعال» با متن فارسی نشان دهند، هیچ runtime error.
10. خاموش کردن Ollama وسط stream → toast فارسی، assistant message ناقص با علامت «قطع شد» ذخیره شود (یا روی timeout 120s)، composer سالم بماند.
11. حجم پاسخ: تنها روی RAM 16GB + Llama 3.2 8B (≈5GB VRAM/RAM)، embedding nomic (≈300MB) — قابل اجرا.
12. هیچ تغییر در migration/RPC/RLS فازهای قبلی.

---

## 6) Manual test path

1. تنظیم سه secret؛ راه‌اندازی Ollama (`ollama pull llama3.2:8b && ollama pull nomic-embed-text`) — خارج از scope.
2. ورود کاربر A → /messages → گروه عضو → باز کردن Drawer دستیار → «خلاصه ۲۰ پیام آخر این گروه را بده» → پاسخ streaming فارسی.
3. ارسال ۵ پیام متنی → بررسی SQL: `select count(*) from message_embeddings where group_id=...` باید برابر تعداد پیام‌های متنی باشد.
4. SemanticSearch: یک پیام درباره «هزینه ارسال» داشته باشید؛ سرچ «شیپینگ» باید آن را برگرداند.
5. ورود کاربر B → `select * from ai_conversations where user_id = <A>` → 0 ردیف (RLS).
6. تست disable: env `OLLAMA_API_URL` خالی → Drawer پیام «دستیار غیرفعال است»؛ ارسال پیام متنی همچنان کار کند.
7. تست down: Ollama را stop کنید → Drawer toast «دستیار در دسترس نیست»، composer سالم.
8. تست timeout: prompt خیلی طولانی → پس از 120s قطع تمیز.

---

## 7) ریسک‌ها

- **حجم RAM**: Llama 3.2 8B + Whisper + Postgres + اپ روی 16GB ممکن است تنگ باشد. mitigation: فقط model کوچک‌تر `llama3.2:3b` به‌عنوان fallback مستند شود (env override).
- **ابعاد embedding**: `nomic-embed-text` رسماً 768. اگر deployment کاربر مدل دیگر استفاده کرد، column ابعاد ثابت 768 خطا می‌دهد → stop condition.
- **pgvector روی self-host**: اگر extension نصب نباشد → migration fail. باید قبل از اجرا بررسی شود.
- **Streaming در Worker SSR**: TanStack server routes از `Response(stream)` پشتیبانی می‌کنند؛ باید verify شود که Ollama stream در محیط Lovable preview قابل proxy است (در preview احتمالاً disabled، در self-host OK).
- **هزینه embedding per پیام**: یک HTTP call اضافه per پیام متنی. روی LAN داخلی <100ms، قابل قبول.
- **نشت context بین گروه‌ها**: chatWithAssistant باید **فقط** پیام‌های گروه فعلی را پاس دهد، نه تمام گروه‌ها (تست RLS هم دوباره).
- **Prompt injection**: کاربر می‌تواند در پیام دستور system inject کند. mitigation: system prompt فارسی صریح + پیام‌های history به‌عنوان role=user نه system.
- **حجم embedding table**: روی گروه پرپیام، چندصدهزار ردیف 768-dim → HNSW index کافی است؛ pg_vacuum معمولی.
- **حذف پیام**: ON DELETE CASCADE روی `message_embeddings` — OK.

---

## 8) Out of scope (تأیید مجدد)

- نصب Ollama / docker-compose (مستندسازی self-host جداست).
- fine-tuning، RAG با دانش خارج از گروه، تحلیل قیمت.
- multi-turn tool calling / function calling.
- moderation / safety filter.
- embedding برای attachmentها (audio/file).
- backfill embedding برای پیام‌های قبلی (می‌توان در فاز جدا با worker انجام داد).
- گزارش‌های آماری AI.

---

## 9) Stop conditions

- `CREATE EXTENSION vector` در محیط self-host fail کرد → توقف، گزارش به کاربر برای نصب pgvector.
- مدل nomic بعد از pull ابعاد ≠ 768 برگرداند → توقف، تنظیم column size مجدد با تأیید.
- Server route streaming در محیط Lovable Worker پشتیبانی نشد → fallback به non-stream `stream:false` و گزارش.
- نیاز به تغییر هرگونه migration/RPC/RLS فازهای قبلی → توقف.
- اگر `npm run build` یا typecheck بشکند → فقط رفع، scope ثابت.
- اگر RAM سرور در تست بارگذاری 95%+ شد → توصیه به `llama3.2:3b` و توقف برای تصمیم کاربر.
- اگر RLS تست بند ۷/۸ شکست خورد → توقف و بازنگری policies قبل از ادامه.

---

## خلاصه تحویل

- 1 migration (extension + 2 table + 1 RPC + RLS/GRANT).
- 2 serverFn module (`ai-chat.functions.ts`، `embeddings.functions.ts`).
- 1 server route (`/api/messenger/ai-chat` برای SSE).
- 4 فایل UI/hook جدید + 2 ویرایش (ChatWindow، MessageComposer).
- 3 secret جدید.
- بدون لمس کد فازهای 1-5 جز دو insertion کوچک در ChatWindow و MessageComposer.  
  
لطفاً Phase 6 پیام‌رسان AfraKala را اجرا کن — دستیار هوشمند Self-Hosted.
  هیچ تغییر در migration/RPC/RLS فازهای قبلی.
  بخش A — Migration:
  فایل: supabase/migrations/<timestamp>_messenger_phase6_ai.sql
  1. فعال‌سازی extension:
  CREATE EXTENSION IF NOT EXISTS vector;
  2. جدول ai_conversations:
  - id uuid pk default gen_random_uuid()
  - user_id uuid not null references auth.users(id) on delete cascade
  - group_id uuid null references messenger_groups(id) on delete cascade
  - role text not null check (role in ('user','assistant','system'))
  - content text not null
  - model text
  - tokens_in int, tokens_out int
  - created_at timestamptz default now()
  - index: (user_id, group_id, created_at desc)
  - RLS: کاربر فقط user_id = auth.uid() خود را ببیند/بسازد/پاک کند
  3. جدول message_embeddings:
  - message_id uuid pk references messenger_messages(id) on delete cascade
  - group_id uuid not null references messenger_groups(id) on delete cascade
  - embedding vector(768)
  - content_excerpt text (200 کاراکتر اول)
  - created_at timestamptz default now()
  - index HNSW: USING hnsw (embedding vector_cosine_ops)
  - index: (group_id)
  - RLS SELECT: is_messenger_group_member(group_id, auth.uid())
  - RLS INSERT: EXISTS (SELECT 1 FROM messenger_messages WHERE id=message_id AND sender_id=auth.uid())
  - RLS DELETE: service_role only
  4. RPC جست‌وجو:
  CREATE OR REPLACE FUNCTION [public.search](http://public.search)_messenger_messages_semantic(
    p_group_id uuid, p_query_embedding vector(768), p_limit int DEFAULT 10
  ) RETURNS TABLE(message_id uuid, content text, created_at timestamptz, sender_id uuid, similarity float)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT [m.id](http://m.id), m.content, m.created_at, m.sender_id,
           1 - (e.embedding <=> p_query_embedding) AS similarity
    FROM message_embeddings e
    JOIN messenger_messages m ON [m.id](http://m.id) = e.message_id
    WHERE [e.group](http://e.group)_id = p_group_id
      AND is_messenger_group_member(p_group_id, auth.uid())
      AND m.deleted_at IS NULL
    ORDER BY e.embedding <=> p_query_embedding
    LIMIT LEAST(p_limit, 50);
  $$;
  REVOKE EXECUTE ON FUNCTION [public.search](http://public.search)_messenger_messages_semantic FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION [public.search](http://public.search)_messenger_messages_semantic TO authenticated, service_role;
  بخش B — Server Route (SSE):
  فایل: src/routes/api/messenger/ai-chat.ts
  - POST /api/messenger/ai-chat
  - auth: استخراج JWT از Authorization header → 401 اگر نبود
  - input zod: { group_id?: string | null, message: string(1..4000) }
  - بارگیری ۲۰ پیام آخر گروه + ۱۰ پیام قبلی از ai_conversations
  - درج user message در ai_conversations
  - اگر OLLAMA_API_URL خالی → یک SSE event با { ok:false, reason:'disabled' } و close
  - POST به ${OLLAMA_API_URL}/api/chat با { model: OLLAMA_MODEL||'llama3.2:8b', messages, stream:true }
  - system prompt فارسی: «تو دستیار هوشمند AfraKala هستی. فقط به فارسی پاسخ بده.»
  - پیام‌های history به‌عنوان role=user/assistant (نه system) برای جلوگیری از prompt injection
  - forward chunkها به‌صورت text/event-stream
  - timeout 120s با AbortController
  - پایان stream: درج assistant message در ai_conversations
  - اگر Ollama قطع شد: event با { error:'disconnected' } و close
  بخش C — ServerFn ها:
  1. src/lib/messenger/embeddings.functions.ts
     - generateMessageEmbedding({ message_id: uuid }):
       * بررسی نوع text و sender_id = userId
       * اگر OLLAMA_API_URL خالی → { ok:false, reason:'disabled' }
       * POST ${OLLAMA_API_URL}/api/embeddings با { model: OLLAMA_EMBED_MODEL||'nomic-embed-text', prompt: content }
       * timeout 30s
       * UPSERT در message_embeddings
       * همیشه { ok: boolean, reason?: string } — هرگز throw نکن
     - semanticSearchMessenger({ group_id: uuid, query: string(1..500) }):
       * بررسی عضویت
       * generate embedding برای query
       * فراخوانی RPC search_messenger_messages_semantic
       * return آرایه نتایج با similarity
  بخش D — UI:
  1. src/components/messenger/AiAssistantDrawer.tsx (جدید)
     - Drawer از shadcn سمت چپ (RTL)
     - textarea + دکمه ارسال + لیست پیام‌های user/assistant
     - اتصال به /api/messenger/ai-chat با fetch + ReadableStream
     - append chunks به پیام assistant در حال رشد
     - skeleton تا اولین chunk
     - اگر disabled: «دستیار هوشمند هنوز فعال نیست»
     - دکمه «پاک کردن گفتگو»
  2. src/components/messenger/SemanticSearchBar.tsx (جدید)
     - input با placeholder «جست‌وجوی معنایی…»
     - debounce 400ms، Enter یا دکمه ذره‌بین
     - popover نتایج: محتوای کوتاه + درصد شباهت + زمان شمسی
     - کلیک → scroll به پیام با data-message-id و highlight موقت
     - اگر OLLAMA_API_URL تنظیم نباشد: input disabled با tooltip فارسی
  3. src/hooks/messenger/useAiConversation.ts (جدید)
  4. src/hooks/messenger/useSemanticSearch.ts (جدید)
  5. ویرایش src/components/messenger/ChatWindow.tsx:
     - دکمه Sparkles در هدر → باز کردن AiAssistantDrawer با group_id فعلی
  6. ویرایش src/components/messenger/MessageComposer.tsx:
     - پس از موفقیت ارسال پیام نوع text:
       void generateMessageEmbedding({ data: { message_id: [row.id](http://row.id) } }).catch(console.warn)
     - fire-and-forget
  Secrets (با add_secret):
  - OLLAMA_API_URL (مثال: [http://ollama:11434](http://ollama:11434))
  - OLLAMA_MODEL (پیش‌فرض: llama3.2:8b)
  - OLLAMA_EMBED_MODEL (پیش‌فرض: nomic-embed-text)
  اگر streaming در Worker پشتیبانی نشد → fallback به stream:false و گزارش.
  بعد از اجرا:
  1. npm run build بدون خطا
  2. typecheck روی همه فایل‌های جدید
  3. linter اجرا کن و گزارش بده
  4. تأیید کن extension vector در migration اعمال شده