-- AFK-G3-013: pre-invoice workflow requirements and task creation
-- Adds non-destructive operational metadata for collection/video/proof requirements.
-- Existing invoices remain valid via safe defaults.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'not_ready',
  ADD COLUMN IF NOT EXISTS proof_requirement text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS collection_due_date date,
  ADD COLUMN IF NOT EXISTS product_video_required boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_delivery_mode_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_delivery_mode_check
      CHECK (delivery_mode IN ('not_ready','tehran','carrier','pickup'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_proof_requirement_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_proof_requirement_check
      CHECK (proof_requirement IN ('none','receipt','carrier_waybill_photo','product_video'));
  END IF;
END $$;

COMMENT ON COLUMN public.invoices.delivery_mode IS
'AFK-G3-013: روش ارسال/تحویل پیش‌فاکتور: not_ready, tehran, carrier, pickup.';
COMMENT ON COLUMN public.invoices.proof_requirement IS
'AFK-G3-013: مدرک لازم برای تکمیل عملیات ارسال: none, receipt, carrier_waybill_photo, product_video.';
COMMENT ON COLUMN public.invoices.collection_due_date IS
'AFK-G3-013: تاریخ هدف برای جمع‌آوری کالا/آماده‌سازی بعد از پیش‌فاکتور.';
COMMENT ON COLUMN public.invoices.product_video_required IS
'AFK-G3-013: آیا تهیه فیلم محصول برای این پیش‌فاکتور لازم است؟';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_queue text,
  ADD COLUMN IF NOT EXISTS proof_requirement text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_queue_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_assigned_queue_check
      CHECK (assigned_queue IS NULL OR assigned_queue IN ('sales','shipping','store','accounting'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_proof_requirement_check'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_proof_requirement_check
      CHECK (proof_requirement IS NULL OR proof_requirement IN ('none','receipt','carrier_waybill_photo','product_video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_queue ON public.tasks(assigned_queue, status);
CREATE INDEX IF NOT EXISTS idx_tasks_proof_requirement ON public.tasks(proof_requirement, status);

COMMENT ON COLUMN public.tasks.assigned_queue IS
'AFK-G3-013: صف عملیاتی task وقتی کار هنوز به user مشخص assign نشده است: sales, shipping, store, accounting.';
COMMENT ON COLUMN public.tasks.proof_requirement IS
'AFK-G3-013: نوع مدرک لازم برای task عملیاتی پیش‌فاکتور/ارسال.';

DROP POLICY IF EXISTS tasks_self_update ON public.tasks;
CREATE POLICY tasks_self_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.create_preinvoice_workflow_tasks(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inv record;
  v_created integer := 0;
  v_delta integer := 0;
  v_customer_name text;
  v_invoice_label text;
  v_effective_proof text;
BEGIN
  IF v_user IS NOT NULL AND NOT public.has_any_role(v_user, ARRAY['admin','manager','sales','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    i.id,
    i.number,
    i.invoice_type,
    i.status,
    i.created_by,
    i.delivery_mode,
    i.proof_requirement,
    i.collection_due_date,
    i.product_video_required,
    c.name AS customer_name
  INTO v_inv
  FROM public.invoices i
  LEFT JOIN public.customers c ON c.id = i.customer_id
  WHERE i.id = p_invoice_id;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  -- Only pre-invoice workflow tasks are created here. Analytics/KPI are out of AFK-G3-013 scope.
  IF COALESCE(v_inv.invoice_type, 'pre_invoice') NOT IN ('pre_invoice','advance_payment') THEN
    RETURN 0;
  END IF;

  v_user := COALESCE(v_user, v_inv.created_by);
  v_customer_name := COALESCE(v_inv.customer_name, '—');
  v_invoice_label := COALESCE(v_inv.number, v_inv.id::text);

  v_effective_proof := CASE
    WHEN v_inv.delivery_mode = 'tehran' THEN 'receipt'
    WHEN v_inv.delivery_mode = 'carrier' THEN 'carrier_waybill_photo'
    ELSE COALESCE(v_inv.proof_requirement, 'none')
  END;

  -- Always open a lightweight sales task when shipping/proof is not specified yet.
  IF COALESCE(v_inv.delivery_mode, 'not_ready') = 'not_ready' THEN
    INSERT INTO public.tasks (
      title, description, assigned_queue, status, priority,
      reference_type, reference_id, created_by, proof_requirement
    )
    SELECT
      'تکمیل اطلاعات ارسال و مدرک پیش‌فاکتور',
      'پیش‌فاکتور ' || v_invoice_label || ' — مشتری: ' || v_customer_name ||
      E'\nروش ارسال، نیاز به رسید/بیجک و نیاز به فیلم محصول را مشخص کنید.',
      'sales', 'pending', 'normal',
      'invoice_workflow', v_inv.id, v_user, NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.reference_type = 'invoice_workflow'
        AND t.reference_id = v_inv.id
        AND t.title = 'تکمیل اطلاعات ارسال و مدرک پیش‌فاکتور'
        AND t.status <> 'canceled'
    );
    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_created := v_created + v_delta;
  END IF;

  IF COALESCE(v_inv.product_video_required, false) = true THEN
    INSERT INTO public.tasks (
      title, description, assigned_queue, status, priority, due_date,
      reference_type, reference_id, created_by, proof_requirement
    )
    SELECT
      'تهیه فیلم محصول برای پیش‌فاکتور',
      'پیش‌فاکتور ' || v_invoice_label || ' — مشتری: ' || v_customer_name,
      'sales', 'pending', 'normal', v_inv.collection_due_date,
      'invoice_workflow', v_inv.id, v_user, 'product_video'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.reference_type = 'invoice_workflow'
        AND t.reference_id = v_inv.id
        AND t.title = 'تهیه فیلم محصول برای پیش‌فاکتور'
        AND t.status <> 'canceled'
    );
    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_created := v_created + v_delta;
  END IF;

  IF v_inv.collection_due_date IS NOT NULL THEN
    INSERT INTO public.tasks (
      title, description, assigned_queue, status, priority, due_date,
      reference_type, reference_id, created_by, proof_requirement
    )
    SELECT
      'جمع‌آوری کالا برای پیش‌فاکتور',
      'پیش‌فاکتور ' || v_invoice_label || ' — مشتری: ' || v_customer_name ||
      E'\nتاریخ هدف جمع‌آوری: ' || v_inv.collection_due_date::text,
      'store', 'pending', 'normal', v_inv.collection_due_date,
      'invoice_workflow', v_inv.id, v_user, NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.reference_type = 'invoice_workflow'
        AND t.reference_id = v_inv.id
        AND t.title = 'جمع‌آوری کالا برای پیش‌فاکتور'
        AND t.status <> 'canceled'
    );
    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_created := v_created + v_delta;
  END IF;

  IF v_effective_proof = 'receipt' THEN
    INSERT INTO public.tasks (
      title, description, assigned_queue, status, priority,
      reference_type, reference_id, created_by, proof_requirement
    )
    SELECT
      'ثبت رسید ارسال تهران',
      'پیش‌فاکتور ' || v_invoice_label || ' — مشتری: ' || v_customer_name ||
      E'\nارسال تهران رسید می‌خواهد.',
      'shipping', 'pending', 'high',
      'invoice_workflow', v_inv.id, v_user, 'receipt'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.reference_type = 'invoice_workflow'
        AND t.reference_id = v_inv.id
        AND t.title = 'ثبت رسید ارسال تهران'
        AND t.status <> 'canceled'
    );
    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_created := v_created + v_delta;
  ELSIF v_effective_proof = 'carrier_waybill_photo' THEN
    INSERT INTO public.tasks (
      title, description, assigned_queue, status, priority,
      reference_type, reference_id, created_by, proof_requirement
    )
    SELECT
      'ثبت عکس بیجک باربری',
      'پیش‌فاکتور ' || v_invoice_label || ' — مشتری: ' || v_customer_name ||
      E'\nارسال با باربری عکس/مدرک بیجک می‌خواهد.',
      'shipping', 'pending', 'high',
      'invoice_workflow', v_inv.id, v_user, 'carrier_waybill_photo'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.reference_type = 'invoice_workflow'
        AND t.reference_id = v_inv.id
        AND t.title = 'ثبت عکس بیجک باربری'
        AND t.status <> 'canceled'
    );
    GET DIAGNOSTICS v_delta = ROW_COUNT;
    v_created := v_created + v_delta;
  END IF;

  IF v_created > 0 THEN
    INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, diff)
    VALUES (
      'invoice', v_inv.id::text, 'preinvoice_workflow_tasks_created', v_user,
      jsonb_build_object(
        'created_count', v_created,
        'delivery_mode', v_inv.delivery_mode,
        'proof_requirement', v_effective_proof,
        'collection_due_date', v_inv.collection_due_date,
        'product_video_required', v_inv.product_video_required
      )
    );
  END IF;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_preinvoice_workflow_tasks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_preinvoice_workflow_tasks(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_preinvoice_workflow_tasks(uuid) IS
'AFK-G3-013: creates idempotent operational tasks after a pre-invoice for collection, product video, Tehran receipt, or carrier waybill-photo requirements.';

CREATE OR REPLACE FUNCTION public.trg_create_preinvoice_workflow_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_preinvoice_workflow_tasks(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_preinvoice_workflow_tasks ON public.invoices;
CREATE TRIGGER trg_create_preinvoice_workflow_tasks
AFTER INSERT OR UPDATE OF delivery_mode, proof_requirement, collection_due_date, product_video_required
ON public.invoices
FOR EACH ROW
WHEN (COALESCE(NEW.status, '') <> 'canceled')
EXECUTE FUNCTION public.trg_create_preinvoice_workflow_tasks();
