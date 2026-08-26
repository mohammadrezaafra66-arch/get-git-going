SET client_encoding='UTF8';

-- 398 — receipt OCR extraction can actually be SAVED. Until now it was silently discarded,
-- and an audit entry recorded it as completed.
--
-- THE FAILURE CHAIN, measured end to end on 2026-08-26:
--
--   1. `PaymentReceiptDocuments.tsx:719` runs
--        supabase.from("payment_receipt_documents").update({ extraction_status,
--          extracted_data, extraction_confidence, extraction_notes }).eq("id", doc.id)
--   2. RLS on that table grants, PERMISSIVELY: `prd_select_privileged` (SELECT),
--      `prd_insert_admin_accountant` (INSERT), `prd_delete_admin_accountant` (DELETE).
--      The only other policy, `viewer_restricted`, is **RESTRICTIVE** — it can narrow an
--      existing grant and can never create one.
--   3. So NO permissive policy covers UPDATE. Under RLS an UPDATE with no matching policy
--      does not raise: it matches **zero rows** and reports success.
--   4. The code checks `if (updErr) throw updErr`. `updErr` is null. It proceeds.
--   5. It then writes an audit row: `receipt_document_extraction_completed`.
--
-- The evidence that this is not theoretical:
--   * `audit_logs` holds **at least five** `receipt_document_extraction_completed` rows
--     (2026-08-07, 08-08 ×2, 08-19 …) asserting extractions that completed.
--   * The one surviving `payment_receipt_documents` row is `extraction_status='pending'`
--     with `extracted_data IS NULL` — the exact state those five audit rows deny.
--   * The 2026-08-19 audit row lands 0.02s after the cloud vision 401 in
--     `ai_provider_health`, so that extraction really ran, really produced a result, and
--     really lost it.
--
-- `docs/ocr/requirements.md` predicted precisely this in its Pipeline section — "no UPDATE
-- policy, so a write-back there is silently a no-op" — and was right. This migration does not
-- argue with its conclusion that the payload ultimately belongs in `document_attachments`
-- (raised as OG-72); it closes the **silent data loss and the false audit trail** now, with
-- the smallest change that makes the code already in production behave as it reads.
--
-- WHAT THIS DOES AND DOES NOT CHANGE.
-- Adds one PERMISSIVE UPDATE policy, granting exactly the roles that may already INSERT and
-- DELETE these rows — admin and accountant. It widens nothing beyond the existing grant
-- surface: a role that cannot create or delete an attachment still cannot modify one, and
-- `viewer_restricted` continues to bar viewer-only accounts because a RESTRICTIVE policy
-- applies on top of every permissive one.
--
-- It does NOT change financial behaviour. The "auto-apply" step that pushes an extracted
-- amount and tracking number onto the receipt writes to `payment_receipts`, a different table
-- with its own policies, and is not touched here. The only new effect is that the document row
-- records what was extracted — record-keeping that the audit log has been asserting all along.

DO $$
BEGIN
  -- Refuse to run if the premise has changed. A migration whose justification has silently
  -- expired should stop, not proceed on a stale reading.
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.payment_receipt_documents'::regclass
       AND polpermissive AND polcmd IN ('w','*')
  ) THEN
    RAISE EXCEPTION '398: a permissive UPDATE policy already exists; the silent no-op this fixes is gone and this migration is stale';
  END IF;
END
$$;

CREATE POLICY prd_update_admin_accountant
  ON public.payment_receipt_documents
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text))
  WITH CHECK (has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text));

DO $$
DECLARE
  v_admin uuid;
  v_rows  int;
BEGIN
  -- The policy now EXISTS. That is not the same as it WORKING, and asserting only its
  -- existence is the mistake this whole chain keeps recording: prove the UPDATE reaches a row
  -- as a real authenticated admin, then leave no trace of the proof.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.payment_receipt_documents'::regclass
       AND polname = 'prd_update_admin_accountant' AND polpermissive AND polcmd = 'w'
  ) THEN
    RAISE EXCEPTION '398: the UPDATE policy was not created';
  END IF;

  SELECT (array_agg(ur.user_id ORDER BY ur.user_id))[1] INTO v_admin
    FROM public.user_roles ur WHERE ur.role = 'admin';

  IF v_admin IS NULL THEN
    RAISE NOTICE '398: no admin user to test with; policy created but not exercised';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payment_receipt_documents) THEN
    RAISE NOTICE '398: no document rows to test with; policy created but not exercised';
    RETURN;
  END IF;

  -- Inside a SAVEPOINT so the probe is rolled back and no row is actually modified.
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);

    UPDATE public.payment_receipt_documents SET extraction_notes = extraction_notes;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    PERFORM set_config('role', 'supabase_admin', true);

    IF v_rows = 0 THEN
      RAISE EXCEPTION '398: the UPDATE still reaches zero rows as an admin — the silent no-op is NOT fixed';
    END IF;
    RAISE NOTICE '398: verified — an admin UPDATE now reaches % row(s)', v_rows;
    RAISE EXCEPTION 'rollback_probe';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
      PERFORM set_config('role', 'supabase_admin', true);
      RAISE NOTICE '398: probe rolled back; no row was modified';
  END;
END
$$;
