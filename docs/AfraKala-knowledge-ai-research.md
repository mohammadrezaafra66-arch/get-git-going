# بریف تحقیق — خطای «هیچ ارائه‌دهنده هوش مصنوعی برای این قابلیت تنظیم نشده است» (دانش سازمانی)

> **مأموریت فقط‌خواندنی.** هیچ کد/migration/نوشتن DB/build. فقط ریشه‌یابی و گزارش (در چت، بدون فایل).
> **زمینه (مهم):**
> - نمایه‌سازی دانش **انجام شد** — `knowledge_document_chunks = 139`. پس مشکل «صفر chunk» رفع شده.
> - حالا در `/knowledge`، بخش «پرسش از اسناد»، پاسخ این است: **«هیچ ارائه‌دهنده هوش مصنوعی برای این قابلیت تنظیم نشده است.»**
> - این یک خطای **دوم** است که پشت مشکل نمایه‌سازی پنهان بود (الگوی «یک باگ باگ دیگر را ماسک می‌کند»).
> - **این با چت پیام‌رسان فرق دارد.** فاز ۱ فقط `src/routes/api/messenger/ai-chat.ts` را رفع کرد (درخواست صریح ollama). مسیر **پاسخ‌دهی دانش (RAG)** جداست و در فاز ۱ دست نخورد.
>
> **نحوهٔ اجرا:**
> ```powershell
> cd D:\AfraKalaTest\app
> claude
> ```
> ```
> Read AfraKala-knowledge-ai-research.md completely and execute it. Read-only — no code, no migrations, no DB writes, no builds. Report inline.
> ```

---

## قواعد
- فقط خواندن: `rg`، خواندن فایل، `SELECT`. هیچ نوشتنی، هیچ build.
- دیتابیس: `afrakala` روی `afrakala-lan-db`. هیچ کلید/رمز چاپ نشود.
- هر ادعا با شاهد (فایل:خط / خروجی SQL).

---

## گام ۱ — منشأ دقیق پیام را پیدا کن
```powershell
rg -n "ارائه‌دهنده هوش مصنوعی برای این قابلیت|قابلیت تنظیم نشده|این قابلیت تنظیم" src
rg -n "no_provider|no provider|not configured|configured for.*capability" src/lib/ai src/lib/knowledge
```
- فایل:خط دقیقی که این پیام را تولید می‌کند. این پیام معادل کدام «دلیل» (reason) در کد است؟ (احتمالاً `no_provider`.)
- این پیام یعنی `listProvidersFor(capability)` **خالی** برگشته. **کدام capability درخواست شده که خالی برگشت؟** این کلید همه‌چیز است.

## گام ۲ — مسیر پاسخ‌دهی دانش (RAG) را دنبال کن
- `src/lib/knowledge/rag.functions.ts` را بخوان. مرحلهٔ **تولید پاسخ** (بعد از بازیابی chunkها، جایی که به مدل chat می‌گوید از متن پاسخ بساز) کجاست؟
- در آن مرحله، **کدام capability** درخواست می‌شود؟ (`chat`? `embeddings`? یا یک نام دیگر مثل `generation`/`completion`/`rag`؟)
- provider چطور resolve می‌شود؟ آیا `resolveProviderForCapability` / `listProvidersFor` صدا زده می‌شود؟ با چه آرگومان capability؟
- آیا از مسیر failover استفاده می‌کند یا مسیر تک‌ارائه‌دهنده؟

## گام ۳ — 🔴 آیا تغییر مشترک فاز ۱ این مسیر را شکست؟ (مظنون اصلی)
فاز ۱ فایل مشترک `src/lib/ai/client.server.ts` را عوض کرد (افزودن پارامتر `opts.kind` به `resolveProviderForCapability`).
- تعریف فعلی `resolveProviderForCapability` و `listProvidersFor` را بخوان.
- آیا مسیر RAG همین تابع مشترک را صدا می‌زند؟ اگر بله، آیا تغییر فاز ۱ (پارامتر `kind`) به‌صورت پیش‌فرض واقعاً backward-compatible است، یا حالا مسیر RAG را طوری فیلتر می‌کند که خالی برمی‌گردد؟
- **این را دقیق چک کن:** آیا ممکن است فاز ۱ به‌طور ناخواسته باعث شده resolution برای مسیر دانش (که `kind` نمی‌فرستد یا `kind` متفاوتی می‌فرستد) خالی شود؟ diff رفتار قبل/بعد فاز ۱ را استدلال کن.

## گام ۴ — وضعیت ارائه‌دهندگان و قابلیت‌ها
```sql
SELECT id, name, kind, capabilities, priority, is_active, base_url, chat_model, embedding_model
FROM ai_providers ORDER BY priority;
```
- **کلیدی:** آیا هیچ ارائه‌دهنده‌ای capability‌ای را که مسیر RAG در گام ۲ درخواست می‌کند **دارد**؟
  - اگر capability درخواستی `chat` است و هر دو ارائه‌دهنده `{chat}` دارند ⟹ چرا خالی برمی‌گردد؟ (به فیلتر `is_active`/`kind`/سلامت نگاه کن.)
  - اگر capability درخواستی نامی است که **هیچ‌کدام ندارند** (مثلاً یک تگ جدا برای RAG) ⟹ ریشه همین است.
- سلامت مربوطه:
```sql
SELECT p.name, h.capability, h.last_status, h.last_error_code, h.last_ok_at
FROM ai_provider_health h JOIN ai_providers p ON p.id = h.provider_id;
```

## گام ۵ — حکم
دقیقاً بگو کدام است:
- (الف) capability درخواستیِ مسیر RAG را **هیچ ارائه‌دهنده‌ای ندارد** (عدم تطابق نام قابلیت)، یا
- (ب) فیلتر سلامت/فعال‌بودن همه را حذف می‌کند، یا
- (ج) تغییر مشترک فاز ۱ (`opts.kind`) مسیر RAG را بی‌صدا شکسته، یا
- (د) چیز دیگر.

و **دقیقاً کجا (کدام فایل:خط) باید عوض شود** تا رفع شود — فقط توصیف، بدون تغییر کد. اگر رفع فقط داده/config است (مثلاً افزودن یک capability به یک ارائه‌دهنده یا اصلاح فراخوانی)، صریح بگو.

## خروجی گزارش (در چت)
1. فایل:خط منشأ پیام + capability درخواستی.
2. مسیر RAG: کدام capability و چطور resolve می‌شود.
3. آیا فاز ۱ مقصر است؟ (diff رفتار).
4. وضعیت ارائه‌دهندگان/قابلیت‌ها (خروجی SQL).
5. حکم (الف/ب/ج/د) + محل دقیق رفع.
6. تأیید: هیچ فایل/DB/build تغییر نکرد.