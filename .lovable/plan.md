## Slice 9 — مرحله ۲ (UI فضای خرید)

بدون migration. بدون وابستگی جدید. کاملاً RTL و mobile-first. الگو مطابق Slice 8 (penalties) و کنوانسیون‌های موجود (`useDebounce`, `formatJalaliDateTime`, `RoleGuard`, `requirePermission`, `JalaliDateInput`، sonner toast).

> توجه: مسیر `/purchases` از قبل برای ثبت خرید واقعی استفاده می‌شود (`_app.purchases.tsx`). مسیر جدید `**/purchase**` برای «درخواست خرید» (purchase request) جداست و تداخلی ندارد.

### فایل‌های جدید

**۱. `src/lib/purchase/labels.ts**`

- `PURCHASE_STATUS_FA: Record<status, string>`
- `PURCHASE_STATUS_BADGE: Record<status, string>` (کلاس‌های tailwind سمنتیک: amber/blue/violet/green/muted)
- `PURCHASE_UNIT_OPTIONS = ['عدد','کیلوگرم','متر','بسته']`
- `nextStatuses(status)` → helper برای تعیین گذارهای مجاز

**۲. `src/hooks/purchase/usePurchase.ts**` — همگی client-side با `supabase` browser client + React Query:

- `useMyPurchaseRequests(status?)` → RPC `get_purchase_requests({p_status})` (RLS خودش کاربر را به own محدود می‌کند) — `staleTime: 30_000`
- `useAllPurchaseRequests({status?, search?, limit, offset})` → همان RPC (manager/admin همه را می‌بیند طبق RLS). جست‌وجوی متن روی `product_name` در client.
- `usePurchaseStats()` → چهار `select count` ساده روی `purchase_requests` (در انتظار / تأیید / خرید / این هفته)
- `usePurchaseReceipts(requestId)` → `from('purchase_receipts').select(...).eq('request_id', id)`
- `useCreatePurchaseRequest()` → mutation RPC + `invalidateQueries(['purchase-requests'])` + toast سبز
- `useUpdatePurchaseStatus()` → mutation RPC + invalidate لیست‌ها/stats + toast
- `useUploadPurchaseReceipt()` → mutation:
  1. validate (jpg/jpeg/png/pdf, ≤10MB)
  2. `supabase.storage.from('purchase-receipts').upload('${request_id}/${crypto.randomUUID()}.${ext}', file)`
  3. `from('purchase_receipts').insert({request_id, uploaded_by, storage_path, file_name, file_size, mime_type})`
  4. invalidate receipt query
- `getSignedReceiptUrl(path)` helper (1h)

**۳. کامپوننت‌ها زیر `src/components/purchase/**`

- `**PurchaseRequestForm.tsx**` (در Dialog یا standalone)
  - props: `{ inquiryId?: string, defaultProductId?: string, onSuccess?: () => void }`
  - فیلدها: محصول (Popover + Command با debounce روی `products` مثل `PurchaseForm` موجود)، تعداد (number, >0)، واحد (Select با چهار گزینه + پیش‌فرض «عدد»)، قیمت تخمینی (اختیاری)، توضیحات (textarea, max 500)
  - اگر `inquiryId` پاس شد: یک `Card` کوچک با خلاصه استعلام (یک select از `inquiries` بر اساس id)
  - validation با `zod` + `react-hook-form` (الگوی `PurchaseForm` موجود)
  - submit → `useCreatePurchaseRequest`
- `**PurchaseRequestCard.tsx**`
  - props: `{ request: PurchaseRequest, onAction?: () => void }`
  - badge وضعیت با `PURCHASE_STATUS_BADGE`
  - نمایش: نام محصول، تعداد + واحد، تاریخ شمسی (`formatJalaliDateTime(created_at)`)، درخواست‌دهنده، مسئول، قیمت تخمینی/نهایی
  - اگر `inquiry_id`: لینک به `/messages` (یا inquiry route موجود — fallback اگر وجود نداشت: عدم نمایش لینک)
  - اگر `status === 'purchased'` و `assigned_to === current user` → دکمه «آپلود رسید» (باز کردن Dialog با `PurchaseReceiptUploader`)
  - تعداد رسید (`receipt_count`)
- `**PurchaseStatusActions.tsx**`
  - props: `{ request: PurchaseRequest }`
  - فقط اگر کاربر admin/manager (`useUserRoles`) یا `assignee` — در غیر این صورت null
  - بر اساس `nextStatuses(status)` دکمه‌ها:
    - `pending` → «تأیید» (approved, آبی) + «رد» (cancelled, قرمز outline)
    - `approved` → «خرید انجام شد» (purchased) با فیلد `final_price` (number input لازم) + یادداشت اختیاری
    - `purchased` → «تحویل داده شد» (delivered)
  - هر دکمه → AlertDialog تأیید با Textarea یادداشت اختیاری → `useUpdatePurchaseStatus`
- `**PurchaseReceiptUploader.tsx**`
  - props: `{ requestId: string }`
  - drag&drop + input file (accept=`.jpg,.jpeg,.png,.pdf`)
  - اعتبارسنجی کلاینت، progress bar (state-based: idle/uploading/done/error)
  - زیر آن: لیست `usePurchaseReceipts(requestId)` — هر آیتم: نام فایل، اندازه، تاریخ، دکمه «دانلود» که با `getSignedReceiptUrl` لینک می‌سازد و `window.open` می‌کند

**۴. صفحات**

- `**src/routes/_app.purchase.tsx**` (`/purchase`)
  - `beforeLoad: requirePermission('purchases','view')` (همان ماژول موجود؛ تأیید می‌کنم در roles موجود است وگرنه fallback به guard ساده auth-only)
  - `PageHeader` با عنوان «فضای خرید»
  - Tabs: «درخواست‌های من» / «ارسال درخواست جدید»
    - تب اول: Select فیلتر وضعیت + لیست `PurchaseRequestCard` (grid mobile-first)، حالت‌های loading/empty/error فارسی
    - تب دوم: `PurchaseRequestForm` inline
- `**src/routes/_app.admin.purchase.tsx**` (`/admin/purchase`)
  - `beforeLoad: requireAnyRole(['admin','manager'])` (همان الگوی `_app.admin.penalties.tsx`)
  - بالا: ۴ کارت آماری (`usePurchaseStats`)
  - فیلترها: Select وضعیت + Input جست‌وجو با `useDebounce(300)`
  - جدول shadcn `Table` با ستون‌ها: محصول، تعداد، درخواست‌دهنده، مسئول، وضعیت (badge)، تاریخ، اقدامات
  - دکمه «مشاهده و اقدام» → Dialog شامل `PurchaseStatusActions` + `PurchaseReceiptUploader`
  - pagination ساده دستی (دکمه قبلی/بعدی، limit=20)

**۵. لینک سایدبار** — ویرایش `src/components/layout/nav-items.ts`

- `{ to: '/purchase', label: 'فضای خرید', icon: ShoppingCart, module: 'purchases', group: 'purchasing' }`
- `{ to: '/admin/purchase', label: 'مدیریت خرید', icon: ShoppingCart, module: 'purchases', group: 'admin', adminOnly: true }`
(دقت: آیکن‌های موجود؛ نیاز به import جدید نیست.)

### تأیید پیش از پیاده‌سازی

- ماژول `purchases` در `ModuleKey` و در `requirePermission` کفایت می‌کند یا یک ماژول جدید `purchase_requests` لازم است؟ پیش‌فرض: استفاده از `purchases` موجود.
- groupهای سایدبار: `purchasing` و `admin` موجودند ✓.

### تأیید Build/Type

پس از پیاده‌سازی: `tsgo --noEmit` + `npm run build` اجرا و نتیجه گزارش می‌شود.

### بدون تغییر

- migrationها
- دیتابیس
- اسکیمای موجود
- UI/routeهای دیگر  
ماژول `purchases` موجود کافیه — نیازی به ماژول جدید `purchase_requests` نیست. همان را استفاده کن.
  بقیه موارد تأیید است. build کن.
  
  