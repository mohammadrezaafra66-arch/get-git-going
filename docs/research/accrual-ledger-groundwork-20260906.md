# دفتر تعهدی — پژوهش زمینه (Question A)

اندازه‌گیری **۲۰۲۶-۰۹-۰۶** · سرور تست `192.168.170.8` · شاخه `staging` @ `a4338604`
· پایگاه‌داده `afrakala` روی کانتینر `afrakala-lan-db`
· **به `192.168.170.10` وصل نشدم، ping نکردم، نامش را resolve نکردم.**

**فقط خواندنی.** هر پرس‌وجو با `PGOPTIONS="-c default_transaction_read_only=on"` اجرا شد.
**هیچ تابعی فراخوانی نشد** — هیچ `SELECT fn(...)`؛ همهٔ توابع فقط با `pg_get_functiondef`،
`pg_policies`، `proacl` و `pg_trigger` خوانده شدند. هیچ Playwright، هیچ e2e، هیچ مرورگر.
**هیچ نام، مبلغ، تلفن یا داده‌ٔ واقعی مشتری در این سند نیست؛ فقط نام ستون و شمارش.**

برچسب‌ها: **[E]** اندازه‌گیری‌شده اینجا · **[P]** کار قبلی با ارجاع · **[U]** تصمیم مالک
· **[?]** نامعلوم

---

## Verdict — یک پاراگراف

**دفتر روزنامهٔ دوطرفه از قبل وجود دارد، کامل و سخت‌گیر است، و امروز صددرصد نقدی است.**
`journal_entries` (۴۷ ردیف) + `journal_lines` (۹۴ ردیف) با تراز اجباری، تغییرناپذیری
(`trg_journal_entry_immutable`)، اعتبارسنجی ارجاع هر سطر، شمارهٔ سند، RLS مالی، و
`reverse_document` که سند برگشتی می‌زند — همه زنده و کارکرده. [E] چیزی که **نیست**، سه چیز است و
هر سه سدِ سختِ D-25..D-32 اند: **(۱) هیچ سند تعهدی وجود ندارد** —
`journal_entries_doc_kind_chk` فقط شش مقدار `receipt/payment/dual/purchase_payment/settlement/other`
را می‌پذیرد و هیچ‌کدام «فروش» یا «خرید» نیست؛ هر ۴۷ سند از یک *جابه‌جایی پول* زاده شده‌اند، نه از
یک *تعهد*. **(۲) هیچ کدینگ حساب (chart of accounts) وجود ندارد** — در ۲۲۴ جدول، تنها چیزی که
شکل «حساب» دارد `asan_control_accounts` است با **یک ردیف** (`invoice_ar` = کد آسان `989`) و
بقیه فقط ستون متنیِ `accounting_code` روی مشتری/تأمین‌کننده/بانک است — یعنی کدها **همان کدهای
آسان‌اند**، که مستقیماً با D-30 («کدینگ مستقل از آسان») در تضاد است. **(۳) D-29 امروز غیرممکن
است**: `sales_quotes_validate_status` صریحاً `accepted` را یک **حالت نهایی** اعلام می‌کند و لغو
پس از پذیرش را با استثنا رد می‌کند، و `reverse_document` فقط `receipt|payment|dual` را می‌پذیرد.
در مقابل، **نقاط اتصال D-26 و D-27 هر دو دقیقاً یک خط‌اند و از قبل ثابت شده‌اند** —
`update_sales_quote_status` خطوط ۱۲۷–۱۲۹ (که همین حالا روی «پذیرش» یک `PERFORM` اضافه می‌زند) و
`create_purchase` خط ۳۲۶ (تنها `INSERT INTO public.purchases` در کل پایگاه‌داده). و برای D-32
مکانیزم آماده است: `notification_queue` (۱٬۶۹۲ ردیف زنده، زنگ اپ رویش سوار است) به‌علاوهٔ الگوی
پخش‌به‌حسابداران در `notify_accountants_on_sale_price_change`، و **cron میزبان** — چون
`pg_cron` روی این پایگاه‌داده **نصب نیست** [E].

---

## آنچه از قبل وجود دارد — با اثبات

### ۱. دفتر روزنامه — نام واقعی: `journal_entries` / `journal_lines`

کشف نام (نه فرض):

```sql
select c.relkind::text||' '||c.relname from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v','m')
   and c.relname ~* '(journal|ledger|account|voucher|posting|entry|entries|coa|chart|asan)'
 order by c.relname;
```
```
r asan_control_accounts        r bank_accounts            r capital_allocation_ledger
r customer_credit_ledger       r journal_entries          r journal_lines
r payment_vouchers             v vw_account_balances      r asan_export_numbers
r asan_import_batches          r asan_import_person_rows  r asan_import_product_rows
r daily_mood_entries
```

**«سند» یعنی چه:** یک ردیف `journal_entries`. ستون‌هایش (از `information_schema.columns`):

```
id, source_type, source_id, entry_date, description, status, posted_by, posted_at,
created_at, payer_accounting_code, receiver_accounting_code, doc_kind, reverses_entry_id
```

**«سطر» یعنی چه:** یک ردیف `journal_lines`:

```
id, journal_entry_id, line_no, account_kind, account_ref_id, description, debit, credit, created_at
```

قیدهای زنده (`pg_constraint`) — این‌ها چارچوبِ سختِ هر ساختِ آینده‌اند:

```
journal_entries_doc_kind_chk  CHECK (doc_kind = ANY (ARRAY['receipt','payment','dual',
                                    'purchase_payment','settlement','other']))
journal_entries_status_chk    CHECK (status = ANY (ARRAY['draft','posted','void']))
journal_entries_source_unique UNIQUE (source_type, source_id)
journal_lines_account_kind_chk CHECK (account_kind = ANY (ARRAY['customer_credit','bank',
       'external_party','invoice_ar','clearing','other','supplier_payable',
       'cheque_receivable','cheque_payable']))
journal_lines_one_side  CHECK ((NOT (debit>0 AND credit>0)) AND (NOT (debit=0 AND credit=0)))
journal_lines_credit_nonneg / journal_lines_debit_nonneg  CHECK (>= 0)
```

**نگهبانان زنده** (`pg_trigger`، ۴ تریگر، همه غیرداخلی):

```
trg_journal_entry_immutable   BEFORE DELETE OR UPDATE ON journal_entries  FOR EACH ROW
trg_journal_line_immutable    BEFORE DELETE OR UPDATE ON journal_lines    FOR EACH ROW
trg_validate_journal_line_ref BEFORE INSERT OR UPDATE OF account_kind, account_ref_id ON journal_lines
trg_asan_burn_journal_entry_number AFTER DELETE ON journal_entries
```

بدنهٔ `tg_journal_entry_immutable`، کامل:
```sql
IF OLD.status = 'posted' THEN
  RAISE EXCEPTION 'سند ثبت‌شده قابل تغییر نیست؛ برای اصلاح، سند برگشتی بزنید'
    USING ERRCODE = 'P0001';
END IF;
```
— یعنی **دفتر فقط افزودنی است**؛ اصلاح فقط از راه سند برگشتی. این دقیقاً همان چیزی است که D-29
می‌خواهد، ولی امروز فقط برای سه نوع سند کار می‌کند (پایین).

`validate_journal_line_ref` نگاشت `account_kind` → جدول مقصد را اجبار می‌کند:
```sql
_targets := CASE NEW.account_kind
  WHEN 'customer_credit'   THEN ARRAY['customers']
  WHEN 'bank'              THEN ARRAY['bank_accounts']
  WHEN 'external_party'    THEN ARRAY['external_parties']
  WHEN 'supplier_payable'  THEN ARRAY['suppliers']
  WHEN 'cheque_receivable' THEN ARRAY['customers', 'external_parties']
  WHEN 'cheque_payable'    THEN ARRAY['suppliers', 'external_parties']
  ELSE NULL          -- invoice_ar / clearing / other: control accounts, nothing to check
END;
```
— `pg_get_functiondef(validate_journal_line_ref)` خطوط ۳۷–۴۵.
**نتیجهٔ مهم:** یک سطر تعهدی روی `customer_credit`/`supplier_payable` بدون هیچ مهاجرتی از این
نگهبان رد می‌شود؛ سه نوعِ کنترلی هم اصلاً بررسی نمی‌شوند.

**RLS** (`pg_policies`، هر دو جدول یکسان):
```
viewer_restricted                ALL    {authenticated}  NOT is_viewer_only(auth.uid())
journal_entries_select_finance   SELECT {authenticated}  admin OR manager OR accountant
journal_lines_select_finance     SELECT {authenticated}  admin OR manager OR accountant
```
**هیچ policy برای INSERT/UPDATE/DELETE وجود ندارد** — نوشتن فقط از راه توابع `SECURITY DEFINER`.

**ایندکس‌ها** (`pg_indexes`): `entry_date`، `(source_type, source_id)` (یکتا)،
`reverses_entry_id` (یکتای جزئی)، و روی سطرها `(account_kind, account_ref_id)` و
`journal_entry_id`. اندازهٔ کل: `journal_entries` ۱۶۰ kB، `journal_lines` ۱۲۸ kB. [E]

### ۲. حجم و انواع سند امروز — همه نقدی

```sql
select 'journal_entries' t, count(*) from journal_entries
union all select 'journal_lines', count(*) from journal_lines
union all select 'asan_control_accounts', count(*) from asan_control_accounts
union all select 'bank_accounts', count(*) from bank_accounts;
--> journal_entries 47 | journal_lines 94 | asan_control_accounts 1 | bank_accounts 2

select doc_kind, source_type, status, count(*), min(entry_date), max(entry_date)
  from journal_entries group by 1,2,3 order by 1,2,3;
```
```
 doc_kind |   source_type   | status | count |    min     |    max
----------+-----------------+--------+-------+------------+------------
 dual     | dual_document   | posted |     8 | 2026-08-20 | 2026-09-05
 other    | manual          | posted |     2 | 2026-07-20 | 2026-07-22
 payment  | payment_voucher | posted |    12 | 2026-08-20 | 2026-08-31
 receipt  | payment_receipt | posted |    25 | 2026-07-25 | 2026-09-05
```

**هر ۴۷ سند از یک جابه‌جایی پول زاده شده است.** بازهٔ تاریخ: ۲۰۲۶-۰۷-۲۰ تا ۲۰۲۶-۰۹-۰۵.
هیچ سندی با `status='draft'` یا `'void'` وجود ندارد، و هیچ سندی بدون سطر نیست:
```sql
select count(*) from journal_entries je
 where not exists (select 1 from journal_lines jl where jl.journal_entry_id=je.id);  --> 0
```

توزیع سطرها و **قرارداد علامت** (این برای طراحی تعهدی حیاتی است):
```sql
select je.doc_kind, jl.account_kind,
       count(*) filter (where jl.debit>0) dr, count(*) filter (where jl.credit>0) cr
  from journal_lines jl join journal_entries je on je.id=jl.journal_entry_id
 group by 1,2 order by 1,2;
```
```
 doc_kind |   account_kind    | dr | cr
----------+-------------------+----+----
 dual     | customer_credit   |  7 |  8
 dual     | supplier_payable  |  1 |  0
 other    | bank              |  1 |  1
 other    | customer_credit   |  1 |  1
 payment  | bank              |  0 | 10
 payment  | cheque_receivable |  0 |  2
 payment  | customer_credit   | 12 |  0
 receipt  | bank              | 19 |  2
 receipt  | cheque_receivable |  4 |  0
 receipt  | customer_credit   |  2 | 23
```

و سه نوع حساب کنترلی هرگز استفاده نشده‌اند:
```sql
select coalesce(string_agg(distinct account_kind,','),'(none)') from journal_lines
 where account_kind in ('invoice_ar','clearing','other');   --> (none)
```

### ۳. `reverse_document` — بدنه، نقل‌قول مستقیم

امضا: `reverse_document(p_doc_kind text, p_source_id uuid, p_reason text) RETURNS uuid`،
`LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`.
`proacl`: `authenticated=X`, `service_role=X`, `postgres=X`, `supabase_admin=X`.

آنچه دقیقاً می‌کند، به ترتیب بدنه:

```sql
IF _reason IS NULL THEN
  RAISE EXCEPTION 'ثبت دلیل برگشت سند الزامی است' USING ERRCODE = '22023';
END IF;

IF _kind NOT IN ('receipt', 'payment', 'dual') THEN
  RAISE EXCEPTION 'نوع سند برای برگشت معتبر نیست' USING ERRCODE = '22023';
END IF;

-- OG-22 interim: accountant and admin only. Manager excluded. Revisit in the
-- dedicated access-control phase — this is not the final permission model.
IF NOT public.has_any_role(_uid,
      ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
  RAISE EXCEPTION 'اجازهٔ برگشت زدن سند را ندارید' USING ERRCODE = '42501';
END IF;
```

سپس سند اصلی را با `FOR UPDATE` قفل می‌کند، دوباره‌برگشت‌زدن را رد می‌کند
(`IF EXISTS (... WHERE je.reverses_entry_id = _orig_entry_id) THEN RAISE`)، یک شمارهٔ سند تازه
می‌گیرد (`assign_document_number`)، سند برگشتی می‌سازد با **کدهای حسابداری جابه‌جاشده**:

```sql
INSERT INTO public.journal_entries (
  doc_kind, source_type, source_id, entry_date, description,
  status, posted_by, payer_accounting_code, receiver_accounting_code, reverses_entry_id
) VALUES (
  _orig_doc_kind, _source_type, _rev_source_id, public.tehran_today(),
  'سند برگشتی شمارهٔ ' || _rev_number || ' بابت ' || coalesce(_orig_number, 'سند اصلی'),
  'posted', _uid, _receiver_code, _payer_code,      -- ← جابه‌جا
  _orig_entry_id
) RETURNING id INTO _rev_entry_id;
```

و سطرها را **با بدهکار/بستانکارِ معکوس** کپی می‌کند:

```sql
INSERT INTO public.journal_lines (
  journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
SELECT _rev_entry_id, jl.line_no, jl.account_kind, jl.account_ref_id,
       jl.credit, jl.debit, jl.description          -- ← معکوس
  FROM public.journal_lines jl
 WHERE jl.journal_entry_id = _orig_entry_id
 ORDER BY jl.line_no;
```

سپس تراز را دوباره اثبات می‌کند (`IF _debit_total <> _credit_total OR _debit_total <> _amount`)،
و برای فیشِ دریافت **اعتبار مشتری را پس می‌گیرد**: `_ensure_credit_balance` →
`UPDATE customer_credit_balance SET available_credit = _new_available` → یک ردیف
`customer_credit_ledger` با `reference_type='receipt_reversal'` → `DELETE FROM
payment_receipt_links WHERE receipt_id = p_source_id`. در پایان `reversed_at / reversed_by /
reversal_reason / reversal_journal_entry_id / reversal_document_number` روی سند مبدأ نوشته
می‌شود و **یک ردیف `audit_logs` با `action='document_reversed'`** ثبت می‌شود.

**حکم برای D-29: الگو کامل است، ولی دامنه‌اش سه نوع سند است.** یک پیش‌فاکتور یا یک خرید امروز
اصلاً به این تابع راه ندارد. ضمناً `document_numbers_doc_type_check` هم فقط
`ARRAY['receipt','payment','dual']` را می‌پذیرد (۷۵ + ۶۳ + ۵۹ ردیف) — پس شمارهٔ سند هم برای یک
سند تعهدی وجود ندارد.

### ۴. `notification_queue` — مکانیزم اعلانِ آمادهٔ D-32

```
id, user_id (NOT NULL), title, body, type (default 'stock_alert'),
reference_type, reference_id, is_read (default false), read_at, created_at
```
```sql
select count(*) total, count(*) filter (where read_at is null) as unread from notification_queue;
--> 1692 | 1692
select type, count(*) from notification_queue group by 1;   --> sale_price_change 1692
```

مصرف‌کنندهٔ زنده دارد: `src/shared/components/NotificationBell.tsx:46` و
`src/routes/_app.notifications.tsx:52` و `src/shared/components/QuoteRejectionNoticeDialog.tsx:37`.

و **الگوی پخش به حسابداران از قبل نوشته شده است** —
`pg_get_functiondef(notify_accountants_on_sale_price_change)` خطوط ۴۳–۵۲:

```sql
FOR r_recipient IN
  SELECT DISTINCT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role::text = 'accountant'
LOOP
  INSERT INTO public.notification_queue
    (user_id, title, body, type, reference_type, reference_id)
  VALUES
    (r_recipient.user_id, v_title, v_body, 'sale_price_change', 'product', NEW.product_id);
END LOOP;
```

چهار تابع در پایگاه‌داده در این صف می‌نویسند: `generate_birthday_notifications`،
`notify_accountants_on_sale_price_change`، `notify_on_stock_available`،
`update_sales_quote_status`. تعداد حسابداران امروز: **۳** (`user_roles`). [E]

### ۵. زمان‌بندی روزانه — الگوی ثابت‌شده: cron میزبان + endpoint توکن‌دار

```sql
select extname||' '||extversion from pg_extension order by 1;
--> btree_gist 1.7 | pg_graphql 1.5.7 | pg_stat_statements 1.10 | pg_trgm 1.6 | pgcrypto 1.3
--> pgjwt 0.2.0 | pgsodium 3.1.8 | plpgsql 1.0 | supabase_vault 0.2.8 | uuid-ossp 1.1 | vector 0.7.4
```
**`pg_cron` نصب نیست.** و خودِ repo این را می‌داند و راه‌حلش را نوشته:

> «Driven by host cron — see deploy/app/scripts/marketing-tasks-cron.example.sh.
> There is no pg_cron extension on this database (verified: pg_extension lists …
> no pg_cron), so host cron calling a token-protected endpoint is the established
> pattern in this repo, not a new mechanism.»
> — `src/routes/api/public/hooks/generate-marketing-tasks.ts:11-17`

سه endpoint از این شکل امروز وجود دارد: `generate-marketing-tasks.ts`،
`ingest-market-rates.ts`، `process-pricing-queue.ts`.

### ۶. `sales_quotes` و `purchases` — حجم و تریگرهای موجود

```sql
select count(*) as quotes_total, count(*) filter (where status='accepted') as accepted,
       count(accepted_at) as accepted_at_nonnull, count(*) filter (where status='canceled') as canceled,
       min(created_at)::date, max(created_at)::date from sales_quotes;
--> 66 | 9 | 9 | 9 | 2026-07-19 | 2026-09-03

select status, count(*) from sales_quotes group by 1 order by 2 desc;
--> draft 45 | accepted 9 | canceled 9 | sent 2 | rejected 1

select count(*) as purchases_total, min(purchase_date), max(purchase_date) from purchases;
--> 317 | 2026-07-13 | 2026-09-05

select status, count(*) from purchases group by 1;   --> received 317
```

`sales_quotes` امروز **۹ تریگر غیرداخلی** دارد و `purchases` **۷ تریگر** — یعنی هر دو جدول از قبل
در یک پوشش تریگری سنگین کار می‌کنند (بخش ۹).

---

## آنچه باید ساخته شود — با جست‌وجویی که چیزی نیافت

### الف) سند تعهدی — **وجود ندارد**

**جست‌وجوی ۱ — قید نوع سند.** `journal_entries_doc_kind_chk` شش مقدار دارد و هیچ‌کدام
فروش/خرید/دریافتنی/پرداختنی نیست (نقل‌قول کامل در بخش ۱).

**جست‌وجوی ۲ — در ۶۴۹ فایل مهاجرت:**
```bash
ls supabase/migrations/*.sql | wc -l                        --> 649
grep -rli -E "accrual|accrued|receivable_posting|ar_control|revenue recognition" supabase/migrations/
--> (هیچ فایلی)
grep -rn -E "doc_kind[^;]{0,80}'(sale|invoice|purchase|receivable|payable)'" supabase/migrations/
--> (هیچ خطی)
```

**جست‌وجوی ۳ — سطرهای حساب کنترلی هرگز نوشته نشده‌اند:** `invoice_ar/clearing/other` = صفر سطر
(پرس‌وجو در بخش ۲). یعنی جعبه (`journal_lines_account_kind_chk` شامل `invoice_ar`) ساخته شده و
**خالی مانده**.

**نتیجه:** هیچ سندی در تاریخ این پایگاه‌داده از یک *تعهد* زاده نشده. D-26 و D-27 هر دو
نوعِ سندِ تازه لازم دارند، و افزودن آن یعنی تغییر `journal_entries_doc_kind_chk` (و برای شماره‌گذاری،
`document_numbers_doc_type_check`).

### ب) کدینگ حساب مستقل (D-30) — **وجود ندارد**

**جست‌وجوی ۱ — نامِ رابطه در ۲۲۴ جدول:**
```sql
select count(*) from information_schema.tables
 where table_schema='public' and table_type='BASE TABLE';        --> 224

select c.relkind::text||' '||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','v','m')
   and c.relname ~* '(chart|gl_|chart_of|account_tree|account_group|account_node|accounts)';
--> r asan_control_accounts
--> r bank_accounts
```
هیچ درخت حساب، هیچ گروه حساب، هیچ سطح، هیچ ماهیت (`debit/credit nature`).

**جست‌وجوی ۲ — همهٔ ستون‌هایی که «کد حساب» اند:**
```sql
select table_name, column_name from information_schema.columns
 where table_schema='public' and (column_name ~* 'accounting_code|asan_code|account_code|gl_code|coa');
```
```
api_products_pricing.accounting_code      asan_control_accounts.accounting_code
asan_import_person_rows.asan_code         asan_import_product_rows.asan_code
bank_accounts.accounting_code             bank_accounts.asan_code
customers.accounting_code                 external_parties.accounting_code
journal_entries.payer_accounting_code     journal_entries.receiver_accounting_code
payment_receipts.beneficiary_accounting_code / payer_accounting_code / receiver_accounting_code
products.accounting_code                  suppliers.accounting_code
v_documents_unified.asan_code
```
**هر یک از این‌ها یک رشتهٔ متنی آزاد است، نه کلید خارجی به یک جدول حساب.** هیچ‌کدام قید یکتایی یا
FK ندارد.

**جست‌وجوی ۳ — تنها «حساب کنترلی» موجود، یک ردیف است و صریحاً کدِ آسان است:**
```sql
select account_kind, accounting_code, label_fa, note from asan_control_accounts;
```
```
 account_kind | accounting_code |              label_fa               |                 note
--------------+-----------------+-------------------------------------+-------------------------------------
 invoice_ar   | 989             | حساب کنترلی دریافتنی (جمع بدهکاران) | کد آسان از سوی مالک اعلام شد — …
```
و قیدش: `CHECK (account_kind = ANY (ARRAY['invoice_ar','clearing','other']))` — یعنی «کدینگ» این
سیستم دقیقاً سه قلاب دارد، دو تای آن خالی است، و آن یکی **کد آسان** است.

**پوشش کدِ حساب روی طرف‌حساب‌ها — دادهٔ امروز:**
```sql
select 'customers' t, count(*) total, count(nullif(btrim(coalesce(accounting_code,'')),'')) with_code from customers
union all select 'suppliers', count(*), count(nullif(btrim(coalesce(accounting_code,'')),'')) from suppliers
union all select 'external_parties', count(*), count(nullif(btrim(coalesce(accounting_code,'')),'')) from external_parties
union all select 'bank_accounts', count(*), count(nullif(btrim(coalesce(accounting_code,'')),'')) from bank_accounts
union all select 'products', count(*), count(nullif(btrim(coalesce(accounting_code,'')),'')) from products;
```
```
        t         | total | with_code
------------------+-------+-----------
 customers        |    91 |        19
 suppliers        |    15 |         2
 external_parties |     1 |         0
 bank_accounts    |     2 |         2
 products         |   356 |         5
```

**نتیجهٔ صریح برای D-30:** یک «حساب دریافتنی برای هر مشتری» امروز وجود ندارد؛ آنچه وجود دارد
**زیرمعینِ ضمنی** است — `journal_lines.account_kind='customer_credit'` +
`account_ref_id = customers.id`. این *کار می‌کند* و از نگهبانِ `validate_journal_line_ref` رد
می‌شود، ولی نه کدی دارد، نه نامی، نه ماهیتی. همین برای پرداختنی هم صادق است
(`supplier_payable` + `suppliers.id`، امروز **۱ سطر**).

### ج) لغو پس از پذیرش (D-29) — **امروز رد می‌شود، در سطح تریگر**

بدنهٔ `sales_quotes_validate_status`، نقل‌قول کامل از خطوط ۸–۲۱:

```sql
IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
  -- Final states cannot be changed
  IF old.status IN ('accepted','rejected','canceled') THEN
    RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
      USING ERRCODE = '22023';
  END IF;
  -- Allowed transitions
  IF NOT (
    (old.status = 'draft' AND new.status IN ('sent','canceled'))
    OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
  ) THEN
    RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
      USING ERRCODE = '22023';
  END IF;
```

و `purchases.status` **اصلاً حالت لغو ندارد**: هر ۳۱۷ ردیف `'received'` است و
`pg_constraint` هیچ `CHECK` روی این ستون ندارد (چهار قیدِ CHECK این جدول همه دربارهٔ ارز، تعداد و
`supplier_person_id` اند). تنها مسیر حذف یک خرید، `DELETE` مستقیم است — که policy
`"manager admin write purchases" ALL` اجازه‌اش را می‌دهد و تنها اثرش تریگر
`trg_asan_burn_purchase_number AFTER DELETE` است. **هیچ تابعی در پایگاه‌داده و هیچ کدی در `src/`
خریدی را حذف نمی‌کند:**
```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc ~ 'public\.purchases';
--> فقط create_purchase شامل «INSERT INTO public.purchases» است؛ هیچ‌کدام «DELETE FROM public.purchases» ندارد
```
```bash
grep -rn "delete()" src/ --include=*.ts --include=*.tsx | grep -i purchase   --> (هیچ)
```

### د) پنج تابع خنثی‌شده — **هیچ‌کدام تعهدی نبوده‌اند**

بخش بعد. **نتیجهٔ کوتاه: احیای آن‌ها D-25..D-32 را نمی‌سازد**؛ آن‌ها امتیاز/معوق/وصول بودند، نه
دفتر تعهدی. تنها یکی از آن‌ها (`post_receipt_accounting`) اصلاً به دفتر می‌نویسد و آن هم سمت نقدی
است.

### ه) اعلان روزانهٔ D-32 — **مکانیزم هست، خودِ اعلان نیست**

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc ~* 'insert into[[:space:]]+public\.notification_queue';
--> generate_birthday_notifications, notify_accountants_on_sale_price_change,
--> notify_on_stock_available, update_sales_quote_status
```
هیچ‌کدام «خلاصهٔ پایان روز» نیست؛ هر چهار تا رویدادی‌اند. و صفِ دومی هم هست که **مصرف‌کننده
ندارد**:
```sql
select channel, status, count(*) from notification_events group by 1,2;
--> in_app pending 10659 | internal pending 10
```
هر ۱۰٬۶۶۹ ردیف `pending` مانده‌اند؛ در `src/` فقط دو نقطهٔ درج (`src/lib/pricing/board-access.ts:57,189`)
و یک خواندنِ آماری (`src/hooks/dashboard/useDashboardStats.ts:253`) وجود دارد و **هیچ پردازنده‌ای
`processed_at` را پر نمی‌کند**. `automation_jobs` / `automation_job_runs` هم هر دو **۰ ردیف** اند.

---

## پنج تابع خنثی‌شده — بدنهٔ زنده، خوانده‌شده امروز

> **تصحیح ارجاع:** بریف این‌ها را «G8–G11» نامیده است. در
> `docs/research/domain-functions-sweep-20260904.md` آن برچسب‌ها چیز دیگری‌اند
> (`G8` = هفت نویسندهٔ بدون گارد؛ `G9` = `assign_user_role_txt`؛ `G10` = تصحیح یک غلط مثبت؛
> `G11` = خاموشیِ دادهٔ سقف اعتبار). پنج تابع خنثی‌شده آن‌جا **`G1` («خانوادهٔ ۳۳۰/۳۳۱»)** نام
> دارند، خطوط ۱۷۶–۱۹۵. من هر پنج بدنه را **امروز، زنده، با `pg_get_functiondef`** خواندم و
> نقل‌قول‌های زیر بایت‌به‌بایت از پایگاه‌داده‌اند، نه از آن گزارش.

| تابع | قبلاً چه می‌نوشت | از کجا می‌خواند | امروز چه می‌کند | برای احیا چه باید بخواند |
|---|---|---|---|---|
| `post_receipt_accounting` | وضعیت فاکتور (`paid`/`partially_paid`/`unpaid`) | `payment_receipt_links` ⨝ `invoices` | حلقه حذف شده؛ `invoice_updates` همیشه `[]` | `sales_quotes` (تصمیم محصولی) |
| `recalculate_settlement_score` | امتیاز خوش‌حسابی از سررسیدهای فاکتور | `invoices` | `v_score := 0` و همان ۰ را در `customer_credit_profile` می‌کارد | تاریخ تسویه — که فقط روی `invoices` بود |
| `update_customer_overdue_status` | `has_overdue` / `overdue_since` | `invoices` | `v_overdue_since := NULL;` — همیشه شاخهٔ «معوق ندارد» | `sales_quotes` + `settlement_types` |
| `recompute_employee_scores_on_receipt` | امتیاز فروشنده هنگام تأیید فیش | `payment_receipt_links` ⨝ `invoices` | تریگر زنده، بدنه به `RETURN COALESCE(NEW, OLD)` می‌رسد | `sales_quotes` |
| `calculate_salesperson_collected_sales` | مبلغ وصول‌شدهٔ فروشنده | `invoices` (دو CTE) | یک ردیفِ صفر برمی‌گرداند | `sales_quotes` + `payment_receipt_links` |

**کامنت‌هایی که می‌گویند چرا خالی شدند — نقل‌قول مستقیم از `prosrc` زنده:**

`calculate_salesperson_collected_sales` خطوط ۳۷–۴۳:
```
-- 331: both CTEs read the invoice table, which is being retired. They produced
-- nothing: the table holds 0 rows, so `eligible` and `per_invoice` were always empty.
-- IMPORTANT SHAPE NOTE: aggregating over an empty per_invoice still returns exactly ONE
-- row -- zeros via COALESCE, and COUNT(*) = 0 -- so this replacement returns one row of
-- zeros too. Returning no rows would be a behaviour change for every caller.
-- Not repointed at sales_quotes: that would turn a metric that has always read zero into
-- a live number, which is a product decision, not a cleanup.
```

`recalculate_settlement_score` خطوط ۱۲–۱۵:
```
-- 331: this loop scored settlement punctuality from the invoice table. That table
-- holds 0 rows, so it never iterated and v_score was always 0 -- which is what the rest
-- of this function still computes with. Settlement dates live only on invoices today;
-- rebuilding this on sales_quotes would be a new feature, not a migration.
```

`update_customer_overdue_status` خطوط ۱۰–۱۵:
```
-- 331: overdue state was derived from the invoice table. MIN() over zero matching rows
-- is NULL, and that table holds 0 rows, so v_overdue_since was always NULL and the
-- "no overdue" branch below always ran. Assigning NULL keeps that exactly.
-- Overdue tracking will need a real source once it is rebuilt on sales_quotes; that is a
-- product decision and is NOT silently introduced here.
```

`recompute_employee_scores_on_receipt` خطوط ۳۴–۴۵:
```
-- 330: this loop resolved the salesperson by joining payment_receipt_links to
-- the invoices table. That was the function's ONLY way to find anyone, and there are zero
-- links with a non-null invoice_id, so this trigger has never awarded a single point.
-- The join is removed here because it would fail at runtime once invoices is dropped.
--
-- NOT repointed at sales_quotes on purpose. Doing so would switch this trigger from
-- "never fires" to "fires for 50 live quotes", creating employee_score_events and
-- moving real scores. That is a product decision, not a side effect of a cleanup
-- migration. Until it is made, receipt-status scoring stays inert -- exactly as it has
-- been in practice all along. The sibling trigger
-- recompute_employee_scores_on_receipt_link DOES have a working quote branch and is
-- unaffected.
```

`post_receipt_accounting` خطوط ۱۰۸–۱۳۰ (کامل‌ترینِ پنج‌تا):
```
-- 327: the invoice allocation loop was removed here.
--
-- It joined payment_receipt_links to the invoice table, then wrote invoice.status as
-- paid / partially_paid / unpaid. Measured on the live database before removal:
-- payment_receipt_links held 3 rows and ZERO of them had a non-null invoice_id, and
-- that table held 0 rows -- so the join produced no rows on any call and this
-- block had no effect. v_invoice_updates was therefore always '[]' already.
...
-- NOT a behaviour change and NOT a feature port: no equivalent "mark the sales quote
-- paid" step was added in its place. Whether settling a receipt should move a
-- sales_quotes row is a product decision, deliberately not smuggled into a decoupling
-- migration. The receipt's own posting, the customer credit increase and the journal
-- entry below are all untouched.
```

**حکم:** هر پنج، **نقدی-محور** بودند (فیش، وصول، معوق). **هیچ‌کدام سند تعهدی نمی‌ساخت.**
احیای آن‌ها یک تصمیم *جدا* از D-26/D-27 است، هرچند D-31 («اعتبار و سنی بعداً به دفتر وصل
می‌شوند») در نهایت با همان تصمیم برخورد می‌کند.

**تنها بخشِ تعهدی‌شکلِ `post_receipt_accounting` که هنوز زنده است**، سندی است که خودش می‌نویسد
(خطوط ۱۴۸–۱۶۳): یک `journal_entries` با `doc_kind='receipt'` و دو سطر — بدهکار بانک/طرف خارجی،
بستانکار `customer_credit`. یعنی الگوی «یک تابع، یک سند، دو سطر، متوازن» از قبل نوشته شده و یک
تابع تعهدی می‌تواند عیناً همان شکل را داشته باشد.

---

## نقاط اتصال (hook points) — file:line

### D-26 · «پیش‌فاکتور `accepted` شد ⇒ دریافتنی» — **سه نقطه، به ترتیب اطمینان**

**۱ (بهترین) — داخل `update_sales_quote_status`، همان جایی که امروز `hold_credit_for_quote` صدا
زده می‌شود.** نقل‌قول از بدنهٔ زنده، خطوط ۱۱۹–۱۲۹:

```sql
-- OG-79 / M11. Finalising a quote CONSUMES ceiling. Option (ب): an over-ceiling quote is
-- ACCEPTED, never refused — the counter keeps working — but the shortfall is reserved
-- nowhere, recorded on the quote and written to audit_logs. `hold_credit_for_quote` caps the
-- reservation at LEAST(amount, available), so a hold can take the ceiling to exactly zero
-- and never past it.
--
-- Placed AFTER the status UPDATE deliberately: the reservation describes an accepted quote,
-- so if any check above raises, the whole transaction rolls back and nothing is held.
IF p_next = 'accepted'::public.sales_quote_status THEN
  PERFORM public.hold_credit_for_quote(p_quote_id, auth.uid());
END IF;
```

این تابع تنها مسیرِ برنامه‌ای تغییر وضعیت است و کدِ کلاینت این را صریح گفته:
`src/lib/sales/quote-status.functions.ts:103` →
`supabase.rpc("update_sales_quote_status", { p_quote_id, p_next, p_reason })`، با هدرِ فایل:
«route the status transition through the SECURITY DEFINER RPC `public.update_sales_quote_status`»
(`src/lib/sales/quote-status.functions.ts:93-101`).
`proacl` تابع: `authenticated=X/supabase_admin`.

**۲ — تریگر، با الگویی که از قبل دقیقاً همین شرط را دارد** (`pg_get_triggerdef`):
```sql
CREATE TRIGGER trg_sales_quotes_stock_out
  AFTER UPDATE OF status ON public.sales_quotes FOR EACH ROW
  WHEN (((new.status = 'accepted'::sales_quote_status)
     AND (old.status IS DISTINCT FROM 'accepted'::sales_quote_status)))
  EXECUTE FUNCTION trg_sales_quote_stock_out()
```

**⚠️ تلهٔ نقطهٔ ۲ — `AFTER UPDATE` کافی نیست.** خودِ `sales_quotes_validate_status` خطوط ۳۳–۳۸
می‌گوید یک پیش‌فاکتور می‌تواند **مستقیماً پذیرفته‌شده متولد شود**:
```sql
-- A quote can also be born accepted: this trigger fires BEFORE INSERT as well, because a plain
-- INSERT with status='accepted' does not pass through the transition logic above and would
-- otherwise leave accepted_at NULL forever -- see the header for why "forever" is literal.
IF tg_op = 'INSERT' AND new.status = 'accepted' THEN
  new.accepted_at := coalesce(new.accepted_at, now());
END IF;
```
یک تریگر تعهدیِ فقط-`UPDATE` این ردیف‌ها را **بی‌صدا از قلم می‌اندازد**.

**۳ — سطح UI:** `src/routes/_app.sales.quotes.$quoteId.tsx` و
`src/routes/_app.sales.quotes.index.tsx` هر دو به `updateQuoteStatus` می‌رسند؛ هیچ‌کدام
نقطهٔ اتصال مناسبی نیست (فقط UI است، برخلاف بند ۶ CLAUDE.md).

### D-27 · «خرید ثبت شد ⇒ پرداختنی» — **یک نقطه، انحصاری**

```
INSERT INTO public.purchases (      ← pg_get_functiondef(create_purchase) خط ۳۲۶ از ۴۷۶
```
و تنها فراخوانندهٔ برنامه‌ای‌اش، با ادعای انحصار در هدر خودش:

> «Everything now goes through public.create_purchase, which does both inserts
> in one transaction. This hook is deliberately the ONLY place that calls it,
> so a second implementation cannot appear by accident.»
> — `src/hooks/purchase/useCreatePurchase.ts:12-16`، فراخوان در `:134`

`proacl`: `authenticated=X/supabase_admin`. RLS جدول: `"manager admin write purchases" ALL`.
تریگر جایگزین اگر لازم شد: `purchases_audit_insert AFTER INSERT ON public.purchases FOR EACH ROW`
(از قبل زنده، همان شکل).

### D-29 · لغو ⇒ `reverse_document` — **نقطه‌ای وجود ندارد**

- پیش‌فاکتور: `sales_quotes_validate_status` خطوط ۱۰–۱۳ لغو پس از پذیرش را **رد می‌کند**
  (نقل‌قول بالا). هیچ ستون `void`/`reversed` روی `sales_quotes` نیست.
- خرید: هیچ حالت لغوی نیست (۳۱۷ ردیف `'received'`)، و هیچ کد/تابعی حذف نمی‌کند.
- خودِ `reverse_document` خط ~۴۰: `IF _kind NOT IN ('receipt','payment','dual') THEN RAISE`.
- شمارهٔ سند: `document_numbers_doc_type_check CHECK (doc_type = ANY (ARRAY['receipt','payment','dual']))`.

### D-32 · اعلان روزانه

- نوشتن: الگوی `notify_accountants_on_sale_price_change` خطوط ۴۳–۵۲ (نقل‌قول بالا).
- خواندن: `src/shared/components/NotificationBell.tsx:46`، `src/routes/_app.notifications.tsx:52`.
- زمان‌بندی: `src/routes/api/public/hooks/generate-marketing-tasks.ts:11-17` +
  `deploy/app/scripts/marketing-tasks-cron.example.sh`.

### D-31 · خواننده‌هایی که **بعداً** جابه‌جا می‌شوند — فقط فهرست، بدون پیشنهاد

| خواننده | چه می‌خواند (اندازه‌گیری‌شده) | ردیف |
|---|---|---|
| `customer_credit_balance` | جدول، نه view | ۲۵ |
| نویسندگانش (`UPDATE … customer_credit_balance`) | فقط سه تا: `hold_credit`، `release_credit`، `reverse_document` | — |
| `_ensure_credit_balance` | تنها سازندهٔ ردیف (`INSERT`) | — |
| `increase_credit` | **هیچ‌چیز نمی‌نویسد**؛ فقط `PERFORM public.release_credit(...)` | — |
| `customer_credit_ledger` | دفترِ «قبل/بعد» | ۷ |
| `customer_credit_profile` | مقصدِ دو تابع خنثی‌شده | **۰** |
| `vw_customer_receivables` | `sales_quotes` (status `accepted`) ⨝ `payment_receipt_links` ⨝ `payment_receipts` ⨝ `settlement_types` | — |
| `vw_supplier_payables` | `purchases` ⨝ `payment_vouchers` ⨝ `payment_terms` | — |

اثبات نویسندگان (به‌جای grep نامِ تابع):
```sql
select p.proname||' ||| '||substring(p.prosrc from '(?i)(UPDATE[[:space:]]+public\.customer_credit_balance[^;]{0,120})')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc ~* 'UPDATE[[:space:]]+public\.customer_credit_balance';
--> hold_credit | release_credit | reverse_document        (و بس)
```
و بدنهٔ `increase_credit` خطوط ۱۷–۲۵ خودش می‌گوید چرا دیگر نمی‌نویسد:
```
-- OG-17 option (b): a receipt RELEASES ceiling. It does not mint money. The previous body
-- incremented the stored wallet `customer_credit_balance.available_credit`, which
-- `get_customer_dynamic_credit` ignores - so it inflated a number nobody reads while the real
-- ceiling never moved.
```

**هیچ‌کدام از این‌ها امروز دفتر روزنامه را نمی‌خوانند.** پس D-31 یک کارِ *اتصال* است، نه اصلاح.

---

## آنچه اگر دفتر تعهدی شود می‌شکند

### ۱. `person_settlement_position` — **بلندترین ریسک، و بی‌صدا**

بدنهٔ زنده، خطوط ۳۲–۴۴:
```sql
SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO _r
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
 WHERE je.status = 'posted'
   AND jl.account_kind = 'customer_credit'
   AND jl.account_ref_id = _c;

SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO _p
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
 WHERE je.status = 'posted'
   AND jl.account_kind = 'supplier_payable'
   AND jl.account_ref_id = _s;
```
سه نکته: **(الف)** این تابع بر خلاف `vw_account_balances`، `get_account_ledger` و
`asan_list_journal_export` **هیچ فیلتری روی `reverses_entry_id` ندارد** — امروز بی‌ضرر است چون
سند برگشتی علامت معکوس دارد و صفر می‌شود، ولی هر منطق تعهدیِ تازه باید این را بداند.
**(ب)** امروز `receivable` **تقریباً همیشه ≤ ۰** است، چون فیش‌ها `customer_credit` را بستانکار
می‌زنند و چیزی آن را بدهکار نمی‌کند (۲۲ سطر بدهکار در برابر ۳۲ بستانکار، و ۱۲ تای بدهکارها از
`payment` می‌آید نه از فروش). با تعهدی‌شدن، **معنای همین عدد وارونه می‌شود** — و صفحهٔ
`/accounting/mutual-settlement` (`src/lib/accounting/mutual-settlement.ts:58`) مستقیم رویش سوار
است. **(ج)** `supplier_payable` امروز **یک سطر** دارد و آن هم **بدهکار** است — یعنی پرداختنیِ
محاسبه‌شده منفی می‌شود. کار قبلی همین را ۲۰۲۶-۰۸-۱۶ گزارش کرده بود
(`docs/research/ledger-wiring-RESEARCH.md:405-408`، سؤال باز ۵: «**UNCERTAIN** — cannot be
settled from 2 journal lines»). امروز با ۹۴ سطر هنوز همان سؤال باز است، ولی حالا با دادهٔ بیشتر.

### ۲. صادرات آسان — **D-30 از یک جا نشت می‌کند: `_filter='all'`**

`asan_list_journal_export` سندها را از خودِ `journal_entries` می‌گیرد، نه از فهرست سفید:
```sql
FROM public.journal_entries je
 WHERE je.status = 'posted' AND je.entry_date BETWEEN _from AND _to
   AND je.reverses_entry_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.journal_entries r WHERE r.reverses_entry_id = je.id AND r.status='posted')
   AND NOT EXISTS (... cheque_receivable / cheque_payable ...)
```
و در انتها:
```sql
WHERE _filter = 'all'
   OR (_filter = 'purchase_and_settlement' AND k.dkind IN ('purchase_payment','settlement'))
   OR k.dkind = _filter
```
یک `doc_kind` تازه در CTEٔ `k` به `'unclassified'` نگاشت می‌شود، پس **از هر چهار فیلترِ رابط
کاربری بیرون می‌ماند** — رابط فقط `receipt / payment / third_party / purchase_and_settlement` را
می‌فرستد (`src/lib/asan/export-registry.ts:23-31` و `JournalFilter` در
`src/lib/asan/export-journal.ts:35-41`). **ولی `'all'` هنوز از راه RPC مستقیم قابل فراخوانی
است** و `proacl` می‌گوید `authenticated=X/supabase_admin`. امروز چهار spec از آن استفاده می‌کنند:
```bash
grep -rn "_filter: \"all\"" e2e/ src/
e2e/asan/export-bank-deposits.spec.ts:239
e2e/asan/final-verification.spec.ts:388
e2e/asan/og67-bank-payments-reach-template-1.spec.ts:181
e2e/business-flows/phase8-integrated-verification.spec.ts:104
```
**حکم: D-30 با شکل امروز نقض *نمی‌شود* از راه رابط، ولی `'all'` یک درِ باز است که باید در برنامهٔ
اجرا صریح بسته یا محدود شود.**

سه صادراتِ دیگرِ آسان دفتر را نمی‌خوانند و بنابراین بی‌اثر می‌مانند:
```sql
select p.proname||' :: reads_journal='||(case when p.prosrc ~ 'journal_' then 'YES' else 'no' end)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
   and p.proname in ('asan_list_bank_deposit_export','asan_list_purchase_export','asan_list_sales_export');
--> asan_list_bank_deposit_export :: reads_journal=YES   (فقط در یک کامنت ارجاعی؛ منبعش payment_vouchers است)
--> asan_list_purchase_export     :: reads_journal=no
--> asan_list_sales_export        :: reads_journal=no
```
و `asan_list_sales_export` مستقیم از پیش‌فاکتور می‌خواند — یعنی «فقط فاکتورها به آسان می‌روند»
از قبل درست پیاده شده:
```sql
FROM public.sales_quotes sq
 WHERE sq.status = 'accepted'
```

### ۳. آنچه **نمی‌شکند** — با اثبات

- `vw_account_balances`: `WHERE jl.account_kind = 'bank'::text AND je.status='posted' AND
  je.reverses_entry_id IS NULL AND NOT (EXISTS (...))` — سطرهای تعهدی هرگز `bank` نیستند.
- `get_account_ledger`: همان فیلتر `jl.account_kind = 'bank'` در هر دو CTE و در محاسبهٔ ماندهٔ
  ابتدای بازه (خطوط ۲۳–۳۲ و ۴۲–۴۹). **مانده و گردش بانکی دست‌نخورده می‌ماند.**
- `/accounting/receipts/$receiptId` (`:282`, `:299`) — بر اساس `source_id` یک فیش خاص فیلتر است.
- `/admin/system-health` (`:139`) — پنجاه سند آخر را فهرست می‌کند؛ سندهای تعهدی آن‌جا **دیده
  می‌شوند** (نه غلط، ولی تازه).
- `vw_customer_receivables` و `vw_supplier_payables` **اصلاً دفتر را نمی‌خوانند** — بنابراین
  دو صفحهٔ مطالبات/پرداختنی از تعهدی‌شدن تکان نمی‌خورند. این همان چیزی است که D-31 «بعداً»
  می‌نامد.

---

## سؤال‌های مالک که هنوز باز است — به زبان کسب‌وکار

**۱. یک پیش‌فاکتورِ پذیرفته‌شده را چطور می‌خواهید لغو کنید؟**
امروز سیستم عمداً اجازه نمی‌دهد: وقتی پیش‌فاکتور «پذیرفته‌شده» شد، وضعیتش قفل می‌شود و هیچ‌کس —
حتی مدیر — نمی‌تواند آن را برگرداند. D-29 می‌گوید «لغو پس از ثبت ⇒ سند برگشتی خودکار»، ولی برای
اینکه لغوی وجود داشته باشد، اول باید این قفل باز شود. سه راه هست: (الف) یک وضعیت تازه مثل
«باطل‌شده» که فقط بعد از پذیرش ممکن باشد؛ (ب) اجازهٔ برگشت از «پذیرفته‌شده» به «لغوشده» فقط برای
حسابدار/مدیر؛ (ج) یک «سند اصلاحی» جدا که پیش‌فاکتور را دست‌نخورده بگذارد. **کدام؟** توجه: انبار
هم به همین نقطه وصل است — پذیرش، خروج کالا می‌زند.

**۲. لغو یک خرید یعنی چه؟**
امروز خرید هیچ حالتی جز «دریافت‌شده» ندارد و تنها راه برداشتنش پاک‌کردن کامل است. اگر جنس برگشت
خورد یا خرید اشتباه ثبت شد، می‌خواهید ردیف خرید بماند و یک سند برگشتی بخورد، یا کلاً پاک شود؟
(پاک‌شدن یعنی حسابداری هیچ ردی از آن ندارد.)

**۳. کدینگ حساب مستقل یعنی دقیقاً چه؟**
D-30 می‌گوید کدینگ ما مستقل از آسان است. ولی امروز **تنها کدینگی که وجود دارد، کدهای آسان است** —
روی ۱۹ مشتری از ۹۱، ۲ تأمین‌کننده از ۱۵، و ۲ حساب بانکی. و تنها «حساب کنترلی» ثبت‌شده
(«حساب کنترلی دریافتنی») کدش را از خودتان گرفته و در دیتابیس نوشته شده «کد آسان از سوی مالک اعلام
شد». پس: می‌خواهید یک **درخت حساب تازه** از صفر بسازیم (کد، نام، سطح، ماهیت)، یا کافی است هر مشتری
و تأمین‌کننده «حساب خودش» باشد بدون کد، و فقط چند حساب کنترلی (دریافتنی، پرداختنی، فروش، خرید)
اضافه شود؟ دومی خیلی کوچک‌تر است.

**۴. یک دریافتنی برای هر مشتری، یا یک حساب کنترلی با ریز اشخاص؟**
اگر ۵۰ مشتری دارید، ۵۰ حساب مجزا یعنی ۵۰ کد که کسی باید بسازد و نگه دارد. سیستم امروز راه دوم را
عملاً پیاده کرده (یک نوع حساب + شناسهٔ مشتری روی هر سطر). **می‌خواهید همین بماند؟**

**۵. «روز راه‌اندازی» یعنی چه تاریخی، و مانده‌های امروز چه می‌شوند؟**
D-28 می‌گوید تاریخچه منتقل نمی‌شود. ولی امروز ۹ پیش‌فاکتور پذیرفته‌شده و ۳۱۷ خرید در سیستم است.
سؤال: از روز راه‌اندازی به بعد فقط اسناد **تازه** ثبت شوند و مانده‌های قبلی صفر فرض شوند، یا یک
«سند افتتاحیه» بخورد که مانده‌های واقعی امروز را یک‌بار وارد کند؟ بدون سند افتتاحیه، ترازِ سیستم
با ترازِ آسان هرگز یکی نمی‌شود.

**۶. اعلان روزانه به چه کسی و چه ساعتی؟**
سیستم امروز ۳ حسابدار می‌شناسد. اعلان به هر سه برود یا به یک نفر مشخص؟ و ساعتش چند باشد؟ (نکتهٔ
فنی: زنگ اعلان اپ الان ۱٬۶۹۲ پیام **خوانده‌نشده** دارد — همه از تغییر قیمت. اگر اعلان روزانه هم به
همان‌جا برود، در آن انبوه گم می‌شود. شاید بهتر باشد کانال جدا یا صفحهٔ جدا داشته باشد.)

**۷. «فروش تعهدی» شامل مالیات، تخفیف و خدمات هم می‌شود؟**
یک پیش‌فاکتور امروز اقلام، خدمات اجباری، و مبلغ نهایی دارد. سند تعهدی باید فقط مبلغ نهایی را
بنویسد، یا فروش و مالیات و تخفیف را جدا؟ این تعیین می‌کند چند حساب لازم است.

**۸. آن پنج تابع خواب‌رفته را می‌خواهید بیدار کنیم یا نه — و این تصمیم *جدا* از دفتر تعهدی است.**
پنج تابع (امتیاز خوش‌حسابی، وضعیت معوق، امتیاز فروشنده، وصولی فروشنده، تسویهٔ فاکتور) از وقتی
جدول قدیمی فاکتور حذف شد، عمداً خاموش‌اند و هر کدام در بدنهٔ خودشان نوشته‌اند «این یک تصمیم محصولی
است». **این‌ها دفتر تعهدی نیستند**؛ اگر بیدار شوند، امتیاز کارمندان و وضعیت معوق مشتریان جابه‌جا
می‌شود. می‌خواهید در همین موج به آن‌ها دست بزنیم یا بعداً؟

---

## آنچه مالک باید فراهم کند — دسترسی، فهرست، اعتبارنامه

**۱. فهرست کدهای حساب آسان که قرار است بمانند.** امروز فقط یکی ثبت شده
(«حساب کنترلی دریافتنی»). اگر D-30 می‌گوید کدینگ ما مستقل است، باز هم برای خروجی آسان به کدِ
کنترلیِ پرداختنی، فروش و خرید نیاز است — یا باید صریح گفته شود که هیچ‌کدام لازم نیست.

**۲. تصمیم دربارهٔ ۷۲ مشتری و ۱۳ تأمین‌کنندهٔ بدون کد حسابداری.** اگر خروجی آسان قرار است ادامه
پیدا کند، هر طرفِ حسابی که کد ندارد در فایل خروجی «مسدود» می‌شود (پیامش در تابع نوشته شده:
«کد آسان تأمین‌کننده «…» ثبت نشده است»). این کارِ داده است، نه کارِ برنامه‌نویس.

**۳. تاریخ دقیق روز راه‌اندازی (D-28)** و تأیید کتبی اینکه مانده‌های قبلی منتقل نمی‌شوند.

**۴. تأیید حرکتِ اعداد پیش از هر اجرا.** اگر سند تعهدی روی `customer_credit` بنشیند، عددِ
«وضعیت تسویهٔ شخص» در صفحهٔ تسویهٔ متقابل تغییر علامت می‌دهد. این دقیقاً همان الگویی است که بند ۱۰
`CLAUDE.md` دربارهٔ مهاجرت ۴۱۱ هشدار می‌دهد: تغییری که در دیف کوچک به‌نظر می‌رسد و عددهای واقعی را
جابه‌جا می‌کند. **تأیید باید روی حرکت عددها باشد، نه روی خودِ تغییر.**

**۵. دسترسی به یک نمونهٔ واقعی خروجی آسان** برای اینکه معلوم شود سند تعهدی واقعاً باید بیرون بماند
یا آسان انتظارش را دارد. من فقط کد را دیده‌ام، فایل واقعی را نه.

**۶. تصمیم دربارهٔ `_filter='all'`.** آیا کسی بیرون از رابط کاربری این RPC را با `'all'` صدا
می‌زند؟ اگر بله، باید بداند که با تعهدی‌شدن، خروجی‌اش عوض می‌شود.

---

## Numbers · Contradictions · Coverage · UNVERIFIED

### Numbers — هر عدد با دستوری که تولیدش کرد

همه با `docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on"
afrakala-lan-db psql -d afrakala`.

```sql
-- ۱) شکل و حجم دفتر  ← بارِ اصلی این گزارش
select 'journal_entries' t, count(*) from journal_entries
union all select 'journal_lines', count(*) from journal_lines
union all select 'asan_control_accounts', count(*) from asan_control_accounts
union all select 'bank_accounts', count(*) from bank_accounts;
--> 47 | 94 | 1 | 2

select doc_kind, source_type, status, count(*), min(entry_date), max(entry_date)
  from journal_entries group by 1,2,3 order by 1,2,3;
--> dual/dual_document/posted 8 (2026-08-20..2026-09-05)
--> other/manual/posted 2 (2026-07-20..2026-07-22)
--> payment/payment_voucher/posted 12 (2026-08-20..2026-08-31)
--> receipt/payment_receipt/posted 25 (2026-07-25..2026-09-05)

select account_kind, count(*) lines, count(*) filter (where debit>0) dr,
       count(*) filter (where credit>0) cr from journal_lines group by 1 order by 1;
--> bank 33 (20/13) | cheque_receivable 6 (4/2) | customer_credit 54 (22/32) | supplier_payable 1 (1/0)

select coalesce(string_agg(distinct account_kind,','),'(none)') from journal_lines
 where account_kind in ('invoice_ar','clearing','other');            --> (none)

-- ۲) حجمِ نقاط اتصال  ← بارِ اصلی بند ۹
select count(*) quotes_total, count(*) filter (where status='accepted') accepted,
       count(accepted_at) accepted_at_nonnull, count(*) filter (where status='canceled') canceled,
       min(created_at)::date, max(created_at)::date from sales_quotes;
--> 66 | 9 | 9 | 9 | 2026-07-19 | 2026-09-03
select count(*), min(purchase_date), max(purchase_date) from purchases;
--> 317 | 2026-07-13 | 2026-09-05
select count(*) filter (where accepted_at is not null and status<>'accepted') from sales_quotes;  --> 0

-- ۳) بقیه
select count(*) from notification_queue;             --> 1692 (همه خوانده‌نشده، همه sale_price_change)
select channel, status, count(*) from notification_events group by 1,2;
--> in_app/pending 10659 | internal/pending 10
select count(*) from automation_jobs;                --> 0
select count(*) from automation_job_runs;            --> 0
select count(*) from customer_credit_balance;        --> 25
select count(*) from customer_credit_ledger;         --> 7
select count(*) from customer_credit_profile;        --> 0
select count(*) from audit_logs;                     --> 51722   (۳۲ مگابایت)
select role::text, count(*) from user_roles group by 1;
--> admin 14 | sales 14 | manager 3 | accountant 3 | viewer 2
select doc_type, count(*) from document_numbers group by 1;
--> receipt 75 | payment 63 | dual 59
select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';  --> 224
ls supabase/migrations/*.sql | wc -l                 --> 649
```

### بند ۹ — کارایی: آیا تریگر به‌ازای هر پیش‌فاکتور مشکل‌ساز است؟ **نه، با اندازه‌گیری**

**نرخ واقعی امروز:** ۹ پذیرش در بازهٔ ۲۰۲۶-۰۷-۲۱ تا ۲۰۲۶-۰۸-۳۱ (۴۲ روز) ⇒ **~۰٫۲۱ در روز**.
۳۱۷ خرید در ۲۰۲۶-۰۷-۱۳ تا ۲۰۲۶-۰۹-۰۵ (۵۵ روز) ⇒ **~۵٫۸ در روز**. [E]
گفتهٔ مالک «~۵۰ مشتری × روزانه» [U] حتی اگر یعنی ۵۰ سند در روز، **دو مرتبهٔ بزرگی زیر** بار
موجود است.

**هزینهٔ اندازه‌گیری‌شدهٔ یک نوشتنِ هم‌شکل.** `reverse_document` دقیقاً همان کاری را می‌کند که یک
ثبت تعهدی می‌کند — یک `journal_entries` + کپی سطرها + یک ردیف دفتر اعتبار + یک `audit_logs` —
و `pg_stat_statements` یک اجرای واقعی‌اش را ثبت کرده:
```sql
select calls, round(total_exec_time::numeric,1) total_ms, round(mean_exec_time::numeric,2) mean_ms,
       round(max_exec_time::numeric,1) max_ms, left(regexp_replace(query,'\s+',' ','g'),60)
  from pg_stat_statements where query ~* 'reverse_document';
--> 1 | 5.9 | 5.93 | 5.9 | SELECT public.reverse_document($1, (SELECT id FROM public.payment_vouchers …
```
**۵٫۹۳ میلی‌ثانیه.** با ~۵۰ سند در روز ⇒ ~۰٫۳ ثانیه در کل روز.

**بار تریگریِ موجود، برای مقایسه:** `sales_quotes` امروز **۹ تریگر غیرداخلی** دارد و `purchases`
**۷ تریگر** (فهرست کامل با `pg_get_triggerdef` در بخش نقاط اتصال). یعنی هر پذیرش و هر ثبت خرید
از قبل چندین تریگر را شلیک می‌کند و ۳۱۷ خرید بدون مشکل ثبت شده‌اند. افزودن یکی دیگر داخل همان
پوشش می‌ماند.

**ایندکس‌ها آماده‌اند:** `idx_journal_entries_entry_date`، `journal_entries_source_unique
(source_type, source_id)` — که هم‌زمان **کلید بی‌تکرارسازی (idempotency) رایگان** است: یک ثبت
دوباره روی همان پیش‌فاکتور با خطای یکتایی رد می‌شود — و `idx_journal_lines_account
(account_kind, account_ref_id)` برای جمع‌زدن ماندهٔ یک شخص.

**تنها هزینهٔ رشدِ قابل‌توجه، `audit_logs` است**: ۵۱٬۷۲۲ ردیف / ۳۲ مگابایت امروز؛ دفتر خودش
۱۶۰ kB + ۱۲۸ kB است. **حکم: تریگر یا فراخوان درون‌تراکنشی هر دو بی‌خطرند؛ نگرانی کارایی وجود
ندارد.**

### Contradictions — با هر دو طرف نقل‌قول‌شده

**۱. «۶۶ پیش‌فاکتور پذیرفته‌شده» در بریف — غلط است. ۶۶ کلِ پیش‌فاکتورهاست؛ پذیرفته‌شده‌ها ۹ تاست.**
بریف: «Roughly 66 accepted quotes and 317 purchases exist today». اندازه‌گیری:
`select count(*) ... from sales_quotes` → **۶۶ کل**، و
`count(*) filter (where status='accepted')` → **۹**. ۳۱۷ خرید تأیید شد. این با کار قبلی هم
می‌خواند: `docs/research/allocation-workbench-build-research-20260906.md:545` هشت ردیف مطالبات و
سه مشتری گزارش کرده (هشت، نه نُه، چون یکی از نُه پیش‌فاکتورِ پذیرفته‌شده ماندهٔ باز ندارد).
**اثر عملی: حجم نقطهٔ اتصال D-26 هفت برابر کمتر از تصور بریف است.**

**۲. «`post_receipt_accounting` تنها تابعی است که در دفتر حسابداری می‌نویسد» — دیگر درست نیست.**
`PROGRESS.md:53` و `docs/research/domain-functions-sweep-20260904.md:239` هر دو این را می‌گویند.
اندازه‌گیری امروز:
```sql
select p.proname||' :: '||(case when p.prosrc ~* 'insert into[[:space:]]+public\.journal_entries'
       then 'WRITES_ENTRIES ' else '' end)||(case when p.prosrc ~* 'insert into[[:space:]]+public\.journal_lines'
       then 'WRITES_LINES ' else '' end)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc ~ 'journal_entries|journal_lines' order by 1;
```
**شش تابع** سند و سطر می‌نویسند: `create_dual_document`، `create_payment`، `create_receipt`،
`pay_purchase_with_voucher`، `post_mutual_settlement`، `post_receipt_accounting` — و
`reverse_document` هفتمی است. **این برای برنامهٔ اجرا مهم است:** «یک نقطهٔ نوشتن» یک فرض غلط است؛
هفت نقطه وجود دارد و همه همان دو `INSERT` را تکرار می‌کنند.

**۳. `post_receipt_journal` دیگر وجود ندارد.**
`docs/research/ledger-wiring-RESEARCH.md:18-19` (اندازه‌گیری ۲۰۲۶-۰۸-۱۶): «post_receipt_journal
is a 618-character function whose entire body is `RETURN NULL;` (A5)». امروز:
```sql
select p.proname||' len='||length(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('post_receipt_journal','hold_credit_for_quote');
--> hold_credit_for_quote len=1881          (post_receipt_journal: هیچ ردیفی)
```
**تابع بین ۲۰۲۶-۰۸-۱۶ و امروز حذف شده.** هر دو گزارش در زمان خودشان درست بوده‌اند.

**۴. برچسب «G8–G11» در بریف، پنج تابع خنثی‌شده را نشان نمی‌دهد.**
در `domain-functions-sweep-20260904.md` آن پنج‌تا `G1` اند (خط ۱۷۶: «G1 · P1 · «خانوادهٔ ۳۳۰/۳۳۱»
— پنج تابع عمداً خنثی‌شده»)، درحالی‌که `G8` (خط ۲۵۲) «هفت نویسندهٔ SECURITY DEFINER بدون گارد» و
`G9` `assign_user_role_txt` است. من هر پنج بدنه را زنده خواندم و نام‌هایشان را از خودِ بدنه‌ها
تأیید کردم؛ فهرست بالا بر پایهٔ خواندن است نه بر پایهٔ برچسب.

**۵. ادعای «۹۲٪ خریدها تأمین‌کننده ندارند» کهنه شده است.**
`ledger-wiring-RESEARCH.md:401-402` (۲۰۲۶-۰۸-۱۶): «`purchases` has 101 rows, of which only 9 have
a `supplier_id`». امروز ۳۱۷ ردیف است و کار قبلیِ ۲۰۲۶-۰۹-۰۶ می‌گوید ۳۱۷ خرید پرداخت‌نشده روی
**۶ تأمین‌کننده** (`allocation-workbench-build-research-20260906.md:548`). من پوشش
`supplier_id` را جداگانه نشمردم — **`[?]` باز است** (پایین).

### Coverage — حکم هر زیربند

| بند | موضوع | حکم |
|---|---|---|
| ۱ | دفتر فعلی: جدول، سند، سطر، `reverse_document`، حجم، انواع | **VERDICT** — `journal_entries`/`journal_lines`؛ ۴۷/۹۴ ردیف؛ ۲۰۲۶-۰۷-۲۰..۰۹-۰۵؛ ۴ نوع سند، همه نقدی؛ بدنهٔ `reverse_document` کامل نقل شد |
| ۲ | کدینگ حساب | **VERDICT — وجود ندارد.** تنها `asan_control_accounts` با ۱ ردیف (کدِ آسان)؛ نه حساب دریافتنی به‌ازای مشتری، نه کنترلیِ پرداختنی. زیرمعینِ ضمنی از راه `account_kind + account_ref_id` هست و کار می‌کند |
| ۳ | پنج تابع خنثی‌شده | **VERDICT** — هر پنج بدنه زنده خوانده و نقل‌قول شد؛ هر پنج از `invoices` می‌خواندند؛ هیچ‌کدام تعهدی نبود |
| ۴ | نقاط اتصال D-26 / D-27 | **VERDICT** — `update_sales_quote_status` خطوط ۱۲۷–۱۲۹ و `src/lib/sales/quote-status.functions.ts:103`؛ `create_purchase` خط ۳۲۶ و `src/hooks/purchase/useCreatePurchase.ts:134`. به‌علاوهٔ تلهٔ «born accepted» |
| ۵ | لغو | **VERDICT — قلاب وجود ندارد.** پذیرش حالت نهایی است (نقل‌قول)؛ خرید حالت لغو ندارد؛ `reverse_document` سه نوع را می‌پذیرد |
| ۶ | خواننده‌های D-31 | **VERDICT (فقط فهرست، بدون پیشنهاد)** — ۳ نویسندهٔ `customer_credit_balance`؛ `increase_credit` دیگر نمی‌نویسد؛ هیچ‌یک از دو view دفتر را نمی‌خوانند |
| ۷ | چه می‌شکند | **VERDICT** — `person_settlement_position` (بدون فیلتر برگشتی، علامت وارونه)؛ `asan_list_journal_export` فقط از راه `_filter='all'`؛ بانک، دو view مطالبات/پرداختنی و صادرات فروش/خرید امن‌اند |
| ۸ | اعلان روزانه | **VERDICT** — `notification_queue` (زنده، ۱٬۶۹۲ ردیف) + الگوی پخش به حسابداران + cron میزبان؛ `pg_cron` نصب نیست؛ `notification_events` مصرف‌کننده ندارد |
| ۹ | حجم و کارایی | **VERDICT** — ~۰٫۲۱ پذیرش و ~۵٫۸ خرید در روز؛ ۵٫۹۳ ms برای یک نوشتنِ هم‌شکل؛ ۹ و ۷ تریگر موجود؛ ایندکس‌ها آماده. **تریگر بی‌خطر است** |

**۹ از ۹ زیربند حکم دارد.**

### UNVERIFIED / UNKNOWN

1. **[?] پوشش `purchases.supplier_id`.** نشمردم. `ledger-wiring-RESEARCH.md:401` (۰۸-۱۶) ۹ از
   ۱۰۱ گفته بود؛ اگر امروز هم پایین باشد، هر پرداختنیِ تعهدیِ کلیددارِ `supplier_id` بخش بزرگی از
   خریدها را پوشش نمی‌دهد. **این را باید پیش از هر طراحی شمرد.**
2. **[?] رفتار واقعی زیر JWT کاربر.** همه‌چیز به‌عنوان `postgres` خوانده شد؛ `auth.uid()` تهی بود
   و هر view دارای گاردِ `auth.uid() IS NOT NULL` صفر ردیف می‌دهد. اعداد از پرس‌وجوی درونی گرفته
   شد. **هیچ probe رفتاری اجرا نشد** — قاعدهٔ probe در بریف.
3. **[?] هیچ تابعی فراخوانی نشد.** به‌ویژه `get_customer_dynamic_credit` (که از راه
   `_ensure_credit_balance` می‌نویسد) لمس نشد. پس ادعاهای من دربارهٔ *رفتار* توابع همه از خواندن
   بدنه‌اند، نه از اجرا.
4. **[?] معنای «سیستم آسان» بیرون از این repo.** فقط کدِ صادرات را دیده‌ام. اینکه آسان سند تعهدی
   را می‌پذیرد یا رد می‌کند، از این‌جا قابل تشخیص نیست.
5. **[?] چرا `notification_events` هرگز پردازش نمی‌شود** — ۱۰٬۶۶۹ ردیف `pending`. از داده معلوم
   نیست که پردازنده حذف شده یا هرگز ساخته نشده.
6. **[?] آیا کسی بیرون از e2e، `asan_list_journal_export` را با `_filter='all'` صدا می‌زند.**
   فقط repo را جست‌وجو کردم.
7. **UNVERIFIED — هیچ ادعایی دربارهٔ سامانهٔ اصلی.** به `192.168.170.10` وصل نشدم، ping نکردم،
   نامش را resolve نکردم.
8. **[?] `schema_full_export.sql` عمداً خوانده نشد** — بریف می‌گوید غیرقابل‌اتکاست. همهٔ schema
   از پایگاه‌دادهٔ زنده آمده.

### Preflight / Postflight — بدون تغییر

```
git rev-parse HEAD              --> a433860410f63200ee10053bd5401bd0f739dfb8
git rev-parse --abbrev-ref HEAD --> staging
git status --porcelain (قبل، ۸ ورودی):
?? docs/missions/wave2-credit/
?? docs/missions/wave5/
?? docs/research/allocation-workbench-build-research-20260906.md
?? docs/research/authenticated-open-functions-20260905.md
?? docs/research/ocr-gap-20260905.md
?? docs/research/phone-gap-20260905.md
?? docs/research/scoring-engine-zero-parameters-20260905.md
?? docs/research/three-gaps-merged-20260905.md
```
**هیچ شاخه‌ای عوض نشد، هیچ stash ای زده نشد، هیچ commit ای ساخته نشد، هیچ مهاجرتی اعمال نشد،
هیچ داده‌ای تغییر نکرد.** تنها خروجی، همین فایل است.

---

## وضعیت گزارش

`COMPLETE` — هر ۹ زیربند حکم دارد، هر «باید ساخته شود» با جست‌وجویی که چیزی نیافت همراه است،
و **هیچ پیاده‌سازی‌ای پیشنهاد نشد**. برنامهٔ اجرا را کسی دیگر، بعد از پاسخ مالک، می‌نویسد.
