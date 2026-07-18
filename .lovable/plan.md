
# سوییچ جست‌وجوی معنایی به Lovable AI Gateway

**مشکل تأیید‌شده:** در network log سرور برای `semanticSearchMessenger` نتیجه `{ok: false, reason: "fetch_failed"}` است — یعنی سرور نتوانسته به `OLLAMA_API_URL` وصل شود، پس هیچ query embedding ساخته نمی‌شود و همیشه لیست خالی برمی‌گردد. علاوه بر این، پیام‌های موجود هم embedding ندارند (چون قبلاً هم Ollama در دسترس نبوده).

## راه‌حل

سوییچ کامل به Lovable AI Gateway با مدل `google/gemini-embedding-2` (۳۰۷۲ بعد). این مدل روی preview ابری و روی self-host شما (تا زمانی که `LOVABLE_API_KEY` را در env سرور بگذارید) کار می‌کند و نیازی به Ollama ندارد.

## تغییرات

### ۱. Migration دیتابیس
- تغییر ستون `message_embeddings.embedding` از ابعاد فعلی به `vector(3072)`
- Drop و بازسازی ایندکس HNSW با الگوی halfvec:
  `create index ... using hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)`
- خالی کردن ردیف‌های embedding قدیمی (چون با مدل جدید ناسازگارند)
- افزودن ستون `model_version text` برای پیگیری مدل embedding

### ۲. `src/lib/messenger/embeddings.functions.ts`
- حذف تابع `callOllamaEmbedding` و متغیرهای `OLLAMA_API_URL` / `OLLAMA_EMBED_MODEL`
- افزودن `callLovableEmbedding(text)` که به `https://ai.gateway.lovable.dev/v1/embeddings` POST می‌کند با:
  - Header: `Authorization: Bearer ${LOVABLE_API_KEY}`
  - Body: `{ model: "google/gemini-embedding-2", input: text }`
  - Timeout و error handling مثل قبل (هرگز throw نکند، فقط `{ok:false, reason}`)
- در `semanticSearchMessenger` تغییر SQL similarity به الگوی halfvec (برای استفاده از ایندکس)
- ذخیره `model_version = "gemini-embedding-2"` هنگام upsert

### ۳. Backfill خودکار
- در همان `semanticSearchMessenger`: قبل از جست‌وجو، اگر تعداد پیام‌های text گروه بدون embedding > 0 بود، تا سقف N=۵۰ پیام آخر را embed کند (async، محدود). این باعث می‌شود پیام‌های قدیمی هم قابل جست‌وجو باشند بدون نیاز به job جدا.
- برای پیام‌های جدید: `generateMessageEmbedding` که از قبل روی ثبت پیام صدا زده می‌شود، حالا Lovable AI را می‌زند.

### ۴. نکته Self-host
در فایل env سرور self-host باید `LOVABLE_API_KEY` اضافه شود (مقدارش را از Preferences → Cloud پروژه Lovable می‌گیرید). بدون این متغیر، در سرور self-host همان خطا تکرار می‌شود ولی روی preview ابری خودکار کار می‌کند.

## چک بعد از اعمال
1. در `/messages` روی یک گروه سرچ کن → باید نتایج مرتبط بیاید (نه لیست خالی).
2. یک پیام text جدید بفرست → `message_embeddings` باید یک ردیف با `model_version="gemini-embedding-2"` بگیرد.
3. Network log: `_serverFn/...semanticSearchMessenger` باید `{ok: true, hits: [...]}` برگرداند.

## ریسک‌ها
- **هزینه:** هر پیام یک بار embed می‌شود (تک‌بار)، جست‌وجو هم query را embed می‌کند. حجم خیلی کم.
- **Migration:** embeddingهای قدیمی پاک می‌شوند — چون فقط ۳ پیام text دارید (طبق network log) و backfill خودکار انجام می‌شود، عملاً بی‌اثر است.
- **Self-host:** تا زمانی که `LOVABLE_API_KEY` در env سرور تنظیم نشود، روی self-host کار نمی‌کند (fallback به Ollama را حذف می‌کنم چون هرگز کار نکرده؛ اگر می‌خواهید Ollama fallback بماند، بگویید).
