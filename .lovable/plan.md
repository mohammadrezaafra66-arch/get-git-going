## تشخیص مشکل

خطای `Node.js detected but native WebSocket not found` هنگام ثبت استعلام جدید از این نقطه می‌آید:

- `src/lib/messenger/inquiries.functions.ts` از `requireSupabaseAuth` (فایل auto-generated `auth-middleware.ts`) استفاده می‌کند.
- این middleware داخل `createClient(...)` **بدون** تنظیم `realtime.transport` اجرا می‌شود، و `@supabase/supabase-js` v2.104 در Node 20 (سرور self-host) به‌طور eager `RealtimeClient` می‌سازد و WebSocket ندارد → 500.
- برای همین مشکل قبلاً `requireSupabaseAuthNode20` در `src/integrations/supabase/messenger-auth-middleware.ts` نوشته شده که با `NoopRealtimeTransport` این خطا را دور می‌زند و در سایر بخش‌های messenger (پیام، آپلود) استفاده شده.

`inquiries.functions.ts` هنگام ساخت این workaround جا افتاده. سه server function استعلام (`createInquiry`, `replyInquiry`, `transferInquiry`) هنوز از middleware ناسازگار با Node 20 استفاده می‌کنند.

## برنامه اجرا

### تغییر واحد و کم‌ریسک
در `src/lib/messenger/inquiries.functions.ts`:
- import را از `@/integrations/supabase/auth-middleware` به `@/integrations/supabase/messenger-auth-middleware` تغییر بده.
- `requireSupabaseAuth` را به `requireSupabaseAuthNode20` جایگزین کن در هر سه server function.

قرارداد `context` (شامل `supabase`, `userId`, `claims`) دقیقاً یکسان است، پس بقیه کد بدون تغییر می‌ماند.

## چرا این ۳ مورد بعدی هم رفع می‌شود

- **ارجاع استعلام به همکار (transferInquiry)**: همان server function است، با اصلاح middleware کار می‌کند.
- **پاسخ به استعلام (replyInquiry)**: همان server function.
- **تاریخچه/برد استعلام‌ها**: از realtime browser client (`.channel(...)`) و query معمولی استفاده می‌کنند، نه server function؛ فقط ناتوانی در `createInquiry`/`replyInquiry`/`transferInquiry` باعث می‌شد داده جدیدی وارد جریان نشود. با رفع serverFnها، UI موجود درست کار می‌کند.

## فایل هدف
- `src/lib/messenger/inquiries.functions.ts` (فقط ۲ خط: import و ۳ محل middleware)

## بدون تغییر
- بدون migration/RLS/RPC (خود RPCها `create_inquiry`, `reply_inquiry`, `transfer_inquiry` دست‌نخورده)
- بدون تغییر UI (`InquiryButton`, `InquiryReplyDialog`, `InquiryBoard`, `InquiryCard`)
- بدون dependency جدید (`ws` نصب نمی‌شود؛ روش noop-transport حفظ می‌شود)
- بدون تغییر schema
- بدون secret

## بررسی‌های بعد از اجرا
- `npm run build`
- `npm run lint` روی فایل تغییر یافته
- تست دستی مسیر `/messages`:
  1. ثبت استعلام جدید از دکمه داخل چت → باید بدون خطا ثبت شود.
  2. پاسخ به استعلام از دیالوگ → قیمت ثبت شود.
  3. ارجاع استعلام به همکار → مسئول عوض شود.
  4. نمایش برد استعلام‌ها و تاریخچه → آیتم جدید دیده شود.

## توضیح درباره ارور Ollama (طبق درخواست شما فعلاً کنار می‌گذاریم)
همان‌طور که در پلن قبلی توضیح داده شد، خطای `fetch_failed` مربوط به شبکه/پیکربندی سرور Ollama است، نه کد این پروژه. با اجرای مراحل زیرساختی که در `.lovable/plan.md` هست قابل رفع است. این پلن آن را دست نمی‌زند.
