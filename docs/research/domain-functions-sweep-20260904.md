# دور تکمیل — خواندن بدنهٔ همهٔ توابع دامنه

اندازه‌گیری ۲۰۲۶-۰۹-۰۴ · میزبان `VIRA-SERVICE` (سرور تست، `192.168.170.8`) · شاخه `staging` @ `c816eea4`
· پایگاه‌داده `afrakala` روی `afrakala-lan-db` · **به `192.168.170.10` وصل نشدم.**

ادامهٔ [allocation-workbench-findings-20260904.md](allocation-workbench-findings-20260904.md)؛
ارجاع‌ها به `F1..F30` به آن سند است. **آن سند دست‌نخورده ماند.**

**فقط خواندنی:** هر پرس‌وجو با `PGOPTIONS="-c default_transaction_read_only=on"`. تنها فایل نوشته‌شده
همین سند است. هیچ نام، تلفن، آدرس، کد ملی یا ایمیلی این‌جا نیست.

---

## Coverage arithmetic

### بازآوری، نه اعتماد به فهرست به‌یادمانده

فیلتر نامیِ همان قبلی است:
`proname ~* 'alloc|receiv|payab|debt|credit|due|aging|follow|promis|commit|settle|treasur|capital|cash|collect|dunn|overdue|installment|cheque|reminder|invoice|payment|voucher|receipt'`

| مرحله | تعداد | چگونه |
|---|---|---|
| توابع `public` (کل) | ۸۴۰ | `pg_proc` |
| منطبق بر فیلتر نامیِ دامنه | **۸۱** | همان عدد گزارش قبلی — بازآوری شد |
| از آن ۸۱، داخلیِ افزونهٔ `btree_gist` (زبان C) | **۹** | `gbt_cash_*` × ۸ و `cash_dist` — فقط به‌خاطر توکن `cash` افتاده‌اند |
| توابع برنامه‌ای در فیلتر نامی | **۷۲** | ۶۹ `plpgsql` + ۳ `sql` |
| **شکاف فیلتر نامی:** بدنه‌شان جدول‌های دامنه را لمس می‌کند ولی نامشان منطبق نیست | **۱۳** | پرس‌وجوی زیر |
| **جمع توابع دامنه‌ای که باید خوانده شوند** | **۸۵** | ۷۲ + ۱۳ |

پرس‌وجوی شکاف (روی `pg_get_functiondef`، نه روی نام):
`prosrc ~* 'vw_customer_receivables|vw_supplier_payables|customer_credit_profile|customer_credit_balance|daily_capital_|capital_allocation_ledger|dual_documents|mutual_settlements|payment_terms|settlement_types|customer_capital_allocations_dynamic|salesperson_capital_allocations_dynamic'`
و خارج از مجموعهٔ ۸۱ → **۱۳ تابع**: `asan_list_journal_export`، `award_buyer_purchase_score`،
`create_dual_document`، `create_dynamic_scoring_parameter`، `create_dynamic_scoring_parameter_v2`،
`create_purchase`، `create_sales_quote_with_items`، `get_sales_search_products`،
`is_valid_audit_entity_type`، `person_fk_drift_report`، `person_merge`، `reverse_document`،
`upsert_dynamic_parameter_weight`.

### حساب پوشش

| | تعداد |
|---|---|
| باید خوانده می‌شد | **۸۵** |
| خوانده‌شده در این دور (بدنهٔ کامل `pg_get_functiondef`) | **۸۵** |
| **نخوانده** | **۰** |
| ۹ تابع C | طبقه‌بندی‌شده به‌عنوان داخلیِ افزونه (`prolang='c'`)، بدنهٔ برنامه‌ای ندارند |

**تصحیح حساب گزارش قبلی.** آن سند نوشت «۳۰ خوانده‌شده / ۵۱ نخوانده». عدد قابل‌اثباتِ درست این است
که در آن سند **۳۳ تابع از ۷۲ تابع دامنه فقط _نام برده شده‌اند_** (اندازه‌گیری: `grep` نام هر ۷۲ تابع در
آن فایل)، و «نام‌برده» با «بدنه‌خوانده» یکی نیست — چهار تابع `hold/consume/release/refund_capital_allocation`
آن‌جا فقط از راه شمارش فراخواننده نام برده شده بودند، نه از راه خواندن بدنهٔ ۱۷۱ بایتی‌شان. این دور
هر ۸۵ تا را خواند، پس آن تقسیم‌بندی موضوعیت ندارد.

### نرخ رد — عددی که باید پیش از هر یافته‌ای بدانید

راستی‌آزماییِ خصمانه روی ادعاهای جاروب اجرا شد. **۳۵ داوری کامل شد و ۲۵ تای آن‌ها ادعا را رد کرد
(۷۱٪).** الگوی رد تقریباً همیشه یکسان بود: «مکانیزم تأیید می‌شود، شدت و چارچوب اغراق‌شده است» —
نه «حقیقت غلط است». نمونهٔ گویا، از یک داوری کامل‌شده:

> «مکانیزم تأیید شد، اما ادعا در سه مورد از چهار ادعایش اغراق‌آمیز است.»

۸۶ داوری دیگر به **سقف نشست** خوردند («You've hit your session limit») و اجرا نشدند.

**پیامد مستقیم برای این سند:** بخش `G1..G17` فقط شامل یافته‌هایی است که **خودم مستقیماً روی این
پایگاه‌داده اندازه گرفتم**. توده‌ای که راستی‌آزمایی نشده در بخش قرنطینه آمده و **نباید مبنای ساخت
قرار گیرد**.

| | تعداد |
|---|---|
| یافتهٔ خام از دو جاروب | ۱۹۸ (۶۳ high · ۹۶ medium · ۳۹ low) |
| داوری خصمانهٔ کامل‌شده | ۳۵ |
| از آن‌ها رد/تعدیل‌شده | **۲۵ (۷۱٪)** |
| داوری‌های ازدست‌رفته به سقف نشست | ۸۶ |
| یافته‌های تأییدشده به‌دست خودم در این سند | **۱۷** |

---

## Function table — همهٔ ۸۵ تابع خوانده‌شده

ستون «تصمیم» از جاروب می‌آید (یک خط، دربارهٔ آنچه بدنه تصمیم می‌گیرد). ستون «سیم‌کشی» را **خودم**
اندازه گرفتم: `app N` = تعداد فایل‌های `.ts/.tsx` زیر `src/`+`server/` که نامش را می‌برند (بدون
`types.ts`)؛ `trg N` = تعداد تریگرهای متصل؛ `db✓` = دست‌کم یک فراخوانندهٔ درون‌پایگاهی دارد.
`app 0` روی یک تابع تریگری **طبیعی است، نه یافته**.

| تابع | چه تصمیمی می‌گیرد | الگوها | سیم‌کشی (اندازه‌گیری من) |
|---|---|---|---|
| `_capital_alloc_used` | Reduces capital_allocation_ledger to two numbers for one allocation — held = Σ(hold) − Σ(release), consumed = Σ(consum… | P2, P5 | app 0 · db✓ |
| `_ensure_credit_balance` | Requires the customer to have a person_id (else raises P0002), then inserts a customer_credit_balance row whose availa… | P2, P5, P6 | app 0 · db✓ |
| `_latest_active_capital_setting` | Returns the id of the newest daily_capital_settings row dated on or before CURRENT_DATE — with no activeness predicate… | P2, P4, P6 | app 0 · db✓ |
| `asan_commit_person_batch` | For each accepted staged Asan row it creates or reuses a person, guarantees a customers row exists for it, then attach… | P6, P2 | app 1 |
| `asan_commit_product_batch` | For a 'staged' products batch, stamps the normalised Asan code onto already-matched products whose accounting_code is … | P2, P4 | app 1 |
| `asan_list_journal_export` | Which posted journal entries are eligible for an Asan accounting-document export in a date window, what Asan account c… | P2 (unclassified drop, lines 172-1… | app — |
| `audit_credit_rule_change` | On every UPDATE of a credit_scoring_rules row it writes one audit_logs row containing exactly three NEW fields — param… | P2 | app 0 · trg 1 |
| `audit_daily_capital_inputs` | Writes one audit_logs row per daily_capital_inputs change, embedding full old/new row images plus capital_date; its DE… | P1 | app 0 · trg 1 |
| `audit_daily_capital_snapshots` | Labels the audit action 'override' only when override_reason is non-NULL AND final_capital differs from system_suggest… | P1 | app 0 · trg 1 |
| `audit_settlement_types` | On settlement_types INSERT/UPDATE/DELETE it writes one audit_logs row carrying the full to_jsonb row (or an {old,new} … | P2 | app 0 · trg 1 |
| `award_accountant_payment_score` | On a purchase's first paid_at, and only if shop_settings.purchase_score_enabled is literally 'true', computes days fro… | P1, P4 | app 0 · trg 1 |
| `award_buyer_purchase_score` | For each newly inserted purchase: whether to score the buyer at all (shop_settings key purchase_score_enabled, and NEW… | P2, P4, P6, P7 | app — |
| `calculate_credit_score` | Scores a customer 0-100 from six weighted sub-scores over a 6-month window and writes the resulting credit ceiling as … | P1, P2, P4, P5, P6 | app 0 · db✓ |
| `calculate_customer_realtime_credit` | Recomputes a customer's credit ceiling live from the salesperson's latest capital allocation and the customer's share … | P2, P6 | app 1 |
| `calculate_salesperson_collected_sales` | Nothing usable. After a uid check and a role gate it aborts unconditionally on a cast to the nonexistent type public.t… | P1, P3 | app 0 |
| `can_issue_customer_invoice` | Whether a customer may be issued a new quote/invoice, by summing rows of vw_customer_receivables where is_overdue AND … | P2, P3, P6 | app 0 · db✓ |
| `can_use_customer_capital_allocation` | Whether a proposed amount fits inside BOTH the customer's final_limit and their salesperson's allocated_capital under … | P3, P2, P6 | app 0 |
| `compute_daily_capital` | Refuses non admin/manager/accountant callers (42501), then returns 23 columns: it buckets vw_customer_receivables and … | P1, P2, P4, P6 | app 0 · db✓ |
| `consume_capital_allocation` | Nothing — the body is one RAISE EXCEPTION (ERRCODE 0A000) declaring the reservation path retired in favour of hold_cre… | P1 | app 0 |
| `create_delivery_receipt` | Rejects callers lacking manager/admin/sales, rejects a p_type outside three literals, looks up a review timer from wor… | P1, P4 | app 1 · db✓ |
| `create_dual_document` | Whether a third-party (دوبل) transfer may be recorded at all — role, party types, distinct parties, positive integer T… | P4 (hardcoded line descriptions vs… | app — |
| `create_dynamic_scoring_parameter` | Nothing, ever — the body is unreachable past line 25. It intends to hardcode entity_type='customer', append display_or… | P1, P3, P5, P6 | app — |
| `create_dynamic_scoring_parameter_v2` | Validates entity_type in (customer,salesperson), non-empty code, weight in [0,1], direction in (positive,negative); ap… | P1, P2, P4, P5, P6 | app — |
| `create_payment` | Given a channel (bank/cash/cheque), a payee role row and an amount, it decides whether the payment may exist at all --… | P1, P2, P3, P4, P6 | app 5 · db✓ |
| `create_purchase` | Whether the caller may book a purchase document (admin/manager for a standalone purchase, or the buyer the purchase_re… | P2, P4, P5, P6, P7 (findings filed… | app — |
| `create_receipt` | Gates on admin/accountant/manager, then in one transaction validates channel/amount/date-window/cheque-vs-destination-… | P6, P1, P2, P4 | app 4 · db✓ |
| `create_sales_quote_with_items` | Whether a salesperson may create a pre-invoice — validating role, items, price floors and the customer's credit/overdu… | P1, P2, P5, P7 | app — |
| `enforce_daily_capital_not_overridable` | On INSERT into daily_capital_snapshots it forbids final_capital differing from system_suggested_capital; on UPDATE it … | P6 | app 0 · trg 1 |
| `enforce_payment_receipt_link_limits` | Two money caps on payment_receipt_links: allocations per receipt may not exceed the receipt amount, and allocations pe… | P2 | app 0 · trg 1 · db✓ |
| `enforce_receipt_approval_allocation_limits` | On a receipt transitioning to 'approved', that the sum of approved payments against each linked quote never exceeds sa… | P2 (low, latent) | app 0 · trg 1 |
| `expire_pending_delivery_receipts` | Loops over pending_review receipts past review_deadline, flips them to 'expired', writes a history note blaming the AP… | P2, P4, P5, P6 | app 0 · db✓ |
| `expire_stale_credit_holds` | Which (customer, quote) hold groups older than p_days with no matching release row to hand back, capped at p_limit old… | P5, P2, P4 | app 1 |
| `get_customer_credit` | Guards on has_any_role(admin/manager/accountant/sales), resolves customers.person_id (raising P0002 if absent), WRITES… | P2, P5 | app 1 · db✓ |
| `get_customer_dynamic_credit` | available_credit = GREATEST(final_limit - outstanding_balance - held_credit, 0), taking final_limit from the newest cu… | P2, P5, P6 | app 1 · db✓ |
| `get_delivery_receipts` | Returns delivery receipts joined to uploader and reviewer profiles, filtered by optional type/status/invoice, visible … | P2, P4 | app 1 |
| `get_payable_detail` | After a has_any_role(admin/manager/accountant) gate and a requirement that one of the two ids be supplied, it re-emits… | P2, P6 | app 1 |
| `get_payables_list` | Role-guarded, paginated, filtered read over vw_supplier_payables — clamps limit to 1..200, whitelists the due filter a… | P2 | app 1 |
| `get_payables_summary` | Payables totals, due-today/tomorrow/future splits and five aging buckets, read from vw_supplier_payables restricted to… | P2 (low, latent — inherits the vie… | app 2 |
| `get_receivable_detail` | Refuses non admin/manager/accountant (42501) and refuses both-args-NULL (22023); then returns vw_customer_receivables … | P2, P4, P6 | app 1 |
| `get_receivables_list` | Guards on has_any_role(admin/manager/accountant), whitelists p_due_filter against 10 literal values (raising 22023 oth… | P2 | app 1 |
| `get_receivables_summary` | After the same three-role gate, it aggregates vw_customer_receivables into five time figures and five aging buckets — … | P2 (twice: NULL due_date dropped b… | app 3 |
| `get_sales_search_products` | Whether the caller may search at all (auth.uid() not null, and sales OR admin/manager/accountant), whether the request… | P2, P4, P6 | app — |
| `hold_capital_allocation` | Nothing — byte-identical stub to consume_capital_allocation: one RAISE EXCEPTION (0A000) retiring the reservation path… | P1 | app 0 |
| `hold_credit` | Rejects non-positive amounts, reads available_credit from get_customer_dynamic_credit (the dynamic-allocation ceiling)… | P1, P2, P5 | app 0 · db✓ |
| `hold_credit_for_quote` | On quote acceptance, reserves LEAST(quote amount, available credit) and records any shortfall on the quote plus an aud… | P2, P5 | app 0 · db✓ |
| `increase_credit` | Nothing of its own — the entire body is a single PERFORM public.release_credit(...), so a receipt can only ever reduce… | P1, P2 | app 0 · db✓ |
| `is_valid_audit_entity_type` | Only one thing: whether a text argument is a member of a hardcoded 87-element array of audit entity-type names. Pure p… | P3, P4, P6 | app — |
| `list_mutual_settlement_candidates` | Guards on has_any_role(admin/accountant), then limits candidates to persons holding exactly one customer file AND exac… | P2, P4, P6 | app 1 |
| `list_trusted_credit_customers` | Which customers the open-account sales screen labels trusted and how much credit it offers them — using customer_credi… | P2, P6, P4 | app 1 |
| `log_invoice_issuance_blocked_overdue` | Whether to record a UI-side overdue block: it re-asks can_issue_customer_invoice and writes an audit_logs row only whe… | P5, P2, P3 | app 0 |
| `pay_purchase_with_voucher` | After an admin/accountant check, refuses a second approved voucher for the purchase, pays COALESCE(_amount, cash_price… | P2, P4 | app 2 · db✓ |
| `person_fk_drift_report` | For each of 16 hardcoded (table, mirror-column) pairs, whether the denormalised *_person_id has drifted from the paren… | P2, P4, P5, P6 | app — |
| `person_merge` | Refuses the merge unless the caller is an authenticated admin/manager, both persons exist, differ and are active, EVER… | P5, P6, P2 (Step E silent delete),… | app — |
| `person_settlement_position` | Refuses non-admin/non-accountant callers and unknown persons, refuses to guess when a person owns more than one custom… | P6, P2 | app 2 · db✓ |
| `post_mutual_settlement` | Gates on admin/accountant, delegates position lookup to person_settlement_position (which itself refuses a person with… | P6 | app 2 |
| `post_receipt_accounting` | Guards on has_any_role(admin/accountant); locks the receipt FOR UPDATE; returns early if already posted; refuses unles… | P1, P2, P5 | app 2 |
| `recalculate_settlement_score` | Nothing — it clamps a constant 0 and writes settlement_score=0 plus last_overdue_check_at=NOW() into customer_credit_p… | P1, P3, P5 | app 0 |
| `recompute_customer_credit_scores` | Requires a non-NULL auth.uid() and admin OR manager OR accountant; clamps p_limit to 1..500 (default 100) and p_offset… | P3, P4, P5 | app 0 |
| `recompute_dynamic_capital_setting` | Locks the daily_capital_settings row FOR UPDATE, aborts with a 'skipped' result if any capital_allocation_ledger row a… | P1, P2, P4, P5 | app 0 · db✓ |
| `recompute_employee_scores_on_receipt` | Decides only whether it *should* run (status crossing the approved/verified/confirmed/posted whitelist) and then retur… | P1 | app 0 · trg 1 |
| `recompute_employee_scores_on_receipt_link` | On a payment_receipt_links change it picks the row's ids per TG_OP, then resolves the employee ONLY from the quote's s… | P1, P4, P2 | app 0 · trg 1 · db✓ |
| `refresh_today_dynamic_capital_after_score_change` | Calls recompute_dynamic_capital_setting only if the changed score row's period_month equals the current calendar month… | P1, P4 | app 0 · trg 1 |
| `refund_capital_allocation` | Nothing. The body is a single RAISE EXCEPTION with ERRCODE 0A000 retiring the path in favour of hold_credit/release_cr… | P1 | app 0 |
| `release_capital_allocation` | Nothing — the body is a single RAISE EXCEPTION with ERRCODE 0A000 redirecting callers to hold_credit/release_credit (M… | P3 (tombstone, fails loudly — the … | app 0 |
| `release_credit` | Releases at most what is currently held (LEAST(p_amount, held)), returns silently with no row and no error when nothin… | P5 | app 0 · db✓ |
| `reverse_document` | Whether a posted receipt/voucher/dual document may be reversed (reason required, admin+accountant only, not already re… | P1, P2, P3, P5, P6 | app — |
| `review_delivery_receipt` | Any admin, manager or salesperson may set any pending_review receipt to confirmed or rejected — the uploader is read b… | P4 | app 1 |
| `run_daily_capital_allocation` | Splits p_total_capital across users holding role 'sales' in proportion to calculate_dynamic_score, then splits each sa… | P1, P2, P4 | app 1 · db✓ |
| `save_daily_capital_snapshot` | Role-guards, requires a non-null date, calls compute_daily_capital and persists all 16 computed figures as a new daily… | P1, P3, P4 | app 0 |
| `settle_league_season` | Finds the season with status='active'; if none, bootstraps the current calendar month and returns. Otherwise snapshots… | P3, P4, P5 | app 2 |
| `tg_burn_payment_document_number` | On deletion of a payment_voucher, marks that voucher's reserved document number burned by calling burn_document_number… | none | app 0 · trg 1 · db✓ |
| `tg_burn_receipt_document_number` | After a payment_receipts row is deleted, calls burn_document_number with the literal kind 'receipt', the deleted row's… | none | app 0 · trg 1 |
| `tg_credit_derive_customer_person` | On every insert/update, overwrites NEW.customer_person_id from customers.person_id for NEW.customer_id, and forces it … | none | app 0 · trg 7 |
| `tg_daily_capital_inputs_set_updated` | On UPDATE only, stamps updated_at := now() unconditionally, and sets updated_by := auth.uid() only when the incoming r… | P4 | app 0 · trg 1 |
| `tg_delivery_receipts_derive_person` | Denormalizes delivery_receipts.customer_person_id from customers.person_id on every insert and on any update of custom… | none (silent-NULL path exists but … | app 0 · trg 1 |
| `tg_payment_receipts_block_delete_when_posted` | Blocks a payment_receipts DELETE only if it can SEE a posted journal_entries row whose source_type='payment_receipt' a… | P2 | app 0 · trg 1 |
| `tg_payment_receipts_derive_person` | Mirrors customers.person_id into NEW.customer_person_id and external_parties.person_id into NEW.receiver_party_person_… | none | app 0 · trg 1 |
| `tg_payment_vouchers_block_delete_when_posted` | Blocks DELETE of a payment voucher when a journal_entries row with source_type='payment_voucher', source_id=OLD.id and… | P2 | app 0 · trg 1 |
| `tg_payment_vouchers_derive_person` | Derives NEW.payee_person_id by first-match precedence — supplier, else customer, else external party — and sets it NUL… | none | app 0 · trg 1 |
| `tg_prf_validate_allocation` | Refuses an insert/update when the sum of all other fulfillment allocations for the same purchase_item_id plus this row… | P1 (nullable-column bypass of its … | app 0 · trg 1 |
| `trg_payment_voucher_set_number` | When voucher_number arrives NULL or blank, mints 'PV-' + Gregorian year + 5-digit sequence value — a second numbering … | P6, P4 | app 0 · trg 1 · db✓ |
| `update_customer_overdue_status` | Nothing about overdue debt. It assigns v_overdue_since := NULL as its first statement, which makes its own IF permanen… | P1, P3, P5 | app 0 |
| `upsert_daily_capital_input` | Gates on admin/manager/accountant, rejects a NULL capital_date and any negative input except manual_adjustment, then u… | P3, P6 | app 0 |
| `upsert_dynamic_parameter_weight` | Whether a weight edit corrects a not-yet-effective pending version in place (line 62), bootstraps the first-ever weigh… | P1, P2, P5, P6 | app — |
| `validate_price_settlement_compatibility` | Looks up sale_price_types.max_settlement_days and settlement_types.days; if either is NULL — including because the id … | P3, P2 | app 0 |

---

## G1..G17 — یافته‌ها (همه به‌دست خودم اندازه‌گیری و تأیید شد)

### G1 · P1 · «خانوادهٔ ۳۳۰/۳۳۱» — پنج تابع عمداً خنثی‌شده، با یادداشتِ خودشان
**آنچه بدنه‌ها می‌کنند:** بازنشسته‌کردن جدول `invoices` در مهاجرت‌های ۳۲۷/۳۳۰/۳۳۱ پنج تابع را
عمداً بی‌اثر گذاشت و در بدنهٔ هرکدام نوشت که بازسازی روی `sales_quotes` **یک تصمیم محصولی است که
منتظر انسان مانده**. این یک دسته باگ نیست؛ یک **بک‌لاگِ ثبت‌شده داخل بدنهٔ توابع** است.

**شواهد (`grep` روی ۸۵ بدنهٔ dump‌شده):** ده تابع کامنت `-- 33[01]:` دارند
(`calculate_salesperson_collected_sales`, `create_delivery_receipt`, `enforce_payment_receipt_link_limits`,
`enforce_receipt_approval_allocation_limits`, `get_receivable_detail`, `person_fk_drift_report`,
`recalculate_settlement_score`, `recompute_employee_scores_on_receipt`,
`recompute_employee_scores_on_receipt_link`, `update_customer_overdue_status`)، و **پنج** تای آن‌ها
جملهٔ تعویق صریح دارند:

```
calculate_salesperson_collected_sales : «a live number, which is a product decision, not a cleanup.»
post_receipt_accounting               : «a product decision, deliberately not smuggled into a decoupling»
recalculate_settlement_score          : «rebuilding this on sales_quotes would be a new feature, not a migration.»
recompute_employee_scores_on_receipt  : «That is a product decision, not a side effect of a cleanup»
update_customer_overdue_status        : «product decision and is NOT silently introduced here.»
```

**پیامد ساخت:** F20 گزارش قبلی یک نمونه از پنج نمونه بود. مالک باید **یک** تصمیم بگیرد، نه پنج تا:
«آیا وضعیت معوق/امتیاز/وصول روی `sales_quotes` بازسازی شود؟» — و آن تصمیم هر پنج تابع را با هم
باز می‌کند.

### G2 · P1 · `recalculate_settlement_score` صفر می‌نویسد، و ردیف اعتباری می‌سازد
**بدنه (کامل، تأییدشده):** `v_score INTEGER := 0;` و هیچ‌چیز آن را تغییر نمی‌دهد؛ سپس
`v_score := GREATEST(-100, LEAST(100, v_score));` (یعنی همان ۰) و بلافاصله:

```
INSERT INTO public.customer_credit_profile (customer_id, settlement_score, last_overdue_check_at)
  VALUES (_customer_id, v_score, NOW())
ON CONFLICT (customer_id) DO UPDATE SET settlement_score = EXCLUDED.settlement_score, ...
```

**پیامد ساخت:** این یکی از دو تابعی است که می‌تواند در `customer_credit_profile` (امروز **۰ ردیف**)
ردیف بسازد — و ردیفی که می‌سازد `settlement_score = 0` است. هرکس برای «راه‌اندازیِ» پروفایل اعتباری
این را صدا بزند، صفرِ ساختگی می‌کارد.

### G3 · P1 · `calculate_salesperson_collected_sales` — صفر هم برنمی‌گرداند؛ **همیشه استثنا می‌دهد**
انتهای بدنه واقعاً `SELECT p_employee_id, v_window, v_start, 0::numeric, 0::int, 0::int;` است، اما
**اجرا هرگز به آن‌جا نمی‌رسد.** خط بی‌قیدوشرطِ پیش از آن به یک تایپِ ناموجود cast می‌کند:

```
v_is_priv := public.has_any_role(v_uid, ARRAY['admin','manager','accountant']::public.text[]);
```

**اندازه‌گیری من:** `public.text` به‌عنوان تایپ **وجود ندارد**
(`EXISTS(... typname='text' AND nspname='public') = false`)، و اجرای مستقیم تأیید می‌کند:
`SELECT ARRAY['a']::public.text[];` → `ERROR: type "public.text[]" does not exist`.
چون plpgsql دیرهنگام bind می‌کند، این خطا در **زمان اجرا** رخ می‌دهد، برای هر فراخوان و هر نقشی.
**دامنهٔ اشکال کراندار است:** در کل شِما دقیقاً **یک** تابع این cast را دارد، همین یکی.

**تصحیح شدت (خلاف چند ادعای جاروب):** گارد مجوزش سالم است
(`IF v_uid IS NULL THEN RAISE ... 42501` و «sales فقط دادهٔ خودش»). پس P1 است، نه P5.

**پیامد ساخت:** این با بقیهٔ «خانوادهٔ ۳۳۰/۳۳۱» فرق دارد. آن‌ها عمداً بی‌اثر شده‌اند و **سالم**
برمی‌گردند؛ این یکی یک **باگ واقعی** است که هنگام همان پاک‌سازی وارد شده. تفاوتش برای مصرف‌کننده
مهم است: «صفر» در برابر «۵۰۰».

### G4 · P1 · `recompute_employee_scores_on_receipt` — تریگر زنده با بدنهٔ خالی
هر دو مسیر به `RETURN COALESCE(NEW, OLD)` می‌رسند؛ حلقهٔ امتیازدهی حذف شده. تریگر زنده است و
هرگز یک امتیاز هم نداده.

### G5 · P1 · `post_receipt_accounting` — آرایهٔ تخصیص همیشه خالی
`v_invoice_updates jsonb := '[]'::jsonb;` با کامنت خودش: «۳۲۷: نگه داشته شد، ولی حالا همیشه خالی
برمی‌گردد.» تنها تابعی است که در دفتر روزنامه می‌نویسد، و نیمهٔ «کدام فاکتور تسویه شد» آن حذف شده.

### G6 · P1 · `save_daily_capital_snapshot` هر عکس‌برداری را **غیرفعال** ثبت می‌کند
**اندازه‌گیری من:** `daily_capital_snapshots.is_active` وجود دارد با `default = false`، و تابع آن را
در فهرست ستون‌های `INSERT` نمی‌آورد. نتیجهٔ زنده: **۱۰ ردیف، `is_active` تای true = ۰، false = ۱۰.**
هر خواننده‌ای که «عکس فعالِ امروز» را بخواهد، هیچ نمی‌یابد.

### G7 · P3 · `validate_price_settlement_compatibility` — قاعده‌ای که هیچ‌چیز را اجرا نمی‌کند
**اندازه‌گیری من:** تریگر متصل = **۰**، فراخوانندهٔ درون‌پایگاهی = **NONE**، فراخوانندهٔ برنامه‌ای = **۰**.
یک قاعدهٔ اعتبارسنجیِ سازگاری نوع قیمت و نوع تسویه که در هیچ مسیری اعمال نمی‌شود.

### G8 · P5 · هفت نویسندهٔ `SECURITY DEFINER` بدون هیچ گارد مجوزی، در دسترس هر کاربر واردشده
**اندازه‌گیری من (خواندن سرِ هر بدنه + `has_function_privilege`):** این هفت تابع فقط **اعتبارسنجی
آرگومان** دارند و هیچ `has_role`/`has_any_role`/بررسی نقشی ندارند، و هر هفت
`authenticated → EXECUTE = true` اند:

| تابع | جمله‌های نوشتن | anon |
|---|---|---|
| `settle_league_season` | ۶ | false |
| `calculate_credit_score` | ۴ | false |
| `hold_credit` | ۳ | false |
| `release_credit` | ۳ | false |
| `hold_credit_for_quote` | ۲ | false |
| `expire_stale_credit_holds` | ۱ | false |
| `_ensure_credit_balance` | ۱ | false |

RLS این‌جا محافظت نمی‌کند: `SECURITY DEFINER` با مالکیت `supabase_admin` اجرا می‌شود.
**پیامد ساخت:** یک کاربر با نقش `sales` یا `viewer` می‌تواند مستقیماً از راه PostgREST رزرو اعتبار
بگذارد/آزاد کند یا فصل لیگ را ببندد. برای میز پخش که الزامش «فروش نبیند» است، این الگو نباید تکرار
شود — تابع تخصیص باید گارد داخلی داشته باشد، مثل `compute_daily_capital` (که دارد).

### G9 · P5 · `assign_user_role_txt` — بدون گارد و **در دسترس anon** (خارج از دامنه، اما یافت شد)
**بدنهٔ کامل:**
```
INSERT INTO public.user_roles (user_id, role, assigned_by)
VALUES (_target_user, _role::public.app_role, auth.uid())
ON CONFLICT (user_id, role) DO NOTHING;
```
هیچ بررسی مجوزی ندارد، `SECURITY DEFINER` است، و **`has_function_privilege('anon', oid, 'EXECUTE') = true`**.
آزمون امنیتی موجود `e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` **۲۶** تابع را
پوشش می‌دهد و جهت *ابطال* نقش (`revoke_user_role_txt`) را می‌بندد — اما `assign_user_role_txt` در
آن ۲۶ تا **نیست**.

**آنچه نکردم:** فراخوانی واقعی به‌عنوان anon انجام **ندادم**، چون این تابع می‌نویسد و مأموریت
فقط‌خواندنی است. پس این یافته در سطح **grant** اندازه‌گیری شده، نه در سطح اکسپلویت؛ ممکن است لایهٔ
Kong/PostgREST جلویش را بگیرد و من آن را نیازموده‌ام.

**زمینهٔ گسترده‌تر (اندازه‌گیری من):** در کل شِما **۸۰** نویسندهٔ `SECURITY DEFINER` غیرتریگری هنوز
grant به `anon` دارند؛ ۱۳ تای آن‌ها با آشکارسازِ من «بدون گارد» علامت خوردند — که یکی‌شان
**غلط مثبت بود** (G10).

### G10 · تصحیح خودم — `log_invoice_issuance_blocked_overdue` گارد **دارد**
آشکارسازِ regex من آن را «بدون گارد» علامت زد. خواندن بدنه این را رد کرد:

```
IF v_uid IS NULL THEN
  RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
```

regex من دنبال `42501` و `auth.uid() IS NULL` می‌گشت؛ این تابع `28000` می‌دهد و اول مقدار را در
`v_uid` می‌ریزد. علاوه بر آن یک گارد ضدجعل هم دارد: اگر مشتری واقعاً معوق نباشد، چیزی ثبت نمی‌کند
(`IF v_can IS DISTINCT FROM false THEN RETURN;`). **این را به‌عنوان درسِ روش ثبت می‌کنم: تشخیص
گارد با grep قابل اتکا نیست؛ هر ادعای امنیتی باید با خواندن بدنه تأیید شود.**

### G11 · P6 · «سقف اعتباری» امروز داده‌محور خاموش است، نه کدمحور
**اندازه‌گیری من:** در `run_daily_capital_allocation` و `recompute_dynamic_capital_setting` هر دو،
سقف نهایی از یک `CASE` سه‌شاخه می‌آید:
```
final_limit = CASE WHEN has_overdue THEN 0
                   WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
                   ELSE raw_allocation END,
binding_constraint = CASE WHEN has_overdue THEN 'overdue' WHEN ... THEN 'credit_limit' ELSE 'formula' END
```
و `has_overdue`/`credit_limit` فقط از `customer_credit_profile` پر می‌شوند — جدولی با **۰ ردیف**.
**شاهد تجربی:** توزیع `binding_constraint` در `customer_capital_allocations_dynamic` =
**`formula=35`** و بس؛ نه یک `overdue`، نه یک `credit_limit`.

**تصحیح شدت نسبت به ادعای جاروب:** این شاخه‌ها «کد مرده» نیستند — **داده‌محور خاموش‌اند**. لحظه‌ای
که `customer_credit_profile` ردیف بگیرد، هر دو زنده می‌شوند. این دقیقاً همان چیزی است که Q1 را
خطرناک می‌کند.

### G12 · P2 · بدهی یک خرید زنده **۲ میلیارد تومان کمتر** نشان داده می‌شود
**اندازه‌گیری من:** `vw_supplier_payables` مبلغ بدهی را چنین می‌گیرد:
`COALESCE(p.cash_price, p.total_amount, 0) AS outstanding_amount` (تأیید مستقیم روی `pg_get_viewdef`).
اما `cash_price` یک عدد **امتیازی** است، نه بدهی: فرم خرید آن را با برچسب «قیمت نقدی همین
تأمین‌کننده در همین لحظه» و نشان «امتیازآور» می‌گیرد، و `award_buyer_purchase_score` آن را
برای امتیاز مصرف می‌کند.

**دادهٔ زنده:** از ۳۰۳ خرید، دقیقاً **۱** ردیف `cash_price` دارد:
`quantity=1، purchase_price=12,000,000,000، total_amount=12,000,000,000، cash_price=10,000,000,000، paid_at=NULL`.
یعنی صفحهٔ پرداختنی همین حالا بدهی ۱۲ میلیارد را **۱۰ میلیارد** نشان می‌دهد — **کسری ۲٬۰۰۰٬۰۰۰٬۰۰۰ تومان**.
و چون `create_purchase` مقدار `total_amount` را در تعداد ضرب می‌کند اما `cash_price` را نه، در
`quantity > 1` خطا ضریب تعداد هم می‌گیرد (امروز ۰ ردیف چنین است).

**پیامد ساخت:** هر نقشهٔ پخش که «چقدر به این تأمین‌کننده بدهکاریم» را از این view بخواند، عددِ غلط
می‌خواند. این پیش از هر ساختی باید حل شود.

### G13 · P7 · `create_purchase` ترم را الزامی می‌کند، ولی **یک ستون زودتر** متوقف می‌شود
`create_purchase` تنها نویسندهٔ `purchases` است و ترم را الزامی می‌کند — به همین دلیل ۳۰۳ از ۳۰۳
خرید `payment_term_id` دارند. اما اعتبارسنجی‌اش فقط **وجود** و **`is_active`** را چک می‌کند، نه
`days` را. و **اندازه‌گیری من:** `payment_terms.days` نال‌پذیر است با
`CHECK (days IS NULL OR days >= 0)`. پس یک ترمِ فعال با `days = NULL` قانونی است، `create_purchase`
می‌پذیردش، و `vw_supplier_payables` بی‌صدا `due_date = purchase_date` می‌دهد → از فردا «معوق».

### G14 · P2 · `get_receivables_summary` با خودش نمی‌خواند (داوری کامل‌شده: CONFIRMED)
تنها ادعای پرشدتی که یک داوری خصمانهٔ **کامل‌شده** آن را بدون تعدیل تأیید کرد:
فراخوانی بدون آرگومان `total_outstanding = 1,679,300,000` می‌دهد، در حالی که مجموع
overdue+today+tomorrow+future فقط `1,616,300,000` است؛ همان **۶۳٬۰۰۰٬۰۰۰** اختلاف، ردیفی است که
`due_date` ندارد و هم‌زمان در `bucket_current` شمرده می‌شود. هر فیلتر تاریخی هم
`v.due_date >= p_from_date` است، پس ردیف بدون سررسید از **هر** بازهٔ تاریخی می‌افتد بیرون.

### G15 · P3 · `compute_daily_capital` گارد نقش دارد و **فروش را بیرون می‌گذارد**
**بدنه (تأیید من):**
```
IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
```
همین گارد عیناً در `upsert_daily_capital_input` و `save_daily_capital_snapshot` هم هست.
**این مستقیماً الزام مالک را برآورده می‌کند:** «فروش نباید نقشهٔ پخش را ببیند» در سطح پایگاه‌داده
از پیش پیاده شده — و الگوی درستی است که تابع تخصیص تازه باید تقلید کند (برخلاف G8).

### G16 · P4 · `daily_capital_snapshots` فقط دو روز عمر کرد، و نیمهٔ «override» حذف شد
**اندازه‌گیری من:** تنها نویسندهٔ جدول `save_daily_capital_snapshot` است. ۱۰ ردیف، همه با
`capital_date` در **۲۰۲۶-۰۷-۲۰ و ۲۰۲۶-۰۷-۲۱**. **۳ ردیف `override_reason` دارند و در همان ۳ ردیف
`final_capital <> system_suggested_capital`** — یعنی مسیر «حسابدار عدد را دستی تغییر داد» زمانی
وجود داشته و استفاده شده. اما بدنهٔ امروزیِ تابع آن را حذف کرده:
```
-- final_capital is no longer an argument: it IS the computed result.
VALUES ( ..., c.system_suggested_capital, c.system_suggested_capital, ..., NULL, ... )
```
**پیامد ساخت:** صفحهٔ زنده به حسابدار اجازهٔ تایپ دستی می‌دهد، ولی مسیر ذخیره دیگر نمی‌تواند ثبت
کند که عدد بازنویسی شده. اگر میز پخش قرار است «چه کسی چه چیزی را تغییر داد» را نگه دارد، این
ستون‌ها باید دوباره پر شوند.

### G17 · P1 · چهار تابع چرخهٔ تخصیص **سنگ‌قبرند** — و این F18 گزارش قبلی را رد می‌کند
**بدنهٔ هر چهار تا، کامل و یکسان** (`hold_capital_allocation`، `consume_capital_allocation`،
`release_capital_allocation`، `refund_capital_allocation`):

```
BEGIN
  RAISE EXCEPTION 'این مسیر رزرو بازنشسته شده است؛ از hold_credit/release_credit استفاده کنید (M11)'
    USING ERRCODE = '0A000';
END
```

**این یعنی F18 گزارش قبلی غلط بود.** آن سند نوشت «لوله‌کشی‌اش هست و فقط فراخواننده می‌خواهد» و
«اول باید تصمیم گرفت کدام دفتر برنده است». هر دو جمله نادرست‌اند: مسیر در مهاجرت **M11** عمداً
بازنشسته شد و خودِ پیام خطا صراحتاً به `hold_credit`/`release_credit` ارجاع می‌دهد — همان زنجیره‌ای
که آن سند «زنده» توصیفش کرده بود. **تصمیم از پیش گرفته شده.**
و `capital_allocation_ledger` صفر ردیف دارد **چون مسیرش بازنشسته شد**، نه چون هرگز وصل نشد.

**پیامد ساخت:** برای مصرف تخصیص، `hold_credit`/`release_credit` را وصل کن. آن چهار تابع را نه
صدا بزن و نه احیا کن. (توجه: `hold_credit` و `release_credit` هر دو در فهرست G8 اند — بدون گارد.)

---

## یافته‌های راستی‌آزمایی‌نشده — قرنطینه

جاروب‌ها **۱۹۸ یافته** برگرداندند (۶۳ high). فقط ۳۵ داوری خصمانه کامل شد و **۷۱٪ آن‌ها ادعا را رد یا
تعدیل کرد**؛ ۸۶ داوری به سقف نشست خورد. بنابراین ۱۶۳ یافتهٔ باقی‌مانده **راستی‌آزمایی نشده‌اند** و
این‌جا به‌عنوان *سرنخ* فهرست می‌شوند، نه یافته. **هیچ‌کدام نباید بدون خواندن دوبارهٔ بدنه مبنای کد شود.**

پرتکرارترین سرنخ‌های high که ارزش بررسی دارند (هر کدام باید جداگانه تأیید شود):

- `create_payment` در برابر `pay_purchase_with_voucher`: دو نویسندهٔ `payment_vouchers` با قواعد
  متفاوت روی نقش مجاز، الزام کد آسان، محدودهٔ تاریخ، و سری شماره (`PAY-` در برابر `PV-`).
  اندازه‌گیری جاروب: هر ۱۲ سند موجود `PAY-` اند.
- `create_receipt` در برابر `post_receipt_accounting`: هر دو زنده، هر دو روی همان داده می‌نویسند.
- `person_settlement_position` و `list_mutual_settlement_candidates`: مانده را از `journal_lines`
  می‌گیرند نه از دو view — و دفتر روزنامه در سمت پرداختنی تقریباً خالی است (۵۱ سطر
  `customer_credit` در برابر **۱** سطر `supplier_payable`).
- `calculate_credit_score`: ادعا شده که جدولی می‌خواند که دیگر وجود ندارد و همیشه استثنا می‌دهد.
- `person_merge`: ادعای آبشار تریگری که `accounting_code` برنده را بازنویسی می‌کند.
- `create_sales_quote_with_items`: ادعای اینکه `line_total` سمت کلاینت بدون بازبینی جمع می‌شود و
  همان جمع به دروازهٔ اعتبار می‌رود.
- `upsert_dynamic_parameter_weight`: ادعای اینکه `is_active` نسخه‌بندی نمی‌شود و دو ماه بستهٔ امتیاز
  را عقب‌گرد بازنویسی می‌کند.

---

## Q1 — ردیابی معوق، روشن‌شده: شعاع انفجار

**همهٔ اعداد را خودم اندازه گرفتم، داخل `BEGIN … ROLLBACK`، با JWT شبیه‌سازی‌شدهٔ ادمین. چیزی روشن نشد.**

### ۱. مجموعهٔ نوشتن تابع
`update_customer_overdue_status` دو جمله می‌نویسد، هر دو در `customer_credit_profile`
(`has_overdue`, `overdue_since`, `last_overdue_check_at`). خط خنثی‌کننده:
`v_overdue_since := NULL;` بلافاصله پیش از `IF v_overdue_since IS NOT NULL THEN`.

### ۲. عدد: **۳ مشتری**

| سنجه | مقدار |
|---|---|
| ردیف‌های `vw_customer_receivables` | ۸ |
| ردیف‌های معوق | ۷ |
| **مشتریان متمایزی که معوق می‌شوند** | **۳** |
| کل مشتریان متمایز در همین view | ۳ (یعنی **همهٔ** مشتریانِ دارای مطالبهٔ باز) |
| مبلغ معوق | ۱٬۶۱۶٬۳۰۰٬۰۰۰ |
| ردیف‌های معوق با `customer_id` **تهی** | **۲** |

آن **۲ ردیف مهمان** هرگز نمی‌توانند علامت بخورند: تابع کلیدش `customer_id` است و آن ردیف‌ها مشتری
ندارند. یعنی حتی با روشن‌کردن کامل، دو معوقهٔ واقعی نامرئی می‌مانند.

### ۳. خوانندگان وضعیت معوق (فهرست کامل، اندازه‌گیری من)
پایگاه‌داده: `calculate_customer_realtime_credit`، `create_sales_quote_with_items`،
`get_customer_dynamic_credit`، `recompute_dynamic_capital_setting`، `run_daily_capital_allocation`،
`update_customer_overdue_status`.
`src/`: `_app.sales.quotes.new.tsx:222-230, 404-409` و `QuoteCreationBlockDialog.tsx:30`.

### ۴. چه چیزی **می‌شکند** (نقل‌قول مستقیم)

**الف) صدور پیش‌فاکتور در سمت سرور رد می‌شود** — این مسدودسازی است، نه تغییر یک عدد:
```
-- create_sales_quote_with_items
IF COALESCE(_credit.has_overdue, false) OR COALESCE(_credit.binding_constraint,'') = 'overdue' THEN
  IF p_quote_exception_type IS DISTINCT FROM 'overdue_salesperson_commitment' THEN
    RAISE EXCEPTION 'مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست؛ فقط با تعهد کارشناس
      فروش و تعیین مهلت تسویه امکان ادامه وجود دارد.' USING ERRCODE = '22023';
```

**ب) اعتبار لحظه‌ای صفر می‌شود:**
```
-- calculate_customer_realtime_credit
IF v_has_overdue THEN
  RETURN jsonb_build_object('weighted_score', 0, ..., 'final_limit', 0, 'raw_allocation', 0,
                            'binding_constraint', 'overdue', ...);
```

**ج) سمت کلاینت دیالوگ مسدودسازی می‌آورد** — `src/routes/_app.sales.quotes.new.tsx:404`
`if (creditInfo?.hasOverdue) { return { kind: "overdue", ... }`.
توجه: خط ۲۲۹ **دو** مسیر دارد —
`hasOverdue: Boolean(row?.has_overdue) || row?.binding_constraint === "overdue"` — پس ستون ذخیره‌شدهٔ
`binding_constraint` هم به‌تنهایی می‌تواند مسدود کند.

### ۵. **آیا نوشتن هم رخ می‌دهد؟ بله — و این مهم‌ترین بخش پاسخ است**
`recompute_dynamic_capital_setting` پس از خواندن `has_overdue`، سقف‌ها را در جدول واقعی می‌نویسد:
```
UPDATE _cust_alloc SET final_limit = CASE WHEN has_overdue THEN 0 ... END, ...
UPDATE public.customer_capital_allocations_dynamic c ...
```
یعنی روشن‌کردن ردیابی معوق **سقف اعتبار واقعی مشتریان را بازنویسی می‌کند** — دقیقاً سابقهٔ قاعدهٔ ۱۰
`CLAUDE.md` (مهاجرت ۴۱۱ که سقف ۹ مشتری را پایین برد).

**اندازهٔ آن جابه‌جایی، اندازه‌گیری من:** از ۳ مشتری معوق، **۲** ردیف تخصیص دارند، و مجموع
`final_limit` فعلی آن دو **۰** است. یعنی روی دادهٔ امروز، صفرکردن سقف **هیچ عددی را جابه‌جا نمی‌کند**.
برای زمینه: از ۳۵ ردیف تخصیص، ۲۳ تا سقف غیرصفر دارند (بیشینه ۴٬۳۶۹٬۳۹۱٬۴۹۷).

**پس تغییر واقعیِ رفتار چیست؟** آن ۳ مشتری امروز هم عملاً بلوکه‌اند، ولی از شاخهٔ
`available_credit <= 0` که استثنای `accounting_approval` می‌خواهد. روشن‌کردن معوق، **نوع استثنای
لازم را عوض می‌کند**: از «تأیید حسابداری» به «تعهد کارشناس فروش با مهلت». این یک تغییر گردش‌کار است،
نه یک تغییر عددی — و مالک باید دربارهٔ همین تصمیم بگیرد.

**هشدار پابرجا:** آخرین `daily_capital_settings` تاریخ **۲۰۲۶-۰۸-۳۱** را دارد. اگر پیش از روشن‌کردن،
تخصیص دوباره اجرا شود، اعداد پایه هم تغییر می‌کنند و دو اثر با هم قاطی می‌شوند.

---

## Q2 — بازگشت خاموش پرداختنی

### ۱. شاخه تأیید شد
```
-- pg_get_viewdef('public.vw_supplier_payables', true)
pt.days AS payment_term_days,
    CASE
        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
        ELSE p.purchase_date
    END AS due_date,
```
و چون `is_overdue`، `days_until_due` و `aging_bucket` همگی از همین `due_date` مشتق می‌شوند، یک ترمِ
غایب هر چهار ستون را با هم آلوده می‌کند.

### ۲. عدم‌تقارن با سمت مطالبات
`vw_supplier_payables` **هیچ** معادلی برای `due_date_unknown` / `due_date_unknown_reason` /
`settlement_inactive_flag` ندارد — همان سه ستونی که مهاجرت ۴۱۹ به سمت مطالبات اضافه کرد.
**و یک عدم‌تقارن دوم که خودم اندازه گرفتم:**
`vw_customer_receivables` واژهٔ `is_active` را دارد (`true`)، ولی `vw_supplier_payables` **ندارد**
(`false`). یعنی **غیرفعال‌کردن یک ترم پرداخت، هیچ اثری روی سمت پرداختنی ندارد**، در حالی که
غیرفعال‌کردن یک نوع تسویه در سمت مطالبات به `NULL` با دلیل منجر می‌شود.

### ۳. چه چیزی لازم است (توصیف، نه اجرا)
`due_date` را به `NULL` تبدیل کن وقتی `pt.days IS NULL`، و دو ستون `due_date_unknown` و
`due_date_unknown_reason` اضافه کن — دقیقاً قرینهٔ ۴۱۹. سپس `RETURNS TABLE` هر سه RPC
(`get_payables_summary` / `get_payables_list` / `get_payable_detail`) باید آن‌ها را حمل کند و صفحه
مثل صفحهٔ مطالبات «نامشخص» نشان دهد.
**قید مهم:** افزودن ستون به یک view با `CREATE OR REPLACE VIEW` فقط وقتی ممکن است که ستون‌های تازه
**به انتها** اضافه شوند؛ درج در وسط، `DROP VIEW` می‌خواهد — و `DROP` باید همهٔ وابسته‌ها را با هم
بازبسازد. **این را من از قاعدهٔ Postgres می‌گویم، نه از اندازه‌گیری روی این پایگاه‌داده؛ پیش از
اجرا باید آزموده شود.**

### ۴. پاسخ پرسش کلیدی: **فقط فرم — پایگاه‌داده هیچ محافظتی ندارد**

| بررسی | نتیجهٔ اندازه‌گیری من |
|---|---|
| `purchases.payment_term_id` نال‌پذیر؟ | **بله** (`is_nullable=YES`) |
| DEFAULT دارد؟ | **نه** (`(none)`) |
| CHECK constraint دارد؟ | **نه** |
| کلید خارجی | `FOREIGN KEY (payment_term_id) REFERENCES payment_terms(id) **ON DELETE SET NULL**` |
| تنها نویسندهٔ `purchases` | `create_purchase` — که ترم را **الزامی** می‌کند |
| سیاست نوشتن `payment_terms` | `payment_terms_write_admin_accountant` با `cmd = **ALL**` (شامل DELETE) |
| صفحهٔ مدیریت ترم‌ها | فقط `is_active` را toggle می‌کند؛ **حذف نمی‌کند** |
| `payment_terms.days` نال‌پذیر؟ | **بله**، با `CHECK (days IS NULL OR days >= 0)` |

**نتیجه:** بله، امروز فقط الزامِ `create_purchase` است که شاخهٔ بازگشت را در صفر نگه داشته. اما
پایگاه‌داده **دو مسیر باز** به آن حالت دارد که هیچ‌کدام از فرم نمی‌گذرند:
۱. **حذف یک ترم پرداخت** از راه PostgREST — سیاست `ALL` به ادمین/حسابدار اجازه می‌دهد، و
   `ON DELETE SET NULL` بلافاصله `payment_term_id` هر خریدی که از آن ترم استفاده کرده را تهی می‌کند.
   (رابط کاربری این را عرضه نمی‌کند، ولی سیاست پایگاه‌داده مجاز می‌داند.)
۲. **ساخت یک ترم فعال با `days` تهی** — قانونی است، `create_purchase` می‌پذیردش (G13).

---

## Q3 — `compute_daily_capital` وصل‌شده

### ۱. ورودی‌ها
از `daily_capital_inputs` (یک ردیف برای تاریخ) و از دو view زنده:
`vw_customer_receivables` و `vw_supplier_payables WHERE is_paid = false`.
تابع دیگری صدا نمی‌زند جز `has_any_role` و `auth.uid()`.

### ۲. **آیا ردیف ورودی لازم است؟ نه.** — پاسخ قطعی از خود بدنه
```
SELECT * INTO i FROM public.daily_capital_inputs d WHERE d.capital_date = p_capital_date;
```
اگر ردیفی نباشد `i` سراسر NULL می‌ماند و **هر استفاده‌ای `COALESCE(..., 0)` شده است**. تابع یک ردیف
کامل و معتبر برمی‌گرداند.

**اجرای واقعی (فقط‌خواندنی، داخل `BEGIN … ROLLBACK`، امروز):**
```
suggested=0 | recv total=1,679,300,000 overdue=1,616,300,000 today=0 future=0
            | pay  total=328,937,963,399.94 overdue=35,026,185,624.94 today=0 future=293,911,777,775.00
            | input_id=(no input row)
daily_capital_inputs rows for today = 0
```

### ۳. **مهم‌ترین چیزی که این اجرا نشان داد**
`system_suggested_capital = 0` — و دلیلش نبودِ ورودی دستی نیست. فرمول فقط
`due_today` را می‌شمارد (`due_date = p_capital_date`)، و امروز **هر دو طرف `due_today = 0`** اند.
یعنی **۱٫۶ میلیارد مطالبهٔ معوق و ۳۵ میلیارد بدهی معوق در محاسبهٔ «سرمایهٔ پیشنهادی» هیچ سهمی
ندارند.** به‌علاوه یک قید یک‌طرفه:
```
IF v_suggested < 0 THEN v_suggested := 0; END IF;
```
پس «امروز ۵ میلیارد کسری داری» و «امروز صفر داری» هر دو به‌صورت **۰** گزارش می‌شوند.

**میزی که فقط این عدد را نشان دهد، هر روز صفر نشان می‌دهد.** آنچه برای پخش روزانه به‌درد می‌خورد،
هشت ستون تفکیکی‌اش است (`total/overdue/due_today/future` هر دو طرف)، نه ستون خلاصه.

### ۴. زنجیرهٔ موردنظر و جایی که پاره است
| تابع | نقش | نوشتن؟ | فراخوانندهٔ برنامه‌ای |
|---|---|---|---|
| `upsert_daily_capital_input` | ورود دستی (۱۳ پارامتر) | بله | **۰** |
| `compute_daily_capital` | محاسبه | **نه — `STABLE`** | **۰** |
| `save_daily_capital_snapshot` | بایگانی روز | بله | **۰** |
| `run_daily_capital_allocation` | پخش سقف‌ها | بله | ۱ (`useDynamicCapital.ts`) |

فقط حلقهٔ آخر وصل است، و همان یکی عدد سرمایه را **دستی** می‌گیرد.

### ۵. **آیا یک صفحهٔ تازه می‌تواند مستقیم صدایش بزند؟ بله، امروز، بدون هیچ پیش‌نیازی.**
- `has_function_privilege('authenticated', oid, 'EXECUTE') = true`
- `SECURITY DEFINER` با گارد داخلی `admin|manager|accountant` → **فروش رد می‌شود** (الزام مالک)
- `STABLE` → فقط می‌خواند؛ اجرای آن هیچ‌چیز نمی‌نویسد (خودم اجرا کردم و تأیید شد)
- بدون ردیف `daily_capital_inputs` هم کار می‌کند

**چه کسی ورودی دستی را وارد می‌کند؟** `upsert_daily_capital_input` همان گارد سه‌نقشی را دارد و
ورودی‌های منفی را رد می‌کند. صفحه‌اش (`/accounting/daily-capital`) امروز فقط یک redirect stub است،
پس **سطح ورود وجود ندارد** — این تنها چیزی است که واقعاً غایب است.

---

## Contradictions with the previous report

۱. **حساب پوشش F1..F30.** آن سند «۳۰ خوانده‌شده از ۸۱» گفت. عدد قابل‌اثبات این است که ۳۳ تابع
   فقط *نام* برده شده بودند، و تعداد بدنه‌های واقعاً خوانده‌شده کمتر بوده. این دور ۸۵ تا را خواند.
۲. **F17 تقویت می‌شود، نه رد.** «موتور وصل‌نشده» درست بود؛ این دور سه چیز اضافه می‌کند که آن سند
   نمی‌دانست: تابع `STABLE` است (هیچ نمی‌نویسد)، گارد نقش دارد که فروش را بیرون می‌گذارد، و
   **به ردیف `daily_capital_inputs` نیاز ندارد**. یعنی وصل‌کردنش از آنچه گزارش شد آسان‌تر است.
۳. **F12 گسترش می‌یابد.** آن سند نوشت شاخهٔ بازگشت «امروز صفر ردیف دارد». این دور نشان می‌دهد
   پایگاه‌داده **هیچ** محافظتی ندارد و دو مسیر باز به آن حالت هست (Q2 بند ۴)، و
   عدم‌تقارن `is_active` هم وجود دارد.
۴. **F20 یک نمونه از پنج بود.** «خانوادهٔ ۳۳۰/۳۳۱» (G1) قاب درست‌تر است.
۵. **F29 ناقص بود.** آن سند `daily_capital_snapshots` را با ۱۰ ردیف فهرست کرد. این دور نشان می‌دهد
   هر ۱۰ ردیف `is_active = false` اند (G6) و همه از دو روز تیرماه‌اند (G16) — یعنی جدول «پر» نیست،
   «رهاشده» است.
۶. **F18 رد می‌شود — تنها ردِ کامل این دور.** آن سند «چرخهٔ hold/consume تخصیص» را
   `not-connected` خواند و نوشت «لوله‌کشی هست و فقط فراخواننده می‌خواهد؛ اول باید تصمیم گرفت کدام
   دفتر برنده است». خواندن بدنه‌ها (G17) نشان می‌دهد هر چهار تابع **سنگ‌قبرِ** تک‌جمله‌ای‌اند که
   `RAISE EXCEPTION ... (M11)` می‌دهند و صراحتاً به `hold_credit`/`release_credit` ارجاع می‌دهند.
   verdict درست `absent (deliberately retired)` است، نه `not-connected`. دلیل خطا روشن است: آن
   دور فقط شمارش فراخواننده را دیده بود، نه بدنهٔ ۱۷۱ بایتی را.
۷. **F1..F30 دیگر همه پابرجا ماندند.**

---

## UNVERIFIED / UNKNOWN

۱. **۱۶۳ یافتهٔ جاروب راستی‌آزمایی نشده‌اند** (۸۶ داوری به سقف نشست خورد). نرخ رد در نمونهٔ
   اندازه‌گیری‌شده **۷۱٪** بود، پس این توده باید *سرنخ* تلقی شود، نه یافته.
۲. **`assign_user_role_txt` را در سطح اکسپلویت نیازموده‌ام** (G9). فراخوانی واقعی به‌عنوان anon
   می‌نوشت و مأموریت فقط‌خواندنی بود. اینکه Kong یا PostgREST جلویش را می‌گیرد یا نه، **نامعلوم**.
   همین برای ۱۲ تابع بدون‌گاردِ دیگر که grant به anon دارند صادق است.
۳. **آشکارساز گارد با grep قابل اتکا نیست** — یک غلط مثبت داد (G10). ممکن است غلط منفی هم داده
   باشد؛ ۷ تابع G8 را خودم خواندم، ولی ۱۳ تابعِ anon-دارِ خارج از دامنه را نه.
۴. **قید `CREATE OR REPLACE VIEW` در Q2 بند ۳** از قاعدهٔ عمومی Postgres گفته شده، نه از آزمایش
   روی این پایگاه‌داده.
۵. **دو ردیف معوق با `customer_id` تهی** (Q1) — نفهمیدم آیا پیش‌فاکتورهای مهمان‌اند یا نتیجهٔ باگ
   لینک‌شدن که در PR #381 اصلاح شد. لازمهٔ فهمیدنش خواندن ردیف‌هاست و آن PII می‌شود.
۶. **`daily_capital_snapshots` چرا در ۲۰۲۶-۰۷-۲۱ متوقف شد** — نویسنده‌اش صفر فراخواننده دارد،
   ولی تاریخچهٔ حذف آن فراخواننده را ردیابی نکردم.
۷. **هیچ‌چیز دربارهٔ سامانهٔ اصلی (`192.168.170.10`).** وصل نشدم. هر تفاوت شِما یا داده **نامعلوم**.
۸. **۹ تابع C** فقط از روی `prolang='c'` و اندازهٔ بدنه به‌عنوان داخلیِ `btree_gist` طبقه‌بندی شدند؛
   کد C آن‌ها را نخواندم — و بیرون از این پروژه‌اند.

---

## وضعیت گزارش

**COMPLETE از نظر خواندن؛ PARTIAL از نظر راستی‌آزمایی.**

- **حساب پوشش می‌بندد: ۸۵ تابع دامنه، ۸۵ خوانده‌شده، ۰ نخوانده.** پرسشی که گزارش قبلی را
  PARTIAL کرد، بسته شد — و شکاف فیلتر نامی (۱۳ تابع) هم که آن سند اصلاً نمی‌دانست، بسته شد.
- **Q1، Q2 و Q3 هر سه با عدد پاسخ داده شدند**، همه از اندازه‌گیری مستقیم خودم.
- آنچه نمی‌بندد: **۱۶۳ از ۱۹۸ یافتهٔ خام راستی‌آزمایی خصمانه نشدند**، چون اجرای آن مرحله وسط کار
  به سقف نشست خورد. با نرخ رد اندازه‌گیری‌شدهٔ ۷۱٪، گفتن «۱۹۸ یافته پیدا شد» صادقانه نبود؛
  به‌جایش ۱۷ یافتهٔ تأییدشده به‌دست خودم گزارش شد و بقیه قرنطینه شدند.
