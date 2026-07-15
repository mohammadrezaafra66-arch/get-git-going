## تشخیص فعلی
درخواست مرورگر به `/api/messenger/ai-chat` موفق است، اما backend هنگام اتصال به Ollama پاسخ `http_403` می‌گیرد. یعنی آدرس Ollama قابل دسترس است ولی سرور مقصد یا reverse proxy آن اجازه دسترسی نمی‌دهد. این با خطای قبلی `fetch_failed` فرق دارد.

## برنامه اجرا
1. **شفاف‌سازی خطای 403 در UI**
   - در `AiAssistantDrawer.tsx` پیام `http_403` را از حالت عمومی به پیام فارسی دقیق تغییر می‌دهم:
     «سرور Ollama دسترسی را رد کرد؛ تنظیمات آدرس، فایروال، reverse proxy یا کلید دسترسی را بررسی کنید.»

2. **بهبود backend دستیار بدون وابستگی جدید**
   - در `src/routes/api/messenger/ai-chat.ts` خطاهای HTTP برگشتی از Ollama را دقیق‌تر طبقه‌بندی می‌کنم.
   - برای `403` مقدار خطای مشخص مثل `ollama_forbidden` برمی‌گردد تا UI پیام درست بدهد.
   - متن خام خطای مقصد به کاربر نمایش داده نمی‌شود تا اطلاعات حساس/proxy لو نرود.

3. **پشتیبانی اختیاری از Ollama پشت reverse proxy محافظت‌شده**
   - اگر Ollama روی سرور جدا پشت proxy با احراز هویت است، backend بتواند از env سرور مثل `OLLAMA_API_KEY` به‌صورت server-side استفاده کند و هدر `Authorization: Bearer ...` را فقط از سمت سرور بفرستد.
   - هیچ secret وارد frontend یا repo نمی‌شود.
   - اگر این env تنظیم نشود، رفتار فعلی برای Ollama بدون احراز هویت حفظ می‌شود.

4. **راهنمای تنظیم سرور در گزارش نهایی**
   - مقدار درست `OLLAMA_API_URL` باید ریشه سرویس باشد، نه endpoint کامل:
     ```text
     http://IP_OR_HOST:11434
     ```
   - اگر proxy بین app و Ollama هست و 403 می‌دهد، یا باید IP کانتینر app allow شود، یا auth header/کلید server-side تنظیم شود.

## فایل‌های هدف
- `src/routes/api/messenger/ai-chat.ts`
- `src/components/messenger/AiAssistantDrawer.tsx`

## بدون تغییر
- بدون migration/RLS/RPC
- بدون dependency جدید
- بدون تغییر schema
- بدون secret در frontend

## بررسی‌ها بعد از اجرا
- build
- lint
- typecheck اگر اسکریپت مستقل وجود داشته باشد
- تست دستی مسیر `/messages` و ارسال پیام به دستیار