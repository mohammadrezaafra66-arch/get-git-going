## تشخیص از بررسی فعلی
در آخرین request واقعی کاربر، endpoint داخلی `/api/messenger/ai-chat` با status `200` جواب داده اما stream شامل این است:

```text
data: {"error":"fetch_failed"}
```

پس خطا در auth کاربر یا UI نیست؛ backend اپ هنگام `fetch` به `OLLAMA_API_URL + /api/chat` اصلاً به سرویس Ollama وصل نمی‌شود. اگر روی سرور خودتان گاهی `http_403` می‌بینید، آن یک حالت دوم است: آدرس reachable است ولی proxy/فایروال/احراز هویت رد می‌کند.

## نکته مهم زیرساختی
تا وقتی اپ در preview Lovable اجرا می‌شود، اگر `OLLAMA_API_URL` یک IP خصوصی/LAN مثل `192.168.x.x` یا سرویسی پشت شبکه داخلی باشد، preview نمی‌تواند به آن برسد و `fetch_failed` طبیعی است. برای تست preview باید آدرس عمومی امن و قابل‌دسترسی از اینترنت بدهید، یا AI را فقط روی self-host نهایی تست کنید.

## برنامه رفع جامع
1. **تشخیص دقیق‌تر در backend**
   - در `src/routes/api/messenger/ai-chat.ts` خطاهای اتصال به Ollama را طبقه‌بندی می‌کنم:
     - URL نامعتبر
     - timeout
     - DNS/network unreachable
     - HTTP 401/403/404/5xx
   - بدون نمایش secret یا متن خام حساس به کاربر.

2. **افزودن self-check امن برای Ollama**
   - یک server route جدید و authenticated برای تست تنظیمات Ollama اضافه می‌کنم، مثل:
     ```text
     /api/messenger/ai-health
     ```
   - این route فقط وضعیت‌های غیرحساس برمی‌گرداند:
     - آیا `OLLAMA_API_URL` تنظیم شده؟
     - آیا `/api/tags` قابل دسترسی است؟
     - status code مقصد چیست؟
     - آیا مدل تنظیم‌شده در لیست مدل‌ها دیده می‌شود؟
   - مقدار کامل URL، کلید، header یا response خام حساس نمایش داده نمی‌شود.

3. **نمایش وضعیت تست در UI دستیار**
   - در `AiAssistantDrawer.tsx` یک دکمه کوچک «بررسی اتصال» اضافه می‌کنم.
   - نتیجه به فارسی نمایش داده می‌شود:
     - «آدرس تنظیم نشده»
     - «از این سرور به Ollama دسترسی نیست»
     - «دسترسی توسط proxy/Ollama رد شد»
     - «مدل پیدا نشد؛ مدل را pull کنید»
     - «اتصال سالم است»

4. **پشتیبانی بهتر از reverse proxy محافظت‌شده**
   - پشتیبانی فعلی `OLLAMA_API_KEY` حفظ می‌شود.
   - اگر proxy به header خاص نیاز داشته باشد، پشتیبانی server-side و اختیاری برای `OLLAMA_AUTH_HEADER` اضافه می‌کنم؛ بدون ذخیره یا نمایش در frontend.
   - اگر تنظیم نشود، رفتار فعلی تغییر نمی‌کند.

5. **راهنمای دقیق نهایی برای سرور شما**
   - بعد از تغییر، مسیر تست دستی را می‌دهم:
     ```bash
     docker exec -it afrakala-web wget -qO- "$OLLAMA_API_URL/api/tags"
     ```
   - اگر fail شد، مشکل قطعی در شبکه/فایروال/proxy بین container app و سرور Ollama است، نه React/UI.

## فایل‌های احتمالی تغییر
- `src/routes/api/messenger/ai-chat.ts`
- `src/components/messenger/AiAssistantDrawer.tsx`
- فایل جدید کوچک: `src/routes/api/messenger/ai-health.ts`

## بدون تغییر
- بدون migration
- بدون RLS/RBAC/RPC
- بدون dependency جدید
- بدون secret در frontend

## بررسی‌ها بعد از اجرا
- lint فایل‌های تغییرکرده
- build
- تست دستی مسیر `/messages` و دکمه «بررسی اتصال»
- گزارش اینکه مشکل در preview، self-host، یا reverse proxy است