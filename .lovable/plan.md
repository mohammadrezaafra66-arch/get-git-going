# Phase 11.1 — مستندات فیش واریزی (Document Upload for Payment Receipts)

## Scope (strict)
- Only touches `PaymentReceiptForm.tsx` (create) and `_app.accounting.receipts.$receiptId.tsx` (view).
- No OCR, no AI extraction, no auto-detection of bank/date/payer, no auto accounting entries.
- No external paid APIs, no redesign of accounting.
- Existing receipt insert/approve/reject logic stays intact.

## What exists today
- Route: `/_app/accounting/receipts/create` → renders `PaymentReceiptForm`.
- Table `public.payment_receipts` with field `receipt_image_url text` (single URL textbox today). We keep it for backward compatibility but stop showing/using it in the form (replaced by the new multi-file uploader). Detail page keeps a fallback display for legacy rows.
- `audit_logs` table is already used by the form (`payment_receipt_created`, `duplicate_receipt_warning`, etc.).
- No Supabase Storage buckets exist yet. This will be the project's first bucket.
- Roles: `admin`, `manager`, `accountant`, `sales` (RLS on `payment_receipts` already restricts to admin/manager/accountant for select; sales does NOT currently see receipts, so docs follow the same rule).

## Database changes (single migration)

### 1. Storage bucket `payment-receipt-documents` (private)
```sql
insert into storage.buckets (id, name, public)
values ('payment-receipt-documents', 'payment-receipt-documents', false);
```

### 2. New table `public.payment_receipt_documents`
```
id              uuid pk default gen_random_uuid()
receipt_id      uuid not null references payment_receipts(id) on delete cascade
storage_path    text not null         -- object key inside the bucket
file_name       text not null
file_type       text not null         -- mime type
file_size       bigint not null       -- bytes
uploaded_by     uuid not null         -- profiles/auth user id
created_at      timestamptz not null default now()
```
Indexes: `(receipt_id)`, `(uploaded_by)`.

We store `storage_path` (not a public URL) because the bucket is private; the client generates short-lived signed URLs on demand.

### 3. RLS on `payment_receipt_documents`
Mirrors `payment_receipts` access exactly via the existing `has_role` function:

- **SELECT**: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant')`
- **INSERT**: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')` AND `uploaded_by = auth.uid()`
- **DELETE**: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant')`
- **UPDATE**: not allowed (documents are immutable; remove + re-upload).

Sales users intentionally cannot read these (they already cannot read `payment_receipts`). Public/anon: no policy → no access.

### 4. RLS on `storage.objects` for the new bucket
Restrict the bucket so only privileged roles can read/write its objects:

- SELECT/INSERT/DELETE policies scoped to `bucket_id = 'payment-receipt-documents'` AND `has_role(...)` (admin/manager/accountant for read; admin/accountant for write/delete).
- No public read.

## Frontend changes

### Files modified
1. **`src/shared/components/PaymentReceiptForm.tsx`**
   - Remove the `receipt_image_url` text input from the visible UI (keep field in schema as optional/empty for backward compat; do not send a value).
   - Add a new section titled **«مستندات فیش»** containing:
     - Drag-and-drop / click input. Labels: «آپلود تصویر یا فایل»، «فایل‌های مجاز: JPG, PNG, WEBP, PDF, TXT — حداکثر ۱۰ مگابایت برای هر فایل، حداکثر ۵ فایل».
     - Client-side validation (mime + size). Allowed mimes: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `text/plain`.
     - Local list of staged files with name, size, remove button. Files are uploaded only AFTER the receipt insert succeeds.
   - In `mutation.mutationFn`, after a successful `payment_receipts` insert (and before the success toast):
     1. For each staged file: upload to `payment-receipt-documents` at path `${receiptId}/${crypto.randomUUID()}-${safeName}` using `supabase.storage.from(...).upload(...)`.
     2. Insert one row into `payment_receipt_documents` per uploaded file.
     3. Insert one `audit_logs` row per file with `action: 'receipt_document_uploaded'`, `entity_type: 'payment_receipt'`, `entity_id: receiptId`, diff `{ document_id, file_name, file_type, file_size, storage_path }`.
   - On any per-file failure: show toast, but don't roll back the receipt (the user can re-attach from the detail page).

2. **`src/routes/_app.accounting.receipts.$receiptId.tsx`**
   - New section **«مستندات فیش»** below the existing details:
     - Lists rows from `payment_receipt_documents` for this receipt.
     - For each: show file name, size, type icon, and a button **«مشاهده مستندات»** that calls `supabase.storage.from('payment-receipt-documents').createSignedUrl(storage_path, 300)` and opens the URL in a new tab.
     - Image MIME types render a small thumbnail via signed URL.
     - For admin/accountant: a delete button that:
       1. Removes the storage object,
       2. Deletes the table row,
       3. Inserts an audit log with `action: 'receipt_document_removed'`.
   - Keep legacy `receipt.receipt_image_url` rendering as a fallback only when no `payment_receipt_documents` rows exist (so old data still works).

### Persian labels (verbatim)
- «مستندات فیش»
- «آپلود تصویر یا فایل»
- «فایل‌های مجاز: JPG, PNG, WEBP, PDF, TXT»
- «مشاهده مستندات»
- «حذف مستند»
- «هیچ مستندی پیوست نشده است»

## Audit log actions added
- `receipt_document_uploaded` — on each successful upload.
- `receipt_document_removed` — on delete from detail page.

Both use `entity_type = 'payment_receipt'`, `entity_id = receipt.id`.

## Out of scope (explicitly NOT doing now)
- OCR / text extraction from images or PDFs.
- Auto-creating accounting entries from documents.
- Auto-detecting bank, tracking number, date, payer, receiver.
- Migrating existing `receipt_image_url` rows into `payment_receipt_documents`.
- Any change to other pages (purchases, invoices, sales, etc.).

## Verification steps after implementation
1. `bunx tsc --noEmit`
2. `bun run build`
3. Manual: as accountant — create a receipt with 2 attachments → confirm files in bucket, rows in `payment_receipt_documents`, audit logs present, signed URLs open correctly. As sales — confirm no access (existing behavior unchanged).

## Expected deliverables
- 1 SQL migration (bucket + table + RLS on table + RLS on storage.objects scoped to bucket).
- 2 modified TSX files (form + detail page).
- Typecheck + build results reported back.
