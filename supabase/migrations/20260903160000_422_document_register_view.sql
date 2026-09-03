-- 422 — v_documents_unified: one register over receipts, payments and dual documents
--
-- ==============================================================================================
-- WHY THIS IS A CREATE AND NOT AN ALTER
-- ==============================================================================================
--
-- The brief asked to "extend v_documents_unified to union dual_documents" and to rebuild it from
-- pg_get_viewdef. That was checked first, as instructed, and the view DOES NOT EXIST:
--
--   SELECT ... FROM information_schema.columns WHERE table_name='v_documents_unified';   -> 0 rows
--   SELECT count(*) FROM public.v_documents_unified;
--     ERROR:  relation "public.v_documents_unified" does not exist
--   No view in the database unions payment_receipts and payment_vouchers:
--     SELECT c.relname FROM pg_class c ... WHERE relkind IN ('v','m')
--       AND pg_get_viewdef(c.oid) ~ 'payment_receipts' AND pg_get_viewdef(c.oid) ~ 'payment_vouchers';
--                                                                                         -> 0 rows
--   The identifier appears nowhere in src/ or supabase/ on either branch.
--
-- So there is nothing to extend and nothing to preserve; this creates it with all three sources at
-- once. The name from the brief is kept deliberately, so the vocabulary the owner used still points
-- at the object that exists.
--
-- ==============================================================================================
-- WHAT READS THIS (§H — what will read the rows this starts serving)
-- ==============================================================================================
--
-- Nothing today. src/routes/_app.accounting.documents.tsx (new, same PR) is the first and only
-- reader, via PostgREST. The type filter is pushed down as a PostgREST `doc_type=eq.…` predicate
-- against this view, so the filtering happens in the database and not after fetching.
--
-- The existing /documents route is NOT a reader and is not touched: it is the file-upload module
-- (بیجک، فاکتور، حواله) reading get_documents over the `documents` table, a different feature.
--
-- ==============================================================================================
-- SECURITY — nobody new can read anything
-- ==============================================================================================
--
-- WITH (security_invoker = true): the view executes with the PRIVILEGES AND RLS OF THE CALLER, not
-- of the owner. So each branch is filtered by the policy that already governs its table:
--
--   payment_receipts   pr_select_privileged             admin, manager, accountant
--                      viewer_restricted (ALL)          NOT is_viewer_only(uid())
--   payment_vouchers   payment_vouchers_select_finance  admin, manager, accountant
--   dual_documents     dual_documents_select_finance    admin, accountant, manager
--
-- The three sets are identical, so the register is readable by exactly admin, manager and
-- accountant — the same people who can already read each table separately. A `sales` user selecting
-- from this view gets zero rows, not an error, because RLS filters rather than refuses. Proved in
-- the phase gates with single-role JWTs inside BEGIN … ROLLBACK.
--
-- Without security_invoker a view runs as its owner (supabase_admin) and would BYPASS RLS entirely,
-- handing every authenticated user the whole ledger. That is the trap this line closes, and it is
-- why this view does not copy the older vw_* pattern, which relies on an inline is_viewer_only()
-- guard instead.
--
-- ==============================================================================================
-- DECISIONS THIS MIGRATION MAKES, stated rather than left implicit
-- ==============================================================================================
--
-- 1. doc_type ∈ ('receipt','payment','dual') — the values the RPCs already write. They match
--    document_numbers.doc_type CHECK and journal_entries.doc_kind. No new label is invented.
--
-- 2. THE PARTY COLUMN FOR A DUAL DOCUMENT. A dual document has two account holders (T11): the payer
--    who owed us, and the beneficiary we owed. create_dual_document stores each as a type plus
--    exactly one of three role-table references (payer_customer_id / payer_supplier_id /
--    payer_party_id, and the same for beneficiary). Both are resolved to a name and joined as
--
--        «<payer> به <beneficiary>»
--
--    read as "from X to Y", which is the direction the money actually moved. It is short enough for
--    a table cell, unambiguous about which party is which, and reads correctly right-to-left — an
--    arrow glyph does not. The two names are also exposed separately as party_payer_name and
--    party_beneficiary_name so a future screen can render them in two columns without changing this
--    view.
--
-- 3. amount is TOMAN, exactly as the three source tables store it. The Excel export converts to
--    rials (×10) at the edge, where the «مبلغ (ریال)» header says so. Converting here would make
--    the view disagree with every other reader of these tables.
--
-- 4. channel and bank_account are NULL for a dual document, and that is correct rather than missing
--    data: T12 says the money never lands in one of our accounts, so there is no channel and no
--    account of ours to name. dual_documents has no document_channel column at all.
--
-- 5. document_number prefers the document_numbers ledger (the burn-aware spine, filtered on
--    burned_at IS NULL) and falls back to the number the source row carries.
--
-- Rollback: docs/verification/422-down.sql — statements only, no transaction control.

SET client_encoding = 'UTF8';

CREATE OR REPLACE VIEW public.v_documents_unified
WITH (security_invoker = true) AS

-- ---------------------------------------------------------------- receipts ----
SELECT
  'receipt'::text                                    AS doc_type,
  pr.id                                              AS doc_id,
  COALESCE(dn.document_number, '')                   AS document_number,
  pr.payment_date                                    AS doc_date,
  pr.document_channel                                AS channel,
  COALESCE(
    NULLIF(btrim(c.name), ''),
    NULLIF(btrim(pr.payer_name), ''),
    NULLIF(btrim(pr.payer_name_on_receipt), '')
  )                                                  AS party_name,
  COALESCE(NULLIF(btrim(c.name), ''), NULLIF(btrim(pr.payer_name), '')) AS party_payer_name,
  NULL::text                                         AS party_beneficiary_name,
  pi.value_normalized                                AS asan_code,
  pr.amount                                          AS amount,
  ba.title                                           AS bank_account,
  pr.tracking_number                                 AS tracking_number,
  pr.description                                     AS description,
  pr.status                                          AS status,
  (pr.reversed_at IS NOT NULL)                       AS reversed,
  pr.created_at                                      AS created_at
FROM public.payment_receipts pr
LEFT JOIN public.customers c
       ON c.id = pr.customer_id
LEFT JOIN public.person_identifiers pi
       ON pi.person_id = COALESCE(pr.customer_person_id, c.person_id)
      AND pi.kind = 'asan_person_code'
LEFT JOIN public.bank_accounts ba
       ON ba.id = pr.destination_bank_account_id
LEFT JOIN public.document_numbers dn
       ON dn.doc_type = 'receipt' AND dn.source_id = pr.id AND dn.burned_at IS NULL

UNION ALL

-- ---------------------------------------------------------------- payments ----
SELECT
  'payment'::text,
  pv.id,
  COALESCE(dn.document_number, pv.voucher_number, ''),
  pv.payment_date,
  pv.document_channel,
  COALESCE(
    NULLIF(btrim(s.name), ''),
    NULLIF(btrim(ep.full_name), ''),
    NULLIF(btrim(cu.name), ''),
    NULLIF(btrim(pv.payee_name), '')
  ),
  NULL::text,
  COALESCE(NULLIF(btrim(s.name), ''), NULLIF(btrim(ep.full_name), ''), NULLIF(btrim(cu.name), '')),
  pi.value_normalized,
  pv.amount,
  ba.title,
  pv.tracking_number,
  pv.description,
  pv.status,
  (pv.reversed_at IS NOT NULL),
  pv.created_at
FROM public.payment_vouchers pv
LEFT JOIN public.suppliers s         ON s.id  = pv.payee_supplier_id
LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
LEFT JOIN public.customers cu        ON cu.id = pv.payee_customer_id
LEFT JOIN public.person_identifiers pi
       ON pi.person_id = COALESCE(pv.payee_person_id, s.person_id, ep.person_id, cu.person_id)
      AND pi.kind = 'asan_person_code'
LEFT JOIN public.bank_accounts ba    ON ba.id = pv.source_bank_account_id
LEFT JOIN public.document_numbers dn
       ON dn.doc_type = 'payment' AND dn.source_id = pv.id AND dn.burned_at IS NULL

UNION ALL

-- ----------------------------------------------------------- dual documents ----
-- Decision 2 above: «payer به beneficiary». Both halves are also exposed separately.
SELECT
  'dual'::text,
  dd.id,
  COALESCE(dn.document_number, dd.document_number, ''),
  dd.document_date,
  NULL::text,                                   -- decision 4: a dual document has no channel
  COALESCE(pay.nm, '؟') || ' به ' || COALESCE(ben.nm, '؟'),
  pay.nm,
  ben.nm,
  pi.value_normalized,                          -- the payer's Asan code, mirroring the payer column
  dd.amount,
  NULL::text,                                   -- decision 4: no account of ours is involved
  dd.tracking_number,
  dd.description,
  dd.status,
  (dd.reversed_at IS NOT NULL),
  dd.created_at
FROM public.dual_documents dd
LEFT JOIN LATERAL (
  SELECT COALESCE(
           (SELECT NULLIF(btrim(x.name), '')      FROM public.customers x        WHERE x.id = dd.payer_customer_id),
           (SELECT NULLIF(btrim(x.name), '')      FROM public.suppliers x        WHERE x.id = dd.payer_supplier_id),
           (SELECT NULLIF(btrim(x.full_name), '') FROM public.external_parties x WHERE x.id = dd.payer_party_id)
         ) AS nm,
         COALESCE(
           (SELECT x.person_id FROM public.customers x        WHERE x.id = dd.payer_customer_id),
           (SELECT x.person_id FROM public.suppliers x        WHERE x.id = dd.payer_supplier_id),
           (SELECT x.person_id FROM public.external_parties x WHERE x.id = dd.payer_party_id)
         ) AS pid
) pay ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(
           (SELECT NULLIF(btrim(x.name), '')      FROM public.customers x        WHERE x.id = dd.beneficiary_customer_id),
           (SELECT NULLIF(btrim(x.name), '')      FROM public.suppliers x        WHERE x.id = dd.beneficiary_supplier_id),
           (SELECT NULLIF(btrim(x.full_name), '') FROM public.external_parties x WHERE x.id = dd.beneficiary_party_id)
         ) AS nm
) ben ON TRUE
LEFT JOIN public.person_identifiers pi
       ON pi.person_id = pay.pid AND pi.kind = 'asan_person_code'
LEFT JOIN public.document_numbers dn
       ON dn.doc_type = 'dual' AND dn.source_id = dd.id AND dn.burned_at IS NULL;

COMMENT ON VIEW public.v_documents_unified IS
  'One register over the three recorded document types: receipt (payment_receipts), payment '
  '(payment_vouchers) and dual (dual_documents). doc_type carries the same values the RPCs already '
  'write and that document_numbers.doc_type and journal_entries.doc_kind use. amount is TOMAN, as '
  'the source tables store it — the Excel export converts to rials at the edge. channel and '
  'bank_account are NULL for a dual document because the money never touches an account of ours '
  '(T12). security_invoker=true, so the caller''s own RLS on each source table decides what they '
  'see: admin, manager and accountant, and nobody new. Migration 422.';

-- Supabase's ALTER DEFAULT PRIVILEGES hands `authenticated` ALL privileges on every new object in
-- public, so a bare GRANT SELECT would leave INSERT/UPDATE/DELETE/TRUNCATE sitting there too. The
-- view is a UNION and therefore not auto-updatable (information_schema.views reports
-- is_insertable_into=NO, is_updatable=NO), so those privileges could never be exercised — but a
-- grant should say what it means. Revoke first, then grant exactly the one privilege this view is
-- for. Existing views in this schema carry the full default set; this one deliberately does not.
REVOKE ALL ON public.v_documents_unified FROM authenticated;
REVOKE ALL ON public.v_documents_unified FROM anon;
GRANT SELECT ON public.v_documents_unified TO authenticated;
