
-- 1) journal_entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT current_date,
  description text,
  status text NOT NULL DEFAULT 'posted',
  posted_by uuid,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_status_chk CHECK (status IN ('draft','posted','void')),
  CONSTRAINT journal_entries_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON public.journal_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date
  ON public.journal_entries(entry_date);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries_select_finance"
  ON public.journal_entries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "journal_entries_insert_admin_accountant"
  ON public.journal_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "journal_entries_update_admin_accountant"
  ON public.journal_entries FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

-- 2) journal_lines
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  account_kind text NOT NULL,
  account_ref_id uuid,
  description text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_lines_debit_nonneg CHECK (debit >= 0),
  CONSTRAINT journal_lines_credit_nonneg CHECK (credit >= 0),
  CONSTRAINT journal_lines_one_side CHECK (
    NOT (debit > 0 AND credit > 0) AND NOT (debit = 0 AND credit = 0)
  ),
  CONSTRAINT journal_lines_account_kind_chk CHECK (
    account_kind IN ('customer_credit','bank','external_party','invoice_ar','clearing','other')
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
  ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON public.journal_lines(account_kind, account_ref_id);

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_lines_select_finance"
  ON public.journal_lines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "journal_lines_insert_admin_accountant"
  ON public.journal_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "journal_lines_update_admin_accountant"
  ON public.journal_lines FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

-- 3) Balance validation RPC
CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance(p_journal_entry_id uuid)
RETURNS TABLE(total_debit numeric, total_credit numeric, is_balanced boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(debit), 0)  AS total_debit,
    COALESCE(SUM(credit), 0) AS total_credit,
    COALESCE(SUM(debit), 0) = COALESCE(SUM(credit), 0)
      AND COALESCE(SUM(debit), 0) > 0 AS is_balanced
  FROM public.journal_lines
  WHERE journal_entry_id = p_journal_entry_id;
$$;

REVOKE ALL ON FUNCTION public.validate_journal_entry_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) TO authenticated;
