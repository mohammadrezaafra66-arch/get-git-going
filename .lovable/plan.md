# Phase 18.1 — لایه داده خواندنی برای مطالبات و بدهی‌ها

فقط یک migration امن و idempotent اضافه می‌شود. هیچ UI، route، component، workflow، جدول جدید، تغییر داده، یا تغییر business logic در این فاز انجام نمی‌شود.

## یافته‌های Inspection (تأیید schema واقعی)

- `invoices`: دارد `id, number, customer_id, status (text), invoice_type (text), issue_date, due_date, total_amount, deposit_amount, commitment_confirmed (bool), created_at`. شماره فاکتور = `number` (نه `invoice_number`).
- `payment_receipts.status` (text): مقدار مشاهده‌شده فعلاً فقط `pending_review`. هیچ enum سفت‌وسختی نیست؛ مقادیر معتبر برای کسر مانده طبق پیش‌فرض پروژه: `approved`, `verified`, `confirmed`, `posted` (هر مقداری که موجود نباشد به‌سادگی صفر می‌شود). `posting_status` و `posted_at` هم وجود دارند ولی برای حداقلی بودن، فقط بر `status` تکیه می‌کنیم و در migration comment ذکر می‌شود که در صورت نهایی شدن سیاست posting، می‌توان شرط را گسترش داد.
- `payment_receipt_links`: `receipt_id, invoice_id, amount` — منبع اتصال پرداخت‌ها به فاکتور.
- `purchases`: دارد `supplier_id, purchase_date, payment_term_id, cash_price, cash_price_currency, total_amount, currency, paid_at, paid_by, status`. **پرداخت جزئی خرید مدل نشده** — outstanding برای رکورد پرداخت‌نشده = `coalesce(cash_price, total_amount)` و در صورت `paid_at not null` صفر.
- `payment_terms.days` موجود است.
- `vw_purchase_float` موجود است؛ آن را تغییر نمی‌دهیم و دست‌نخورده می‌ماند.
- روال موجود برای محافظت: نقش‌های مالی `admin | manager | accountant` با `has_role` / `has_any_role`.

## فایل تغییر یافته

- ساخت یک فایل migration جدید: `supabase/migrations/2026XXXXXXXXXX_phase_18_1_commitments_data_layer.sql`

هیچ فایل دیگری (UI، routes، types، components) تغییر نمی‌کند. `types.ts` به‌صورت خودکار توسط Supabase به‌روزرسانی می‌شود.

## محتوای migration

تمام دستورات `CREATE OR REPLACE` و `CREATE INDEX IF NOT EXISTS` (idempotent، non-destructive).

### 1) View: `public.vw_customer_receivables`
- `WITH (security_invoker = true)` تا RLS جداول پایه رعایت شود.
- منابع: `invoices i` LEFT JOIN aggregate از `payment_receipt_links prl` JOIN `payment_receipts pr` که `pr.status IN ('approved','verified','confirmed','posted')`، LEFT JOIN `customers c`.
- شرط: `i.commitment_confirmed = true` و `i.status <> 'cancelled'` (در صورت وجود؛ در غیر این صورت بی‌اثر است).
- ستون‌ها: `customer_id, customer_name, invoice_id, invoice_number (= i.number), invoice_type, invoice_status, due_date, total_amount, deposit_amount, confirmed_paid_amount, outstanding_amount = greatest(total_amount - coalesce(deposit_amount,0) - coalesce(confirmed_paid_amount,0), 0), commitment_confirmed, days_until_due = (due_date - current_date), is_overdue = (due_date is not null and due_date < current_date and outstanding > 0), created_at`.
- فیلتر نهایی: `outstanding_amount > 0`.

### 2) View: `public.vw_supplier_payables`
- `WITH (security_invoker = true)`.
- منابع: `purchases p` LEFT JOIN `suppliers s` LEFT JOIN `payment_terms pt`.
- ستون‌ها: `supplier_id, supplier_name, purchase_id, purchase_date, payment_term_days = pt.days, due_date = case when pt.days is not null then p.purchase_date + pt.days * interval '1 day' else p.purchase_date end, purchase_total_amount = p.total_amount, cash_price, currency = coalesce(cash_price_currency, currency), paid_at, is_paid = (paid_at is not null), outstanding_amount = case when paid_at is not null then 0 else coalesce(cash_price, total_amount, 0) end, days_until_due, is_overdue, product_summary = NULL::text (در این فاز خالی می‌ماند تا join سنگین نشود؛ در فاز UI قابل افزودن), created_at`.
- بدون تبدیل ارز — `currency` حفظ می‌شود.

### 3) RPCها (SECURITY DEFINER، `SET search_path = public`، با گارد نقش)
هر دو فقط برای نقش‌های `admin | manager | accountant`:

```sql
if not public.has_any_role(auth.uid(), array['admin','manager','accountant']::app_role[]) then
  raise exception 'forbidden' using errcode = '42501';
end if;
```
(در صورت نبود `has_any_role` در پروژه، از سه فراخوانی `has_role` استفاده می‌شود — در زمان نوشتن migration بررسی و انتخاب می‌شود.)

- `public.get_receivables_summary(p_from_date date default null, p_to_date date default null, p_customer_id uuid default null)` → `TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint)` — صرفاً aggregate روی `vw_customer_receivables`. بدون لیست، پس pagination لازم نیست.
- `public.get_payables_summary(p_from_date date default null, p_to_date date default null, p_supplier_id uuid default null)` → ساختار مشابه روی `vw_supplier_payables`.

Permissions:
```sql
revoke all on function ... from public, anon;
grant execute on function ... to authenticated;
```
کنترل واقعی نقش داخل بدنه function انجام می‌شود (مطابق الگوی پروژه).

### 4) ایندکس‌های idempotent (فقط در صورت نبود)
- `idx_invoices_customer_due (customer_id, due_date)`
- `idx_invoices_commitment_due (commitment_confirmed, due_date) WHERE commitment_confirmed = true`
- `idx_prl_invoice (invoice_id)` روی `payment_receipt_links`
- `idx_payment_receipts_status (status)`
- `idx_purchases_supplier_paid (supplier_id, paid_at)`
- `idx_purchases_payment_term (payment_term_id)`
- `idx_purchases_purchase_date (purchase_date)`

همه با `CREATE INDEX IF NOT EXISTS` — اگر معادل آن‌ها قبلاً موجود باشد، نام تکراری نخواهد ساخت (نام‌ها منحصربه‌فرد و prefix‌دار).

### 5) Comment در migration
- توضیح: read-only؛ پرداخت جزئی خرید هنوز مدل نشده؛ تبدیل ارز انجام نمی‌شود؛ statusهای پرداخت معتبر در فاز بعد قابل تنظیم؛ audit log در این فاز لازم نیست.

## Validation

- migration idempotent و non-destructive.
- بدون تغییر داده.
- بدون secret/env/CDN جدید.
- security_invoker روی viewها تضمین رعایت RLS موجود.
- RPC با گارد نقش backend-side.
- بدون تغییر در UI، routes، یا types دستی.

## Self-Host Acceptance Check (پیش‌بینی)

- External critical dependency added? **no**
- Feature flag required? **no**
- Manual fallback exists? **yes** (queryهای موجود دست‌نخورده)
- Secrets safe? **yes**
- Client bundle secret-free? **yes**
- Docker/Linux compatibility affected? **no**
- Supabase/RLS/RBAC affected? **yes** — view با security_invoker، RPC با role guard
- Audit log required? **no** (read-only)
- Backup/restore affected? **yes** — فایل migration جدید در `supabase/migrations/`
- Performance risk? **low** — viewها سبک، indexهای پیشنهادی در صورت نبود اضافه می‌شوند
- TypeScript/build passed? **not required** (types.ts خودکار تولید می‌شود)
- Ready for GitHub sync? **yes**
