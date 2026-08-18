-- 353-down.sql — rollback for
--   supabase/migrations/20260819093000_353_block_receipt_delete_when_posted.sql
--
-- Removes the BEFORE DELETE guard on payment_receipts and its trigger function.
--
-- NO TRANSACTION CONTROL IN THIS FILE — deliberately. See Gate A M7 and
-- docs/verification/rollback-dryrun.sql.
--   real:     psql … -v ON_ERROR_STOP=1 --single-transaction -f 353-down.sql
--   dry-run:  psql … -v downfile=/tmp/353-down.sql -f /tmp/rollback-dryrun.sql
--
-- WHAT ROLLING THIS BACK RE-OPENS: Gate A M8. Deleting a payment_receipts row that has a posted
-- journal entry becomes possible again, and it succeeds — leaving the entry and its lines behind
-- permanently orphaned (journal_entries.source_id is not a foreign key), undeletable (343
-- immutability), and with the customer's credit balance still carrying the amount the deleted
-- receipt granted. Measured by Gate A:
--
--   C3 DELETE payment_receipts as supabase_admin | SUCCEEDED
--   C4 after the delete | journal_entries=1 journal_lines=2 credit_ledger_rows=1
--                         available_credit=1284000.00
--   C6 delete the orphaned entry | sqlstate=P0001 msg=سند ثبت‌شده قابل تغییر نیست…
--
-- DATA LOSS: none. Dropping a guard cannot lose a row.
--
-- ORDERING NOTE — this guard and the test-data cleanup:
-- docs/verification/phase-2-remediation-testdata-cleanup.sql deletes the journal entries BEFORE
-- the receipts, so it passes this guard and does not need it dropped. Do not roll 353 back in
-- order to run a cleanup; fix the cleanup's ordering instead.

SET client_encoding = 'UTF8';

DROP TRIGGER IF EXISTS trg_payment_receipts_block_delete_when_posted ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.tg_payment_receipts_block_delete_when_posted();
