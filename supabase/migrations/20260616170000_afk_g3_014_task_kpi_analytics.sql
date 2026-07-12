-- AFK-G3-014: task analytics / KPI read model
-- Scope: read-only aggregated task metrics for operations managers.

CREATE OR REPLACE FUNCTION public.get_task_kpi_report(
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  section text,
  bucket_key text,
  bucket_label text,
  task_count integer,
  open_count integer,
  pending_count integer,
  in_progress_count integer,
  done_count integer,
  blocked_count integer,
  canceled_count integer,
  overdue_count integer,
  due_soon_count integer,
  avg_completion_hours numeric,
  completion_rate numeric,
  overdue_rate numeric,
  oldest_open_at timestamptz,
  newest_task_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
BEGIN
  IF v_user IS NOT NULL AND NOT public.has_any_role(
    v_user,
    ARRAY[
      'admin'::public.app_role,
      'manager'::public.app_role,
      'accountant'::public.app_role,
      'sales'::public.app_role,
      'viewer'::public.app_role
    ]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      t.id,
      COALESCE(t.status, 'pending') AS status,
      COALESCE(t.priority, 'normal') AS priority,
      t.assigned_queue,
      t.proof_requirement,
      t.due_date,
      t.created_at,
      t.completed_at,
      t.assigned_to,
      t.reference_type
    FROM public.tasks t
    WHERE t.created_at >= (now() - (v_days || ' days')::interval)
       OR COALESCE(t.status, 'pending') NOT IN ('done', 'canceled')
  ),
  grouped_input AS (
    SELECT
      0 AS section_sort,
      0 AS bucket_sort,
      'overall'::text AS section,
      'all'::text AS bucket_key,
      'همه وظایف'::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      1 AS section_sort,
      CASE COALESCE(s.assigned_queue, 'none')
        WHEN 'sales' THEN 1
        WHEN 'shipping' THEN 2
        WHEN 'store' THEN 3
        WHEN 'accounting' THEN 4
        ELSE 9
      END AS bucket_sort,
      'queue'::text AS section,
      COALESCE(s.assigned_queue, 'none')::text AS bucket_key,
      CASE COALESCE(s.assigned_queue, 'none')
        WHEN 'sales' THEN 'فروش'
        WHEN 'shipping' THEN 'ارسال'
        WHEN 'store' THEN 'فروشگاه/انبار'
        WHEN 'accounting' THEN 'حسابداری'
        ELSE 'بدون صف'
      END::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      2 AS section_sort,
      CASE COALESCE(s.proof_requirement, 'none')
        WHEN 'receipt' THEN 1
        WHEN 'carrier_waybill_photo' THEN 2
        WHEN 'product_video' THEN 3
        WHEN 'none' THEN 8
        ELSE 9
      END AS bucket_sort,
      'proof'::text AS section,
      COALESCE(s.proof_requirement, 'none')::text AS bucket_key,
      CASE COALESCE(s.proof_requirement, 'none')
        WHEN 'receipt' THEN 'رسید تهران'
        WHEN 'carrier_waybill_photo' THEN 'عکس بیجک باربری'
        WHEN 'product_video' THEN 'فیلم محصول'
        WHEN 'none' THEN 'بدون مدرک'
        ELSE 'نامشخص'
      END::text AS bucket_label,
      s.*
    FROM scoped s

    UNION ALL

    SELECT
      3 AS section_sort,
      CASE COALESCE(s.status, 'pending')
        WHEN 'pending' THEN 1
        WHEN 'in_progress' THEN 2
        WHEN 'blocked' THEN 3
        WHEN 'done' THEN 4
        WHEN 'canceled' THEN 5
        ELSE 9
      END AS bucket_sort,
      'status'::text AS section,
      COALESCE(s.status, 'pending')::text AS bucket_key,
      CASE COALESCE(s.status, 'pending')
        WHEN 'pending' THEN 'در انتظار'
        WHEN 'in_progress' THEN 'در حال انجام'
        WHEN 'blocked' THEN 'متوقف'
        WHEN 'done' THEN 'انجام‌شده'
        WHEN 'canceled' THEN 'لغو'
        ELSE COALESCE(s.status, 'pending')
      END::text AS bucket_label,
      s.*
    FROM scoped s
  ),
  rolled AS (
    SELECT
      gi.section_sort,
      gi.bucket_sort,
      gi.section,
      gi.bucket_key,
      gi.bucket_label,
      COUNT(*)::integer AS task_count,
      COUNT(*) FILTER (WHERE gi.status NOT IN ('done', 'canceled'))::integer AS open_count,
      COUNT(*) FILTER (WHERE gi.status = 'pending')::integer AS pending_count,
      COUNT(*) FILTER (WHERE gi.status = 'in_progress')::integer AS in_progress_count,
      COUNT(*) FILTER (WHERE gi.status = 'done')::integer AS done_count,
      COUNT(*) FILTER (WHERE gi.status = 'blocked')::integer AS blocked_count,
      COUNT(*) FILTER (WHERE gi.status = 'canceled')::integer AS canceled_count,
      COUNT(*) FILTER (
        WHERE gi.due_date IS NOT NULL
          AND gi.due_date < current_date
          AND gi.status NOT IN ('done', 'canceled')
      )::integer AS overdue_count,
      COUNT(*) FILTER (
        WHERE gi.due_date IS NOT NULL
          AND gi.due_date >= current_date
          AND gi.due_date <= current_date + 2
          AND gi.status NOT IN ('done', 'canceled')
      )::integer AS due_soon_count,
      ROUND(
        AVG(EXTRACT(EPOCH FROM (gi.completed_at - gi.created_at)) / 3600.0)
          FILTER (WHERE gi.status = 'done' AND gi.completed_at IS NOT NULL),
        2
      )::numeric AS avg_completion_hours,
      ROUND(
        COUNT(*) FILTER (WHERE gi.status = 'done')::numeric
        / NULLIF(COUNT(*), 0)::numeric
        * 100,
        2
      )::numeric AS completion_rate,
      ROUND(
        COUNT(*) FILTER (
          WHERE gi.due_date IS NOT NULL
            AND gi.due_date < current_date
            AND gi.status NOT IN ('done', 'canceled')
        )::numeric
        / NULLIF(COUNT(*) FILTER (WHERE gi.status NOT IN ('done', 'canceled')), 0)::numeric
        * 100,
        2
      )::numeric AS overdue_rate,
      MIN(gi.created_at) FILTER (WHERE gi.status NOT IN ('done', 'canceled')) AS oldest_open_at,
      MAX(gi.created_at) AS newest_task_at
    FROM grouped_input gi
    GROUP BY gi.section_sort, gi.bucket_sort, gi.section, gi.bucket_key, gi.bucket_label
  )
  SELECT
    r.section,
    r.bucket_key,
    r.bucket_label,
    r.task_count,
    r.open_count,
    r.pending_count,
    r.in_progress_count,
    r.done_count,
    r.blocked_count,
    r.canceled_count,
    r.overdue_count,
    r.due_soon_count,
    r.avg_completion_hours,
    r.completion_rate,
    r.overdue_rate,
    r.oldest_open_at,
    r.newest_task_at
  FROM rolled r
  ORDER BY r.section_sort, r.bucket_sort, r.bucket_label;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_task_kpi_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_kpi_report(integer) TO authenticated;

COMMENT ON FUNCTION public.get_task_kpi_report(integer) IS
'AFK-G3-014: Read-only task KPI report for operations dashboards, grouped overall/by queue/by proof requirement/by status.';
