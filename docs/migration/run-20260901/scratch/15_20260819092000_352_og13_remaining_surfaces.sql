-- 352 — OG-13, the two surfaces that were never given the answer
--
-- Gate A phase 2, defect M3 (docs/execution/phase-2-GATE-A.md).
--
-- WHY
--
-- Phase 1's Gate A raised M3: `manager` passed the canonical role gate and the attachments INSERT
-- policy, but was refused by assign_document_number, so a phase-2 RPC would admit a manager, mint
-- the source row, and then die mid-transaction at the numbering step. The recommendation was
-- explicit: "Pick one boundary for the whole programme and apply it to all four surfaces."
--
-- OG-13 was answered (a) — create = admin, accountant, manager — migration 346 aligned
-- assign_document_number, migration 349 gave create_receipt the same gate, and 00-progress.md
-- recorded OG-13 closed. Two of the four surfaces never got the answer:
--
--   surface 1  assign_document_number gate .............. manager admitted   (346)      OK
--   surface 2  document_numbers SELECT policy ........... admin, accountant  (338)   NOT DONE
--   surface 3  document_attachments policies ............ manager admitted   (342)      OK
--   surface 4  role_permissions seed, ledger-documents .. manager all-false  (344)   NOT DONE
--
-- Measured by Gate A, end to end, with a real manager JWT:
--
--   E3 manager create_receipt | SUCCESS doc=RCP-1405-000052
--   E4 manager SELECT on document_numbers for their own receipt | rows visible to the manager = 0
--
-- A manager can create the document and then cannot read back the number it was given. And
-- has_dynamic_permission('ledger-documents','create') returns false for that same manager, because
-- the module IS seeded — the function only falls back to its legacy static matrix when NO row
-- exists for the module, and 344 seeded all seven roles. So the seed is not decorative: it is the
-- authoritative answer, and it currently contradicts the RPC.
--
-- WHAT READS WHAT I AM ABOUT TO CHANGE:
--
--   * document_numbers_select_finance — read by PostgREST for every authenticated SELECT on
--     document_numbers. Widening a PERMISSIVE policy is strictly additive: no caller that can
--     read a row today stops being able to. The RESTRICTIVE viewer_restricted policy on sibling
--     tables does not exist here (phase 1 m7 records that choice), so nothing else narrows it.
--   * role_permissions('ledger-documents','manager') — read by has_dynamic_permission(uuid,text,
--     text), which is the only reader of that table besides update_role_permissions(text,jsonb)
--     (the admin settings screen) and create_purchase(...), which reads a different module.
--     Catalogue scan for 'role_permissions' over every public function body returns exactly those
--     three.
--   * Phase 6's wizard will gate on one of these two surfaces. Whichever it picks is wrong for
--     managers until this migration lands.
--
-- WHAT WRITES WHAT I AM ABOUT TO CHANGE:
--
--   * The policy: only migrations. 338 created it; nothing else touches it.
--   * The role_permissions row: migration 344 seeded it, and update_role_permissions() can change
--     it from the admin UI at runtime. That matters — this migration must not fight a deliberate
--     runtime choice. It does not: 344's seed set every non-admin/accountant role to all-false in
--     one sweep, and the live row is still exactly that, so nobody has hand-edited it since.
--     Verified immediately before writing: manager row reads
--     view=false create=false update=false delete=false approve=false export=false sensitive=false.
--
-- WHY manager gets view + create AND NOTHING ELSE:
--
--   can_view, can_create   -> true.  This is OG-13 answer (a), and it matches how the sibling
--                                    'accounting' module already treats manager (view=t create=t).
--   can_update, can_delete -> false. A posted ledger document is immutable (343). Only admin
--                                    carries can_delete on this module, and that is left alone.
--   can_approve            -> false. T1 removed the approval step entirely; nobody approves.
--   can_export             -> false. asan_list_journal_export and asan_list_bank_deposit_export
--                                    both gate on admin/accountant in their own bodies. Granting
--                                    a manager can_export here would create exactly the mismatch
--                                    this migration exists to remove.
--
-- Both statements are idempotent: the policy is dropped and recreated, and the seed is an
-- ON CONFLICT upsert on the existing UNIQUE (role_name, module).
--
-- Rollback: docs/verification/352-down.sql — statements only, no BEGIN/COMMIT (M7).

SET client_encoding = 'UTF8';

-- ---------------------------------------------------------------- surface 2 ----
DROP POLICY IF EXISTS document_numbers_select_finance ON public.document_numbers;
CREATE POLICY document_numbers_select_finance ON public.document_numbers
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
           ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]));

COMMENT ON POLICY document_numbers_select_finance ON public.document_numbers IS
  'Who may read the numbering ledger: admin, accountant, manager — the same boundary that may '
  'create a ledger document (OG-13 answer (a)). Widened from admin+accountant by migration 352, '
  'Gate A M3: a manager could mint a number through create_receipt and then not read it back.';

-- ---------------------------------------------------------------- surface 4 ----
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
VALUES
  ('manager', 'ledger-documents', true, true, false, false, false, false, false)
ON CONFLICT (role_name, module) DO UPDATE
   SET can_view   = EXCLUDED.can_view,
       can_create = EXCLUDED.can_create,
       updated_at = now();
