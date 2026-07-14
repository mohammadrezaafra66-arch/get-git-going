## تقسیم کار به بخش‌های کوچک

کل کار رفع باگ‌های /messages را به ۶ بخش مستقل تقسیم می‌کنیم. هر بخش جداگانه اجرا، تست و تایید می‌شود قبل از رفتن به بخش بعد.

### نقشه کلی بخش‌ها

| بخش | موضوع | وابستگی |
|---|---|---|
| **A** | ابزار تشخیص read-only (`messenger-doctor.ps1`) + مستندات | هیچ — فقط اسکریپت، صفر ریسک |
| B | رفع WebSocket در Node 20 (کلاینت Supabase سمت سرور) | خروجی A |
| C | رفع `crypto.randomUUID` (helper + delivery receipts) | مستقل از A/B |
| D | UX ضبط صدا + پیش‌بررسی HTTPS/mediaDevices | مستقل |
| E | پیام‌های خطای دقیق برای semantic-search و ai-chat | خروجی A (برای دیدن env واقعی) |
| F | migration نقش‌های `messenger_group_members` (فقط بعد از دیدن خروجی doctor) | خروجی A |

هیچ بخشی به بخش قبل commit نمی‌شود قبل از تایید شما.

---

## بخش A — که الان می‌خواهیم انجام دهیم

**وضعیت:** پیاده‌سازی در turn قبل انجام شد. این پلن فقط برای تایید نهایی محتوای بخش A است.

**فایل‌های تولیدشده:**
1. `deploy/lan/scripts/messenger-doctor.ps1` — اسکریپت PowerShell 5.1 سازگار، ASCII فقط، کاملاً read-only.
2. `deploy/lan/README.md` — بخش ۱۵.۱ اضافه شد.

**چه چیزی چک می‌کند (بدون چاپ هیچ secret):**
- وضعیت Docker + `compose ps`
- نسخهٔ Node در کانتینر web + `typeof WebSocket`
- حضور env vars مهم (فقط `SET` / `MISSING`)
- Health سه endpoint: `web/`, `kong /auth/v1/health`, `kong /storage/v1/status`
- دسترسی به Ollama (`/api/tags`) از داخل کانتینر
- الگوهای خطا در ۳۰۰ خط آخر لاگ web
- وجود ۶ جدول messenger + delivery
- نام policyها روی جدول‌های messenger + `storage.objects` (فقط نام‌ها)
- وجود ۵ function کلیدی (`send_messenger_message`, `is_messenger_group_admin`, …)
- تعداد ردیف و ابعاد بردار در `message_embeddings`
- وجود دو bucket: `messenger-attachments`, `delivery-receipts`

**خروج:** exit code = تعداد FAIL؛ خلاصهٔ رنگی PASS/FAIL/WARN/INFO.

**تضمین‌های امنیتی:**
- هیچ SQL نوشتاری اجرا نمی‌شود.
- هیچ کانتینر restart/recreate نمی‌شود.
- مقدار هیچ env یا secret چاپ نمی‌شود؛ فقط SET/MISSING.
- هیچ فایل کد پروژه تغییر نکرده — فقط دو فایل داخل `deploy/lan/` اضافه/ویرایش شده.

**قدم بعدی که از شما می‌خواهیم:**
1. روی سرور LAN اجرا کنید:
   ```powershell
   cd C:\path\to\repo
   .\deploy\lan\scripts\messenger-doctor.ps1
   ```
2. خروجی کامل را (بدون ویرایش) در چت بچسبانید.
3. پس از دیدن خروجی، بخش B را با migrations/کد واقعی مبتنی بر شواهد شروع می‌کنیم — هیچ migration حدسی ساخته نمی‌شود.

**Rollback بخش A:** حذف دو فایل بالا — چون هیچ کد اپ و هیچ migration تغییر نکرده، ریسک صفر است.

**تأثیر روی سایر ماژول‌ها:** هیچ. اسکریپت فقط می‌خواند.
