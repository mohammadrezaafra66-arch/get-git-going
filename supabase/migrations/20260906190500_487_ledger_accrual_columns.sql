SET client_encoding='UTF8';

-- ============================================================================
-- 487 - the ledger learns two accrual document kinds and an optional chart link.
-- ============================================================================
--
-- TWO CHANGES, BOTH PURELY ADDITIVE
-- ---------------------------------
-- 1. journal_entries_doc_kind_chk gains 'sale_accrual' and 'purchase_accrual'.
--    Measured before this migration, the live constraint was exactly:
--      CHECK (doc_kind = ANY (ARRAY['receipt','payment','dual',
--                                   'purchase_payment','settlement','other']))
--    Every one of the 47 existing entries carries one of those six values
--    (dual 8, other 2, payment 12, receipt 25), so widening the list cannot
--    invalidate a single existing row.
--
-- 2. journal_lines gains account_id -> chart_of_accounts(id), NULLABLE.
--    D-28: no backfill. The 94 existing cash lines keep account_id NULL and are
--    not rewritten. Nullable is not laziness -- it is the requirement: those
--    lines were posted before a chart of accounts existed and inventing an
--    account for them retroactively would be exactly the history migration D-28
--    forbids.
--
-- WHY THIS DOES NOT FIGHT THE IMMUTABILITY TRIGGERS
-- -------------------------------------------------
-- tg_journal_entry_immutable and tg_journal_line_immutable are BEFORE DELETE OR
-- UPDATE ... FOR EACH ROW and raise when OLD.status = 'posted'. ALTER TABLE ADD
-- COLUMN with no default does not rewrite rows and fires no row trigger, so the
-- append-only guarantee is respected rather than worked around. Nothing in this
-- migration issues an UPDATE or a DELETE against either table.
--
-- The account_kind CHECK is deliberately NOT touched. Accrual lines reuse the
-- existing kinds -- 'customer_credit' and 'supplier_payable' for the person
-- subledger, 'other' for the income/expense control side -- all three of which
-- validate_journal_line_ref already handles (it returns early when
-- account_ref_id IS NULL, and treats invoice_ar/clearing/other as control
-- accounts with nothing to check; lines 11-13 and 30-35 of its live body).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Two new document kinds.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_doc_kind_chk;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_doc_kind_chk
  CHECK (doc_kind = ANY (ARRAY[
    'receipt', 'payment', 'dual', 'purchase_payment', 'settlement', 'other',
    'sale_accrual', 'purchase_accrual'
  ]));

COMMENT ON CONSTRAINT journal_entries_doc_kind_chk ON public.journal_entries IS
  'شش نوع نقدی پیشین به‌علاوهٔ دو نوع تعهدی (فروش و خرید) — موج ۶.';

-- ---------------------------------------------------------------------------
-- 2. The optional link from a ledger line to our own chart of accounts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS account_id uuid NULL
  REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.journal_lines.account_id IS
  'حساب از کدینگ مستقل (chart_of_accounts). برای ۹۴ سطر نقدیِ پیش از موج ۶ تهی است و تهی می‌ماند (D-28: بدون انتقال تاریخچه).';

-- Partial index: only accrual lines carry a value, so indexing the NULLs would
-- be 94 rows of dead weight today and every cash line forever after.
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id
  ON public.journal_lines (account_id) WHERE account_id IS NOT NULL;
