-- 1. invoices status: add pending_accountant (no existing CHECK; document via comment)
-- We rely on app validation; ensure existing rows are unaffected.
COMMENT ON COLUMN public.invoices.status IS 'one of: draft, pending_accountant, final, issued, canceled, paid, partially_paid, overdue';

-- 2. tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','blocked','canceled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_date date,
  reference_type text,
  reference_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_ref ON public.tasks(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks(created_at DESC);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[])
  );

DROP POLICY IF EXISTS tasks_write ON public.tasks;
CREATE POLICY tasks_write ON public.tasks
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant','manager']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant','manager']::app_role[]));

-- 3. invoice_workflow_stages
CREATE TABLE IF NOT EXISTS public.invoice_workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_workflow_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iws_select ON public.invoice_workflow_stages;
CREATE POLICY iws_select ON public.invoice_workflow_stages
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS iws_write ON public.invoice_workflow_stages;
CREATE POLICY iws_write ON public.invoice_workflow_stages
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));

-- Seed default stages (idempotent)
INSERT INTO public.invoice_workflow_stages (title, order_index)
SELECT v.title, v.idx FROM (VALUES
  ('در انتظار حسابدار', 1),
  ('تأیید حسابداری', 2),
  ('ارسال به انبار', 3),
  ('تکمیل شده', 4)
) AS v(title, idx)
WHERE NOT EXISTS (SELECT 1 FROM public.invoice_workflow_stages s WHERE s.title = v.title);

-- 4. RPC: send_invoice_to_accountant
CREATE OR REPLACE FUNCTION public.send_invoice_to_accountant(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_task_id uuid;
  v_existing uuid;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','manager','sales']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT i.id, i.status, i.type, i.number, i.total_amount, i.customer_id, c.name AS customer_name
    INTO v_inv
  FROM public.invoices i
  LEFT JOIN public.customers c ON c.id = i.customer_id
  WHERE i.id = p_invoice_id;

  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'only draft invoices can be sent to accountant'; END IF;

  UPDATE public.invoices SET status = 'pending_accountant', updated_at = now() WHERE id = p_invoice_id;

  -- Avoid duplicate task
  SELECT id INTO v_existing
  FROM public.tasks
  WHERE reference_type = 'invoice' AND reference_id = p_invoice_id AND status IN ('pending','in_progress')
  LIMIT 1;

  IF v_existing IS NULL THEN
    INSERT INTO public.tasks (title, description, status, priority, reference_type, reference_id, created_by)
    VALUES (
      'بررسی پیش‌فاکتور',
      'پیش‌فاکتور ' || COALESCE(v_inv.number, p_invoice_id::text)
        || ' — مشتری: ' || COALESCE(v_inv.customer_name, '—')
        || ' — مبلغ: ' || to_char(v_inv.total_amount, 'FM999,999,999,999'),
      'pending', 'normal', 'invoice', p_invoice_id, v_user
    )
    RETURNING id INTO v_task_id;
  ELSE
    v_task_id := v_existing;
  END IF;

  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
  VALUES ('invoice', p_invoice_id::text, 'invoice_sent_to_accountant', v_user,
          jsonb_build_object('new_status','pending_accountant','task_id',v_task_id));

  RETURN v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_invoice_to_accountant(uuid) TO authenticated;

-- 5. RPC: complete_invoice_task
CREATE OR REPLACE FUNCTION public.complete_invoice_task(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_task record;
BEGIN
  IF NOT public.has_any_role(v_user, ARRAY['admin','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RAISE EXCEPTION 'task not found'; END IF;

  UPDATE public.tasks
    SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = p_task_id;

  IF v_task.reference_type = 'invoice' AND v_task.reference_id IS NOT NULL THEN
    UPDATE public.invoices
      SET status = 'final', updated_at = now()
      WHERE id = v_task.reference_id AND status = 'pending_accountant';

    INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
    VALUES ('invoice', v_task.reference_id::text, 'task_completed_invoice', v_user,
            jsonb_build_object('task_id', p_task_id));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_invoice_task(uuid) TO authenticated;