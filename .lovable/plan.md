## مرحله D — گسترش `safeRandomUUID` به سایر آپلودها و کلیدهای کلاینت

### مشکل
پس از تأیید مرحله C، همان الگو در بقیهٔ نقاط کلاینت هم وجود دارد و دقیقاً همان خطای `crypto.randomUUID is not a function` را روی LAN با HTTP ساده (192.168.x.x — غیر Secure Context) به‌محض استفاده تولید می‌کند. تا وقتی این نقاط سوئیچ نشوند، هر بار که کاربر LAN وارد آن جریان‌ها شود، آپلود/ثبت شکست می‌خورد.

### نقاط مشمول تغییر (فقط client-side)
1. `src/hooks/documents/useDocuments.ts:157` — مسیر آپلود Storage.
2. `src/hooks/purchase/usePurchase.ts:216` — مسیر آپلود پیوست خرید.
3. `src/components/accounting/PaymentReceiptDocuments.tsx:315` — مسیر آپلود مستندات فیش واریزی.
4. `src/components/products/ProductImagesSection.tsx:85` — مسیر آپلود تصویر محصول.
5. `src/routes/_app.sales.quotes.new.tsx:780,859` — کلید ردیف در آرایه‌های فرم پیش‌فاکتور (کلید React).
6. `src/hooks/messenger/useInquiries.ts:32` — جایگزینی fallback inline موجود با helper مشترک برای یک‌دستی.
7. `src/components/data-tables/FiltersBar.tsx:52` — همان یکسان‌سازی fallback inline.

### خارج از دامنه
- `src/lib/messenger/upload.functions.ts:62` — سرور (Node runtime). `crypto.randomUUID` در Node موجود است و مشکل LAN ندارد؛ دست‌نخورده.
- هیچ تغییر در schema/RLS/RBAC/audit/migration. هیچ تغییر منطق کسب‌وکار. هیچ تغییر UI.

### تغییرات
- در هر فایل بالا: افزودن `import { safeRandomUUID } from "@/lib/utils/safe-uuid";` و جایگزینی نقطه‌ای `crypto.randomUUID()` با `safeRandomUUID()`.
- در `useInquiries.ts` و `FiltersBar.tsx`: حذف عبارت شرطی inline (`typeof crypto !== "undefined" && "randomUUID" in crypto ? ... : ...`) و جایگزینی با فراخوانی مستقیم `safeRandomUUID()`.
- helper از پیش موجود است؛ فایل جدیدی ایجاد نمی‌شود.

### راستی‌آزمایی
- `bunx tsgo --noEmit`
- `npm run build`
- تست دستی روی `http://192.168.170.8`:
  - آپلود سند در بخش Documents
  - آپلود پیوست در Purchases
  - آپلود مستند در فیش واریزی حسابداری
  - آپلود تصویر محصول
  - ساخت پیش‌فاکتور جدید (افزودن ردیف)
  - فیلترها در جدول‌ها و ماژول Inquiries
- انتظار: در Console هیچ خطای `crypto.randomUUID is not a function` دیده نشود.

### Rollback
`git revert` روی همین commit. تغییرات هم‌شکل و کوچک هستند.

### ریسک
هیچ. helper در مسیر HTTPS/localhost همان native `crypto.randomUUID` را برمی‌گرداند، در LAN از `getRandomValues` استفاده می‌کند. رفتار عملی یکسان است.
