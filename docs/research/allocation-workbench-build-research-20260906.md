# میز تخصیص («پخش حساب») — پژوهش ساخت

اندازه‌گیری **۲۰۲۶-۰۹-۰۶** · سرور تست `192.168.170.8` · شاخه `staging` @ `eb6b6f6455fad5f47aa2c93a1f62eb03f99a1dd7`
· پایگاه‌داده `afrakala` روی `afrakala-lan-db` · **به `192.168.170.10` وصل نشدم، ping نکردم، نامش را resolve نکردم.**

**فقط خواندنی.** هر پرس‌وجو با `PGOPTIONS="-c default_transaction_read_only=on"` اجرا شد. هیچ تابعی
فراخوانی نشد (هیچ `SELECT fn(...)`)؛ توابع فقط با `pg_get_functiondef` و `pg_policies` خوانده شدند.
**هیچ چیزی تغییر نکرد** — preflight اول و آخر یکسان است (پایین، بخش Coverage).
**هیچ نام، مبلغ، تلفن یا داده‌ٔ واقعی مشتری در این سند نیست؛ فقط نام ستون و شمارش.**

برچسب‌ها: **[E]** اندازه‌گیری‌شده اینجا · **[P]** کار قبلی، با ارجاع · **[U]** گفتهٔ مالک · **[?]** نامعلوم

---

## Verdict

**هستهٔ میز تخصیص — نگاشت «بدهکار X پول را به بستانکار Y بریزد» به‌عنوان یک *برنامه* — وجود ندارد.
هیچ جدولی در ۲۲۳ جدول این پایگاه‌داده چنین شکلی ندارد.** [E] نزدیک‌ترین چیزِ موجود `dual_documents`
است که دقیقاً همان دو طرف را دارد (`payer_*` = کسی که به ما بدهکار بود، `beneficiary_*` = کسی که ما
به او بدهکار بودیم) اما **گذشته‌نگر** است: `tracking_number` ستون `NOT NULL` با `CHECK length>0` دارد،
یعنی هر ردیف باید شمارهٔ پیگیری یک انتقال **انجام‌شده** را حمل کند، و نام یکی از قیدهایش خودش
`dual_documents_record_only_shape_chk` است. [E]

اما — و این مهم‌تر از خودِ نبودنِ آن جدول است — **دو ستون میز تخصیص، هر دو، از قبل ساخته شده‌اند و
تقریباً کامل‌اند.** `vw_customer_receivables` (۲۲ ستون) و `vw_supplier_payables` (۲۰ ستون) هر دو
مبلغ، سررسید، پرچم معوق و سطل سنی می‌دهند؛ `get_receivables_list` / `get_payables_list` با صفحه‌بندی
و فیلتر و جست‌وجو روی آن‌ها سوارند؛ دو صفحهٔ زنده (`/accounting/receivables` ۸۴۷ خط،
`/accounting/payables` ۷۶۰ خط) آن‌ها را نشان می‌دهند؛ و `compute_daily_capital` عدد سرتیتر میز —
«امروز چقدر می‌آید، امروز چقدر می‌رود» — را در یک تابع می‌دهد و **از waveٔ ۴ به بعد دیگر بی‌مصرف
نیست: در `/accounting/dynamic-capital` وصل است.** [E] پس سطح کار، برخلاف تصور اولیه، عمدتاً وجود
دارد؛ آنچه نیست، **ستون سوم** است: تخصیص، تعهد، و پیگیری.

**اما بزرگ‌ترین یافتهٔ این مأموریت نه کد است و نه schema — داده است.** سیستم امروز فقط **۳ مشتری**
با مانده باز و **۶ تأمین‌کننده** با خرید پرداخت‌نشده می‌شناسد [E]، در برابر ~۵۰ و ~۲۰ که مالک گفت
[U]. و **۰ از ۳۱۷ خرید به‌عنوان پرداخت‌شده علامت خورده** [E] — یعنی صفحهٔ پرداختنی‌ها کل تاریخچهٔ
خرید شرکت را بدهیِ باز گزارش می‌کند. میزی که روی این داده ساخته شود، روز اول عدد غلط نشان می‌دهد.
ساختن جدولِ تخصیص کارِ کوچکی است؛ درست‌شدنِ داده کارِ بزرگ است، و کارِ کاربر است نه کارِ برنامه‌نویس.

---

## آنچه از قبل وجود دارد — با اثبات هر مورد

### ۱. ستون راست (طلب ما) — `vw_customer_receivables` · **زنده · پوشش بالا**

۲۲ ستون، اندازه‌گیری‌شده از `information_schema.columns`:

```
customer_id, customer_name, invoice_id, invoice_number, invoice_type, invoice_status,
due_date, total_amount, deposit_amount, confirmed_paid_amount, outstanding_amount,
commitment_confirmed, days_until_due, is_overdue, created_at, aging_bucket,
settlement_title, settlement_days, settlement_is_active, due_date_unknown,
due_date_unknown_reason, settlement_inactive_flag
```

منبعش `sales_quotes` است نه `invoices` (که مهاجرت ۳۳۲ حذفش کرد):

```sql
FROM sales_quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN paid_quote p ON p.doc_id = q.id
  LEFT JOIN settlement_types st ON st.id = q.settlement_type_id
WHERE q.status = 'accepted'::sales_quote_status
  AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0), 0) > 0
```
— `pg_get_viewdef('public.vw_customer_receivables')` خطوط ۶۹–۷۳

**پرداخت جزئی روی این طرف مدل شده است**: `confirmed_paid_amount` از `payment_receipt_links` جمع
می‌شود و `outstanding_amount` باقیمانده است. سطل‌های سنی: `current / d1_30 / d31_60 / d61_90 /
d90_plus`، و `due_date IS NULL` به `current` می‌افتد (خط ۲۰) — پس هیچ ردیفی بی‌سطل نمی‌ماند.

**آنچه برای میز تخصیص کم دارد:** هیچ ستونی برای «وضعیت پیگیری» ندارد. `commitment_confirmed` که
شبیه «تعهد» به‌نظر می‌رسد، **تعهد پرداخت نیست**؛ از `sales_quotes.commitment_confirmed` می‌آید و
مربوط به تأیید سقف اعتبار هنگام ثبت پیش‌فاکتور است (مهاجرت‌های ۲۱۲ و ۲۲۲). [E]

### ۲. ستون چپ (بدهی ما) — `vw_supplier_payables` · **زنده · پوشش متوسط**

۲۰ ستون. سررسید از `payment_terms.days + purchase_date` ساخته می‌شود.

**اصلاح waveٔ ۳ زنده است — تأیید شد.** مهاجرت ۴۵۷ عبارت بدهی را عوض کرد و در تعریف زندهٔ view
همان چیز نشسته است:

```sql
CASE WHEN p.paid_at IS NOT NULL THEN 0::numeric
     ELSE COALESCE(p.total_amount, 0::numeric) END AS outstanding_amount
```
— `pg_get_viewdef('public.vw_supplier_payables')` خطوط ۳۵–۳۸

یعنی دیگر `cash_price` (که یک قیمت فرضیِ نقدیِ امتیازآور است، نه بدهی) به‌جای بدهی گزارش نمی‌شود.
سرِ خودِ مهاجرت این را چنین توضیح می‌دهد: «صفحهٔ پرداختنی‌ها بدهی شرکت را ۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان کمتر
از واقع نشان می‌داد» — `supabase/migrations/20260905224500_457_payables_debt_is_the_purchase_total.sql:39`

**اما یک محدودیت ساختاری باقی است که میز تخصیص مستقیم به آن می‌خورد: پرداخت جزئیِ خرید مدل نشده
است.** `outstanding_amount` یا کل مبلغ است یا صفر — چیزی در میان نیست. خودِ مهاجرت ۴۵۷ منشأ را
نقل می‌کند: «Partial payment of purchases is NOT modeled in current schema … To be revisited when
partial purchase payments are introduced» (خط ۲۲). میز تخصیص ذاتاً جزئی است — «امروز ۵۰۰ از ۲٬۰۰۰
را به این تأمین‌کننده می‌دهیم» — و این ساختار امروز آن را نمی‌تواند ثبت کند.

### ۳. اصلاح دوم waveٔ ۳ (شکاف ۶۳ میلیونی) — **زنده · تأیید شد**

در تعریف زندهٔ `get_receivables_summary`:

```sql
AND (p_from_date IS NULL OR v.due_date >= p_from_date OR v.due_date_unknown)
AND (p_to_date   IS NULL OR v.due_date <= p_to_date   OR v.due_date_unknown)
```
— `pg_get_functiondef`، خطوط ۳۲–۳۳ از `prosrc`

و دو ستون گزارش‌گرِ صریح اضافه شده‌اند: `due_date_unknown_outstanding` و `count_due_date_unknown`
(خطوط ۲۶–۲۷). سرِ مهاجرت ۴۵۸ توضیح می‌دهد که شکاف در سطل‌ها نبود، در **فیلتر تاریخ** بود:
«A range spanning eleven centuries loses 63,000,000 toman»
— `supabase/migrations/20260905230000_458_receivables_summary_keeps_unknown_due_dates.sql:26`

### ۴. موتور نقدینگی روزانه — `compute_daily_capital(p_capital_date date)` · **زنده و از waveٔ ۴ وصل**

`STABLE SECURITY DEFINER` — **هیچ‌چیز نمی‌نویسد.** گارد نقش، اولین چیز در بدنه:

```sql
IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
```

و دقیقاً همان دو عددی را که میز تخصیص در سرتیتر می‌خواهد می‌سازد:

```sql
COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date = p_capital_date), 0)
  INTO ... v_today_r ... FROM public.vw_customer_receivables;
COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date = p_capital_date), 0)
  INTO ... v_today_p ... FROM public.vw_supplier_payables WHERE is_paid = false;
```

خروجی‌اش ۲۳ ستون است، از جمله `due_today_receivables` و `due_today_payables` و
`overdue_receivables` / `overdue_payables`.

**این یک تناقض با کار قبلی است — به نفعِ ما.** گزارش `allocation-workbench-findings-20260904.md`
نوشته بود «**و هیچ‌جای برنامه آن را صدا نمی‌زند**» (خط ۱۷). امروز صدا زده می‌شود:
`src/hooks/capital/useDynamicCapital.ts:311` → `supabase.rpc("compute_daily_capital", …)`، و
`src/routes/_app.accounting.dynamic-capital.tsx:645` کارت پیشنهاد را می‌سازد. کامنت خودِ hook هم
تاریخچه را ثبت کرده: «had zero callers» (`useDynamicCapital.ts:261`).

**ولی عملاً امروز عددی نمی‌دهد.** کارت وقتی `input_id` تهی باشد عمداً هیچ پیشنهادی نشان نمی‌دهد و
پیام «پیشنهاد سامانه محاسبه نشد» می‌دهد (`_app.accounting.dynamic-capital.tsx:707-716`)، و
`daily_capital_inputs` فقط **۲ ردیف** دارد: `2026-07-20` و `2026-07-22`. [E] یعنی برای هر تاریخ
جاری، این کارت خاموش است.

### ۵. دروازهٔ معوق — `can_issue_customer_invoice(p_customer_id uuid)` · **زنده**

`STABLE SECURITY DEFINER`، گارد نقش صریح (`admin, manager, accountant, sales`)، و پاسخِ دقیقاً
همان سؤالی که ستون پیگیری لازم دارد:

```sql
FROM public.vw_customer_receivables r
WHERE r.customer_id = p_customer_id AND r.is_overdue = true AND r.outstanding_amount > 0
```

برمی‌گرداند: `can_issue, customer_id, overdue_amount, overdue_count, oldest_due_date, reason` —
و `reason` متن فارسیِ آمادهٔ نمایش است. کامنت داخلش می‌گوید گارد نقش در waveٔ ۳ (مهاجرت ۴۵۴)
اضافه شد چون «Without this the underlying view's fail-open guard decided the answer». **پس ادعای
waveٔ ۳ تأیید می‌شود.**

### ۶. `dual_documents` — نزدیک‌ترین چیز به تخصیص، ولی گذشته‌نگر · **۸ ردیف، همه `approved`**

دو طرفِ درست را دارد و مهاجرتِ سازنده‌اش خودش این را به همان زبانی می‌گوید که مالک گفت:

```
--   ACCOUNT HOLDERS (Asan code required, balance moves, journal line written)
--     payer_*        — the party who owed US and paid
--     beneficiary_*  — the party WE owed and who was paid
```
— `supabase/migrations/20260819130000_360_dual_documents_table.sql:33-36`

و شمارهٔ حساب‌های واقعی را هم نگه می‌دارد، ولی **عمداً بدون کلید خارجی**:

```
--   RECORDED ON THE DOCUMENT ONLY (no Asan code, no journal line, balance does NOT move)
--     transferrer_name / transferrer_account_no  — the person who actually made the transfer
--     recipient_name   / recipient_account_no    — the person whose account actually received it
-- These four are PLAIN TEXT with NO foreign key and no person_id, deliberately.
```
— همان فایل، خطوط ۴۱–۴۵

**چرا برنامه نیست، بلکه سند است:** `tracking_number text NOT NULL` به‌علاوهٔ
`dual_documents_tracking_chk CHECK (length(btrim(tracking_number)) > 0)` — نمی‌توان ردیفی ساخت که
هنوز پول در آن جابه‌جا نشده باشد. اگرچه `status` سه مقدار `draft/approved/rejected` را می‌پذیرد،
هر ۸ ردیف موجود `approved` است [E] و قید شمارهٔ پیگیری حتی برای `draft` هم برقرار است. **حکم:
سند، نه برنامه.**

**RLS:** `INSERT` و `UPDATE` فقط `admin, accountant`؛ `SELECT` این دو به‌علاوهٔ `manager`؛
`DELETE` فقط `admin`. — `pg_policies`

### ۷. مکانیزم تاریخچهٔ تغییر — **وجود دارد، و سه الگو دارد**

مالک گفت «هر تغییر ثبت شود» [U]. سه مکانیزم زندهٔ موجود، به ترتیب مناسب‌بودن:

| مکانیزم | شکل | ردیف | آماده؟ |
|---|---|---|---|
| `audit_logs` | `actor_id, entity_type, entity_id, action, diff jsonb` | **۵۰٬۶۰۷** | بله؛ همه‌جا استفاده می‌شود |
| `customer_credit_ledger` | `transaction_type, amount, balance_before, balance_after, reference_type, reference_id` | ۷ | بله؛ الگوی «قبل/بعد» |
| `*_status_history` | `from_status, to_status, changed_by, note, changed_at` | `document_status_history` = **۰** | الگو هست، پرنشده |

`hold_credit` هر دو تای اول را در یک تراکنش می‌نویسد — الگوی آماده‌ای که میز تخصیص می‌تواند
عیناً تقلید کند (`pg_get_functiondef(hold_credit)`، دو `INSERT` پایانی).

**یک تصحیح مهم:** تابعی به نام `is_valid_audit_entity_type` وجود دارد که فهرست سفیدِ ۷۵ مقدارِ
`entity_type` را نگه می‌دارد و شبیه یک دروازه به‌نظر می‌رسد. **این تابع مرده است:** صفر
فراخواننده در `pg_proc`، صفر `CHECK` در `pg_constraint`، صفر policy. [E] و خودِ `audit_logs`
هیچ `CHECK` روی `entity_type` ندارد — پرتکرارترین مقدارِ واقعی، `price_calculation_snapshots`
با ۸٬۳۷۲ ردیف، اصلاً در آن فهرست نیست. **پس افزودن یک `entity_type` تازه برای میز تخصیص هیچ
مهاجرتی لازم ندارد.**

### ۸. سطح کاربری — **بیشتر از آنچه انتظار می‌رفت وجود دارد**

| مسیر | چه نشان می‌دهد | خوانده از |
|---|---|---|
| `/accounting/receivables` | ستون راستِ میز: فهرست + خلاصه + سطل سنی + جزئیات | `get_receivables_summary` / `_list` / `get_receivable_detail` |
| `/accounting/payables` | ستون چپِ میز: همان سه‌تایی | `get_payables_summary` / `_list` / `get_payable_detail` |
| `/accounting/dynamic-capital` | سرتیترِ نقدینگی روز + کارت پیشنهاد سامانه | `compute_daily_capital`، `daily_capital_settings` |
| `/accounting/treasury` | مانده و دفتر ورود/خروجِ **حساب‌های خودمان** | `fetchAccountBalances` / `fetchAccountLedger` |
| `/accounting/mutual-settlement` | تسویهٔ متقابل تک‌شخص | توابع mutual_settlement |
| `/accounting/receipts/create?branch=dual` | ثبت سند دوطرفه | `create_dual_document` |
| `/accounting/purchase-payments` | پرداخت خرید با حواله | `pay_purchase_with_voucher` |
| `/accounting/daily-capital` | **redirect** به `dynamic-capital` (۱۶ خط) | — |

`src/components/accounting/AgingBuckets.tsx` تنها فایلی است که هر دو RPC خلاصه را می‌شناسد، ولی
یک **کامپوننت مشترک** است نه یک صفحهٔ ترکیبی — هر دو صفحه جداگانه از آن استفاده می‌کنند. [E]
**هیچ صفحه‌ای امروز دو طرف را کنار هم نشان نمی‌دهد.**

### ۹. مرکز مالی (`FinanceHub`) — **هر دو طرف از قبل آنجا هست**

`src/components/finance/FinanceHub.tsx` (۳۹۱ خط) به ۱۸ مقصد لینک می‌دهد، از جمله هر دو طرفِ میز
(`/accounting/receivables` خط ۱۹۵، `/accounting/payables` خط ۲۰۰)، `treasury` (۱۲۹)،
`dynamic-capital` (۱۵۵)، `mutual-settlement` (۱۸۳)، `purchase-payments` (۱۳۴)، و سه شاخهٔ
`receipts/create` از جمله `?branch=dual` (خط ۷۴). **ادعای waveٔ ۲ و ۳ تأیید می‌شود:**
`/sales/customers` (خط ۱۱۲) و `/admin/persons-cleanup` (خط ۱۲۳) هر دو حاضرند. [E]
**پس میز تخصیص ورودیِ طبیعی دارد و لازم نیست جای تازه‌ای برایش ساخته شود.**

### ۱۰. جای خالیِ آمادهٔ شمارهٔ حساب بستانکار — `person_identifiers.kind = 'iban'`

قید زندهٔ جدول `iban` را می‌پذیرد:

```
person_identifiers_kind_check :: CHECK (kind = ANY (ARRAY['mobile_e164','landline',
  'national_id_ir','tax_id_ir','company_reg_id_ir','email','iban','custom','asan_person_code']))
```

**ولی صفر ردیف از این نوع وجود ندارد.** توزیعِ واقعی: `mobile_e164` = ۳۶، `asan_person_code` = ۱۹،
جمع ۵۵ — و بس. [E] یعنی جعبه ساخته شده و خالی است. `bank_accounts` هم فقط **۲ ردیف** دارد و
حساب‌های **خودمان** است (ستون‌های `opening_balance, accounting_code, asan_code, account_type`)،
نه حساب بستانکاران. [E]

---

## آنچه واقعاً باید ساخته شود

### الف) ردیف تخصیص: «بدهکار X امروز مبلغ M را به بستانکار Y بریزد» — **نیست**

**جست‌وجویی که چیزی پیدا نکرد (سه لایه، هر سه خالی):**

۱. **جست‌وجوی نامِ ستون** در تمام ۲۲۳ جدول و همهٔ viewها:
```sql
select table_name||'.'||column_name from information_schema.columns
where table_schema='public' and column_name ~*
'(allocat|distribut|settle|tahator|from_person|to_person|source_account|target_account|payer|payee|creditor|debtor|assign_to|promise|commit|pledge)';
```
→ ۵۱ ستون برگشت، و **هیچ‌کدام دو طرف را در یک ردیف کنار هم ندارد**: `payer_*` فقط در
`dual_documents` / `payment_receipts` / `journal_entries`؛ `payee_*` فقط در `payment_vouchers`.
تنها جدولی که هر دو را دارد `dual_documents` است که بالا حکمش داده شد.

۲. **جست‌وجوی ساختاری** — جدول‌هایی که دو کلید خارجی به `persons` دارند:
```sql
select c.conrelid::regclass, count(*) from pg_constraint c
join lateral unnest(c.conkey) k(attnum) on true
join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
where c.contype='f' and c.confrelid='public.persons'::regclass
group by 1 having count(*)>=2;
```
→ فقط سه جدول: `payment_receipts (customer_person_id, receiver_party_person_id)`،
`person_merge_candidates (person_id_a, person_id_b)`، `person_merge_log (loser_id, winner_id)`.
دوتای آخر مربوط به ادغام اشخاص‌اند. **هیچ جدولِ برنامه‌ریزیِ دوطرفه‌ای وجود ندارد.**

۳. **جست‌وجوی نامِ رابطه**:
```sql
select c.relkind::text, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m')
  and c.relname ~* '(alloc|distrib|settle|assign|plan|propos|suggest|recommend|match|pair)';
```
→ ۱۱ رابطه، و هیچ‌کدام این نیست: `capital_allocation_ledger` (سقف اعتبار مشتری، ۰ ردیف)،
`customer_capital_allocations_dynamic` + `salesperson_capital_allocations_dynamic` (سقف اعتبار)،
`market_product_match*` (تطبیق قیمت محصول)، `mutual_settlements` (تسویهٔ تک‌شخص، ۰ ردیف)،
`product_owner_assignments`، `product_recommendation_overrides`، `settlement_types` (نوع تسویهٔ
فروش)، `v_promotion_suggestions` (ارتقای کارمند)، `v_purchase_item_allocation` (قلم خرید به
درخواست خرید).

**نزدیک‌ترین چیز موجود:** `dual_documents` — شکلِ درست، زمانِ غلط.
**اندازهٔ کار:** یک جدول با دو طرف + مبلغ + تاریخ + وضعیت + اولویت، یک RPC نوشتن، یک RPC خواندن،
و یک policy مجموعه. **کوچک.** خطر اصلی: اگر کلید خارجی به `persons` بگیرد، قاعدهٔ ۹ در
`CLAUDE.md` — ثبت در registryِ `person_merge` **پیش از** `ALTER TABLE`، وگرنه event triggerِ
مهاجرت ۳۲۸ کل مهاجرت را برمی‌گرداند و ادغام اشخاص برای همه از کار می‌افتد.

### ب) «قول» و وضعیت پیگیری — **نیست، و واژگانش هم هیچ‌جا نیست**

پنج عبارتِ خودِ مالک [U] را عیناً در `src/`، `supabase/migrations/` و `docs/` جست‌وجو کردم:

| عبارت | تعداد برخورد |
|---|---|
| «خبر می‌ده» | **۰** |
| «جواب نمی‌ده» | **۰** |
| «نمی‌خواد» | **۰** |
| «واریز شد» | ۱ — فقط در `docs/research/remaining-missions-recon.md` (یادداشت پژوهشی، نه کد) |
| «پخش حساب» | ۱ — فقط در `docs/research/allocation-workbench-findings-20260904.md` |

**هیچ enum ای در پایگاه‌داده چنین واژگانی ندارد.** فهرست کاملِ ۲۰ نوع enum خوانده شد
(`pg_type` ⨝ `pg_enum`)؛ نزدیک‌ترین‌ها `inquiry_status` (وضعیت استعلام، زمان‌محور) و
`stock_alert_status` (`open, contacted, closed, canceled, notified`) هستند و هیچ‌کدام ربطی ندارد.

**نزدیک‌ترین چیز موجود:** جدول `tasks` (۱۱ ردیف) — `assigned_to`, `status`, `priority`,
`due_date`, `reference_type`, `reference_id`, `assigned_queue`. صفِ `accounting` از قبل در
قیدش هست:
```
tasks_assigned_queue_check :: CHECK (assigned_queue = ANY (ARRAY['sales','shipping','store','accounting','marketing']))
tasks_priority_check       :: CHECK (priority = ANY (ARRAY['low','normal','high','urgent']))
tasks_status_check         :: CHECK (status = ANY (ARRAY['pending','in_progress','done','blocked','canceled','expired']))
```
پس **«اولویت» که مالک برای ستون چپ خواست، در `tasks` از قبل چهار درجه دارد.** ولی واژگان
وضعیتش عمومی است و هیچ مبلغی حمل نمی‌کند. **اندازهٔ کار: کوچک تا متوسط** — بستگی به پاسخ مالک
دارد که آیا وضعیت پیگیری روی خودِ ردیف تخصیص بنشیند یا یک جدول تاریخچهٔ جدا بخواهد.

### ج) `call_logs` برای پیگیری — **بن‌بست، ولی نه به دلیلی که فکر می‌کردیم**

`call_logs` = **۰ ردیف** [E]. ستون‌هایش: `employee_id, direction, duration_seconds, started_at,
ended_at, customer_id, external_id, source, metadata jsonb`. **هیچ ستون نتیجه/وضعیت/تعهد ندارد** —
فقط طول و جهت تماس. برای «شنبه واریز می‌کنه» جایی ندارد مگر داخل `metadata`، که یعنی بی‌ساختار.

**تصحیح کارِ قبلی:** waveٔ ۴ گفته بود «`call_logs` صفر نویسنده دارد و امتیازدهی آن را نمی‌خواند».
نیمهٔ اول درست است (صفر ردیف، صفر ارجاع در `src/` جز `types.ts`). نیمهٔ دوم **دقیق نیست**:
یک تریگر زندهٔ واقعی روی جدول نشسته است —
```
trg_call_logs_recompute_employee_score
  AFTER INSERT OR DELETE OR UPDATE ON public.call_logs FOR EACH ROW
  EXECUTE FUNCTION recompute_employee_scores_on_call_log()
```
پس هر نوشتنی روی `call_logs` بازمحاسبهٔ امتیاز کارمند را شلیک می‌کند. آنچه درست است این است که
**حسابِ امتیاز از این جدول عدد نمی‌خواند** — `compute_employee_score` عمداً از جای دیگری
می‌خواند و خودش دلیلش را نوشته:
```sql
-- Calls / talk-minutes ALWAYS come from staff_daily_performance_metrics
-- (call_logs has no data and no automatic source exists).
```
— `pg_get_functiondef(compute_employee_score)`، خطوط ۶۹–۷۱

**حکم: بن‌بست برای وضعیت پیگیری** — شکلش غلط است، و نوشتن در آن یک عارضهٔ جانبیِ ناخواسته
(بازمحاسبهٔ امتیاز کارمند) دارد.

### د) refill خودکار وقتی منبع از دست می‌رود — **نیست**

مالک گفت «قول به بدهکار یک تعهد است؛ اگر منبع نیامد باید از جای دیگر پر شود» [U]. هیچ مکانیزم
جبرانی در پایگاه‌داده نیست: `capital_allocation_ledger` که تنها چیزی است با
`hold/release/consume/refund`، **۰ ردیف دارد و هیچ نویسنده‌ای ندارد** (پایین). **اندازهٔ کار:
متوسط تا بزرگ**، و بیشترش تصمیم است نه کد — به پاسخ مالک وابسته است.

### ه) «یاد بگیر و پیشنهاد بده» — **نیست، و داده‌اش هم نیست** (پایین، بخش داده)

---

## تفکیک تسویهٔ متقابل از میز تخصیص

**اینها دو مسئلهٔ متفاوت‌اند، و بدنهٔ توابع خودش این را می‌گوید.**

تسویهٔ متقابل = **یک شخص** که هم‌زمان طلبکار و بدهکار ماست. شرطِ نامزدی، عیناً:

```sql
FROM public.persons p
WHERE EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id)
  AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.person_id = p.id)
```
— `pg_get_functiondef(list_mutual_settlement_candidates)`

یعنی **همان `p.id`** باید هم پروندهٔ مشتری داشته باشد هم پروندهٔ تأمین‌کننده. و کامنت خودِ تابع
تصریح می‌کند: «Mutual settlement needs both sides, so a customer-only or supplier-only person is
genuinely not a candidate».

شکل جدولش هم همین را می‌گوید — `mutual_settlements` سه ستون شخص دارد ولی هر سه یک نفرند:
`person_id, customer_id, supplier_id`. و مهاجرتِ ۳۶۰ وقتی خواست سند دوطرفه بسازد، **صریحاً
تصمیم گرفت از این جدول استفاده نکند** و دلیلش را نوشت:

```
-- It is a ONE-PARTY table. person_id is singular; customer_id and supplier_id are the two role rows
-- OF THAT SAME PERSON, which is what netting means — a person who is both owed and owing. A dual
-- document has TWO DIFFERENT PARTIES … Forcing it into mutual_settlements would mean either
-- overloading customer_id/supplier_id to mean two different persons — silently breaking every
-- existing reader, including person_settlement_position and post_mutual_settlement — or adding
-- four columns that are meaningless for a netting row.
```
— `supabase/migrations/20260819130000_360_dual_documents_table.sql:19-25`

**نتیجه: ماشین‌آلات تسویهٔ متقابل نمی‌تواند میز تخصیص را سرویس بدهد.** میز تخصیص نگاشتِ
**چند به چند** میان **اشخاص متفاوت** است. اگر کسی وسوسه شد از `mutual_settlements` استفاده کند،
مهاجرت ۳۶۰ همین وسوسه را یک بار داشته و ردش کرده — و دلیلش هنوز برقرار است.

جدول `mutual_settlements` امروز **۰ ردیف** دارد. [E]

---

## سؤال‌های مالک

هر کدام تصمیمی است که فقط مالک می‌تواند بگیرد و بدون پاسخش نمی‌شود درست ساخت.

**۱. «قول» چطور ثبت شود، و چه حالت‌هایی دارد؟**
شما پنج حالت گفتید: «واریز شد»، «خبر می‌ده»، «جواب نمی‌ده»، «شنبه واریز می‌کنه»، «نمی‌خواد».
سه‌تای اول و آخری یک *وضعیت*اند، ولی «شنبه واریز می‌کنه» دو چیز است: یک وضعیت **و یک تاریخ**.
آیا می‌خواهید تاریخِ قول جدا ثبت شود (تا سیستم بتواند شنبه یادآوری کند و بعد بگوید «قول داد و
عمل نکرد»)، یا همان متن کافی است؟ فهرست حالت‌ها بسته باشد یا حسابدار بتواند حالت تازه اضافه کند؟

**۲. وقتی منبع از دست رفت، جبران خودکار باشد یا دستی؟**
گفتید اگر کسی که قول داده بود نریخت، باید از جای دیگر پر شود. سیستم باید **خودش** منبع جایگزین
پیشنهاد بدهد، یا فقط **هشدار** بدهد و حانیه خودش تصمیم بگیرد؟ (پیشنهادِ ما: در نسخهٔ اول فقط
هشدار — چون سیستم هنوز هیچ سابقه‌ای از تصمیم‌های شما ندارد که از رویش انتخاب کند.)

**۳. آیا تخصیص می‌تواند جزئی باشد؟**
مثلاً «از ۲ میلیارد بدهی به این تأمین‌کننده، امروز ۵۰۰ میلیون». **امروز سیستم پرداخت جزئیِ خرید
را اصلاً نمی‌تواند ثبت کند** — یک خرید یا پرداخت‌شده است یا نشده. اگر میز تخصیص جزئی باشد (که
احتمالاً هست)، این یک کار اضافه است که باید در دامنهٔ کار حساب شود.

**۴. شمارهٔ حساب بستانکارها کجا نگهداری شود؟**
کارآموز شمارهٔ حساب‌ها را جمع می‌کند و پخش می‌کند. امروز جایی برای نگهداریِ آن‌ها نیست:
`bank_accounts` فقط ۲ حساب **خودمان** است، و جای آمادهٔ `person_identifiers` با نوع `iban`
**صفر ردیف** دارد. آیا می‌خواهید شمارهٔ حسابِ هر بستانکار یک بار ثبت و بعد بارها استفاده شود
(کارِ کارآموز از دفعهٔ دوم حذف می‌شود)، یا هر بار روی سندِ همان روز نوشته شود مثل امروز؟

**۵. کارآموز با چه نقشی وارد شود؟**
گفتید حانیه یا ملیکا نقشه را می‌سازند و **کارآموز** حساب‌ها را جمع و پخش می‌کند. امروز نقشی
پایین‌تر از `accountant` که به این حوزه دسترسی داشته باشد وجود ندارد — `app_role` فقط
`admin, manager, sales, accountant, viewer, purchase_specialist, site` است، و
`dual_documents` فقط به `admin` و `accountant` اجازهٔ نوشتن می‌دهد. آیا نقش تازه‌ای می‌خواهید،
یا کارآموز با نقش `accountant` کار کند؟

**۶. میز تخصیص صفحهٔ نو باشد یا ستونی روی صفحهٔ موجود؟**
دو ستونِ شما هر کدام **از قبل صفحهٔ کامل خودشان را دارند** (`/accounting/receivables` و
`/accounting/payables`) و هیچ صفحه‌ای امروز آن‌ها را کنار هم نمی‌گذارد. سه راه هست:
 - **الف)** یک صفحهٔ سومِ تازه که هر دو را کنار هم می‌آورد + ستون تخصیص. (شبیه‌ترین به شیت شما)
 - **ب)** یک ستون «تخصیص» روی همان دو صفحهٔ موجود. (کم‌ریسک‌ترین، ولی شیت روزانه را بازنمی‌سازد)
 - **ج)** میز داخل `/accounting/dynamic-capital` که همین حالا عدد سرتیترِ روز را دارد.
کدام؟

**۷. سقف اعتبار مشتری و «قولِ» میز، دو چیز جدا هستند یا یکی؟** (توضیح در بخش بعد)

---

## نسبتِ `hold_credit` با «قولِ» میز تخصیص — دو محور متفاوت‌اند

مأموریت پرسید آیا وعده به بستانکار یک *credit hold* است. **نه.** با خواندن بدنه:

```sql
SELECT c.available_credit INTO _avail FROM public.get_customer_dynamic_credit(p_customer_id) c;
...
UPDATE public.customer_credit_balance SET held_credit = _new_held ...
INSERT INTO public.customer_credit_ledger (... transaction_type, ... reference_type, reference_id ...)
VALUES (p_customer_id, _person, 'hold', p_amount, ..., 'sales_quote', p_invoice_id, _actor);
```
— `pg_get_functiondef(hold_credit)`

`hold_credit` **سقف خریدِ یک مشتری** را در برابر **یک پیش‌فاکتور** رزرو می‌کند
(`reference_type` ثابتاً `'sales_quote'`). این یعنی «این مشتری این‌قدر از سقفش را مصرف کرده».
قولِ میز تخصیص چیز دیگری است: «پولی که *قرار است* از بدهکار X برسد، به بستانکار Y وعده داده
شده». **محورش فرق دارد** — یکی ظرفیتِ خریدِ یک نفر است، دیگری تعهدِ جریان نقدیِ میان دو نفر.
مدل‌کردنِ دومی با اولی، سقف اعتبار مشتری‌ها را بی‌ربط جابه‌جا می‌کند.

### و `v_dynamic_customer_capital_balances.held_amount` هم پاسخ نیست — **همیشه صفر است**

view چهار ستون `final_limit / held_amount / consumed_amount / remaining_amount` دارد، و
`held_amount` از اینجا می‌آید:

```sql
CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed)
```
و `_capital_alloc_used` تنها از یک جا می‌خواند:
```sql
FROM public.capital_allocation_ledger WHERE allocation_kind = p_kind AND allocation_id = p_alloc_id
```

**و `capital_allocation_ledger` صفر ردیف دارد و هیچ نویسنده‌ای ندارد.** [E] اثبات:
```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosrc ~* 'capital_allocation_ledger';
--> _capital_alloc_used, is_valid_audit_entity_type, recompute_dynamic_capital_setting
```
هر سه فقط **می‌خوانند** (`recompute_dynamic_capital_setting` یک `SELECT count(*)` برای قفل).
در `src/` هم تنها ارجاعِ غیر-`types.ts` یک **کامنت** است:
`src/hooks/capital/useDynamicCapital.ts:43` → `/** Item 141.3 — folded from capital_allocation_ledger. */`

**پس `held_amount` نمی‌تواند «پولِ وعده‌داده‌شده ولی هنوز جابه‌جانشده» را مدل کند؛ عملاً همیشه ۰
است.** توجه: `hold_credit` به دفتر **دیگری** (`customer_credit_ledger`) می‌نویسد، نه به این.
دو دفترِ hold وجود دارد و به هم وصل نیستند.

---

## داده‌ای که برای یادگیری لازم است

**پاسخ صادقانه: نه. سه ماه داده وجود ندارد، و مهم‌تر اینکه دادهٔ *تصمیم* اصلاً وجود ندارد.**

مالک خواست سیستم سه ماه نگاه کند و بعد پیشنهاد بدهد [U]. برای یادگیریِ «چه کسی سرِ قولش می‌ماند»
و «کدام تخصیص جواب داد»، سیستم باید **تصمیم‌های گذشته و نتیجه‌شان** را داشته باشد.

| آنچه لازم است | آنچه هست | حکم |
|---|---|---|
| تاریخچهٔ تخصیص‌های روزانه | جدولش وجود ندارد | **صفر** |
| قول‌ها و اینکه عمل شد یا نه | جدولش وجود ندارد | **صفر** |
| نتیجهٔ تماس‌های پیگیری | `call_logs` = ۰ ردیف | **صفر** |
| رسیدهای دریافت (سیگنال «واریز شد») | `payment_receipts` = ۲۹ ردیف، ۲۰۲۶-۰۷-۲۵ تا ۲۰۲۶-۰۹-۰۵ | ~۶ هفته |
| حواله‌های پرداخت | `payment_vouchers` = ۱۲ ردیف، ۲۰۲۶-۰۸-۲۰ تا ۲۰۲۶-۰۸-۳۱ | ~۱۰ روز |
| اسناد دوطرفه | `dual_documents` = ۸ ردیف | ناچیز |
| امتیاز پویای مشتری | `dynamic_entity_scores`: **فقط ۲ ماه** — تیر (۳۸ ردیف / ۵ مشتری) و مرداد (۵۳ ردیف / ۶ مشتری). شهریور: **صفر** | ۲ ماه، ۶ مشتری |
| نقدینگی روزانه | `daily_capital_inputs` = **۲ ردیف** (۲۰۲۶-۰۷-۲۰، ۲۰۲۶-۰۷-۲۲) | ~۲ روز |
| اجرای چرخهٔ سرمایه | `daily_capital_settings` = ۱۹ تاریخ، ۲۰۲۶-۰۶-۲۳ تا **۲۰۲۶-۰۸-۳۱** | ۱۹ روز در ۱۰ هفته |

**و مقیاس هم غایب است.** مالک ~۵۰ نفر که به ما بدهکارند و ~۲۰ نفر که ما به آن‌ها بدهکاریم گفت [U].
امروز:
- **۳ مشتری** با مانده باز (۸ ردیف مطالبات) — نه ۵۰
- **۶ تأمین‌کننده** با خرید پرداخت‌نشده — نه ۲۰

**بنابراین:** ساختنِ لایهٔ پیشنهاد امروز، ساختن روی هیچ است. اما یک نتیجهٔ عملی دارد که ارزشش
از خودِ پیشنهاد بیشتر است: **همان جدول تخصیص، اگر همین حالا ساخته شود، خودش دفترِ داده‌ای است که
سه ماه بعد بشود از رویش یاد گرفت.** یعنی ترتیبِ درست این است: اول ثبت، بعد یادگیری. هر ادعایی
که بگوید نسخهٔ اول می‌تواند پیشنهاد بدهد، دروغ است.

---

## Numbers

هر عدد با دستوری که تولیدش کرد. همه با `PGOPTIONS="-c default_transaction_read_only=on"` روی
`docker exec -u postgres afrakala-lan-db psql -d afrakala`.

```sql
-- مقیاسِ دو طرف
with paid_quote as (
  select prl.quote_id as doc_id, sum(prl.amount) as confirmed_paid_amount
  from payment_receipt_links prl join payment_receipts pr on pr.id=prl.receipt_id
  where prl.quote_id is not null
    and pr.status = any(array['approved','verified','confirmed','posted'])
  group by 1)
select count(*), count(distinct q.customer_id)
from sales_quotes q left join paid_quote p on p.doc_id=q.id
where q.status='accepted'::sales_quote_status
  and greatest(q.final_amount - coalesce(p.confirmed_paid_amount,0),0) > 0;
--> 8 | 3          (هشت ردیف مطالبات، سه مشتری)

select count(*), count(distinct supplier_id) from purchases where paid_at is null;
--> 317 | 6        (سیصد و هفده خرید پرداخت‌نشده، شش تأمین‌کننده)

select 'persons',count(*) from persons union all select 'customers',count(*) from customers
union all select 'suppliers',count(*) from suppliers
union all select 'purchases_total',count(*) from purchases
union all select 'purchases_paid',count(*) from purchases where paid_at is not null;
--> persons 93 | customers 91 | suppliers 15 | purchases_total 317 | purchases_paid 0
```

**۰ از ۳۱۷ خرید پرداخت‌شده است.** علتش پیدا شد و **نقص کد نیست، نقص استفاده است**:

```sql
select 'vouchers_total', count(*)::text from payment_vouchers
union all select 'vouchers_with_purchase', count(*)::text from payment_vouchers where purchase_id is not null
union all select 'voucher_statuses', string_agg(distinct status,',') from payment_vouchers;
--> vouchers_total 12 | vouchers_with_purchase 0 | voucher_statuses approved
```
تنها تابعی که `purchases.paid_at` را ست می‌کند `pay_purchase_with_voucher` است
(`UPDATE public.purchases SET paid_at = COALESCE(paid_at, now()) WHERE id = _purchase_id`،
خط ۱۱۴–۱۱۶ از `prosrc`)، از UI هم وصل است
(`src/lib/treasury/queries.ts:231` ← `/accounting/purchase-payments`) — و **هیچ‌وقت با یک خرید
استفاده نشده**: هر ۱۲ حواله `purchase_id IS NULL` دارند. **پس صفحهٔ پرداختنی‌ها امروز کل تاریخچهٔ
خریدِ شرکت را بدهیِ باز نشان می‌دهد.**

```sql
-- جدول‌های خالیِ مرتبط
select count(*) from mutual_settlements;          --> 0
select count(*) from capital_allocation_ledger;   --> 0
select count(*) from call_logs;                   --> 0
select count(*) from credit_requests;             --> 0
select count(*) from document_status_history;     --> 0
select count(*) from dual_documents;              --> 8   (همه status='approved')
select count(*) from bank_accounts;               --> 2   (حساب‌های خودمان)
select count(*) from external_parties;            --> 1
select count(*) from tasks;                       --> 11
select count(*) from audit_logs;                  --> 50607

-- انواع شناسه‌های اشخاص
select kind, count(*) from person_identifiers group by 1 order by 2 desc;
--> mobile_e164 36 | asan_person_code 19        (iban مجاز است ولی صفر ردیف)

-- پوششِ زمانیِ امتیازها
select period_month, entity_type, count(*), count(distinct entity_id)
from dynamic_entity_scores group by 1,2 order by 1,2;
--> 2026-07-01 customer 38/5 | 2026-07-01 salesperson 17/3
--> 2026-08-01 customer 53/6 | 2026-08-01 salesperson 42/7      (شهریور: هیچ)

-- ورودی نقدی روزانه
select capital_date from daily_capital_inputs order by 1;   --> 2026-07-20, 2026-07-22
select count(*) from daily_capital_settings;                --> 19 (آخرین 2026-08-31)

-- دفتر مهاجرت‌ها — بدون اختلاف
select count(*) from supabase_migrations.schema_migrations;  --> 641
ls supabase/migrations/*.sql | wc -l                         --> 641
```

**یادداشت اندازه‌گیری:** `select count(*) from vw_customer_receivables` به‌عنوان `postgres`
عدد **۰** برمی‌گرداند، چون هر دو view با
`WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid())` بسته شده‌اند و `auth.uid()`
برای superuser تهی است. اعداد بالا از **همان پرس‌وجوی درونیِ view** گرفته شده‌اند، نه از خود view.

---

## Contradictions with prior art

**۱. `compute_daily_capital` دیگر بدون فراخواننده نیست.**
کار قبلی: «**و هیچ‌جای برنامه آن را صدا نمی‌زند**» —
`docs/research/allocation-workbench-findings-20260904.md:17` (اندازه‌گیری ۲۰۲۶-۰۹-۰۴ @ `c816eea4`).
اندازه‌گیری امروز @ `eb6b6f64`: `src/hooks/capital/useDynamicCapital.ts:311` آن را
`supabase.rpc("compute_daily_capital", { p_capital_date })` صدا می‌زند و
`src/routes/_app.accounting.dynamic-capital.tsx:645` کارتش را می‌سازد. **هر دو درست‌اند؛
waveٔ ۴ (آیتم W-1) در فاصلهٔ این دو اندازه‌گیری آن را وصل کرد.** با این حال اثر عملی‌اش امروز
صفر است چون `daily_capital_inputs` برای تاریخ‌های جاری ردیفی ندارد و کارت عمداً ساکت می‌ماند.

**۲. «امتیازدهی `call_logs` را نمی‌خواند» — نیمه‌درست.**
حسابِ امتیاز واقعاً از `call_logs` عدد نمی‌خواند (`compute_employee_score` از
`staff_daily_performance_metrics` می‌خواند و در کامنتش دلیلش را نوشته). ولی **یک تریگر زندهٔ
`AFTER INSERT OR DELETE OR UPDATE` روی `call_logs` هست** (`trg_call_logs_recompute_employee_score`)
که هر نوشتنی را به بازمحاسبهٔ امتیاز وصل می‌کند. برای هر تصمیمی دربارهٔ استفاده از این جدول،
تفاوت این دو مهم است.

**۳. ادعای «ردیف تخصیص وجود ندارد» — تأیید شد، با شواهد مستقل.**
کار قبلی این را گفته بود؛ من آن را به ارث نبردم و با سه جست‌وجوی مستقل (نامِ ستون، ساختارِ کلید
خارجی، نامِ رابطه) دوباره رسیدم به همان نتیجه. **موافقت، نه تناقض.**

**۴. آنچه کار قبلی نگفته بود و اضافه می‌کنم:** ۰ از ۳۱۷ خرید پرداخت‌شده است و ۰ از ۱۲ حواله به
خرید وصل است — یعنی عددِ ستون چپِ میز امروز قابل‌اتکا نیست. این مستقل از هر اصلاحِ کدی است.

---

## Coverage · UNVERIFIED / UNKNOWN

**Preflight — اول و آخر، بدون تغییر:**
```
git worktree list --> 9 worktree؛ درخت اصلی D:/AfraKalaTest/app @ eb6b6f64 [staging]
git status --porcelain (اول و آخر یکسان):
?? docs/missions/wave2-credit/
?? docs/research/authenticated-open-functions-20260905.md
?? docs/research/ocr-gap-20260905.md
?? docs/research/phone-gap-20260905.md
?? docs/research/scoring-engine-zero-parameters-20260905.md
?? docs/research/three-gaps-merged-20260905.md
git rev-parse HEAD (اول و آخر) --> eb6b6f6455fad5f47aa2c93a1f62eb03f99a1dd7
```
**هیچ شاخه‌ای عوض نشد، هیچ stash ای زده نشد، هیچ فایلی جز همین سند نوشته نشد.** درخت اصلی در
تمام مدت روی `staging` ماند و زیر پای من تکان نخورد.

### حکم هر زیربند

| بند | موضوع | حکم |
|---|---|---|
| Q1.1 | مطالبات و پرداختنی با سررسید | **exists-works** · ۲۲ و ۲۰ ستون، هر دو با مبلغ/سررسید/معوق/سطل. اصلاحات waveٔ ۳ (۴۵۷، ۴۵۸) در تعریف زنده تأیید شد. **مقیاس پوشش نمی‌دهد: ۳ مشتری در برابر ~۵۰، ۶ تأمین‌کننده در برابر ~۲۰** |
| Q1.2 | `compute_daily_capital` | **exists-works · وصل شده** · `STABLE`، هیچ نوشتنی، گارد نقش سه‌گانه، `due_today_*` هر دو طرف. تناقض ۱ بالا |
| Q1.3 | `can_issue_customer_invoice` | **exists-works** · بله، «آیا این شخص معوق است» را با مبلغ و تعداد و قدیمی‌ترین سررسید و متن فارسی پاسخ می‌دهد |
| Q2.1 | جست‌وجوی جدول نگاشت | **absent** · سه جست‌وجوی مستقل، هر سه خالی |
| Q2.2 | `dual_documents` سند است یا برنامه | **سند** · `tracking_number NOT NULL` + `CHECK`، و نام قید `record_only_shape_chk` |
| Q2.3 | آیا تسویهٔ متقابل کافی است | **نه** · یک شخص در برابر چند به چند، با نقل‌قول از بدنه و از تصمیم مکتوب مهاجرت ۳۶۰ |
| Q3.1 | جدول «قول» | **absent** · سه عبارت از پنج عبارتِ مالک صفر برخورد؛ هیچ enum مرتبطی |
| Q3.2 | مکانیزم تاریخچه | **exists-works** · `audit_logs` (۵۰٬۶۰۷)، `customer_credit_ledger`، الگوی `*_status_history`. و: دروازهٔ `is_valid_audit_entity_type` مرده است، پس مانعی نیست |
| Q3.3 | `call_logs` برای پیگیری | **بن‌بست** · ۰ ردیف، شکل غلط (ستون نتیجه ندارد)، و یک تریگر امتیاز روی آن |
| Q4.1 | نسبت با `hold_credit` | **محور متفاوت** · `reference_type='sales_quote'`، سقف خرید یک نفر، نه جریان میان دو نفر |
| Q4.2 | آیا `held_amount` همان است | **نه — همیشه ۰** · از `capital_allocation_ledger` می‌آید که ۰ ردیف و ۰ نویسنده دارد |
| Q5.1 | مکانیزم پیشنهاد موجود | **موتور امتیازدهی هست** (۱۰ پارامتر مشتری، ۶ فروشنده، فعال) ولی هدفش سقف اعتبار است نه تخصیص. برای تخصیص: **صفر** |
| Q5.2 | آیا سه ماه داده هست | **نه** · جدول تصمیم اصلاً نیست؛ نزدیک‌ترین‌ها ۲ ماه و ۶ مشتری |
| Q6.1 | صفحه‌های موجود | **exists-works** · ۸ مسیر فهرست شد؛ **هیچ‌کدام دو طرف را کنار هم ندارد** |
| Q6.2 | مرکز مالی | **exists-works** · ۱۸ مقصد، هر دو طرف حاضر؛ ورودیِ طبیعیِ میز است |

**۱۵ از ۱۵ زیربند حکم دارد.**

### UNVERIFIED / UNKNOWN

1. **[?] رفتار واقعیِ viewها زیر JWT کاربر واقعی.** همه‌چیز به‌عنوان `postgres` خوانده شد و
   `auth.uid()` تهی بود، پس هر دو view صفر ردیف دادند. اعداد از پرس‌وجوی درونی گرفته شد. یک
   probe رفتاری با `SET LOCAL "request.jwt.claims"` **عمداً اجرا نشد** — قاعدهٔ probe در بریف.
2. **[?] آیا شیت واقعیِ حانیه ستون‌های دیگری هم دارد** که در مصاحبه نیامده. من شیت را ندیده‌ام؛
   فقط توصیف مالک را دارم.
3. **[?] معنای «Asan code» در ستون‌های میز.** سیستم سه چیز دارد که به این اسم نزدیک‌اند —
   `person_identifiers.kind='asan_person_code'` (۱۹ ردیف)، `bank_accounts.asan_code`، و
   `asan_control_accounts` (۱ ردیف). کدام‌یک منظور مالک است، معلوم نیست.
4. **[?] چرا ۰ از ۳۱۷ خرید پرداخت‌شده است** — از داده نمی‌شود فهمید که آیا پرداخت‌ها واقعاً
   خارج از سیستم انجام می‌شوند، یا صفحهٔ `/accounting/purchase-payments` هرگز استفاده نشده، یا
   داده‌ٔ تستی است. **این را فقط حسابدار می‌تواند بگوید و پیش از هر ساختی باید پرسیده شود.**
5. **[?] آیا `sales_quotes` تنها منبع طلب است.** مطالبات فقط از پیش‌فاکتورهای `accepted` ساخته
   می‌شود؛ اگر طلبی خارج از این مسیر وجود دارد، میز آن را نخواهد دید.
6. **UNVERIFIED — هیچ ادعایی دربارهٔ سامانهٔ اصلی.** به `192.168.170.10` وصل نشدم.

---

## وضعیت گزارش

`COMPLETE` — هر ۱۵ زیربند Q1..Q6 حکم دارد، هر «باید ساخته شود» با جست‌وجویی که چیزی نیافت
همراه است، و هیچ چیزی نوشته یا تغییر داده نشد جز همین فایل.

**هیچ schema ای پیشنهاد نشد و هیچ پیاده‌سازی‌ای طراحی نشد** — طبق بریف، آن بعد از پاسخ مالک
نوشته می‌شود.
