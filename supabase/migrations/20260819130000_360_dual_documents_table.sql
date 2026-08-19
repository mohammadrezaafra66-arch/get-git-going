-- 360 — dual_documents: the source table for a document that moves two parties' balances
--
-- Phase 4, task 4.2 (the source-table decision) plus the delete guard phases 2 and 3 learned to
-- ship with the table rather than after it. create_dual_document arrives in migration 361.
--
-- ==============================================================================================
-- TASK 4.2's DECISION: A NEW TABLE, NOT mutual_settlements
-- ==============================================================================================
--
-- The checklist says "reuse mutual_settlements if its shape fits, otherwise a new dual_documents
-- table. Decide by reading it first." Read from the live catalogue, its shape does not fit, and D10
-- anticipated exactly this ("built for netting a customer against a supplier, which is a related but
-- distinct operation"):
--
--   mutual_settlements: id, person_id, customer_id, supplier_id, offset_amount, cash_amount,
--                       direction, bank_account_id, note, created_by, created_at, (12 cols)
--   CHECK direction = customer_pays | we_pay | balanced
--   CHECK cash_amount = 0 OR bank_account_id IS NOT NULL
--
-- It is a ONE-PARTY table. person_id is singular; customer_id and supplier_id are the two role rows
-- OF THAT SAME PERSON, which is what netting means — a person who is both owed and owing. A dual
-- document has TWO DIFFERENT PARTIES (T11: the party who owed us, and the party we owed) and two
-- further record-only people. Forcing it into mutual_settlements would mean either overloading
-- customer_id/supplier_id to mean two different persons — silently breaking every existing reader,
-- including person_settlement_position and post_mutual_settlement — or adding four columns that are
-- meaningless for a netting row. The table also holds 0 rows, so nothing is gained by reuse.
--
-- Decision: a new table. Recorded in phase-4-PROGRESS.md § Contradictions as the task-4.2 choice.
--
-- ==============================================================================================
-- T11's FOUR ROLES — and why only two of them are foreign keys
-- ==============================================================================================
--
--   ACCOUNT HOLDERS (Asan code required, balance moves, journal line written)
--     payer_*        — the party who owed US and paid
--     beneficiary_*  — the party WE owed and who was paid
--   Each is stored as a type + exactly one of three role-table references, in the same shape
--   payment_vouchers_payee_matches_type_chk already uses, so the pattern an accountant and a
--   reviewer already know is reused rather than reinvented.
--
--   RECORDED ON THE DOCUMENT ONLY (no Asan code, no journal line, balance does NOT move)
--     transferrer_name / transferrer_account_no  — the person who actually made the transfer
--     recipient_name   / recipient_account_no    — the person whose account actually received it
--
-- These four are PLAIN TEXT with NO foreign key and no person_id, deliberately. T11 says these
-- people need no file: "both appear on the document as name and account details and generate no
-- accounting line." Adding an FK to persons would contradict that, and — CLAUDE.md rule 9 — every
-- persons-referencing FK must be registered in person_merge's registry or the event trigger from
-- migration 328 aborts the DDL and disables merging for every person in the system. Not adding one
-- is both correct by T11 and the safer choice.
--
-- The owner's worked example is the acceptance shape: Khan-Mohammadi (payer) and Zeinab
-- (beneficiary) are account holders; the father is the transferrer and Mitra the recipient. Four
-- people, one document, two journal lines.
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS ON WHAT I AM CHANGING (README-EXECUTION §H, first half)
-- ==============================================================================================
--
-- NOTHING. This migration creates a new table and two new trigger functions. It alters no existing
-- object, so there is no existing writer or dependent to break. mutual_settlements is left exactly
-- as it is, which is the point of the 4.2 decision above.
--
-- WHAT WILL READ THE ROWS THIS STARTS CREATING (§H, second half)
--
-- Nothing reads dual_documents yet — 361 writes it, and phase 5 will read it. Measured so the claim
-- is checkable rather than asserted:
--   SELECT proname FROM pg_proc  WHERE prosrc ~ 'dual_document';    -> asan_list_journal_export only,
--                                                                      and only for source_type
--   SELECT relname FROM pg_class WHERE relkind IN ('v','m') AND pg_get_viewdef(oid) ~ 'dual_document';  -> none
--
-- asan_list_journal_export already switches on e.source_type and has NO branch for 'dual_document',
-- so a dual document will fall to its ELSE and produce a NULL rich label — the document still
-- exports, with the plainer description. That is phase 5's surface (it owns the export) and is
-- recorded in phase-4-PROGRESS.md as contradiction C-d rather than fixed here.
--
-- ==============================================================================================
-- WHAT DOES THIS RULE PERMIT THAT IT SHOULD NOT? (§H, third half — asked by trying to break it)
-- ==============================================================================================
--
-- The CHECKs below were written by attempting to insert the things they must refuse. Each was tried
-- inside BEGIN … ROLLBACK before the migration was applied; the results are in phase-4-PROGRESS.md.
--
--   * the same party as both payer and beneficiary — a document that moves one person's balance
--     in both directions and nets to nothing, while still burning a document number.
--     Refused by dual_documents_parties_distinct_chk.
--   * a party type with no matching id, or two ids set at once — refused by the two
--     *_matches_type_chk constraints, which mirror payment_vouchers'.
--   * a fee with no intermediary, or an intermediary id with a type that does not admit one —
--     refused by dual_documents_fee_needs_intermediary_chk.
--   * a negative or fractional amount — refused by the amount CHECKs.
--   * an empty-string transferrer name passed instead of NULL, which would look populated in the
--     UI and be meaningless in the export — refused by dual_documents_record_only_shape_chk.
--
-- The one thing these CHECKs deliberately do NOT enforce is the amount equality of D9 and task 4.4:
-- the contract takes ONE amount, so equality is structural rather than checkable here.
--
-- Rollback: docs/verification/360-down.sql — statements only, and it REFUSES while any row or any
-- posted entry exists rather than orphaning entries.

SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS public.dual_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number         text UNIQUE,

  -- Account holder 1: the party who owed US and paid (T11).
  payer_type              text NOT NULL,
  payer_customer_id       uuid REFERENCES public.customers(id)         ON DELETE RESTRICT,
  payer_supplier_id       uuid REFERENCES public.suppliers(id)         ON DELETE RESTRICT,
  payer_party_id          uuid REFERENCES public.external_parties(id)  ON DELETE RESTRICT,

  -- Account holder 2: the party WE owed and who was paid (T11).
  beneficiary_type        text NOT NULL,
  beneficiary_customer_id uuid REFERENCES public.customers(id)         ON DELETE RESTRICT,
  beneficiary_supplier_id uuid REFERENCES public.suppliers(id)         ON DELETE RESTRICT,
  beneficiary_party_id    uuid REFERENCES public.external_parties(id)  ON DELETE RESTRICT,

  amount                  numeric NOT NULL,
  document_date           date    NOT NULL,
  tracking_number         text    NOT NULL,
  source_bank             text,
  destination_bank        text,

  -- Record-only roles (T11). Plain text, no FK, no person: these people need no file.
  transferrer_name        text,
  transferrer_account_no  text,
  recipient_name          text,
  recipient_account_no    text,

  -- Intermediary (صراف). Metadata when the fee is zero; a third journal line when it is not.
  intermediary_party_id   uuid REFERENCES public.external_parties(id)  ON DELETE RESTRICT,
  intermediary_fee        numeric NOT NULL DEFAULT 0,
  fee_borne_by            text,

  description             text NOT NULL,
  status                  text NOT NULL DEFAULT 'approved',
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dual_documents_payer_type_chk
    CHECK (payer_type = ANY (ARRAY['customer','supplier','external_party'])),
  CONSTRAINT dual_documents_beneficiary_type_chk
    CHECK (beneficiary_type = ANY (ARRAY['customer','supplier','external_party'])),

  -- Exactly one id per party, matching its type. The same shape as
  -- payment_vouchers_payee_matches_type_chk, reused rather than reinvented (ground-truth §5).
  CONSTRAINT dual_documents_payer_matches_type_chk CHECK (
       (payer_type = 'customer'       AND payer_customer_id IS NOT NULL AND payer_supplier_id IS NULL     AND payer_party_id IS NULL)
    OR (payer_type = 'supplier'       AND payer_supplier_id IS NOT NULL AND payer_customer_id IS NULL     AND payer_party_id IS NULL)
    OR (payer_type = 'external_party' AND payer_party_id    IS NOT NULL AND payer_customer_id IS NULL     AND payer_supplier_id IS NULL)),
  CONSTRAINT dual_documents_beneficiary_matches_type_chk CHECK (
       (beneficiary_type = 'customer'       AND beneficiary_customer_id IS NOT NULL AND beneficiary_supplier_id IS NULL AND beneficiary_party_id IS NULL)
    OR (beneficiary_type = 'supplier'       AND beneficiary_supplier_id IS NOT NULL AND beneficiary_customer_id IS NULL AND beneficiary_party_id IS NULL)
    OR (beneficiary_type = 'external_party' AND beneficiary_party_id    IS NOT NULL AND beneficiary_customer_id IS NULL AND beneficiary_supplier_id IS NULL)),

  -- The two account holders must be different rows. A document whose payer and beneficiary are the
  -- same party moves one balance in both directions, nets to nothing, and still burns a serial.
  CONSTRAINT dual_documents_parties_distinct_chk CHECK (
    NOT (payer_type = beneficiary_type
         AND coalesce(payer_customer_id, payer_supplier_id, payer_party_id)
           = coalesce(beneficiary_customer_id, beneficiary_supplier_id, beneficiary_party_id))),

  CONSTRAINT dual_documents_amount_chk CHECK (amount > 0 AND amount = trunc(amount)),
  CONSTRAINT dual_documents_fee_chk    CHECK (intermediary_fee >= 0 AND intermediary_fee = trunc(intermediary_fee)),

  -- A fee cannot exist without someone to pay it or a rule for who bears it, and an intermediary
  -- with no fee must not carry a fee-bearer — that would read as a charge nobody made.
  CONSTRAINT dual_documents_fee_needs_intermediary_chk CHECK (
    (intermediary_fee = 0 AND fee_borne_by IS NULL)
    OR (intermediary_fee > 0 AND intermediary_party_id IS NOT NULL AND fee_borne_by IS NOT NULL)),
  CONSTRAINT dual_documents_fee_borne_by_chk
    CHECK (fee_borne_by IS NULL OR fee_borne_by = ANY (ARRAY['us','payer','beneficiary'])),

  -- An empty string is not a name. Without this a caller could send '' and the document would look
  -- populated in the UI while carrying nothing an accountant could act on.
  CONSTRAINT dual_documents_record_only_shape_chk CHECK (
        (transferrer_name IS NULL OR length(btrim(transferrer_name)) > 0)
    AND (recipient_name   IS NULL OR length(btrim(recipient_name))   > 0)
    AND (transferrer_account_no IS NULL OR length(btrim(transferrer_account_no)) > 0)
    AND (recipient_account_no   IS NULL OR length(btrim(recipient_account_no))   > 0)),

  CONSTRAINT dual_documents_tracking_chk   CHECK (length(btrim(tracking_number)) > 0),
  CONSTRAINT dual_documents_description_chk CHECK (length(btrim(description)) > 0),
  CONSTRAINT dual_documents_status_chk     CHECK (status = ANY (ARRAY['draft','approved','rejected']))
);

COMMENT ON TABLE public.dual_documents IS
  'A receipt and a payment in the same instant, where the money never lands in one of our accounts '
  '(T11, T12). Four roles: payer and beneficiary are account holders whose balances move and who '
  'need Asan codes; transferrer and recipient are recorded as name and account number only, with no '
  'journal line and no person record. Migration 360, phase 4 task 4.2 — a new table rather than '
  'mutual_settlements, which is a one-party netting table (D10).';

COMMENT ON COLUMN public.dual_documents.transferrer_name IS
  'The person who actually made the transfer. Recorded only — no Asan code, no journal line, no '
  'balance movement, and deliberately no foreign key: T11 says this person needs no file.';
COMMENT ON COLUMN public.dual_documents.recipient_name IS
  'The person whose account actually received the money. Recorded only — same rules as '
  'transferrer_name.';
COMMENT ON COLUMN public.dual_documents.intermediary_fee IS
  'Zero means the intermediary (صراف) is metadata only, with no journal line (T11). Above zero the '
  'intermediary is a party we are paying, so a third line is written against them and they need an '
  'accounting code like any other paid party — see migration 361 and Owner-Gate OG-21.';

CREATE INDEX IF NOT EXISTS dual_documents_document_date_idx ON public.dual_documents (document_date);
CREATE INDEX IF NOT EXISTS dual_documents_payer_idx         ON public.dual_documents (payer_customer_id, payer_supplier_id, payer_party_id);
CREATE INDEX IF NOT EXISTS dual_documents_beneficiary_idx   ON public.dual_documents (beneficiary_customer_id, beneficiary_supplier_id, beneficiary_party_id);

-- ------------------------------------------------------------------ RLS ----
-- Sensitive table, so RLS on and gated by role (CLAUDE.md rule 9 / README §5.3 Security).
-- The boundary matches payment_vouchers: finance roles read, admin+accountant write, admin deletes.
-- manager can READ (OG-13 answer (a) admits manager to creation through the RPC, and phase-1 M3 was
-- exactly a role that could create and then not read back what it made).
ALTER TABLE public.dual_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dual_documents_select_finance ON public.dual_documents;
CREATE POLICY dual_documents_select_finance ON public.dual_documents
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
           ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]));

DROP POLICY IF EXISTS dual_documents_insert_finance ON public.dual_documents;
CREATE POLICY dual_documents_insert_finance ON public.dual_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(),
                ARRAY['admin'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS dual_documents_update_finance ON public.dual_documents;
CREATE POLICY dual_documents_update_finance ON public.dual_documents
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS dual_documents_delete_admin ON public.dual_documents;
CREATE POLICY dual_documents_delete_admin ON public.dual_documents
  FOR DELETE TO authenticated
  -- Explicit cast: has_role has an app_role[] and a text overload, and an unqualified literal
  -- matches both. Same trap as has_any_role, which OG-13 and migration 346 already document.
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ------------------------------------------------- updated_at + number burn ----
DROP TRIGGER IF EXISTS trg_dual_documents_updated_at ON public.dual_documents;
CREATE TRIGGER trg_dual_documents_updated_at
  BEFORE UPDATE ON public.dual_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_dual_documents_burn_document_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.burn_document_number('dual', OLD.id, 'سند دوطرفه حذف شد');
  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.tg_dual_documents_burn_document_number() IS
  'Burns the dual document''s number when the row is deleted, so a serial is never silently reused. '
  'Mirrors tg_burn_receipt_document_number and tg_burn_payment_document_number. Migration 360.';

DROP TRIGGER IF EXISTS trg_dual_documents_burn_document_number ON public.dual_documents;
CREATE TRIGGER trg_dual_documents_burn_document_number
  BEFORE DELETE ON public.dual_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_dual_documents_burn_document_number();

-- ------------------------------------------------------------ delete guard ----
-- Shipped WITH the table, not after it. Migration 353 added this for receipts (phase-2 Gate A M8)
-- and 357 for vouchers (phase-3 Gate A OG-20, which Gate A said should not have been deferred). The
-- exposure is identical the moment a dual document posts: journal_entries.source_id is not a
-- foreign key, so deleting the source leaves an immutable orphaned entry that nothing can remove.
-- Phase 4 does not repeat the pattern of discovering that in review.
CREATE OR REPLACE FUNCTION public.tg_dual_documents_block_delete_when_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _entry_id uuid;
BEGIN
  SELECT je.id INTO _entry_id
    FROM public.journal_entries je
   WHERE je.source_type = 'dual_document'
     AND je.source_id = OLD.id
     AND je.status = 'posted'
   LIMIT 1;

  IF _entry_id IS NOT NULL THEN
    RAISE EXCEPTION
      'این سند دوطرفه سند حسابداری ثبت‌شده دارد و حذف نمی‌شود؛ سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.tg_dual_documents_block_delete_when_posted() IS
  'Refuses to delete a dual_documents row that has a posted journal entry. Without it the entry '
  'survives permanently orphaned and undeletable (source_id is not an FK; 343 makes a posted entry '
  'immutable). Migration 360 — the mirror of 353 (receipts) and 357 (vouchers). Stopgap until '
  'reverse_document exists (OG-14, scheduled after phase 4 and before phase 6).';

DROP TRIGGER IF EXISTS trg_dual_documents_block_delete_when_posted ON public.dual_documents;
CREATE TRIGGER trg_dual_documents_block_delete_when_posted
  BEFORE DELETE ON public.dual_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_dual_documents_block_delete_when_posted();
