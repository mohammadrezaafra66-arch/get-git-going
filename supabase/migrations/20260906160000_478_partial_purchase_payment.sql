SET client_encoding='UTF8';

-- 478. Partial payment of a purchase.
--
-- This is the revisit migration 20260506195804 asked for and migration 457 quoted in its own
-- header (`20260905224500_457_payables_debt_is_the_purchase_total.sql:22`):
--     "Partial payment of purchases is NOT modeled in current schema; outstanding for an
--      unpaid purchase = coalesce(cash_price, total_amount). To be revisited when partial
--      purchase payments are introduced."
--
-- ============================================================================
-- 0. WHAT WAS MEASURED, LIVE, ON 2026-09-06 (afrakala-lan-db / database `afrakala`)
-- ============================================================================
--
--   purchases                                              317
--   ... total_amount IS NULL                                 0   (column is NOT NULL)
--   ... total_amount <= 0                                    0
--   ... paid_at IS NOT NULL                                  0
--   ... carrying a cash_price                                1
--   ... cash_price > total_amount                            0
--   payment_vouchers                                        12
--   ... purchase_id IS NOT NULL                              0
--   ... reversed_at IS NOT NULL                              0
--   ... status                                        approved (only value present)
--
-- So NO DATA MIGRATION IS NEEDED in either direction: not one voucher is linked to a purchase
-- today, and not one purchase is stamped paid. Every expression below is proved to reduce to
-- the pre-478 expression on this data, and the EXCEPT-both-directions check in section 5 is
-- expected to return zero rows.
--
-- ============================================================================
-- 1. THE SHAPE: THE EXISTING COLUMNS CARRY IT. NO NEW TABLE.
-- ============================================================================
--
-- `payment_vouchers` already has a nullable `purchase_id` (FK -> purchases, ON DELETE SET NULL)
-- and a `amount numeric NOT NULL CHECK (amount > 0)`, plus the partial index
-- `idx_payment_vouchers_purchase btree (purchase_id) WHERE purchase_id IS NOT NULL`. There is
-- NO unique constraint on `purchase_id`, so the column is already many-vouchers-to-one-purchase
-- at the schema level. A payment of part of a purchase is one voucher row carrying that part.
--
-- Every caller of `payment_vouchers.purchase_id` was read before this was decided:
--
--   WRITERS
--     public.pay_purchase_with_voucher(...)  - the one this migration changes.
--     public.create_payment(p_channel, ..., p_purchase_id uuid, ...)  - ALREADY writes
--       purchase_id with NO duplicate guard and does NOT stamp purchases.paid_at
--       (INSERT at prosrc "'approved', p_purchase_id, _uid"). It therefore already treats the
--       column exactly as a partial-payment link; before this migration those rows were simply
--       invisible to the payables report. This is the strongest evidence the column fits: the
--       newer of the two writers had already stopped treating it as all-or-nothing.
--
--   READERS
--     public.asan_list_bank_deposit_export(_from, _to)  - reads voucher rows, not purchase_id.
--     public.asan_list_journal_export(_from, _to, _filter)         - ditto.
--     public.asan_list_purchase_export(_from, _to)                 - reads purchases.
--     public.get_account_ledger(p_account_id, p_from_date, p_to_date) - voucher amounts only.
--     public.reverse_document('payment_voucher', id, reason) - sets reversed_at; ignores
--       purchase_id. Handled below: a reversed voucher is excluded from the paid sum.
--     public.person_merge / person_delete_blockers / person_fk_drift_report - persons FKs only.
--     view public.v_documents_unified - lists vouchers; does not read purchase_id.
--     src/lib/treasury/queries.ts:136 `fetchPaymentVouchers` - selects purchase_id for display.
--     src/lib/treasury/queries.ts:231 `payPurchaseWithVoucher` - the app's only RPC caller.
--
--   TRIGGERS on payment_vouchers: none reads or writes purchase_id
--     (trg_payment_vouchers_derive_person is OF payee_supplier_id/payee_customer_id/
--      payee_party_id; trg_payment_vouchers_lock_when_posted locks status/amount/payee*/
--      source_bank_account_id - purchase_id is NOT in its locked list).
--
-- NOT ONE CALLER CONFLICTS. A link table mirroring `payment_receipt_links` would have added a
-- table, an RLS policy set, a person-merge consideration and a second source of truth for a
-- relationship one already-indexed, already-written, already-many-to-one column expresses.
--
-- ============================================================================
-- 2. WHAT COUNTS AS PAID, AND WHY
-- ============================================================================
--
-- The receivables mirror `vw_customer_receivables` counts a payment when the parent receipt's
-- status is in ('approved','verified','confirmed','posted'). `payment_vouchers.status` has a
-- CHECK admitting only ('draft','approved','rejected'), so the equivalent membership test is
-- exactly `status = 'approved'`.
--
-- The vouchers side ALSO gets a condition the receivables side does not have and should:
-- `reversed_at IS NULL`. `reverse_document` stamps `payment_vouchers.reversed_at` and reverses
-- the journal entry but leaves `status = 'approved'`, so status alone would keep counting money
-- that has been taken back. (The same defect on the receipts side is reported as an
-- out-of-scope finding, not changed here.)
--
--   confirmed_paid_amount := SUM(amount) WHERE status='approved' AND reversed_at IS NULL
--
-- ============================================================================
-- 3. THE VIEW. BASED ON THE LIVE DEFINITION, WHICH IS 459's, NOT 457's.
-- ============================================================================
--
-- Read first with pg_get_viewdef per CLAUDE.md rule 4, and the live definition is NOT the one
-- printed in 457: migration 459 (`20260905231500_459_payables_names_an_unknown_due_date.sql`)
-- later added `due_date_unknown`, `due_date_unknown_reason` and `payment_term_inactive_flag`
-- and made `due_date` NULL when the purchase has no payment term. 20 columns live, 17 in 457.
-- All three of 459's columns and its NULL due_date are carried forward here unchanged.
--
-- `outstanding_amount` becomes, in the inner query:
--
--   CASE
--     WHEN vp.voucher_linked THEN GREATEST(COALESCE(p.total_amount,0) - vp.confirmed_paid_amount, 0)
--     WHEN p.paid_at IS NOT NULL THEN 0
--     ELSE COALESCE(p.total_amount, 0)
--   END
--
-- The second and third branches ARE the pre-478 expression, kept verbatim. They are what a
-- purchase with no voucher of any kind falls to, which today is all 317 of them, and they are
-- what preserves the one live app path that stamps `paid_at` with no voucher at all:
-- `src/routes/_app.accounting.purchase-payments.tsx:191-195` updates `purchases.paid_at`
-- directly when the user chooses no source account ("Fallback: mark paid without a voucher").
-- Dropping to a purely derived figure would have silently un-paid every purchase settled that
-- way.
--
-- `voucher_linked` is "a voucher row exists for this purchase", INCLUDING a reversed or
-- rejected one. Once a purchase's settlement is voucher-driven, the vouchers are the source of
-- truth and the `paid_at` fallback must not take over again - otherwise reversing the voucher
-- that settled a purchase would leave `paid_at` stamped and the debt reported as zero. That is
-- the reversal case the second branch would otherwise get wrong.
--
-- `is_paid`, `days_until_due`, `is_overdue` and `aging_bucket` are re-keyed from
-- `paid_at IS NOT NULL` to `outstanding_amount <= 0`, which is the same question now that the
-- amount can land between the two ends. On today's data every one of them is unchanged, because
-- paid_at is NULL on all 317 rows and total_amount > 0 on all 317 rows.
--
-- One new column is APPENDED (append-only, so CREATE OR REPLACE VIEW accepts it and no reader
-- that selects by name is affected): `confirmed_paid_amount`, the mirror of the column
-- `vw_customer_receivables` has carried since it was created. `get_payables_list`,
-- `get_payable_detail`, `get_payables_summary` and `compute_daily_capital` all select the view
-- by column name and none uses SELECT *; they are deliberately NOT rebuilt (they pick up the
-- new values with no signature change, and rebuilding them would be risk for nothing).
--
-- ============================================================================
-- 4. THE RPC. SAME SIGNATURE - SO NO OVERLOAD, NO DROP, NO CALLER CHANGE.
-- ============================================================================
--
-- CLAUDE.md rule 5 applies to adding a parameter. No parameter is added: the 11-argument
-- signature is reproduced character for character, so the ambiguity trap cannot arise and
-- `DROP FUNCTION` is neither needed nor performed. The live body was diffed against its source
-- migration `20260818160000_345_writers_supply_doc_kind.sql` first (rule 4) and was identical.
--
-- The app's only caller, `src/lib/treasury/queries.ts:231`, passes all 11 arguments by name and
-- is unchanged by this migration.
--
-- Three edits, and nothing else in the body moves:
--
--   (a) THE BLANKET REFUSAL BECOMES AN OVER-PAYMENT CAP. Before:
--         IF EXISTS (SELECT 1 FROM payment_vouchers
--                     WHERE purchase_id = _purchase_id AND status = 'approved')
--           THEN RAISE 'برای این خرید از قبل سند پرداخت ثبت شده است.' (23505)
--       That single line is what made purchase payment all-or-nothing. It is replaced by: sum
--       what is already paid, refuse only when nothing is left owing, and refuse an amount
--       larger than what is left. The `SELECT ... FOR UPDATE` on the purchase row that already
--       sits above it serialises two concurrent payments of the same purchase, so the sum
--       cannot be read stale.
--
--   (b) paid_at IS STAMPED ONLY WHEN OUTSTANDING REACHES ZERO. Before, any payment stamped it.
--       For a purchase whose total_amount is NULL or <= 0 (zero rows today) the old
--       unconditional stamp is kept, so no existing row can change behaviour.
--
--   (c) The audit_logs diff gains `purchase_total_amount`, `already_paid` and
--       `outstanding_after`. Additive; existing keys keep their names and values.
--
-- THE DEFAULT AMOUNT IS DELIBERATELY NOT TOUCHED. It stays
-- `COALESCE(_amount, _purchase.cash_price, _purchase.total_amount)`, because 457 considered
-- exactly this expression and decided against changing it ("That is a different question --
-- what we choose to PAY ... It is reported as a separate finding rather than changed here",
-- lines 65-69). CONSEQUENCE, STATED PLAINLY: for the ONE purchase that carries a cash_price
-- (ba1c75a0-d406-4389-ac4f-e1501dbbe915, cash_price 10,000,000,000 against total_amount
-- 12,000,000,000), a call that passes no `_amount` - which is what the purchase-payments page
-- does - now pays 10,000,000,000 and leaves 2,000,000,000 outstanding with paid_at NULL,
-- where before it marked the purchase fully paid. That is the intended correction, not a
-- regression: 457 established that we owe the total, and the remainder is now visible instead
-- of being written off. It is reported to the owner rather than hidden.
--
-- ============================================================================
-- 5. REVERSE PATH
-- ============================================================================
--
-- `docs/verification/478-down.sql` restores the pre-478 view (459's, byte-for-byte from
-- pg_get_viewdef) and the pre-478 function (345's, byte-for-byte from pg_get_functiondef),
-- re-applies the same grants, and deletes the ledger row. It writes no data, so it is safe to
-- run at any time. Both directions were executed on the test database before this file was
-- committed.
--
-- DATA IMPACT: none. No row is inserted, updated or deleted by this migration.
-- RLS IMPACT: none. No policy is created, altered or dropped.
-- AUDIT IMPACT: pay_purchase_with_voucher keeps writing exactly one audit_logs row per call,
--   with three additional keys in its jsonb diff.

-- ----------------------------------------------------------------------------
-- 3a. THE VIEW
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_supplier_payables AS
  SELECT src.supplier_id,
     src.supplier_name,
     src.purchase_id,
     src.purchase_date,
     src.payment_term_days,
     src.due_date,
     src.purchase_total_amount,
     src.cash_price,
     src.currency,
     src.paid_at,
     src.outstanding_amount <= 0::numeric AS is_paid,
     src.outstanding_amount,
         CASE
             WHEN src.outstanding_amount <= 0::numeric THEN NULL::integer
             ELSE src.due_date - tehran_today()
         END AS days_until_due,
     src.outstanding_amount > 0::numeric AND src.due_date IS NOT NULL
       AND src.due_date < tehran_today() AS is_overdue,
     src.product_summary,
     src.created_at,
         CASE
             WHEN src.outstanding_amount <= 0::numeric THEN 'current'::text
             WHEN src.due_date IS NULL THEN 'current'::text
             WHEN (tehran_today() - src.due_date) <= 0 THEN 'current'::text
             WHEN (tehran_today() - src.due_date) <= 30 THEN 'd1_30'::text
             WHEN (tehran_today() - src.due_date) <= 60 THEN 'd31_60'::text
             WHEN (tehran_today() - src.due_date) <= 90 THEN 'd61_90'::text
             ELSE 'd90_plus'::text
         END AS aging_bucket,
     src.due_date_unknown,
     src.due_date_unknown_reason,
     src.payment_term_inactive_flag,
     src.confirmed_paid_amount
    FROM ( SELECT p.supplier_id,
             s.name AS supplier_name,
             p.id AS purchase_id,
             p.purchase_date,
             pt.days AS payment_term_days,
                 CASE
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                     ELSE NULL::date
                 END AS due_date,
             p.total_amount AS purchase_total_amount,
             p.cash_price,
             p.currency,
             p.paid_at,
             vp.confirmed_paid_amount,
                 CASE
                     WHEN vp.voucher_linked THEN GREATEST(COALESCE(p.total_amount, 0::numeric) - vp.confirmed_paid_amount, 0::numeric)
                     WHEN p.paid_at IS NOT NULL THEN 0::numeric
                     ELSE COALESCE(p.total_amount, 0::numeric)
                 END AS outstanding_amount,
             NULL::text AS product_summary,
             p.created_at,
             pt.days IS NULL AS due_date_unknown,
                 CASE
                     WHEN pt.id IS NULL THEN 'no_payment_term'::text
                     WHEN pt.days IS NULL THEN 'no_term_days'::text
                     ELSE NULL::text
                 END AS due_date_unknown_reason,
             pt.id IS NOT NULL AND pt.is_active = false AS payment_term_inactive_flag
            FROM purchases p
              LEFT JOIN suppliers s ON s.id = p.supplier_id
              LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id
              LEFT JOIN LATERAL ( SELECT COALESCE(sum(pv.amount) FILTER (WHERE pv.status = 'approved'::text AND pv.reversed_at IS NULL), 0::numeric) AS confirmed_paid_amount,
                                         count(*) > 0 AS voucher_linked
                                    FROM public.payment_vouchers pv
                                   WHERE pv.purchase_id = p.id) vp ON true) src
   WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

COMMENT ON VIEW public.vw_supplier_payables IS
  'Supplier payables aging. outstanding_amount = purchase total_amount minus confirmed_paid_amount (478): the sum of every payment_vouchers row linked to the purchase with status=approved and reversed_at IS NULL. Partial purchase payments ARE modeled since 478; a purchase with no voucher of any kind still falls back to the pre-478 paid_at rule. cash_price stays a reported column and is still not the debt (457).';

-- ----------------------------------------------------------------------------
-- 4a. THE RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid, _payment_date date DEFAULT NULL::date, _document_channel text DEFAULT 'cash'::text, _amount numeric DEFAULT NULL::numeric, _tracking_number text DEFAULT NULL::text, _cheque_number text DEFAULT NULL::text, _cheque_due_date date DEFAULT NULL::date, _description text DEFAULT NULL::text, _payee_party_id uuid DEFAULT NULL::uuid, _payee_accounting_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purchase        record;
  _amt             numeric;
  _voucher_id      uuid;
  _party           record;
  _payee_type      text;
  _payee_name      text;
  -- Plain text, not _party.full_name: PL/pgSQL resolves record fields when it
  -- plans the expression, so touching _party.full_name inside a CASE fails with
  -- "record is not assigned yet" even in a branch that never runs. The dry-run
  -- caught exactly that.
  _party_name      text;
  _pay_date        date;
  _payer_code      text;   -- our side: the bank account the money leaves from
  _receiver_code   text;   -- their side: supplier, or the third party we paid
  _supplier_name   text;
  _journal_id      uuid;
  _existing_journal uuid;
  _debit_desc      text;
  -- 478 — partial payment.
  _debt            numeric;  -- what the purchase owes in total
  _already         numeric;  -- confirmed, un-reversed payments already recorded
  _outstanding     numeric;  -- what is left before this call
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت سند پرداخت را ندارید.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _purchase FROM public.purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'خرید یافت نشد.' USING ERRCODE = '22023';
  END IF;

  -- 478. What is already paid. `status='approved'` mirrors the receipts side's status
  -- membership test; `reversed_at IS NULL` is the condition reverse_document makes necessary,
  -- since it stamps reversed_at and leaves status alone. The FOR UPDATE above serialises two
  -- concurrent payments of the same purchase, so this sum cannot be read stale.
  _debt := COALESCE(_purchase.total_amount, 0);
  SELECT COALESCE(SUM(pv.amount), 0) INTO _already
    FROM public.payment_vouchers pv
   WHERE pv.purchase_id = _purchase_id
     AND pv.status = 'approved'
     AND pv.reversed_at IS NULL;
  _outstanding := GREATEST(_debt - _already, 0);

  -- مبلغ پیش‌فرض: قیمت نقدی، وگرنه مبلغ کل خرید
  _amt := COALESCE(_amount, _purchase.cash_price, _purchase.total_amount);
  IF _amt IS NULL OR _amt <= 0 THEN
    RAISE EXCEPTION 'مبلغ پرداخت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  -- 478. The cap replaces the pre-478 blanket refusal of a second voucher. For a purchase with
  -- no usable total (none exist today) the pre-478 one-voucher rule is kept unchanged rather
  -- than inventing a cap out of a NULL.
  IF _debt > 0 THEN
    IF _outstanding <= 0 THEN
      RAISE EXCEPTION 'این خرید به‌طور کامل پرداخت شده است.' USING ERRCODE = '23505';
    END IF;
    IF _amt > _outstanding THEN
      RAISE EXCEPTION 'مبلغ پرداخت از ماندهٔ بدهی این خرید بیشتر است؛ ماندهٔ بدهی % است.',
        _outstanding USING ERRCODE = '22023';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.payment_vouchers
                 WHERE purchase_id = _purchase_id
                   AND status = 'approved'
                   AND reversed_at IS NULL) THEN
    RAISE EXCEPTION 'برای این خرید از قبل سند پرداخت ثبت شده است.' USING ERRCODE = '23505';
  END IF;

  IF _source_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ پرداخت الزامی است.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _source_bank_account_id) THEN
    RAISE EXCEPTION 'حساب بانکی مبدأ یافت نشد.' USING ERRCODE = '22023';
  END IF;

  _pay_date := COALESCE(_payment_date, CURRENT_DATE);

  -- ---------------------------------------------------------------------
  -- Payee identity. Exactly one branch runs; the shape it produces is the
  -- one payment_vouchers_payee_matches_type_chk already requires.
  -- ---------------------------------------------------------------------
  IF _payee_party_id IS NOT NULL THEN
    SELECT * INTO _party FROM public.external_parties WHERE id = _payee_party_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'طرف حساب خارجی انتخاب‌شده یافت نشد.' USING ERRCODE = '22023';
    END IF;
    IF NOT _party.is_active THEN
      RAISE EXCEPTION 'طرف حساب خارجی «%» غیرفعال است و نمی‌توان به او پرداخت ثبت کرد.',
        _party.full_name USING ERRCODE = '22023';
    END IF;
    _payee_type    := 'external_party';
    _payee_name    := NULL;
    _party_name    := _party.full_name;
    _receiver_code := NULLIF(btrim(COALESCE(_party.accounting_code, '')), '');
  ELSIF _purchase.supplier_id IS NOT NULL THEN
    _payee_type := 'supplier';
    _payee_name := NULL;
    SELECT NULLIF(btrim(COALESCE(s.accounting_code, '')), ''), s.name
      INTO _receiver_code, _supplier_name
      FROM public.suppliers s WHERE s.id = _purchase.supplier_id;
  ELSE
    -- No supplier on the purchase and no third party chosen. Same fallback the
    -- pre-313 function used, kept so existing behaviour does not change.
    _payee_type    := 'other';
    _payee_name    := 'تأمین‌کننده نامشخص';
    _receiver_code := NULL;
  END IF;

  -- An explicitly supplied code always wins, mirroring the receipt side where
  -- beneficiary_accounting_code overrides the derived one.
  _receiver_code := COALESCE(NULLIF(btrim(COALESCE(_payee_accounting_code, '')), ''), _receiver_code);

  SELECT NULLIF(btrim(COALESCE(accounting_code, '')), '')
    INTO _payer_code
    FROM public.bank_accounts WHERE id = _source_bank_account_id;

  INSERT INTO public.payment_vouchers (
    amount, payment_date, payee_type, payee_supplier_id, payee_party_id, payee_name,
    document_channel, source_bank_account_id, tracking_number,
    cheque_number, cheque_due_date, description, status, purchase_id, created_by
  ) VALUES (
    _amt,
    _pay_date,
    _payee_type,
    CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
    CASE WHEN _payee_type = 'external_party' THEN _payee_party_id       ELSE NULL END,
    _payee_name,
    _document_channel,
    _source_bank_account_id,
    NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
    _cheque_number,
    _cheque_due_date,
    COALESCE(_description, 'پرداخت خرید'),
    'approved',
    _purchase_id,
    auth.uid()
  )
  RETURNING id INTO _voucher_id;
  -- payee_person_id is filled by trg_payment_vouchers_derive_person.

  -- 478. paid_at marks SETTLEMENT, not "a payment happened". It is stamped only when this
  -- voucher brings the outstanding balance to zero. The `_debt <= 0` arm preserves the pre-478
  -- unconditional stamp for a purchase with no usable total; zero such rows exist today.
  IF _debt <= 0 OR (_already + _amt) >= _debt THEN
    UPDATE public.purchases
       SET paid_at = COALESCE(paid_at, now())
     WHERE id = _purchase_id;
  END IF;

  -- ---------------------------------------------------------------------
  -- Ledger. Idempotent on (source_type, source_id), which is also a UNIQUE
  -- constraint, so a retry cannot produce a second entry.
  -- ---------------------------------------------------------------------
  SELECT id INTO _existing_journal
    FROM public.journal_entries
   WHERE source_type = 'payment_voucher' AND source_id = _voucher_id;

  IF _existing_journal IS NULL THEN
    _debit_desc := CASE
      WHEN _payee_type = 'external_party'
        THEN 'کاهش بدهی به تأمین‌کننده — پرداخت به شخص ثالث «' || COALESCE(_party_name, '؟') || '»'
      WHEN _payee_type = 'supplier'
        THEN 'کاهش بدهی به تأمین‌کننده «' || COALESCE(_supplier_name, '؟') || '»'
      ELSE 'کاهش بدهی به تأمین‌کننده (تأمین‌کننده نامشخص)'
    END;

    INSERT INTO public.journal_entries(
      doc_kind, source_type, source_id, entry_date, description, status, posted_by,
      payer_accounting_code, receiver_accounting_code
    )
    VALUES (
      'purchase_payment', 'payment_voucher', _voucher_id, _pay_date,
      'سند پرداخت خرید' ||
        COALESCE(' شماره ' || (SELECT voucher_number FROM public.payment_vouchers WHERE id = _voucher_id), ''),
      'posted', auth.uid(),
      _payer_code, _receiver_code
    )
    RETURNING id INTO _journal_id;

    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES
      (_journal_id, 1, 'supplier_payable', _purchase.supplier_id, _amt, 0, _debit_desc),
      (_journal_id, 2, 'bank',             _source_bank_account_id, 0, _amt, 'خروج وجه از حساب بانکی');
  ELSE
    _journal_id := _existing_journal;
  END IF;

  -- Balance assertion. Cheap, and it turns a silent accounting bug into a
  -- refused transaction.
  IF (SELECT SUM(debit) FROM public.journal_lines WHERE journal_entry_id = _journal_id)
     IS DISTINCT FROM
     (SELECT SUM(credit) FROM public.journal_lines WHERE journal_entry_id = _journal_id) THEN
    RAISE EXCEPTION 'سند حسابداری پرداخت تراز نشد؛ ثبت لغو شد.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'payment_vouchers', _voucher_id::text, 'purchase_payment_posted',
    jsonb_build_object(
      'purchase_id',      _purchase_id,
      'amount',           _amt,
      'payment_date',     _pay_date,
      'payee_type',       _payee_type,
      'payee_party_id',   CASE WHEN _payee_type = 'external_party' THEN _payee_party_id ELSE NULL END,
      'payee_supplier_id',CASE WHEN _payee_type = 'supplier'       THEN _purchase.supplier_id ELSE NULL END,
      'document_channel', _document_channel,
      'tracking_number',  NULLIF(btrim(COALESCE(_tracking_number, '')), ''),
      'journal_entry_id', _journal_id,
      -- 478 — the partial-payment trail. Additive; no existing key changed.
      'purchase_total_amount', _debt,
      'already_paid',          _already,
      'outstanding_after',     GREATEST(_debt - (_already + _amt), 0)
    ));

  RETURN _voucher_id;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4b. GRANTS. CREATE OR REPLACE FUNCTION must never be trusted to preserve them:
--     migrations 476 and 477 have just finished closing 142 functions and 202 tables that
--     carried an `anon` grant nobody wrote. Restated explicitly, then asserted below.
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_purchase_with_voucher(uuid, uuid, date, text, numeric, text, text, date, text, uuid, text) TO postgres;

-- The view keeps exactly the grants it had (service_role, postgres). It is reached by
-- authenticated users only through the SECURITY DEFINER RPCs, and no anon grant is added.
REVOKE ALL ON TABLE public.vw_supplier_payables FROM anon;
REVOKE ALL ON TABLE public.vw_supplier_payables FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 5a. APPLY-TIME ASSERTIONS. A failure here aborts the whole migration.
-- ----------------------------------------------------------------------------

DO $do$
DECLARE
  _n integer;
  _def text;
BEGIN
  -- anon must not be able to execute the function, nor read the view.
  IF has_function_privilege('anon',
       'public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '478: anon can still EXECUTE pay_purchase_with_voucher';
  END IF;
  IF has_function_privilege('public',
       'public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '478: PUBLIC can still EXECUTE pay_purchase_with_voucher';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.pay_purchase_with_voucher(uuid,uuid,date,text,numeric,text,text,date,text,uuid,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION '478: authenticated lost EXECUTE on pay_purchase_with_voucher';
  END IF;
  IF has_table_privilege('anon', 'public.vw_supplier_payables', 'SELECT') THEN
    RAISE EXCEPTION '478: anon can still SELECT vw_supplier_payables';
  END IF;

  -- exactly one overload, so nothing became ambiguous (CLAUDE.md rule 5).
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pay_purchase_with_voucher';
  IF _n <> 1 THEN
    RAISE EXCEPTION '478: pay_purchase_with_voucher has % overloads, expected 1', _n;
  END IF;

  -- the view kept every column 459 gave it, and gained exactly one.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vw_supplier_payables';
  IF _n <> 21 THEN
    RAISE EXCEPTION '478: vw_supplier_payables has % columns, expected 21', _n;
  END IF;

  -- OG-64: the view must still ask Tehran's today and never CURRENT_DATE.
  _def := pg_get_viewdef('public.vw_supplier_payables'::regclass, true);
  IF _def ~* 'CURRENT_DATE' OR _def !~* 'tehran_today' THEN
    RAISE EXCEPTION '478: vw_supplier_payables no longer asks tehran_today()';
  END IF;
END
$do$;
