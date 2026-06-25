## Slice 11-B — مرحله ۲: UI رسید تحویل و بیجک باربری

فقط لایه فرانت. ساختار به‌صورت مستقیم از الگوی Slice 10 (`documents/`) کپی می‌شود، با تفاوت‌های RPC/bucket. هیچ migration یا تغییر RPC در این مرحله نیست.

### فایل‌های جدید

1. **`src/lib/delivery-receipts/labels.ts`**
   - `DELIVERY_RECEIPT_TYPE_FA`، `DELIVERY_RECEIPT_STATUS_FA`، `DELIVERY_RECEIPT_STATUS_BADGE` با کلیدهای دقیقاً مطابق پرامپت.
   - helperهای `deliveryReceiptTypeLabel`، `deliveryReceiptStatusLabel`، `deliveryReceiptStatusBadgeClass`.
   - استفاده از `toPersianDigits` و `formatFileSize` موجود در `@/lib/documents/labels` (re-export یا import) — برای جلوگیری از تکرار.

2. **`src/hooks/delivery-receipts/useDeliveryReceipts.ts`**
   - تایپ `DeliveryReceiptRow` با همان شکل خروجی RPC `get_delivery_receipts`.
   - `useMyDeliveryReceipts(type?, status?)` → فیلتر `uploaded_by=auth.uid()` (سمت RLS لحاظ می‌شود)، `staleTime: 30_000`.
   - `useAllDeliveryReceipts({ type, status, invoice_id, limit, offset })` → همان RPC.
   - `usePendingDeliveryReceipts()` → `status='pending_review'`، `refetchInterval: 30_000`.
   - `useCreateDeliveryReceipt()` → mutation:
     - validate: mime ∈ {jpg, jpeg, png, pdf}، size ≤ 20MB، پیام خطای فارسی.
     - upload: `supabase.storage.from('delivery-receipts').upload('<type>/<uuid>.<ext>', file, { upsert: false })`.
     - فراخوانی RPC `create_delivery_receipt` با `storage_path`، `file_name`، `file_size`، `mime_type`، `invoice_id?`، `customer_id?`، `notes?`.
     - onSuccess: invalidate queryهای `['delivery-receipts', ...]` + toast سبز «رسید با موفقیت آپلود شد».
     - onError: toast فارسی، بدون نمایش raw error.
   - `useReviewDeliveryReceipt()` → mutation با RPC `review_delivery_receipt(p_receipt_id, p_decision, p_note)` + invalidate + toast.
   - `getSignedDeliveryReceiptUrl(path)`: `createSignedUrl(path, 3600)`، خطای فارسی.

3. **`src/components/delivery-receipts/DeliveryReceiptUploadForm.tsx`**
   - props: `{ onSuccess?: () => void; defaultInvoiceId?: string; defaultCustomerId?: string }`.
   - فیلدها: Select نوع، input فایل (drag&drop + click)، Popover جست‌وجوی فاکتور (روی `invoices`، فیلد `number` و `id`)، Popover جست‌وجوی مشتری (روی `customers`، فیلد `name`)، textarea توضیحات.
   - progress bar داخلی برای حالت‌های idle/uploading/done/error.
   - نمایش تایمر مجاز با خواندن از `useWorkflowSettings()` (موجود از Slice 11-A) و `formatMinutes`: «مهلت تأیید: …».
   - گارد UI: فقط برای admin/manager/sales — استفاده از `useAuth` و `hasAnyRole`. غیر از این، پیام «دسترسی ندارید».
   - submit → `useCreateDeliveryReceipt`.

4. **`src/components/delivery-receipts/DeliveryReceiptCard.tsx`**
   - نمایش: نوع فارسی، نام فایل، حجم با `formatFileSize`، تاریخ شمسی آپلود با `formatJalaliDateTime`، badge وضعیت.
   - اگر `pending_review`: نوار countdown با `Math.max(0, deadline - now)`، re-render هر ۳۰ ثانیه با `setInterval`؛ رنگ‌بندی سبز → کهربایی (≤۳۰ دقیقه) → قرمز (≤۱۰ دقیقه).
   - دکمه دانلود → `getSignedDeliveryReceiptUrl` + `window.open(url, '_blank', 'noopener')`.
   - اگر `invoice_id`: واکشی شماره فاکتور با React Query کوچک (queryKey مبتنی بر id، staleTime بالا) از `invoices.number`.
   - اگر `customer_id`: واکشی نام مشتری از `customers.name` به همین شیوه.
   - وضعیت‌ها: confirmed = آیکن تیک سبز + نام `reviewer_name` + تاریخ شمسی؛ rejected = آیکن ضربدر قرمز + `notes`.

5. **`src/components/delivery-receipts/DeliveryReceiptReviewActions.tsx`**
   - گارد UI روی admin/manager/sales، نمایش فقط در `pending_review`.
   - دو دکمه «تأیید ✓» (سبز) و «رد ✗» (قرمز outline)، هر کدام `AlertDialog` با Textarea یادداشت اختیاری → `useReviewDeliveryReceipt`.

6. **`src/components/delivery-receipts/PendingDeliveryReceiptsPanel.tsx`**
   - `usePendingDeliveryReceipts()` + مرتب‌سازی صعودی بر اساس `review_deadline` در کلاینت.
   - رندر `DeliveryReceiptCard` + `DeliveryReceiptReviewActions`.
   - حالت‌های loading (skeleton)، empty («هیچ رسیدی در انتظار تأیید نیست»)، error (پیام فارسی).

### Routeها

7. **`src/routes/_app.delivery-receipts.tsx`** → `/delivery-receipts`
   - بدون gate نقش (فقط authentication از `_app`).
   - `PageHeader` «رسیدهای تحویل».
   - `Tabs`:
     - «رسیدهای من»: Select نوع + Select وضعیت + لیست `DeliveryReceiptCard` با `useMyDeliveryReceipts`.
     - «آپلود رسید جدید»: فقط برای admin/manager/sales؛ در غیر این صورت پیام «دسترسی ندارید».
     - «در انتظار تأیید»: فقط برای admin/manager/sales (تب با شرط نمایش)، شامل `PendingDeliveryReceiptsPanel`.

8. **`src/routes/_app.admin.delivery-receipts.tsx`** → `/admin/delivery-receipts`
   - `beforeLoad: requireAnyRole(['admin','manager'])`.
   - `PageHeader` «مدیریت رسیدهای تحویل».
   - ۴ کارت آمار بالا با یک hook کوچک محلی که از همان `get_delivery_receipts` می‌خواند یا با شمارش روی نتیجهٔ صفحهٔ جاری: «در انتظار / تأیید شده امروز / رد شده / منقضی شده». (برای سادگی: ۴ کوئری مستقل با `count: 'exact', head: true` روی جدول `delivery_receipts` با فیلتر مناسب — تحت RLS مدیر کل را می‌بیند.)
   - فیلترها: Select نوع، Select وضعیت، Input جست‌وجوی نام فایل با `useDebounce(300)` — جست‌وجوی فعلی RPC پارامتر search ندارد، بنابراین فیلتر نام فایل سمت کلاینت روی صفحهٔ جاری انجام می‌شود (با توضیح در inline comment، بدون تغییر RPC).
   - جدول دسکتاپ + کارت موبایل با همان `DeliveryReceiptCard` (variant compact از طریق prop ساده اگر لازم بود؛ در غیر این صورت همان کارت).
   - دکمه «بررسی» → `Dialog` با کارت کامل + `DeliveryReceiptReviewActions`.
   - pagination ساده (`limit=20`, دکمه‌های قبلی/بعدی).

### فایل ویرایش‌شده

9. **`src/components/layout/nav-items.ts`**
   - افزودن آیتم در `group: 'main'`:
     ```
     { to: '/delivery-receipts', label: 'رسیدهای تحویل', icon: FileCheck,
       module: 'dashboard', group: 'main' }
     ```
   - افزودن آیتم در `group: 'admin'`, `subgroup: 'adm-tools'`:
     ```
     { to: '/admin/delivery-receipts', label: 'مدیریت رسیدها', icon: FileCheck,
       module: 'roles', group: 'admin', subgroup: 'adm-tools', adminOnly: true }
     ```
   - اضافه‌کردن `FileCheck` به فهرست importهای lucide.

### رعایت قواعد پروژه

- RTL، mobile-first، فارسی، بدون متن خام انگلیسی.
- TypeScript strict، بدون `any` (تایپ explicit برای خروجی RPC و فیلترها).
- بدون وابستگی جدید (همه از shadcn موجود + sonner + lucide).
- بدون CDN/فونت آنلاین.
- RBAC دفاع لایه‌ای: route با `requireAnyRole`، گاردهای UI، و RLS/RPC در DB.
- ممیزی: `create_delivery_receipt` و `review_delivery_receipt` در Slice 11-B Phase 1 خودشان به `audit_logs` می‌نویسند — کاری لازم نیست.
- بدون migration، بدون تغییر RPC، بدون تغییر سایر hookها/صفحات.

### وارسی پایان کار

- `tsgo --noEmit`
- `npm run build`
- اگر `lint` در پروژه موجود نبود، صراحتاً گزارش می‌شود.
- مسیر تست دستی:
  1. لاگین به‌عنوان sales → `/delivery-receipts` → تب «آپلود رسید جدید» → آپلود یک PDF کوچک با نوع «بیجک باربری» → toast سبز.
  2. لاگین به‌عنوان admin → `/admin/delivery-receipts` → دیدن آیتم بالا → دکمه «بررسی» → «تأیید» → toast + تغییر وضعیت + ثبت در `audit_logs` و `delivery_receipt_status_history`.
  3. آپلود رسید دیگر و عدم بررسی → پس از انقضای deadline و اجرای `tick_inquiries` → وضعیت `expired` + اعلان + (در صورت `penalty_enabled`) کارت قرمز.
