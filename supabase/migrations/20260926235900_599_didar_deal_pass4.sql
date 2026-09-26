SET client_encoding = 'UTF8';

-- PASS 4: deal party names (P3), tag history (P2), owner/delete guard (P11).

CREATE OR REPLACE FUNCTION public.sales_deal_lookup_names(p_ids uuid[])
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.display_name
    FROM public.persons p
   WHERE p.id = ANY (p_ids)
     AND EXISTS (
       SELECT 1
         FROM public.sales_interactions si
        WHERE si.kind = 'request'
          AND (si.person_id = p.id OR si.company_person_id = p.id OR si.introducer_person_id = p.id)
     )
  UNION
  SELECT pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), '—')
    FROM public.profiles pr
   WHERE pr.id = ANY (p_ids)
     AND (
       EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = pr.id
            AND ur.role IN ('admin', 'manager', 'sales')
       )
       OR EXISTS (
         SELECT 1 FROM public.sales_interactions si
          WHERE si.kind = 'request'
            AND (si.salesperson_id = pr.id OR si.author_id = pr.id OR si.won_by = pr.id OR si.lost_by = pr.id)
       )
     );
$fn$;

ALTER FUNCTION public.sales_deal_lookup_names(uuid[]) OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION public.sales_deal_lookup_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_lookup_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_lookup_names(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_desk_staff_names()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT pr.id, COALESCE(NULLIF(btrim(pr.full_name), ''), pr.id::text)
    FROM public.profiles pr
   WHERE EXISTS (
     SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = pr.id
        AND ur.role IN ('admin', 'manager', 'sales')
   )
   ORDER BY pr.full_name NULLS LAST;
$fn$;

ALTER FUNCTION public.sales_desk_staff_names() OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION public.sales_desk_staff_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_desk_staff_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_desk_staff_names() TO service_role;

CREATE OR REPLACE FUNCTION public.sales_deal_actor_can_own_mutate(p_salesperson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text])
      OR p_salesperson_id IS NOT DISTINCT FROM auth.uid();
$fn$;

ALTER FUNCTION public.sales_deal_actor_can_own_mutate(uuid) OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION public.sales_deal_actor_can_own_mutate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_actor_can_own_mutate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_actor_can_own_mutate(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_sales_deal_owner_or_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.salesperson_id IS NOT DISTINCT FROM OLD.salesperson_id
       AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN
      RETURN NEW;
    END IF;
    IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id
       AND NOT public.sales_deal_actor_can_own_mutate(OLD.salesperson_id) THEN
      RAISE EXCEPTION 'شما مجوز تغییر مسئول این معامله را ندارید.' USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND NEW.deleted_at IS NOT NULL
       AND NOT public.sales_deal_actor_can_own_mutate(OLD.salesperson_id) THEN
      RAISE EXCEPTION 'شما مجوز حذف این معامله را ندارید.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.trg_sales_deal_owner_or_delete_guard() OWNER TO supabase_admin;

DROP TRIGGER IF EXISTS trg_sales_deal_owner_or_delete_guard ON public.sales_interactions;
CREATE TRIGGER trg_sales_deal_owner_or_delete_guard
  BEFORE UPDATE OF salesperson_id, deleted_at ON public.sales_interactions
  FOR EACH ROW
  WHEN (OLD.kind = 'request')
  EXECUTE FUNCTION public.trg_sales_deal_owner_or_delete_guard();

CREATE OR REPLACE FUNCTION public.trg_sales_interaction_tags_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _title text;
BEGIN
  SELECT dt.title INTO _title FROM public.deal_tags dt WHERE dt.id = NEW.tag_id;
  INSERT INTO public.sales_interaction_history
    (interaction_id, event, field_name, from_value, to_value, actor_id, source)
  VALUES
    (NEW.interaction_id, 'field', 'tag', NULL, COALESCE(_title, NEW.tag_id::text), auth.uid(), 'user');
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION public.trg_sales_interaction_tags_history() OWNER TO supabase_admin;

DROP TRIGGER IF EXISTS trg_sales_interaction_tags_history ON public.sales_interaction_tags;
CREATE TRIGGER trg_sales_interaction_tags_history
  AFTER INSERT ON public.sales_interaction_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_interaction_tags_history();

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
  IF NOT (
    public.has_any_role(_actor, ARRAY['admin'::text, 'manager'::text])
    OR _row.salesperson_id IS NOT DISTINCT FROM _actor
  ) THEN
    RAISE EXCEPTION 'شما مجوز حذف این معامله را ندارید.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sales_interactions
     SET deleted_at = now(),
         deleted_by = _actor
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
  can_view_price boolean,
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
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')
      AND public.sales_deal_actor_can_own_mutate(d.salesperson_id)) AS can_delete,
    (d.deleted_at IS NOT NULL
      AND public.has_dynamic_permission((SELECT uid FROM actor), 'deal-delete', 'update')) AS can_restore,
    public.has_dynamic_permission((SELECT uid FROM actor), 'deal-view-price', 'view') AS can_view_price,
    COALESCE(acts.n, 0) AS open_activity_count,
    quotes.quote_id AS latest_quote_id,
    quotes.quote_status AS latest_quote_status,
    (d.deleted_at IS NULL AND d.status = 'open' AND quotes.quote_status = 'rejected')
      AS show_rejected_quote_notice
  FROM deals d
  LEFT JOIN quotes ON quotes.interaction_id = d.id
  LEFT JOIN acts ON acts.deal_id = d.id;
$fn$;

ALTER FUNCTION public.sales_deal_delete(uuid) OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION public.sales_deal_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_delete(uuid) TO service_role;

ALTER FUNCTION public.sales_deal_capabilities(uuid[]) OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION public.sales_deal_capabilities(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_deal_capabilities(uuid[]) TO service_role;
