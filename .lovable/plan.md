## هدف
سه باگ باقی‌مانده در پیام‌رسان داخلی که در نوبت‌های قبلی رفع نشدند:

1. تغییر نقش عضو گروه — توست موفقیت می‌دهد ولی نقش عوض نمی‌شود.
2. `crypto.randomUUID is not a function` هنگام ثبت رسید خوانده‌شدن (self-host روی LAN با HTTP → مرورگر `crypto.randomUUID` را در non-secure context ارائه نمی‌دهد؛ `supabase-js` realtime هنگام ساخت channel از آن استفاده می‌کند).
3. دستیار AI با «ارتباط با دستیار برقرار نشد» شکست می‌خورد — وضعیت disabled و خطای شبکه از هم تفکیک نمی‌شود و پیام خطا گمراه‌کننده است.

خارج از scope: ضبط صدا (خطای مرورگری getUserMedia؛ نیاز به HTTPS/permission — نه سرور).

## فایل‌های تغییر

### ۱) `src/components/messenger/GroupMembersDialog.tsx`
- تابع `updateRole.mutationFn` را از `.update(...).eq(...)` به نسخه‌ای که ردیف برگردانده شده را بررسی می‌کند تغییر بده:
  - افزودن `.select("user_id, role")` به query.
  - اگر آرایه خالی برگشت → `throw new Error("شما دسترسی تغییر نقش را ندارید یا عضو یافت نشد")` (RLS آپدیت را ساکت رد می‌کند و توست موفقیت اشتباه است).
  - در `onSuccess` توست تنها زمانی نشان داده شود که واقعاً ردیفی برگشته باشد.
- بقیه UI بدون تغییر.

### ۲) `src/lib/polyfills/crypto-uuid.ts` (فایل جدید کوچک)
- polyfill سبک برای `crypto.randomUUID` وقتی مرورگر آن را ارائه نمی‌دهد (LAN/HTTP self-host):
  ```ts
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
    // v4 UUID با getRandomValues (که در non-secure context هم موجود است)
    (globalThis.crypto as Crypto).randomUUID = function randomUUID() {
      const b = new Uint8Array(16);
      globalThis.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
      return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10,16).join("")}` as `${string}-${string}-${string}-${string}-${string}`;
    };
  }
  ```
- در `src/start.ts` (client entry) یک `import "./lib/polyfills/crypto-uuid";` قبل از سایر importها اضافه شود تا هم برای رسید خواندن، هم برای supabase realtime قبل از هر مصرف در دسترس باشد.
- تأثیر: صرفاً یک تابع افزودنی است؛ اگر مرورگر خودش پشتیبانی کند polyfill اصلاً اجرا نمی‌شود.

### ۳) `src/components/messenger/AiAssistantDrawer.tsx`
- منطق پاسخ HTTP را بهبود بده تا وضعیت disabled و خطا از هم تفکیک شوند:
  - اگر `!res.ok` → متن body را بخوان و توست دقیق‌تری بده (`ارتباط با دستیار برقرار نشد (کد X)`).
  - وقتی SSE پیام `{ok:false, reason:"disabled"}` می‌فرستد، به‌جای توست خطا فقط `setDisabled(true)` و پیام informative در UI (که از قبل هست) نگه داشته شود — این بخش امروز درست است ولی مطمئن شویم `toast.error` در این مسیر اجرا نمی‌شود.
  - وقتی `j.error` می‌آید (`timeout`/`fetch_failed`/`http_XYZ`)، پیام فارسی متناسب نمایش داده شود:
    - `timeout` → «پاسخ دستیار طول کشید؛ دوباره تلاش کنید»
    - `fetch_failed` → «دسترسی به سرویس دستیار محلی برقرار نشد؛ تنظیمات OLLAMA_API_URL را بررسی کنید»
    - سایر → «خطا در دستیار: <reason>»
- بدون تغییر در `src/routes/api/messenger/ai-chat.ts` (backend صحیح است؛ اگر `OLLAMA_API_URL` set نباشد وضعیت disabled را برمی‌گرداند).

## آنچه تغییر نمی‌کند
- هیچ migration / RLS / RPC.
- هیچ dependency جدید.
- backend `ai-chat` و middleware `requireSupabaseAuthNode20` (که در نوبت قبلی برای رفع WebSocket اضافه شد).
- ضبط صدا (خطای مرورگر است، نه کد؛ در گزارش تحویل ذکر می‌شود که برای رفع دائم باید سرور روی HTTPS باشد).

## بررسی‌ها
- `bun run build`
- `bunx eslint <سه فایل تغییر یافته>`
- تست دستی:
  1. تغییر نقش عضو با کاربری که مجاز نیست → باید توست خطا ببیند، نه موفقیت.
  2. باز کردن صفحه messages روی LAN/HTTP → دیگر خطای `crypto.randomUUID` در کنسول نباشد و رسید خواندن ثبت شود.
  3. باز کردن AI Drawer و ارسال پیام:
     - اگر Ollama غیرفعال → بنر «دستیار غیرفعال است» بدون توست خطا.
     - اگر Ollama پیکربندی شده ولی در دسترس نیست → توست فارسی واضح.

## گزارش تحویل
شامل: فایل‌های بازبینی‌شده، فایل‌های تغییر یافته، نتیجه build/lint، مسیر تست دستی، و توضیح صریح که «ضبط صدا» و رفع کامل `randomUUID` روی HTTP در نهایت نیاز به HTTPS/secure-origin دارد (polyfill راه‌حل موقتی برای self-host روی HTTP LAN است).
