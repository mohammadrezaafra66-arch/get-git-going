## تشخیص

محیط تست: **self-host روی LAN با HTTP** (نه لاول). هر دو خطا مختص همین محیط‌اند:

1. `crypto.randomUUID is not a function` — روی origin غیرامن (HTTP LAN) مرورگر این API را حذف می‌کند. کد ما پلی‌فیل دارد (`src/lib/polyfills/crypto-uuid.ts` که در `__root.tsx` و `start.ts` import شده) و در ProductImagesSection هم از `safeRandomUUID` استفاده می‌شود. اما خطا از **داخل خود `@supabase/supabase-js`** می‌آید (auth/storage در زمان generate id از `globalThis.crypto.randomUUID` استفاده می‌کند) — یعنی پلی‌فیل یا اجرا نمی‌شود یا **build جدید روی سرور نصب نشده**.

2. `Node.js detected but native WebSocket not found` — از server function اجرای supabase realtime روی Node 20 self-host. ما `requireSupabaseAuthNode20` را با NoopRealtimeTransport ساخته‌ایم و در `upload.functions.ts` مسنجر استفاده می‌شود. پس این هم نشان می‌دهد **کد جدید روی سرور اجرا نمی‌شود**.

3. Documents/Delivery/Purchase Receipts هیچ دکمه‌ای نمی‌بینند در حالی که کاربر admin است. کد `canUpload = roles.includes("admin") …` صحیح است و تب «آپلود جدید» باید نمایش داده شود. یعنی یا build قدیمی است، یا roles کاربر روی سرور خالی برگردانده می‌شود.

**فرضیه اصلی: build فعلی روی سرور self-host، نسخه‌ای قبل از fixهای اخیر (پلی‌فیل crypto + Node20 middleware + آپلود forms) است.** قبل از هر تغییر کد باید این تأیید شود.

## قدم‌های پیشنهادی

### فاز 0 — تأیید نسخه سرور (بدون تغییر کد)
- شما یک بار سرور را pull/rebuild کنید و hard reload بزنید (`Ctrl+Shift+R`).
- در DevTools → Console بزنید: `typeof crypto?.randomUUID` — اگر `"undefined"` بود پلی‌فیل load نشده.
- در Network تب Documents، ببینید آیا request به `/documents` HTML چیزی شبیه `crypto-uuid` در chunkها بارگذاری می‌کند.
- اگر بعد از rebuild خطاها رفتند و تب آپلود ظاهر شد → مشکل فقط دیپلوی بود، نه کد.

### فاز 1 — سخت‌تر کردن پلی‌فیل (اگر بعد از rebuild هم باقی ماند)
- انتقال پلی‌فیل به یک `<script>` inline در `head` روت (قبل از هر ماژول Vite) تا حتی قبل از bootstrap اجرا شود.
- افزودن log اولیه در پلی‌فیل: `console.debug("[crypto-uuid] installed", typeof crypto.randomUUID)` برای تشخیص.

### فاز 2 — پوشش کامل Node20 WS
- بررسی همه server functionهایی که `requireSupabaseAuth` استاندارد را استفاده می‌کنند (نه Node20 wrapper) و تبدیل آن‌ها روی مسیرهای آپلود/رسید/سند به `requireSupabaseAuthNode20`.
- فایل‌های هدف احتمالی: `src/hooks/documents/*.functions.ts`, `src/hooks/delivery-receipts/*.functions.ts`, upload حساب‌داری.

### فاز 3 — تأیید Documents/Delivery/Purchase Receipts
- بعد از rebuild با کاربر admin تست کنید تب «آپلود جدید» ظاهر شود.
- اگر ظاهر نشد، `useAuth().roles` را در کنسول لاگ می‌کنیم تا ببینیم چرا خالی است.

### فاز 4 — Purchase Receipts (فقط اگر واقعاً upload form ندارد)
- بررسی مسیر مربوطه (`_app.purchase.tsx` یا مشابه) و اگر form آپلود واقعاً موجود نیست، اضافه کردن آن مطابق الگوی Delivery Receipts.

## سؤال قبل از build
لطفاً اول **فاز 0** را اجرا کنید و نتیجه سه چیز را بگویید:
1. خروجی `typeof crypto?.randomUUID` در کنسول سرور self-host.
2. آیا بعد از rebuild + hard reload تب «آپلود سند جدید» در `/documents` (با کاربر admin) ظاهر می‌شود؟
3. آیا خطای WebSocket در آپلود مسنجر بعد از rebuild هنوز رخ می‌دهد؟

با این سه پاسخ می‌توانم دقیقاً مشخص کنم که آیا نیاز به تغییر کد است یا فقط دیپلوی، و بعد وارد فازهای 1–4 می‌شویم.
