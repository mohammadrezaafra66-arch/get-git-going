## Slice 10 — مرحله ۲: UI فضای بیجک و فاکتور

پیاده‌سازی فقط فرانت برای سیستم اسناد، با تکیه بر RPCها و bucket آماده در مرحله ۱ و الگوهای Slice 9.

### فایل‌های جدید

1. **`src/lib/documents/labels.ts`** — `DOCUMENT_TYPE_FA`, `DOCUMENT_STATUS_FA`, `DOCUMENT_STATUS_BADGE`, `toPersianDigits`.

2. **`src/hooks/documents/useDocuments.ts`** — React Query هوک‌ها:
   - `DocumentRow` type با همه فیلدهای RPC `get_documents`
   - `useMyDocuments(type?, status?)`, `useAllDocuments({type,status,search,limit,offset})`, `usePendingDocuments()` با `refetchInterval: 30_000`
   - `useCreateDocument()`: validate (jpg/jpeg/png/pdf، ≤ ۲۰MB) → upload `<type>/<crypto.randomUUID()>.<ext>` → RPC `create_document` → cleanup در صورت خطا
   - `useReviewDocument()`: RPC `review_document(p_document_id, p_decision, p_note)`
   - `getSignedDocumentUrl(path)` helper (۱ ساعت)

3. **`src/components/documents/`**:
   - **`DocumentUploadForm.tsx`** — نوع سند (Select)، Drag&drop + click file input، reference اختیاری (Popover با جست‌وجوی استعلام/درخواست خرید — استفاده از `useInquiries`/`useAllPurchaseRequests` موجود)، notes textarea، progress state، فقط برای accountant/admin/manager (با `useAuth().roles`)
   - **`DocumentCard.tsx`** — نوع/نام/حجم/تاریخ شمسی، badge وضعیت، countdown bar برای `pending_review` با interval ۳۰s (سبز→کهربایی @5min→قرمز @2min)، دکمه دانلود (signed URL در window.open)، اطلاعات تأیید/رد
   - **`DocumentReviewActions.tsx`** — فقط admin/manager، دو دکمه «آمد ✓»/«نیامد ✗» با AlertDialog + Textarea یادداشت
   - **`PendingDocumentsPanel.tsx`** — لیست با `usePendingDocuments` مرتب صعودی بر `review_deadline`، skeleton/empty فارسی

4. **`src/routes/_app.documents.tsx`** (`/documents`):
   - `beforeLoad: requireAnyRole(ALL_ROLES)` — فقط احراز هویت
   - Tabs: «اسناد من» (فیلتر نوع + وضعیت + DocumentCard grid)، «آپلود سند جدید» (شرطی بر نقش)، و در صورت admin/manager تب «در انتظار تأیید» با `PendingDocumentsPanel`

5. **`src/routes/_app.admin.documents.tsx`** (`/admin/documents`):
   - `beforeLoad: requireAnyRole(['admin','manager'])`
   - ۴ کارت آمار (pending/confirmed امروز/rejected/expired) با `select count head:true`
   - فیلترهای Select نوع + Select وضعیت + Input جست‌وجو با `useDebounce(300)`
   - shadcn `Table` با ستون‌ها، pagination ساده (limit 20)
   - Dialog «بررسی»: `DocumentCard` + `DocumentReviewActions`

6. **ویرایش `src/components/layout/nav-items.ts`** — دو آیتم `/documents` (icon `FileText`, group `main`) و `/admin/documents` (group `admin`, `adminOnly: true`). الگوی دقیق مطابق آیتم‌های Slice 9.

### نکات فنی
- تاریخ شمسی با `formatJalaliDateTime` از `@/lib/messenger/format`
- countdown: `Math.max(0, new Date(review_deadline).getTime() - Date.now())` + `setInterval(..., 30_000)` و cleanup
- بدون وابستگی جدید، TypeScript strict، RTL، mobile-first
- toast فارسی با `sonner`
- بعد از پیاده‌سازی: `tsgo --noEmit` و `npm run build`

### خارج از scope
- بدون migration، بدون تغییر RPC، بدون تغییر hookهای Slice 9.
