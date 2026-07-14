## مرحله C — حذف وابستگی `crypto.randomUUID` در آپلود رسیدهای تحویل

### مشکل
در مرورگرِ مصرف‌کننده روی LAN با `http://192.168.170.8` (غیرHTTPS و غیر‌localhost)، `window.crypto.randomUUID` در دسترس نیست چون `SubtleCrypto`/`crypto.randomUUID` فقط در Secure Context فعال‌اند. نتیجه: هنگام آپلود رسید در `useDeliveryReceipts` خطای `crypto.randomUUID is not a function` رخ می‌دهد و آپلود شکست می‌خورد — دقیقاً همان الگویی که در ماژول messenger هم بود.

الگویی که پروژه از قبل استفاده می‌کند در `src/hooks/messenger/useInquiries.ts` و `src/components/data-tables/FiltersBar.tsx` وجود دارد:

```ts
typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : /* fallback */
```

اما این fallbackها هر بار به‌صورت inline تکرار شده‌اند. برای مرحله C یک helper مشترک، ساده و بدون وابستگی می‌سازیم و فقط نقطهٔ تحویل رسیدها را به آن سوئیچ می‌کنیم.

### تغییرات

1) **افزودن `src/lib/utils/safe-uuid.ts` (فایل جدید، ~20 خط):**
   - export `safeRandomUUID(): string`
   - اگر `globalThis.crypto?.randomUUID` موجود بود، همان را برگرداند.
   - در غیر این صورت، اگر `crypto.getRandomValues` موجود بود، از آن برای ساخت UUID v4 استاندارد استفاده کند (الگوریتم مرسوم با ماسک 0x40/0x80).
   - در نهایت fallback به `Math.random`-based v4 (فقط برای اسم فایل storage استفاده می‌شود، امنیتی نیست).

2) **`src/hooks/delivery-receipts/useDeliveryReceipts.ts`:**
   - import `safeRandomUUID` و جایگزینی خط 187:  
     `const path = \`${type}/${safeRandomUUID()}.${ext}\`;`
   - هیچ منطق دیگری تغییر نمی‌کند.

### خارج از دامنهٔ این مرحله
- سایر call-siteهای `crypto.randomUUID` (sales quotes, documents, purchases, product images, payment receipt documents) در حال حاضر روی HTTPS/localhost کار می‌کنند و مشکل گزارش‌شدهٔ کاربر مربوط به آن‌ها نیست. طبق قانون «تغییر کوچک و محدود به task»، در این مرحله دست‌نخورده می‌مانند. اگر پس از messenger-doctor نیاز به توسعهٔ این fix تأیید شد، در یک مرحلهٔ جداگانه (D+) با همان helper سوئیچ می‌شوند.
- `useInquiries` و `FiltersBar` که از قبل fallback inline دارند نیز تغییر نمی‌کنند تا diff مینیمال بماند.
- `src/lib/messenger/upload.functions.ts` (سرور، Node) و `enqueue-dummy-job.server.ts` (`node:crypto`) اصلاً متأثر نیستند.

### RLS/RBAC/Migration/Audit
- بدون هیچ migration، بدون تغییر policy، بدون تغییر schema، بدون تغییر RBAC، بدون تغییر audit. صرفاً تغییر یک سطر client-side + یک utility خالص.

### تأثیر بر سایر ماژول‌ها
- هیچ. helper جدید فقط از یک نقطه فراخوانی می‌شود. Browser Realtime، AI chat، pricing، messenger و سایر بخش‌ها بدون تغییر باقی می‌مانند.

### راستی‌آزمایی
- `bunx tsgo --noEmit` روی مسیرهای تغییرکرده.
- `bunx eslint src/lib/utils/safe-uuid.ts src/hooks/delivery-receipts/useDeliveryReceipts.ts`.
- تست دستی توسط اپراتور روی `http://192.168.170.8/delivery-receipts`: انتخاب فایل jpg/pdf و آپلود، مشاهدهٔ ایجاد ردیف در `delivery_receipts` و فایل در باکت `delivery-receipts`.

### Rollback
`git revert` روی همین commit؛ چون تنها یک فایل جدید و یک سطر تغییر است، بدون هیچ اثر جانبی.

### ریسک باقی‌مانده
- fallback مبتنی بر `Math.random` از نظر آماری برای شناسهٔ فایل storage کافی است (فضای 122 بیتی v4)، ولی cryptographically-strong نیست؛ چون فقط برای نام فایل استفاده می‌شود و هرگز به‌عنوان توکن/راز به‌کار نمی‌رود، ریسک عملی صفر است. اگر `getRandomValues` موجود باشد (که در همهٔ مرورگرهای مدرن حتی روی HTTP هست) این fallback هرگز اجرا نمی‌شود.
