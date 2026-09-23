SET client_encoding='UTF8';

-- ============================================================================
-- 585 — deal lifecycle triggers, history, status/move/delete/restore RPCs
-- ============================================================================
-- Builds on live 546 update_status and live 566 won_lost_at (INSERT + *_by).
-- Lost-reason trigger 567 is left in place.
-- ============================================================================

SET lock_timeout = '60s';

-- 584 defaulted stages with ORDER BY created_at; that column does not exist.
CREATE OR REPLACE FUNCTION public.sales_interactions_default_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.kind = 'request' THEN
    IF NEW.pipeline_id IS NULL THEN
      SELECT id INTO NEW.pipeline_id
        FROM public.sales_pipelines
       WHERE is_active
       ORDER BY sort_order, id
       LIMIT 1;
    END IF;
    IF NEW.stage_id IS NULL AND NEW.pipeline_id IS NOT NULL THEN
      SELECT id INTO NEW.stage_id
        FROM public.sales_pipeline_stages
       WHERE pipeline_id = NEW.pipeline_id
         AND is_active
       ORDER BY sort_order, id
       LIMIT 1;
      NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, NEW.created_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sales_interactions_maintain_won_lost_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'won' THEN
        NEW.won_at := now();
        NEW.lost_at := NULL;
      ELSIF NEW.status = 'lost' THEN
        NEW.lost_at := now();
        NEW.won_at := NULL;
      ELSIF NEW.status = 'open' THEN
        NEW.won_at := NULL;
        NEW.lost_at := NULL;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'won' THEN
      NEW.won_at := COALESCE(NEW.won_at, now());
      NEW.won_by := COALESCE(NEW.won_by, actor);
      NEW.lost_at := NULL;
      NEW.lost_by := NULL;
    ELSIF NEW.status = 'lost' THEN
      NEW.lost_at := COALESCE(NEW.lost_at, now());
      NEW.lost_by := COALESCE(NEW.lost_by, actor);
      NEW.won_at := NULL;
      NEW.won_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'won' THEN
      NEW.won_at := now();
      NEW.won_by := COALESCE(actor, NEW.won_by);
      NEW.lost_at := NULL;
      NEW.lost_by := NULL;
      NEW.lost_reason_id := NULL;
      NEW.lost_reason_note := NULL;
      NEW.lost_reason_other := NULL;
    ELSIF NEW.status = 'lost' THEN
      NEW.lost_at := now();
      NEW.lost_by := COALESCE(actor, NEW.lost_by);
      NEW.won_at := NULL;
      NEW.won_by := NULL;
    ELSIF NEW.status = 'open' THEN
      NEW.won_at := NULL;
      NEW.won_by := NULL;
      NEW.lost_at := NULL;
      NEW.lost_by := NULL;
      NEW.lost_reason_id := NULL;
      NEW.lost_reason_note := NULL;
      NEW.lost_reason_other := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_won_lost_at ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_won_lost_at
  BEFORE INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_maintain_won_lost_at();

CREATE OR REPLACE FUNCTION public.sales_interactions_deal_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid := auth.uid();
  auto_src text := COALESCE(NULLIF(current_setting('afrakala.change_source', true), ''), '');
  is_auto boolean;
  stage_pipe uuid;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;

  is_auto := auto_src IN ('auto_quote_created', 'auto_quote_sent', 'auto_quote_accepted')
             AND current_user IS DISTINCT FROM 'authenticated';

  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'معاملهٔ حذف‌شده قابل ویرایش نیست؛ ابتدا آن را بازیابی کنید.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.stage_id IS NOT NULL THEN
    SELECT s.pipeline_id INTO stage_pipe
      FROM public.sales_pipeline_stages s
     WHERE s.id = NEW.stage_id;
    IF stage_pipe IS NULL OR stage_pipe IS DISTINCT FROM NEW.pipeline_id THEN
      RAISE EXCEPTION 'این مرحله متعلق به کاریز انتخاب‌شده نیست.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'won' AND NEW.status = 'lost' THEN
      RAISE EXCEPTION 'برای ناموفق کردن معاملهٔ موفق، اول آن را به جاری برگردانید.'
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'lost' AND NEW.status = 'won' THEN
      RAISE EXCEPTION 'برای موفق کردن معاملهٔ ناموفق، اول آن را به جاری برگردانید.'
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status IN ('won', 'lost')
       AND NEW.status IN ('won', 'lost')
       AND (
         NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id
         OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
       ) THEN
      RAISE EXCEPTION 'مرحله و کاریز معاملهٔ بسته قابل تغییر نیست؛ اول آن را به جاری برگردانید.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT is_auto THEN
    IF (TG_OP = 'INSERT' AND NEW.status = 'won')
       OR (TG_OP = 'UPDATE' AND NEW.status = 'won' AND OLD.status IS DISTINCT FROM 'won') THEN
      IF actor IS NULL OR NOT public.has_dynamic_permission(actor, 'deal-mark-won', 'update') THEN
        RAISE EXCEPTION 'شما مجوز موفق کردن معاملات را ندارید.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.status = 'lost')
       OR (TG_OP = 'UPDATE' AND NEW.status = 'lost' AND OLD.status IS DISTINCT FROM 'lost') THEN
      IF actor IS NULL OR NOT public.has_dynamic_permission(actor, 'deal-mark-lost', 'update') THEN
        RAISE EXCEPTION 'شما مجوز ناموفق کردن معاملات را ندارید.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status = 'won' THEN
      IF actor IS NULL OR NOT public.has_dynamic_permission(actor, 'deal-mark-won', 'update') THEN
        RAISE EXCEPTION 'شما مجوز موفق کردن معاملات را ندارید.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status = 'open' AND OLD.status = 'lost' THEN
      IF actor IS NULL OR NOT public.has_dynamic_permission(actor, 'deal-mark-lost', 'update') THEN
        RAISE EXCEPTION 'شما مجوز ناموفق کردن معاملات را ندارید.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_entered_at IS NULL THEN
      NEW.stage_entered_at := COALESCE(NEW.created_at, now());
    END IF;
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_entered_at := now();
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_deal_lifecycle ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_deal_lifecycle
  BEFORE INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_deal_lifecycle();

CREATE OR REPLACE FUNCTION public.sales_interactions_write_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid := auth.uid();
  src text := COALESCE(NULLIF(current_setting('afrakala.change_source', true), ''), 'user');
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF src NOT IN ('user', 'auto_quote_created', 'auto_quote_sent', 'auto_quote_accepted') THEN
    src := 'user';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'status', NULL, NEW.status, actor, src);
    IF NEW.pipeline_id IS NOT NULL THEN
      INSERT INTO public.sales_interaction_history
        (interaction_id, event, from_value, to_value, actor_id, source)
      VALUES (NEW.id, 'pipeline', NULL, NEW.pipeline_id::text, actor, src);
    END IF;
    IF NEW.stage_id IS NOT NULL THEN
      INSERT INTO public.sales_interaction_history
        (interaction_id, event, from_value, to_value, actor_id, source)
      VALUES (NEW.id, 'stage', NULL, NEW.stage_id::text, actor, src);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, actor, src);
  END IF;
  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'pipeline', OLD.pipeline_id::text, NEW.pipeline_id::text, actor, src);
  END IF;
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'stage', OLD.stage_id::text, NEW.stage_id::text, actor, src);
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'delete', 'active', 'deleted', actor, src);
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'restore', 'deleted', 'active', actor, src);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_write_history ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_write_history
  AFTER INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_write_history();

REVOKE ALL ON FUNCTION public.sales_interactions_write_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interactions_write_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interactions_write_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interactions_write_history() TO service_role;

DROP FUNCTION IF EXISTS public.sales_interaction_update_status(uuid, text, text);

CREATE OR REPLACE FUNCTION public.sales_interaction_update_status(
  p_id uuid,
  p_status text,
  p_outcome_note text DEFAULT NULL,
  p_lost_reason_id uuid DEFAULT NULL,
  p_lost_reason_note text DEFAULT NULL,
  p_lost_reason_other text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _row    public.sales_interactions%ROWTYPE;
  _status text := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _row.kind = 'request' THEN
    IF NOT (_status = ANY (ARRAY['open', 'won', 'lost'])) THEN
      RAISE EXCEPTION 'وضعیت تعامل نامعتبر است.' USING ERRCODE = '22023';
    END IF;
  ELSIF NOT (_status = ANY (ARRAY['open', 'won', 'lost', 'cancelled', 'done'])) THEN
    RAISE EXCEPTION 'وضعیت تعامل نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.has_any_role(_actor, ARRAY['admin', 'manager']::text[])
    OR _row.author_id = _actor
    OR _row.salesperson_id = _actor
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای تغییر وضعیت را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF _status = 'lost' THEN
    UPDATE public.sales_interactions
       SET status = _status,
           outcome_note = COALESCE(NULLIF(btrim(COALESCE(p_outcome_note, '')), ''), outcome_note),
           lost_reason_id = p_lost_reason_id,
           lost_reason_note = p_lost_reason_note,
           lost_reason_other = p_lost_reason_other
     WHERE id = p_id;
  ELSE
    UPDATE public.sales_interactions
       SET status = _status,
           outcome_note = COALESCE(NULLIF(btrim(COALESCE(p_outcome_note, '')), ''), outcome_note)
     WHERE id = p_id;
  END IF;

  RETURN p_id;
END
$function$;

COMMENT ON FUNCTION public.sales_interaction_update_status(uuid, text, text, uuid, text, text) IS
  'Updates sales_interactions.status; lost reason columns optional. Migration 585.';

REVOKE ALL ON FUNCTION public.sales_interaction_update_status(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interaction_update_status(uuid, text, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interaction_update_status(uuid, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interaction_update_status(uuid, text, text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_deal_move(
  p_id uuid,
  p_pipeline_id uuid,
  p_stage_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _row public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF p_pipeline_id IS NULL OR p_stage_id IS NULL THEN
    RAISE EXCEPTION 'کاریز و مرحله هر دو باید انتخاب شوند.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR _row.kind IS DISTINCT FROM 'request' THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.has_any_role(_actor, ARRAY['admin', 'manager']::text[])
    OR _row.author_id = _actor
    OR _row.salesperson_id = _actor
  ) THEN
    RAISE EXCEPTION 'دسترسی لازم برای انتقال معامله را ندارید.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sales_interactions
     SET pipeline_id = p_pipeline_id,
         stage_id = p_stage_id
   WHERE id = p_id;
  RETURN p_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sales_deal_delete(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _row public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_dynamic_permission(_actor, 'deal-delete', 'update') THEN
    RAISE EXCEPTION 'شما مجوز حذف و بازیابی معاملات را ندارید.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR _row.kind IS DISTINCT FROM 'request' THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  IF _row.status IN ('won', 'lost') THEN
    RAISE EXCEPTION 'برای حذف معامله ابتدا آن را به جاری برگردانید.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.sales_interactions
     SET deleted_at = now(),
         deleted_by = _actor
   WHERE id = p_id;
  RETURN p_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sales_deal_restore(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _actor uuid := auth.uid();
  _row public.sales_interactions%ROWTYPE;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_dynamic_permission(_actor, 'deal-delete', 'update') THEN
    RAISE EXCEPTION 'شما مجوز حذف و بازیابی معاملات را ندارید.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.sales_interactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR _row.kind IS DISTINCT FROM 'request' THEN
    RAISE EXCEPTION 'تعامل فروش پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.sales_interactions
     SET deleted_at = NULL,
         deleted_by = NULL
   WHERE id = p_id;
  RETURN p_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sales_deal_capabilities(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  can_edit boolean,
  can_set_won boolean,
  can_set_lost boolean,
  can_reopen boolean,
  can_move boolean,
  can_delete boolean,
  can_restore boolean,
  open_activity_count integer,
  latest_quote_id uuid,
  latest_quote_status text,
  show_rejected_quote_notice boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  WITH actor AS (
    SELECT auth.uid() AS uid
  ),
  deals AS (
    SELECT si.*
      FROM public.sales_interactions si
     WHERE si.id = ANY (p_ids)
       AND si.kind = 'request'
  ),
  quotes AS (
    SELECT DISTINCT ON (q.interaction_id)
           q.interaction_id, q.id AS quote_id, q.status::text AS quote_status
      FROM public.sales_quotes q
     WHERE q.interaction_id = ANY (p_ids)
     ORDER BY q.interaction_id, q.created_at DESC
  ),
  acts AS (
    SELECT a.deal_id, count(*)::integer AS n
      FROM public.sales_interactions a
     WHERE a.deal_id = ANY (p_ids)
       AND a.activity_type_id IS NOT NULL
       AND a.done_at IS NULL
     GROUP BY a.deal_id
  )
  SELECT
    d.id,
    (d.deleted_at IS NULL AND d.status = 'open' AND (
       public.has_any_role((SELECT uid FROM actor), ARRAY['admin'::text, 'manager'::text])
       OR d.author_id = (SELECT uid FROM actor)
       OR d.salesperson_id = (SELECT uid FROM actor)
    )) AS can_edit,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-won', 'update')) AS can_set_won,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-lost', 'update')) AS can_set_lost,
    (d.deleted_at IS NULL AND (
       (d.status = 'won' AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-won', 'update'))
       OR
       (d.status = 'lost' AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-mark-lost', 'update'))
    )) AS can_reopen,
    (d.deleted_at IS NULL AND d.status = 'open' AND (
       public.has_any_role((SELECT uid FROM actor), ARRAY['admin'::text, 'manager'::text])
       OR d.author_id = (SELECT uid FROM actor)
       OR d.salesperson_id = (SELECT uid FROM actor)
    )) AS can_move,
    (d.deleted_at IS NULL AND d.status = 'open'
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')) AS can_delete,
    (d.deleted_at IS NOT NULL
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')) AS can_restore,
    COALESCE(acts.n, 0) AS open_activity_count,
    quotes.quote_id AS latest_quote_id,
    quotes.quote_status AS latest_quote_status,
    (d.deleted_at IS NULL AND d.status = 'open' AND quotes.quote_status = 'rejected')
      AS show_rejected_quote_notice
  FROM deals d
  LEFT JOIN quotes ON quotes.interaction_id = d.id
  LEFT JOIN acts ON acts.deal_id = d.id;
$fn$;

REVOKE ALL ON FUNCTION public.sales_deal_move(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_deal_move(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_move(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_move(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sales_deal_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_deal_delete(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_delete(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sales_deal_restore(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_deal_restore(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_restore(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_restore(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sales_deal_capabilities(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_deal_capabilities(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO service_role;
