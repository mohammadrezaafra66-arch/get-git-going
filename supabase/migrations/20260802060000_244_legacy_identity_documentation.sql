SET client_encoding='UTF8';

-- =============================================================================
-- 244 — Phase 8.7: legacy identity cleanup — NOTHING IS DROPPED, AND WHY
-- =============================================================================
--
-- The brief instructs: prove there is no remaining reader for each legacy
-- identity column, drop only the columns proven unreferenced, keep the rest and
-- list them as deferred. The proof was carried out. Its result is that ZERO of
-- the 19 legacy identity columns can be dropped, so this migration drops none.
--
-- THE STRUCTURAL REASON, WHICH IS BIGGER THAN "SOMETHING STILL READS IT"
--   The *_person_id columns are DERIVED FROM the legacy columns. Phases 5 and 7
--   built them that way on purpose — "the database is the reference" — with
--   BEFORE INSERT OR UPDATE OF <legacy_column> triggers recomputing the person
--   column from the legacy key. There are 16 such triggers.
--
--   So the legacy columns are not leftovers sitting beside the person model.
--   They are the model's INPUT. Dropping invoices.customer_id would not retire
--   a legacy column; it would delete the only thing that keeps
--   invoices.customer_person_id correct, break the trigger that reads it, and
--   violate the CHECK constraint that requires it. The person columns would
--   freeze at their last computed value and silently rot.
--
--   Retiring the legacy columns is therefore not a cleanup. It is an inversion
--   of the derivation — making person authoritative and legacy derived, or
--   removing the derivation and rewriting every writer — and that is a phase of
--   its own, not a step at the end of this one.
--
-- THE PER-COLUMN PROOF (census run against the live catalog + a grep of src/)
--
--   legacy column                              fn  view trg chk idx  code  drop?
--   -----------------------------------------  --  ---- --- --- ---  ----  -----
--   credit_requests.customer_id                40    2   1   1   1     *     NO
--   credit_score_snapshots.customer_id         40    2   1   1   1     *     NO
--   customer_capital_allocations.customer_id   40    2   1   1   2     *     NO
--   customer_capital_allocations_dyn...        40    2   1   2   2     *     NO
--   customer_credit_balance.customer_id        40    2   1   2   1     *     NO
--   customer_credit_ledger.customer_id         40    2   1   1   1     *     NO
--   customer_credit_profile.customer_id        40    2   1   2   3     *     NO
--   delivery_receipts.customer_id              40    2   1   2   1     *     NO
--   didar_activities.customer_id               40    2   1   2   0     *     NO
--   invoices.customer_id                       40    2   2   2   5     *     NO
--   payment_receipts.customer_id               40    2   1   1   1     *     NO
--   payment_receipts.receiver_party_id          3    0   1   3   1    14     NO
--   payment_vouchers.payee_customer_id          3    0   1   3   0     1     NO
--   payment_vouchers.payee_party_id             3    0   1   3   0     1     NO
--   payment_vouchers.payee_supplier_id          4    0   1   3   1     1     NO
--   product_suppliers.supplier_id              15    2   1   2   2     *     NO
--   purchase_prices.supplier_id                15    2   1   2   0     *     NO
--   purchases.supplier_id                      15    2   1   2   2     *     NO
--   sales_quotes.customer_id                   40    2   1   2   1     *     NO
--
--   (* the shared column names customer_id / supplier_id carry 85 and 43
--    application references respectively across src/, excluding the generated
--    types file. The function counts are likewise whole-name matches and so
--    over-count per table — but the conclusion does not rest on them. The
--    decisive, precisely attributable blockers are the trigger, CHECK and view
--    columns, and every single row has at least one.)
--
--   Views involved: v_dynamic_customer_capital_balances, vw_customer_receivables,
--   vw_purchase_float, vw_supplier_payables.
--
--   CHECK constraints that name a legacy column directly, and would become
--   unsatisfiable or invalid if it were dropped:
--     invoices_customer_person_requires_customer_chk
--     sales_quotes_customer_person_requires_customer_chk
--     delivery_receipts_customer_person_requires_customer_chk
--     didar_activities_customer_person_requires_customer_chk
--     purchases_supplier_person_requires_supplier_chk
--     purchase_prices_supplier_person_requires_supplier_chk
--     payment_receipts_receiver_person_requires_party_chk
--     payment_vouchers_payee_person_requires_payee_chk
--
--   person_fk_drift_report() reads the legacy columns on every table in order to
--   compare them against the derived person columns. It is the phase's own
--   health check; dropping its inputs would blind it.
--
-- NO VIEW CONVERSION, EITHER
--   The brief allows writing a customers/suppliers -> VIEW conversion plan but
--   forbids applying it without owner approval, and only if step 1 proves it
--   trivially safe. Step 1 proves the opposite, so no such migration was
--   written. It would be a plan built on a premise the evidence contradicts.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- What this migration DOES do: record the settled role of the two tables.
--
-- Decision 1 changed what customers and suppliers ARE. They are no longer
-- identity records that happen to carry business data — identity lives in
-- persons, and these are now 1:1 profile tables hanging off a person, holding
-- the business terms that belong to that role. Writing that into the schema is
-- the durable part of this checkpoint: the next person to read \d customers
-- should not have to reconstruct it from six migrations.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.customers IS
  'جدول پروفایل مشتری — از فاز ۸ (تصمیم ۱) این جدول دیگر «هویت» نیست. هویت در جدول persons نگهداری می‌شود و این ردیف با کلید یکتای person_id به‌صورت یک‌به‌یک به آن وصل است. آنچه اینجا می‌ماند شرایط کسب‌وکاری نقش مشتری است (اعتبار، تسویه، مسئول فروش و…). برای یافتن یا تطبیق یک شخص هرگز از name/phone این جدول استفاده نکنید؛ مرجع، persons و person_identifiers است.';

COMMENT ON TABLE public.suppliers IS
  'جدول پروفایل تأمین‌کننده — از فاز ۸ (تصمیم ۱) این جدول دیگر «هویت» نیست. هویت در جدول persons نگهداری می‌شود و این ردیف با کلید یکتای person_id به‌صورت یک‌به‌یک به آن وصل است. آنچه اینجا می‌ماند شرایط کسب‌وکاری نقش تأمین‌کننده است (سطح اعتماد، وضعیت تأیید، شخص رابط و…). برای یافتن یا تطبیق یک شخص هرگز از name/phone این جدول استفاده نکنید؛ مرجع، persons و person_identifiers است.';

COMMENT ON COLUMN public.customers.person_id IS
  'کلید یکتا به شخص (uq_customers_person_id، فاز ۸.۳). هر شخص دقیقاً یک پروندهٔ مشتری دارد؛ همین یکتایی است که اجازه داد توابع اعتبار در فاز ۸.۶ روی شخص کلید بخورند بدون خطر جمع‌شدن مانده‌های دو مشتری.';

COMMENT ON COLUMN public.suppliers.person_id IS
  'کلید یکتا به شخص (uq_suppliers_person_id، فاز ۸.۳). هر شخص دقیقاً یک پروندهٔ تأمین‌کننده دارد.';

-- -----------------------------------------------------------------------------
-- Mark the legacy identity columns as retained-on-purpose, so a future reader
-- does not mistake them for forgotten debt. One representative comment per
-- distinct shape; the reasoning is identical for all 19.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.invoices.customer_id IS
  'ستون هویتی قدیمی — عمداً حذف نشده (فاز ۸.۷). ستون مشتقِ customer_person_id توسط تریگر از همین ستون ساخته می‌شود، پس این ستون ورودی مدل شخص است نه بازماندهٔ آن. حذف آن تریگر را می‌شکند، CHECK مربوطه را نقض می‌کند و person_fk_drift_report() را کور می‌کند. بازنشستگی آن نیازمند وارونه‌کردن جهت اشتقاق است و کار یک فاز مستقل است.';

COMMENT ON COLUMN public.sales_quotes.customer_id IS
  'ستون هویتی قدیمی — عمداً حذف نشده (فاز ۸.۷). دلیل کامل در توضیح invoices.customer_id و در هدر مهاجرت ۲۴۴.';

COMMENT ON COLUMN public.purchases.supplier_id IS
  'ستون هویتی قدیمی — عمداً حذف نشده (فاز ۸.۷). دلیل کامل در توضیح invoices.customer_id و در هدر مهاجرت ۲۴۴.';

COMMENT ON COLUMN public.payment_vouchers.payee_supplier_id IS
  'ستون هویتی قدیمی — عمداً حذف نشده (فاز ۸.۷). سه شاخهٔ payee (تأمین‌کننده/مشتری/طرف حساب) همگی به ستون مشترک payee_person_id مشتق می‌شوند و CHECK مربوطه وجود دست‌کم یکی از آن‌ها را الزامی می‌کند.';

COMMENT ON COLUMN public.payment_receipts.receiver_party_id IS
  'ستون هویتی قدیمی — عمداً حذف نشده (فاز ۸.۷). ستون مشتق receiver_party_person_id از همین ستون ساخته می‌شود.';

NOTIFY pgrst, 'reload schema';
