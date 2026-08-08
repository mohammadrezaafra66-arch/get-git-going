SET client_encoding='UTF8';

-- Down-script for migration 329.
--
-- 329 dropped two foreign keys and three functions. It wrote no data, and both tables it
-- touched had ZERO rows with a non-null invoice_id at the time (asserted by the migration
-- itself before acting), so nothing needs restoring beyond the schema objects.
--
-- ---------------------------------------------------------------------------
-- 1. The two foreign keys
-- ---------------------------------------------------------------------------
-- Only valid while public.invoices still exists. If the table has since been dropped,
-- these statements cannot and should not be re-applied.

ALTER TABLE public.payment_receipt_links
  ADD CONSTRAINT payment_receipt_links_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.delivery_receipts
  ADD CONSTRAINT delivery_receipts_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);

-- ---------------------------------------------------------------------------
-- 2. The three functions
-- ---------------------------------------------------------------------------
-- Their pre-drop definitions are NOT reproduced here by hand. Restore them verbatim from
-- git, which is the only trustworthy source:
--
--   git show 8ac7f1b3:supabase/schema_full_export.sql | \
--     sed -n '/CREATE OR REPLACE FUNCTION public.cancel_invoice/,/^\$function\$/p'
--
-- and likewise for send_invoice_to_accountant and set_invoice_accounting_marker. Feed the
-- extracted text through `docker cp` + `psql -f`, never through a PowerShell pipe --
-- these functions carry Persian strings, and a pipe destroyed the Persian inside 44
-- functions on 2026-07-11.
--
-- The frontend component src/components/invoices/InvoiceAccountingMarkers.tsx was deleted
-- in the same commit; restore it with `git checkout 8ac7f1b3 -- <path>` if you revive
-- set_invoice_accounting_marker. Note it was already unreachable before deletion --
-- nothing imported it once migration 323 removed the invoice routes.
