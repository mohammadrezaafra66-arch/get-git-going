SET client_encoding='UTF8';

-- =============================================================================
-- 244-down — rollback for Phase 8.7
-- =============================================================================
--
-- Migration 244 dropped no columns and changed no data. It only rewrote
-- COMMENTs. So this rollback is genuinely trivial, and it is worth saying why
-- rather than letting the brevity look like an omission.
--
-- THE HONEST NOTE THE BRIEF ASKS FOR
--   The brief says to note that re-adding a dropped column restores the column
--   but NOT its data, and that the backup is the real recovery path. That
--   warning does not apply here, because nothing was dropped — the per-column
--   proof in 244's header showed that all 19 legacy identity columns are still
--   consumed by a derive trigger, a CHECK constraint, a view, or
--   person_fk_drift_report(), and usually all four.
--
--   Should a future phase actually drop one of them, the warning becomes real
--   and absolute: ALTER TABLE ... ADD COLUMN brings back an empty column, and
--   the *_person_id values cannot reconstruct it, because several distinct
--   legacy columns (payee_customer_id / payee_supplier_id / payee_party_id) all
--   derive into ONE person column. That mapping is lossy in the direction that
--   matters. The pre-8.7 pg_dump is the only recovery path:
--     pre_phase8_7_cleanup_20260802.sql.gz
--     sha256 ACA595325196586266ED4D34AA7030C05EC76C3753AE347D11FAC1F0C94B1F98
--
-- To roll back the comments, restore the previous text — or simply leave them.
-- They describe the schema accurately and carry no behaviour.
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.customers IS NULL;
COMMENT ON TABLE public.suppliers IS NULL;
COMMENT ON COLUMN public.customers.person_id IS NULL;
COMMENT ON COLUMN public.suppliers.person_id IS NULL;
COMMENT ON COLUMN public.invoices.customer_id IS NULL;
COMMENT ON COLUMN public.sales_quotes.customer_id IS NULL;
COMMENT ON COLUMN public.purchases.supplier_id IS NULL;
COMMENT ON COLUMN public.payment_vouchers.payee_supplier_id IS NULL;
COMMENT ON COLUMN public.payment_receipts.receiver_party_id IS NULL;

NOTIFY pgrst, 'reload schema';
