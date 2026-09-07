SET client_encoding='UTF8';

-- ============================================================================
-- 486 - chart_of_accounts: the six accounts the accrual ledger posts against.
-- ============================================================================
--
-- WHAT THIS IS
-- ------------
-- Wave 6 / D-30: "our account coding is independent of Asan." Before this migration
-- there was no chart of accounts anywhere in the database. The groundwork research
-- searched three ways and found nothing --
-- docs/research/accrual-ledger-groundwork-20260906.md section "ب" (lines 357-425):
--
--   * relation-name search over all 224 base tables for
--     (chart|gl_|chart_of|account_tree|account_group|account_node|accounts)
--     returned only asan_control_accounts and bank_accounts;
--   * every column named like an account code (accounting_code / asan_code /
--     account_code / gl_code / coa) is a FREE-TEXT string with no unique constraint
--     and no foreign key -- 14 such columns across 11 tables;
--   * the single "control account" that exists, asan_control_accounts, holds ONE row
--     whose own note records that the code came from Asan.
--
-- WHY NOT asan_control_accounts
-- -----------------------------
-- Because it is the Asan coding, which is exactly what D-30 says this must NOT be.
-- Its one row is invoice_ar = Asan code 989, declared by the owner for the Asan
-- export. This table is a DIFFERENT axis: our own codes, our own names, used by our
-- own ledger. asan_control_accounts is not read, not written and not altered here,
-- and the Asan export keeps resolving its codes exactly as it did before.
--
-- THE SIX ACCOUNTS ARE AN OWNER DECISION
-- --------------------------------------
-- docs/missions/wave6/CONTRACTS.md section 2, Q-2. These codes, these names, these
-- kinds, these two control flags. Not derived, not inferred, not extended.
--
-- NO PERSONS FOREIGN KEY
-- ----------------------
-- This table references persons nowhere, so migration 328's person-FK event trigger
-- has nothing to check and person_merge's registry needs no new key. That was
-- verified before and after by public.person_fk_registry_report().
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL,
  name_fa     text        NOT NULL,
  kind        text        NOT NULL,
  is_control  boolean     NOT NULL DEFAULT false,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chart_of_accounts_code_unique UNIQUE (code),
  CONSTRAINT chart_of_accounts_code_nonblank CHECK (btrim(code) <> ''),
  CONSTRAINT chart_of_accounts_name_nonblank CHECK (btrim(name_fa) <> ''),
  CONSTRAINT chart_of_accounts_kind_chk
    CHECK (kind = ANY (ARRAY['asset', 'liability', 'income', 'expense']))
);

COMMENT ON TABLE public.chart_of_accounts IS
  'کدینگ حساب مستقل (D-30). مستقل از کدهای آسان؛ asan_control_accounts دست‌نخورده می‌ماند.';
COMMENT ON COLUMN public.chart_of_accounts.is_control IS
  'حساب کنترلی: ریز آن در زیرمعین اشخاص (journal_lines.account_ref_id) نگهداری می‌شود.';

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_kind
  ON public.chart_of_accounts (kind) WHERE is_active;

-- ---------------------------------------------------------------------------
-- The six accounts. CONTRACTS.md section 2, Q-2 -- owner decision, verbatim.
-- ON CONFLICT DO NOTHING so re-application is safe; no UPDATE, so a name the
-- owner later corrects by hand is never silently overwritten by a re-run.
-- ---------------------------------------------------------------------------
INSERT INTO public.chart_of_accounts (code, name_fa, kind, is_control) VALUES
  ('1000', 'صندوق',                'asset',     false),
  ('1010', 'بانک',                 'asset',     false),
  ('1100', 'طلب مشتریان',          'asset',     true ),
  ('2100', 'بدهی تأمین‌کنندگان',   'liability', true ),
  ('4000', 'فروش',                 'income',    false),
  ('5000', 'خرید',                 'expense',   false)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS. Same shape as migration 481 (the wave's template for a new table).
-- The text[] overload of has_any_role is used deliberately: user_roles.role is
-- TEXT, and has_any_role carries BOTH a text[] and an app_role[] overload, so an
-- uncast array literal would be ambiguous. Every array below is cast explicitly.
--
-- admin + accountant write; manager reads. viewer is excluded by is_viewer_only,
-- matching journal_entries / journal_lines.
-- ---------------------------------------------------------------------------
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY chart_of_accounts_viewer_restricted ON public.chart_of_accounts
  FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()));

CREATE POLICY chart_of_accounts_select_finance ON public.chart_of_accounts
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant', 'manager']::text[]));

CREATE POLICY chart_of_accounts_insert_finance ON public.chart_of_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]));

CREATE POLICY chart_of_accounts_update_finance ON public.chart_of_accounts
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]));

CREATE POLICY chart_of_accounts_delete_admin ON public.chart_of_accounts
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin']::text[]));

-- ---------------------------------------------------------------------------
-- Grants. NO anon grant -- CONTRACTS section 7 forbids one on any new object,
-- and migrations 476/477 spent a whole pass closing the ones that existed.
-- The REVOKEs are explicit rather than assumed: default privileges in this
-- database do grant authenticated and service_role on a new public table.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.chart_of_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.chart_of_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chart_of_accounts TO authenticated;
GRANT ALL ON TABLE public.chart_of_accounts TO service_role;
